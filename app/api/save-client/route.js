//gestion-bons-achat/app/api/save-client/route.js
import { supabaseAdmin as supabase } from '../../../lib/supabaseAdmin';

export async function POST(req) {
  const body = await req.json();

  // Capturer "data" en plus de "error"
  const { data, error } = await supabase
    .from('clients')
    .upsert(body, { onConflict: 'id' })  // Si id existe, update, sinon insert
    .select()
    .single();  // Retourne UN objet au lieu d'un array

  if (error) {
    console.error('❌ Erreur save client:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }

  console.log('✅ Client sauvegardé:', data);

  // Synchroniser client_name dans purchase_orders si le client existait deja
  if (data.id && data.name) {
    const { error: syncError } = await supabase
      .from('purchase_orders')
      .update({ client_name: data.name })
      .eq('client_id', data.id);

    if (syncError) {
      console.warn('⚠️ Sync purchase_orders.client_name échouée:', syncError.message);
    }
  }

  // Retourner le client créé/modifié
  return Response.json({
    success: true,
    client: data
  });
}
