// /app/api/work-orders/route.js
import { supabase } from '../../../lib/supabase';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

// === Arrondi au quart d'heure supérieur (HH:MM -> heures décimales) ===
function toQuarterHourUp(startHHMM, endHHMM, pauseMinutes = 0) {
    const parseHHMM = (t) => {
    const [h, m] = String(t || '').split(':').map((n) => parseInt(n, 10) || 0);
    return h * 60 + m;
  };
  
  const s = parseHHMM(startHHMM);
  const e = parseHHMM(endHHMM);
  let netMinutes = Math.max(0, e - s - (parseInt(pauseMinutes, 10) || 0));
  
  if (netMinutes < 60) {
    return 1.0;
  }
  
  const hours = Math.floor(netMinutes / 60);
  const minutes = netMinutes % 60;
  
  let roundedMinutes;
  
  if (minutes <= 6) {
    roundedMinutes = 0;
  } else if (minutes <= 21) {
    roundedMinutes = 15;
  } else if (minutes <= 36) {
    roundedMinutes = 30;
  } else if (minutes <= 51) {
    roundedMinutes = 45;
  } else {
    return hours + 1;
  }
  
  const totalMinutes = (hours * 60) + roundedMinutes;
  return Math.round((totalMinutes / 60) * 100) / 100;
};


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
      materials = [],
      recipient_emails = [],
      include_travel_time = false
      
    } = body;

    //const pause_minutes = body.pause_minutes != null
    //  ? parseInt(body.pause_minutes, 10) || 0
     // : (parseInt(break_time, 10) || 0);  // compat ancien front
    
   // let computedTotalHours = null;
  //  if (start_time && end_time) {
   //   computedTotalHours = toQuarterHourUp(start_time, end_time, pause_minutes);
   // } else if (total_hours != null) {
  //    computedTotalHours = Math.round(parseFloat(total_hours) * 100) / 100;
  //  }

    // Validation de base
    if (!client_id || !work_date) {
      return Response.json(
        { error: 'Champs requis manquants: client_id, work_date' },
        { status: 400 }
      );
    }

    const client = supabaseAdmin || supabase;

    // Remplacez la section "Gérer la création automatique de purchase_order" dans POST par ceci :

  // Gérer la création automatique de purchase_order si nécessaire
let finalLinkedPoId = null;

    if (linked_po_id) {
      const { is_manual_po } = body; // ✅ Récupérer le flag
      
      // Si saisie manuelle OU si c'est une string non-numérique → créer un nouveau BA
      const shouldCreatePO = is_manual_po || (typeof linked_po_id === 'string' && linked_po_id.trim() && isNaN(linked_po_id));
      
      if (shouldCreatePO) {
    // C'est un nouveau numéro de BA/Job client
    console.log('🔍 Création automatique purchase_order pour:', linked_po_id);
    
    // ✅ VÉRIFIER SI CE PO N'EXISTE PAS DÉJÀ
    const { data: existingPO } = await client
      .from('purchase_orders')
      .select('id')
      .eq('po_number', linked_po_id.trim())
      .single();

    if (existingPO) {
      console.log('✅ Purchase order existe déjà, ID:', existingPO.id);
      finalLinkedPoId = existingPO.id;
    } else {
      // 1️⃣ Récupérer le nom du client
      const { data: clientData } = await client
        .from('clients')
        .select('name')
        .eq('id', client_id)
        .single();
      
      const clientName = clientData?.name || 'Client inconnu';
      
      // 2️⃣ Créer le purchase_order
      const { data: newPO, error: poError } = await client
        .from('purchase_orders')
        .insert({
          po_number: linked_po_id.trim(),
          client_id: parseInt(client_id),
          status: 'in_progress',
          date: work_date,
          po_date: work_date,
          description: work_description || '',
          created_by: null,
          amount: 0,
          client_name: clientName,
          notes: `PO créé automatiquement lors de la création d'un BT. Date: ${work_date}`
        })
        .select()
        .single();

      if (poError) {
        console.error('❌ Erreur création purchase_order:', poError);
        // ⚠️ IMPORTANT : Ne pas continuer avec un linked_po_id invalide
        finalLinkedPoId = null;
      } else {
        finalLinkedPoId = newPO.id;
        console.log('✅ Purchase order créé:', newPO.po_number, 'ID:', newPO.id);
      }
    }
  } else {
  // Mode sélection dropdown - c'est un ID existant
  finalLinkedPoId = parseInt(linked_po_id);
  console.log('✅ Utilisation ID purchase_order existant:', finalLinkedPoId);
}
}

    // 1. Créer le work_order principal
    console.log('🕐 POST - time_entries à sauvegarder:', JSON.stringify(body.time_entries));
    console.log('🕐 POST - total_hours:', body.total_hours);
    const workOrderData = {
      client_id: parseInt(client_id),
      linked_po_id: finalLinkedPoId,
      work_date,
      time_entries: body.time_entries || [],
      total_hours: body.total_hours || 0, 
      work_description: work_description || 'DESCRIPTION À VENIR!',
      additional_notes: additional_notes || null,
      status: status || 'draft',
      recipient_emails: recipient_emails || [],
      include_travel_time: include_travel_time,
      is_prix_jobe: body.is_prix_jobe || false
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

    // 2. Ajouter les matériaux si présents (SANS contrainte FK)
    let workOrderMaterials = [];
    if (materials && materials.length > 0) {
      const materialsData = materials.map(material => {
        // Valider product_id pour éviter les erreurs FK
        let validProductId = null;
        if (material.product_id && 
            !material.product_id.startsWith('temp-') && 
            !material.product_id.startsWith('IMP-')) {
          validProductId = material.product_id;
        }
        
        return {
          work_order_id: workOrder.id,
          product_id: validProductId, // NULL si invalide
          product_code: material.code || material.product?.product_id || null,
          description: material.description || material.product?.description || null,
          quantity: parseFloat(material.quantity) || 1,
          unit: material.unit || 'UN',
          unit_price: parseFloat(material.unit_price || material.product?.selling_price || 0),
          notes: material.notes || null,
          show_price: material.showPrice || material.show_price || false
        };
      });

        // ✅ AJOUTEZ LE CONSOLE.LOG ICI
          console.log('📦 MATÉRIAUX AVEC PRIX:', materialsData.map(m => ({
            code: m.product_code,
            show_price: m.show_price,
            unit_price: m.unit_price
          })));

      const { data: materialsResult, error: materialsError } = await client
        .from('work_order_materials')
        .insert(materialsData)
        .select(); // PAS de jointure avec products

      if (materialsError) {
        console.error('Erreur ajout matériaux:', materialsError);
        console.warn('Matériaux non ajoutés, mais work_order créé');
      } else {
        workOrderMaterials = materialsResult || [];
        console.log(`${workOrderMaterials.length} matériaux ajoutés`);
      }
    }

    // 3. Récupérer le work_order complet SANS jointure problématique
    const { data: completeWorkOrder, error: fetchError } = await client
      .from('work_orders')
      .select(`
        *,
        client:clients(*),
        linked_po:purchase_orders(*),
        materials:work_order_materials(*)
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
        id,
        bt_number,
        client_id,
        linked_po_id,
        work_date,
        total_hours,
        work_description,
        status,
        time_entries,
        client:clients(id, name),
        linked_po:purchase_orders(id, po_number)
      `, { count: 'exact' })
      .order('bt_number', { ascending: false });

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
        { success: false, error: 'Erreur récupération bons de travail', details: error.message },
        { status: 500 }
      );
    }

    // Vérifier session active pour chaque work order
    if (data && data.length > 0) {
      for (let workOrder of data) {
        workOrder.has_active_session = false;
        if (workOrder.time_entries && Array.isArray(workOrder.time_entries)) {
          workOrder.has_active_session = workOrder.time_entries.some(
            entry => entry.start_time && !entry.end_time
          );
        }
      }
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
      { success: false, error: 'Erreur serveur', details: error.message },
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
      materials = [],
      include_travel_time = false
    } = body;

    if (!id) {
      return Response.json(
        { error: 'ID requis pour la mise à jour' },
        { status: 400 }
      );
    }

    const client = supabaseAdmin || supabase;

        // Gérer la création automatique de purchase_order si nécessaire
        let finalLinkedPoId = null;
        
        if (linked_po_id) {
          const { is_manual_po } = body;
          
          // Si saisie manuelle OU si c'est une string non-numérique → créer un nouveau BA
          const shouldCreatePO = is_manual_po || (typeof linked_po_id === 'string' && linked_po_id.trim() && isNaN(linked_po_id));
          
          if (shouldCreatePO) {
            // C'est un nouveau numéro de BA/Job client
            console.log('🔍 Création automatique purchase_order pour:', linked_po_id);
            
            // ✅ VÉRIFIER SI CE PO N'EXISTE PAS DÉJÀ
            const { data: existingPO } = await client
              .from('purchase_orders')
              .select('id')
              .eq('po_number', linked_po_id.trim())
              .single();
        
            if (existingPO) {
              console.log('✅ Purchase order existe déjà, ID:', existingPO.id);
              finalLinkedPoId = existingPO.id;
            } else {
              // 1️⃣ Récupérer le nom du client
              const { data: clientData } = await client
                .from('clients')
                .select('name')
                .eq('id', client_id)
                .single();
              
              const clientName = clientData?.name || 'Client inconnu';
              
              // 2️⃣ Créer le purchase_order
              const { data: newPO, error: poError } = await client
                .from('purchase_orders')
                .insert({
                  po_number: linked_po_id.trim(),
                  client_id: parseInt(client_id),
                  status: 'in_progress',
                  date: work_date,
                  po_date: work_date,
                  description: work_description || '',
                  created_by: null,
                  amount: 0,
                  client_name: clientName,
                  notes: `PO créé automatiquement lors de la modification d'un BT. Date: ${work_date}`
                })
                .select()
                .single();
        
              if (poError) {
                console.error('❌ Erreur création purchase_order:', poError);
                finalLinkedPoId = null;
              } else {
                finalLinkedPoId = newPO.id;
                console.log('✅ Purchase order créé:', newPO.po_number, 'ID:', newPO.id);
              }
            }
          } else {
            // Mode sélection dropdown - c'est un ID existant
            finalLinkedPoId = parseInt(linked_po_id);
            console.log('✅ Utilisation ID purchase_order existant:', finalLinkedPoId);
          }
        }
       
    // 1. Mettre à jour le work_order principal
    const workOrderData = {
      client_id: parseInt(client_id),
      linked_po_id: finalLinkedPoId,
      work_date,
      time_entries: body.time_entries || [],    
      total_hours: body.total_hours || 0, 
      work_description,
      additional_notes: additional_notes || null,
      status: status || 'draft',
      recipient_emails: recipient_emails || [],
      include_travel_time: include_travel_time
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

    // Puis ajouter les nouveaux matériaux (SANS contrainte FK)
    if (materials && materials.length > 0) {
      const materialsData = materials.map(material => {
        // Valider product_id pour éviter les erreurs FK
        let validProductId = null;
        if (material.product_id && 
            !material.product_id.startsWith('temp-') && 
            !material.product_id.startsWith('IMP-')) {
          validProductId = material.product_id;
        }
        
        return {
          work_order_id: id,
          product_id: validProductId, // NULL si invalide
          product_code: material.code || material.product?.product_id || null,
          description: material.description || material.product?.description || null,
          quantity: parseFloat(material.quantity) || 1,
          unit: material.unit || 'UN',
          unit_price: parseFloat(material.unit_price || material.product?.selling_price || 0),
          notes: material.notes || null,
          show_price: material.showPrice || false
        };
      });

      const { error: materialsError } = await client
        .from('work_order_materials')
        .insert(materialsData);

      if (materialsError) {
        console.error('Erreur mise à jour matériaux:', materialsError);
      }
    }

    // 3. Récupérer le work_order complet mis à jour SANS jointure problématique
    const { data: completeWorkOrder, error: fetchError } = await client
      .from('work_orders')
      .select(`
        *,
        client:clients(*),
        linked_po:purchase_orders(*),
        materials:work_order_materials(*)
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
