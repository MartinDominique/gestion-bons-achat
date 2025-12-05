import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(request) {
  // Vérifier l'autorisation
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    // Chercher tous les BTs avec time_entries
    const { data, error } = await supabase
      .from('work_orders')
      .select('id, bt_number, time_entries, clients(name)')
      .not('time_entries', 'is', null);

    if (error) throw error;

    const now = new Date();
    const alertsSent = [];

    for (const wo of data || []) {
      const entries = wo.time_entries || [];
      const inProgress = entries.find(e => e.in_progress === true);
      
      if (inProgress) {
        // Calculer la durée
        const sessionDate = inProgress.date || now.toISOString().split('T')[0];
        const startDateTime = new Date(`${sessionDate}T${inProgress.start_time}:00`);
        
        const durationMs = now - startDateTime;
        const durationHours = durationMs / (1000 * 60 * 60);

        if (durationHours >= 8) {
          const durationFormatted = `${Math.floor(durationHours)}h ${Math.round((durationHours % 1) * 60)}min`;
          
          // Envoyer alerte email
          await resend.emails.send({
            from: 'noreply@servicestmt.ca',
            to: 'servicestmt@gmail.com',
            subject: `⚠️ Session > 8h - ${wo.clients?.name || 'Client'} - ${wo.bt_number}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #dc2626;">⚠️ Alerte: Session de travail prolongée</h2>
                <p>Une session de travail est en cours depuis plus de 8 heures.</p>
                
                <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 8px 0;"><strong>Client:</strong> ${wo.clients?.name || 'Non spécifié'}</p>
                  <p style="margin: 8px 0;"><strong>Bon de travail:</strong> ${wo.bt_number}</p>
                  <p style="margin: 8px 0;"><strong>Date:</strong> ${sessionDate}</p>
                  <p style="margin: 8px 0;"><strong>Punch-in:</strong> ${inProgress.start_time}</p>
                  <p style="margin: 8px 0;"><strong>Durée actuelle:</strong> <span style="color: #dc2626; font-weight: bold;">${durationFormatted}</span></p>
                </div>
                
                <p style="color: #6b7280;">Veuillez vérifier si cette session doit être terminée.</p>
              </div>
            `
          });

          alertsSent.push({
            bt_number: wo.bt_number,
            client: wo.clients?.name,
            duration: durationFormatted
          });
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      sessionsChecked: data?.length || 0,
      alertsSent,
      checkedAt: now.toISOString()
    });

  } catch (error) {
    console.error('Erreur cron check-long-sessions:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
