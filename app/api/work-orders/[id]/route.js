// /app/api/work-orders/[id]/route.js//

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

// GET - Récupérer un bon de travail spécifique avec toutes ses relations
export async function GET(request, { params }) {
  try {
    console.log('=== API GET SINGLE WORK ORDER ===');
    console.log('ID demandé:', params.id);
    
    const supabase = supabaseAdmin;
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
    console.log('Linked PO:', data.linked_po?.po_number || 'Aucun');
    
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
    console.log('🔍 API REÇOIT - Body complet:', body);
    console.log('🔍 API REÇOIT - linked_po_id:', body.linked_po_id);
    console.log('🔍 API REÇOIT - materials:', body.materials);
    console.log('🔍 API REÇOIT - materials.length:', body.materials?.length || 0);
    
    const supabase = supabaseAdmin;
    const workOrderId = parseInt(params.id);

    const { materials = [], client, linked_po, ...updateData } = body;
    
    console.log('🔍 API - materials extraits:', materials);
    console.log('🔍 API - materials.length extraits:', materials.length);
    console.log('🔍 API - linked_po_id extrait:', updateData.linked_po_id);

    // NOUVELLE LOGIQUE : Gérer la création automatique de purchase_order
    let finalLinkedPoId = updateData.linked_po_id;
    
    if (updateData.linked_po_id && updateData.linked_po_id.trim() && isNaN(updateData.linked_po_id)) {
      console.log('🔍 API - Création automatique purchase_order pour:', updateData.linked_po_id);
      
      // Vérifier si ce PO n'existe pas déjà
      const { data: existingPO } = await supabase
        .from('purchase_orders')
        .select('id')
        .eq('po_number', updateData.linked_po_id.trim())
        .single();

      if (existingPO) {
        console.log('🔍 API - Purchase order existe déjà, ID:', existingPO.id);
        finalLinkedPoId = existingPO.id;
      } else {
        // Créer le nouveau purchase_order
        const { data: newPO, error: poError } = await supabase
          .from('purchase_orders')
          .insert({
            po_number: updateData.linked_po_id.trim(),
            client_id: parseInt(updateData.client_id),
            status: 'active',
            order_date: updateData.work_date,
            description: 'Créé automatiquement depuis BT',
            created_by: 'work_order_auto'
          })
          .select()
          .single();

        if (poError) {
          console.error('🔍 API - Erreur création purchase_order:', poError);
          // Continuer sans bloquer
          finalLinkedPoId = null;
        } else {
          finalLinkedPoId = newPO.id;
          console.log('🔍 API - Purchase order créé avec succès:', newPO.po_number, 'ID:', newPO.id);
        }
      }
    } else if (updateData.linked_po_id && !isNaN(updateData.linked_po_id)) {
      // C'est un ID existant
      finalLinkedPoId = parseInt(updateData.linked_po_id);
      console.log('🔍 API - Utilisation ID purchase_order existant:', finalLinkedPoId);
    } else {
      // Pas de linked_po_id ou chaîne vide
      finalLinkedPoId = null;
      console.log('🔍 API - Aucun purchase_order à lier');
    }
    
    // 1. Mettre à jour le work_order principal (AVEC linked_po_id maintenant)
    const { data: updatedWorkOrder, error: updateError } = await supabase
      .from('work_orders')
      .update({
        client_id: updateData.client_id ? parseInt(updateData.client_id) : null,
        linked_po_id: finalLinkedPoId,  // AJOUT DE CETTE LIGNE
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
      console.error('🔍 API - Erreur mise à jour work_order:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    console.log('🔍 API - Work order mis à jour avec succès:', updatedWorkOrder.bt_number);
    console.log('🔍 API - linked_po_id sauvé:', updatedWorkOrder.linked_po_id);

    // 2. Supprimer les anciens matériaux
    console.log('🔍 API - Suppression anciens matériaux...');
    const { error: deleteError } = await supabase
      .from('work_order_materials')
      .delete()
      .eq('work_order_id', workOrderId);

    if (deleteError) {
      console.error('🔍 API - Erreur suppression matériaux:', deleteError);
      return NextResponse.json({ error: 'Erreur suppression matériaux: ' + deleteError.message }, { status: 500 });
    }

    console.log('🔍 API - Anciens matériaux supprimés');

    // 3. Insérer les nouveaux matériaux (AVEC show_price maintenant)
    if (materials && materials.length > 0) {
      console.log('🔍 API - Préparation insertion matériaux...');
      
      const materialsData = materials.map((material, index) => {
        console.log(`🔍 API - Matériau ${index + 1}:`, {
          product_id: material.product_id,
          quantity: material.quantity,
          unit: material.unit,
          notes: material.notes,
          showPrice: material.showPrice  // AJOUT DE CE LOG
        });
        
        return {
          work_order_id: workOrderId,
          product_id: material.product_id,
          quantity: parseFloat(material.quantity) || 1,
          unit: material.unit || 'pcs',
          notes: material.notes || null,
          show_price: material.showPrice || false  // AJOUT DE CETTE LIGNE
        };
      });

      console.log('🔍 API - Données matériaux à insérer:', materialsData);

      const { data: insertedMaterials, error: insertError } = await supabase
        .from('work_order_materials')
        .insert(materialsData)
        .select();

      if (insertError) {
        console.error('🔍 API - ERREUR INSERTION MATÉRIAUX:', insertError);
        return NextResponse.json({ 
          error: 'Erreur insertion matériaux: ' + insertError.message,
          details: insertError
        }, { status: 500 });
      }

      console.log('🔍 API - Matériaux insérés avec succès:', insertedMaterials?.length || 0);
    } else {
      console.log('🔍 API - Aucun matériau à insérer');
    }

    // 4. Récupérer le work order complet (AVEC linked_po maintenant)
    console.log('🔍 API - Récupération work order complet...');
    const { data: completeWorkOrder, error: fetchError } = await supabase
      .from('work_orders')
      .select(`
        *,
        client:clients(*),
        linked_po:purchase_orders(*),
        materials:work_order_materials(*,product:products(*))
      `)
      .eq('id', workOrderId)
      .single();

    if (fetchError) {
      console.error('🔍 API - Erreur récupération work order complet:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    console.log('🔍 API - Work order complet récupéré:');
    console.log('🔍 API - Nombre de matériaux dans le retour:', completeWorkOrder.materials?.length || 0);
    console.log('🔍 API - Purchase order lié:', completeWorkOrder.linked_po?.po_number || 'Aucun');
    
    return NextResponse.json({
      success: true,
      data: completeWorkOrder,
      message: `Bon de travail ${completeWorkOrder.bt_number} mis à jour`
    });

  } catch (error) {
    console.error('🔍 API - Erreur PUT générale:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
