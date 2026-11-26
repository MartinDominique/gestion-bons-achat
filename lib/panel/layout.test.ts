/**
 * @file lib/panel/layout.test.ts
 * @description Tests unitaires des calculs du Panneau virtuel (lib/panel/layout.ts).
 *              Le cas PGF2701 est le test d'acceptation du module: fond requis ≈ 838 × 505 mm,
 *              profondeur ≈ 227 mm, chaleur ≥ 151 W, zéro conflit, boîtier 24 × 36 × 10 po suggéré
 *              puis éliminé si l'espace disponible fait moins de 36 po de large.
 *              Lancer: npm test
 * @version 1.0.0
 * @date 2026-11-25
 * @changelog
 *   1.0.0 - Version initiale (Panneau virtuel PR 2)
 */
import { describe, it, expect } from 'vitest';
import {
  findConflicts, requiredPlate, requiredDepth, heatLoad, ventilation, suggestEnclosures, describeDeficits,
  fitPlate, snapToRail, railUsage, alignItems, distributeItems, itemBox, clearanceBox, bodyWidthOf,
  type LayoutItem, type EnclosureSpec,
} from './layout';
import { PGF2701_ITEMS, PGF2701_PLATE } from './pgf2701.fixture';
import { MM_PER_INCH, parseDimensionsFromDescription, missingDimensions, toMm, fromMm } from './specs';

const inch = (n: number) => n * MM_PER_INCH;
const P = (o: Partial<LayoutItem> & { id: string }): LayoutItem => ({
  kind: 'component', label: o.id, x: 0, y: 0, w: 50, h: 50, d: 50, rot: 0, c: [0, 0, 0, 0], ...o,
});

// Boîtier 24 × 36 × 10 po installé à l'horizontale: 36 po de large, fond ≈ 33 × 21 po
const BOX_24_36_10: EnclosureSpec = {
  product_code: 'TEST-243610', width_mm: inch(36), height_mm: inch(24), depth_mm: inch(10),
  backplate_width_mm: inch(33), backplate_height_mm: inch(21), usable_depth_mm: inch(9.5),
  allow_portrait: true, allow_landscape: true,
};
const BOX_AX_300_400: EnclosureSpec = {
  product_code: '1034000', width_mm: 300, height_mm: 400, depth_mm: 210,
  backplate_width_mm: 254, backplate_height_mm: 370, usable_depth_mm: 190,
};

describe('PGF2701 — test d\'acceptation', () => {
  it('ne signale aucun conflit', () => {
    const report = findConflicts(PGF2701_ITEMS, PGF2701_PLATE);
    expect(report.messages).toEqual([]);
    expect(report.bad.size).toBe(0);
  });

  it('fond requis ≈ 838 × 505 mm (marge 15 mm, réserve 0 %)', () => {
    expect(requiredPlate(PGF2701_ITEMS, 15, 0)).toEqual({ w: 838, h: 505 });
  });

  it('la réserve d\'expansion s\'applique sur la largeur seulement', () => {
    expect(requiredPlate(PGF2701_ITEMS, 15, 10)).toEqual({ w: 918.8, h: 505 });
  });

  it('profondeur requise ≈ 227 mm (HMI 50 mm derrière la porte)', () => {
    expect(requiredDepth(PGF2701_ITEMS, 50)).toBe(227);
  });

  it('chaleur ≥ 151 W (des valeurs manquent)', () => {
    const heat = heatLoad(PGF2701_ITEMS);
    expect(heat.watts).toBeCloseTo(151.1, 1);
    expect(heat.incomplete).toBe(true);
  });

  it('suggère le boîtier 24 × 36 × 10 po, pas le Rittal 300 × 400', () => {
    const need = requiredPlate(PGF2701_ITEMS, 15, 0)!;
    const res = suggestEnclosures([BOX_AX_300_400, BOX_24_36_10], need, requiredDepth(PGF2701_ITEMS, 50));
    expect(res.fits.map((f) => f.enclosure.product_code)).toEqual(['TEST-243610']);
    expect(res.fits[0].orientation).toBe('portrait');
    expect(res.rejected.map((f) => f.enclosure.product_code)).toEqual(['1034000']);
    expect(describeDeficits(res.rejected[0]).join(' ')).toMatch(/fond trop/);
  });

  it('élimine le 24 × 36 × 10 si l\'espace disponible fait moins de 36 po de large', () => {
    const need = requiredPlate(PGF2701_ITEMS, 15, 0)!;
    const depth = requiredDepth(PGF2701_ITEMS, 50);
    expect(suggestEnclosures([BOX_24_36_10], need, depth, { w: inch(36) }).fits).toHaveLength(1);
    const res = suggestEnclosures([BOX_24_36_10], need, depth, { w: inch(35.9) });
    expect(res.fits).toHaveLength(0);
    expect(describeDeficits(res.rejected[0]).join(' ')).toMatch(/trop large/);
  });

  it('le rail DIN est occupé à environ 76 %', () => {
    const rail = PGF2701_ITEMS.find((i) => i.id === 'r1')!;
    const usage = railUsage(rail, PGF2701_ITEMS);
    expect(usage.length).toBe(808);
    expect(usage.ratio).toBeGreaterThan(0.7);
    expect(usage.ratio).toBeLessThan(0.85);
  });
});

describe('conflits', () => {
  const plate = { w: 500, h: 500 };

  it('corps contre corps', () => {
    const r = findConflicts([P({ id: 'a', x: 10, y: 10 }), P({ id: 'b', x: 40, y: 40 })], plate);
    expect(r.conflicts.map((c) => c.type)).toEqual(['overlap']);
    expect(Array.from(r.bad).sort()).toEqual(['a', 'b']);
  });

  it('deux pièces qui se touchent ne sont pas en conflit', () => {
    expect(findConflicts([P({ id: 'a', x: 10 }), P({ id: 'b', x: 60 })], plate).conflicts).toHaveLength(0);
  });

  it('corps dans le dégagement d\'une autre pièce', () => {
    const r = findConflicts([P({ id: 'vfd', x: 100, y: 100, c: [50, 50, 30, 30] }), P({ id: 'b', x: 170, y: 100 })], plate);
    expect(r.conflicts[0]).toMatchObject({ type: 'clearance', ids: ['b'], clearanceOf: 'vfd' });
    expect(r.badClearance.has('vfd')).toBe(true);
  });

  it('même groupe d\'empilage: collées sans conflit de dégagement', () => {
    const items = [
      P({ id: 'cpu', x: 100, y: 100, c: [50, 50, 50, 50], group: 'P1000' }),
      P({ id: 'io', x: 150, y: 100, c: [50, 50, 50, 50], group: 'P1000' }),
    ];
    expect(findConflicts(items, plate).conflicts).toHaveLength(0);
    items[1].group = 'AUTRE';
    expect(findConflicts(items, plate).conflicts).toHaveLength(2);
  });

  it('corps qui dépasse du fond', () => {
    expect(findConflicts([P({ id: 'a', x: 470, y: 10 })], plate).conflicts[0].type).toBe('outside');
    expect(findConflicts([P({ id: 'a', x: -1, y: 10 })], plate).conflicts[0].type).toBe('outside');
  });

  it('un dégagement peut dépasser du fond', () => {
    expect(findConflicts([P({ id: 'a', x: 0, y: 0, c: [50, 50, 50, 50] })], plate).conflicts).toHaveLength(0);
  });

  it('rail et goulotte permis dans un dégagement; goulotte interdite sur un corps', () => {
    const vfd = P({ id: 'vfd', x: 100, y: 100, c: [50, 50, 30, 30] });
    const duct: LayoutItem = { id: 'd', kind: 'duct', label: 'Goulotte', x: 0, y: 60, w: 400, h: 40 };
    const rail: LayoutItem = { id: 'r', kind: 'rail', label: 'Rail', x: 0, y: 110, w: 400, h: 35 };
    expect(findConflicts([vfd, duct, rail], plate).conflicts).toHaveLength(0);
    const r = findConflicts([vfd, { ...duct, y: 90 }], plate);
    expect(r.conflicts[0].type).toBe('duct');
  });

  it('pièce « doit rester verticale » tournée', () => {
    const r = findConflicts([P({ id: 'vfd', x: 100, y: 100, w: 80, h: 150, vertical: true, rot: 90 })], plate);
    expect(r.conflicts[0].type).toBe('vertical');
  });
});

describe('géométrie', () => {
  it('pièce répétée: largeur = quantité × largeur par unité', () => {
    expect(bodyWidthOf(P({ id: 'tb', repeated: true, unit_w: 5.2, qty: 48 }))).toBe(249.6);
  });

  it('rotation: la boîte et les dégagements tournent', () => {
    const i = P({ id: 'a', x: 100, y: 100, w: 80, h: 150, c: [50, 40, 30, 20], rot: 90 });
    expect(itemBox(i)).toEqual({ x: 100, y: 100, w: 150, h: 80 });
    // haut ← gauche (30), bas ← droite (20), gauche ← bas (40), droite ← haut (50)
    expect(clearanceBox(i)).toEqual({ x: 60, y: 70, w: 240, h: 130 });
  });

  it('une pièce DIN déposée sur un rail s\'aligne sur son axe', () => {
    const rail: LayoutItem = { id: 'r', kind: 'rail', label: 'Rail', x: 20, y: 352, w: 800, h: 35 };
    const psu = P({ id: 'psu', x: 200, y: 300, w: 35, h: 130, mounting: 'din' });
    expect(snapToRail(psu, [rail, psu])).toEqual({ x: 200, y: 304.5, railId: 'r' });
    expect(snapToRail({ ...psu, mounting: 'backplate' }, [rail, psu])).toBeNull();
    expect(snapToRail({ ...psu, y: 50 }, [rail, psu])).toBeNull();
  });

  it('ajuster le fond: tout ramené à la marge, fond coupé aux 5 mm', () => {
    const res = fitPlate([P({ id: 'a', x: 100, y: 200, w: 52, h: 50 }), P({ id: 'b', x: 300, y: 250 })], 15)!;
    expect(res.items.map((i) => [i.x, i.y])).toEqual([[15, 15], [215, 65]]);
    expect(res.plate).toEqual({ w: 280, h: 130 });
  });

  it('aligner et répartir', () => {
    const items = [P({ id: 'a', x: 10, y: 10 }), P({ id: 'b', x: 100, y: 40 }), P({ id: 'c', x: 300, y: 90 })];
    const ids = new Set(['a', 'b', 'c']);
    expect(alignItems(items, ids, 'top').map((i) => i.y)).toEqual([10, 10, 10]);
    expect(alignItems(items, ids, 'right').map((i) => i.x)).toEqual([300, 300, 300]);
    expect(distributeItems(items, ids, 'x').map((i) => i.x)).toEqual([10, 155, 300]);
  });

  it('ventilation: 3,1 × W ÷ ΔT', () => {
    expect(ventilation(151.1, 10)).toEqual({ m3h: 47, cfm: 28 });
    expect(ventilation(0, 10)).toBeNull();
  });
});

describe('boîtiers', () => {
  it('teste le boîtier couché quand c\'est permis', () => {
    const tall: EnclosureSpec = {
      product_code: 'TALL', width_mm: 600, height_mm: 900, depth_mm: 250,
      backplate_width_mm: 540, backplate_height_mm: 840, usable_depth_mm: 230,
    };
    const need = { w: 800, h: 500 };
    expect(suggestEnclosures([tall], need, 200).fits[0].orientation).toBe('landscape');
    expect(suggestEnclosures([{ ...tall, allow_landscape: false }], need, 200).fits).toHaveLength(0);
  });

  it('trie par volume extérieur et écarte les fiches incomplètes', () => {
    const big: EnclosureSpec = { ...BOX_24_36_10, product_code: 'BIG', depth_mm: inch(12), usable_depth_mm: inch(11.5) };
    const res = suggestEnclosures([big, BOX_24_36_10, { ...BOX_AX_300_400, backplate_width_mm: null }], { w: 800, h: 500 }, 200);
    expect(res.fits.map((f) => f.enclosure.product_code)).toEqual(['TEST-243610', 'BIG']);
    expect(res.incomplete).toHaveLength(1);
  });

  it('la marge non utilisable réduit le fond', () => {
    const res = suggestEnclosures([{ ...BOX_24_36_10, unusable_margin_mm: 10 }], { w: 838, h: 505 }, 227);
    expect(res.fits).toHaveLength(0);
    expect(res.rejected[0].deficits.plateW).toBeCloseTo(19.8, 1);
  });
});

describe('fiches (specs)', () => {
  it('lit les dimensions dans la description', () => {
    expect(parseDimensionsFromDescription('BOITIER RITTAL AX 300X400X210mm')).toMatchObject({ unit: 'mm', width_mm: 300, height_mm: 400, depth_mm: 210 });
    expect(parseDimensionsFromDescription("BOITIER RITTAL 36 X 24 X 10'' NEMA 4-12")).toMatchObject({ unit: 'in', height_mm: 914.4, width_mm: 609.6, depth_mm: 254 });
    expect(parseDimensionsFromDescription('VIS 10-32')).toBeNull();
  });

  it('mm ↔ pouces', () => {
    expect(toMm('3,5', 'in')).toBe(88.9);
    expect(fromMm(87, 'in')).toBe(3.425);
    expect(toMm('', 'mm')).toBeNull();
  });

  it('dimensions manquantes', () => {
    expect(missingDimensions({ kind: 'component', mounting: 'door' })).toEqual([]);
    expect(missingDimensions({ kind: 'component', mounting: 'din', is_repeated: true, unit_width_mm: 5.2, height_mm: 48, depth_mm: 35 })).toEqual([]);
    expect(missingDimensions({ kind: 'enclosure', backplate_width_mm: 500 })).toHaveLength(2);
  });
});
