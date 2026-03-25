/**
 * @file app/api/invoices/mark-external/route.js
 * @description Marquer des BT/BL comme facturés externement (Acomba)
 *              - POST: Met invoice_id = -1 sur les BT/BL spécifiés
 *              - Permet de retirer les anciens documents de la liste "À facturer"
 * @version 1.0.0
 * @date 2026-02-27
 * @changelog
 *   1.0.0 - Version initiale
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/invoices/mark-external
 * Marque des BT/BL comme facturés externement (Acomba)
 * Body: { items: [{ type: 'bt'|'bl', id: number }] }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { items } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Aucun item à marquer' },
        { status: 400 }
      );
    }

    const EXTERNAL_INVOICE_ID = -1;
    let btCount = 0;
    let blCount = 0;

    // Séparer BT et BL
    const btIds = items.filter(i => i.type === 'bt').map(i => parseInt(i.id));
    const blIds = items.filter(i => i.type === 'bl').map(i => parseInt(i.id));

    // Mettre à jour les BT
    if (btIds.length > 0) {
      const { error: btError } = await supabaseAdmin
        .from('work_orders')
        .update({ invoice_id: EXTERNAL_INVOICE_ID })
        .in('id', btIds)
        .is('invoice_id', null);

      if (btError) {
        console.error('Erreur marquage BT:', btError);
      } else {
        btCount = btIds.length;
      }
    }

    // Mettre à jour les BL
    if (blIds.length > 0) {
      const { error: blError } = await supabaseAdmin
        .from('delivery_notes')
        .update({ invoice_id: EXTERNAL_INVOICE_ID })
        .in('id', blIds)
        .is('invoice_id', null);

      if (blError) {
        console.error('Erreur marquage BL:', blError);
      } else {
        blCount = blIds.length;
      }
    }

    const totalMarked = btCount + blCount;

    return NextResponse.json({
      success: true,
      message: `${totalMarked} document(s) marqué(s) comme facturé(s) (Acomba)`,
      details: { bt: btCount, bl: blCount },
    });

  } catch (error) {
    console.error('Erreur API mark-external:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur serveur', details: error.message },
      { status: 500 }
    );
  }
}
