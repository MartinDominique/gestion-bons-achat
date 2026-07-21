/**
 * @file app/api/items-to-order/mark-ordered/route.js
 * @description Marque un lot d'items « À Commander » comme commandés une fois l'AF
 *              (Achat Fournisseur) créé. Lie l'AF (id + numéro) à chaque item et
 *              passe leur statut à 'ordered' (badge vert + vue Commandés).
 *              Note « l'app apprend » : la mise à jour de products.supplier (dernier
 *              fournisseur) est déjà faite par le hook AF à la sauvegarde
 *              (SupplierPurchaseHooks.handlePurchaseSubmit) — pas dupliquée ici.
 * @version 1.0.0
 * @date 2026-07-21
 * @changelog
 *   1.0.0 - Version initiale (Liste À Commander MVP)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST /api/items-to-order/mark-ordered
 * Body: {
 *   ids: string[],                    // ids des items à marquer commandés
 *   supplier_purchase_id,             // id de l'AF créé (optionnel)
 *   supplier_purchase_number          // N° de l'AF (optionnel)
 * }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      ids = [],
      supplier_purchase_id = null,
      supplier_purchase_number = null,
    } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Aucun item à marquer commandé' },
        { status: 400 }
      );
    }

    // Marquer les items commandés + lier l'AF
    const { data, error } = await supabaseAdmin
      .from('items_to_order')
      .update({
        status: 'ordered',
        ordered_at: new Date().toISOString(),
        supplier_purchase_id: supplier_purchase_id || null,
        supplier_purchase_number: supplier_purchase_number
          ? String(supplier_purchase_number).trim()
          : null,
        updated_at: new Date().toISOString(),
      })
      .in('id', ids)
      .select();

    if (error) {
      console.error('Erreur mark-ordered items:', error);
      return NextResponse.json(
        { success: false, error: 'Erreur lors du marquage des items commandés' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: data || [], count: (data || []).length });
  } catch (err) {
    console.error('Erreur POST /api/items-to-order/mark-ordered:', err);
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}
