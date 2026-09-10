/**
 * @file lib/services/product-associations.js
 * @description Helpers serveur partagés par les routes « items associés »:
 *              - normalizeCode(): code produit nettoyé (trim + majuscules)
 *              - lookupProducts(codes): fiche produit par code, cherchée dans
 *                products PUIS non_inventory_items (2 requêtes .in() au total).
 *                Renvoie un objet { CODE: { product_id, description, unit, cost_price,
 *                selling_price, stock_qty, product_group, supplier, is_inventory, _source } }.
 * @version 1.0.0
 * @date 2026-09-10
 * @changelog
 *   1.0.0 - Version initiale (Items associés MVP)
 */

import { supabaseAdmin } from '../supabaseAdmin';

export function normalizeCode(code) {
  if (code == null) return '';
  return String(code).trim().toUpperCase();
}

const PRODUCT_COLS =
  'product_id, description, unit, cost_price, selling_price, stock_qty, product_group, supplier, purchase_currency, cost_price_usd';
const NON_INV_COLS =
  'product_id, description, unit, cost_price, selling_price, stock_qty, product_group';

function shape(row, source) {
  const isInventory = source === 'products';
  return {
    id: row.product_id,
    product_id: row.product_id,
    description: row.description || '',
    unit: row.unit || 'UN',
    cost_price: row.cost_price != null ? parseFloat(row.cost_price) : 0,
    selling_price: row.selling_price != null ? parseFloat(row.selling_price) : 0,
    stock_qty: row.stock_qty != null ? parseFloat(row.stock_qty) : 0,
    product_group: row.product_group || (isInventory ? null : 'Non-Inventaire'),
    supplier: row.supplier || null,
    purchase_currency: row.purchase_currency || 'CAD',
    cost_price_usd: row.cost_price_usd != null ? parseFloat(row.cost_price_usd) : null,
    is_inventory: isInventory,
    is_non_inventory: !isInventory,
    _source: source,
  };
}

export async function lookupProducts(codes) {
  const map = {};
  const wanted = [...new Set((codes || []).map(normalizeCode).filter(Boolean))];
  if (wanted.length === 0) return map;

  const { data: prods, error: e1 } = await supabaseAdmin
    .from('products')
    .select(PRODUCT_COLS)
    .in('product_id', wanted);
  if (e1) throw e1;
  (prods || []).forEach((p) => { map[normalizeCode(p.product_id)] = shape(p, 'products'); });

  const missing = wanted.filter((c) => !map[c]);
  if (missing.length > 0) {
    const { data: nonInv, error: e2 } = await supabaseAdmin
      .from('non_inventory_items')
      .select(NON_INV_COLS)
      .in('product_id', missing);
    if (e2) throw e2;
    (nonInv || []).forEach((p) => {
      const key = normalizeCode(p.product_id);
      if (!map[key]) map[key] = shape(p, 'non_inventory');
    });
  }

  return map;
}
