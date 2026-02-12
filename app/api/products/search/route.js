/**
 * @file app/api/products/search/route.js
 * @description API de recherche serveur pour l'inventaire
 *              - Recherche dans products ET non_inventory_items
 *              - Recherche par product_id et description avec .ilike()
 *              - Max 50 résultats combinés (25 par table)
 *              - Support filtre par product_group
 *              - Mode "load all" pour charger tous les produits
 *              - Mode "load by group" pour charger un groupe spécifique
 * @version 1.0.0
 * @date 2026-02-12
 * @changelog
 *   1.0.0 - Version initiale — recherche serveur inventaire
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '../../../../lib/supabaseAdmin';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const group = searchParams.get('group') || '';
    const mode = searchParams.get('mode') || 'search'; // 'search', 'all', 'group'
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);

    // ========================================
    // MODE RECHERCHE (défaut) — 2+ caractères requis
    // ========================================
    if (mode === 'search') {
      if (search.length < 2) {
        return NextResponse.json({ success: true, data: [], total: 0 });
      }

      const searchPattern = `%${search}%`;

      // Recherche dans products (max 25)
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('*')
        .or(`product_id.ilike.${searchPattern},description.ilike.${searchPattern}`)
        .order('product_id', { ascending: true })
        .limit(25);

      if (productsError) {
        console.error('Erreur recherche products:', productsError);
        return NextResponse.json(
          { success: false, error: productsError.message },
          { status: 500 }
        );
      }

      // Recherche dans non_inventory_items (max 25)
      const { data: nonInvData, error: nonInvError } = await supabase
        .from('non_inventory_items')
        .select('*')
        .or(`product_id.ilike.${searchPattern},description.ilike.${searchPattern}`)
        .order('product_id', { ascending: true })
        .limit(25);

      if (nonInvError) {
        console.error('Erreur recherche non_inventory_items:', nonInvError);
        return NextResponse.json(
          { success: false, error: nonInvError.message },
          { status: 500 }
        );
      }

      // Combiner avec tag source
      const results = [
        ...(productsData || []).map(p => ({ ...p, _source: 'products' })),
        ...(nonInvData || []).map(p => ({ ...p, _source: 'non_inventory' })),
      ];

      return NextResponse.json({
        success: true,
        data: results,
        total: results.length,
      });
    }

    // ========================================
    // MODE CHARGER TOUT
    // ========================================
    if (mode === 'all') {
      // Charger products par pagination
      const allProducts = [];
      let page = 0;
      const pageSize = 1000;

      while (true) {
        const { data: batch, error } = await supabase
          .from('products')
          .select('*')
          .range(page * pageSize, (page + 1) * pageSize - 1)
          .order('product_id', { ascending: true });

        if (error) {
          return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
          );
        }
        if (!batch || batch.length === 0) break;
        allProducts.push(...batch);
        if (batch.length < pageSize) break;
        page++;
      }

      // Charger non_inventory_items
      const { data: nonInvData, error: nonInvError } = await supabase
        .from('non_inventory_items')
        .select('*')
        .order('product_id', { ascending: true });

      if (nonInvError) {
        return NextResponse.json(
          { success: false, error: nonInvError.message },
          { status: 500 }
        );
      }

      const results = [
        ...allProducts.map(p => ({ ...p, _source: 'products' })),
        ...(nonInvData || []).map(p => ({ ...p, _source: 'non_inventory' })),
      ];

      return NextResponse.json({
        success: true,
        data: results,
        total: results.length,
      });
    }

    // ========================================
    // MODE CHARGER PAR GROUPE
    // ========================================
    if (mode === 'group' && group) {
      // Charger products du groupe
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('*')
        .eq('product_group', group)
        .order('product_id', { ascending: true });

      if (productsError) {
        return NextResponse.json(
          { success: false, error: productsError.message },
          { status: 500 }
        );
      }

      // Charger non_inventory_items du groupe
      const { data: nonInvData, error: nonInvError } = await supabase
        .from('non_inventory_items')
        .select('*')
        .eq('product_group', group)
        .order('product_id', { ascending: true });

      if (nonInvError) {
        return NextResponse.json(
          { success: false, error: nonInvError.message },
          { status: 500 }
        );
      }

      const results = [
        ...(productsData || []).map(p => ({ ...p, _source: 'products' })),
        ...(nonInvData || []).map(p => ({ ...p, _source: 'non_inventory' })),
      ];

      return NextResponse.json({
        success: true,
        data: results,
        total: results.length,
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Paramètres invalides. Utilisez mode=search|all|group',
    }, { status: 400 });

  } catch (error) {
    console.error('Erreur API products/search:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur serveur lors de la recherche' },
      { status: 500 }
    );
  }
}
