import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase';

// GET - Liste des bons de travail
export async function GET(request) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    
    // Vérifier l'utilisateur connecté
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    let query = supabase
      .from('work_orders')
      .select(`
        *,
        client:clients(*)
      `)
      .eq('user_id', user.id)
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

// POST - Création d'un bon de travail
export async function POST(request) {
  try {
    const supabase = createClient();
    const body = await request.json();
    
    // Vérifier l'utilisateur connecté
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { materials, ...workOrderData } = body;

    // Ajouter l'ID utilisateur
    const dataToInsert = {
      ...workOrderData,
      user_id: user.id
    };

    // Créer le bon de travail
    const { data: workOrder, error: woError } = await supabase
      .from('work_orders')
      .insert([dataToInsert])
      .select()
      .single();

    if (woError) {
      throw woError;
    }

    // Ajouter les matériaux si présents
    if (materials && materials.length > 0) {
      const materialsData = materials.map(material => ({
        work_order_id: workOrder.id,
        product_id: material.product_id,
        quantity: material.quantity,
        unit: material.unit,
        notes: material.notes
      }));

      const { error: materialsError } = await supabase
        .from('work_order_materials')
        .insert(materialsData);

      if (materialsError) {
        console.error('Erreur ajout matériaux:', materialsError);
        // On continue même si les matériaux échouent
      }
    }

    return NextResponse.json(workOrder, { status: 201 });
  } catch (error) {
    console.error('Erreur POST work order:', error);
    return NextResponse.json(
      { error: 'Erreur création bon de travail: ' + error.message },
      { status: 500 }
    );
  }
}

// PUT - Mise à jour d'un bon de travail
export async function PUT(request) {
  try {
    const supabase = createClient();
    const body = await request.json();
    
    // Vérifier l'utilisateur connecté
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { id, materials, ...workOrderData } = body;

    // Mettre à jour le bon de travail (seulement si c'est le bon utilisateur)
    const { data: workOrder, error: woError } = await supabase
      .from('work_orders')
      .update(workOrderData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (woError) {
      throw woError;
    }

    // Supprimer les anciens matériaux
    await supabase
      .from('work_order_materials')
      .delete()
      .eq('work_order_id', id);

    // Ajouter les nouveaux matériaux
    if (materials && materials.length > 0) {
      const materialsData = materials.map(material => ({
        work_order_id: id,
        product_id: material.product_id,
        quantity: material.quantity,
        unit: material.unit,
        notes: material.notes
      }));

      const { error: materialsError } = await supabase
        .from('work_order_materials')
        .insert(materialsData);

      if (materialsError) {
        console.error('Erreur mise à jour matériaux:', materialsError);
      }
    }

    return NextResponse.json(workOrder);
  } catch (error) {
    console.error('Erreur PUT work order:', error);
    return NextResponse.json(
      { error: 'Erreur mise à jour bon de travail: ' + error.message },
      { status: 500 }
    );
  }
}
