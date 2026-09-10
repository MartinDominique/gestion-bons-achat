/**
 * @file app/api/product-associations/route.js
 * @description API des « items associés » (table product_associations).
 *              Lien à SENS UNIQUE parent → enfant: « quand j'ajoute A, propose-moi B ».
 *              - GET ?parent=CODE          → enfants de CODE, enrichis (description, unité,
 *                                            prix, stock) depuis products / non_inventory_items
 *              - GET ?child=CODE           → parents qui suggèrent CODE (enrichis)
 *              - GET ?codes=A,B,C&mode=counts → { counts: { A: 2, ... }, parent_counts: { A: 1, ... } }
 *                                            pour les carrés « As » (une seule requête par écran):
 *                                            counts = nb d'associés, parent_counts = nb de
 *                                            produits qui suggèrent ce code
 *              - POST { parent_code, child_code, default_quantity, notes }
 *                                         → crée le lien (ou met à jour la quantité si
 *                                            le lien existe déjà). Vérifie que les deux
 *                                            produits existent et diffèrent.
 *              Passe par supabaseAdmin (même modèle que items_to_order).
 * @version 1.0.0
 * @date 2026-09-10
 * @changelog
 *   1.0.0 - Version initiale (Items associés MVP)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { lookupProducts, normalizeCode } from '../../../lib/services/product-associations';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SELECT_COLS = 'id, parent_code, child_code, default_quantity, notes, created_at, updated_at';

/**
 * Enrichit une liste de liens avec la fiche produit du code demandé (enfant ou parent).
 * Un produit supprimé de l'inventaire reste visible (product: null) pour pouvoir
 * retirer le lien.
 */
async function enrich(links, codeField) {
  const codes = [...new Set((links || []).map((l) => l[codeField]).filter(Boolean))];
  const productMap = await lookupProducts(codes);
  return (links || []).map((l) => ({
    ...l,
    default_quantity: parseFloat(l.default_quantity) || 1,
    product: productMap[l[codeField]] || null,
  }));
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const parent = normalizeCode(searchParams.get('parent'));
    const child = normalizeCode(searchParams.get('child'));
    const codesParam = searchParams.get('codes');
    const mode = searchParams.get('mode') || '';

    // ---- Compteurs pour les carrés « As » ----
    if (codesParam != null) {
      const codes = [...new Set(
        codesParam.split(',').map((c) => normalizeCode(c)).filter(Boolean)
      )];
      const counts = {};
      codes.forEach((c) => { counts[c] = 0; });

      const parentCounts = {};
      codes.forEach((c) => { parentCounts[c] = 0; });

      if (codes.length > 0) {
        const [childrenRes, parentsRes] = await Promise.all([
          supabaseAdmin.from('product_associations').select('parent_code').in('parent_code', codes),
          supabaseAdmin.from('product_associations').select('child_code').in('child_code', codes),
        ]);
        if (childrenRes.error) throw childrenRes.error;
        if (parentsRes.error) throw parentsRes.error;
        (childrenRes.data || []).forEach((row) => {
          counts[row.parent_code] = (counts[row.parent_code] || 0) + 1;
        });
        (parentsRes.data || []).forEach((row) => {
          parentCounts[row.child_code] = (parentCounts[row.child_code] || 0) + 1;
        });
      }

      // counts = nb d'associés (enfants) ; parent_counts = nb de produits qui le suggèrent
      return NextResponse.json({ success: true, counts, parent_counts: parentCounts, mode: mode || 'counts' });
    }

    // ---- Enfants d'un parent ----
    if (parent) {
      const { data, error } = await supabaseAdmin
        .from('product_associations')
        .select(SELECT_COLS)
        .eq('parent_code', parent)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const enriched = await enrich(data, 'child_code');
      return NextResponse.json({ success: true, data: enriched, total: enriched.length });
    }

    // ---- Parents d'un enfant (« Associé à ») ----
    if (child) {
      const { data, error } = await supabaseAdmin
        .from('product_associations')
        .select(SELECT_COLS)
        .eq('child_code', child)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const enriched = await enrich(data, 'parent_code');
      return NextResponse.json({ success: true, data: enriched, total: enriched.length });
    }

    return NextResponse.json(
      { success: false, error: 'Paramètre requis: parent, child ou codes' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Erreur GET product-associations:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const parent_code = normalizeCode(body.parent_code);
    const child_code = normalizeCode(body.child_code);
    const default_quantity = parseFloat(body.default_quantity);
    const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;

    if (!parent_code || !child_code) {
      return NextResponse.json(
        { success: false, error: 'Code du produit parent et code du produit associé requis.' },
        { status: 400 }
      );
    }
    if (parent_code === child_code) {
      return NextResponse.json(
        { success: false, error: 'Un produit ne peut pas être associé à lui-même.' },
        { status: 400 }
      );
    }
    if (!(default_quantity > 0)) {
      return NextResponse.json(
        { success: false, error: 'La quantité par défaut doit être supérieure à 0.' },
        { status: 400 }
      );
    }

    // Les deux produits doivent exister (inventaire ou non-inventaire)
    const products = await lookupProducts([parent_code, child_code]);
    if (!products[parent_code]) {
      return NextResponse.json(
        { success: false, error: `Produit parent introuvable: ${parent_code}` },
        { status: 404 }
      );
    }
    if (!products[child_code]) {
      return NextResponse.json(
        { success: false, error: `Produit associé introuvable: ${child_code}` },
        { status: 404 }
      );
    }

    // Lien existant → mise à jour de la quantité/notes (pas de doublon)
    const { data: existing, error: existErr } = await supabaseAdmin
      .from('product_associations')
      .select('id')
      .eq('parent_code', parent_code)
      .eq('child_code', child_code)
      .maybeSingle();
    if (existErr) throw existErr;

    let saved;
    if (existing) {
      const { data, error } = await supabaseAdmin
        .from('product_associations')
        .update({ default_quantity, notes, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select(SELECT_COLS)
        .single();
      if (error) throw error;
      saved = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from('product_associations')
        .insert({ parent_code, child_code, default_quantity, notes, user_id: body.user_id || null })
        .select(SELECT_COLS)
        .single();
      if (error) throw error;
      saved = data;
    }

    return NextResponse.json({
      success: true,
      data: { ...saved, default_quantity: parseFloat(saved.default_quantity) || 1, product: products[child_code] },
      updated: !!existing,
    });
  } catch (error) {
    console.error('Erreur POST product-associations:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
