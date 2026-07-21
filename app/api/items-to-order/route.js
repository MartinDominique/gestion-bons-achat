/**
 * @file app/api/items-to-order/route.js
 * @description API CRUD pour la liste « À Commander » (réapprovisionnement).
 *              - GET: Liste les items (filtre par statut: pending / ordered / all)
 *              - POST: Ajoute un item à la liste depuis un BT/BL/Soumission/Inventaire.
 *                Enrichit automatiquement le fournisseur suggéré + coûtant depuis la
 *                table products/non_inventory_items (les lignes BT/BL/Soum. ne portent
 *                pas ces champs). Fusionne les doublons en attente (même code produit)
 *                en additionnant les quantités.
 * @version 1.0.0
 * @date 2026-07-21
 * @changelog
 *   1.0.0 - Version initiale (Liste À Commander MVP)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SOURCE_TYPES = ['work_order', 'delivery_note', 'submission', 'inventory', 'manual'];

/**
 * Cherche un produit (inventaire puis non-inventaire) par son code pour enrichir
 * fournisseur suggéré, coûtant, unité et description manquants.
 * Retourne null si introuvable (l'ajout reste permis, groupe « À assigner »).
 */
async function lookupProduct(code) {
  if (!code) return null;
  const codeStr = String(code).trim();
  if (!codeStr) return null;

  // 1. Inventaire principal
  let { data } = await supabaseAdmin
    .from('products')
    .select('product_id, description, unit, cost_price, supplier')
    .eq('product_id', codeStr)
    .maybeSingle();

  if (data) return { ...data, _source: 'products' };

  // 2. Non-inventaire (supplier absent de cette table → null)
  const { data: ni } = await supabaseAdmin
    .from('non_inventory_items')
    .select('product_id, description, unit, cost_price')
    .eq('product_id', codeStr)
    .maybeSingle();

  if (ni) return { ...ni, supplier: null, _source: 'non_inventory' };

  return null;
}

/**
 * GET /api/items-to-order
 * Query params:
 *   - status: 'pending' (défaut) | 'ordered' | 'all'
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending';

    let query = supabaseAdmin.from('items_to_order').select('*');

    if (status === 'pending') query = query.eq('status', 'pending');
    else if (status === 'ordered') query = query.eq('status', 'ordered');
    // 'all' → pas de filtre

    // Tri: en attente d'abord par fournisseur puis création; commandés par date desc.
    query = query
      .order('suggested_supplier', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('Erreur lecture items_to_order:', error);
      return NextResponse.json(
        { success: false, error: 'Erreur lors de la lecture de la liste à commander' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err) {
    console.error('Erreur GET /api/items-to-order:', err);
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * POST /api/items-to-order
 * Body: {
 *   product_id, product_code, description, unit, quantity,
 *   suggested_supplier, cost_price,
 *   source_type, source_id, source_number, client_name, notes, user_id
 * }
 * Enrichit fournisseur + coûtant si absents. Fusionne un doublon 'pending'
 * (même product_code) en additionnant la quantité.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      product_id = null,
      product_code = null,
      description = null,
      unit = null,
      quantity = 1,
      suggested_supplier = null,
      cost_price = null,
      source_type = 'manual',
      source_id = null,
      source_number = null,
      client_name = null,
      notes = null,
      user_id = null,
    } = body;

    const code = product_code || (product_id != null ? String(product_id) : null);

    // Description requise (fallback via enrichissement si absente)
    const enriched = await lookupProduct(code);

    const finalDescription = (description && String(description).trim())
      || (enriched?.description ? String(enriched.description).trim() : null);

    if (!finalDescription) {
      return NextResponse.json(
        { success: false, error: 'La description du produit est requise' },
        { status: 400 }
      );
    }

    const qty = Math.max(0, parseFloat(quantity) || 1);
    const finalSupplier = suggested_supplier || enriched?.supplier || null;
    const finalCost = cost_price != null && cost_price !== ''
      ? parseFloat(cost_price)
      : (enriched?.cost_price != null ? parseFloat(enriched.cost_price) : null);
    const finalUnit = unit || enriched?.unit || 'UN';
    const cleanSourceType = SOURCE_TYPES.includes(source_type) ? source_type : 'manual';

    // Fusion des doublons en attente (même code produit) → additionner la quantité.
    if (code) {
      const { data: existing } = await supabaseAdmin
        .from('items_to_order')
        .select('id, quantity')
        .eq('status', 'pending')
        .eq('product_code', code)
        .limit(1)
        .maybeSingle();

      if (existing) {
        const { data: merged, error: mergeErr } = await supabaseAdmin
          .from('items_to_order')
          .update({
            quantity: (parseFloat(existing.quantity) || 0) + qty,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (mergeErr) {
          console.error('Erreur fusion item à commander:', mergeErr);
          return NextResponse.json(
            { success: false, error: 'Erreur lors de la mise à jour de la liste' },
            { status: 500 }
          );
        }
        return NextResponse.json({ success: true, data: merged, merged: true });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('items_to_order')
      .insert({
        product_id: product_id != null ? String(product_id) : null,
        product_code: code,
        description: finalDescription,
        unit: finalUnit,
        quantity: qty,
        suggested_supplier: finalSupplier,
        cost_price: finalCost,
        source_type: cleanSourceType,
        source_id: source_id || null,
        source_number: source_number ? String(source_number).trim() : null,
        client_name: client_name ? String(client_name).trim() : null,
        notes: notes ? String(notes).trim() : null,
        status: 'pending',
        user_id: user_id || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Erreur création item à commander:', error);
      return NextResponse.json(
        { success: false, error: 'Erreur lors de l\'ajout à la liste à commander' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data, merged: false });
  } catch (err) {
    console.error('Erreur POST /api/items-to-order:', err);
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}
