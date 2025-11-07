// ============================================
// app/api/work-orders/[id]/signature/route.js
//=============================================

import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';

export async function POST(request, { params }) {
  try {
    const { signature_data, client_signature_name, status } = await request.json();
    
    const { data, error } = await supabaseAdmin
      .from('work_orders')
      .update({
        signature_data,
        client_signature_name,
        signature_timestamp: new Date().toISOString(),
        status
      })
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return Response.json({ success: true, data });
  } catch (error) {
    console.error('Erreur sauvegarde signature:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
