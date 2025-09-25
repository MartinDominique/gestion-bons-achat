import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase';

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
    console.log('Matériaux trouvés:', data.materials?.length || 0);
    
    return NextResponse.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('Erreur GET single work order:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT - Mettre à jour un bon de travail spécifique avec ses matériaux
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

    // Extraire les matériaux séparément du reste des données
    const { 
      id, 
      materials = [], 
      client, // Exclure les relations en lecture seule
      linked_po,
      ...updateData 
    } = body;
    
    console.log('Données work order à mettre à jour:', updateData);
    console.log('Matériaux à sauvegarder:', materials.length);

    // Vérifier que le work order existe
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

    // 1. Mettre à jour le work_order principal
    const { data: updatedWorkOrder, error: updateError } = await supabase
      .from('work_orders')
      .update({
        client_id: updateData.client_id ? parseInt(updateData.client_id) : null,
        linked_po_id: updateData.linked_po_id ? parseInt(updateData.linked_po_id) : null,
        work_date: updateData.work_date,
        start_time: updateData.start_time || null,
        end_time: updateData.end_time || null,
        break_time: updateData.break_time ? parseFloat(updateData.break_time) : 0,
        total_hours: updateData.total_hours ? parseFloat(updateData.total_hours) : null,
        work_description: updateData.work_description || null,
        additional_notes: updateData.additional_notes || null,
        status: updateData.status || 'draft',
        updated_at: new Date().toISOString()
      })
      .eq('id', workOrderId)
      .select()
      .single();

    if (updateError) {
      console.error('Erreur mise à jour work_order:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    console.log('Work order mis à jour:', updatedWorkOrder.bt_number);

    // 2. Gérer les matériaux - Supprimer tous les anciens
    const { error: deleteMatError } = await supabase
      .from('work_order_materials')
      .delete()
      .eq('work_order_id', workOrderId);

    if (deleteMatError) {
      console.error('Erreur suppression anciens matériaux:', deleteMatError);
      // Ne pas faire échouer pour autant
    } else {
      console.log('Anciens matériaux supprimés');
    }

    // 3. Ajouter les nouveaux matériaux
    let savedMaterials = [];
    if (materials && materials.length > 0) {
      const materialsData = materials.map(material => ({
        work_order_id: workOrderId,
        product_id: material.product_id,
        quantity: parseFloat(material.quantity) || 1,
        unit: material.unit || 'pcs',
        notes: material.notes || null
      }));

      const { data: newMaterials, error: materialsError } = await supabase
        .from('work_order_materials')
        .insert(materialsData)
        .select(`
          *,
          product:products(*)
        `);

      if (materialsError) {
        console.error('Erreur ajout nouveaux matériaux:', materialsError);
        // Continuer même si les matériaux échouent
      } else {
        savedMaterials = newMaterials || [];
        console.log(`${savedMaterials.length} nouveaux matériaux sauvegardés`);
      }
    }

    // 4. Récupérer le work order complet final avec toutes les relations
    const { data: completeWorkOrder, error: fetchError } = await supabase
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

    if (fetchError) {
      console.error('Erreur récupération finale:', fetchError);
      // Retourner au moins les données de base
      return NextResponse.json({
        success: true,
        data: {
          ...updatedWorkOrder,
          materials: savedMaterials
        },
        message: `Bon de travail ${updatedWorkOrder.bt_number} mis à jour`
      });
    }

    console.log('Mise à jour terminée. Matériaux finaux:', completeWorkOrder.materials?.length || 0);
    
    return NextResponse.json({
      success: true,
      data: completeWorkOrder,
      message: `Bon de travail ${completeWorkOrder.bt_number} mis à jour avec succès`
    });

  } catch (error) {
    console.error('Erreur PUT single work order:', error);
    return NextResponse.json({ 
      error: 'Erreur serveur lors de la mise à jour', 
      details: error.message 
    }, { status: 500 });
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

    // Vérifier que le bon de travail existe et récupérer ses infos
    const { data: existingWO, error: checkError } = await supabase
      .from('work_orders')
      .select('bt_number, status')
      .eq('id', workOrderId)
      .single();

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Bon de travail non trouvé' }, { status: 404 });
      }
      return NextResponse.json({ error: checkError.message }, { status: 500 });
    }

    // Vérifier si la suppression est autorisée selon le statut
    if (existingWO.status === 'sent' || existingWO.status === 'archived') {
      return NextResponse.json({ 
        error: `Impossible de supprimer un bon de travail avec le statut "${existingWO.status}"` 
      }, { status: 400 });
    }

    // Supprimer le bon de travail (les matériaux seront supprimés automatiquement par CASCADE)
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
    return NextResponse.json({ 
      error: 'Erreur serveur lors de la suppression', 
      details: error.message 
    }, { status: 500 });
  }
}
