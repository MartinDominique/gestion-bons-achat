/**
 * @file lib/constants/units.js
 * @description Liste canonique des unités de mesure utilisées dans l'inventaire.
 *              - Source unique pour les sélecteurs d'unité (création + édition de produit)
 *              - Ajout de l'unité "Longueur" (Lg) demandée pour les articles vendus
 *                à la longueur (tuyaux, conduits, barres, etc.)
 *              - Helper `unitOptionsWith()` pour garantir que la valeur courante d'un
 *                produit existant reste sélectionnable même si absente de la liste.
 * @version 1.0.0
 * @date 2026-07-14
 * @changelog
 *   1.0.0 - Version initiale (liste partagée InventoryManager + DirectReceiptModal)
 */

// Liste canonique { value, label }
export const UNIT_OPTIONS = [
  { value: 'Un', label: 'Un (unité)' },
  { value: 'Lg', label: 'Lg (longueur)' },
  { value: 'M', label: 'M (mètre)' },
  { value: 'Pi', label: 'Pi (pied)' },
  { value: 'Bte', label: 'Bte (boîte)' },
  { value: 'Rl', label: 'Rl (rouleau)' },
  { value: 'Kg', label: 'Kg (kilogramme)' },
  { value: 'Lb', label: 'Lb (livre)' },
  { value: 'L', label: 'L (litre)' },
  { value: 'Pqt', label: 'Pqt (paquet)' },
];

/**
 * Retourne la liste des options en s'assurant que `currentValue` (l'unité déjà
 * enregistrée sur un produit existant, ex: "UN" ou "PI2") reste présente même si
 * elle n'est pas dans la liste canonique. Évite de perdre/écraser silencieusement
 * une unité existante lors de l'édition.
 */
export function unitOptionsWith(currentValue) {
  if (!currentValue) return UNIT_OPTIONS;
  const exists = UNIT_OPTIONS.some(
    (o) => o.value.toLowerCase() === String(currentValue).toLowerCase()
  );
  if (exists) return UNIT_OPTIONS;
  return [{ value: currentValue, label: currentValue }, ...UNIT_OPTIONS];
}
