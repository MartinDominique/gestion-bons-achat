/**
 * @file lib/panel/items.ts
 * @description Panneau virtuel — fabrique des pièces d'une disposition. Module PUR,
 *              partagé par le serveur (import d'une soumission) et l'éditeur
 *              (bibliothèque, boutons « + Rail », « + Goulotte », « + Pièce libre »).
 *              - itemFromSpec(): pièce créée depuis une fiche panel_specs (les mesures et
 *                dégagements sont COPIÉS dans la pièce: la disposition reste stable même
 *                si la fiche change, et chaque pièce peut être ajustée pour ce projet)
 *              - newRail() / newDuct() / newFreePiece()
 *              - isSpecPlaceable(): la fiche a tout ce qu'il faut pour aller sur le fond
 * @version 1.1.0
 * @date 2026-11-26
 * @changelog
 *   1.1.0 - doorItemFromSpec() / newDoorPiece(): pièces de porte (zone = 'door', profondeur arrière)
 *   1.0.0 - Version initiale (Panneau virtuel PR 2)
 */
import type { LayoutItem } from './layout';
import { DIN_RAIL_HEIGHT } from './layout';
import { ON_BACKPLATE_MOUNTINGS, missingDimensions, type PanelSpec } from './specs';

const f = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};
const r1 = (n: number) => Math.round(n * 10) / 10;

export function newId(prefix = 'p'): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Composant actif, monté sur le fond (rail DIN / vissé) et dont les dimensions sont complètes. */
export function isSpecPlaceable(spec: Partial<PanelSpec> | null | undefined): boolean {
  return !!spec && spec.active !== false && spec.kind === 'component'
    && !!spec.mounting && ON_BACKPLATE_MOUNTINGS.includes(spec.mounting)
    && missingDimensions(spec).length === 0;
}

export function itemFromSpec(
  spec: Partial<PanelSpec> & { product_code: string },
  opts: { id?: string; description?: string | null; quantity?: number | null; x?: number; y?: number } = {}
): LayoutItem {
  const repeated = spec.is_repeated === true;
  const unit = f(spec.unit_width_mm);
  const qty = repeated ? Math.max(1, Math.round(opts.quantity ?? spec.default_quantity ?? 1)) : null;
  const w = repeated && unit ? r1(unit * (qty as number)) : f(spec.width_mm) || 50;
  const description = opts.description || null;
  return {
    id: opts.id || newId(),
    kind: 'component',
    product_id: spec.product_code,
    label: spec.product_code,
    description,
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    w,
    h: f(spec.height_mm) || 50,
    d: f(spec.depth_mm),
    rot: 0,
    c: [f(spec.clearance_top_mm) || 0, f(spec.clearance_bottom_mm) || 0, f(spec.clearance_left_mm) || 0, f(spec.clearance_right_mm) || 0],
    repeated,
    unit_w: repeated ? unit : null,
    qty,
    vertical: spec.must_stay_vertical === true,
    group: spec.stack_group || null,
    watts: f(spec.heat_loss_w),
    cat: spec.visual_category === 'power' ? 'power' : 'control',
    mounting: spec.mounting || null,
    source: spec.source || null,
    note: null,
  };
}

/** Taille d'une pièce de porte dont la fiche n'a pas de dimensions (bouton 22 mm et sa collerette). */
export const DOOR_PLACEHOLDER = 40;

/** Fiche active d'une pièce montée sur la porte. */
export const isDoorSpec = (spec: Partial<PanelSpec> | null | undefined) =>
  !!spec && spec.active !== false && spec.kind === 'component' && spec.mounting === 'door';

/**
 * Pièce de porte (HMI, bouton, arrêt d'urgence…) créée depuis une fiche.
 * Les dimensions sont optionnelles sur une fiche « porte »: sans elles, la pièce
 * est un carré de 40 mm marqué « gabarit » (à corriger dans l'onglet Pièce).
 */
export function doorItemFromSpec(
  spec: Partial<PanelSpec> & { product_code: string },
  opts: { id?: string; description?: string | null; x?: number; y?: number } = {}
): LayoutItem {
  const w = f(spec.width_mm);
  const h = f(spec.height_mm);
  const known = !!w && !!h;
  return {
    id: opts.id || newId('o'),
    kind: 'component',
    zone: 'door',
    product_id: spec.product_code,
    label: spec.product_code,
    description: opts.description || null,
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    w: w || DOOR_PLACEHOLDER,
    h: h || DOOR_PLACEHOLDER,
    d: f(spec.depth_mm),
    rear: f(spec.rear_depth_mm),
    rot: 0,
    c: [0, 0, 0, 0],
    repeated: false, unit_w: null, qty: null,
    vertical: false, group: null,
    watts: f(spec.heat_loss_w),
    cat: 'control',
    mounting: 'door',
    source: known ? spec.source || null : 'template',
    note: null,
  };
}

export const newDoorPiece = (x: number, y: number): LayoutItem => ({
  id: newId('o'), kind: 'free', zone: 'door', product_id: null, label: 'Pièce de porte', description: null, x, y,
  w: DOOR_PLACEHOLDER, h: DOOR_PLACEHOLDER, d: null, rear: null, rot: 0, c: [0, 0, 0, 0], repeated: false, unit_w: null, qty: null,
  vertical: false, group: null, watts: null, cat: 'control', mounting: 'door', source: 'template', note: null,
});

export const newRail = (x: number, y: number, length = 300): LayoutItem =>
  ({ id: newId('r'), kind: 'rail', label: 'Rail DIN 35', x, y, w: length, h: DIN_RAIL_HEIGHT, d: 7.5, rot: 0 });

export const newDuct = (x: number, y: number, vertical = false, length = 300, width = 40): LayoutItem =>
  ({ id: newId('d'), kind: 'duct', label: 'Goulotte', x, y, w: vertical ? width : length, h: vertical ? length : width, d: 60, rot: 0 });

export const newFreePiece = (x: number, y: number): LayoutItem => ({
  id: newId('f'), kind: 'free', product_id: null, label: 'Nouvelle pièce', description: null, x, y,
  w: 50, h: 80, d: 80, rot: 0, c: [0, 0, 0, 0], repeated: false, unit_w: null, qty: null,
  vertical: false, group: null, watts: null, cat: 'control', mounting: 'din', source: 'template', note: null,
});
