/**
 * @file app/api/delivery-notes/[id]/signature/route.js
 * @description API pour sauvegarder la signature client sur un BL
 * @version 1.0.0
 * @date 2026-02-12
 * @changelog
 *   1.0.0 - Version initiale
 */

import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';

export async function POST(request, { params }) {
  try {
    const { signature_data, client_signature_name, status } = await request.json();

    const { data, error } = await supabaseAdmin
      .from('delivery_notes')
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
    console.error('Erreur sauvegarde signature BL:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
