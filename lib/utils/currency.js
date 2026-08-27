/**
 * @file lib/utils/currency.js
 * @description Conversion USD -> CAD pour les coûtants d'achat.
 *              Règle absolue de l'application: `cost_price` est TOUJOURS en CAD.
 *              Le USD n'est qu'une façon de SAISIR un coûtant — aucune autre
 *              partie de l'app (soumissions, AF, BT/BL, factures, rapports)
 *              n'a à connaître une seconde devise.
 *
 *              Coût CAD = montant USD x taux du marché x (1 + frais bancaires %)
 *              Les frais bancaires représentent la marge que la banque (BMO)
 *              ajoute au taux du marché; elle n'apparaît jamais comme frais
 *              séparé sur le relevé, elle est cachée dans le taux obtenu.
 * @version 1.0.0
 * @date 2026-08-27
 * @changelog
 *   1.0.0 - Version initiale (achats en USD)
 */

// Frais bancaires par défaut si les paramètres ne sont pas encore configurés.
// BMO applique généralement entre 2,5 % et 3,5 % par-dessus le taux du marché.
export const DEFAULT_FX_FEE_PERCENT = 3.5;

// Taux de repli de dernier recours (aucune source jointe, aucun taux en cache).
export const FALLBACK_USD_CAD_RATE = 1.35;

export const CURRENCY_CAD = 'CAD';
export const CURRENCY_USD = 'USD';

/**
 * Taux effectif réellement payé = taux du marché majoré des frais bancaires.
 */
export function effectiveUsdToCadRate(marketRate, feePercent = DEFAULT_FX_FEE_PERCENT) {
  const rate = parseFloat(marketRate);
  const fee = parseFloat(feePercent);
  if (!isFinite(rate) || rate <= 0) return null;
  const safeFee = isFinite(fee) && fee >= 0 ? fee : 0;
  return rate * (1 + safeFee / 100);
}

/**
 * Convertit un montant USD en CAD, frais bancaires inclus.
 * @returns {number|null} montant CAD arrondi au cent, ou null si entrée invalide
 */
export function convertUsdToCad(usdAmount, marketRate, feePercent = DEFAULT_FX_FEE_PERCENT) {
  const usd = parseFloat(usdAmount);
  const effective = effectiveUsdToCadRate(marketRate, feePercent);
  if (!isFinite(usd) || effective === null) return null;
  return Math.round(usd * effective * 100) / 100;
}

/**
 * Opération inverse: retrouver le montant USD correspondant à un coûtant CAD.
 * Utile pour pré-remplir le champ USD d'un produit converti auparavant.
 */
export function convertCadToUsd(cadAmount, marketRate, feePercent = DEFAULT_FX_FEE_PERCENT) {
  const cad = parseFloat(cadAmount);
  const effective = effectiveUsdToCadRate(marketRate, feePercent);
  if (!isFinite(cad) || effective === null || effective === 0) return null;
  return Math.round((cad / effective) * 10000) / 10000;
}

/**
 * Affichage du taux (4 décimales, usage financier courant).
 */
export function formatRate(rate) {
  const value = parseFloat(rate);
  return isFinite(value) ? value.toFixed(4) : '—';
}

/**
 * Libellé de la date d'observation d'un taux (fr-CA, fuseau Québec).
 */
export function formatRateDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(`${value}T12:00:00`);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString('fr-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Toronto',
  });
}

/**
 * Champs à écrire sur une fiche produit lors d'une saisie en USD.
 * Renvoie aussi les champs de remise à zéro quand on repasse en CAD,
 * pour qu'un ancien prix USD ne traîne pas sur une fiche redevenue canadienne.
 */
export function buildCurrencyUpdates({ currency, usdAmount, marketRate, feePercent }) {
  if (currency !== CURRENCY_USD) {
    return {
      purchase_currency: CURRENCY_CAD,
      cost_price_usd: null,
      fx_rate_used: null,
      fx_fee_percent_used: null,
      fx_converted_at: null,
    };
  }

  const fee = parseFloat(feePercent);

  return {
    purchase_currency: CURRENCY_USD,
    cost_price_usd: parseFloat(usdAmount) || 0,
    fx_rate_used: parseFloat(marketRate) || null,
    // isFinite: parseFloat(undefined) donne NaN, que Postgres refuse sur une colonne numeric
    fx_fee_percent_used: isFinite(fee) ? fee : null,
    fx_converted_at: new Date().toISOString(),
  };
}

/**
 * Colonnes ajoutées par la migration 20260827_add_usd_purchase_currency.sql.
 */
export const CURRENCY_COLUMNS = [
  'purchase_currency',
  'cost_price_usd',
  'fx_rate_used',
  'fx_fee_percent_used',
  'fx_converted_at',
];

// Sonde faite une seule fois par session (null = pas encore testé)
let currencyColumnsAvailable = null;

/**
 * Vérifie une seule fois si les colonnes de devise existent en base.
 * Tant que la migration n'a pas été exécutée dans Supabase, on ne doit PAS
 * envoyer ces colonnes: PostgreSQL rejetterait l'UPDATE en entier, ce qui
 * ferait échouer des sauvegardes qui fonctionnaient très bien avant.
 */
export async function hasCurrencyColumns(supabaseClient) {
  if (currencyColumnsAvailable !== null) return currencyColumnsAvailable;

  try {
    const { error } = await supabaseClient
      .from('products')
      .select('purchase_currency')
      .limit(1);

    // On ne conclut à l'absence que si l'erreur nomme explicitement la colonne;
    // une erreur de droits (RLS) ne veut pas dire que la colonne manque.
    if (error && (error.message || '').includes('purchase_currency')) {
      console.warn(
        "Colonnes de devise absentes: exécutez la migration " +
        '20260827_add_usd_purchase_currency.sql dans Supabase pour activer les achats en USD.'
      );
      currencyColumnsAvailable = false;
    } else {
      currencyColumnsAvailable = true;
    }
  } catch (err) {
    console.error('Sonde colonnes de devise:', err);
    currencyColumnsAvailable = true;
  }

  return currencyColumnsAvailable;
}

/**
 * Renvoie les champs de devise à écrire, ou un objet vide si la migration
 * n'a pas encore été passée. À utiliser à la place de buildCurrencyUpdates()
 * partout où l'on écrit dans products / non_inventory_items.
 */
export async function safeCurrencyUpdates(supabaseClient, params) {
  const supported = await hasCurrencyColumns(supabaseClient);
  return supported ? buildCurrencyUpdates(params) : {};
}
