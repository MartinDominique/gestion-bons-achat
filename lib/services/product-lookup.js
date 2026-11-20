/**
 * @file lib/services/product-lookup.js
 * @description Localise la fiche d'un produit par son code, côté serveur (supabaseAdmin)
 *              - Cherche dans `products` puis dans `non_inventory_items`
 *              - Règle (Martin, 2026-11-20): un produit « non-inventaire » est un produit comme
 *                un autre (créé à la volée depuis un BT/BL/Soumission/AF). Son stock se gère
 *                exactement comme celui d'un produit « inventaire ». Ne JAMAIS choisir la table
 *                d'après un drapeau (`is_non_inventory`, product_group) porté par une ligne de
 *                document: passer par findProductRow().
 * @version 1.0.0
 * @date 2026-11-20
 * @changelog
 *   1.0.0 - Version initiale
 */
import { supabaseAdmin } from '../supabaseAdmin';

export const PRODUCT_TABLES = ['products', 'non_inventory_items'];

/**
 * @param {string} code     product_id (code produit)
 * @param {string} columns  colonnes à lire
 * @returns {Promise<{table: string, row: object} | null>}
 */
export async function findProductRow(code, columns = 'product_id, stock_qty') {
  const key = String(code ?? '').trim();
  if (!key) return null;
  for (const table of PRODUCT_TABLES) {
    // limit(1) plutôt que single(): un même code peut exister 2 fois dans non_inventory_items
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(columns)
      .eq('product_id', key)
      .limit(1);
    if (error) {
      console.error(`findProductRow(${key}) — ${table}:`, error.message);
      continue;
    }
    if (data && data.length > 0) return { table, row: data[0] };
  }
  return null;
}
