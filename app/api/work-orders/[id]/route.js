import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase';

// GET - Récupérer un bon de travail spécifique avec toutes ses relations
export async function GET(request, { params }) {
  try {
    console.log('=== API GET SINGLE WORK ORDER ===');
    console.log('ID demandé:', params.id);
    
    const supabase = createClient();
    const workOrderId = parseInt(params.id);

    if (isNaN(workOrderId)) {
      return NextResponse.json({ error: 'ID invalide' }, { status: 400 });
    }

    // Récupérer le work order avec TOUTES ses relations
    const { data, error } = await supabase
      .from('work_orders')
      .select(`
        *,
        client:clients(*),
        linked_po:purchase_orders(*),
        materials:work_order_materials(
          *,
          product:products(*)
        )
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
    console.log('Client:', data.client?.name);
    console.log('Matériaux:', data.materials?.length || 0);
    
    return NextResponse.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('Erreur GET single work order:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT - Mettre à jour un bon de travail
export async function PUT(request, { params }) {
  try {
    console.log('=== API PUT SINGLE WORK ORDER ===');
    
    const body = await request.json();
    const supabase = createClient();
    const workOrderId = parseInt(params.id);

    const { materials = [], client, linked_po, ...updateData } = body;
    
    // 1. Mettre à jour le work_order principal
    const { data: updatedWorkOrder, error: updateError } = await supabase
      .from('work_orders')
      .update({
        client_id: updateData.client_id ? parseInt(updateData.client_id) : null,
        work_date: updateData.work_date,
        start_time: updateData.start_time || null,
        end_time: updateData.end_time || null,
        break_time: updateData.break_time ? parseFloat(updateData.break_time) : 0,
        total_hours: updateData.total_hours ? parseFloat(updateData.total_hours) : null,
        work_description: updateData.work_description || null,
        additional_notes: updateData.additional_notes || null,
        status: updateData.status || 'draft'
      })
      .eq('id', workOrderId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // 2. Supprimer et recréer les matériaux
    await supabase.from('work_order_materials').delete().eq('work_order_id', workOrderId);

    if (materials && materials.length > 0) {
      const materialsData = materials.map(material => ({
        work_order_id: workOrderId,
        product_id: material.product_id,
        quantity: parseFloat(material.quantity) || 1,
        unit: material.unit || 'pcs',
        notes: material.notes || null
      }));

      await supabase.from('work_order_materials').insert(materialsData);
    }

    // 3. Récupérer le work order complet
    const { data: completeWorkOrder } = await supabase
      .from('work_orders')
      .select(`
        *,
        client:clients(*),
        materials:work_order_materials(*,product:products(*))
      `)
      .eq('id', workOrderId)
      .single();

    return NextResponse.json({
      success: true,
      data: completeWorkOrder,
      message: `Bon de travail ${completeWorkOrder.bt_number} mis à jour`
    });

  } catch (error) {
    console.error('Erreur PUT:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
