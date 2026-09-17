/**
 * @file lib/services/invoice-inventory.js
 * @description Synchronisation de l'inventaire avec les matériaux d'une facture.
 *              Le stock est déjà sorti à la signature du BT/BL (mouvements 'work_order' /
 *              'delivery_note'). Quand Martin corrige la facture (article retiré, ajouté,
 *              quantité changée), l'inventaire doit suivre:
 *                delta(produit) = qté facturée − qté du BT/BL − ajustements déjà appliqués
 *                delta > 0 → sortie (OUT)  ·  delta < 0 → retour en stock (IN)
 *              Les ajustements sont tracés dans inventory_movements avec
 *              reference_type = 'invoice' et reference_number = N° de facture, ce qui rend
 *              la synchronisation idempotente (re-sauvegarder n'ajuste que la différence).
 *              - Facture Prix Jobé: les matériaux de référence sont ceux du « Détail du
 *                forfait » (jobe_detail_items); sans détail enregistré → aucun ajustement.
 *              - revert: ramène l'inventaire à l'état du BT/BL (suppression de la facture).
 * @version 1.0.0
 * @date 2026-09-17
 * @changelog
 *   1.0.0 - Version initiale
 */

import { supabaseAdmin } from '../supabaseAdmin';

const EPS = 0.0001;
const round4 = (n) => Math.round((parseFloat(n) || 0) * 10000) / 10000;
const keyOf = (code) => (code == null ? '' : String(code).trim());

/** Regroupe des lignes { code, quantity } par code produit (somme des quantités). */
function groupByCode(rows, getCode, getQty) {
  const map = {};
  rows.forEach((r) => {
    const code = keyOf(getCode(r));
    if (!code) return;
    const qty = parseFloat(getQty(r)) || 0;
    map[code] = round4((map[code] || 0) + qty);
  });
  return map;
}

/**
 * Matériaux de référence de la facture (ce que le client se fait facturer).
 * Retourne null si la référence est inconnue (facture Jobé sans détail enregistré).
 */
function invoiceMaterialTargets(invoice) {
  if (invoice.is_prix_jobe) {
    const detail = Array.isArray(invoice.jobe_detail_items) ? invoice.jobe_detail_items : [];
    if (detail.length === 0) return null;
    return groupByCode(
      detail.filter((l) => l && l.type === 'material'),
      (l) => l.product_id || l.detail,
      (l) => l.quantity
    );
  }
  const items = Array.isArray(invoice.line_items) ? invoice.line_items : [];
  return groupByCode(
    items.filter((l) => l && l.type === 'material'),
    (l) => l.product_id || l.detail,
    (l) => l.quantity
  );
}

/** Matériaux du document source (déjà sortis de l'inventaire à la signature). */
async function sourceMaterialBaseline(invoice) {
  const table = invoice.source_type === 'work_order' ? 'work_order_materials' : 'delivery_note_materials';
  const fk = invoice.source_type === 'work_order' ? 'work_order_id' : 'delivery_note_id';
  const { data, error } = await supabaseAdmin
    .from(table)
    .select('product_id, product_code, quantity, description')
    .eq(fk, invoice.source_id);
  if (error) throw new Error(`Lecture ${table}: ${error.message}`);
  const rows = data || [];
  const descriptions = {};
  rows.forEach((m) => {
    const code = keyOf(m.product_id || m.product_code);
    if (code && m.description && !descriptions[code]) descriptions[code] = m.description;
  });
  return {
    baseline: groupByCode(rows, (m) => m.product_id || m.product_code, (m) => m.quantity),
    descriptions,
  };
}

/** Ajustements déjà appliqués pour cette facture (net OUT − IN par produit). */
async function appliedAdjustments(invoiceNumber) {
  const { data, error } = await supabaseAdmin
    .from('inventory_movements')
    .select('product_id, movement_type, quantity')
    .eq('reference_type', 'invoice')
    .eq('reference_number', invoiceNumber);
  if (error) throw new Error(`Lecture inventory_movements: ${error.message}`);
  const map = {};
  (data || []).forEach((m) => {
    const code = keyOf(m.product_id);
    if (!code) return;
    const qty = parseFloat(m.quantity) || 0;
    map[code] = round4((map[code] || 0) + (m.movement_type === 'OUT' ? qty : -qty));
  });
  return map;
}

/** Trouve la fiche (products puis non_inventory_items) qui porte le stock. */
async function findStockRow(code) {
  for (const table of ['products', 'non_inventory_items']) {
    const { data } = await supabaseAdmin
      .from(table)
      .select('product_id, description, unit, stock_qty, cost_price, product_group')
      .eq('product_id', code)
      .maybeSingle();
    if (data) return { table, row: data };
  }
  return null;
}

/**
 * Synchronise l'inventaire avec la facture.
 * @param {number} invoiceId
 * @param {{ revert?: boolean }} options  revert=true → retour à l'état du BT/BL
 * @returns {{ applied: boolean, reason?: string, adjustments: Array, skipped: Array }}
 */
export async function syncInvoiceInventory(invoiceId, { revert = false } = {}) {
  const { data: invoice, error } = await supabaseAdmin
    .from('invoices')
    .select('id, invoice_number, source_type, source_id, source_number, client_name, is_prix_jobe, line_items, jobe_detail_items')
    .eq('id', invoiceId)
    .single();
  if (error || !invoice) throw new Error('Facture introuvable');

  const { baseline, descriptions } = await sourceMaterialBaseline(invoice);
  const applied = await appliedAdjustments(invoice.invoice_number);

  let targets;
  if (revert) {
    targets = { ...baseline };
  } else {
    targets = invoiceMaterialTargets(invoice);
    if (targets === null) {
      return { applied: false, reason: 'Facture Prix Jobé sans détail enregistré: inventaire inchangé', adjustments: [], skipped: [] };
    }
  }

  const codes = new Set([...Object.keys(baseline), ...Object.keys(applied), ...Object.keys(targets)]);
  const adjustments = [];
  const skipped = [];

  for (const code of codes) {
    const delta = round4((targets[code] || 0) - (baseline[code] || 0) - (applied[code] || 0));
    if (Math.abs(delta) < EPS) continue;

    const found = await findStockRow(code);
    if (!found) {
      skipped.push({ product_id: code, delta, reason: 'produit introuvable dans l\'inventaire' });
      continue;
    }
    const { table, row } = found;
    const currentStock = parseFloat(row.stock_qty) || 0;
    const newStock = round4(currentStock - delta);

    const { data: updated, error: updErr } = await supabaseAdmin
      .from(table)
      .update({ stock_qty: newStock.toString() })
      .eq('product_id', code)
      .select('product_id');
    if (updErr || !updated || updated.length === 0) {
      skipped.push({ product_id: code, delta, reason: updErr?.message || 'stock non modifié' });
      continue;
    }

    const absQty = Math.abs(delta);
    const unitCost = Math.abs(parseFloat(row.cost_price) || 0);
    const sign = delta > 0 ? '-' : '+';
    const { error: mvtErr } = await supabaseAdmin.from('inventory_movements').insert({
      product_id: code,
      product_description: row.description || descriptions[code] || '',
      product_group: row.product_group || '',
      unit: row.unit || 'UN',
      movement_type: delta > 0 ? 'OUT' : 'IN',
      quantity: absQty,
      unit_cost: unitCost,
      total_cost: Math.round(absQty * unitCost * 100) / 100,
      reference_type: 'invoice',
      reference_id: null,
      reference_number: invoice.invoice_number,
      notes: `Facture ${invoice.invoice_number} (${invoice.source_number})${revert ? ' — annulation' : ' — correction'}: ${sign}${absQty} vs ${invoice.source_type === 'work_order' ? 'BT' : 'BL'} — ${invoice.client_name || 'Client'}`,
      created_at: new Date().toISOString(),
    });
    if (mvtErr) {
      // Stock modifié mais mouvement non tracé: on annule le stock pour rester cohérent
      await supabaseAdmin.from(table).update({ stock_qty: currentStock.toString() }).eq('product_id', code);
      skipped.push({ product_id: code, delta, reason: `mouvement non enregistré (${mvtErr.message})` });
      continue;
    }

    adjustments.push({
      product_id: code,
      description: row.description || descriptions[code] || '',
      delta,                 // > 0: sortie supplémentaire, < 0: retour en stock
      previous_stock: currentStock,
      new_stock: newStock,
    });
  }

  return { applied: true, adjustments, skipped };
}
