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
 * @version 1.0.0
 * @date 2026-11-25
 * @changelog
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

export const newRail = (x: number, y: number, length = 300): LayoutItem =>
  ({ id: newId('r'), kind: 'rail', label: 'Rail DIN 35', x, y, w: length, h: DIN_RAIL_HEIGHT, d: 7.5, rot: 0 });

export const newDuct = (x: number, y: number, vertical = false, length = 300, width = 40): LayoutItem =>
  ({ id: newId('d'), kind: 'duct', label: 'Goulotte', x, y, w: vertical ? width : length, h: vertical ? length : width, d: 60, rot: 0 });

export const newFreePiece = (x: number, y: number): LayoutItem => ({
  id: newId('f'), kind: 'free', product_id: null, label: 'Nouvelle pièce', description: null, x, y,
  w: 50, h: 80, d: 80, rot: 0, c: [0, 0, 0, 0], repeated: false, unit_w: null, qty: null,
  vertical: false, group: null, watts: null, cat: 'control', mounting: 'din', source: 'template', note: null,
});
