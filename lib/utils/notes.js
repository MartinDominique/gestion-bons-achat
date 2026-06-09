/**
 * @file lib/utils/notes.js
 * @description Utilitaires pour le système de Notes.
 *              - Calcul des jours jusqu'à l'échéance (timezone America/Toronto)
 *              - Détermination du niveau d'urgence et des classes de couleur
 *              - Formatage des dates d'échéance en français (fr-CA)
 *              - Tri intelligent (échéances proches d'abord, puis sans date par création)
 * @version 1.0.0
 * @date 2026-06-09
 * @changelog
 *   1.0.0 - Version initiale (Système de Notes MVP)
 */

const TIMEZONE = 'America/Toronto';

/**
 * Retourne la date du jour au format YYYY-MM-DD dans le fuseau America/Toronto.
 * @returns {string} ex: '2026-06-09'
 */
export function todayYMD() {
  // en-CA produit le format YYYY-MM-DD
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

/**
 * Nombre de jours entiers entre une date d'échéance (YYYY-MM-DD) et aujourd'hui.
 * Positif = dans le futur, 0 = aujourd'hui, négatif = en retard.
 * @param {string|null} dueDate - 'YYYY-MM-DD' ou null
 * @returns {number|null} jours restants, ou null si pas de date
 */
export function daysUntilDue(dueDate) {
  if (!dueDate) return null;
  const due = new Date(dueDate + 'T00:00:00Z');
  const today = new Date(todayYMD() + 'T00:00:00Z');
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

/**
 * Niveau d'urgence d'une note selon sa date d'échéance.
 *  - 'red'    : échéance dans 0-1 jour (ou en retard)  → urgence immédiate
 *  - 'orange' : échéance dans 2-7 jours                → semaine en cours
 *  - 'gray'   : échéance dans 8+ jours OU sans date
 * @param {string|null} dueDate
 * @returns {'red'|'orange'|'gray'}
 */
export function getUrgency(dueDate) {
  const days = daysUntilDue(dueDate);
  if (days === null) return 'gray';
  if (days <= 1) return 'red';
  if (days <= 7) return 'orange';
  return 'gray';
}

/**
 * Classes Tailwind (fond + bordure, compatibles dark mode) pour une carte de note.
 * @param {'red'|'orange'|'gray'} urgency
 * @returns {string}
 */
export function urgencyCardClasses(urgency) {
  switch (urgency) {
    case 'red':
      return 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700';
    case 'orange':
      return 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700';
    default:
      return 'bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700';
  }
}

/**
 * Classes Tailwind pour le badge d'échéance (texte coloré).
 * @param {'red'|'orange'|'gray'} urgency
 * @returns {string}
 */
export function urgencyBadgeClasses(urgency) {
  switch (urgency) {
    case 'red':
      return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
    case 'orange':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300';
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
  }
}

/**
 * Formate une date d'échéance en français (fr-CA).
 * Exemples: "Aujourd'hui (9 juin 2026)", "Demain (10 juin 2026)",
 *           "Hier (8 juin 2026)", "Jeudi 11 juin 2026".
 * @param {string|null} dueDate
 * @returns {string} '' si pas de date
 */
export function formatDueDate(dueDate) {
  if (!dueDate) return '';
  const days = daysUntilDue(dueDate);
  const d = new Date(dueDate + 'T00:00:00');

  const longDate = d.toLocaleDateString('fr-CA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  if (days === 0) return `Aujourd'hui (${longDate})`;
  if (days === 1) return `Demain (${longDate})`;
  if (days === -1) return `Hier (${longDate})`;
  if (days < -1) return `En retard — ${capitalize(weekdayLong(d))} ${longDate}`;

  return `${capitalize(weekdayLong(d))} ${longDate}`;
}

function weekdayLong(date) {
  return date.toLocaleDateString('fr-CA', { weekday: 'long' });
}

function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Tri intelligent des notes:
 *   1. Notes AVEC date d'échéance d'abord, par échéance croissante (proche en haut)
 *   2. Notes SANS date ensuite, par date de création croissante (ancienne d'abord)
 * Ne modifie pas le tableau d'origine.
 * @param {Array} notes
 * @returns {Array} nouveau tableau trié
 */
export function sortNotes(notes) {
  const withDate = [];
  const withoutDate = [];

  for (const note of notes) {
    if (note.due_date) withDate.push(note);
    else withoutDate.push(note);
  }

  withDate.sort((a, b) => {
    if (a.due_date === b.due_date) {
      return new Date(a.created_at) - new Date(b.created_at);
    }
    return a.due_date < b.due_date ? -1 : 1;
  });

  withoutDate.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  return [...withDate, ...withoutDate];
}

/**
 * Compte les notes urgentes (échéance 0-1 jour ou en retard) parmi les notes actives.
 * Utilisé pour le badge de la Navigation.
 * @param {Array} notes - notes actives (non complétées)
 * @returns {number}
 */
export function countUrgent(notes) {
  return notes.filter((n) => !n.completed && getUrgency(n.due_date) === 'red').length;
}

/** Libellés français des types de projet liables. */
export const PROJECT_TYPE_LABELS = {
  work_order: 'Bon de Travail',
  delivery_note: 'Bon de Livraison',
  purchase_order: "Bon d'Achat",
  submission: 'Soumission',
};

/** Libellés courts (badges). */
export const PROJECT_TYPE_SHORT = {
  work_order: 'BT',
  delivery_note: 'BL',
  purchase_order: 'BA',
  submission: 'Soum.',
};

/**
 * Convertit un lien projet de note en props pour le composant ReferenceLink
 * du SplitView existant (ouvre le document dans le panneau latéral).
 * @param {object} note - { project_type, project_id, project_number }
 * @returns {{ type: string, variant: string, data: object }|null}
 */
export function projectToReferenceLink(note) {
  if (note.note_type !== 'project' || !note.project_type) return null;

  switch (note.project_type) {
    case 'work_order':
      return { type: 'work-order', variant: 'green', data: { workOrderId: note.project_id, btNumber: note.project_number } };
    case 'delivery_note':
      return { type: 'delivery-note', variant: 'orange', data: { deliveryNoteId: note.project_id, blNumber: note.project_number } };
    case 'purchase_order':
      return { type: 'purchase-order', variant: 'blue', data: { editingPO: { id: note.project_id } } };
    case 'submission':
      return { type: 'soumission', variant: 'purple', data: { soumissionId: note.project_id, submissionNumber: note.project_number } };
    default:
      return null;
  }
}
