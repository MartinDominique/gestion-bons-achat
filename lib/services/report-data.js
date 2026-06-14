/**
 * @file lib/services/report-data.js
 * @description Construction des données des rapports comptables (ventes + paiements).
 *              - buildSalesReport: factures émises (sent/partial/paid) d'une période
 *              - buildPaymentsReport: paiements reçus (journal des encaissements) d'une période
 *              Partagé par les routes GET (aperçu/téléchargement) et send-email (courriel).
 * @version 1.0.0
 * @date 2026-06-14
 * @changelog
 *   1.0.0 - Version initiale (rapports comptables ventes/paiements)
 */

const { supabaseAdmin } = require('../supabaseAdmin');
const { resolveReportPeriod } = require('../utils/report-period');

/**
 * Données du rapport de ventes pour une période.
 * @param {URLSearchParams} searchParams
 */
async function buildSalesReport(searchParams) {
  const period = resolveReportPeriod(searchParams);
  if (!period.ok) return { ok: false, error: period.error };

  const { data: invoices, error } = await supabaseAdmin
    .from('invoices')
    .select(`
      id, invoice_number, client_id, client_name, source_type, source_number,
      invoice_date, subtotal, tps_rate, tvq_rate, tps_amount, tvq_amount, total,
      total_materials, total_labor, total_transport, status, is_prix_jobe
    `)
    .in('status', ['sent', 'partial', 'paid'])
    .gte('invoice_date', period.startDate)
    .lte('invoice_date', period.endDate)
    .order('invoice_date', { ascending: true })
    .order('invoice_number', { ascending: true });

  if (error) {
    console.error('Erreur récupération rapport ventes:', error);
    return { ok: false, error: 'Erreur récupération des factures', details: error.message };
  }

  const data = invoices || [];
  const totals = data.reduce((acc, inv) => {
    acc.total_materials += parseFloat(inv.total_materials) || 0;
    acc.total_labor += parseFloat(inv.total_labor) || 0;
    acc.total_transport += parseFloat(inv.total_transport) || 0;
    acc.subtotal += parseFloat(inv.subtotal) || 0;
    acc.tps_amount += parseFloat(inv.tps_amount) || 0;
    acc.tvq_amount += parseFloat(inv.tvq_amount) || 0;
    acc.total += parseFloat(inv.total) || 0;
    return acc;
  }, {
    total_materials: 0, total_labor: 0, total_transport: 0,
    subtotal: 0, tps_amount: 0, tvq_amount: 0, total: 0,
  });
  Object.keys(totals).forEach(k => { totals[k] = Math.round(totals[k] * 100) / 100; });

  return {
    ok: true,
    data: {
      period: { mode: period.mode, label: period.label, slug: period.slug, startDate: period.startDate, endDate: period.endDate },
      invoices: data,
      count: data.length,
      totals,
    },
  };
}

/**
 * Données du rapport de paiements (journal des encaissements) pour une période.
 * @param {URLSearchParams} searchParams
 */
async function buildPaymentsReport(searchParams) {
  const period = resolveReportPeriod(searchParams);
  if (!period.ok) return { ok: false, error: period.error };

  const { data: rows, error } = await supabaseAdmin
    .from('invoice_payments')
    .select(`
      id, invoice_id, client_id, amount, discount_applied, payment_date, method, reference, notes,
      invoice:invoices ( invoice_number, client_name )
    `)
    .gte('payment_date', period.startDate)
    .lte('payment_date', period.endDate)
    .order('payment_date', { ascending: true })
    .order('id', { ascending: true });

  if (error) {
    console.error('Erreur récupération rapport paiements:', error);
    return { ok: false, error: 'Erreur récupération des paiements', details: error.message };
  }

  const payments = (rows || []).map(p => ({
    id: p.id,
    payment_date: p.payment_date,
    method: p.method,
    reference: p.reference || '',
    amount: parseFloat(p.amount) || 0,
    discount_applied: parseFloat(p.discount_applied) || 0,
    invoice_number: p.invoice?.invoice_number || '',
    client_name: p.invoice?.client_name || '',
  }));

  const totals = payments.reduce((acc, p) => {
    acc.amount += p.amount;
    acc.discount += p.discount_applied;
    acc.by_method[p.method] = (acc.by_method[p.method] || 0) + p.amount;
    return acc;
  }, {
    amount: 0,
    discount: 0,
    by_method: { cheque: 0, virement: 0, comptant: 0, autre: 0 },
  });

  totals.amount = Math.round(totals.amount * 100) / 100;
  totals.discount = Math.round(totals.discount * 100) / 100;
  Object.keys(totals.by_method).forEach(k => {
    totals.by_method[k] = Math.round(totals.by_method[k] * 100) / 100;
  });

  return {
    ok: true,
    data: {
      period: { mode: period.mode, label: period.label, slug: period.slug, startDate: period.startDate, endDate: period.endDate },
      payments,
      count: payments.length,
      totals,
    },
  };
}

module.exports = { buildSalesReport, buildPaymentsReport };
