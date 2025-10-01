// /api/work-orders/route.js
import { supabase } from '../../../lib/supabase';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      client_id,
      linked_po_id,
      work_date,
      start_time,
      end_time,
      break_time,
      total_hours,
      work_description,
      additional_notes,
      status,
      materials = []
    } = body;

    // Validation de base
    if (!client_id || !work_date || !work_description) {
      return Response.json(
        { error: 'Champs requis manquants: client_id, work_date, work_description' },
        { status: 400 }
      );
    }

    const client = supabaseAdmin || supabase;

    // Gérer la création automatique de purchase_order si nécessaire
    let finalLinkedPoId = null;
    
    if (linked_po_id && linked_po_id.trim()) {
      // Vérifier si c'est un ID numérique existant ou un nouveau numéro
      if (isNaN(linked_po_id)) {
        // C'est un nouveau numéro de BA/Job client - créer un purchase_order
        console.log('Création automatique purchase_order pour:', linked_po_id);
        
        const { data: newPO, error: poError } = await client
          .from('purchase_orders')
          .insert({
            po_number: linked_po_id.trim(),
            client_id: parseInt(client_id),
            status: 'active',
            order_date: work_date,
            description: `Créé automatiquement depuis BT`,
            created_by: 'work_order_auto'
          })
          .select()
          .single();

        if (poError) {
          console.error('Erreur création purchase_order:', poError);
          // Continuer sans bloquer la création du work_order
        } else {
          finalLinkedPoId = newPO.id;
          console.log('Purchase order créé:', newPO.po_number, 'ID:', newPO.id);
        }
      } else {
        // C'est un ID existant
        finalLinkedPoId = parseInt(linked_po_id);
      }
    }

    // 1. Créer le work_order principal
    const workOrderData = {
      client_id: parseInt(client_id),
      linked_po_id: finalLinkedPoId,
      work_date,
      start_time: start_time || null,
      end_time: end_time || null,
      break_time: parseFloat(break_time) || 0,
      total_hours: parseFloat(total_hours) || 0,
      work_description,
      additional_notes: additional_notes || null,
      status: status || 'draft'
    };

    const { data: workOrder, error: workOrderError } = await client
      .from('work_orders')
      .insert([workOrderData])
      .select()
      .single();

    if (workOrderError) {
      console.error('Erreur création work_order:', workOrderError);
      return Response.json(
        { error: 'Erreur création bon de travail', details: workOrderError.message },
        { status: 500 }
      );
    }

    console.log('Work order créé:', workOrder.bt_number);

    // 2. Ajouter les matériaux si présents
    let workOrderMaterials = [];
    if (materials && materials.length > 0) {
      const materialsData = materials.map(material => ({
        work_order_id: workOrder.id,
        product_id: material.product_id,
        quantity: parseFloat(material.quantity) || 1,
        unit: material.unit || 'pcs',
        notes: material.notes || null,
        show_price: material.showPrice || false
      }));

      const { data: materialsResult, error: materialsError } = await client
        .from('work_order_materials')
        .insert(materialsData)
        .select(`
          *,
          product:products(*)
        `);

      if (materialsError) {
        console.error('Erreur ajout matériaux:', materialsError);
        console.warn('Matériaux non ajoutés, mais work_order créé');
      } else {
        workOrderMaterials = materialsResult || [];
        console.log(`${workOrderMaterials.length} matériaux ajoutés`);
      }
    }

    // 3. Récupérer le work_order complet avec relations
    const { data: completeWorkOrder, error: fetchError } = await client
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
      .eq('id', workOrder.id)
      .single();

    if (fetchError) {
      console.error('Erreur récupération work_order complet:', fetchError);
      return Response.json({
        success: true,
        data: { ...workOrder, materials: workOrderMaterials },
        message: 'Bon de travail créé avec succès'
      });
    }

    return Response.json({
      success: true,
      data: completeWorkOrder,
      message: `Bon de travail ${completeWorkOrder.bt_number} créé avec succès`
    });

  } catch (error) {
    console.error('Erreur API work-orders POST:', error);
    return Response.json(
      { error: 'Erreur serveur', details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page')) || 0;
    const limit = parseInt(searchParams.get('limit')) || 20;
    const status = searchParams.get('status');
    const client_id = searchParams.get('client_id');
    const search = searchParams.get('search');

    let query = supabase
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
      .order('created_at', { ascending: false });

    // Appliquer les filtres
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (client_id) {
      query = query.eq('client_id', client_id);
    }

    if (search) {
      query = query.or(`
        bt_number.ilike.%${search}%,
        work_description.ilike.%${search}%
      `);
    }

    // Pagination
    const from = page * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('Erreur récupération work_orders:', error);
      return Response.json(
        { error: 'Erreur récupération bons de travail' },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      data: data || [],
      pagination: {
        page,
        limit,
        total: count,
        hasMore: (count || 0) > (page + 1) * limit
      }
    });

  } catch (error) {
    console.error('Erreur API work-orders GET:', error);
    return Response.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const {
      id,
      client_id,
      linked_po_id,
      work_date,
      start_time,
      end_time,
      break_time,
      total_hours,
      work_description,
      additional_notes,
      status,
      materials = []
    } = body;

    if (!id) {
      return Response.json(
        { error: 'ID requis pour la mise à jour' },
        { status: 400 }
      );
    }

    const client = supabaseAdmin || supabase;

    // Gérer la création automatique de purchase_order si nécessaire
    let finalLinkedPoId = linked_po_id;
    
    if (linked_po_id && linked_po_id.trim() && isNaN(linked_po_id)) {
      // C'est un nouveau numéro de BA/Job client - créer un purchase_order
      console.log('Création automatique purchase_order pour mise à jour:', linked_po_id);
      
      const { data: newPO, error: poError } = await client
        .from('purchase_orders')
        .insert({
          po_number: linked_po_id.trim(),
          client_id: parseInt(client_id),
          status: 'active',
          order_date: work_date,
          description: `Créé automatiquement depuis BT (mise à jour)`,
          created_by: 'work_order_auto'
        })
        .select()
        .single();

      if (poError) {
        console.error('Erreur création purchase_order:', poError);
      } else {
        finalLinkedPoId = newPO.id;
        console.log('Purchase order créé lors mise à jour:', newPO.po_number, 'ID:', newPO.id);
      }
    } else if (linked_po_id && !isNaN(linked_po_id)) {
      finalLinkedPoId = parseInt(linked_po_id);
    } else {
      finalLinkedPoId = null;
    }

    // 1. Mettre à jour le work_order principal
    const workOrderData = {
      client_id: parseInt(client_id),
      linked_po_id: finalLinkedPoId,
      work_date,
      start_time: start_time || null,
      end_time: end_time || null,
      break_time: parseFloat(break_time) || 0,
      total_hours: parseFloat(total_hours) || 0,
      work_description,
      additional_notes: additional_notes || null,
      status: status || 'draft'
    };

    const { data: workOrder, error: workOrderError } = await client
      .from('work_orders')
      .update(workOrderData)
      .eq('id', id)
      .select()
      .single();

    if (workOrderError) {
      console.error('Erreur mise à jour work_order:', workOrderError);
      return Response.json(
        { error: 'Erreur mise à jour bon de travail' },
        { status: 500 }
      );
    }

    // 2. Gérer les matériaux - Stratégie: supprimer tous et recréer
    const { error: deleteError } = await client
      .from('work_order_materials')
      .delete()
      .eq('work_order_id', id);

    if (deleteError) {
      console.error('Erreur suppression matériaux existants:', deleteError);
    }

    // Puis ajouter les nouveaux matériaux
    if (materials && materials.length > 0) {
      const materialsData = materials.map(material => ({
        work_order_id: id,
        product_id: material.product_id,
        quantity: parseFloat(material.quantity) || 1,
        unit: material.unit || 'pcs',
        notes: material.notes || null,
        show_price: material.showPrice || false
      }));

      const { error: materialsError } = await client
        .from('work_order_materials')
        .insert(materialsData);

      if (materialsError) {
        console.error('Erreur mise à jour matériaux:', materialsError);
      }
    }

    // 3. Récupérer le work_order complet mis à jour
    const { data: completeWorkOrder, error: fetchError } = await client
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
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('Erreur récupération work_order mis à jour:', fetchError);
      return Response.json(workOrder);
    }

    return Response.json({
      success: true,
      data: completeWorkOrder,
      message: `Bon de travail ${completeWorkOrder.bt_number} mis à jour`
    });

  } catch (error) {
    console.error('Erreur API work-orders PUT:', error);
    return Response.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return Response.json(
        { error: 'ID requis pour la suppression' },
        { status: 400 }
      );
    }

    // Supabase CASCADE va supprimer automatiquement les work_order_materials
    const { error } = await supabase
      .from('work_orders')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Erreur suppression work_order:', error);
      return Response.json(
        { error: 'Erreur suppression bon de travail' },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      message: 'Bon de travail supprimé avec succès'
    });

  } catch (error) {
    console.error('Erreur API work-orders DELETE:', error);
    return Response.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
