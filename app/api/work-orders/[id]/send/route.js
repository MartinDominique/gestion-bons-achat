// CORRIGÉ: Chemin avec un niveau de plus
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';

export async function POST(request, { params }) {
  try {
    const { status } = await request.json();
    
    // Mettre à jour le statut
    const { data, error } = await supabaseAdmin
      .from('work_orders')
      .update({
        status,
        sent_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    // TODO: Ici tu peux ajouter l'envoi d'email avec Resend
    // const emailResult = await sendWorkOrderEmail(data);

    return Response.json({ success: true, data });
  } catch (error) {
    console.error('Erreur envoi BT:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
