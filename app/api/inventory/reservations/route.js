/**
 * @file app/api/inventory/reservations/route.js
 * @description API serveur pour calculer les quantités "En commande" (AF) et "Réservé" (BT/BL non signés)
 *              par product_id, ainsi que le détail des documents qui réservent chaque item.
 *              Utilise supabaseAdmin pour bypass RLS (notamment sur work_order_materials).
 * @version 1.0.0
 * @date 2026-04-21
 * @changelog
 *   1.0.0 - Version initiale
 *           Consolide le calcul précédemment fait côté client dans InventoryManager.loadQuantities().
 *           Raison: work_order_materials a RLS SELECT qui bloque les lectures client-side.
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

export async function GET() {
  try {
    const quantities = {}; // { product_id: { onOrder, reserved } }
    const details = {};    // { product_id: [{ type, id, number, status, client, quantity }] }

    const ensureQty = (pid) => {
      if (!quantities[pid]) quantities[pid] = { onOrder: 0, reserved: 0 };
    };
    const addDetail = (pid, entry) => {
      if (!details[pid]) details[pid] = [];
      details[pid].push(entry);
    };

    // 1. En commande: AF avec statut ordered ou partial (items en JSONB)
    const { data: afPurchases } = await supabaseAdmin
      .from('supplier_purchases')
      .select('items, status')
      .in('status', ['ordered', 'partial']);

    if (afPurchases) {
      afPurchases.forEach(purchase => {
        const items = purchase.items || [];
        items.forEach(item => {
          const pid = item.product_id || item.product_code;
          if (!pid) return;
          ensureQty(pid);
          quantities[pid].onOrder += (parseFloat(item.quantity) || 0);
        });
      });
    }

    // 2. Réservé BT: matériaux dans BT draft ou ready_for_signature
    //    (statuts signés/envoyés = stock déjà décrémenté via complete-signature)
    const { data: workOrders } = await supabaseAdmin
      .from('work_orders')
      .select('id, bt_number, status, client:clients(name, company)')
      .in('status', ['draft', 'ready_for_signature']);

    if (workOrders && workOrders.length > 0) {
      const woMap = Object.fromEntries(workOrders.map(wo => [wo.id, wo]));
      const woIds = workOrders.map(wo => wo.id);
      const { data: woMaterials } = await supabaseAdmin
        .from('work_order_materials')
        .select('work_order_id, product_id, product_code, quantity')
        .in('work_order_id', woIds);

      if (woMaterials) {
        woMaterials.forEach(m => {
          // Fallback product_code: WorkOrderForm normalise product_id à NULL
          // pour les codes non-UUID/non-number (voir WorkOrderForm.js:1135-1159).
          // Le SKU texte ("CI71") est alors gardé uniquement dans product_code.
          const pid = m.product_id || m.product_code;
          if (!pid) return;
          const qty = parseFloat(m.quantity) || 0;
          ensureQty(pid);
          quantities[pid].reserved += qty;

          const wo = woMap[m.work_order_id];
          addDetail(pid, {
            type: 'BT',
            id: m.work_order_id,
            number: wo?.bt_number || '?',
            status: wo?.status || '?',
            client: wo?.client?.company || wo?.client?.name || '—',
            quantity: qty,
          });
        });
      }
    }

    // 3. Réservé BL: matériaux dans BL draft ou ready_for_signature
    const { data: deliveryNotes } = await supabaseAdmin
      .from('delivery_notes')
      .select('id, bl_number, status, client_name, client:clients(name, company)')
      .in('status', ['draft', 'ready_for_signature']);

    if (deliveryNotes && deliveryNotes.length > 0) {
      const blMap = Object.fromEntries(deliveryNotes.map(bl => [bl.id, bl]));
      const blIds = deliveryNotes.map(bl => bl.id);
      const { data: blMaterials } = await supabaseAdmin
        .from('delivery_note_materials')
        .select('delivery_note_id, product_id, product_code, quantity')
        .in('delivery_note_id', blIds);

      if (blMaterials) {
        blMaterials.forEach(m => {
          const pid = m.product_id || m.product_code;
          if (!pid) return;
          const qty = parseFloat(m.quantity) || 0;
          ensureQty(pid);
          quantities[pid].reserved += qty;

          const bl = blMap[m.delivery_note_id];
          addDetail(pid, {
            type: 'BL',
            id: m.delivery_note_id,
            number: bl?.bl_number || '?',
            status: bl?.status || '?',
            client: bl?.client?.company || bl?.client?.name || bl?.client_name || '—',
            quantity: qty,
          });
        });
      }
    }

    return NextResponse.json({ success: true, quantities, details });
  } catch (error) {
    console.error('Erreur API reservations:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur interne' },
      { status: 500 }
    );
  }
}
