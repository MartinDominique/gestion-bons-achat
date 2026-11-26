/**
 * @file lib/services/panel-layouts.js
 * @description Panneau virtuel — helpers SERVEUR des dispositions (table panel_layouts).
 *              - sanitizeLayoutFields(): ne garde que les champs connus, nombres validés
 *              - sanitizeItems(): pièces / rails / goulottes nettoyés (types, nombres bornés,
 *                textes tronqués) avant l'écriture du JSONB
 *              - buildItemsFromLines(): classe les lignes d'une soumission / d'un BT et crée les
 *                pièces « à placer » (import)
 *              - renameLayoutCode(): cascade d'un renommage de code produit
 *                (items[].product_id + enclosure_code)
 * @version 1.2.0
 * @date 2026-11-26
 * @changelog
 *   1.2.0 - Forme ronde (`shape: 'round'`) acceptée
 *   1.1.0 - Pièces de porte (zone 'door', profondeur arrière `rear`) acceptées et créées à l'import;
 *           champ hinge_side (Panneau virtuel PR 3)
 *   1.0.0 - Version initiale (Panneau virtuel PR 2)
 */

import { supabaseAdmin } from '../supabaseAdmin';
import { itemFromSpec, doorItemFromSpec, isSpecPlaceable } from '../panel/items';
import { DOOR_ESTIMATE_MARGIN } from '../panel/layout';

export const LAYOUT_LIST_COLS =
  'id, name, project_code, client_name, submission_number, work_order_number, enclosure_code, orientation, ' +
  'plate_width_mm, plate_height_mm, status, version, created_at, updated_at';

const ORIENTATIONS = ['portrait', 'landscape', 'side_left', 'side_right'];
const KINDS = ['component', 'free', 'rail', 'duct'];
const MAX_MM = 100000;
const MAX_ITEMS = 1000;

const num = (v, { min = -MAX_MM, max = MAX_MM, fallback = 0 } = {}) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
};
const numOrNull = (v, opts) => (v === null || v === undefined || v === '' ? null : num(v, opts));
const text = (v, max = 300) => {
  const s = v == null ? '' : String(v).trim();
  return s === '' ? null : s.slice(0, max);
};

export function sanitizeItems(input) {
  if (!Array.isArray(input)) throw new Error('Liste de pièces invalide');
  if (input.length > MAX_ITEMS) throw new Error(`Trop de pièces (maximum ${MAX_ITEMS})`);
  const seen = new Set();
  return input.map((raw, index) => {
    const kind = KINDS.includes(raw?.kind) ? raw.kind : null;
    if (!kind) throw new Error(`Pièce ${index + 1}: type invalide`);
    let id = text(raw.id, 64) || `i${index}`;
    while (seen.has(id)) id = `${id}_${index}`;
    seen.add(id);
    const item = {
      id,
      kind,
      product_id: kind === 'component' ? text(raw.product_id, 120) : null,
      label: text(raw.label, 120) || 'Pièce',
      description: text(raw.description, 300),
      x: num(raw.x),
      y: num(raw.y),
      w: num(raw.w, { min: 0.1, fallback: 50 }),
      h: num(raw.h, { min: 0.1, fallback: 50 }),
      d: numOrNull(raw.d, { min: 0 }),
      rot: raw.rot === 90 ? 90 : 0,
    };
    if (kind === 'component' || kind === 'free') {
      const c = Array.isArray(raw.c) ? raw.c : [0, 0, 0, 0];
      item.c = [0, 1, 2, 3].map((k) => num(c[k], { min: 0 }));
      item.repeated = raw.repeated === true;
      item.unit_w = item.repeated ? numOrNull(raw.unit_w, { min: 0.1 }) : null;
      item.qty = item.repeated ? Math.round(num(raw.qty, { min: 1, max: 1000, fallback: 1 })) : null;
      item.vertical = raw.vertical === true;
      item.group = text(raw.group, 60);
      item.watts = numOrNull(raw.watts, { min: 0 });
      item.cat = raw.cat === 'power' ? 'power' : 'control';
      item.mounting = text(raw.mounting, 20);
      item.source = text(raw.source, 20);
      item.note = text(raw.note, 1000);
      if (raw.shape === 'round') item.shape = 'round';
      if (raw.zone === 'door') {
        item.zone = 'door';
        item.rear = numOrNull(raw.rear, { min: 0 });
      }
    }
    return item;
  });
}

export function sanitizeLayoutFields(input) {
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(input, k);
  if (has('name')) {
    const name = text(input.name, 120);
    if (!name) throw new Error('Le nom de la disposition est requis');
    out.name = name;
  }
  for (const k of ['project_code', 'client_name', 'submission_number', 'work_order_number', 'enclosure_code']) {
    if (has(k)) out[k] = text(input[k], 120);
  }
  if (has('notes')) out.notes = text(input.notes, 4000);
  if (has('orientation')) {
    if (!ORIENTATIONS.includes(input.orientation)) throw new Error('Orientation invalide');
    out.orientation = input.orientation;
  }
  if (has('hinge_side')) {
    if (!['left', 'right'].includes(input.hinge_side)) throw new Error('Côté de charnière invalide');
    out.hinge_side = input.hinge_side;
  }
  if (has('status')) {
    if (!['draft', 'approved'].includes(input.status)) throw new Error('Statut invalide');
    out.status = input.status;
  }
  if (has('plate_width_mm')) out.plate_width_mm = num(input.plate_width_mm, { min: 50, fallback: 600 });
  if (has('plate_height_mm')) out.plate_height_mm = num(input.plate_height_mm, { min: 50, fallback: 600 });
  if (has('margin_mm')) out.margin_mm = num(input.margin_mm, { min: 0, max: 500 });
  if (has('spare_percent')) out.spare_percent = num(input.spare_percent, { min: 0, max: 200 });
  if (has('door_rear_depth_mm')) out.door_rear_depth_mm = num(input.door_rear_depth_mm, { min: 0, max: 2000 });
  if (has('snap_mm')) out.snap_mm = num(input.snap_mm, { min: 0, max: 100, fallback: 5 });
  for (const k of ['avail_width_mm', 'avail_height_mm', 'avail_depth_mm']) {
    if (has(k)) out[k] = numOrNull(input[k], { min: 0 });
  }
  if (has('delta_t')) out.delta_t = numOrNull(input.delta_t, { min: 0, max: 100 });
  if (has('submission_id')) out.submission_id = input.submission_id == null ? null : parseInt(input.submission_id, 10) || null;
  if (has('work_order_id')) out.work_order_id = input.work_order_id == null ? null : parseInt(input.work_order_id, 10) || null;
  if (has('items')) out.items = sanitizeItems(input.items);
  return out;
}

const PENDING_GAP = 40;   // distance entre le fond et la zone « à placer »
const PENDING_ROW = 900;  // largeur max d'une rangée de la zone « à placer »
const MAX_PER_LINE = 60;  // garde-fou: instances créées pour une seule ligne

const ON_PLATE = ['din', 'backplate'];
const MOUNT_LABELS = { door: 'Porte', wall: 'Paroi', field: 'Terrain', accessory: 'Accessoire' };

/**
 * Classe les lignes de matériel (soumission ou BT) selon les fiches « Panneau virtuel »:
 *  - sur le fond (rail DIN / vissé, fiche complète) → une pièce par unité, déposée dans la
 *    zone « à placer » à DROITE du fond (une pièce répétée = une seule pièce, quantité = qté);
 *  - hors fond (porte, paroi, terrain, accessoire) → liste du rapport;
 *  - dimensions manquantes → liste du rapport;
 *  - case « Panneau virtuel » non cochée → ignorée, mais comptée.
 * lines: [{ code, description, quantity }]. Renvoie { items, report }.
 */
export async function buildItemsFromLines(lines, plateWidth) {
  const wanted = [...new Set(lines.map((l) => l.code).filter(Boolean))];
  const specs = {};
  for (let i = 0; i < wanted.length; i += 200) {
    const { data, error } = await supabaseAdmin
      .from('panel_specs').select('*').in('product_code', wanted.slice(i, i + 200));
    if (error) throw error;
    (data || []).forEach((s) => { specs[s.product_code] = s; });
  }

  const items = [];
  const report = { placed: 0, off_plate: [], missing: [], ignored: [], enclosures: [] };
  let x = plateWidth + PENDING_GAP;
  let y = 0;
  let rowH = 0;
  let seq = 0;
  // Zone « à placer » de la porte (porte estimée = fond + marge de chaque côté)
  const doorLeft = plateWidth + 2 * DOOR_ESTIMATE_MARGIN + PENDING_GAP;
  let doorX = doorLeft;
  let doorY = 0;
  let doorRowH = 0;
  const place = (w, h) => {
    if (x > plateWidth + PENDING_GAP && x + w > plateWidth + PENDING_GAP + PENDING_ROW) {
      x = plateWidth + PENDING_GAP;
      y += rowH + 20;
      rowH = 0;
    }
    const at = { x, y };
    x += w + 15;
    rowH = Math.max(rowH, h);
    return at;
  };

  for (const line of lines) {
    const qty = Math.max(1, Math.round(parseFloat(line.quantity) || 1));
    const entry = { code: line.code || '', description: line.description || '', quantity: qty };
    const spec = line.code ? specs[line.code] : null;
    if (!spec || !spec.active) { report.ignored.push(entry); continue; }
    if (spec.kind === 'enclosure') { report.enclosures.push(entry); continue; }
    if (!spec.mounting) { report.missing.push(entry); continue; }
    if (!ON_PLATE.includes(spec.mounting)) {
      report.off_plate.push({ ...entry, mounting: spec.mounting, mounting_label: MOUNT_LABELS[spec.mounting] || 'Montage à préciser' });
      if (spec.mounting === 'door') {
        // Pièces de porte: déposées à DROITE de la porte (repère de la porte), prêtes à placer
        const count = Math.min(qty, MAX_PER_LINE);
        for (let k = 0; k < count; k++) {
          const item = doorItemFromSpec(spec, { id: `door${seq++}`, description: line.description });
          if (doorX + item.w > doorLeft + PENDING_ROW && doorX > doorLeft) { doorX = doorLeft; doorY += doorRowH + 20; doorRowH = 0; }
          items.push({ ...item, x: doorX, y: doorY });
          doorX += item.w + 15;
          doorRowH = Math.max(doorRowH, item.h);
        }
        report.door = (report.door || 0) + count;
      }
      continue;
    }
    if (!isSpecPlaceable(spec)) { report.missing.push(entry); continue; }

    const count = spec.is_repeated ? 1 : Math.min(qty, MAX_PER_LINE);
    for (let k = 0; k < count; k++) {
      const item = itemFromSpec(spec, { id: `imp${seq++}`, description: line.description, quantity: qty });
      items.push({ ...item, ...place(item.w, item.h) });
    }
    report.placed += count;
    if (!spec.is_repeated && qty > count) report.truncated = (report.truncated || 0) + (qty - count);
  }
  return { items, report };
}

/** Renommage d'un code produit: les dispositions suivent. Best-effort (journalise, ne lance pas). */
export async function renameLayoutCode(oldCode, newCode) {
  try {
    const { error: encErr } = await supabaseAdmin
      .from('panel_layouts').update({ enclosure_code: newCode }).eq('enclosure_code', oldCode);
    if (encErr) console.error('Cascade panel_layouts.enclosure_code:', encErr.message);

    const { data, error } = await supabaseAdmin
      .from('panel_layouts').select('id, items')
      .contains('items', JSON.stringify([{ product_id: oldCode }])).limit(1000);
    if (error) throw error;
    for (const row of data || []) {
      const items = (Array.isArray(row.items) ? row.items : [])
        .map((it) => (it && it.product_id === oldCode ? { ...it, product_id: newCode } : it));
      const { error: updErr } = await supabaseAdmin.from('panel_layouts').update({ items }).eq('id', row.id);
      if (updErr) console.error('Cascade panel_layouts.items:', updErr.message);
    }
  } catch (e) {
    console.error('Cascade panel_layouts (exception):', e?.message || e);
  }
}
