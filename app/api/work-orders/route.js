import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase';

export async function POST(request) {
  try {
    console.log('=== DÉBUT POST API ===');
    
    const body = await request.json();
    console.log('Body reçu:', JSON.stringify(body, null, 2));
    
    const supabase = createClient();
    console.log('Supabase client créé');
    
    // Test simple d'abord - juste insérer le minimum
    const testData = {
      client_id: parseInt(body.client_id),
      work_date: body.work_date,
      work_description: body.work_description || 'Test description',
      user_id: '00000000-0000-0000-0000-000000000000',
      status: 'draft'
    };
    
    console.log('Test data:', JSON.stringify(testData, null, 2));
    
    const { data, error } = await supabase
      .from('work_orders')
      .insert([testData])
      .select()
      .single();
    
    console.log('Résultat insert:', { data, error });
    
    if (error) {
      console.error('Erreur Supabase:', error);
      return NextResponse.json(
        { error: `Erreur DB: ${error.message}`, details: error },
        { status: 500 }
      );
    }
    
    console.log('=== SUCCÈS ===');
    return NextResponse.json({ success: true, data });
    
  } catch (error) {
    console.error('Erreur complète:', error);
    return NextResponse.json(
      { error: `Erreur serveur: ${error.message}`, stack: error.stack },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ message: 'API Work Orders actif' });
}
