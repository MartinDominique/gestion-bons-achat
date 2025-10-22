///////////////////////////////////////////
//app/api/clients/route.js
/////////////////////////////////////////

import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase';

// ⭐ CRITIQUE: Forcer Next.js à ne PAS cacher cette route
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET() {
  try {
    const supabase = createClient();
    
    // ⭐ AJOUT: Log pour diagnostiquer
    console.log('🔍 API /api/clients appelée à', new Date().toISOString());
    
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      throw error;
    }

    console.log(`✅ API retourne ${data?.length || 0} clients`);

    // ⭐ AJOUTER ces headers pour désactiver le cache:
    return NextResponse.json(data || [], {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
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
