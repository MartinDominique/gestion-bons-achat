///////////////////////////////////////////
//app/api/clients/route.js
/////////////////////////////////////////

import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase';

export async function GET() {
  try {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      throw error;
    }

    // ⭐ AJOUTER ces headers pour désactiver le cache:
    return NextResponse.json(data || [], {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache'
      }
    });

  } catch (error) {
    console.error('Erreur récupération clients:', error);
    return NextResponse.json(
      { error: 'Erreur récupération clients' },
      { status: 500 }
    );
  }
}
