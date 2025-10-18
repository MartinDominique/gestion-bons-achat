//gestion-bons-achat/app/api/save-client/route.js
import { supabaseAdmin as supabase } from '../../../lib/supabaseAdmin';

export async function POST(req) {
  const body = await req.json();
  
  // ✅ Capturer "data" en plus de "error"
  const { data, error } = await supabase
    .from('clients')
    .upsert(body, { onConflict: 'id' })  // Si id existe, update, sinon insert
    .select()
    .single();  // ✅ Retourne UN objet au lieu d'un array
  
  if (error) {
    console.error('❌ Erreur save client:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  
  console.log('✅ Client sauvegardé:', data);
  
  // ✅ Retourner le client créé/modifié
  return Response.json({ 
    ok: true, 
    client: data  // ✅ AJOUT ICI
  });
}
