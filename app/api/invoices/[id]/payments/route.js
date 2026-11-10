/**
 * @file app/api/invoices/[id]/payments/route.js
 * @description Paiements rattachés à une facture (onglet « Factures » → fenêtre « Paiements »)
 *              - GET: la facture (total, crédité, solde) + chaque paiement (date, mode,
 *                N° chèque/virement, note, montant, escompte) + les AUTRES factures réglées
 *                par le même paiement (saisie multi-factures de l'état de compte)
 *              - Regroupement: la saisie multi-factures de l'état de compte écrit UNE ligne
 *                invoice_payments PAR facture (même client, même date, même mode, même
 *                référence, créées à quelques secondes d'intervalle). Les « sœurs » d'un
 *                paiement sont donc retrouvées par cette signature + created_at ± 2 min.
 *                Aucune colonne ni migration requise.
 * @version 1.1.0
 * @date 2026-11-10
 * @changelog
 *   1.1.0 - Factures sœurs: ajout invoice_date, amount_paid, balance (solde restant) et status pour
 *           l'affichage en tableau (N° · date · payé · solde) dans la fenêtre « Paiements »
 *   1.0.0 - Version initiale (détail des paiements par facture)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Fenêtre (ms) autour de created_at pour reconnaître les lignes d'une même saisie
const GROUP_WINDOW_MS = 2 * 60 * 1000;

function sameRef(a, b) {
  const na = (a || '').trim().toLowerCase();
  const nb = (b || '').trim().toLowerCase();
  return na === nb;
}

/**
 * GET /api/invoices/[id]/payments
 */
export async function GET(request, { params }) {
  try {
    const invoiceId = parseInt(params.id);
    if (!invoiceId) {
      return NextResponse.json({ success: false, error: 'ID de facture invalide' }, { status: 400 });
    }

    const { data: invoice, error: invErr } = await supabaseAdmin
      .from('invoices')
      .select('id, invoice_number, client_id, client_name, invoice_date, due_date, total, amount_paid, status, paid_at, source_number')
      .eq('id', invoiceId)
      .maybeSingle();

    if (invErr) throw invErr;
    if (!invoice) {
      return NextResponse.json({ success: false, error: 'Facture non trouvée' }, { status: 404 });
    }

    const { data: payments, error: payErr } = await supabaseAdmin
      .from('invoice_payments')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('payment_date', { ascending: false })
      .order('id', { ascending: false });

    if (payErr) throw payErr;

    const list = payments || [];

    // Candidats « sœurs »: tous les paiements du même client aux mêmes dates
    let candidates = [];
    if (list.length > 0 && invoice.client_id) {
      const dates = [...new Set(list.map(p => p.payment_date).filter(Boolean))];
      const { data: cand, error: candErr } = await supabaseAdmin
        .from('invoice_payments')
        .select('id, invoice_id, payment_date, amount, discount_applied, method, reference, notes, created_at')
        .eq('client_id', invoice.client_id)
        .in('payment_date', dates.length ? dates : ['1900-01-01'])
        .neq('invoice_id', invoiceId);
      if (candErr) throw candErr;
      candidates = cand || [];
    }

    // Numéros des factures sœurs
    const siblingInvoiceIds = [...new Set(candidates.map(c => c.invoice_id))];
    let invoiceById = {};
    if (siblingInvoiceIds.length > 0) {
      const { data: sibInv, error: sibErr } = await supabaseAdmin
        .from('invoices')
        .select('id, invoice_number, invoice_date, total, amount_paid, status')
        .in('id', siblingInvoiceIds);
      if (sibErr) throw sibErr;
      for (const inv of sibInv || []) invoiceById[inv.id] = inv;
    }

    const enriched = list.map(p => {
      const t = p.created_at ? new Date(p.created_at).getTime() : null;
      const siblings = candidates
        .filter(c =>
          c.payment_date === p.payment_date &&
          (c.method || '') === (p.method || '') &&
          sameRef(c.reference, p.reference) &&
          (t === null || !c.created_at || Math.abs(new Date(c.created_at).getTime() - t) <= GROUP_WINDOW_MS)
        )
        .map(c => ({
          payment_id: c.id,
          invoice_id: c.invoice_id,
          invoice_number: invoiceById[c.invoice_id]?.invoice_number || `#${c.invoice_id}`,
          invoice_date: invoiceById[c.invoice_id]?.invoice_date || null,
          invoice_total: invoiceById[c.invoice_id]?.total != null ? Number(invoiceById[c.invoice_id].total) : null,
          status: invoiceById[c.invoice_id]?.status || null,
          // Solde restant de la facture sœur (total − crédité), 0 si réglée
          balance: invoiceById[c.invoice_id]
            ? Math.round(((Number(invoiceById[c.invoice_id].total) || 0) - (Number(invoiceById[c.invoice_id].amount_paid) || 0)) * 100) / 100
            : null,
          amount: Number(c.amount) || 0,
          discount_applied: Number(c.discount_applied) || 0,
        }))
        .sort((a, b) => String(a.invoice_number).localeCompare(String(b.invoice_number), 'fr-CA'));

      const groupAmount = (Number(p.amount) || 0) + siblings.reduce((s, x) => s + x.amount, 0);
      const groupDiscount = (Number(p.discount_applied) || 0) + siblings.reduce((s, x) => s + x.discount_applied, 0);

      return {
        ...p,
        amount: Number(p.amount) || 0,
        discount_applied: Number(p.discount_applied) || 0,
        siblings,
        group_amount: Math.round(groupAmount * 100) / 100,
        group_discount: Math.round(groupDiscount * 100) / 100,
        group_invoice_count: siblings.length + 1,
      };
    });

    const credited = enriched.reduce((s, p) => s + p.amount + p.discount_applied, 0);
    // Crédit historique (facture marquée payée avant le module État de compte, sans ligne)
    const historicalCredit = Math.max(Number(invoice.amount_paid) || 0, credited);
    const balance = Math.round(((Number(invoice.total) || 0) - historicalCredit) * 100) / 100;

    return NextResponse.json({
      success: true,
      data: {
        invoice: {
          ...invoice,
          total: Number(invoice.total) || 0,
          credited: Math.round(historicalCredit * 100) / 100,
          balance,
          // true si la facture est « payée » sans aucune ligne de paiement (avant 2026-06-14)
          legacy_paid: enriched.length === 0 && invoice.status === 'paid',
        },
        payments: enriched,
      },
    });
  } catch (error) {
    console.error('GET /api/invoices/[id]/payments error:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur lors de la lecture des paiements', details: error.message },
      { status: 500 }
    );
  }
}
