import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase';

// GET - Récupérer un bon de travail spécifique
export async function GET(request, { params }) {
  try {
    console.log('=== API GET SINGLE WORK ORDER ===');
    console.log('ID demandé:', params.id);
    
    const supabase = createClient();
    const workOrderId = parseInt(params.id);

    if (isNaN(workOrderId)) {
      return NextResponse.json({ error: 'ID invalide' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('work_orders')
      .select(`
        *,
        client:clients(*)
      `)
      .eq('id', workOrderId)
      .single();

    if (error) {
      console.error('Erreur Supabase:', error);
      
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Bon de travail non trouvé' }, { status: 404 });
      }
      
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('Bon de travail trouvé:', data.bt_number);
    return NextResponse.json(data);

  } catch (error) {
    console.error('Erreur GET single work order:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT - Mettre à jour un bon de travail spécifique
export async function PUT(request, { params }) {
  try {
    console.log('=== API PUT SINGLE WORK ORDER ===');
    console.log('ID à modifier:', params.id);
    
    const body = await request.json();
    const supabase = createClient();
    const workOrderId = parseInt(params.id);

    if (isNaN(workOrderId)) {
      return NextResponse.json({ error: 'ID invalide' }, { status: 400 });
    }

    // Extraire les données à mettre à jour (sans l'ID)
    const { id, materials, ...updateData } = body;
    
    console.log('Données à mettre à jour:', updateData);

    const { data, error } = await supabase
      .from('work_orders')
      .update(updateData)
      .eq('id', workOrderId)
      .select(`
        *,
        client:clients(*)
      `)
      .single();

    if (error) {
      console.error('Erreur mise à jour:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('Bon de travail mis à jour:', data.bt_number);
    return NextResponse.json(data);

  } catch (error) {
    console.error('Erreur PUT single work order:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Supprimer un bon de travail spécifique
export async function DELETE(request, { params }) {
  try {
    console.log('=== API DELETE SINGLE WORK ORDER ===');
    console.log('ID à supprimer:', params.id);
    
    const supabase = createClient();
    const workOrderId = parseInt(params.id);

    if (isNaN(workOrderId)) {
      return NextResponse.json({ error: 'ID invalide' }, { status: 400 });
    }

    // Vérifier que le bon de travail existe
    const { data: existingWO, error: checkError } = await supabase
      .from('work_orders')
      .select('bt_number')
      .eq('id', workOrderId)
      .single();

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Bon de travail non trouvé' }, { status: 404 });
      }
      return NextResponse.json({ error: checkError.message }, { status: 500 });
    }

    // Supprimer le bon de travail
    const { error: deleteError } = await supabase
      .from('work_orders')
      .delete()
      .eq('id', workOrderId);

    if (deleteError) {
      console.error('Erreur suppression:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    console.log('Bon de travail supprimé:', existingWO.bt_number);
    return NextResponse.json({ 
      success: true, 
      message: `Bon de travail ${existingWO.bt_number} supprimé avec succès` 
    });

  } catch (error) {
    console.error('Erreur DELETE single work order:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
