/**
 * @file app/api/delivery-notes/route.js
 * @description API CRUD pour les Bons de Livraison (BL)
 *              - POST: Créer un nouveau BL
 *              - GET: Lister les BL avec filtres et pagination
 *              - DELETE: Supprimer un BL
 * @version 1.0.0
 * @date 2026-02-12
 * @changelog
 *   1.0.0 - Version initiale
 */

import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      client_id,
      linked_po_id,
      delivery_date,
      delivery_description,
      status,
      materials = [],
      recipient_emails = [],
    } = body;

    // Validation de base
    if (!client_id || !delivery_date) {
      return Response.json(
        { error: 'Champs requis manquants: client_id, delivery_date' },
        { status: 400 }
      );
    }

    const client = supabaseAdmin || supabase;

    // Gérer la création automatique de purchase_order si nécessaire
    let finalLinkedPoId = null;

    if (linked_po_id) {
      const { is_manual_po } = body;
      const shouldCreatePO = is_manual_po || (typeof linked_po_id === 'string' && linked_po_id.trim() && isNaN(linked_po_id));

      if (shouldCreatePO) {
        console.log('Création automatique purchase_order pour:', linked_po_id);

        const { data: existingPO } = await client
          .from('purchase_orders')
          .select('id')
          .eq('po_number', linked_po_id.trim())
          .single();

        if (existingPO) {
          finalLinkedPoId = existingPO.id;
        } else {
          const { data: clientData } = await client
            .from('clients')
            .select('name')
            .eq('id', client_id)
            .single();

          const clientName = clientData?.name || 'Client inconnu';

          const { data: newPO, error: poError } = await client
            .from('purchase_orders')
            .insert({
              po_number: linked_po_id.trim(),
              client_id: parseInt(client_id),
              status: 'in_progress',
              date: delivery_date,
              po_date: delivery_date,
              description: delivery_description || '',
              created_by: null,
              amount: 0,
              client_name: clientName,
              notes: `PO créé automatiquement lors de la création d'un BL. Date: ${delivery_date}`
            })
            .select()
            .single();

          if (poError) {
            console.error('Erreur création purchase_order:', poError);
            finalLinkedPoId = null;
          } else {
            finalLinkedPoId = newPO.id;
          }
        }
      } else {
        finalLinkedPoId = parseInt(linked_po_id);
      }
    }

    // 1. Créer le delivery_note principal
    const deliveryNoteData = {
      client_id: parseInt(client_id),
      client_name: body.client_name || null,
      linked_po_id: finalLinkedPoId,
      delivery_date,
      delivery_description: delivery_description || '',
      status: status || 'draft',
      recipient_emails: recipient_emails || [],
      is_prix_jobe: body.is_prix_jobe || false,
    };

    const { data: deliveryNote, error: deliveryNoteError } = await client
      .from('delivery_notes')
      .insert([deliveryNoteData])
      .select()
      .single();

    if (deliveryNoteError) {
      console.error('Erreur création delivery_note:', deliveryNoteError);
      return Response.json(
        { error: 'Erreur création bon de livraison', details: deliveryNoteError.message },
        { status: 500 }
      );
    }

    console.log('Bon de livraison créé:', deliveryNote.bl_number);

    // 2. Ajouter les matériaux si présents
    let deliveryNoteMaterials = [];
    if (materials && materials.length > 0) {
      const materialsData = materials.map(material => {
        let validProductId = null;
        if (material.product_id &&
            !material.product_id.startsWith('temp-') &&
            !material.product_id.startsWith('IMP-')) {
          validProductId = material.product_id;
        }

        return {
          delivery_note_id: deliveryNote.id,
          product_id: validProductId,
          product_code: material.code || material.product?.product_id || null,
          description: material.description || material.product?.description || null,
          quantity: parseFloat(material.quantity) || 1,
          unit: material.unit || 'UN',
          unit_price: parseFloat(material.unit_price || material.product?.selling_price || 0),
          notes: material.notes || null,
          show_price: material.showPrice || material.show_price || false
        };
      });

      const { data: materialsResult, error: materialsError } = await client
        .from('delivery_note_materials')
        .insert(materialsData)
        .select();

      if (materialsError) {
        console.error('Erreur ajout matériaux:', materialsError);
      } else {
        deliveryNoteMaterials = materialsResult || [];
      }
    }

    // 3. Récupérer le delivery_note complet
    const { data: completeDeliveryNote, error: fetchError } = await client
      .from('delivery_notes')
      .select(`
        *,
        client:clients(*),
        linked_po:purchase_orders(*),
        materials:delivery_note_materials(*)
      `)
      .eq('id', deliveryNote.id)
      .single();

    if (fetchError) {
      return Response.json({
        success: true,
        data: { ...deliveryNote, materials: deliveryNoteMaterials },
        message: 'Bon de livraison créé avec succès'
      });
    }

    return Response.json({
      success: true,
      data: completeDeliveryNote,
      message: `Bon de livraison ${completeDeliveryNote.bl_number} créé avec succès`
    });

  } catch (error) {
    console.error('Erreur API delivery-notes POST:', error);
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

    let query = supabaseAdmin
      .from('delivery_notes')
      .select(`
        id,
        bl_number,
        client_id,
        client_name,
        linked_po_id,
        delivery_date,
        delivery_description,
        status,
        client:clients(id, name),
        linked_po:purchase_orders(id, po_number)
      `, { count: 'exact' })
      .order('bl_number', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (client_id) {
      query = query.eq('client_id', client_id);
    }

    if (search) {
      query = query.or(`
        bl_number.ilike.%${search}%,
        delivery_description.ilike.%${search}%
      `);
    }

    const from = page * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('Erreur récupération delivery_notes:', error);
      return Response.json(
        { success: false, error: 'Erreur récupération bons de livraison', details: error.message },
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
    console.error('Erreur API delivery-notes GET:', error);
    return Response.json(
      { success: false, error: 'Erreur serveur', details: error.message },
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

    const { error } = await supabaseAdmin
      .from('delivery_notes')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Erreur suppression delivery_note:', error);
      return Response.json(
        { error: 'Erreur suppression bon de livraison' },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      message: 'Bon de livraison supprimé avec succès'
    });

  } catch (error) {
    console.error('Erreur API delivery-notes DELETE:', error);
    return Response.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
