/**
 * @file app/api/products/merge/route.js
 * @description Fusion de deux fiches produit en double (Inventaire).
 *              La fiche « à retirer » (from) est fusionnée dans la fiche « à conserver » (to):
 *              - GET  ?from_source=&from_code=&from_id=&to_source=&to_code=&to_id= → aperçu
 *                (les 2 fiches + nombre de lignes qui seront transférées, sans rien modifier)
 *              - POST { from: {source, code, id}, to: {source, code, id}, add_stock, description } → fusion
 *                (`to` = la fiche dont on garde le N° de produit; `description` = celle choisie
 *                par l'utilisateur, d'une fiche ou de l'autre)
 *              Transféré vers le code conservé: mouvements d'inventaire, matériaux BT/BL,
 *              lignes de BA, liste À Commander, articles des AF et des soumissions (JSON),
 *              détail du forfait des factures, liens « As » (doublons de liens retirés).
 *              Stock: en main conservé + en main retiré (si add_stock).
 *              Ordre: tous les transferts d'abord, la fiche retirée n'est effacée qu'à la fin.
 *              Une erreur en cours de route laisse les 2 fiches en place → relancer la fusion
 *              reprend où elle s'est arrêtée (chaque transfert est idempotent).
 *              Historique de prix: FUSIONNÉ — le prix actuel de la fiche conservée reste le prix
 *              actuel; les prix précédents des 2 fiches + le prix actuel de la fiche retirée sont
 *              classés du plus récent au plus ancien et les 3 plus récents sont gardés (n-1/n-2/n-3).
 * @version 1.0.0
 * @date 2026-11-19
 * @changelog
 *   1.0.0 - Version initiale
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Colonnes texte qui portent le code du produit (aucune contrainte FK)
const CODE_COLUMNS = [
  { table: 'inventory_movements', column: 'product_id', key: 'movements' },
  { table: 'work_order_materials', column: 'product_id', key: 'work_order_lines' },
  { table: 'work_order_materials', column: 'product_code', key: 'work_order_lines' },
  { table: 'delivery_note_materials', column: 'product_id', key: 'delivery_note_lines' },
  { table: 'delivery_note_materials', column: 'product_code', key: 'delivery_note_lines' },
  { table: 'client_po_items', column: 'product_id', key: 'purchase_order_lines' },
  { table: 'items_to_order', column: 'product_id', key: 'items_to_order' },
  { table: 'items_to_order', column: 'product_code', key: 'items_to_order' },
  { table: 'quote_items', column: 'product_id', key: 'quote_lines', optional: true },
];

// Colonnes JSONB (tableau d'articles) dont chaque article porte product_id
const JSON_COLUMNS = [
  { table: 'supplier_purchases', column: 'items', key: 'supplier_purchases' },
  { table: 'submissions', column: 'items', key: 'submissions' },
  { table: 'invoices', column: 'jobe_detail_items', key: 'invoice_jobe_details', optional: true },
];

const fail = (message, status = 400, details) =>
  NextResponse.json({ success: false, error: message, ...(details ? { details } : {}) }, { status });

const normRef = (ref) => ({
  source: ref?.source === 'non_inventory' ? 'non_inventory' : 'products',
  code: ref?.code || '',
  id: ref?.id ?? null,
});

const tableFor = (source) => (source === 'non_inventory' ? 'non_inventory_items' : 'products');

/** Retrouve UNE fiche (products: product_id; non_inventory_items: id si fourni). */
async function loadProduct(ref) {
  let query = supabaseAdmin.from(tableFor(ref.source)).select('*');
  query = ref.source === 'non_inventory' && ref.id != null && ref.id !== ''
    ? query.eq('id', ref.id)
    : query.eq('product_id', ref.code);
  const { data, error } = await query;
  if (error) throw error;
  if (!data || data.length === 0) return { error: `Produit « ${ref.code} » introuvable.`, status: 404 };
  if (data.length > 1) {
    return { error: `Plusieurs fiches portent le code « ${ref.code} » dans la même liste.`, status: 409 };
  }
  return { row: data[0] };
}

function validatePair(fromRef, toRef) {
  if (!fromRef.code || !toRef.code) return 'Les deux produits (à retirer et à conserver) sont requis.';
  const sameRow = fromRef.source === toRef.source && (
    fromRef.source === 'non_inventory' && fromRef.id != null && toRef.id != null
      ? String(fromRef.id) === String(toRef.id)
      : fromRef.code === toRef.code
  );
  if (sameRow) return 'Impossible de fusionner une fiche avec elle-même.';
  return null;
}

async function countColumn({ table, column, optional }, code) {
  const { count, error } = await supabaseAdmin
    .from(table).select('*', { count: 'exact', head: true }).eq(column, code);
  if (error) {
    if (optional) return 0;
    throw error;
  }
  return count || 0;
}

async function findJsonRows({ table, column, optional }, code) {
  const { data, error } = await supabaseAdmin
    .from(table).select(`id, ${column}`)
    // jsonb: le filtre doit être passé en texte JSON (un tableau JS serait lu comme un tableau Postgres)
    .contains(column, JSON.stringify([{ product_id: code }])).limit(1000);
  if (error) {
    if (optional) return [];
    throw error;
  }
  return data || [];
}

async function buildCounts(oldCode) {
  const counts = {};
  const add = (key, n) => { counts[key] = (counts[key] || 0) + n; };
  const [colCounts, jsonRows, parentLinks, childLinks] = await Promise.all([
    Promise.all(CODE_COLUMNS.map((c) => countColumn(c, oldCode))),
    Promise.all(JSON_COLUMNS.map((c) => findJsonRows(c, oldCode))),
    countColumn({ table: 'product_associations', column: 'parent_code', optional: true }, oldCode),
    countColumn({ table: 'product_associations', column: 'child_code', optional: true }, oldCode),
  ]);
  CODE_COLUMNS.forEach((c, i) => add(c.key, colCounts[i]));
  JSON_COLUMNS.forEach((c, i) => add(c.key, jsonRows[i].length));
  add('associations', parentLinks + childLinks);
  return counts;
}

// ---------- Transferts ----------

async function moveColumn({ table, column, optional }, oldCode, newCode) {
  const { data, error } = await supabaseAdmin
    .from(table).update({ [column]: newCode }).eq(column, oldCode).select('id');
  if (error) {
    if (optional) {
      console.error(`Fusion — ${table}.${column} ignoré:`, error.message);
      return 0;
    }
    throw new Error(`${table}.${column}: ${error.message}`);
  }
  return (data || []).length;
}

async function moveJson(def, oldCode, newCode) {
  const rows = await findJsonRows(def, oldCode);
  let moved = 0;
  for (const row of rows) {
    const items = Array.isArray(row[def.column]) ? row[def.column] : [];
    const next = items.map((it) => (it && it.product_id === oldCode ? { ...it, product_id: newCode } : it));
    const { error } = await supabaseAdmin.from(def.table).update({ [def.column]: next }).eq('id', row.id);
    if (error) {
      if (def.optional) {
        console.error(`Fusion — ${def.table}.${def.column} ignoré:`, error.message);
        continue;
      }
      throw new Error(`${def.table}.${def.column}: ${error.message}`);
    }
    moved += 1;
  }
  return moved;
}

/** Liens « As »: repointe vers le code conservé; retire les liens devenus doublons ou auto-référents. */
async function moveAssociations(oldCode, newCode) {
  const result = { moved: 0, removed: 0 };
  try {
    const { data: links, error } = await supabaseAdmin
      .from('product_associations')
      .select('id, parent_code, child_code')
      .or(`parent_code.eq."${oldCode.replace(/"/g, '\\"')}",child_code.eq."${oldCode.replace(/"/g, '\\"')}"`);
    if (error) throw error;
    if (!links || links.length === 0) return result;

    const { data: existing, error: exErr } = await supabaseAdmin
      .from('product_associations')
      .select('parent_code, child_code')
      .or(`parent_code.eq."${newCode.replace(/"/g, '\\"')}",child_code.eq."${newCode.replace(/"/g, '\\"')}"`);
    if (exErr) throw exErr;
    const taken = new Set((existing || []).map((l) => `${l.parent_code}\u0000${l.child_code}`));

    for (const link of links) {
      const parent = link.parent_code === oldCode ? newCode : link.parent_code;
      const child = link.child_code === oldCode ? newCode : link.child_code;
      const pair = `${parent}\u0000${child}`;
      if (parent === child || taken.has(pair)) {
        const { error: delErr } = await supabaseAdmin.from('product_associations').delete().eq('id', link.id);
        if (delErr) throw delErr;
        result.removed += 1;
      } else {
        const { error: upErr } = await supabaseAdmin
          .from('product_associations').update({ parent_code: parent, child_code: child }).eq('id', link.id);
        if (upErr) throw upErr;
        taken.add(pair);
        result.moved += 1;
      }
    }
  } catch (e) {
    // Table absente (migration non passée) ou autre: n'empêche pas la fusion
    console.error('Fusion — product_associations ignoré:', e.message || e);
  }
  return result;
}

const publicProduct = (row, source) => ({ ...row, _source: source });

// ---------- Historique de prix ----------

const LEVELS = ['1st', '2nd', '3rd'];
const num = (v) => (v == null || v === '' ? null : Number(v));
const samePrice = (a, b) => num(a.cost) === num(b.cost) && num(a.selling) === num(b.selling);

/**
 * Fusionne l'historique de prix des 2 fiches. Retourne les colonnes à écrire sur la fiche
 * conservée (cost/selling_price_1st..3rd + dates si les colonnes existent).
 */
function mergePriceHistory(kept, removed) {
  const current = { cost: kept.cost_price, selling: kept.selling_price };
  const points = [];
  const push = (row, suffix, rank) => {
    const cost = row[`cost_price${suffix}`];
    const selling = row[`selling_price${suffix}`];
    if (cost == null && selling == null) return;
    const date = row[`price_updated_at${suffix}`] || null;
    points.push({ cost, selling, date, time: date ? new Date(date).getTime() : null, rank });
  };
  // rank: ordre de repli quand il n'y a pas de date (fiche conservée d'abord, du plus récent au plus ancien)
  LEVELS.forEach((lvl, i) => push(kept, `_${lvl}`, i));
  push(removed, '', 3);
  LEVELS.forEach((lvl, i) => push(removed, `_${lvl}`, 4 + i));

  points.sort((a, b) => {
    if (a.time != null && b.time != null && a.time !== b.time) return b.time - a.time;
    if (a.time != null && b.time == null) return -1;
    if (a.time == null && b.time != null) return 1;
    return a.rank - b.rank;
  });

  // Retirer les répétitions (même coûtant + même vendant que le prix actuel ou qu'un prix déjà retenu):
  // deux fiches en double portent souvent les mêmes prix
  const history = [];
  for (const point of points) {
    if (samePrice(point, current) || history.some((h) => samePrice(point, h))) continue;
    history.push(point);
    if (history.length === LEVELS.length) break;
  }

  const patch = {};
  LEVELS.forEach((lvl, i) => {
    const point = history[i] || null;
    patch[`cost_price_${lvl}`] = point ? point.cost ?? null : null;
    patch[`selling_price_${lvl}`] = point ? point.selling ?? null : null;
    // Colonnes de dates: seulement si la migration a été passée (clé présente sur la fiche)
    if (`price_updated_at_${lvl}` in kept) patch[`price_updated_at_${lvl}`] = point ? point.date : null;
  });
  // Ne garder que les colonnes réellement présentes et modifiées
  const changed = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in kept)) continue;
    const before = kept[key] ?? null;
    const same = key.startsWith('price_updated_at')
      ? (before ? new Date(before).getTime() : null) === (value ? new Date(value).getTime() : null)
      : num(before) === num(value);
    if (!same) changed[key] = value;
  }
  return changed;
}

// ---------- Handlers ----------

export async function GET(request) {
  try {
    const sp = new URL(request.url).searchParams;
    const fromRef = normRef({ source: sp.get('from_source'), code: sp.get('from_code'), id: sp.get('from_id') });
    const toRef = normRef({ source: sp.get('to_source'), code: sp.get('to_code'), id: sp.get('to_id') });

    const invalid = validatePair(fromRef, toRef);
    if (invalid) return fail(invalid);

    const [from, to] = await Promise.all([loadProduct(fromRef), loadProduct(toRef)]);
    if (from.error) return fail(from.error, from.status);
    if (to.error) return fail(to.error, to.status);

    const sameCode = from.row.product_id === to.row.product_id;
    const counts = sameCode ? {} : await buildCounts(from.row.product_id);

    return NextResponse.json({
      success: true,
      data: {
        from: publicProduct(from.row, fromRef.source),
        to: publicProduct(to.row, toRef.source),
        same_code: sameCode,
        counts,
      },
    });
  } catch (error) {
    console.error('Erreur aperçu fusion produits:', error);
    return fail('Erreur lors de la préparation de la fusion.', 500, error.message);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const fromRef = normRef(body.from);
    const toRef = normRef(body.to);
    const addStock = body.add_stock !== false;
    const description = typeof body.description === 'string' ? body.description.trim() : '';

    const invalid = validatePair(fromRef, toRef);
    if (invalid) return fail(invalid);

    const [from, to] = await Promise.all([loadProduct(fromRef), loadProduct(toRef)]);
    if (from.error) return fail(from.error, from.status);
    if (to.error) return fail(to.error, to.status);

    const oldCode = from.row.product_id;
    const newCode = to.row.product_id;
    const moved = {};
    const add = (key, n) => { moved[key] = (moved[key] || 0) + n; };

    // 1. Transferts (rien à faire si les 2 fiches portent exactement le même code)
    if (oldCode !== newCode) {
      try {
        for (const def of CODE_COLUMNS) add(def.key, await moveColumn(def, oldCode, newCode));
        for (const def of JSON_COLUMNS) add(def.key, await moveJson(def, oldCode, newCode));
      } catch (e) {
        console.error('Fusion interrompue pendant les transferts:', e);
        return fail(
          'Fusion interrompue: les deux fiches existent toujours, rien n\'a été supprimé. Relancez la fusion pour terminer.',
          500,
          e.message
        );
      }
      const assoc = await moveAssociations(oldCode, newCode);
      moved.associations = assoc.moved;
      moved.associations_removed = assoc.removed;
    }

    // 2. Fiche conservée: stock additionné, description choisie, historique de prix fusionné
    const toTable = tableFor(toRef.source);
    const toMatch = (q) => (toRef.source === 'non_inventory' && to.row.id != null
      ? q.eq('id', to.row.id)
      : q.eq('product_id', newCode));
    const oldStock = parseFloat(to.row.stock_qty) || 0;
    const fromStock = parseFloat(from.row.stock_qty) || 0;
    const newStock = addStock ? oldStock + fromStock : oldStock;

    const patch = mergePriceHistory(to.row, from.row);
    if (newStock !== oldStock) patch.stock_qty = newStock;
    if (description && description !== (to.row.description || '')) patch.description = description;
    // Valeurs d'origine, pour revenir en arrière si la suppression échoue
    const revert = Object.fromEntries(Object.keys(patch).map((k) => [k, to.row[k] ?? null]));

    if (Object.keys(patch).length > 0) {
      const { data: upd, error: updErr } = await toMatch(
        supabaseAdmin.from(toTable).update(patch)
      ).select('product_id');
      if (updErr || !upd || upd.length === 0) {
        return fail(
          'Les documents ont été transférés, mais la fiche conservée n\'a pas pu être mise à jour. Les deux fiches existent toujours: relancez la fusion.',
          500,
          updErr?.message
        );
      }
    }

    // 3. Suppression de la fiche retirée (en dernier)
    const fromTable = tableFor(fromRef.source);
    let del = supabaseAdmin.from(fromTable).delete();
    del = fromRef.source === 'non_inventory' && from.row.id != null
      ? del.eq('id', from.row.id)
      : del.eq('product_id', oldCode);
    const { data: deleted, error: delErr } = await del.select('product_id');

    if (delErr || !deleted || deleted.length === 0) {
      // Remettre la fiche conservée comme avant: une nouvelle tentative repart d'un état propre
      if (Object.keys(revert).length > 0) {
        await toMatch(supabaseAdmin.from(toTable).update(revert));
      }
      return fail(
        'Les documents ont été transférés, mais l\'ancienne fiche n\'a pas pu être supprimée. Relancez la fusion.',
        500,
        delErr?.message
      );
    }

    const { data: finalRows } = await toMatch(supabaseAdmin.from(toTable).select('*'));
    const finalProduct = publicProduct(finalRows?.[0] || { ...to.row, ...patch }, toRef.source);

    console.log(`🔀 Fusion produit: ${oldCode} (${fromTable}) → ${newCode} (${toTable})`, moved);

    return NextResponse.json({
      success: true,
      data: {
        from: { product_id: oldCode, id: from.row.id ?? null, _source: fromRef.source },
        to: { product_id: newCode, id: to.row.id ?? null, _source: toRef.source },
        product: finalProduct,
        stock_before: oldStock,
        stock_after: newStock,
        moved,
      },
    });
  } catch (error) {
    console.error('Erreur fusion produits:', error);
    return fail('Erreur lors de la fusion des produits.', 500, error.message);
  }
}
