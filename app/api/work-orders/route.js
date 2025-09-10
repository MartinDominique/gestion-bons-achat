import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase';

export async function POST(request) {
  try {
    console.log('=== API POST APPELÉE ===');
    
    const body = await request.json();
    console.log('1. Body reçu:', JSON.stringify(body, null, 2));
    
    const supabase = createClient();
    
    const dataToInsert = {
      client_id: parseInt(body.client_id),
      work_date: body.work_date,
      work_description: body.work_description,
      start_time: body.start_time || null,
      end_time: body.end_time || null,
      break_time: parseFloat(body.break_time) || 0.5,
      status: 'draft'
    };
    
    console.log('2. Données à insérer:', JSON.stringify(dataToInsert, null, 2));
    
    const { data, error } = await supabase
      .from('work_orders')
      .insert([dataToInsert])
      .select()
      .single();
    
    if (error) {
      console.error('Erreur Supabase:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    console.log('SUCCÈS! BT créé:', data);
    return NextResponse.json(data, { status: 201 });
    
  } catch (error) {
    console.error('Erreur catch:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ message: 'API Work Orders actif' });
}
