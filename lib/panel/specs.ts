/**
 * @file lib/panel/specs.ts
 * @description Panneau virtuel — définitions partagées (serveur + navigateur) de la
 *              fiche technique d'un produit (table panel_specs). Module PUR: aucun
 *              accès réseau ni base de données.
 *              - Listes de choix (type, montage, source, catégorie) avec libellés fr-CA
 *              - Conversion mm ↔ pouces (les mesures sont TOUJOURS stockées en mm)
 *              - missingDimensions(): ce qui manque pour placer la pièce / choisir le boîtier
 *              - parseDimensionsFromDescription(): « 300X400X210mm », « 36 X 24 X 10'' »
 *              - sanitizeSpecPayload(): ne garde que les champs connus, nombres validés
 * @version 1.1.0
 * @date 2026-11-26
 * @changelog
 *   1.1.0 - Champ `shape` ('rect' | 'round'): pièces rondes (boutons, voyants, arrêts d'urgence)
 *   1.0.0 - Version initiale (Panneau virtuel PR 1)
 */

export type PanelKind = 'component' | 'enclosure';
export type PanelMounting = 'din' | 'backplate' | 'door' | 'wall' | 'field' | 'accessory';
export type PanelSource = 'datasheet' | 'approx' | 'template';
export type PanelCategory = 'power' | 'control';
export type LengthUnit = 'mm' | 'in';

export interface PanelSpec {
  id?: string;
  product_code: string;
  active: boolean;
  kind: PanelKind;
  width_mm: number | null;
  height_mm: number | null;
  depth_mm: number | null;
  mounting: PanelMounting | null;
  clearance_top_mm: number;
  clearance_bottom_mm: number;
  clearance_left_mm: number;
  clearance_right_mm: number;
  must_stay_vertical: boolean;
  stack_group: string | null;
  is_repeated: boolean;
  unit_width_mm: number | null;
  default_quantity: number | null;
  heat_loss_w: number | null;
  visual_category: PanelCategory;
  rear_depth_mm: number | null;
  /** Forme vue de face; ronde = la largeur sert de diamètre */
  shape?: 'rect' | 'round';
  source: PanelSource;
  backplate_width_mm: number | null;
  backplate_height_mm: number | null;
  usable_depth_mm: number | null;
  unusable_margin_mm: number | null;
  rating: string | null;
  material: string | null;
  allow_portrait: boolean;
  allow_landscape: boolean;
  datasheet_url: string | null;
  photo_front_path: string | null;
  photo_iso_path: string | null;
  notes: string | null;
  updated_at?: string;
}

export const PANEL_KINDS: { value: PanelKind; label: string }[] = [
  { value: 'component', label: 'Composant' },
  { value: 'enclosure', label: 'Boîtier' },
];

export const PANEL_MOUNTINGS: { value: PanelMounting; label: string }[] = [
  { value: 'din', label: 'Rail DIN' },
  { value: 'backplate', label: 'Fond (vissé)' },
  { value: 'door', label: 'Porte' },
  { value: 'wall', label: 'Paroi (côté/dessus)' },
  { value: 'field', label: 'Terrain' },
  { value: 'accessory', label: 'Accessoire (dans une autre pièce)' },
];

export const PANEL_SOURCES: { value: PanelSource; label: string; hint: string }[] = [
  { value: 'datasheet', label: 'Fiche', hint: 'Vérifié sur la fiche technique' },
  { value: 'approx', label: 'Approx.', hint: 'Mesure approximative' },
  { value: 'template', label: 'Gabarit', hint: 'Taille typique, pièce pas encore choisie' },
];

export const PANEL_CATEGORIES: { value: PanelCategory; label: string }[] = [
  { value: 'control', label: 'Contrôle' },
  { value: 'power', label: 'Puissance' },
];

/** Montages qui vont SUR le fond de panneau (les seuls placés sur le plan). */
export const ON_BACKPLATE_MOUNTINGS: PanelMounting[] = ['din', 'backplate'];

export const PHOTO_SLOTS = ['front', 'iso'] as const;
export type PhotoSlot = (typeof PHOTO_SLOTS)[number];

export function labelOf<T extends string>(list: { value: T; label: string }[], value: T | null | undefined): string {
  return list.find((o) => o.value === value)?.label || '';
}

/** Fiche vide (valeurs par défaut de la base). */
export function emptySpec(productCode: string, kind: PanelKind = 'component'): PanelSpec {
  return {
    product_code: productCode,
    active: true,
    kind,
    width_mm: null,
    height_mm: null,
    depth_mm: null,
    mounting: kind === 'component' ? 'din' : null,
    clearance_top_mm: 0,
    clearance_bottom_mm: 0,
    clearance_left_mm: 0,
    clearance_right_mm: 0,
    must_stay_vertical: false,
    stack_group: null,
    is_repeated: false,
    unit_width_mm: null,
    default_quantity: null,
    heat_loss_w: null,
    visual_category: 'control',
    rear_depth_mm: null,
    shape: 'rect',
    source: 'approx',
    backplate_width_mm: null,
    backplate_height_mm: null,
    usable_depth_mm: null,
    unusable_margin_mm: null,
    rating: null,
    material: null,
    allow_portrait: true,
    allow_landscape: true,
    datasheet_url: null,
    photo_front_path: null,
    photo_iso_path: null,
    notes: null,
  };
}

// ---------- Unités ----------

export const MM_PER_INCH = 25.4;

const pos = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** « 12,5 » ou « 12.5 » → 12.5; vide ou invalide → null. */
export function parseNumber(input: unknown): number | null {
  if (input == null) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  const s = String(input).trim().replace(/\s+/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const round = (n: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};

/** Valeur saisie dans l'unité d'affichage → mm (2 décimales). */
export function toMm(input: unknown, unit: LengthUnit): number | null {
  const n = parseNumber(input);
  if (n == null) return null;
  return round(unit === 'in' ? n * MM_PER_INCH : n, 2);
}

/** mm → valeur dans l'unité d'affichage (mm: 1 décimale, po: 3 décimales). */
export function fromMm(mm: number | null | undefined, unit: LengthUnit): number | null {
  if (mm == null || !Number.isFinite(Number(mm))) return null;
  const v = Number(mm);
  return unit === 'in' ? round(v / MM_PER_INCH, 3) : round(v, 1);
}

/** mm → texte « 87 mm » / « 3,425 po » (locale fr-CA). */
export function formatLength(mm: number | null | undefined, unit: LengthUnit): string {
  const v = fromMm(mm, unit);
  if (v == null) return '—';
  const txt = v.toLocaleString('fr-CA', { maximumFractionDigits: unit === 'in' ? 3 : 1 });
  return `${txt} ${unit === 'in' ? 'po' : 'mm'}`;
}

// ---------- Complétude ----------

/** Largeur du corps: pièce répétée = quantité × largeur par unité. */
export function bodyWidth(spec: Pick<PanelSpec, 'is_repeated' | 'unit_width_mm' | 'default_quantity' | 'width_mm'>, quantity?: number): number | null {
  if (spec.is_repeated) {
    if (!pos(spec.unit_width_mm)) return null;
    const q = quantity ?? spec.default_quantity ?? 1;
    return round(spec.unit_width_mm * Math.max(1, q), 2);
  }
  return pos(spec.width_mm) ? spec.width_mm : null;
}

/**
 * Ce qui manque pour que la fiche soit utilisable par le Panneau virtuel.
 * - Composant sur le fond (rail DIN / vissé): largeur (ou largeur par unité), hauteur, profondeur
 * - Composant hors fond (porte, paroi, terrain, accessoire): rien d'obligatoire
 * - Boîtier: fond de panneau L × H + profondeur utile
 * Renvoie la liste des libellés manquants (vide = fiche complète).
 */
export function missingDimensions(spec: Partial<PanelSpec> | null | undefined): string[] {
  if (!spec) return [];
  const missing: string[] = [];
  if (spec.kind === 'enclosure') {
    if (!pos(spec.backplate_width_mm)) missing.push('Largeur du fond de panneau');
    if (!pos(spec.backplate_height_mm)) missing.push('Hauteur du fond de panneau');
    if (!pos(spec.usable_depth_mm)) missing.push('Profondeur utile');
    return missing;
  }
  if (!spec.mounting) {
    missing.push('Montage');
    return missing;
  }
  if (!ON_BACKPLATE_MOUNTINGS.includes(spec.mounting)) return missing;
  if (spec.is_repeated) {
    if (!pos(spec.unit_width_mm)) missing.push('Largeur par unité');
  } else if (!pos(spec.width_mm)) {
    missing.push('Largeur');
  }
  if (!pos(spec.height_mm)) missing.push('Hauteur');
  if (!pos(spec.depth_mm)) missing.push('Profondeur');
  return missing;
}

export type PanelStatus = 'none' | 'inactive' | 'ok' | 'missing';

/** Statut d'une fiche pour les pastilles et le filtre de l'Inventaire. */
export function panelStatus(spec: Partial<PanelSpec> | null | undefined): PanelStatus {
  if (!spec) return 'none';
  if (!spec.active) return 'inactive';
  return missingDimensions(spec).length > 0 ? 'missing' : 'ok';
}

// ---------- Dimensions dans la description ----------

export interface ParsedDimensions {
  /** Les trois nombres dans l'ordre écrit, convertis en mm */
  values_mm: [number, number, number];
  unit: LengthUnit;
  /** Interprétation proposée (À VÉRIFIER par l'usager) */
  width_mm: number;
  height_mm: number;
  depth_mm: number;
}

/**
 * Cherche « A x B x C » dans une description de boîtier.
 * Unité: « mm » écrit, ou un nombre > 60 → mm; sinon pouces.
 * Interprétation proposée: métrique (Rittal AX/KX) = L × H × P; pouces (NEMA) = H × L × P.
 * Ce n'est qu'une suggestion: le fabricant ne suit pas toujours la convention.
 */
export function parseDimensionsFromDescription(description: string | null | undefined): ParsedDimensions | null {
  if (!description) return null;
  const m = String(description).match(
    /(\d+(?:[.,]\d+)?)\s*(?:mm|''|"|po)?\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*(?:mm|''|"|po)?\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*(mm|''|"|po|D)?/
  );
  if (!m) return null;
  const nums = [m[1], m[2], m[3]].map((s) => Number(s.replace(',', '.')));
  if (nums.some((n) => !Number.isFinite(n) || n <= 0)) return null;
  const saysMm = /\d\s*mm\b/i.test(description);
  const saysInch = /''|"|\bpo\b/i.test(description);
  const unit: LengthUnit = saysMm ? 'mm' : saysInch ? 'in' : Math.max(...nums) > 60 ? 'mm' : 'in';
  const mm = nums.map((n) => round(unit === 'in' ? n * MM_PER_INCH : n, 2)) as [number, number, number];
  const [a, b, c] = mm;
  return unit === 'mm'
    ? { values_mm: mm, unit, width_mm: a, height_mm: b, depth_mm: c }
    : { values_mm: mm, unit, width_mm: b, height_mm: a, depth_mm: c };
}

// ---------- Validation du contenu envoyé à l'API ----------

const NUMERIC_NULLABLE = [
  'width_mm', 'height_mm', 'depth_mm', 'unit_width_mm', 'heat_loss_w', 'rear_depth_mm',
  'backplate_width_mm', 'backplate_height_mm', 'usable_depth_mm', 'unusable_margin_mm',
] as const;
const NUMERIC_ZERO = [
  'clearance_top_mm', 'clearance_bottom_mm', 'clearance_left_mm', 'clearance_right_mm',
] as const;
const BOOLEANS = ['active', 'must_stay_vertical', 'is_repeated', 'allow_portrait', 'allow_landscape'] as const;
const TEXTS = ['stack_group', 'rating', 'material', 'datasheet_url', 'notes'] as const;
const MAX_MM = 100000;

/**
 * Ne garde que les champs connus de panel_specs (les photos passent par leur
 * propre route). Champs absents de `input` = non modifiés. Lance une Error
 * (message fr-CA) si une valeur est invalide.
 */
export function sanitizeSpecPayload(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(input, k);

  if (has('kind')) {
    if (input.kind !== 'component' && input.kind !== 'enclosure') throw new Error('Type invalide');
    out.kind = input.kind;
  }
  if (has('mounting')) {
    const v = input.mounting || null;
    if (v !== null && !PANEL_MOUNTINGS.some((o) => o.value === v)) throw new Error('Montage invalide');
    out.mounting = v;
  }
  if (has('source')) {
    if (!PANEL_SOURCES.some((o) => o.value === input.source)) throw new Error('Source invalide');
    out.source = input.source;
  }
  if (has('shape')) {
    if (input.shape !== 'rect' && input.shape !== 'round') throw new Error('Forme invalide');
    out.shape = input.shape;
  }
  if (has('visual_category')) {
    if (!PANEL_CATEGORIES.some((o) => o.value === input.visual_category)) throw new Error('Catégorie invalide');
    out.visual_category = input.visual_category;
  }
  for (const k of NUMERIC_NULLABLE) {
    if (!has(k)) continue;
    const n = parseNumber(input[k]);
    if (n != null && (n < 0 || n > MAX_MM)) throw new Error(`Valeur hors limites: ${k}`);
    out[k] = n;
  }
  for (const k of NUMERIC_ZERO) {
    if (!has(k)) continue;
    const n = parseNumber(input[k]) ?? 0;
    if (n < 0 || n > MAX_MM) throw new Error(`Valeur hors limites: ${k}`);
    out[k] = n;
  }
  if (has('default_quantity')) {
    const n = parseNumber(input.default_quantity);
    if (n != null && (n < 1 || n > 1000)) throw new Error('Quantité par défaut invalide (1 à 1000)');
    out.default_quantity = n == null ? null : Math.round(n);
  }
  for (const k of BOOLEANS) {
    if (has(k)) out[k] = input[k] === true;
  }
  for (const k of TEXTS) {
    if (!has(k)) continue;
    const s = input[k] == null ? '' : String(input[k]).trim();
    out[k] = s === '' ? null : s.slice(0, 2000);
  }
  if (typeof out.datasheet_url === 'string' && !/^https?:\/\//i.test(out.datasheet_url)) {
    throw new Error('Le lien de la fiche technique doit commencer par http:// ou https://');
  }
  return out;
}
