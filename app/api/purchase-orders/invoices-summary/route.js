/**
 * @file app/api/purchase-orders/invoices-summary/route.js
 * @description Résumé des factures par Bon d'Achat client (BA) — pour la pastille « Factures »
 *              de la liste des BA (remplace l'ancien compteur de livraisons « camion »)
 *              - GET: UNE requête pour tous les BA (ou `?ids=1,2,3`): BT/BL rattachés
 *                (linked_po_id) → factures créées depuis ces documents OU référencées par leur
 *                invoice_id (même union robuste que /api/purchase-orders/[id]/invoices)
 *              - Par BA: nombre de factures envoyées au client (statut sent/partial/paid),
 *                brouillons, payées, liste courte (N°, statut, total), BT/BL facturés dans
 *                Acomba (invoice_id = -1) et fermés par déduction « Varia » (invoice_id = -2)
 *              - supabaseAdmin: work_order_materials/work_orders ont des RLS qui bloquent la
 *                lecture côté navigateur; aucun PDF signé ici (la liste n'en a pas besoin)
 * @version 1.0.0
 * @date 2026-11-08
 * @changelog
 *   1.0.0 - Version initiale
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { isExternalInvoice, isDeduction, DEDUCTION_LABEL } from '../../../../lib/constants/deduction';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PAGE = 1000;

/** Lecture paginée (jamais coupée au plafond « max rows » de Supabase). */
async function fetchAll(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

/** Statuts considérés « envoyée au client ». */
const SENT_STATUSES = new Set(['sent', 'partial', 'paid']);

function emptySummary() {
  return {
    total: 0, sent: 0, draft: 0, paid: 0,
    invoices: [], external: [], deductions: [],
  };
}

// GET - Résumé des factures pour tous les BA (ou ceux de ?ids=)
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get('ids');
    const wantedIds = idsParam
      ? idsParam.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isInteger(n))
      : null;
    if (idsParam && (!wantedIds || wantedIds.length === 0)) {
      return NextResponse.json({ success: false, error: 'Paramètre ids invalide' }, { status: 400 });
    }

    // 1. BT et BL rattachés à un BA
    const btQuery = () => {
      let q = supabaseAdmin
        .from('work_orders')
        .select('id, bt_number, invoice_id, linked_po_id')
        .not('linked_po_id', 'is', null)
        .order('id', { ascending: true });
      if (wantedIds) q = q.in('linked_po_id', wantedIds);
      return q;
    };
    const blQuery = () => {
      let q = supabaseAdmin
        .from('delivery_notes')
        .select('id, bl_number, invoice_id, linked_po_id')
        .not('linked_po_id', 'is', null)
        .order('id', { ascending: true });
      if (wantedIds) q = q.in('linked_po_id', wantedIds);
      return q;
    };

    let bts, bls;
    try {
      [bts, bls] = await Promise.all([fetchAll(btQuery), fetchAll(blQuery)]);
    } catch (e) {
      throw new Error(`Lecture BT/BL: ${e.message}`);
    }

    const summaries = {};
    const ensure = (poId) => {
      if (!summaries[poId]) summaries[poId] = emptySummary();
      return summaries[poId];
    };
    if (wantedIds) wantedIds.forEach(id => ensure(id));

    // Index document → BA (pour rattacher chaque facture à son BA)
    const btToPo = new Map();
    const blToPo = new Map();
    const linkedInvoiceIdToPo = new Map();
    for (const d of bts) {
      btToPo.set(d.id, d.linked_po_id);
      const s = ensure(d.linked_po_id);
      if (isExternalInvoice(d.invoice_id)) s.external.push({ source_type: 'work_order', source_number: d.bt_number });
      else if (isDeduction(d.invoice_id)) s.deductions.push({ source_type: 'work_order', source_number: d.bt_number });
      else if (Number(d.invoice_id) > 0) linkedInvoiceIdToPo.set(Number(d.invoice_id), d.linked_po_id);
    }
    for (const d of bls) {
      blToPo.set(d.id, d.linked_po_id);
      const s = ensure(d.linked_po_id);
      if (isExternalInvoice(d.invoice_id)) s.external.push({ source_type: 'delivery_note', source_number: d.bl_number });
      else if (isDeduction(d.invoice_id)) s.deductions.push({ source_type: 'delivery_note', source_number: d.bl_number });
      else if (Number(d.invoice_id) > 0) linkedInvoiceIdToPo.set(Number(d.invoice_id), d.linked_po_id);
    }

    // 2. Factures: créées depuis ces BT/BL OU référencées par invoice_id (union)
    const btIds = [...btToPo.keys()];
    const blIds = [...blToPo.keys()];
    const invIds = [...linkedInvoiceIdToPo.keys()];
    const orParts = [];
    if (btIds.length > 0) orParts.push(`and(source_type.eq.work_order,source_id.in.(${btIds.join(',')}))`);
    if (blIds.length > 0) orParts.push(`and(source_type.eq.delivery_note,source_id.in.(${blIds.join(',')}))`);
    if (invIds.length > 0) orParts.push(`id.in.(${invIds.join(',')})`);

    let invoices = [];
    if (orParts.length > 0) {
      try {
        invoices = await fetchAll(() => supabaseAdmin
          .from('invoices')
          .select('id, invoice_number, invoice_date, total, amount_paid, status, source_type, source_id, source_number, sent_at')
          .or(orParts.join(','))
          .order('invoice_date', { ascending: false })
          .order('invoice_number', { ascending: false }));
      } catch (e) {
        throw new Error(`Lecture factures: ${e.message}`);
      }
    }

    // 3. Rattacher chaque facture à son BA (une seule fois)
    const seen = new Set();
    for (const inv of invoices) {
      if (seen.has(inv.id)) continue;
      seen.add(inv.id);
      let poId = null;
      if (inv.source_type === 'work_order') poId = btToPo.get(inv.source_id) ?? null;
      else if (inv.source_type === 'delivery_note') poId = blToPo.get(inv.source_id) ?? null;
      if (poId == null) poId = linkedInvoiceIdToPo.get(Number(inv.id)) ?? null;
      if (poId == null) continue;

      const s = ensure(poId);
      const isSent = SENT_STATUSES.has(inv.status);
      s.total += 1;
      if (isSent) s.sent += 1;
      if (inv.status === 'draft') s.draft += 1;
      if (inv.status === 'paid') s.paid += 1;
      s.invoices.push({
        id: inv.id,
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        status: inv.status,
        total: inv.total,
        amount_paid: inv.amount_paid,
        source_number: inv.source_number,
        sent_at: inv.sent_at,
      });
    }

    return NextResponse.json(
      { success: true, data: summaries, deduction_label: DEDUCTION_LABEL },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Erreur GET /api/purchase-orders/invoices-summary:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur chargement du résumé des factures' },
      { status: 500 }
    );
  }
}
