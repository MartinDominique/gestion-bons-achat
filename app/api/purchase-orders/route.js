// /app/api/purchase-orders/route.js
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const client_id = searchParams.get('client_id');
    
    let query = supabaseAdmin
      .from('purchase_orders')
      .select('id, po_number, status, total_amount, client_id, created_at')
      .order('created_at', { ascending: false });
    
    // Si client_id spécifié, filtrer par client
    if (client_id) {
      query = query.eq('client_id', parseInt(client_id));
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Erreur lecture purchase_orders:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }
    
    return Response.json(data || []);
    
  } catch (error) {
    console.error('Erreur API purchase-orders:', error);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
