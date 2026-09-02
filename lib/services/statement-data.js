/**
 * @file lib/services/statement-data.js
 * @description Construction des données d'un état de compte client, à une date donnée.
 *              - Sélection « open item » à la date du relevé (as_of):
 *                seules les factures émises AU PLUS TARD à cette date sont retenues,
 *                et seuls les paiements reçus AU PLUS TARD à cette date sont crédités.
 *              - Notes de crédit (factures à total négatif) incluses: elles figurent au
 *                relevé et RÉDUISENT le solde dû, tant qu'elles ne sont pas réglées
 *                (remboursement ou application enregistré comme « paiement » négatif).
 *              - Retard, intérêts et vieillissement (aging) calculés par rapport à as_of.
 *              - Partagé par GET /api/statements/[clientId] et l'envoi/aperçu PDF,
 *                pour garantir que l'aperçu et le courriel correspondent à l'écran.
 * @version 1.2.0
 * @date 2026-09-02
 * @changelog
 *   1.2.0 - Factures de crédit (total négatif) affichées au relevé et déduites du solde:
 *           ni retard ni intérêts sur un crédit, tranche « Courant », aucun intérêt
 *           facturé si le solde net est nul ou créditeur; totaux enrichis
 *           (charges, credits, credit_count) et drapeau is_credit par ligne
 *   1.1.0 - Retourne additional_emails (adresses supplémentaires du dossier client)
 *   1.0.0 - Version initiale (extraction + filtre par date du relevé)
 */

const { computeInterest, daysOverdue, agingBucket } = require('./invoice-payments');

// Tolérance pour les arrondis monétaires (0,5 cent)
const EPSILON = 0.005;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Date du jour au format YYYY-MM-DD (fuseau Québec). */
function todayQuebec() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Valide/normalise une date de relevé (YYYY-MM-DD). Retourne la date du jour si invalide.
 * @param {string} [asOf]
 * @returns {string} YYYY-MM-DD
 */
function normalizeAsOf(asOf) {
  if (typeof asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(asOf.trim())) {
    return asOf.trim();
  }
  return todayQuebec();
}

/**
 * Construit l'état de compte d'un client à la date demandée.
 *
 * @param {object} supabaseAdmin - Client Supabase admin (bypass RLS)
 * @param {number|string} clientId
 * @param {object} [options]
 * @param {string} [options.asOf] - Date du relevé YYYY-MM-DD (défaut: aujourd'hui)
 * @returns {Promise<object|null>} null si le client n'existe pas
 */
async function buildStatement(supabaseAdmin, clientId, options = {}) {
  const id = parseInt(clientId);
  const statementDate = normalizeAsOf(options.asOf);
  // Midi UTC: évite tout décalage de jour lors du re-formatage ISO côté helpers
  const asOfDate = new Date(`${statementDate}T12:00:00Z`);

  const { data: client, error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id, name, company, address, email, email_billing, email_admin, email_2, email_3, additional_emails, contact_name, contact_name_2, contact_name_3, contact_name_admin, phone, payment_terms, preferred_payment_method')
    .eq('id', id)
    .single();

  if (clientErr || !client) return null;

  const { data: settings } = await supabaseAdmin
    .from('settings')
    .select('late_interest_annual_rate, statement_footer_note, invoice_tps_number, invoice_tvq_number')
    .eq('id', 1)
    .single();
  const interestRate = Number(settings?.late_interest_annual_rate) || 0;

  // Factures émises jusqu'à la date du relevé (une facture d'août n'apparaît pas
  // sur un relevé au 31 juillet, même si elle est encore impayée aujourd'hui).
  const { data: invoices, error: invErr } = await supabaseAdmin
    .from('invoices')
    .select('id, invoice_number, source_number, source_type, invoice_date, due_date, payment_terms, subtotal, total, amount_paid, status')
    .eq('client_id', id)
    .in('status', ['sent', 'partial', 'paid'])
    .lte('invoice_date', statementDate)
    .order('invoice_date', { ascending: true });

  if (invErr) throw invErr;

  // Paiements de ces factures (tous, pour distinguer le crédit historique)
  const invoiceIds = (invoices || []).map(i => i.id);
  const paymentsByInvoice = {};
  if (invoiceIds.length > 0) {
    const { data: payments, error: payErr } = await supabaseAdmin
      .from('invoice_payments')
      .select('*')
      .in('invoice_id', invoiceIds)
      .order('payment_date', { ascending: true });

    if (payErr) throw payErr;

    for (const p of payments || []) {
      if (!paymentsByInvoice[p.invoice_id]) paymentsByInvoice[p.invoice_id] = [];
      paymentsByInvoice[p.invoice_id].push(p);
    }
  }

  const creditOf = (p) => (Number(p.amount) || 0) + (Number(p.discount_applied) || 0);

  const aging = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
  let totalCharges = 0;   // Solde des factures ordinaires (positif)
  let totalCredits = 0;   // Solde des notes de crédit (négatif)
  let totalInterest = 0;
  let creditCount = 0;

  const lines = [];

  for (const inv of invoices || []) {
    const total = Number(inv.total) || 0;
    // Note de crédit: facture à total négatif (retour de matériel, correction, avoir)
    const isCredit = total < -EPSILON;
    const allPayments = paymentsByInvoice[inv.id] || [];
    const paymentsAsOf = allPayments.filter(p => !p.payment_date || p.payment_date <= statementDate);

    const creditedAll = allPayments.reduce((s, p) => s + creditOf(p), 0);
    const creditedAsOf = paymentsAsOf.reduce((s, p) => s + creditOf(p), 0);

    // Crédit « historique » sans paiement détaillé (factures marquées payées avant
    // le module de paiements: amount_paid rempli par le backfill de migration).
    // Il est considéré comme acquis à toute date, sinon ces factures anciennes
    // ressurgiraient à tort comme impayées sur un relevé antérieur.
    // Sur une note de crédit, le règlement va dans l'autre sens (montant négatif).
    const legacyRaw = (Number(inv.amount_paid) || 0) - creditedAll;
    const legacyCredit = isCredit ? Math.min(0, legacyRaw) : Math.max(0, legacyRaw);

    const credited = round2(creditedAsOf + legacyCredit);
    const balance = round2(total - credited);
    // Réglée à la date du relevé (une note de crédit est « réglée » quand elle a été
    // remboursée ou appliquée, donc quand son solde négatif revient à zéro)
    if (Math.abs(balance) <= EPSILON) continue;

    // Un crédit n'est jamais « en retard » et ne porte pas d'intérêts:
    // il est présenté au courant et vient réduire le solde.
    const od = isCredit ? 0 : daysOverdue(inv.due_date, asOfDate);
    const interest = isCredit ? 0 : computeInterest(balance, inv.due_date, interestRate, asOfDate);
    const bucket = isCredit ? 'current' : agingBucket(inv.due_date, asOfDate);

    aging[bucket] += balance;
    if (isCredit) {
      totalCredits += balance;
      creditCount += 1;
    } else {
      totalCharges += balance;
    }
    totalInterest += interest;

    lines.push({
      id: inv.id,
      invoice_number: inv.invoice_number,
      source_number: inv.source_number,
      source_type: inv.source_type,
      invoice_date: inv.invoice_date,
      due_date: inv.due_date,
      payment_terms: inv.payment_terms,
      subtotal: Number(inv.subtotal) || 0,
      total,
      amount_paid: credited,
      balance,
      is_credit: isCredit,
      days_overdue: od,
      interest,
      aging_bucket: bucket,
      status: inv.status,
      payments: paymentsAsOf,
    });
  }

  Object.keys(aging).forEach(k => { aging[k] = round2(aging[k]); });
  totalCharges = round2(totalCharges);
  totalCredits = round2(totalCredits);
  let totalBalance = round2(totalCharges + totalCredits);
  totalInterest = round2(totalInterest);

  // Rien à devoir une fois les crédits déduits: aucun intérêt de retard n'est facturé
  if (totalBalance <= EPSILON && totalInterest > 0) {
    lines.forEach(l => { l.interest = 0; });
    totalInterest = 0;
  }

  return {
    client,
    settings: settings || null,
    interestRate,
    invoices: lines,
    aging,
    totals: {
      balance: totalBalance,
      charges: totalCharges,
      credits: round2(Math.abs(totalCredits)),
      interest: totalInterest,
      total_with_interest: round2(totalBalance + totalInterest),
      open_count: lines.length - creditCount,
      credit_count: creditCount,
      line_count: lines.length,
    },
    statementDate,
    is_today: statementDate === todayQuebec(),
  };
}

module.exports = {
  buildStatement,
  normalizeAsOf,
  todayQuebec,
};
