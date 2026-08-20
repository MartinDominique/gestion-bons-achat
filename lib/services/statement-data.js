/**
 * @file lib/services/statement-data.js
 * @description Construction des données d'un état de compte client, à une date donnée.
 *              - Sélection « open item » à la date du relevé (as_of):
 *                seules les factures émises AU PLUS TARD à cette date sont retenues,
 *                et seuls les paiements reçus AU PLUS TARD à cette date sont crédités.
 *              - Retard, intérêts et vieillissement (aging) calculés par rapport à as_of.
 *              - Partagé par GET /api/statements/[clientId] et l'envoi/aperçu PDF,
 *                pour garantir que l'aperçu et le courriel correspondent à l'écran.
 * @version 1.0.0
 * @date 2026-08-20
 * @changelog
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
    .select('id, name, company, address, email, email_billing, email_admin, email_2, email_3, contact_name, contact_name_2, contact_name_3, contact_name_admin, phone, payment_terms, preferred_payment_method')
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
  let totalBalance = 0;
  let totalInterest = 0;

  const lines = [];

  for (const inv of invoices || []) {
    const total = Number(inv.total) || 0;
    const allPayments = paymentsByInvoice[inv.id] || [];
    const paymentsAsOf = allPayments.filter(p => !p.payment_date || p.payment_date <= statementDate);

    const creditedAll = allPayments.reduce((s, p) => s + creditOf(p), 0);
    const creditedAsOf = paymentsAsOf.reduce((s, p) => s + creditOf(p), 0);

    // Crédit « historique » sans paiement détaillé (factures marquées payées avant
    // le module de paiements: amount_paid rempli par le backfill de migration).
    // Il est considéré comme acquis à toute date, sinon ces factures anciennes
    // ressurgiraient à tort comme impayées sur un relevé antérieur.
    const legacyCredit = Math.max(0, (Number(inv.amount_paid) || 0) - creditedAll);

    const credited = round2(creditedAsOf + legacyCredit);
    const balance = round2(total - credited);
    if (balance <= EPSILON) continue; // Facture réglée à la date du relevé

    const od = daysOverdue(inv.due_date, asOfDate);
    const interest = computeInterest(balance, inv.due_date, interestRate, asOfDate);
    const bucket = agingBucket(inv.due_date, asOfDate);

    aging[bucket] += balance;
    totalBalance += balance;
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
      days_overdue: od,
      interest,
      aging_bucket: bucket,
      status: inv.status,
      payments: paymentsAsOf,
    });
  }

  Object.keys(aging).forEach(k => { aging[k] = round2(aging[k]); });
  totalBalance = round2(totalBalance);
  totalInterest = round2(totalInterest);

  return {
    client,
    settings: settings || null,
    interestRate,
    invoices: lines,
    aging,
    totals: {
      balance: totalBalance,
      interest: totalInterest,
      total_with_interest: round2(totalBalance + totalInterest),
      open_count: lines.length,
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
