/**
 * @file app/api/products/route.js
 * @description API GET produits (inventaire + non-inventaire) pour la recherche de matériaux (BT/BL)
 *              - Mode inventory_only: produits de la table products (paginé)
 *              - Mode non_inventory_only: produits de la table non_inventory_items
 * @version 1.2.0
 * @date 2026-08-27
 * @changelog
 *   1.2.0 - Recherche tolérante: « p1540 » trouve « P1-540 » (tirets/accents ignorés)
 *   1.1.0 - Fix: lire le vrai stock_qty (et prix) des items non-inventaire au lieu de forcer 0.
 *           Un item non-inventaire réceptionné affichait "Stock: 0" dans la recherche BT/BL
 *           alors que la page Inventaire (select *) montrait la vraie quantité.
 *   1.0.0 - Version initiale
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '../../../lib/supabaseAdmin';
import { searchWithFallback } from '../../../lib/utils/productSearch';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '0');
    const limit = parseInt(searchParams.get('limit') || '1000');
    const search = searchParams.get('search') || '';
    const inventoryOnly = searchParams.get('inventory_only') === 'true';
    const nonInventoryOnly = searchParams.get('non_inventory_only') === 'true';

    // ========================================
    // MODE 1: SEULEMENT NON-INVENTAIRE
    // ========================================
    if (nonInventoryOnly) {
      // Recherche tolérante: « p1540 » trouve « P1-540 » (tirets/accents ignorés)
      const buildNonInventoryQuery = (orFilter) => {
        let q = supabase
          .from('non_inventory_items')
          .select(`product_id, description, unit, stock_qty, cost_price, selling_price`);
        if (orFilter) q = q.or(orFilter);
        return q.order('description', { ascending: true });
      };

      const { data, error } = search
        ? await searchWithFallback(buildNonInventoryQuery, search, ['description', 'product_id'])
        : await buildNonInventoryQuery(null);

      if (error) {
        console.error('Erreur non_inventory_items:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const formatted = data?.map(item => ({
        id: item.product_id,
        product_id: item.product_id,
        name: item.description,
        description: item.description,
        category: 'Non-Inventaire',
        product_group: 'Non-Inventaire',
        unit: item.unit || 'unité',
        price: item.selling_price || 0,
        cost_price: item.cost_price || 0,
        selling_price: item.selling_price || 0,
        stock_qty: item.stock_qty || 0,
        is_inventory: false
      })) || [];

      return NextResponse.json(formatted);
    }

    // ========================================
    // MODE 2: SEULEMENT INVENTAIRE (avec pagination)
    // ========================================
    // Recherche tolérante: « p1540 » trouve « P1-540 » (tirets/accents ignorés)
    const buildProductsQuery = (orFilter) => {
      let q = supabase
        .from('products')
        .select(`
          product_id,
          description,
          unit,
          selling_price,
          cost_price,
          stock_qty,
          product_group
        `);

      if (orFilter) q = q.or(orFilter);

      q = q.order('description', { ascending: true });

      // Pagination
      if (page > 0 || limit < 1000) {
        const from = page * limit;
        const to = from + limit - 1;
        q = q.range(from, to);
      }

      return q;
    };

    const { data, error } = search
      ? await searchWithFallback(buildProductsQuery, search, ['description', 'product_id', 'product_group'])
      : await buildProductsQuery(null);

    if (error) {
      console.error('Erreur products:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const formatted = data?.map(product => ({
      id: product.product_id,
      product_id: product.product_id,
      name: product.description,
      description: product.description,
      category: product.product_group || 'Divers',
      product_group: product.product_group,
      unit: product.unit || 'unité',
      price: product.selling_price || 0,
      cost_price: product.cost_price || 0,
      selling_price: product.selling_price || 0,
      stock_qty: product.stock_qty || 0,
      is_inventory: true
    })) || [];

    return NextResponse.json(formatted);

  } catch (error) {
    console.error('Erreur API products:', error);
    return NextResponse.json({ 
      error: 'Erreur serveur lors du chargement des produits' 
    }, { status: 500 });
  }
}
