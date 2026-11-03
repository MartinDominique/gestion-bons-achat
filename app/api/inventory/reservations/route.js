/**
 * @file app/api/inventory/reservations/route.js
 * @description API serveur pour calculer les quantités "En commande" (AF) et "Réservé" (BT/BL non signés)
 *              par product_id, ainsi que le détail des documents qui réservent chaque item.
 *              Utilise supabaseAdmin pour bypass RLS (notamment sur work_order_materials).
 * @version 1.2.0
 * @date 2026-11-03
 * @changelog
 *   1.2.0 - Fix "Réservé -0" sur un BT brouillon valide (BT-2026-207 / JBX884):
 *           - `export const dynamic = 'force-dynamic'`: sans cette directive, Next.js 14
 *             traite une route GET() sans paramètre comme STATIQUE et sert la réponse
 *             calculée au moment du déploiement Vercel. "En commande" et "Réservé"
 *             restaient donc figés jusqu'au déploiement suivant.
 *           - Erreurs Supabase vérifiées sur chaque requête (avant: `data` null ignoré
 *             en silence => "succès" avec zéro réservation pour tous les produits).
 *             Une requête en erreur => HTTP 500 + message explicite.
 *           - Lecture paginée (1000 lignes/page) des matériaux BT/BL et des AF: plus de
 *             coupure silencieuse au plafond "max rows" de Supabase.
 *           - Clés produit normalisées (trim) pour correspondre à la fiche inventaire.
 *           - `?code=XXX` (diagnostic): retourne aussi les lignes brutes trouvées
 *             pour ce code (BT/BL/AF) afin de vérifier sans passer par le SQL.
 *   1.1.0 - Fix "En commande" à +0: inclut désormais le statut `in_order`
 *           (libellé "En commande") en plus de `ordered`/`partial`. Un AF placé
 *           mais non reçu doit compter dans la quantité "En commande" de l'inventaire.
 *   1.0.0 - Version initiale
 *           Consolide le calcul précédemment fait côté client dans InventoryManager.loadQuantities().
 *           Raison: work_order_materials a RLS SELECT qui bloque les lectures client-side.
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

// OBLIGATOIRE: sans cette directive, Next.js 14 met en cache statique une route
// GET() sans paramètre et sert à jamais la réponse calculée au déploiement.
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 1000;

/**
 * Lit toutes les lignes d'une requête Supabase par pages de PAGE_SIZE.
 * `buildQuery` doit retourner une nouvelle requête (non exécutée) à chaque appel.
 * Lance une erreur explicite si Supabase répond en erreur.
 */
async function fetchAll(label, buildQuery) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) {
      throw new Error(`${label}: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

const keyOf = (value) => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
};

export async function GET(request) {
  try {
    const debugCode = keyOf(new URL(request.url).searchParams.get('code'));
    const debugCodeUpper = debugCode ? debugCode.toUpperCase() : null;
    const debugRows = debugCode ? { work_orders: [], delivery_notes: [], supplier_purchases: [] } : null;
    const matchesDebug = (pid) => debugCodeUpper && pid && String(pid).toUpperCase() === debugCodeUpper;

    const quantities = {}; // { product_id: { onOrder, reserved } }
    const details = {};    // { product_id: [{ type, id, number, status, client, quantity }] }

    const ensureQty = (pid) => {
      if (!quantities[pid]) quantities[pid] = { onOrder: 0, reserved: 0 };
    };
    const addDetail = (pid, entry) => {
      if (!details[pid]) details[pid] = [];
      details[pid].push(entry);
    };

    // 1. En commande: AF placé mais non reçu (items en JSONB).
    //    Inclut `in_order` (libellé "En commande"), `ordered` (Commandé) et
    //    `partial` (réception partielle). Exclut draft/received/cancelled.
    const afPurchases = await fetchAll('supplier_purchases', () =>
      supabaseAdmin
        .from('supplier_purchases')
        .select('id, purchase_number, items, status')
        .in('status', ['in_order', 'ordered', 'partial'])
        .order('id', { ascending: true })
    );

    afPurchases.forEach(purchase => {
      const items = Array.isArray(purchase.items) ? purchase.items : [];
      items.forEach(item => {
        const pid = keyOf(item.product_id) || keyOf(item.product_code) || keyOf(item.code);
        if (!pid) return;
        ensureQty(pid);
        quantities[pid].onOrder += (parseFloat(item.quantity) || 0);
        if (matchesDebug(pid)) {
          debugRows.supplier_purchases.push({
            purchase_number: purchase.purchase_number,
            status: purchase.status,
            product_id: item.product_id ?? null,
            product_code: item.product_code ?? item.code ?? null,
            quantity: item.quantity,
          });
        }
      });
    });

    // 2. Réservé BT: matériaux dans BT draft ou ready_for_signature
    //    (statuts signés/envoyés = stock déjà décrémenté via complete-signature)
    const workOrders = await fetchAll('work_orders', () =>
      supabaseAdmin
        .from('work_orders')
        .select('id, bt_number, status, client:clients(name, company)')
        .in('status', ['draft', 'ready_for_signature'])
        .order('id', { ascending: true })
    );

    if (workOrders.length > 0) {
      const woMap = Object.fromEntries(workOrders.map(wo => [wo.id, wo]));
      const woIds = workOrders.map(wo => wo.id);
      const woMaterials = await fetchAll('work_order_materials', () =>
        supabaseAdmin
          .from('work_order_materials')
          .select('id, work_order_id, product_id, product_code, quantity')
          .in('work_order_id', woIds)
          .order('id', { ascending: true })
      );

      woMaterials.forEach(m => {
        // Fallback product_code: WorkOrderForm normalise product_id à NULL
        // pour les codes non-UUID/non-number (voir WorkOrderForm.js:1135-1159).
        // Le SKU texte ("CI71") est alors gardé uniquement dans product_code.
        const pid = keyOf(m.product_id) || keyOf(m.product_code);
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
        if (matchesDebug(pid)) {
          debugRows.work_orders.push({
            bt_number: wo?.bt_number || '?',
            status: wo?.status || '?',
            product_id: m.product_id,
            product_code: m.product_code,
            quantity: qty,
          });
        }
      });
    }

    // 3. Réservé BL: matériaux dans BL draft ou ready_for_signature
    const deliveryNotes = await fetchAll('delivery_notes', () =>
      supabaseAdmin
        .from('delivery_notes')
        .select('id, bl_number, status, client_name, client:clients(name, company)')
        .in('status', ['draft', 'ready_for_signature'])
        .order('id', { ascending: true })
    );

    if (deliveryNotes.length > 0) {
      const blMap = Object.fromEntries(deliveryNotes.map(bl => [bl.id, bl]));
      const blIds = deliveryNotes.map(bl => bl.id);
      const blMaterials = await fetchAll('delivery_note_materials', () =>
        supabaseAdmin
          .from('delivery_note_materials')
          .select('id, delivery_note_id, product_id, product_code, quantity')
          .in('delivery_note_id', blIds)
          .order('id', { ascending: true })
      );

      blMaterials.forEach(m => {
        const pid = keyOf(m.product_id) || keyOf(m.product_code);
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
        if (matchesDebug(pid)) {
          debugRows.delivery_notes.push({
            bl_number: bl?.bl_number || '?',
            status: bl?.status || '?',
            product_id: m.product_id,
            product_code: m.product_code,
            quantity: qty,
          });
        }
      });
    }

    const payload = { success: true, quantities, details, computed_at: new Date().toISOString() };
    if (debugCode) {
      payload.debug = {
        code: debugCode,
        quantities: quantities[debugCode] || quantities[debugCodeUpper] || { onOrder: 0, reserved: 0 },
        rows: debugRows,
      };
    }

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    console.error('Erreur API reservations:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur interne' },
      { status: 500 }
    );
  }
}
