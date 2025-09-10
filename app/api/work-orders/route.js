import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase';

// POST - Création d'un bon de travail (version simplifiée)
export async function POST(request) {
  try {
    const supabase = createClient();
    const body = await request.json();
    
    console.log('Données reçues:', body);

    const { materials, ...workOrderData } = body;

    // Pour tester, on utilise un user_id fixe ou on le récupère autrement
    // Vous devrez adapter selon votre auth
    const dataToInsert = {
      ...workOrderData,
      user_id: '00000000-0000-0000-0000-000000000000' // UUID temporaire pour test
    };

    console.log('Données à insérer:', dataToInsert);

    // Créer le bon de travail
    const { data: workOrder, error: woError } = await supabase
      .from('work_orders')
      .insert([dataToInsert])
      .select()
      .single();

    if (woError) {
      console.error('Erreur insertion:', woError);
      throw woError;
    }

    console.log('Bon de travail créé:', workOrder);

    return NextResponse.json(workOrder, { status: 201 });
  } catch (error) {
    console.error('Erreur POST work order complète:', error);
    return NextResponse.json(
      { error: 'Erreur création bon de travail: ' + error.message },
      { status: 500 }
    );
  }
}

// GET - Version simplifiée aussi
export async function GET(request) {
  try {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('work_orders')
      .select(`
        *,
        client:clients(*)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Erreur GET work orders:', error);
    return NextResponse.json(
      { error: 'Erreur récupération bons de travail' },
      { status: 500 }
    );
  }
}
