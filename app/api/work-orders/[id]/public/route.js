import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';

export async function GET(request, { params }) {
  try {
    const workOrderId = parseInt(params.id);
    
    if (isNaN(workOrderId)) {
      return NextResponse.json({ error: 'ID invalide' }, { status: 400 });
    }

    // Utiliser supabaseAdmin qui bypass l'authentification
    const { data, error } = await supabaseAdmin
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
      console.error('Erreur récupération BT public:', error);
      return NextResponse.json({ error: 'BT non trouvé' }, { status: 404 });
    }

    // Vérifier que le BT est dans un état présentable
    if (data.status !== 'ready_for_signature' && data.status !== 'signed' && data.status !== 'completed') {
      return NextResponse.json({ error: 'BT non disponible' }, { status: 403 });
    }

    // Enrichir les matériaux avec les infos produit
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

    return NextResponse.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('Erreur GET public work order:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
