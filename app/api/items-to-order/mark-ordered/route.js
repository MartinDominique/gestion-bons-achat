/**
 * @file app/api/items-to-order/mark-ordered/route.js
 * @description Marque un lot d'items « À Commander » comme commandés une fois l'AF
 *              (Achat Fournisseur) créé. Lie l'AF (id + numéro) à chaque item et
 *              passe leur statut à 'ordered' (badge vert + vue Commandés).
 *              Correspondance robuste: on marque les items ciblés par leur `id`
 *              explicite (flux « Créer l'AF ») ET/OU par leur `product_code` (flux AF
 *              manuel — l'utilisateur reconstruit l'AF sans passer par le bouton).
 *              Seuls les items encore « pending » sont touchés (on ne réécrit pas le
 *              lien d'un item déjà commandé).
 *              Note « l'app apprend » : la mise à jour de products.supplier (dernier
 *              fournisseur) est déjà faite par le hook AF à la sauvegarde
 *              (SupplierPurchaseHooks.handlePurchaseSubmit) — pas dupliquée ici.
 * @version 1.1.0
 * @date 2026-08-06
 * @changelog
 *   1.1.0 - Correspondance par product_code en plus des ids (AF manuel + robustesse
 *           du flux « Créer l'AF ») ; ne marque que les items encore 'pending'.
 *   1.0.0 - Version initiale (Liste À Commander MVP)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST /api/items-to-order/mark-ordered
 * Body: {
 *   ids: string[],                    // ids des items à marquer commandés (flux « Créer l'AF »)
 *   product_codes: string[],          // codes produits de l'AF (flux robuste / AF manuel)
 *   supplier_purchase_id,             // id de l'AF créé (optionnel)
 *   supplier_purchase_number          // N° de l'AF (optionnel)
 * }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      ids = [],
      product_codes = [],
      supplier_purchase_id = null,
      supplier_purchase_number = null,
    } = body;

    // Normaliser les entrées
    const explicitIds = (Array.isArray(ids) ? ids : []).filter(Boolean);
    const codes = (Array.isArray(product_codes) ? product_codes : [])
      .map((c) => String(c).trim())
      .filter(Boolean);

    if (explicitIds.length === 0 && codes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Aucun item à marquer commandé' },
        { status: 400 }
      );
    }

    // Rassembler les ids à marquer : ids explicites + items « pending » dont le
    // product_code correspond à un article de l'AF.
    const idsToMark = new Set(explicitIds);

    if (codes.length > 0) {
      const { data: matches, error: matchErr } = await supabaseAdmin
        .from('items_to_order')
        .select('id')
        .eq('status', 'pending')
        .in('product_code', codes);

      if (matchErr) {
        console.error('Erreur recherche items par code:', matchErr);
        return NextResponse.json(
          { success: false, error: 'Erreur lors de la recherche des items à commander' },
          { status: 500 }
        );
      }
      (matches || []).forEach((m) => idsToMark.add(m.id));
    }

    const finalIds = [...idsToMark];

    if (finalIds.length === 0) {
      // Rien à marquer (aucun item en attente ne correspond) — ce n'est pas une erreur.
      return NextResponse.json({ success: true, data: [], count: 0 });
    }

    // Marquer les items commandés + lier l'AF. On restreint à 'pending' pour ne pas
    // réécrire le lien d'un item déjà commandé lors d'une re-sauvegarde.
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
      .in('id', finalIds)
      .eq('status', 'pending')
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
