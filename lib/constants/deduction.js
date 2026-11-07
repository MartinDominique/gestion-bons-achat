/**
 * @file lib/constants/deduction.js
 * @description Déduction « Varia » — source unique du libellé et des valeurs sentinelles
 *              de work_orders.invoice_id / delivery_notes.invoice_id.
 *              - NULL  → non facturé (reste dans « À facturer »)
 *              - > 0   → facture de l'application (invoices.id)
 *              - -1    → facturé à l'externe (Acomba)
 *              - -2    → Déduction « Varia »: la fiche de facturation n'a PAS produit de
 *                        facture (aucun numéro, rien dans l'archive des Factures, l'état de
 *                        compte ni les rapports compta). Seul l'inventaire a été ajusté selon
 *                        les quantités de la fiche, et le BT/BL porte la mention « Varia ».
 *              Le mot « Varia » est volontairement neutre (décision Martin, 2026-11-07):
 *              changer DEDUCTION_LABEL ici suffit pour le renommer partout.
 * @version 1.0.0
 * @date 2026-11-07
 * @changelog
 *   1.0.0 - Version initiale
 */

/** Libellé affiché partout (liste BT/BL, statistiques, mouvements d'inventaire). */
export const DEDUCTION_LABEL = 'Varia';

/** Valeur sentinelle de invoice_id pour un BT/BL passé en déduction. */
export const DEDUCTION_INVOICE_ID = -2;

/** Valeur sentinelle existante: facturé à l'externe (Acomba). */
export const EXTERNAL_INVOICE_ID = -1;

/** reference_type des mouvements d'inventaire créés par une déduction. */
export const DEDUCTION_REFERENCE_TYPE = 'deduction';

/** Vrai si le BT/BL a été passé en déduction « Varia ». */
export function isDeduction(invoiceId) {
  return Number(invoiceId) === DEDUCTION_INVOICE_ID;
}

/** Vrai si le BT/BL a été facturé à l'externe (Acomba). */
export function isExternalInvoice(invoiceId) {
  return Number(invoiceId) === EXTERNAL_INVOICE_ID;
}

/**
 * Indicateur de facturation d'un BT/BL (pastille + infobulle) pour les listes.
 * @returns {{ dot: string, title: string, key: 'none'|'app'|'external'|'deduction' }}
 */
export function invoiceIndicator(invoiceId) {
  if (isDeduction(invoiceId)) {
    return { dot: 'bg-violet-500', title: DEDUCTION_LABEL, key: 'deduction' };
  }
  if (isExternalInvoice(invoiceId)) {
    return { dot: 'bg-amber-500', title: 'Facturé (Acomba)', key: 'external' };
  }
  if (invoiceId) {
    return { dot: 'bg-green-500', title: 'Facturé', key: 'app' };
  }
  return { dot: 'bg-red-500', title: 'Non facturé', key: 'none' };
}
