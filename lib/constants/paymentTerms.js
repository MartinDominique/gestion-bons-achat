/**
 * @file lib/constants/paymentTerms.js
 * @description Source UNIQUE des conditions de paiement et de la mention d'intérêts de retard,
 *              partagée par les documents clients qui portent des montants à payer (Soumission,
 *              Facture, État de compte) et par le calcul de la date d'échéance des factures.
 *              Le Bon de travail et le Bon de livraison n'affichent PAS de conditions ($ absents).
 *              - PAYMENT_TERMS: liste canonique des conditions (libellé + nombre de jours nets)
 *                → sélecteurs de la fiche client, des Paramètres et de l'éditeur de facture
 *              - computeDueDate(): échéance = date de facture + jours nets de la condition
 *                (la même définition sert à l'affichage « Net 30 jours » et au calcul)
 *              - resolvePaymentTerms(): condition du client, sinon défaut des Paramètres,
 *                sinon « Net 30 jours »
 *              - lateInterestNotice(): « Intérêts de 18 %/an (1,5 %/mois) sur tout solde en
 *                souffrance après l'échéance. » — taux configurable (Paramètres), même phrase
 *                sur tous les documents
 *              - submissionConditions() / paymentConditions(): listes prêtes à afficher
 *              Fichier CommonJS (module.exports) comme pdf-common.js: utilisable à la fois
 *              par `import` (composants) et par `require` (email-service, routes API).
 * @version 1.0.0
 * @date 2026-11-04
 * @changelog
 *   1.0.0 - Version initiale (conditions de paiement + intérêts unifiés)
 */

// ============================================
// CONDITIONS DE PAIEMENT
// ============================================

/** Condition appliquée quand ni la fiche client ni les Paramètres n'en précisent une. */
const DEFAULT_PAYMENT_TERMS = 'Net 30 jours';

/**
 * Liste canonique. `net_days` = délai de paiement à partir de la date de facture
 * (0 = payable sur réception). `discount_percent`/`discount_days` = escompte optionnel.
 */
const PAYMENT_TERMS = [
  { value: 'Net 30 jours', label: 'Net 30 jours', net_days: 30 },
  { value: '2% 10 Net 30 jours', label: '2% 10 Net 30 jours', net_days: 30, discount_percent: 2, discount_days: 10 },
  { value: 'Payable sur réception', label: 'Payable sur réception', net_days: 0 },
];

const PAYMENT_TERMS_VALUES = PAYMENT_TERMS.map(t => t.value);

/** Validité des prix d'une soumission (jours). */
const SUBMISSION_VALIDITY_DAYS = 30;

/**
 * Première condition non vide parmi les candidates (ex. fiche client, puis Paramètres),
 * sinon DEFAULT_PAYMENT_TERMS.
 * @param  {...(string|null|undefined)} candidates
 * @returns {string}
 */
function resolvePaymentTerms(...candidates) {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return DEFAULT_PAYMENT_TERMS;
}

/**
 * Définition d'une condition (ou null si inconnue).
 * @param {string} terms
 */
function paymentTermsDefinition(terms) {
  if (!terms) return null;
  const t = String(terms).trim();
  return PAYMENT_TERMS.find(p => p.value === t) || null;
}

/**
 * Nombre de jours nets d'une condition (null si inconnue).
 * @param {string} terms
 * @returns {number|null}
 */
function netDays(terms) {
  const def = paymentTermsDefinition(terms);
  return def ? def.net_days : null;
}

/**
 * Normalise une date en 'YYYY-MM-DD' (Date ou chaîne ISO). Retourne null si invalide.
 */
function toDateOnly(input) {
  if (!input) return null;
  if (typeof input === 'string') {
    const m = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  // Date « civile » du Québec, pas celle d'UTC (une facture saisie à 21 h reste du jour même)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
}

/**
 * Date d'échéance d'une facture = date de facture + jours nets de la condition.
 * Arithmétique en UTC sur la date seule: aucun décalage de jour (heure d'été, fuseau).
 * @param {string|Date} invoiceDate - 'YYYY-MM-DD' (ou Date)
 * @param {string} terms - condition de paiement (ex. 'Net 30 jours')
 * @returns {string|null} 'YYYY-MM-DD', ou null si la condition est inconnue
 */
function computeDueDate(invoiceDate, terms) {
  const days = netDays(terms);
  const base = toDateOnly(invoiceDate);
  if (days === null || !base) return null;
  const [y, m, d] = base.split('-').map(Number);
  const due = new Date(Date.UTC(y, m - 1, d + days));
  return due.toISOString().slice(0, 10);
}

// ============================================
// INTÉRÊTS DE RETARD
// ============================================

/** Taux annuel par défaut (18 %/an = 1,5 %/mois), modifiable dans Paramètres. */
const DEFAULT_LATE_INTEREST_ANNUAL_RATE = 18;

/**
 * Taux à utiliser: celui des Paramètres s'il est défini (0 = aucun intérêt), sinon 18.
 * @param {number|string|null|undefined} rate
 * @returns {number}
 */
function resolveInterestRate(rate) {
  if (rate === null || rate === undefined || rate === '') return DEFAULT_LATE_INTEREST_ANNUAL_RATE;
  const n = Number(rate);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_LATE_INTEREST_ANNUAL_RATE;
}

/** 18 → '18', 1.5 → '1,5', 1.25 → '1,25' (fr-CA, max 2 décimales, sans dépendre d'ICU). */
function formatPercent(n) {
  return String(Math.round((Number(n) || 0) * 100) / 100).replace('.', ',');
}

/**
 * Mention d'intérêts, identique sur tous les documents:
 * « Intérêts de 18 %/an (1,5 %/mois) sur tout solde en souffrance après l'échéance. »
 * Chaîne vide si le taux est 0 (aucun intérêt facturé → rien à annoncer).
 * @param {number|string|null|undefined} annualRate - taux annuel en % (défaut: 18)
 * @returns {string}
 */
function lateInterestNotice(annualRate) {
  const rate = resolveInterestRate(annualRate);
  if (rate <= 0) return '';
  return `Intérêts de ${formatPercent(rate)} %/an (${formatPercent(rate / 12)} %/mois) sur tout solde en souffrance après l'échéance.`;
}

// ============================================
// LISTES PRÊTES À AFFICHER
// ============================================

/**
 * « Paiement: Net 30 jours » (condition résolue: client → Paramètres → défaut).
 */
function paymentConditionLine(terms) {
  return `Paiement: ${resolvePaymentTerms(terms)}`;
}

/**
 * Conditions de paiement d'une facture:
 * [« Paiement: Net 30 jours », « Intérêts de 18 %/an … »]
 * @param {{terms?: string, interestRate?: number}} [opts]
 * @returns {string[]}
 */
function paymentConditions({ terms, interestRate } = {}) {
  return [paymentConditionLine(terms), lateInterestNotice(interestRate)].filter(Boolean);
}

/**
 * Conditions générales d'une soumission (PDF, impression, courriel):
 * validité des prix, paiement, intérêts, prix sujets à changement.
 * @param {{terms?: string, interestRate?: number}} [opts]
 * @returns {string[]}
 */
function submissionConditions({ terms, interestRate } = {}) {
  return [
    `Prix valides pour ${SUBMISSION_VALIDITY_DAYS} jours`,
    paymentConditionLine(terms),
    lateInterestNotice(interestRate),
    'Prix sujets à changement sans préavis',
  ].filter(Boolean);
}

module.exports = {
  DEFAULT_PAYMENT_TERMS,
  PAYMENT_TERMS,
  PAYMENT_TERMS_VALUES,
  SUBMISSION_VALIDITY_DAYS,
  DEFAULT_LATE_INTEREST_ANNUAL_RATE,
  resolvePaymentTerms,
  paymentTermsDefinition,
  netDays,
  computeDueDate,
  resolveInterestRate,
  lateInterestNotice,
  paymentConditionLine,
  paymentConditions,
  submissionConditions,
};
