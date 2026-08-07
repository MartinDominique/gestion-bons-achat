/**
 * @file lib/utils/priceShift.js
 * @description Utilitaire pour le décalage (shift) de l'historique des prix.
 *              Quand un prix change, les anciens prix sont décalés :
 *              - cost_price_3rd ← cost_price_2nd ← cost_price_1st ← cost_price (ancien)
 *              - selling_price_3rd ← selling_price_2nd ← selling_price_1st ← selling_price (ancien)
 *              Le décalage ne se fait QUE si le nouveau prix est différent de l'ancien.
 * @version 1.2.0
 * @date 2026-08-07
 * @changelog
 *   1.2.0 - Décale aussi l'historique des DATES de prix (price_updated_at_1st/2nd/3rd)
 *           en parallèle des prix, pour afficher la date de chaque prix précédent
 *           dans « Hist. Prix ».
 *   1.1.0 - Enregistre la date du dernier changement de prix (price_updated_at)
 *           dès qu'un coûtant ou un vendant change (affiché dans « Hist. Prix »).
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

  // Dès qu'un prix (coûtant OU vendant) change, on horodate le changement
  // et on décale l'historique des dates en parallèle des prix. Ainsi chaque
  // prix précédent (n-1/n-2/n-3) conserve la date à laquelle il était en vigueur.
  if (Object.keys(updates).length > 0) {
    updates.price_updated_at_3rd = currentProduct.price_updated_at_2nd ?? null;
    updates.price_updated_at_2nd = currentProduct.price_updated_at_1st ?? null;
    updates.price_updated_at_1st = currentProduct.price_updated_at ?? null;
    updates.price_updated_at = new Date().toISOString();
  }

  return updates;
}
