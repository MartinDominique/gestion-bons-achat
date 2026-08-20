/**
 * @file lib/constants/paymentMethods.js
 * @description Liste canonique des modes de paiement (source unique).
 *              - PAYMENT_METHODS: modes utilisables pour un paiement reçu
 *                (Chèque, Virement bancaire, Interac, Comptant, Autre)
 *              - CLIENT_PAYMENT_METHODS: modes proposés comme « mode de paiement
 *                habituel » dans la fiche client (sans « Autre »)
 *              - paymentMethodLabel(): libellé fr-CA d'un code de mode
 * @version 1.0.0
 * @date 2026-08-20
 * @changelog
 *   1.0.0 - Version initiale (ajout du mode Interac + mode habituel du client)
 */

// Modes acceptés lors de la saisie d'un paiement (État de compte)
export const PAYMENT_METHODS = [
  { value: 'cheque', label: 'Chèque' },
  { value: 'virement', label: 'Virement bancaire' },
  { value: 'interac', label: 'Interac' },
  { value: 'comptant', label: 'Comptant' },
  { value: 'autre', label: 'Autre' },
];

// Modes proposés pour le « mode de paiement habituel » d'un client
// (« Autre » exclu: sans valeur informative sur une fiche client)
export const CLIENT_PAYMENT_METHODS = PAYMENT_METHODS.filter(m => m.value !== 'autre');

// Codes valides pour un paiement (validation API)
export const PAYMENT_METHOD_VALUES = PAYMENT_METHODS.map(m => m.value);

/**
 * Libellé lisible d'un code de mode de paiement.
 * Retourne le code brut si inconnu, '' si vide.
 */
export function paymentMethodLabel(value) {
  if (!value) return '';
  return PAYMENT_METHODS.find(m => m.value === value)?.label || value;
}
