/**
 * @file lib/utils/priceShift.js
 * @description Utilitaire pour le décalage (shift) de l'historique des prix.
 *              Quand un prix change, les anciens prix sont décalés :
 *              - cost_price_3rd ← cost_price_2nd ← cost_price_1st ← cost_price (ancien)
 *              - selling_price_3rd ← selling_price_2nd ← selling_price_1st ← selling_price (ancien)
 *              Le décalage ne se fait QUE si le nouveau prix est différent de l'ancien.
 * @version 1.0.0
 * @date 2026-02-11
 * @changelog
 *   1.0.0 - Version initiale
 */

/**
 * Calcule les champs de décalage de prix pour une mise à jour produit.
 *
 * @param {Object} currentProduct - Le produit actuel (avec ses prix et historique)
 * @param {Object} newPrices - Les nouveaux prix { cost_price?, selling_price? }
 * @returns {Object} Les champs à inclure dans l'update Supabase
 */
export function buildPriceShiftUpdates(currentProduct, newPrices) {
  const updates = {};

  // --- Cost price shift ---
  if (newPrices.cost_price !== undefined) {
    const oldCost = parseFloat(currentProduct.cost_price) || 0;
    const newCost = parseFloat(newPrices.cost_price) || 0;

    if (newCost !== oldCost) {
      updates.cost_price_3rd = currentProduct.cost_price_2nd ?? null;
      updates.cost_price_2nd = currentProduct.cost_price_1st ?? null;
      updates.cost_price_1st = oldCost;
      updates.cost_price = newCost;
    }
  }

  // --- Selling price shift ---
  if (newPrices.selling_price !== undefined) {
    const oldSelling = parseFloat(currentProduct.selling_price) || 0;
    const newSelling = parseFloat(newPrices.selling_price) || 0;

    if (newSelling !== oldSelling) {
      updates.selling_price_3rd = currentProduct.selling_price_2nd ?? null;
      updates.selling_price_2nd = currentProduct.selling_price_1st ?? null;
      updates.selling_price_1st = oldSelling;
      updates.selling_price = newSelling;
    }
  }

  return updates;
}
