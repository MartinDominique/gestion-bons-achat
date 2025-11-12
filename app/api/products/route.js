import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '../../../lib/supabaseAdmin';

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
      let queryNonInventory = supabase
        .from('non_inventory_items')
        .select(`product_id, description, unit`);

      if (search) {
        queryNonInventory = queryNonInventory.or(`description.ilike.%${search}%,product_id.ilike.%${search}%`);
      }

      queryNonInventory = queryNonInventory.order('description', { ascending: true });

      const { data, error } = await queryNonInventory;

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
        price: 0,
        cost_price: 0,
        selling_price: 0,
        stock_qty: 0,
        is_inventory: false
      })) || [];

      return NextResponse.json(formatted);
    }

    // ========================================
    // MODE 2: SEULEMENT INVENTAIRE (avec pagination)
    // ========================================
    let queryProducts = supabase
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

    if (search) {
      queryProducts = queryProducts.or(`description.ilike.%${search}%,product_id.ilike.%${search}%,product_group.ilike.%${search}%`);
    }

    queryProducts = queryProducts.order('description', { ascending: true });
    
    // Pagination
    if (page > 0 || limit < 1000) {
      const from = page * limit;
      const to = from + limit - 1;
      queryProducts = queryProducts.range(from, to);
    }

    const { data, error } = await queryProducts;

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
