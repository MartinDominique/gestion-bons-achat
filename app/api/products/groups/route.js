/**
 * @file app/api/products/groups/route.js
 * @description API pour récupérer les groupes de produits distincts
 *              - Combine les groupes de products et non_inventory_items
 *              - Retourne une liste triée alphabétiquement
 * @version 1.0.0
 * @date 2026-02-12
 * @changelog
 *   1.0.0 - Version initiale
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '../../../../lib/supabaseAdmin';

export async function GET() {
  try {
    // Récupérer les groupes distincts des products
    const { data: productGroups, error: pgError } = await supabase
      .from('products')
      .select('product_group')
      .not('product_group', 'is', null)
      .not('product_group', 'eq', '');

    if (pgError) {
      console.error('Erreur groups products:', pgError);
      return NextResponse.json(
        { success: false, error: pgError.message },
        { status: 500 }
      );
    }

    // Récupérer les groupes distincts des non_inventory_items
    const { data: nonInvGroups, error: niError } = await supabase
      .from('non_inventory_items')
      .select('product_group')
      .not('product_group', 'is', null)
      .not('product_group', 'eq', '');

    if (niError) {
      console.error('Erreur groups non_inventory:', niError);
      return NextResponse.json(
        { success: false, error: niError.message },
        { status: 500 }
      );
    }

    // Combiner et dédupliquer
    const allGroups = new Set();
    (productGroups || []).forEach(row => {
      if (row.product_group && row.product_group.trim()) {
        allGroups.add(row.product_group.trim());
      }
    });
    (nonInvGroups || []).forEach(row => {
      if (row.product_group && row.product_group.trim()) {
        allGroups.add(row.product_group.trim());
      }
    });

    const sortedGroups = [...allGroups].sort((a, b) => a.localeCompare(b, 'fr-CA'));

    return NextResponse.json({
      success: true,
      data: sortedGroups,
      total: sortedGroups.length,
    });

  } catch (error) {
    console.error('Erreur API products/groups:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur serveur lors du chargement des groupes' },
      { status: 500 }
    );
  }
}
