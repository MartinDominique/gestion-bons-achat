/**
 * @file app/api/delivery-notes/[id]/route.js
 * @description API pour un Bon de Livraison spécifique
 *              - GET: Récupérer un BL avec toutes ses relations + refs parent/child BO
 *              - PUT: Mettre à jour un BL (avec support backorder)
 * @version 1.3.0
 * @date 2026-04-10
 * @changelog
 *   1.3.0 - GET: charge client_po_items du BA lié pour accès aux prix BA dans facturation
 *   1.2.0 - Fix: INSERT matériaux résilient — retry sans colonnes BO si INSERT échoue
 *   1.1.1 - Fix: permettre quantité 0 dans matériaux (|| 1 convertissait 0 en 1)
 *   1.1.0 - Ajout support backorder (BO): ordered_quantity, previously_delivered
 *           dans matériaux PUT, parent/child bl_number dans GET
 *   1.0.0 - Version initiale
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET - Récupérer un bon de livraison spécifique
export async function GET(request, { params }) {
  try {
    const supabase = supabaseAdmin;
    const deliveryNoteId = parseInt(params.id);

    if (isNaN(deliveryNoteId)) {
      return NextResponse.json({ error: 'ID invalide' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('delivery_notes')
      .select(`
        *,
        client:clients(*),
        linked_po:purchase_orders(*),
        materials:delivery_note_materials(*)
      `)
      .eq('id', deliveryNoteId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Bon de livraison non trouvé' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Enrichir les matériaux avec les infos produit
    if (data.materials && data.materials.length > 0) {
      for (let material of data.materials) {
        if (material.product_id) {
          try {
            const { data: product } = await supabase
              .from('products')
              .select('*')
              .eq('product_id', material.product_id)
              .single();

            if (product) {
              material.product = product;
            } else {
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

    // Charger les items du BA lié (prix pour facturation)
    if (data.linked_po_id && data.linked_po) {
      try {
        const { data: poItems } = await supabase
          .from('client_po_items')
          .select('product_id, description, quantity, unit, selling_price, cost_price')
          .eq('purchase_order_id', data.linked_po_id);
        if (poItems && poItems.length > 0) {
          data.linked_po.items = poItems;
        }
      } catch (err) {
        console.log('client_po_items non chargés:', err.message);
      }
    }

    // Charger les bl_number parent/child pour navigation BO
    if (data.parent_bl_id) {
      const { data: parentBL } = await supabase
        .from('delivery_notes')
        .select('bl_number')
        .eq('id', data.parent_bl_id)
        .single();
      data.parent_bl_number = parentBL?.bl_number || null;
    }
    if (data.child_bl_id) {
      const { data: childBL } = await supabase
        .from('delivery_notes')
        .select('bl_number')
        .eq('id', data.child_bl_id)
        .single();
      data.child_bl_number = childBL?.bl_number || null;
    }

    return NextResponse.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('Erreur GET single delivery note:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT - Mettre à jour un bon de livraison
export async function PUT(request, { params }) {
  try {
    const body = await request.json();
    const supabase = supabaseAdmin;
    const deliveryNoteId = parseInt(params.id);

    const { materials = [], client, linked_po, ...updateData } = body;

    // Gérer le linked_po_id
    let finalLinkedPoId = null;

    if (updateData.linked_po_id) {
      const poValue = String(updateData.linked_po_id).trim();

      if (!poValue) {
        finalLinkedPoId = null;
      } else if (updateData.is_manual_po) {
        const { data: existingPO } = await supabase
          .from('purchase_orders')
          .select('id')
          .eq('po_number', poValue)
          .single();

        if (existingPO) {
          finalLinkedPoId = existingPO.id;
        } else {
          const { data: clientData } = await supabase
            .from('clients')
            .select('name')
            .eq('id', updateData.client_id)
            .single();

          const clientName = clientData?.name || 'Client inconnu';

          const { data: newPO, error: poError } = await supabase
            .from('purchase_orders')
            .insert({
              po_number: poValue,
              client_id: parseInt(updateData.client_id),
              status: 'in_progress',
              date: updateData.delivery_date,
              po_date: updateData.delivery_date,
              description: updateData.delivery_description || '',
              created_by: null,
              amount: 0,
              client_name: clientName,
              notes: `PO créé automatiquement lors de la modification d'un BL. Date: ${updateData.delivery_date}`
            })
            .select()
            .single();

          if (poError) {
            finalLinkedPoId = null;
          } else {
            finalLinkedPoId = newPO.id;
          }
        }
      } else {
        finalLinkedPoId = parseInt(poValue);
      }
    }

    // 1. Mettre à jour le delivery_note
    const { data: updatedDeliveryNote, error: updateError } = await supabase
      .from('delivery_notes')
      .update({
        client_id: updateData.client_id ? parseInt(updateData.client_id) : null,
        client_name: updateData.client_name || null,
        linked_po_id: finalLinkedPoId,
        delivery_date: updateData.delivery_date,
        delivery_description: updateData.delivery_description || null,
        status: updateData.status || 'draft',
        recipient_emails: updateData.recipient_emails || [],
        is_prix_jobe: updateData.is_prix_jobe || false
      })
      .eq('id', deliveryNoteId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // 2. Supprimer les anciens matériaux
    const { error: deleteError } = await supabase
      .from('delivery_note_materials')
      .delete()
      .eq('delivery_note_id', deliveryNoteId);

    if (deleteError) {
      return NextResponse.json({ error: 'Erreur suppression matériaux: ' + deleteError.message }, { status: 500 });
    }

    // 3. Insérer les nouveaux matériaux
    if (materials && materials.length > 0) {
      const materialsData = materials.map(material => {
        let validProductId = null;
        if (material.product_id &&
            typeof material.product_id === 'string' &&
            !material.product_id.startsWith('temp-') &&
            !material.product_id.startsWith('supplier-') &&
            !material.product_id.startsWith('sub-') &&
            !material.product_id.startsWith('IMP-') &&
            !material.product_id.includes('-')) {
          validProductId = material.product_id;
        }

        const materialRow = {
          delivery_note_id: deliveryNoteId,
          product_id: validProductId,
          product_code: material.code || material.display_code || material.product?.product_id || null,
          description: material.description || material.product?.description || null,
          quantity: isNaN(parseFloat(material.quantity)) ? 1 : parseFloat(material.quantity),
          unit: material.unit || 'UN',
          unit_price: parseFloat(material.unit_price || material.product?.selling_price || 0),
          notes: material.notes || null,
          show_price: material.showPrice || material.show_price || false
        };

        // Support backorder: quantité commandée et déjà livrée
        if (material.ordered_quantity != null) {
          materialRow.ordered_quantity = parseFloat(material.ordered_quantity);
        }
        if (material.previously_delivered != null) {
          materialRow.previously_delivered = parseFloat(material.previously_delivered) || 0;
        }

        return materialRow;
      });

      let insertError;
      ({ error: insertError } = await supabase
        .from('delivery_note_materials')
        .insert(materialsData)
        .select());

      // Si INSERT échoue (colonnes BO manquantes?), retry sans ordered_quantity/previously_delivered
      if (insertError) {
        console.warn('INSERT matériaux échoué, retry sans colonnes BO:', insertError.message);
        const materialsWithoutBO = materialsData.map(({ ordered_quantity, previously_delivered, ...rest }) => rest);
        ({ error: insertError } = await supabase
          .from('delivery_note_materials')
          .insert(materialsWithoutBO)
          .select());
      }

      if (insertError) {
        return NextResponse.json({
          error: 'Erreur insertion matériaux: ' + insertError.message,
        }, { status: 500 });
      }
    }

    // 4. Récupérer le delivery note complet
    const { data: completeDeliveryNote, error: fetchError } = await supabase
      .from('delivery_notes')
      .select(`
        *,
        client:clients(*),
        linked_po:purchase_orders(*),
        materials:delivery_note_materials(*)
      `)
      .eq('id', deliveryNoteId)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    // Enrichir les matériaux
    if (completeDeliveryNote.materials && completeDeliveryNote.materials.length > 0) {
      for (let material of completeDeliveryNote.materials) {
        if (material.product_id) {
          try {
            const { data: product } = await supabase
              .from('products')
              .select('*')
              .eq('product_id', material.product_id)
              .single();

            if (product) {
              material.product = product;
            } else {
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

    return NextResponse.json({
      success: true,
      data: completeDeliveryNote,
      message: `Bon de livraison ${completeDeliveryNote.bl_number} mis à jour`
    });

  } catch (error) {
    console.error('Erreur PUT delivery note:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
