/**
 * @file lib/panel/pgf2701.fixture.ts
 * @description Panneau virtuel — disposition de référence PGF2701 (reprise du prototype
 *              docs/pdf-references/panneau-pgf2701.html). Sert au test d'acceptation
 *              (lib/panel/layout.test.ts) et à créer la disposition de test dans la base.
 *              Fond 838 × 533 mm, 3 goulottes de 798 × 40 (y = 20, 250, 455), un rail DIN
 *              à y = 352, rangée puissance à y = 75, rangée contrôle sur le rail.
 * @version 1.0.0
 * @date 2026-11-25
 * @changelog
 *   1.0.0 - Version initiale (Panneau virtuel PR 2)
 */
import type { LayoutItem, Plate } from './layout';

export const PGF2701_PLATE: Plate = { w: 838, h: 533 };

const piece = (p: Partial<LayoutItem> & Pick<LayoutItem, 'id' | 'label' | 'x' | 'y' | 'w' | 'h' | 'd'>): LayoutItem => ({
  kind: 'component', rot: 0, c: [0, 0, 0, 0], cat: 'control', mounting: 'din', source: 'datasheet', ...p,
});
const tmpl = (p: Parameters<typeof piece>[0]): LayoutItem => piece({ kind: 'free', product_id: null, source: 'template', ...p });

export const PGF2701_ITEMS: LayoutItem[] = [
  { id: 'd1', kind: 'duct', label: 'Goulotte', x: 20, y: 20, w: 798, h: 40, d: 60 },
  { id: 'd2', kind: 'duct', label: 'Goulotte', x: 20, y: 250, w: 798, h: 40, d: 60 },
  { id: 'd3', kind: 'duct', label: 'Goulotte', x: 20, y: 455, w: 798, h: 40, d: 60 },
  { id: 'r1', kind: 'rail', label: 'Rail DIN 35', x: 20, y: 352, w: 808, h: 35, d: 7.5 },

  // Rangée puissance (y = 75)
  piece({ id: 'disc', product_id: 'L11J301753', label: 'Sectionneur 30 A cl. J', x: 30, y: 75, w: 106, h: 113, d: 104, c: [10, 10, 10, 10], cat: 'power', mounting: 'backplate', source: 'approx' }),
  tmpl({ id: 'fb1', label: 'Fus. VFD 5 HP', x: 156, y: 75, w: 54, h: 81, d: 76, c: [5, 5, 5, 5], cat: 'power', mounting: 'backplate' }),
  tmpl({ id: 'fb2', label: 'Fus. VFD 1 HP', x: 220, y: 75, w: 54, h: 81, d: 76, c: [5, 5, 5, 5], cat: 'power', mounting: 'backplate' }),
  piece({ id: 'lr5', product_id: 'LR2-55P0', label: 'Inductance 5 HP', x: 300, y: 75, w: 113, h: 96, d: 108, c: [20, 20, 20, 20], cat: 'power', mounting: 'backplate', source: 'approx' }),
  piece({ id: 'lr1', product_id: 'LR2-51P0', label: 'Inductance 1 HP', x: 440, y: 75, w: 113, h: 92, d: 113, c: [20, 20, 20, 20], cat: 'power', mounting: 'backplate', source: 'approx' }),
  piece({ id: 'v5', product_id: 'GS23-55P0', label: 'GS20 5 HP', x: 590, y: 75, w: 87, h: 157, d: 152, c: [50, 50, 30, 30], cat: 'power', mounting: 'backplate', vertical: true, watts: 106.1 }),
  piece({ id: 'v1', product_id: 'GS23-51P0', label: 'GS20 1 HP', x: 740, y: 75, w: 68, h: 128, d: 143, c: [50, 50, 30, 30], cat: 'power', mounting: 'backplate', vertical: true, watts: 36 }),
  tmpl({ id: 'gnd', label: 'Barre de terre', x: 30, y: 210, w: 100, h: 25, d: 30, cat: 'power', mounting: 'backplate' }),

  // Rangée contrôle, sur le rail (axe y = 369,5)
  tmpl({ id: 'tx', label: 'Transfo 600/120 V', x: 30, y: 322, w: 102, h: 95, d: 100, c: [10, 10, 10, 10], cat: 'power', mounting: 'backplate' }),
  tmpl({ id: 'cb', label: 'Disj. contrôle', x: 150, y: 327, w: 54, h: 85, d: 75, c: [5, 5, 5, 5], repeated: true, unit_w: 18, qty: 3 }),
  piece({ id: 'psu', product_id: '1110466', label: 'Alim. 24 V 120 W', x: 215, y: 304.5, w: 35, h: 130, d: 129, c: [30, 30, 10, 10], vertical: true, watts: 9 }),
  tmpl({ id: 'sr', label: 'Relais sécurité', x: 265, y: 319.5, w: 22.5, h: 100, d: 120 }),
  piece({ id: 'sw', product_id: '1085039', label: 'Switch 5 ports', x: 295, y: 311, w: 22.5, h: 117, d: 123 }),
  piece({ id: 'plc', product_id: 'P1-412', label: 'CPU P1-412', x: 370, y: 323.1, w: 26.6, h: 92.8, d: 91.6, c: [50, 50, 50, 50], group: 'P1000' }),
  piece({ id: 'io1', product_id: 'P1-16ND3', label: 'Module 16 entrées', x: 396.6, y: 322.7, w: 17.2, h: 93.6, d: 86.6, c: [50, 50, 50, 50], group: 'P1000' }),
  piece({ id: 'io2', product_id: 'P1-16ND3', label: 'Module 16 entrées', x: 413.8, y: 322.7, w: 17.2, h: 93.6, d: 86.6, c: [50, 50, 50, 50], group: 'P1000' }),
  piece({ id: 'io3', product_id: 'P1-15TD2', label: 'Module 15 sorties', x: 431, y: 322.7, w: 17.2, h: 93.6, d: 86.6, c: [50, 50, 50, 50], group: 'P1000' }),
  piece({ id: 'tb', product_id: '3209510', label: 'Borniers PT 2,5', x: 505, y: 345.3, w: 249.6, h: 48.5, d: 35.3, repeated: true, unit_w: 5.2, qty: 48 }),
  tmpl({ id: 'tbp', label: 'Borniers moteurs', x: 762, y: 341.5, w: 65.6, h: 56, d: 42, cat: 'power', repeated: true, unit_w: 8.2, qty: 8 }),
];
