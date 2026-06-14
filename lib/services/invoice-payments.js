/**
 * @file lib/services/invoice-payments.js
 * @description Helpers serveur pour le suivi des paiements de factures (état de compte).
 *              - Recalcule le montant crédité (amount_paid) et le statut d'une facture
 *                à partir de ses paiements (invoice_payments).
 *              - Calcul des intérêts de retard et des tranches de vieillissement (aging).
 * @version 1.0.0
 * @date 2026-06-14
 * @changelog
 *   1.0.0 - Version initiale (module État de compte client)
 */

// Tolérance pour les arrondis monétaires (0,5 cent)
const EPSILON = 0.005;

/**
 * Recalcule amount_paid + statut d'une facture à partir de ses paiements,
 * puis met à jour la table invoices.
 *
 * amount_paid = Σ(amount + discount_applied)  → "montant crédité" (encaissé + escompte)
 * solde       = total - amount_paid
 * statut:
 *   - 'paid'    si solde <= 0
 *   - 'partial' si 0 < amount_paid (et solde > 0)
 *   - sinon on retombe sur 'sent' (si déjà envoyée) ou 'draft'
 *
 * @param {object} supabaseAdmin - Client Supabase admin
 * @param {number} invoiceId
 * @returns {Promise<{amount_paid:number, balance:number, status:string}>}
 */
async function recomputeInvoiceStatus(supabaseAdmin, invoiceId) {
  const id = parseInt(invoiceId);

  const { data: invoice, error: invErr } = await supabaseAdmin
    .from('invoices')
    .select('id, total, sent_at, status')
    .eq('id', id)
    .single();

  if (invErr || !invoice) {
    throw new Error('Facture introuvable pour recalcul du paiement');
  }

  const { data: payments, error: payErr } = await supabaseAdmin
    .from('invoice_payments')
    .select('amount, discount_applied')
    .eq('invoice_id', id);

  if (payErr) throw payErr;

  const credited = (payments || []).reduce(
    (sum, p) => sum + (Number(p.amount) || 0) + (Number(p.discount_applied) || 0),
    0
  );
  const total = Number(invoice.total) || 0;
  const balance = total - credited;

  let status;
  let paid_at = null;
  if (balance <= EPSILON && total > 0) {
    status = 'paid';
    paid_at = new Date().toISOString();
  } else if (credited > EPSILON) {
    status = 'partial';
  } else {
    // Aucun paiement: revenir à l'état d'envoi
    status = invoice.sent_at ? 'sent' : 'draft';
  }

  const updates = {
    amount_paid: Math.round(credited * 100) / 100,
    status,
    updated_at: new Date().toISOString(),
  };
  // Ne fixer/effacer paid_at que sur transition vers/depuis 'paid'
  if (status === 'paid') {
    updates.paid_at = paid_at;
  } else if (invoice.status === 'paid') {
    updates.paid_at = null;
  }

  const { error: updErr } = await supabaseAdmin
    .from('invoices')
    .update(updates)
    .eq('id', id);

  if (updErr) throw updErr;

  return { amount_paid: updates.amount_paid, balance: Math.round(balance * 100) / 100, status };
}

/**
 * Nombre de jours de retard d'une facture (par rapport à due_date).
 * @param {string} dueDate - YYYY-MM-DD
 * @param {Date} [asOf=now]
 * @returns {number} jours de retard (0 si pas échue)
 */
function daysOverdue(dueDate, asOf = new Date()) {
  if (!dueDate) return 0;
  const due = new Date(dueDate + 'T00:00:00');
  const ref = new Date(asOf.toISOString().split('T')[0] + 'T00:00:00');
  const diff = Math.floor((ref - due) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

/**
 * Calcule l'intérêt de retard sur un solde.
 * intérêt = solde × (tauxAnnuel/100) × (joursRetard/365)
 * @param {number} balance - Solde dû
 * @param {string} dueDate - YYYY-MM-DD
 * @param {number} annualRatePct - Taux annuel en %
 * @param {Date} [asOf=now]
 * @returns {number} montant d'intérêt (arrondi 2 décimales)
 */
function computeInterest(balance, dueDate, annualRatePct, asOf = new Date()) {
  const days = daysOverdue(dueDate, asOf);
  if (days <= 0 || !annualRatePct || balance <= 0) return 0;
  const interest = balance * (Number(annualRatePct) / 100) * (days / 365);
  return Math.round(interest * 100) / 100;
}

/**
 * Détermine la tranche de vieillissement d'une facture (basée sur les jours de retard).
 * @param {string} dueDate - YYYY-MM-DD
 * @param {Date} [asOf=now]
 * @returns {'current'|'d1_30'|'d31_60'|'d61_90'|'d90_plus'}
 */
function agingBucket(dueDate, asOf = new Date()) {
  const days = daysOverdue(dueDate, asOf);
  if (days <= 0) return 'current';
  if (days <= 30) return 'd1_30';
  if (days <= 60) return 'd31_60';
  if (days <= 90) return 'd61_90';
  return 'd90_plus';
}

module.exports = {
  recomputeInvoiceStatus,
  daysOverdue,
  computeInterest,
  agingBucket,
};
