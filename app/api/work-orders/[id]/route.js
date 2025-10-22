// /app/api/work-orders/[id]/route.js
// FICHIER COMPLET avec GET et PUT corrigés

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

// Arrondi au quart d'heure supérieur (HH:MM -> heures décimales)
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
};}


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

    // Récupérer le work order SANS jointure problématique avec products
    const { data, error } = await supabase
      .from('work_orders')
      .select(`
        *,
        client:clients(*),
        linked_po:purchase_orders(*),
        materials:work_order_materials(*)
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

    // Enrichir les matériaux avec les infos produit si disponibles
    if (data.materials && data.materials.length > 0) {
      for (let material of data.materials) {
        // Si product_id existe et n'est pas null
        if (material.product_id) {
          try {
            // Chercher d'abord dans products
            const { data: product } = await supabase
              .from('products')
              .select('*')
              .eq('product_id', material.product_id)
              .single();
            
            if (product) {
              material.product = product;
            } else {
              // Sinon chercher dans non_inventory_items
              const { data: nonInvProduct } = await supabase
                .from('non_inventory_items')
                .select('*')
                .eq('product_id', material.product_id)
                .single();
              
              if (nonInvProduct) {
                material.product = nonInvProduct;
              }
            }
          } catch (err) {
            console.log(`Produit ${material.product_id} non trouvé`);
          }
        }
        
        // Si pas de product trouvé mais qu'on a des infos stockées
        if (!material.product && (material.product_code || material.description)) {
          material.product = {
            product_id: material.product_code || material.product_id,
            description: material.description,
            unit: material.unit,
            selling_price: material.unit_price || 0
          };
        }
      }
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
    console.log('📋 API REÇOIT - Body complet:', body);
    console.log('📋 API REÇOIT - linked_po_id:', body.linked_po_id);
    console.log('📋 API REÇOIT - materials:', body.materials);
    console.log('📋 API REÇOIT - materials.length:', body.materials?.length || 0);
    
    const supabase = supabaseAdmin;
    const workOrderId = parseInt(params.id);

    const { materials = [], client, linked_po, include_travel_time = false, ...updateData } = body;
    
    console.log('📋 API - materials extraits:', materials);
    console.log('📋 API - materials.length extraits:', materials.length);

    // Unifier/normaliser la pause
      const pause_minutes = updateData.pause_minutes != null
        ? parseInt(updateData.pause_minutes, 10) || 0
        : 0;
      
      // Calcul serveur infaillible du total (quart d’heure ↑ si start/end fournis)
      let computedTotalHours = null;
      if (updateData.start_time && updateData.end_time) {
        computedTotalHours = toQuarterHourUp(
          updateData.start_time,
          updateData.end_time,
          pause_minutes
        );
      } else if (updateData.total_hours != null) {
        // fallback si on ne reçoit pas les heures brutes
        computedTotalHours = Math.round(parseFloat(updateData.total_hours) * 100) / 100;
      }
      
      // (Optionnel) debug
      console.log('🧮 PUT total_hours (srv):', {
        start: updateData.start_time,
        end: updateData.end_time,
        pause_minutes,
        computedTotalHours
      });


    // NOUVELLE LOGIQUE : Gérer la création automatique de purchase_order
    let finalLinkedPoId = updateData.linked_po_id;
    
    // ✅ CORRECTION - Vérifier le type avant d'appeler .trim()
    if (updateData.linked_po_id) {
      const isStringPO = typeof updateData.linked_po_id === 'string' && updateData.linked_po_id.trim() && isNaN(updateData.linked_po_id);
      
      if (isStringPO) {
        console.log('📋 API - Création automatique purchase_order pour:', updateData.linked_po_id);
        
        // Vérifier si ce PO n'existe pas déjà  
        const { data: existingPO } = await supabase
          .from('purchase_orders')
          .select('id')
          .eq('po_number', updateData.linked_po_id.trim())
          .single();

        if (existingPO) {
          console.log('📋 API - Purchase order existe déjà, ID:', existingPO.id);
          finalLinkedPoId = existingPO.id;
        } else {
          // Récupérer le nom du client
          const { data: clientData } = await supabase
            .from('clients')
            .select('name')
            .eq('id', updateData.client_id)
            .single();
          
          const clientName = clientData?.name || 'Client inconnu';
          
          // Créer le nouveau purchase_order
          const { data: newPO, error: poError } = await supabase
            .from('purchase_orders')
            .insert({
              po_number: updateData.linked_po_id.trim(),
              client_id: parseInt(updateData.client_id),
              status: 'active',
              date: updateData.work_date,
              po_date: updateData.work_date,
              description: 'Créé automatiquement depuis BT',
              created_by: null,
              amount: 0,
              client_name: clientName,
              notes: `PO créé automatiquement lors de la mise à jour d'un BT. Date: ${updateData.work_date}`
            })
            .select()
            .single();

          if (poError) {
            console.error('📋 API - Erreur création purchase_order:', poError);
            finalLinkedPoId = null;
          } else {
            finalLinkedPoId = newPO.id;
            console.log('📋 API - Purchase order créé avec succès:', newPO.po_number, 'ID:', newPO.id);
          }
        }
      } else if (!isNaN(updateData.linked_po_id)) {
        finalLinkedPoId = parseInt(updateData.linked_po_id);
        console.log('📋 API - Utilisation ID purchase_order existant:', finalLinkedPoId);
      } else {
        finalLinkedPoId = null;
        console.log('📋 API - Aucun purchase_order à lier');
      }
    } else {
      finalLinkedPoId = null;
      console.log('📋 API - Aucun purchase_order à lier');
    }
    
    // 1. Mettre à jour le work_order principal
    const { data: updatedWorkOrder, error: updateError } = await supabase
    .from('work_orders')
    .update({
      client_id: updateData.client_id ? parseInt(updateData.client_id) : null,
      linked_po_id: finalLinkedPoId,
      work_date: updateData.work_date,
      time_entries: updateData.time_entries || [],
      total_hours: updateData.total_hours || 0,  
      work_description: updateData.work_description || null,
      additional_notes: updateData.additional_notes || null,
      status: updateData.status || 'draft',
      recipient_emails: updateData.recipient_emails || [],
      include_travel_time: include_travel_time
    })
    .eq('id', workOrderId)
    .select()
    .single();

    if (updateError) {
      console.error('📋 API - Erreur mise à jour work_order:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    console.log('📋 API - Work order mis à jour avec succès:', updatedWorkOrder.bt_number);

    // 2. Supprimer les anciens matériaux
    console.log('📋 API - Suppression anciens matériaux...');
    const { error: deleteError } = await supabase
      .from('work_order_materials')
      .delete()
      .eq('work_order_id', workOrderId);

    if (deleteError) {
      console.error('📋 API - Erreur suppression matériaux:', deleteError);
      return NextResponse.json({ error: 'Erreur suppression matériaux: ' + deleteError.message }, { status: 500 });
    }

    console.log('📋 API - Anciens matériaux supprimés');

    // 3. Insérer les nouveaux matériaux (AVEC validation product_id)
    if (materials && materials.length > 0) {
      console.log('📋 API - Préparation insertion matériaux...');
      
      const materialsData = materials.map((material, index) => {
        console.log(`📦 API - Matériau ${index + 1} AVANT validation:`, {
          product_id: material.product_id,
          type: typeof material.product_id,
          code: material.code,
          description: material.description
        });
        
        // VALIDATION DU PRODUCT_ID
        let validProductId = null;
        
        // Ne PAS utiliser de product_id qui ressemble à un ID temporaire
        if (material.product_id && 
            typeof material.product_id === 'string' &&
            !material.product_id.startsWith('temp-') &&
            !material.product_id.startsWith('supplier-') &&
            !material.product_id.startsWith('sub-') &&
            !material.product_id.startsWith('IMP-') &&
            !material.product_id.includes('-')) { // Si c'est un vrai code produit (sans tirets)
          validProductId = material.product_id;
        }
        
        console.log(`📦 API - Matériau ${index + 1} APRÈS validation:`, {
          product_id: validProductId,
          type: typeof validProductId
        });
        
        return {
          work_order_id: workOrderId,
          product_id: validProductId, // NULL ou code produit valide
          product_code: material.code || material.display_code || material.product?.product_id || null,
          description: material.description || material.product?.description || null,
          quantity: parseFloat(material.quantity) || 1,
          unit: material.unit || 'UN',
          unit_price: parseFloat(material.unit_price || material.product?.selling_price || 0),
          notes: material.notes || null,
          show_price: material.showPrice || material.show_price || false
        };
      });

      console.log('📋 API - Données matériaux à insérer:', materialsData);

      const { data: insertedMaterials, error: insertError } = await supabase
        .from('work_order_materials')
        .insert(materialsData)
        .select();

      if (insertError) {
        console.error('❌ API - ERREUR INSERTION MATÉRIAUX:', insertError);
        console.error('❌ API - Détails:', insertError.details);
        console.error('❌ API - Données tentées:', materialsData);
        return NextResponse.json({ 
          error: 'Erreur insertion matériaux: ' + insertError.message,
          details: insertError,
          attempted_data: materialsData
        }, { status: 500 });
      }

      console.log('✅ API - Matériaux insérés avec succès:', insertedMaterials?.length || 0);
    } else {
      console.log('📋 API - Aucun matériau à insérer');
    }

    // 4. Récupérer le work order complet SANS jointure problématique
    console.log('📋 API - Récupération work order complet...');
    const { data: completeWorkOrder, error: fetchError } = await supabase
      .from('work_orders')
      .select(`
        *,
        client:clients(*),
        linked_po:purchase_orders(*),
        materials:work_order_materials(*)
      `)
      .eq('id', workOrderId)
      .single();

    if (fetchError) {
      console.error('📋 API - Erreur récupération work order complet:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    // Enrichir les matériaux avec les infos produit
    if (completeWorkOrder.materials && completeWorkOrder.materials.length > 0) {
      for (let material of completeWorkOrder.materials) {
        if (material.product_id) {
          try {
            // Chercher le produit
            const { data: product } = await supabase
              .from('products')
              .select('*')
              .eq('product_id', material.product_id)
              .single();
            
            if (product) {
              material.product = product;
            } else {
              // Chercher dans non_inventory_items
              const { data: nonInvProduct } = await supabase
                .from('non_inventory_items')
                .select('*')
                .eq('product_id', material.product_id)
                .single();
              
              if (nonInvProduct) {
                material.product = nonInvProduct;
              }
            }
          } catch (err) {
            console.log(`Produit ${material.product_id} non trouvé`);
          }
        }
        
        // Si pas de product mais des infos stockées
        if (!material.product && (material.product_code || material.description)) {
          material.product = {
            product_id: material.product_code || material.product_id,
            description: material.description,
            unit: material.unit,
            selling_price: material.unit_price || 0
          };
        }
      }
    }

    console.log('📋 API - Work order complet récupéré:');
    console.log('📋 API - Nombre de matériaux dans le retour:', completeWorkOrder.materials?.length || 0);
    console.log('📋 API - Purchase order lié:', completeWorkOrder.linked_po?.po_number || 'Aucun');
    
    return NextResponse.json({
      success: true,
      data: completeWorkOrder,
      message: `Bon de travail ${completeWorkOrder.bt_number} mis à jour`
    });

  } catch (error) {
    console.error('📋 API - Erreur PUT générale:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
