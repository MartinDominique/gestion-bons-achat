import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase';

// POST - Création d'un bon de travail
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
      additional_notes: body.additional_notes || null,
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

// GET - Liste des bons de travail
export async function GET(request) {
  try {
    console.log('=== API GET APPELÉE ===');
    
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    
    // Construction de la requête de base
    let query = supabase
      .from('work_orders')
      .select(`
        *,
        client:clients(*)
      `)
      .order('created_at', { ascending: false });

    // Filtres optionnels
    const status = searchParams.get('status');
    const clientId = searchParams.get('client_id');
    const searchQuery = searchParams.get('q');

    if (status) {
      query = query.eq('status', status);
    }

    if (clientId) {
      query = query.eq('client_id', parseInt(clientId));
    }

    if (searchQuery) {
      query = query.or(`
        bt_number.ilike.%${searchQuery}%,
        work_description.ilike.%${searchQuery}%
      `);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erreur GET Supabase:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('Bons de travail trouvés:', data?.length || 0);
    return NextResponse.json(data || []);
    
  } catch (error) {
    console.error('Erreur GET catch:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT - Mise à jour d'un bon de travail
export async function PUT(request) {
  try {
    console.log('=== API PUT APPELÉE ===');
    
    const body = await request.json();
    const { id, materials, ...workOrderData } = body;
    
    console.log('Mise à jour BT ID:', id);
    
    const supabase = createClient();

    // Mettre à jour le bon de travail
    const { data: workOrder, error: woError } = await supabase
      .from('work_orders')
      .update(workOrderData)
      .eq('id', id)
      .select()
      .single();

    if (woError) {
      console.error('Erreur PUT Supabase:', woError);
      return NextResponse.json({ error: woError.message }, { status: 500 });
    }

    console.log('BT mis à jour avec succès');
    return NextResponse.json(workOrder);
    
  } catch (error) {
    console.error('Erreur PUT catch:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Suppression d'un bon de travail
export async function DELETE(request) {
  try {
    console.log('=== API DELETE APPELÉE ===');
    
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'ID manquant' }, { status: 400 });
    }
    
    const supabase = createClient();

    const { error } = await supabase
      .from('work_orders')
      .delete()
      .eq('id', parseInt(id));

    if (error) {
      console.error('Erreur DELETE Supabase:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('BT supprimé avec succès, ID:', id);
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('Erreur DELETE catch:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
