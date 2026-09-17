/**
 * @file app/api/invoices/[id]/sync-inventory/route.js
 * @description Ajuste l'inventaire selon les matériaux de la facture (après sauvegarde).
 *              - POST {} : delta = facture − BT/BL − ajustements déjà faits → mouvements
 *                'invoice' + stock_qty mis à jour (idempotent)
 *              - POST { revert: true } : ramène l'inventaire à l'état du BT/BL
 *              Voir lib/services/invoice-inventory.js
 * @version 1.0.0
 * @date 2026-09-17
 * @changelog
 *   1.0.0 - Version initiale
 */

import { NextResponse } from 'next/server';
import { syncInvoiceInventory } from '../../../../../lib/services/invoice-inventory';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  try {
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ success: false, error: 'ID invalide' }, { status: 400 });
    }
    let body = {};
    try { body = await request.json(); } catch (_) { body = {}; }

    const result = await syncInvoiceInventory(id, { revert: body.revert === true });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Erreur sync inventaire facture:', error);
    return NextResponse.json(
      { success: false, error: 'Inventaire non ajusté', details: error.message },
      { status: 500 }
    );
  }
}
