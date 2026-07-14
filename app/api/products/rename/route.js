/**
 * @file app/api/products/rename/route.js
 * @description API serveur pour renommer le code (product_id) d'un produit avec cascade.
 *              product_id est la référence texte utilisée par plusieurs tables
 *              (inventory_movements, work_order_materials, delivery_note_materials).
 *              Il n'y a PAS de contrainte FK, donc un simple UPDATE du product_id
 *              orphelinerait l'historique. Cet endpoint met donc à jour en cascade
 *              toutes les références connues, via supabaseAdmin (bypass RLS —
 *              notamment work_order_materials qui bloque les lectures/écritures client).
 * @version 1.0.0
 * @date 2026-07-14
 * @changelog
 *   1.0.0 - Version initiale
 *           - Vérifie l'unicité du nouveau code (products + non_inventory_items)
 *           - Met à jour la ligne produit puis cascade sur inventory_movements,
 *             work_order_materials et delivery_note_materials (product_id + product_code)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

export async function POST(request) {
  try {
    const body = await request.json();
    const source = body.source === 'non_inventory' ? 'non_inventory' : 'products';
    const oldCode = (body.oldCode || '').trim();
    const newCode = (body.newCode || '').trim();

    if (!oldCode || !newCode) {
      return NextResponse.json(
        { success: false, error: 'Code actuel et nouveau code requis.' },
        { status: 400 }
      );
    }

    if (oldCode === newCode) {
      return NextResponse.json({ success: true, unchanged: true });
    }

    const tableName = source === 'products' ? 'products' : 'non_inventory_items';

    // 1. Vérifier que le produit source existe
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from(tableName)
      .select('product_id')
      .eq('product_id', oldCode)
      .maybeSingle();

    if (existingErr) throw existingErr;
    if (!existing) {
      return NextResponse.json(
        { success: false, error: `Produit "${oldCode}" introuvable.` },
        { status: 404 }
      );
    }

    // 2. Vérifier l'unicité du nouveau code dans les 2 tables de produits
    const [{ data: dupProd }, { data: dupNonInv }] = await Promise.all([
      supabaseAdmin.from('products').select('product_id').eq('product_id', newCode).maybeSingle(),
      supabaseAdmin.from('non_inventory_items').select('product_id').eq('product_id', newCode).maybeSingle(),
    ]);

    if (dupProd || dupNonInv) {
      return NextResponse.json(
        { success: false, error: `Le code "${newCode}" existe déjà. Choisissez un code unique.` },
        { status: 409 }
      );
    }

    // 3. Mettre à jour la ligne produit (le code lui-même)
    const { error: updateErr } = await supabaseAdmin
      .from(tableName)
      .update({ product_id: newCode })
      .eq('product_id', oldCode);

    if (updateErr) throw updateErr;

    // 4. Cascade sur les références texte (best-effort, on n'échoue pas le renommage
    //    si une table secondaire n'a pas la colonne — mais on log l'erreur)
    const cascade = { inventory_movements: 0, work_order_materials: 0, delivery_note_materials: 0 };

    // inventory_movements: product_id uniquement
    try {
      const { error } = await supabaseAdmin
        .from('inventory_movements')
        .update({ product_id: newCode })
        .eq('product_id', oldCode);
      if (error) console.error('Cascade inventory_movements:', error.message);
    } catch (e) {
      console.error('Cascade inventory_movements (exception):', e);
    }

    // work_order_materials + delivery_note_materials: product_id ET product_code
    for (const tbl of ['work_order_materials', 'delivery_note_materials']) {
      for (const col of ['product_id', 'product_code']) {
        try {
          const { error } = await supabaseAdmin
            .from(tbl)
            .update({ [col]: newCode })
            .eq(col, oldCode);
          if (error) console.error(`Cascade ${tbl}.${col}:`, error.message);
        } catch (e) {
          console.error(`Cascade ${tbl}.${col} (exception):`, e);
        }
      }
    }

    return NextResponse.json({ success: true, oldCode, newCode, source });
  } catch (error) {
    console.error('Erreur rename produit:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur lors du renommage du code.' },
      { status: 500 }
    );
  }
}
