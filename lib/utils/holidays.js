/**
 * @file lib/utils/holidays.js
 * @description Calcul dynamique des jours fériés du Québec
 *              - Jours fixes (Jour de l'An, St-Jean, Canada, Noël)
 *              - Jours variables (Pâques, Patriotes, Fête du Travail, Action de Grâce)
 * @version 1.0.0
 * @date 2026-02-09
 * @changelog
 *   1.0.0 - Version initiale
 */

/**
 * Calcul de la date de Pâques (algorithme de Gauss/Anonymous Gregorian)
 */
function getEasterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-indexed
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

/**
 * Retourne la liste des jours fériés du Québec pour une année donnée
 * @param {number} year
 * @returns {Array<{date: Date, name: string}>}
 */
export function getQuebecHolidays(year) {
  const holidays = [];

  // 1. Jour de l'An - 1er janvier
  holidays.push({ date: new Date(year, 0, 1), name: 'Jour de l\'An' });

  // 2. Vendredi Saint (2 jours avant Pâques)
  const easter = getEasterDate(year);
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);
  holidays.push({ date: goodFriday, name: 'Vendredi Saint' });

  // 3. Lundi de Pâques (1 jour après Pâques)
  const easterMonday = new Date(easter);
  easterMonday.setDate(easter.getDate() + 1);
  holidays.push({ date: easterMonday, name: 'Lundi de Pâques' });

  // 4. Journée des Patriotes - Lundi précédant le 25 mai
  const may25 = new Date(year, 4, 25);
  const dayOfWeek25 = may25.getDay();
  const patriotesOffset = dayOfWeek25 === 1 ? 7 : (dayOfWeek25 === 0 ? 1 : dayOfWeek25 - 1);
  const patriotes = new Date(year, 4, 25 - patriotesOffset);
  holidays.push({ date: patriotes, name: 'Journée des Patriotes' });

  // 5. Fête nationale du Québec (St-Jean) - 24 juin
  holidays.push({ date: new Date(year, 5, 24), name: 'Fête nationale' });

  // 6. Fête du Canada - 1er juillet
  holidays.push({ date: new Date(year, 6, 1), name: 'Fête du Canada' });

  // 7. Fête du Travail - 1er lundi de septembre
  const sept1 = new Date(year, 8, 1);
  const daysUntilMonday = (8 - sept1.getDay()) % 7;
  const labourDay = new Date(year, 8, 1 + daysUntilMonday);
  holidays.push({ date: labourDay, name: 'Fête du Travail' });

  // 8. Action de Grâce - 2e lundi d'octobre
  const oct1 = new Date(year, 9, 1);
  const daysUntilMondayOct = (8 - oct1.getDay()) % 7;
  const thanksgiving = new Date(year, 9, 1 + daysUntilMondayOct + 7);
  holidays.push({ date: thanksgiving, name: 'Action de Grâce' });

  // 9. Noël - 25 décembre
  holidays.push({ date: new Date(year, 11, 25), name: 'Noël' });

  return holidays;
}

/**
 * Vérifie si une date est un jour férié au Québec
 * @param {string} dateStr - Format YYYY-MM-DD
 * @returns {{isHoliday: boolean, name: string|null}}
 */
export function isQuebecHoliday(dateStr) {
  const date = new Date(dateStr + 'T12:00:00'); // Midi pour éviter les problèmes de timezone
  const year = date.getFullYear();
  const holidays = getQuebecHolidays(year);

  const match = holidays.find(h =>
    h.date.getFullYear() === date.getFullYear() &&
    h.date.getMonth() === date.getMonth() &&
    h.date.getDate() === date.getDate()
  );

  return {
    isHoliday: !!match,
    name: match ? match.name : null
  };
}

/**
 * Détecte le type de surcharge pour une session de travail
 * @param {string} dateStr - Format YYYY-MM-DD
 * @param {string} startTime - Format HH:MM
 * @returns {{type: string, label: string, rate: number, minimum: number}}
 */
export function getSurchargeType(dateStr, startTime) {
  const date = new Date(dateStr + 'T12:00:00');
  const dayOfWeek = date.getDay(); // 0=dimanche, 6=samedi

  // Vérifier jour férié Québec (priorité la plus haute)
  const holiday = isQuebecHoliday(dateStr);
  if (holiday.isHoliday) {
    return { type: 'holiday', label: `Férié (${holiday.name})`, rate: 1.5, minimum: 3.0 };
  }

  // Vérifier dimanche
  if (dayOfWeek === 0) {
    return { type: 'sunday', label: 'Dimanche', rate: 1.5, minimum: 3.0 };
  }

  // Vérifier samedi
  if (dayOfWeek === 6) {
    return { type: 'saturday', label: 'Samedi', rate: 1.5, minimum: 3.0 };
  }

  // Vérifier soir (début >= 17:00)
  if (startTime) {
    const [h] = startTime.split(':').map(Number);
    if (h >= 17) {
      return { type: 'evening', label: 'Soir', rate: 1.5, minimum: 2.0 };
    }
  }

  // Normal
  return { type: 'normal', label: null, rate: 1.0, minimum: 1.0 };
}
