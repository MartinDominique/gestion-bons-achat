import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET() {
  try {
    // Chercher un BT avec une session in_progress: true
    const { data, error } = await supabase
      .from('work_orders')
      .select('id, bt_number, client_id, time_entries, clients(name)')
      .not('time_entries', 'is', null);

    if (error) throw error;

    // Filtrer pour trouver une session in_progress
    let activeSession = null;
    
    for (const wo of data || []) {
      const entries = wo.time_entries || [];
      const inProgress = entries.find(e => e.in_progress === true);
      
      if (inProgress) {
        activeSession = {
          bt_id: wo.id,
          bt_number: wo.bt_number,
          client_name: wo.clients?.name || 'Client inconnu',
          start_time: inProgress.start_time,
          date: inProgress.date
        };
        break;
      }
    }

    return NextResponse.json({ 
      hasActiveSession: !!activeSession,
      activeSession 
    });

  } catch (error) {
    console.error('Erreur check-active-session:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
