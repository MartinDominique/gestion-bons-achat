/**
 * @file app/api/products/duplicates/route.js
 * @description Détection des doublons de l'Inventaire: fiches dont les CODES se ressemblent.
 *              Deux codes « se ressemblent » s'ils sont identiques une fois normalisés
 *              (casse, accents, tirets, espaces, points et autres symboles ignorés):
 *              « P1-540 » = « p1540 » = « P1 540 ». Couvre aussi le même code présent à la
 *              fois dans products et non_inventory_items, ou 2 fois dans non_inventory_items.
 *              - GET → { groups: [{ key, items: [fiche complète + _source] }], total_items }
 *              Lecture paginée (codes seulement), puis fiches complètes des seuls doublons.
 * @version 1.0.0
 * @date 2026-11-19
 * @changelog
 *   1.0.0 - Version initiale
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { normalizeSearchKey } from '../../../../lib/utils/productSearch';

export const dynamic = 'force-dynamic';

const PAGE = 1000;

async function fetchAllCodes(table, columns, orderColumn) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(columns)
      .order(orderColumn, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function fetchFullRows(table, column, values) {
  const rows = [];
  for (let i = 0; i < values.length; i += 100) {
    const { data, error } = await supabaseAdmin.from(table).select('*').in(column, values.slice(i, i + 100));
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
  }
  return rows;
}

export async function GET() {
  try {
    const [products, nonInv] = await Promise.all([
      fetchAllCodes('products', 'product_id', 'product_id'),
      fetchAllCodes('non_inventory_items', 'id, product_id', 'id'),
    ]);

    // Regrouper par code normalisé
    const byKey = new Map();
    const add = (key, ref) => {
      if (!key) return;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(ref);
    };
    for (const p of products) add(normalizeSearchKey(p.product_id), { source: 'products', code: p.product_id });
    for (const n of nonInv) add(normalizeSearchKey(n.product_id), { source: 'non_inventory', id: n.id });

    const dupKeys = [...byKey.entries()].filter(([, refs]) => refs.length > 1);
    const productCodes = [];
    const nonInvIds = [];
    for (const [, refs] of dupKeys) {
      for (const ref of refs) {
        if (ref.source === 'products') productCodes.push(ref.code);
        else nonInvIds.push(ref.id);
      }
    }

    const [fullProducts, fullNonInv] = await Promise.all([
      productCodes.length ? fetchFullRows('products', 'product_id', productCodes) : [],
      nonInvIds.length ? fetchFullRows('non_inventory_items', 'id', nonInvIds) : [],
    ]);

    const groupsMap = new Map();
    const push = (row, source) => {
      const key = normalizeSearchKey(row.product_id);
      if (!groupsMap.has(key)) groupsMap.set(key, []);
      groupsMap.get(key).push({ ...row, _source: source });
    };
    fullProducts.forEach((row) => push(row, 'products'));
    fullNonInv.forEach((row) => push(row, 'non_inventory'));

    const groups = [...groupsMap.entries()]
      .filter(([, items]) => items.length > 1)
      .map(([key, items]) => ({ key, items }))
      .sort((a, b) => a.key.localeCompare(b.key));

    return NextResponse.json(
      { success: true, data: { groups, total_items: groups.reduce((sum, g) => sum + g.items.length, 0) } },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Erreur détection doublons:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur lors de la recherche des doublons.', details: error.message },
      { status: 500 }
    );
  }
}
