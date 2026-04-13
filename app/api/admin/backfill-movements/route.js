/**
 * @file app/api/admin/backfill-movements/route.js
 * @description Script de rattrapage one-shot pour créer les mouvements d'inventaire
 *              manquants pour tous les BT et BL envoyés/signés.
 *              Protégé par CRON_SECRET. À exécuter une seule fois.
 *              GET ?dryrun=true  → simulation (affiche ce qui serait créé)
 *              GET ?dryrun=false → exécution réelle
 * @version 1.0.0
 * @date 2026-04-13
 * @changelog
 *   1.0.0 - Version initiale
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  try {
    // Sécurité: vérifier CRON_SECRET
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get('dryrun') !== 'false';

    const results = {
      dryRun,
      workOrders: { found: 0, alreadyHaveMovements: 0, created: 0, materials: 0, errors: [] },
      deliveryNotes: { found: 0, alreadyHaveMovements: 0, created: 0, materials: 0, errors: [] },
      details: []
    };

    // ========================================
    // 1. RATTRAPAGE BT (work_orders)
    // ========================================
    const { data: workOrders, error: woError } = await supabaseAdmin
      .from('work_orders')
      .select(`
        id, bt_number, client_id, status,
        client:clients(name, company_name),
        materials:work_order_materials(product_id, product_code, description, quantity, unit, unit_price)
      `)
      .in('status', ['signed', 'pending_send', 'sent', 'completed']);

    if (woError) {
      results.workOrders.errors.push(`Erreur fetch BT: ${woError.message}`);
    } else {
      results.workOrders.found = workOrders.length;

      for (const wo of workOrders) {
        // Vérifier si des mouvements existent déjà
        const { data: existing } = await supabaseAdmin
          .from('inventory_movements')
          .select('id')
          .eq('reference_type', 'work_order')
          .eq('reference_id', wo.id.toString())
          .limit(1);

        if (existing && existing.length > 0) {
          results.workOrders.alreadyHaveMovements++;
          continue;
        }

        const materials = (wo.materials || []).filter(m => m.product_id && m.quantity);
        if (materials.length === 0) continue;

        const clientName = wo.client?.company_name || wo.client?.name || 'Client';

        for (const material of materials) {
          const qty = parseFloat(material.quantity) || 0;
          if (qty === 0) continue;

          const isCredit = qty < 0;
          const absQty = Math.abs(qty);
          const movementType = isCredit ? 'IN' : 'OUT';
          const unitCost = Math.abs(parseFloat(material.unit_price) || 0);
          const totalCost = Math.round(absQty * unitCost * 100) / 100;

          const movement = {
            product_id: material.product_id,
            product_description: material.description || '',
            product_group: '',
            unit: material.unit || 'UN',
            movement_type: movementType,
            quantity: absQty,
            unit_cost: unitCost,
            total_cost: totalCost,
            reference_type: 'work_order',
            reference_id: wo.id.toString(),
            reference_number: wo.bt_number,
            notes: `BT ${wo.bt_number}${isCredit ? ' (CRÉDIT)' : ''} - ${clientName} [rattrapage]`,
            created_at: new Date().toISOString()
          };

          // Enrichir product_group depuis la table products
          const { data: product } = await supabaseAdmin
            .from('products')
            .select('product_group')
            .eq('product_id', material.product_id)
            .single();

          if (product) {
            movement.product_group = product.product_group || '';
          }

          if (!dryRun) {
            const { error: insertError } = await supabaseAdmin
              .from('inventory_movements')
              .insert(movement);

            if (insertError) {
              results.workOrders.errors.push(`BT ${wo.bt_number} / ${material.product_id}: ${insertError.message}`);
              continue;
            }
          }

          results.workOrders.materials++;
          results.details.push({
            type: 'BT',
            ref: wo.bt_number,
            product: material.product_id,
            description: material.description,
            movement: movementType,
            qty: absQty,
            client: clientName
          });
        }

        results.workOrders.created++;
      }
    }

    // ========================================
    // 2. RATTRAPAGE BL (delivery_notes)
    // ========================================
    const { data: deliveryNotes, error: dnError } = await supabaseAdmin
      .from('delivery_notes')
      .select(`
        id, bl_number, client_id, client_name, status,
        client:clients(name, company_name),
        materials:delivery_note_materials(product_id, description, quantity, unit, unit_price)
      `)
      .in('status', ['signed', 'pending_send', 'sent']);

    if (dnError) {
      results.deliveryNotes.errors.push(`Erreur fetch BL: ${dnError.message}`);
    } else {
      results.deliveryNotes.found = deliveryNotes.length;

      for (const dn of deliveryNotes) {
        // Vérifier si des mouvements existent déjà
        const { data: existing } = await supabaseAdmin
          .from('inventory_movements')
          .select('id')
          .eq('reference_type', 'delivery_note')
          .eq('reference_id', dn.id.toString())
          .limit(1);

        if (existing && existing.length > 0) {
          results.deliveryNotes.alreadyHaveMovements++;
          continue;
        }

        const materials = (dn.materials || []).filter(m => m.product_id && m.quantity);
        if (materials.length === 0) continue;

        const clientName = dn.client?.company_name || dn.client?.name || dn.client_name || 'Client';

        for (const material of materials) {
          const qty = parseFloat(material.quantity) || 0;
          if (qty === 0) continue;

          const isCredit = qty < 0;
          const absQty = Math.abs(qty);
          const movementType = isCredit ? 'IN' : 'OUT';
          const unitCost = Math.abs(parseFloat(material.unit_price) || 0);
          const totalCost = Math.round(absQty * unitCost * 100) / 100;

          const movement = {
            product_id: material.product_id,
            product_description: material.description || '',
            product_group: '',
            unit: material.unit || 'UN',
            movement_type: movementType,
            quantity: absQty,
            unit_cost: unitCost,
            total_cost: totalCost,
            reference_type: 'delivery_note',
            reference_id: dn.id.toString(),
            reference_number: dn.bl_number,
            notes: `BL ${dn.bl_number}${isCredit ? ' (CRÉDIT)' : ''} - ${clientName} [rattrapage]`,
            created_at: new Date().toISOString()
          };

          // Enrichir product_group
          const { data: product } = await supabaseAdmin
            .from('products')
            .select('product_group')
            .eq('product_id', material.product_id)
            .single();

          if (product) {
            movement.product_group = product.product_group || '';
          }

          if (!dryRun) {
            const { error: insertError } = await supabaseAdmin
              .from('inventory_movements')
              .insert(movement);

            if (insertError) {
              results.deliveryNotes.errors.push(`BL ${dn.bl_number} / ${material.product_id}: ${insertError.message}`);
              continue;
            }
          }

          results.deliveryNotes.materials++;
          results.details.push({
            type: 'BL',
            ref: dn.bl_number,
            product: material.product_id,
            description: material.description,
            movement: movementType,
            qty: absQty,
            client: clientName
          });
        }

        results.deliveryNotes.created++;
      }
    }

    return NextResponse.json({
      success: true,
      message: dryRun
        ? 'SIMULATION - Aucun mouvement créé. Ajoutez ?dryrun=false pour exécuter.'
        : 'Rattrapage terminé. Les mouvements ont été créés.',
      summary: {
        bt: `${results.workOrders.created} BT traités (${results.workOrders.materials} mouvements), ${results.workOrders.alreadyHaveMovements} déjà OK, ${results.workOrders.errors.length} erreurs`,
        bl: `${results.deliveryNotes.created} BL traités (${results.deliveryNotes.materials} mouvements), ${results.deliveryNotes.alreadyHaveMovements} déjà OK, ${results.deliveryNotes.errors.length} erreurs`
      },
      ...results
    });

  } catch (error) {
    console.error('Erreur rattrapage mouvements:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
