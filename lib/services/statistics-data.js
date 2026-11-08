/**
 * @file lib/services/statistics-data.js
 * @description Données du rapport « Statistiques opérationnelles » (BT, BL, Soumissions)
 *              — source unique des revenus / coûts / marges affichés par /api/statistics.
 *
 *              RÈGLE PRINCIPALE — la facture fait foi:
 *              - BT/BL FACTURÉ (facture dans l'app): revenu = sous-total hors taxes de la
 *                (des) facture(s) liée(s), ventilé M.O. / transport / matériaux / forfait
 *                (lignes `line_items`, même ventilation que les rapports compta). Les notes
 *                de crédit liées au même document réduisent le revenu.
 *              - BT/BL NON FACTURÉ (ou facturé dans Acomba, ou fermé « Varia »): revenu
 *                ESTIMÉ depuis le document, exactement comme l'éditeur de facture le
 *                pré-remplit: heures × taux client (surcharges soir/samedi/dimanche 1,5×,
 *                férié 2×) + frais de déplacement par session + matériaux (qté × vendant;
 *                item importé d'un AF → vendant inventaire). Drapeau `estimated: true`.
 *
 *              COÛTS:
 *              - Matériaux: qté × coûtant de la fiche produit, trouvée par `product_id` OU
 *                `product_code` (les SKU texte sont souvent stockés en product_code seul),
 *                dans `products` puis `non_inventory_items`. Facture Prix Jobé: coûtant
 *                figé du « Détail du forfait » (jobe_detail_items) si présent.
 *              - Main d'oeuvre: heures × `settings.labor_cost_hourly_rate` (coût interne,
 *                Paramètres). Si ce taux est 0 (non configuré), aucun coût M.O. n'est
 *                compté et `laborCostIncluded` = false dans le résumé.
 *
 *              Avant (v1): revenu = matériaux seulement (M.O. et transport ignorés → un BT
 *              de 3 500 $ affichait 107 $), coûtant cherché par product_id seul (→ 1 $).
 *
 *              Soumissions: valeur (qté × vendant) et coûtant des items, listées mais
 *              EXCLUES des totaux de ventes (une soumission n'est pas une vente; le BT/BL
 *              issu de la même soumission compterait en double) → `summary.soumValue`.
 * @version 1.0.0
 * @date 2026-11-08
 * @changelog
 *   1.0.0 - Version initiale (extraction + refonte du calcul de /api/statistics v1)
 */

import { supabaseAdmin } from '../supabaseAdmin';
import { lookupProducts, normalizeCode } from './product-associations';
import { isDeduction, isExternalInvoice } from '../constants/deduction';
import { salesBreakdown } from './report-data';

const PAGE = 1000;
const CHUNK = 150;
const round2 = (n) => Math.round(((parseFloat(n) || 0) + Number.EPSILON) * 100) / 100;

/** Lecture paginée (jamais coupée au plafond « max rows » de Supabase). */
async function fetchAll(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

function chunk(arr, size = CHUNK) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Taux horaire selon la surcharge (identique à InvoiceEditor.getRate). */
export function rateForSurcharge(baseRate, surchargeType) {
  switch (surchargeType) {
    case 'holiday': return baseRate * 2.0;
    case 'sunday':
    case 'saturday':
    case 'evening': return baseRate * 1.5;
    default: return baseRate;
  }
}

/** Matériau importé d'un AF: unit_price = coûtant fournisseur (identique à InvoiceEditor). */
function isImportedFromSupplier(mat) {
  if (!mat) return false;
  if (mat.from_supplier_purchase) return true;
  return /Importé de (AF )?#/i.test(mat.notes || '');
}

/** Code produit d'un matériau BT/BL ou d'une ligne de facture. */
function materialCode(m) {
  return normalizeCode(m?.product_id || m?.product_code || m?.code || m?.detail || '');
}

/**
 * Revenu ESTIMÉ d'un BT depuis ses sessions + matériaux (même logique que le
 * pré-remplissage de la facture).
 */
export function estimateWorkOrderRevenue(bt, settings, productMap) {
  const baseRate = parseFloat(bt.client?.hourly_rate_regular) || parseFloat(settings?.default_hourly_rate) || 0;
  const transportFee = parseFloat(bt.client?.transport_fee) || 0;
  let labor = 0, transport = 0, materials = 0, hours = 0;

  (bt.time_entries || []).forEach((entry) => {
    const h = parseFloat(entry.total_hours) || 0;
    hours += h;
    labor += h * rateForSurcharge(baseRate, entry.surcharge_type || null);
    if (entry.include_transport_fee) transport += transportFee;
  });

  (bt.materials || []).forEach((m) => {
    const qty = parseFloat(m.quantity) || 0;
    const product = productMap[materialCode(m)];
    const unitPrice = parseFloat(m.unit_price) || 0;
    const price = isImportedFromSupplier(m)
      ? (product?.selling_price || unitPrice)
      : (unitPrice || product?.selling_price || 0);
    materials += qty * price;
  });

  return {
    labor: round2(labor), transport: round2(transport), materials: round2(materials), forfait: 0,
    total: round2(labor + transport + materials), hours: round2(hours),
  };
}

/** Revenu ESTIMÉ d'un BL (matériaux livrés). */
export function estimateDeliveryNoteRevenue(bl, productMap) {
  let materials = 0;
  (bl.materials || []).forEach((m) => {
    const qty = parseFloat(m.quantity) || 0;
    const product = productMap[materialCode(m)];
    const unitPrice = parseFloat(m.unit_price) || 0;
    const price = isImportedFromSupplier(m)
      ? (product?.selling_price || unitPrice)
      : (unitPrice || product?.selling_price || 0);
    materials += qty * price;
  });
  return { labor: 0, transport: 0, materials: round2(materials), forfait: 0, total: round2(materials), hours: 0 };
}

/** Coûtant des matériaux d'un BT/BL (fiche produit par product_id OU product_code). */
export function documentMaterialCost(doc, productMap) {
  let cost = 0;
  let unknown = 0;
  (doc.materials || []).forEach((m) => {
    const qty = parseFloat(m.quantity) || 0;
    const product = productMap[materialCode(m)];
    if (product) cost += qty * (parseFloat(product.cost_price) || 0);
    else if (isImportedFromSupplier(m)) cost += qty * (parseFloat(m.unit_price) || 0); // coûtant AF
    else if (materialCode(m)) unknown += 1;
  });
  return { cost: round2(cost), unknownProducts: unknown };
}

/**
 * Coûts d'une facture: matériaux (lignes material → fiche produit; Prix Jobé → détail du
 * forfait avec coûtants figés) + M.O. (heures × coût horaire interne).
 */
export function invoiceCosts(inv, productMap, laborCostRate) {
  const lines = Array.isArray(inv.line_items) ? inv.line_items : [];
  const detail = Array.isArray(inv.jobe_detail_items) ? inv.jobe_detail_items : [];
  let materials = 0, labor = 0, hours = 0, unknown = 0;

  const costLines = (inv.is_prix_jobe && detail.length > 0) ? detail : lines;
  costLines.forEach((li) => {
    const qty = parseFloat(li.quantity) || 0;
    if (li.type === 'material') {
      const product = productMap[materialCode(li)];
      const frozen = li.cost_price != null ? parseFloat(li.cost_price) : null;
      if (product) materials += qty * (parseFloat(product.cost_price) || 0);
      else if (frozen != null && !Number.isNaN(frozen)) materials += qty * frozen;
      else if (materialCode(li)) unknown += 1;
    } else if (li.type === 'labor') {
      hours += qty;
      const frozenRate = li.labor_cost_rate != null ? parseFloat(li.labor_cost_rate) : null;
      const rate = (frozenRate != null && !Number.isNaN(frozenRate) && frozenRate > 0) ? frozenRate : laborCostRate;
      labor += qty * rate;
    }
  });

  return { materials: round2(materials), labor: round2(labor), hours: round2(hours), unknownProducts: unknown };
}

/** Résumé compact d'une facture pour la ligne du rapport. */
function invoiceSummary(inv) {
  return {
    id: inv.id,
    invoice_number: inv.invoice_number,
    status: inv.status,
    invoice_date: inv.invoice_date,
    subtotal: round2(inv.subtotal),
    total: round2(inv.total),
    is_credit: (parseFloat(inv.total) || 0) < 0,
  };
}

/**
 * Construit le rapport (documents triés + résumé), SANS pagination.
 * @param {object} f filtres: { types, dateFrom, dateTo, clientId, documentNumber, search,
 *                             productSearch, invoiced ('all'|'invoiced'|'not_invoiced'), sortBy, sortOrder }
 */
export async function buildSalesStatistics(f) {
  const types = f.types && f.types.length ? f.types : ['bt', 'bl', 'soumission'];
  const clientId = f.clientId ? parseInt(f.clientId, 10) : null;

  // ---- Paramètres (taux par défaut + coût horaire interne) ----
  const { data: settings, error: settingsErr } = await supabaseAdmin
    .from('settings')
    .select('default_hourly_rate, labor_cost_hourly_rate')
    .eq('id', 1)
    .maybeSingle();
  if (settingsErr) throw new Error(`Lecture paramètres: ${settingsErr.message}`);
  const laborCostRate = parseFloat(settings?.labor_cost_hourly_rate) || 0;

  // ---- BT ----
  let bts = [];
  if (types.includes('bt')) {
    bts = await fetchAll(() => {
      let q = supabaseAdmin
        .from('work_orders')
        .select(`
          id, bt_number, client_id, work_date, work_description, status, invoice_id, linked_po_id,
          is_prix_jobe, total_hours, time_entries,
          client:clients(id, name, hourly_rate_regular, transport_fee),
          materials:work_order_materials(id, product_id, product_code, description, quantity, unit, unit_price, notes)
        `)
        .neq('status', 'draft')
        .order('id', { ascending: true });
      if (f.dateFrom) q = q.gte('work_date', f.dateFrom);
      if (f.dateTo) q = q.lte('work_date', f.dateTo);
      if (clientId) q = q.eq('client_id', clientId);
      if (f.documentNumber) q = q.ilike('bt_number', `%${f.documentNumber}%`);
      if (f.search) q = q.ilike('work_description', `%${f.search}%`);
      return q;
    }).catch((e) => { throw new Error(`Lecture BT: ${e.message}`); });
  }

  // ---- BL ----
  let bls = [];
  if (types.includes('bl')) {
    bls = await fetchAll(() => {
      let q = supabaseAdmin
        .from('delivery_notes')
        .select(`
          id, bl_number, client_id, client_name, delivery_date, delivery_description, status, invoice_id, linked_po_id,
          is_prix_jobe,
          materials:delivery_note_materials(id, product_id, product_code, description, quantity, unit, unit_price, notes)
        `)
        .neq('status', 'draft')
        .order('id', { ascending: true });
      if (f.dateFrom) q = q.gte('delivery_date', f.dateFrom);
      if (f.dateTo) q = q.lte('delivery_date', f.dateTo);
      if (clientId) q = q.eq('client_id', clientId);
      if (f.documentNumber) q = q.ilike('bl_number', `%${f.documentNumber}%`);
      if (f.search) q = q.ilike('delivery_description', `%${f.search}%`);
      return q;
    }).catch((e) => { throw new Error(`Lecture BL: ${e.message}`); });
  }

  // ---- Soumissions ----
  let soums = [];
  if (types.includes('soumission')) {
    soums = await fetchAll(() => {
      let q = supabaseAdmin
        .from('submissions')
        .select('id, submission_number, client_name, description, status, items, created_at')
        .order('id', { ascending: true });
      if (f.dateFrom) q = q.gte('created_at', f.dateFrom);
      if (f.dateTo) q = q.lte('created_at', `${f.dateTo}T23:59:59`);
      if (f.documentNumber) q = q.ilike('submission_number', `%${f.documentNumber}%`);
      if (f.search) q = q.ilike('description', `%${f.search}%`);
      return q;
    }).catch((e) => { throw new Error(`Lecture soumissions: ${e.message}`); });

    if (clientId) {
      const { data: clientRow } = await supabaseAdmin.from('clients').select('name').eq('id', clientId).maybeSingle();
      const name = (clientRow?.name || '').toLowerCase();
      soums = name ? soums.filter((s) => (s.client_name || '').toLowerCase().includes(name)) : [];
    }
  }

  // ---- BA liés (N° BA + N° soumission) ----
  const poIds = [...new Set([...bts, ...bls].map((d) => d.linked_po_id).filter((v) => v != null))];
  const poMap = {};
  for (const ids of chunk(poIds)) {
    const { data, error } = await supabaseAdmin.from('purchase_orders').select('id, po_number, submission_no').in('id', ids);
    if (error) throw new Error(`Lecture BA: ${error.message}`);
    (data || []).forEach((po) => { poMap[po.id] = po; });
  }

  // ---- Factures liées (par source OU par invoice_id) ----
  const invoiceSelect = 'id, invoice_number, invoice_date, status, subtotal, total, line_items, jobe_detail_items, is_prix_jobe, source_type, source_id, sent_at';
  const invoicesById = new Map();
  const addInvoices = (rows) => (rows || []).forEach((inv) => invoicesById.set(inv.id, inv));

  for (const ids of chunk(bts.map((d) => d.id))) {
    const { data, error } = await supabaseAdmin.from('invoices').select(invoiceSelect).eq('source_type', 'work_order').in('source_id', ids);
    if (error) throw new Error(`Lecture factures (BT): ${error.message}`);
    addInvoices(data);
  }
  for (const ids of chunk(bls.map((d) => d.id))) {
    const { data, error } = await supabaseAdmin.from('invoices').select(invoiceSelect).eq('source_type', 'delivery_note').in('source_id', ids);
    if (error) throw new Error(`Lecture factures (BL): ${error.message}`);
    addInvoices(data);
  }
  const directInvoiceIds = [...new Set([...bts, ...bls].map((d) => Number(d.invoice_id)).filter((v) => v > 0 && !invoicesById.has(v)))];
  for (const ids of chunk(directInvoiceIds)) {
    const { data, error } = await supabaseAdmin.from('invoices').select(invoiceSelect).in('id', ids);
    if (error) throw new Error(`Lecture factures (lien): ${error.message}`);
    addInvoices(data);
  }

  const invoicesForDoc = (sourceType, doc) => {
    const list = [];
    for (const inv of invoicesById.values()) {
      if (inv.source_type === sourceType && Number(inv.source_id) === Number(doc.id)) list.push(inv);
      else if (Number(doc.invoice_id) > 0 && inv.id === Number(doc.invoice_id) && !list.includes(inv)) list.push(inv);
    }
    return list;
  };

  // ---- Fiches produits (coûtant/vendant) par code ----
  const codes = new Set();
  [...bts, ...bls].forEach((d) => (d.materials || []).forEach((m) => { const c = materialCode(m); if (c) codes.add(c); }));
  for (const inv of invoicesById.values()) {
    (Array.isArray(inv.line_items) ? inv.line_items : []).forEach((li) => { if (li.type === 'material') { const c = materialCode(li); if (c) codes.add(c); } });
    (Array.isArray(inv.jobe_detail_items) ? inv.jobe_detail_items : []).forEach((li) => { if (li.type === 'material') { const c = materialCode(li); if (c) codes.add(c); } });
  }
  const productMap = {};
  for (const part of chunk([...codes])) {
    Object.assign(productMap, await lookupProducts(part));
  }

  // ---- Documents ----
  const documents = [];

  const pushSalesDoc = (kind, d) => {
    const isBT = kind === 'BT';
    const sourceType = isBT ? 'work_order' : 'delivery_note';
    const invs = invoicesForDoc(sourceType, d);
    const estimate = isBT ? estimateWorkOrderRevenue(d, settings, productMap) : estimateDeliveryNoteRevenue(d, productMap);
    const docMat = documentMaterialCost(d, productMap);
    const po = d.linked_po_id != null ? poMap[d.linked_po_id] : null;

    let source, estimated, revenue, breakdown, matCost, laborCost, hours, unknown;
    if (invs.length > 0) {
      source = 'invoice';
      estimated = false;
      breakdown = { labor: 0, transport: 0, materials: 0, forfait: 0 };
      revenue = 0; matCost = 0; laborCost = 0; hours = 0; unknown = 0;
      invs.forEach((inv) => {
        const b = salesBreakdown(inv);
        breakdown.labor += b.labor; breakdown.transport += b.transport; breakdown.materials += b.mat; breakdown.forfait += b.forfait;
        revenue += parseFloat(inv.subtotal) || 0;
        const c = invoiceCosts(inv, productMap, laborCostRate);
        matCost += c.materials; laborCost += c.labor; hours += c.hours; unknown += c.unknownProducts;
      });
    } else {
      source = isExternalInvoice(d.invoice_id) ? 'external' : isDeduction(d.invoice_id) ? 'deduction' : 'document';
      estimated = true;
      breakdown = { labor: estimate.labor, transport: estimate.transport, materials: estimate.materials, forfait: 0 };
      revenue = estimate.total;
      matCost = docMat.cost;
      hours = estimate.hours;
      laborCost = round2(hours * laborCostRate);
      unknown = docMat.unknownProducts;
    }

    revenue = round2(revenue);
    const cost = round2(matCost + laborCost);
    const margin = round2(revenue - cost);

    // Codes + descriptions pour le filtre « Produit / Item »
    const itemTokens = [];
    (d.materials || []).forEach((m) => itemTokens.push(materialCode(m), (m.description || '').toLowerCase()));
    invs.forEach((inv) => (Array.isArray(inv.line_items) ? inv.line_items : []).forEach((li) => itemTokens.push(materialCode(li), (li.description || '').toLowerCase())));

    documents.push({
      type: kind,
      id: d.id,
      documentNumber: isBT ? d.bt_number : d.bl_number,
      date: isBT ? d.work_date : d.delivery_date,
      clientId: d.client_id,
      clientName: isBT ? (d.client?.name || 'N/A') : (d.client_name || 'N/A'),
      description: (isBT ? d.work_description : d.delivery_description) || '',
      revenue,
      cost,
      margin,
      marginPercent: revenue !== 0 ? round2((margin / Math.abs(revenue)) * 100) : 0,
      status: d.status,
      isPrixJobe: !!d.is_prix_jobe,
      isDeduction: isDeduction(d.invoice_id),
      isExternalInvoice: isExternalInvoice(d.invoice_id),
      materialCount: (d.materials || []).length,
      totalHours: isBT ? round2(d.total_hours || 0) : 0,
      // Nouveau (v2)
      source,                      // 'invoice' | 'document' | 'external' | 'deduction'
      estimated,                   // true = revenu estimé depuis le document (aucune facture dans l'app)
      revenueBreakdown: { labor: round2(breakdown.labor), transport: round2(breakdown.transport), materials: round2(breakdown.materials), forfait: round2(breakdown.forfait) },
      costBreakdown: { materials: round2(matCost), labor: round2(laborCost), hours: round2(hours) },
      unknownProducts: unknown,    // matériaux sans fiche produit (coûtant inconnu → 0)
      invoices: invs.map(invoiceSummary),
      linkedPo: po ? { id: po.id, po_number: po.po_number, submission_no: po.submission_no || null } : null,
      _itemTokens: itemTokens,
    });
  };

  bts.forEach((bt) => pushSalesDoc('BT', bt));
  bls.forEach((bl) => pushSalesDoc('BL', bl));

  soums.forEach((s) => {
    const items = Array.isArray(s.items) ? s.items : [];
    let revenue = 0, cost = 0;
    const itemTokens = [];
    items.forEach((it) => {
      const qty = parseFloat(it.quantity) || 0;
      revenue += qty * (parseFloat(it.selling_price) || 0);
      cost += qty * (parseFloat(it.cost_price) || 0);
      itemTokens.push(normalizeCode(it.product_id || it.code || ''), (it.description || '').toLowerCase());
    });
    revenue = round2(revenue); cost = round2(cost);
    const margin = round2(revenue - cost);
    documents.push({
      type: 'Soum.',
      id: s.id,
      documentNumber: s.submission_number,
      date: s.created_at ? String(s.created_at).split('T')[0] : null,
      clientId: null,
      clientName: s.client_name || 'N/A',
      description: s.description || '',
      revenue, cost, margin,
      marginPercent: revenue !== 0 ? round2((margin / Math.abs(revenue)) * 100) : 0,
      status: s.status,
      isPrixJobe: false,
      isDeduction: false,
      isExternalInvoice: false,
      materialCount: items.length,
      totalHours: 0,
      source: 'quote',
      estimated: false,
      revenueBreakdown: { labor: 0, transport: 0, materials: revenue, forfait: 0 },
      costBreakdown: { materials: cost, labor: 0, hours: 0 },
      unknownProducts: 0,
      invoices: [],
      linkedPo: null,
      _itemTokens: itemTokens,
    });
  });

  // ---- Filtres post-traitement ----
  let filtered = documents;
  if (f.productSearch) {
    const needleCode = normalizeCode(f.productSearch);
    const needleText = String(f.productSearch).toLowerCase();
    filtered = filtered.filter((doc) => doc._itemTokens.some((t) => t && (t === needleCode || t.includes(needleText) || t.includes(needleCode))));
  }
  if (f.invoiced === 'invoiced') {
    filtered = filtered.filter((doc) => doc.type === 'Soum.' ? false : (doc.source === 'invoice' || doc.source === 'external' || doc.source === 'deduction'));
  } else if (f.invoiced === 'not_invoiced') {
    filtered = filtered.filter((doc) => doc.type !== 'Soum.' && doc.source === 'document');
  }
  filtered.forEach((doc) => { delete doc._itemTokens; });

  // ---- Tri ----
  const sortBy = f.sortBy || 'date';
  const asc = f.sortOrder === 'asc';
  const cmp = (a, b) => {
    const pick = (d) => {
      switch (sortBy) {
        case 'margin': return d.margin;
        case 'revenue': return d.revenue;
        case 'cost': return d.cost;
        case 'marginPercent': return d.marginPercent;
        case 'client': return d.clientName || '';
        case 'date':
        default: return d.date || '';
      }
    };
    const va = pick(a), vb = pick(b);
    if (typeof va === 'string') return asc ? va.localeCompare(vb) : vb.localeCompare(va);
    return asc ? va - vb : vb - va;
  };
  filtered.sort(cmp);

  // ---- Résumé: ventes = BT + BL seulement; soumissions à part ----
  const sales = filtered.filter((d) => d.type !== 'Soum.');
  const quotes = filtered.filter((d) => d.type === 'Soum.');
  const summary = {
    documentCount: filtered.length,
    btCount: sales.filter((d) => d.type === 'BT').length,
    blCount: sales.filter((d) => d.type === 'BL').length,
    soumCount: quotes.length,
    salesCount: sales.length,
    totalRevenue: 0, totalCost: 0, totalMargin: 0, marginPercent: 0,
    invoicedRevenue: 0, invoicedCount: 0,
    estimatedRevenue: 0, estimatedCount: 0,
    revenueBreakdown: { labor: 0, transport: 0, materials: 0, forfait: 0 },
    costBreakdown: { materials: 0, labor: 0, hours: 0 },
    unknownProductsCount: 0,
    laborCostIncluded: laborCostRate > 0,
    laborCostRate,
    soumValue: 0, soumCost: 0,
  };
  sales.forEach((d) => {
    summary.totalRevenue += d.revenue;
    summary.totalCost += d.cost;
    summary.totalMargin += d.margin;
    if (d.estimated) { summary.estimatedRevenue += d.revenue; summary.estimatedCount += 1; }
    else { summary.invoicedRevenue += d.revenue; summary.invoicedCount += 1; }
    summary.revenueBreakdown.labor += d.revenueBreakdown.labor;
    summary.revenueBreakdown.transport += d.revenueBreakdown.transport;
    summary.revenueBreakdown.materials += d.revenueBreakdown.materials;
    summary.revenueBreakdown.forfait += d.revenueBreakdown.forfait;
    summary.costBreakdown.materials += d.costBreakdown.materials;
    summary.costBreakdown.labor += d.costBreakdown.labor;
    summary.costBreakdown.hours += d.costBreakdown.hours;
    summary.unknownProductsCount += d.unknownProducts || 0;
  });
  quotes.forEach((d) => { summary.soumValue += d.revenue; summary.soumCost += d.cost; });

  ['totalRevenue', 'totalCost', 'totalMargin', 'invoicedRevenue', 'estimatedRevenue', 'soumValue', 'soumCost'].forEach((k) => { summary[k] = round2(summary[k]); });
  Object.keys(summary.revenueBreakdown).forEach((k) => { summary.revenueBreakdown[k] = round2(summary.revenueBreakdown[k]); });
  Object.keys(summary.costBreakdown).forEach((k) => { summary.costBreakdown[k] = round2(summary.costBreakdown[k]); });
  summary.marginPercent = summary.totalRevenue !== 0 ? round2((summary.totalMargin / Math.abs(summary.totalRevenue)) * 100) : 0;

  return { documents: filtered, summary };
}
