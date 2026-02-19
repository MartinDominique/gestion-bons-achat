/**
 * @file app/api/delivery-notes/[id]/public/route.js
 * @description Route publique pour accès client au BL (page signature)
 *              Bypass auth - accessible sans connexion
 * @version 1.1.0
 * @date 2026-02-18
 * @changelog
 *   1.1.0 - Fix: ajout force-dynamic + revalidate=0 pour éviter le cache
 *           Next.js qui retournait des données périmées (quantités, emails)
 *   1.0.0 - Version initiale
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request, { params }) {
  try {
    const deliveryNoteId = parseInt(params.id);

    if (isNaN(deliveryNoteId)) {
      return NextResponse.json({ error: 'ID invalide' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
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
      return NextResponse.json({ error: 'BL non trouvé' }, { status: 404 });
    }

    // Vérifier que le BL est dans un état présentable
    const allowedStatuses = ['ready_for_signature', 'signed', 'completed', 'sent'];

    // Auto-correction si en draft
    if (data.status === 'draft') {
      const { error: updateError } = await supabaseAdmin
        .from('delivery_notes')
        .update({ status: 'ready_for_signature' })
        .eq('id', deliveryNoteId);

      if (!updateError) {
        data.status = 'ready_for_signature';
      }
    }

    if (!allowedStatuses.includes(data.status)) {
      return NextResponse.json({
        error: 'BL non disponible',
        debug: {
          currentStatus: data.status,
          allowedStatuses: allowedStatuses
        }
      }, { status: 403 });
    }

    // Enrichir les matériaux
    if (data.materials && data.materials.length > 0) {
      for (let material of data.materials) {
        if (material.product_id) {
          try {
            const { data: product } = await supabaseAdmin
              .from('products')
              .select('*')
              .eq('product_id', material.product_id)
              .single();

            if (product) {
              material.product = product;
            } else {
              const { data: nonInvProduct } = await supabaseAdmin
                .from('non_inventory_items')
                .select('*')
                .eq('product_id', material.product_id)
                .single();

              if (nonInvProduct) {
                material.product = nonInvProduct;
              }
            }
          } catch (err) {
            console.log(`Produit non trouvé: ${material.product_id}`);
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
      data: data
    });

  } catch (error) {
    console.error('Erreur GET public delivery note:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
