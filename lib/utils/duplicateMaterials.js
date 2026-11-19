/**
 * @file lib/utils/duplicateMaterials.js
 * @description Détection des lignes en double (même produit) dans les matériaux d'un BT/BL
 *              - materialCodeKey(): code produit d'une ligne, normalisé (majuscules, sans espaces)
 *              - findDuplicateMaterials(): produits présents sur plus d'une ligne
 *              Signalement seulement: rien n'est fusionné ni bloqué.
 * @version 1.0.0
 * @date 2026-11-19
 * @changelog
 *   1.0.0 - Version initiale
 */

// Code produit d'une ligne de matériau, quelle que soit sa provenance
// (recherche inventaire, import soumission/AF, tableau B/O, rechargement depuis la base).
export function materialCodeKey(material) {
  if (!material) return '';
  const raw =
    material.product?.product_id ||
    material.product_code ||
    material.code ||
    material.product_id ||
    '';
  return String(raw).trim().toUpperCase();
}

// Retourne les produits présents sur plus d'une ligne:
// [{ code, count, totalQuantity }], triés par code. Les lignes sans code sont ignorées.
export function findDuplicateMaterials(materials) {
  const byCode = new Map();
  for (const m of materials || []) {
    const code = materialCodeKey(m);
    if (!code) continue;
    const entry = byCode.get(code) || { code, count: 0, totalQuantity: 0 };
    entry.count += 1;
    entry.totalQuantity += parseFloat(m.quantity) || 0;
    byCode.set(code, entry);
  }
  return [...byCode.values()]
    .filter((e) => e.count > 1)
    .sort((a, b) => a.code.localeCompare(b.code, 'fr-CA'));
}
