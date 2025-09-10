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

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Erreur récupération clients:', error);
    return NextResponse.json(
      { error: 'Erreur récupération clients' },
      { status: 500 }
    );
  }
}
