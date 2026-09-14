/**
 * @file app/api/invoices/relink/route.js
 * @description Réparation des liens BT/BL ↔ facture manquants
 *              - Une facture existe (invoices.source_type + source_id) mais le document
 *                source a encore invoice_id NULL (écriture du lien échouée quand la base
 *                ne répondait pas) → le BT/BL reste à tort dans « À facturer ».
 *              - GET: aperçu (liste des documents à relier), aucune écriture
 *              - POST: applique la réparation (invoice_id = id de la facture)
 *              - Ne touche JAMAIS un document déjà lié (autre facture ou -1 « Acomba »)
 *              - Appelé automatiquement par l'onglet « À facturer » (auto-réparation)
 * @version 1.0.0
 * @date 2026-09-14
 * @changelog
 *   1.0.0 - Version initiale (BL-2609-005 facturée 23073 mais toujours « à facturer »)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SOURCE_TABLES = {
  work_order: { table: 'work_orders', numberCol: 'bt_number' },
  delivery_note: { table: 'delivery_notes', numberCol: 'bl_number' },
};

/**
 * Trouve les documents sources dont invoice_id est NULL alors qu'une facture existe.
 * @returns {Promise<Array<{source_type, source_id, source_number, invoice_id, invoice_number}>>}
 */
async function findMissingLinks() {
  const { data: invoices, error } = await supabaseAdmin
    .from('invoices')
    .select('id, invoice_number, source_type, source_id')
    .in('source_type', Object.keys(SOURCE_TABLES));
  if (error) throw error;

  const missing = [];
  for (const [type, cfg] of Object.entries(SOURCE_TABLES)) {
    const ofType = (invoices || []).filter(i => i.source_type === type && i.source_id != null);
    if (ofType.length === 0) continue;

    const ids = [...new Set(ofType.map(i => i.source_id))];
    const { data: docs, error: docErr } = await supabaseAdmin
      .from(cfg.table)
      .select(`id, ${cfg.numberCol}, invoice_id`)
      .in('id', ids)
      .is('invoice_id', null);
    if (docErr) throw docErr;

    for (const doc of docs || []) {
      // Plusieurs factures pour un même document ne devraient pas exister (garde 409 au
      // POST): on prend la plus récente (id le plus élevé) par prudence.
      const inv = ofType.filter(i => i.source_id === doc.id).sort((a, b) => b.id - a.id)[0];
      if (!inv) continue;
      missing.push({
        source_type: type,
        source_id: doc.id,
        source_number: doc[cfg.numberCol],
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
      });
    }
  }
  return missing;
}

/** GET /api/invoices/relink — aperçu, aucune écriture */
export async function GET() {
  try {
    const missing = await findMissingLinks();
    return NextResponse.json({ success: true, data: missing, count: missing.length });
  } catch (error) {
    console.error('GET /api/invoices/relink error:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur lors de la vérification des liens', details: error.message },
      { status: 500 }
    );
  }
}

/** POST /api/invoices/relink — applique la réparation */
export async function POST() {
  try {
    const missing = await findMissingLinks();
    const repaired = [];
    const failed = [];

    for (const m of missing) {
      const cfg = SOURCE_TABLES[m.source_type];
      const { data: updated, error: updErr } = await supabaseAdmin
        .from(cfg.table)
        .update({ invoice_id: m.invoice_id })
        .eq('id', m.source_id)
        .is('invoice_id', null) // jamais écraser un lien posé entre-temps
        .select('id');
      if (updErr || !updated || updated.length === 0) {
        failed.push({ ...m, error: updErr?.message || 'aucune ligne modifiée' });
      } else {
        repaired.push(m);
      }
    }

    return NextResponse.json({
      success: true,
      repaired,
      failed,
      count: repaired.length,
      message: repaired.length > 0
        ? `${repaired.length} lien(s) réparé(s): ${repaired.map(r => `${r.source_number} → facture ${r.invoice_number}`).join(', ')}`
        : 'Aucun lien à réparer',
    });
  } catch (error) {
    console.error('POST /api/invoices/relink error:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur lors de la réparation des liens', details: error.message },
      { status: 500 }
    );
  }
}
