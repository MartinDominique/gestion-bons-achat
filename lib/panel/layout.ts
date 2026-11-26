/**
 * @file lib/panel/layout.ts
 * @description Panneau virtuel — CALCULS d'une disposition. Module PUR (aucun accès
 *              réseau, base de données ou navigateur), couvert par des tests unitaires
 *              (lib/panel/layout.test.ts, cas PGF2701).
 *              - Géométrie: boîte d'une pièce (rotation, pièce répétée), boîte de dégagement
 *              - findConflicts(): corps contre corps, corps dans un dégagement (sauf même
 *                groupe d'empilage), corps hors du fond, goulotte sur un corps, pièce
 *                « doit rester verticale » tournée
 *              - requiredPlate() / requiredDepth() / heatLoad() / ventilation()
 *              - suggestEnclosures(): boîtiers qui conviennent (orientations permises,
 *                espace disponible) + ce qui bloque pour les autres
 *              - fitPlate(), snapToRail(), railUsage(), alignItems(), distributeItems()
 *              Toutes les mesures sont en millimètres. L'origine (0, 0) est le coin
 *              HAUT-GAUCHE du fond de panneau, tel qu'installé; y augmente vers le bas.
 * @version 1.0.0
 * @date 2026-11-25
 * @changelog
 *   1.0.0 - Version initiale (Panneau virtuel PR 2)
 */

export type ItemKind = 'component' | 'free' | 'rail' | 'duct';

export interface LayoutItem {
  id: string;
  kind: ItemKind;
  /** Code produit (null pour un rail, une goulotte ou une pièce libre « gabarit ») */
  product_id?: string | null;
  label: string;
  description?: string | null;
  x: number;
  y: number;
  /** Dimensions AVANT rotation. Pièce répétée: la largeur réelle est qty × unit_w */
  w: number;
  h: number;
  d?: number | null;
  rot?: 0 | 90;
  repeated?: boolean;
  unit_w?: number | null;
  qty?: number | null;
  /** Dégagements [haut, bas, gauche, droite] AVANT rotation */
  c?: [number, number, number, number] | null;
  vertical?: boolean;
  group?: string | null;
  watts?: number | null;
  cat?: 'power' | 'control';
  mounting?: string | null;
  source?: string | null;
  note?: string | null;
}

export interface Box { x: number; y: number; w: number; h: number }
export interface Plate { w: number; h: number }

const EPS = 0.01;
const r1 = (n: number) => Math.round(n * 10) / 10;

export const DIN_RAIL_HEIGHT = 35;
export const DEPTH_ALLOWANCE = 25; // mm de jeu devant la pièce la plus profonde

/** Une « pièce » a un corps (composant du catalogue ou pièce libre). */
export const isPiece = (i: LayoutItem) => i.kind === 'component' || i.kind === 'free';

/** Largeur du corps avant rotation (pièce répétée = quantité × largeur par unité). */
export function bodyWidthOf(i: LayoutItem): number {
  if (i.repeated && i.unit_w && i.unit_w > 0) return r1(i.unit_w * Math.max(1, i.qty || 1));
  return i.w;
}

/** Boîte du corps sur le plan (rotation appliquée). */
export function itemBox(i: LayoutItem): Box {
  const w = bodyWidthOf(i);
  return i.rot === 90 ? { x: i.x, y: i.y, w: i.h, h: w } : { x: i.x, y: i.y, w, h: i.h };
}

/**
 * Dégagements effectifs [haut, bas, gauche, droite] sur le plan.
 * Rotation de 90° horaire: le haut de la pièce pointe à droite, donc
 * haut ← gauche, droite ← haut, bas ← droite, gauche ← bas.
 */
export function effectiveClearances(i: LayoutItem): [number, number, number, number] {
  const [t, b, l, r] = i.c || [0, 0, 0, 0];
  return i.rot === 90 ? [l, r, b, t] : [t, b, l, r];
}

/** Boîte corps + dégagements. */
export function clearanceBox(i: LayoutItem): Box {
  const b = itemBox(i);
  const [t, bo, l, r] = effectiveClearances(i);
  return { x: b.x - l, y: b.y - t, w: b.w + l + r, h: b.h + t + bo };
}

export const hasClearance = (i: LayoutItem) => !!i.c && i.c.some((v) => v > 0);

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;
}

// ---------- Conflits ----------

export type ConflictType = 'overlap' | 'clearance' | 'outside' | 'duct' | 'vertical';

export interface Conflict {
  type: ConflictType;
  /** Pièces à colorer en rouge */
  ids: string[];
  /** Pièce dont le DÉGAGEMENT est violé (cadre pointillé rouge) */
  clearanceOf?: string;
  message: string;
}

export interface ConflictReport {
  conflicts: Conflict[];
  bad: Set<string>;
  badClearance: Set<string>;
  messages: string[];
}

const sameGroup = (a: LayoutItem, b: LayoutItem) => !!a.group && !!b.group && a.group.trim() !== '' && a.group === b.group;

/**
 * Règles:
 *  - corps contre corps (pièces);
 *  - corps d'une pièce dans le dégagement d'une autre, sauf même groupe d'empilage;
 *  - corps d'une pièce qui dépasse du fond;
 *  - goulotte qui chevauche le corps d'une pièce;
 *  - pièce « doit rester verticale » tournée (le plan est toujours affiché tel qu'installé).
 * Les rails et les goulottes PEUVENT être dans un dégagement. Les rails ne
 * créent jamais de conflit (les pièces sont posées dessus).
 */
export function findConflicts(items: LayoutItem[], plate: Plate): ConflictReport {
  const conflicts: Conflict[] = [];
  const pieces = items.filter(isPiece);
  const ducts = items.filter((i) => i.kind === 'duct');
  const boxes = new Map(items.map((i) => [i.id, itemBox(i)]));

  for (const a of pieces) {
    const ba = boxes.get(a.id)!;
    if (ba.x < -EPS || ba.y < -EPS || ba.x + ba.w > plate.w + EPS || ba.y + ba.h > plate.h + EPS) {
      conflicts.push({ type: 'outside', ids: [a.id], message: `${a.label} dépasse du fond` });
    }
    if (a.vertical && a.rot === 90) {
      conflicts.push({ type: 'vertical', ids: [a.id], message: `${a.label} doit rester verticale` });
    }
    for (const duct of ducts) {
      if (overlaps(ba, boxes.get(duct.id)!)) {
        conflicts.push({ type: 'duct', ids: [a.id, duct.id], message: `${a.label} chevauche une goulotte` });
      }
    }
  }

  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i];
      const b = pieces[j];
      const ba = boxes.get(a.id)!;
      const bb = boxes.get(b.id)!;
      if (overlaps(ba, bb)) {
        conflicts.push({ type: 'overlap', ids: [a.id, b.id], message: `${a.label} chevauche ${b.label}` });
        continue;
      }
      if (sameGroup(a, b)) continue;
      if (hasClearance(a) && overlaps(clearanceBox(a), bb)) {
        conflicts.push({ type: 'clearance', ids: [b.id], clearanceOf: a.id, message: `${b.label} est dans le dégagement de ${a.label}` });
      }
      if (hasClearance(b) && overlaps(clearanceBox(b), ba)) {
        conflicts.push({ type: 'clearance', ids: [a.id], clearanceOf: b.id, message: `${a.label} est dans le dégagement de ${b.label}` });
      }
    }
  }

  const bad = new Set<string>();
  const badClearance = new Set<string>();
  conflicts.forEach((c) => {
    c.ids.forEach((id) => bad.add(id));
    if (c.clearanceOf) badClearance.add(c.clearanceOf);
  });
  return { conflicts, bad, badClearance, messages: Array.from(new Set(conflicts.map((c) => c.message))) };
}

// ---------- Fond requis, profondeur, chaleur ----------

export interface Bounds { x0: number; y0: number; x1: number; y1: number; w: number; h: number }

/** Boîte englobante des corps (pièces, rails et goulottes). Les dégagements n'en font pas partie. */
export function boundingBox(items: LayoutItem[]): Bounds | null {
  if (items.length === 0) return null;
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const i of items) {
    const b = itemBox(i);
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/**
 * Fond requis = boîte englobante + marge au bord de chaque côté.
 * La réserve d'expansion (%) s'applique sur la LARGEUR (longueur des rangées).
 */
export function requiredPlate(items: LayoutItem[], marginMm: number, sparePercent: number): Plate | null {
  const bb = boundingBox(items);
  if (!bb) return null;
  const m = Math.max(0, marginMm || 0);
  const sp = Math.max(0, sparePercent || 0) / 100;
  return { w: r1(bb.w * (1 + sp) + 2 * m), h: r1(bb.h + 2 * m) };
}

/** Profondeur intérieure requise = pièce la plus profonde + 25 mm + profondeur arrière de la porte. */
export function requiredDepth(items: LayoutItem[], doorRearDepthMm: number): number {
  const deepest = Math.max(0, ...items.filter(isPiece).map((i) => i.d || 0));
  return r1(deepest + DEPTH_ALLOWANCE + Math.max(0, doorRearDepthMm || 0));
}

export interface HeatLoad { watts: number; incomplete: boolean; missing: number }

/** Somme des pertes connues; incomplete = au moins une pièce sans valeur (afficher « ≥ »). */
export function heatLoad(items: LayoutItem[]): HeatLoad {
  const pieces = items.filter(isPiece);
  const known = pieces.filter((i) => typeof i.watts === 'number' && Number.isFinite(i.watts));
  const watts = r1(known.reduce((s, i) => s + (i.watts as number), 0));
  return { watts, incomplete: known.length < pieces.length, missing: pieces.length - known.length };
}

export interface Ventilation { m3h: number; cfm: number }

/**
 * ESTIMATION du débit d'air pour évacuer la chaleur par ventilation filtrée:
 *   débit (m³/h) = 3,1 × P (W) ÷ ΔT (°C)      — air au niveau de la mer
 *   1 m³/h = 0,5886 pi³/min (CFM)
 * ΔT = écart toléré entre l'intérieur du boîtier et l'air ambiant.
 */
export function ventilation(watts: number, deltaT: number): Ventilation | null {
  if (!(watts > 0) || !(deltaT > 0)) return null;
  const m3h = (3.1 * watts) / deltaT;
  return { m3h: Math.ceil(m3h), cfm: Math.ceil(m3h * 0.5886) };
}

// ---------- Boîtiers ----------

export interface EnclosureSpec {
  product_code: string;
  description?: string | null;
  /** Extérieur */
  width_mm: number | null;
  height_mm: number | null;
  depth_mm: number | null;
  backplate_width_mm: number | null;
  backplate_height_mm: number | null;
  usable_depth_mm: number | null;
  unusable_margin_mm?: number | null;
  allow_portrait?: boolean;
  allow_landscape?: boolean;
  cost_price?: number | null;
  selling_price?: number | null;
  stock_qty?: number | null;
}

export interface Space { w?: number | null; h?: number | null; d?: number | null }
export type EnclosureOrientation = 'portrait' | 'landscape';

export interface EnclosureFit {
  enclosure: EnclosureSpec;
  orientation: EnclosureOrientation;
  fits: boolean;
  /** Fond de panneau utile dans cette orientation (marge non utilisable retirée) */
  plate: Plate;
  /** Extérieur dans cette orientation */
  ext: { w: number; h: number; d: number };
  volume: number;
  /** Manques en mm (0 = correct). plate*: fond trop petit; depth: profondeur utile; space*: extérieur trop gros */
  deficits: { plateW: number; plateH: number; depth: number; spaceW: number; spaceH: number; spaceD: number };
  totalDeficit: number;
}

const n0 = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
const lack = (need: number, have: number) => (need > have + EPS ? r1(need - have) : 0);

/** Un boîtier est utilisable si le fond de panneau et la profondeur utile sont saisis. */
export const isEnclosureComplete = (e: EnclosureSpec) =>
  n0(e.backplate_width_mm) > 0 && n0(e.backplate_height_mm) > 0 && n0(e.usable_depth_mm) > 0;

function evaluate(e: EnclosureSpec, orientation: EnclosureOrientation, need: Plate, needDepth: number, space: Space): EnclosureFit {
  const margin = 2 * n0(e.unusable_margin_mm);
  const flip = orientation === 'landscape';
  const bw = n0(flip ? e.backplate_height_mm : e.backplate_width_mm) - margin;
  const bh = n0(flip ? e.backplate_width_mm : e.backplate_height_mm) - margin;
  const ext = {
    w: n0(flip ? e.height_mm : e.width_mm),
    h: n0(flip ? e.width_mm : e.height_mm),
    d: n0(e.depth_mm),
  };
  const deficits = {
    plateW: lack(need.w, bw),
    plateH: lack(need.h, bh),
    depth: lack(needDepth, n0(e.usable_depth_mm)),
    spaceW: n0(space.w) > 0 ? lack(ext.w, n0(space.w)) : 0,
    spaceH: n0(space.h) > 0 ? lack(ext.h, n0(space.h)) : 0,
    spaceD: n0(space.d) > 0 ? lack(ext.d, n0(space.d)) : 0,
  };
  const totalDeficit = r1(Object.values(deficits).reduce((s, v) => s + v, 0));
  return {
    enclosure: e, orientation, fits: totalDeficit === 0,
    plate: { w: r1(bw), h: r1(bh) }, ext,
    volume: ext.w * ext.h * ext.d, deficits, totalDeficit,
  };
}

export interface EnclosureSuggestions {
  /** Boîtiers qui conviennent, du plus petit volume extérieur au plus gros (meilleure orientation de chacun) */
  fits: EnclosureFit[];
  /** Les autres, du plus proche au plus loin (orientation la moins pire) */
  rejected: EnclosureFit[];
  /** Boîtiers ignorés: fond de panneau ou profondeur utile non saisis */
  incomplete: EnclosureSpec[];
}

/**
 * Teste chaque boîtier dans les orientations qu'il permet:
 * portrait = fond L × H tel que saisi; paysage = boîtier couché (fond H × L).
 */
export function suggestEnclosures(
  enclosures: EnclosureSpec[], need: Plate, needDepth: number, space: Space = {}
): EnclosureSuggestions {
  const fits: EnclosureFit[] = [];
  const rejected: EnclosureFit[] = [];
  const incomplete: EnclosureSpec[] = [];
  for (const e of enclosures) {
    if (!isEnclosureComplete(e)) { incomplete.push(e); continue; }
    const tries: EnclosureFit[] = [];
    if (e.allow_portrait !== false) tries.push(evaluate(e, 'portrait', need, needDepth, space));
    if (e.allow_landscape !== false) tries.push(evaluate(e, 'landscape', need, needDepth, space));
    if (tries.length === 0) continue;
    const ok = tries.filter((t) => t.fits);
    if (ok.length > 0) fits.push(ok[0]);
    else rejected.push(tries.sort((a, b) => a.totalDeficit - b.totalDeficit)[0]);
  }
  fits.sort((a, b) => a.volume - b.volume || a.enclosure.product_code.localeCompare(b.enclosure.product_code));
  rejected.sort((a, b) => a.totalDeficit - b.totalDeficit);
  return { fits, rejected, incomplete };
}

/** Phrases « ce qui bloque » pour un boîtier refusé. */
export function describeDeficits(fit: EnclosureFit): string[] {
  const d = fit.deficits;
  const out: string[] = [];
  if (d.plateW) out.push(`fond trop étroit de ${d.plateW} mm`);
  if (d.plateH) out.push(`fond trop bas de ${d.plateH} mm`);
  if (d.depth) out.push(`profondeur utile insuffisante de ${d.depth} mm`);
  if (d.spaceW) out.push(`boîtier trop large de ${d.spaceW} mm pour l'espace disponible`);
  if (d.spaceH) out.push(`boîtier trop haut de ${d.spaceH} mm pour l'espace disponible`);
  if (d.spaceD) out.push(`boîtier trop profond de ${d.spaceD} mm pour l'espace disponible`);
  return out;
}

// ---------- Outils de placement ----------

export const snap = (value: number, step: number) => (step > 0 ? r1(Math.round(value / step) * step) : r1(value));

/**
 * « Ajuster le fond »: ramène tout à la marge et coupe le fond à la boîte
 * englobante (arrondi aux 5 mm supérieurs).
 */
export function fitPlate(items: LayoutItem[], marginMm: number): { items: LayoutItem[]; plate: Plate } | null {
  const bb = boundingBox(items);
  if (!bb) return null;
  const m = Math.max(0, marginMm || 0);
  const up5 = (v: number) => Math.ceil((v - EPS) / 5) * 5;
  return {
    items: items.map((i) => ({ ...i, x: r1(i.x - bb.x0 + m), y: r1(i.y - bb.y0 + m) })),
    plate: { w: up5(bb.w + 2 * m), h: up5(bb.h + 2 * m) },
  };
}

const isHorizontalRail = (rail: LayoutItem) => { const b = itemBox(rail); return b.w >= b.h; };

/**
 * Une pièce déposée sur un rail DIN s'aligne sur l'axe du rail.
 * Renvoie la position corrigée, ou null si la pièce ne touche aucun rail.
 */
export function snapToRail(item: LayoutItem, items: LayoutItem[]): { x: number; y: number; railId: string } | null {
  if (!isPiece(item) || item.mounting !== 'din') return null;
  const b = itemBox(item);
  for (const rail of items) {
    if (rail.kind !== 'rail' || rail.id === item.id) continue;
    const rb = itemBox(rail);
    if (!overlaps(b, rb)) continue;
    if (isHorizontalRail(rail)) return { x: item.x, y: r1(rb.y + rb.h / 2 - b.h / 2), railId: rail.id };
    return { x: r1(rb.x + rb.w / 2 - b.w / 2), y: item.y, railId: rail.id };
  }
  return null;
}

/** Longueur du rail occupée par les pièces posées dessus (0 à 1, peut dépasser 1). */
export function railUsage(rail: LayoutItem, items: LayoutItem[]): { used: number; length: number; ratio: number } {
  const rb = itemBox(rail);
  const horizontal = rb.w >= rb.h;
  const length = horizontal ? rb.w : rb.h;
  const spans: [number, number][] = [];
  for (const i of items) {
    if (!isPiece(i)) continue;
    const b = itemBox(i);
    if (!overlaps(b, rb)) continue;
    const a0 = Math.max(horizontal ? b.x : b.y, horizontal ? rb.x : rb.y);
    const a1 = Math.min(horizontal ? b.x + b.w : b.y + b.h, horizontal ? rb.x + rb.w : rb.y + rb.h);
    if (a1 > a0) spans.push([a0, a1]);
  }
  spans.sort((p, q) => p[0] - q[0]);
  let used = 0; let end = -Infinity;
  for (const [s, e] of spans) {
    if (e <= end) continue;
    used += e - Math.max(s, end);
    end = e;
  }
  return { used: r1(used), length: r1(length), ratio: length > 0 ? used / length : 0 };
}

export type AlignMode = 'left' | 'right' | 'top' | 'bottom' | 'center-x' | 'center-y';

/** Aligne les pièces sélectionnées sur le bord (ou le centre) de leur boîte englobante. */
export function alignItems(items: LayoutItem[], ids: Set<string>, mode: AlignMode): LayoutItem[] {
  const sel = items.filter((i) => ids.has(i.id));
  const bb = boundingBox(sel);
  if (!bb || sel.length < 2) return items;
  return items.map((i) => {
    if (!ids.has(i.id)) return i;
    const b = itemBox(i);
    switch (mode) {
      case 'left': return { ...i, x: r1(bb.x0) };
      case 'right': return { ...i, x: r1(bb.x1 - b.w) };
      case 'top': return { ...i, y: r1(bb.y0) };
      case 'bottom': return { ...i, y: r1(bb.y1 - b.h) };
      case 'center-x': return { ...i, x: r1(bb.x0 + bb.w / 2 - b.w / 2) };
      default: return { ...i, y: r1(bb.y0 + bb.h / 2 - b.h / 2) };
    }
  });
}

/** Répartit les pièces sélectionnées avec des espaces égaux (les deux extrémités ne bougent pas). */
export function distributeItems(items: LayoutItem[], ids: Set<string>, axis: 'x' | 'y'): LayoutItem[] {
  const sel = items.filter((i) => ids.has(i.id)).sort((a, b) => (axis === 'x' ? a.x - b.x : a.y - b.y));
  if (sel.length < 3) return items;
  const boxes = sel.map(itemBox);
  const size = (b: Box) => (axis === 'x' ? b.w : b.h);
  const start = axis === 'x' ? boxes[0].x : boxes[0].y;
  const last = boxes[boxes.length - 1];
  const end = (axis === 'x' ? last.x : last.y) + size(last);
  const gap = (end - start - boxes.reduce((s, b) => s + size(b), 0)) / (sel.length - 1);
  const pos = new Map<string, number>();
  let cursor = start;
  sel.forEach((i, k) => { pos.set(i.id, r1(cursor)); cursor += size(boxes[k]) + gap; });
  return items.map((i) => (pos.has(i.id) ? { ...i, [axis]: pos.get(i.id) as number } : i));
}
