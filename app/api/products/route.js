import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '../../../lib/supabaseAdmin';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '0');
    const limit = parseInt(searchParams.get('limit') || '1000');
    const search = searchParams.get('search') || '';

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

    // Recherche par description, product_id et product_group (comme SoumissionsManager)
    if (search) {
      queryProducts = queryProducts.or(`description.ilike.%${search}%,product_id.ilike.%${search}%,product_group.ilike.%${search}%`);
    }

    // Tri par description
    queryProducts = queryProducts.order('description', { ascending: true });

    // Charger aussi les produits NON-INVENTAIRE
    let queryNonInventory = supabase
      .from('non_inventory_items')
      .select(`
        product_id,
        description,
        unit
      `);

    if (search) {
      queryNonInventory = queryNonInventory.or(`description.ilike.%${search}%,product_id.ilike.%${search}%`);
    }

    queryNonInventory = queryNonInventory.order('description', { ascending: true });

    // Exécuter les deux requêtes en parallèle
    const [productsResult, nonInventoryResult] = await Promise.all([
      queryProducts,
      queryNonInventory
    ]);

    const { data, error } = productsResult;

    if (error) {
      console.error('Erreur Supabase:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Format produits INVENTAIRE
    const inventoryProducts = data?.map(product => ({
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

    // Format produits NON-INVENTAIRE
    const nonInventoryProducts = nonInventoryResult.data?.map(item => ({
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

    // FUSIONNER et trier
    const allProducts = [...inventoryProducts, ...nonInventoryProducts]
      .sort((a, b) => a.description.localeCompare(b.description));

    // Pagination sur l'ensemble
    let finalData = allProducts;
    if (page > 0 || limit < 1000) {
      const from = page * limit;
      const to = from + limit;
      finalData = allProducts.slice(from, to);
    }

    return NextResponse.json(finalData);

  } catch (error) {
    console.error('Erreur API products:', error);
    return NextResponse.json({ 
      error: 'Erreur serveur lors du chargement des produits' 
    }, { status: 500 });
  }
}
