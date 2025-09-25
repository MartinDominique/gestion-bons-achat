import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '../../../lib/supabaseAdmin';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '0');
    const limit = parseInt(searchParams.get('limit') || '1000');
    const search = searchParams.get('search') || '';

    let query = supabase
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
      query = query.or(`description.ilike.%${search}%,product_id.ilike.%${search}%,product_group.ilike.%${search}%`);
    }

    // Tri par description
    query = query.order('description', { ascending: true });

    // Pagination
    if (page > 0 || limit < 1000) {
      const from = page * limit;
      const to = from + limit - 1;
      query = query.range(from, to);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Erreur Supabase:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Format compatible avec MaterialSelector
    const formattedData = data?.map(product => ({
      id: product.product_id, // Utilise product_id comme id
      name: product.description,
      category: product.product_group || 'Divers',
      unit: product.unit || 'unité',
      price: product.selling_price || 0,
      cost_price: product.cost_price || 0,
      stock_qty: product.stock_qty || 0,
      description: product.description
    })) || [];

    // Retourner directement l'array pour compatibilité MaterialSelector
    return NextResponse.json(formattedData);

  } catch (error) {
    console.error('Erreur API products:', error);
    return NextResponse.json({ 
      error: 'Erreur serveur lors du chargement des produits' 
    }, { status: 500 });
  }
}
