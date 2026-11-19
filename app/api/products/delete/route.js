/**
 * @file app/api/products/delete/route.js
 * @description Suppression définitive d'une fiche produit (nettoyage des doublons de l'Inventaire).
 *              - GET  ?source=products|non_inventory&code=XXX[&id=123] → vérification AVANT suppression:
 *                mouvements d'inventaire (liste), historique de prix, utilisation dans les
 *                documents (BT, BL, BA), liens « As », liste À Commander, et autres fiches
 *                portant le même code (doublons)
 *              - POST { source, code, id } → supprime UNE seule fiche (products par product_id,
 *                non_inventory_items par id)
 *              - Les mouvements d'inventaire et les lignes de documents ne sont JAMAIS effacés
 *                (traçabilité): si un doublon du même code reste, ils y demeurent rattachés
 *              - Les liens « As » ne sont retirés que si plus aucune fiche ne porte ce code
 *              - supabaseAdmin (bypass RLS: work_order_materials est illisible côté client)
 * @version 1.0.0
 * @date 2026-11-19
 * @changelog
 *   1.0.0 - Version initiale
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const MOVEMENTS_LIMIT = 500;

const PRICE_HISTORY_FIELDS = [
  'cost_price_1st', 'cost_price_2nd', 'cost_price_3rd',
  'selling_price_1st', 'selling_price_2nd', 'selling_price_3rd',
];

const tableFor = (source) => (source === 'non_inventory' ? 'non_inventory_items' : 'products');

// Échappe les jokers de LIKE pour une comparaison insensible à la casse exacte
const escapeLike = (value) => String(value).replace(/[\\%_]/g, (c) => `\\${c}`);

const fail = (message, status = 400, details) =>
  NextResponse.json({ success: false, error: message, ...(details ? { details } : {}) }, { status });

/**
 * Retrouve LA fiche visée. products: clé primaire product_id.
 * non_inventory_items: clé primaire id (le même code peut y exister 2 fois).
 */
async function findTarget(source, code, id) {
  const table = tableFor(source);
  let query = supabaseAdmin.from(table).select('*');
  if (source === 'non_inventory' && id != null && id !== '') {
    query = query.eq('id', id);
  } else {
    query = query.eq('product_id', code);
  }
  const { data, error } = await query;
  if (error) throw error;
  return { table, rows: data || [] };
}

/** Autres fiches portant le même code (insensible à la casse), dans les 2 tables. */
async function findTwins(source, target) {
  const code = (target.product_id || '').trim();
  const pattern = escapeLike(code);
  const [prod, nonInv] = await Promise.all([
    supabaseAdmin.from('products')
      .select('product_id, description, stock_qty, cost_price, selling_price')
      .ilike('product_id', pattern),
    supabaseAdmin.from('non_inventory_items')
      .select('id, product_id, description, stock_qty, cost_price, selling_price')
      .ilike('product_id', pattern),
  ]);
  if (prod.error) throw prod.error;
  if (nonInv.error) throw nonInv.error;

  const twins = [];
  for (const p of prod.data || []) {
    if (source === 'products' && p.product_id === target.product_id) continue;
    twins.push({ ...p, _source: 'products' });
  }
  for (const n of nonInv.data || []) {
    if (source === 'non_inventory' && n.id === target.id) continue;
    twins.push({ ...n, _source: 'non_inventory' });
  }
  return twins;
}

/** Nombre de lignes distinctes d'une table de matériaux qui citent ce code. */
async function countMaterialLines(table, code) {
  const [byId, byCode] = await Promise.all([
    supabaseAdmin.from(table).select('id').eq('product_id', code).limit(1000),
    supabaseAdmin.from(table).select('id').eq('product_code', code).limit(1000),
  ]);
  if (byId.error) throw byId.error;
  if (byCode.error) throw byCode.error;
  return new Set([...(byId.data || []), ...(byCode.data || [])].map((r) => r.id)).size;
}

async function countRows(table, column, code, extra) {
  let query = supabaseAdmin.from(table).select('*', { count: 'exact', head: true }).eq(column, code);
  if (extra) query = extra(query);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

// Une table secondaire absente (migration non passée) ne doit pas bloquer la vérification
async function safeCount(fn) {
  try {
    return await fn();
  } catch (e) {
    console.error('Vérification suppression produit (table secondaire):', e.message || e);
    return 0;
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source') === 'non_inventory' ? 'non_inventory' : 'products';
    const code = searchParams.get('code') || '';
    const id = searchParams.get('id');

    if (!code) return fail('Code du produit requis.');

    const { rows } = await findTarget(source, code, id);
    if (rows.length === 0) return fail(`Produit « ${code} » introuvable.`, 404);
    if (rows.length > 1) {
      return fail(`Plusieurs fiches portent le code « ${code} »: impossible de savoir laquelle vérifier.`, 409);
    }
    const target = rows[0];
    const exactCode = target.product_id;

    const [movementsRes, twins, workOrders, deliveryNotes, poItems, associations, toOrder] = await Promise.all([
      supabaseAdmin.from('inventory_movements')
        .select('*', { count: 'exact' })
        .eq('product_id', exactCode)
        .order('created_at', { ascending: false })
        .limit(MOVEMENTS_LIMIT),
      findTwins(source, target),
      countMaterialLines('work_order_materials', exactCode),
      countMaterialLines('delivery_note_materials', exactCode),
      safeCount(() => countRows('client_po_items', 'product_id', exactCode)),
      safeCount(async () =>
        (await countRows('product_associations', 'parent_code', exactCode)) +
        (await countRows('product_associations', 'child_code', exactCode))),
      safeCount(() => countRows('items_to_order', 'product_code', exactCode, (q) => q.eq('status', 'pending'))),
    ]);
    if (movementsRes.error) throw movementsRes.error;

    const movements = movementsRes.data || [];
    const hasPriceHistory = PRICE_HISTORY_FIELDS.some((f) => target[f] != null);

    return NextResponse.json({
      success: true,
      data: {
        product: { ...target, _source: source },
        movements,
        movements_total: movementsRes.count ?? movements.length,
        has_price_history: hasPriceHistory,
        twins,
        usage: {
          work_order_lines: workOrders,
          delivery_note_lines: deliveryNotes,
          purchase_order_lines: poItems,
          associations,
          items_to_order_pending: toOrder,
        },
      },
    });
  } catch (error) {
    console.error('Erreur vérification suppression produit:', error);
    return fail('Erreur lors de la vérification du produit.', 500, error.message);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const source = body.source === 'non_inventory' ? 'non_inventory' : 'products';
    const code = body.code || '';
    const id = body.id;

    if (!code) return fail('Code du produit requis.');

    const { table, rows } = await findTarget(source, code, id);
    if (rows.length === 0) return fail(`Produit « ${code} » introuvable (déjà supprimé?).`, 404);
    if (rows.length > 1) {
      return fail(`Plusieurs fiches portent le code « ${code} »: aucune n'a été supprimée.`, 409);
    }
    const target = rows[0];

    // Doublons restants calculés AVANT la suppression (décide du sort des liens « As »)
    const twins = await findTwins(source, target);

    let del = supabaseAdmin.from(table).delete();
    del = source === 'non_inventory' && target.id != null
      ? del.eq('id', target.id)
      : del.eq('product_id', target.product_id);
    const { data: deleted, error: delErr } = await del.select('product_id');
    if (delErr) throw delErr;
    if (!deleted || deleted.length === 0) {
      return fail('Aucune fiche supprimée (la base a refusé la suppression).', 500);
    }

    // Plus aucune fiche avec ce code → les liens « As » pointeraient dans le vide
    let associationsRemoved = 0;
    if (twins.length === 0) {
      for (const col of ['parent_code', 'child_code']) {
        try {
          const { data, error } = await supabaseAdmin
            .from('product_associations')
            .delete()
            .eq(col, target.product_id)
            .select('id');
          if (error) console.error(`Nettoyage product_associations.${col}:`, error.message);
          else associationsRemoved += (data || []).length;
        } catch (e) {
          console.error(`Nettoyage product_associations.${col} (exception):`, e);
        }
      }
    }

    console.log(`🗑️ Produit supprimé: ${target.product_id} (${table}) — ${target.description || ''}`);

    return NextResponse.json({
      success: true,
      data: {
        deleted: { product_id: target.product_id, id: target.id ?? null, _source: source },
        twins_remaining: twins.length,
        associations_removed: associationsRemoved,
      },
    });
  } catch (error) {
    console.error('Erreur suppression produit:', error);
    return fail('Erreur lors de la suppression du produit.', 500, error.message);
  }
}
