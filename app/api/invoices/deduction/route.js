/**
 * @file app/api/invoices/deduction/route.js
 * @description Déduction « Varia » — fermer un BT/BL depuis la fiche de facturation SANS
 *              créer de facture (client qui règle sans facture, cas rare).
 *              - POST { source_type, source_id, source_number, line_items, is_prix_jobe,
 *                       jobe_detail_items }
 *                1. Vérifie que le BT/BL existe, n'est pas déjà facturé (invoice_id NULL)
 *                   et qu'aucune facture n'existe pour lui (409 sinon)
 *                2. Ajuste l'inventaire selon les quantités de la fiche vs le BT/BL
 *                   (lib/services/invoice-inventory.js → syncDeductionInventory,
 *                   mouvements 'deduction' référencés par le N° du BT/BL, idempotent)
 *                3. Marque le BT/BL invoice_id = -2 (DEDUCTION_INVOICE_ID): il sort de
 *                   « À facturer » et affiche « Varia » dans la liste BT/BL
 *              Ordre volontaire: inventaire d'abord, marquage ensuite. Si le marquage échoue,
 *              le BT/BL reste dans « À facturer » et une nouvelle tentative n'ajuste que la
 *              différence (idempotence). Rien n'est écrit dans la table invoices: aucun
 *              numéro de facture, rien dans l'archive, l'état de compte ni les rapports.
 * @version 1.0.0
 * @date 2026-11-07
 * @changelog
 *   1.0.0 - Version initiale
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { syncDeductionInventory } from '../../../../lib/services/invoice-inventory';
import { DEDUCTION_INVOICE_ID, DEDUCTION_LABEL, isDeduction } from '../../../../lib/constants/deduction';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      source_type,
      source_id,
      source_number,
      line_items = [],
      is_prix_jobe = false,
      jobe_detail_items = null,
    } = body || {};

    if (!['work_order', 'delivery_note'].includes(source_type)) {
      return NextResponse.json(
        { success: false, error: 'source_type doit être work_order ou delivery_note' },
        { status: 400 }
      );
    }
    const sourceId = parseInt(source_id);
    if (!sourceId || !source_number) {
      return NextResponse.json(
        { success: false, error: 'Champs requis manquants: source_id, source_number' },
        { status: 400 }
      );
    }

    const isBT = source_type === 'work_order';
    const table = isBT ? 'work_orders' : 'delivery_notes';
    const docLabel = isBT ? 'BT' : 'BL';

    // 1. Document source
    const { data: doc, error: docErr } = await supabaseAdmin
      .from(table)
      .select(isBT
        ? 'id, bt_number, invoice_id, status, client:clients(name, company)'
        : 'id, bl_number, invoice_id, status, client_name')
      .eq('id', sourceId)
      .maybeSingle();
    if (docErr) {
      return NextResponse.json(
        { success: false, error: `Lecture du ${docLabel} impossible`, details: docErr.message },
        { status: 500 }
      );
    }
    if (!doc) {
      return NextResponse.json(
        { success: false, error: `${docLabel} ${source_number} introuvable` },
        { status: 404 }
      );
    }
    if (isDeduction(doc.invoice_id)) {
      return NextResponse.json(
        { success: false, error: `${docLabel} ${source_number} est déjà marqué « ${DEDUCTION_LABEL} »` },
        { status: 409 }
      );
    }
    if (doc.invoice_id) {
      return NextResponse.json(
        { success: false, error: `${docLabel} ${source_number} est déjà facturé: déduction impossible` },
        { status: 409 }
      );
    }

    // Garde: aucune facture ne doit exister pour ce document (lien perdu ou non)
    const { data: existing, error: existErr } = await supabaseAdmin
      .from('invoices')
      .select('id, invoice_number')
      .eq('source_type', source_type)
      .eq('source_id', sourceId)
      .limit(1);
    if (existErr) {
      return NextResponse.json(
        { success: false, error: 'Vérification des factures impossible', details: existErr.message },
        { status: 500 }
      );
    }
    if (existing && existing.length > 0) {
      return NextResponse.json(
        { success: false, error: `Une facture (${existing[0].invoice_number}) existe déjà pour ${docLabel} ${source_number}` },
        { status: 409 }
      );
    }

    const clientName = isBT
      ? (doc.client?.company || doc.client?.name || '')
      : (doc.client_name || '');

    // 2. Inventaire aligné sur la fiche (idempotent, référence = N° du BT/BL)
    const inventory = await syncDeductionInventory({
      source_type,
      source_id: sourceId,
      source_number,
      client_name: clientName,
      is_prix_jobe: !!is_prix_jobe,
      line_items: Array.isArray(line_items) ? line_items : [],
      jobe_detail_items: Array.isArray(jobe_detail_items) ? jobe_detail_items : null,
    });

    // 3. Marquage « Varia » (vérifié + 2 tentatives, comme le lien facture ↔ BT/BL)
    let markErr = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const { data, error } = await supabaseAdmin
        .from(table)
        .update({ invoice_id: DEDUCTION_INVOICE_ID })
        .eq('id', sourceId)
        .is('invoice_id', null)
        .select('id');
      if (!error && data && data.length > 0) { markErr = null; break; }
      markErr = error?.message || 'aucune ligne modifiée';
      console.error(`Marquage ${DEDUCTION_LABEL} ${table} (tentative ${attempt}):`, markErr);
    }

    if (markErr) {
      return NextResponse.json(
        {
          success: false,
          error: `Inventaire ajusté, MAIS le ${docLabel} ${source_number} n'a pas pu être marqué « ${DEDUCTION_LABEL} » (${markErr}). Il reste dans « À facturer »: réessayez (seule la différence sera ajustée).`,
          inventory,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Déduction appliquée: ${docLabel} ${source_number} marqué « ${DEDUCTION_LABEL} » (aucune facture créée)`,
      label: DEDUCTION_LABEL,
      ...inventory,
    });
  } catch (error) {
    console.error('Erreur POST /api/invoices/deduction:', error);
    return NextResponse.json(
      { success: false, error: 'Déduction non appliquée', details: error.message },
      { status: 500 }
    );
  }
}
