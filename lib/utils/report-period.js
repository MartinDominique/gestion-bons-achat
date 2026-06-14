/**
 * @file lib/utils/report-period.js
 * @description Résolution de la période d'un rapport comptable.
 *              - Supporte 3 modes: mensuel (month=YYYY-MM), annuel (year=YYYY),
 *                personnalisé (date_from + date_to en YYYY-MM-DD).
 *              - Retourne les bornes inclusives + un libellé fr-CA pour l'en-tête PDF.
 * @version 1.0.0
 * @date 2026-06-14
 * @changelog
 *   1.0.0 - Version initiale (rapports comptables ventes/paiements)
 */

const MONTHS_FR = [
  '', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const YEAR_RE = /^\d{4}$/;

/**
 * Résout la période d'un rapport à partir des paramètres de requête.
 * Priorité: month > year > (date_from + date_to).
 *
 * @param {URLSearchParams} searchParams
 * @returns {{ ok: boolean, error?: string, mode?: string, label?: string, slug?: string, startDate?: string, endDate?: string }}
 */
function resolveReportPeriod(searchParams) {
  const month = searchParams.get('month');
  const year = searchParams.get('year');
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');

  // --- Mode mensuel ---
  if (month) {
    if (!MONTH_RE.test(month)) {
      return { ok: false, error: 'Paramètre month invalide (format YYYY-MM attendu)' };
    }
    const [y, m] = month.split('-');
    const endDay = new Date(parseInt(y), parseInt(m), 0).getDate();
    return {
      ok: true,
      mode: 'month',
      label: `${MONTHS_FR[parseInt(m)]} ${y}`,
      slug: month,
      startDate: `${y}-${m}-01`,
      endDate: `${y}-${m}-${String(endDay).padStart(2, '0')}`,
    };
  }

  // --- Mode annuel ---
  if (year) {
    if (!YEAR_RE.test(year)) {
      return { ok: false, error: 'Paramètre year invalide (format YYYY attendu)' };
    }
    return {
      ok: true,
      mode: 'year',
      label: `Année ${year}`,
      slug: year,
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
    };
  }

  // --- Mode personnalisé ---
  if (dateFrom && dateTo) {
    if (!DATE_RE.test(dateFrom) || !DATE_RE.test(dateTo)) {
      return { ok: false, error: 'Dates invalides (format YYYY-MM-DD attendu)' };
    }
    if (dateFrom > dateTo) {
      return { ok: false, error: 'La date de début doit précéder la date de fin' };
    }
    return {
      ok: true,
      mode: 'custom',
      label: `${formatLabelDate(dateFrom)} au ${formatLabelDate(dateTo)}`,
      slug: `${dateFrom}_${dateTo}`,
      startDate: dateFrom,
      endDate: dateTo,
    };
  }

  return {
    ok: false,
    error: 'Période requise: fournir month (YYYY-MM), year (YYYY) ou date_from + date_to',
  };
}

/** Formate une date YYYY-MM-DD en « 5 juin 2026 ». */
function formatLabelDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${parseInt(d)} ${MONTHS_FR[parseInt(m)]} ${y}`;
}

module.exports = { resolveReportPeriod, formatLabelDate, MONTHS_FR };
