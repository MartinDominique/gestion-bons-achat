/**
 * @file lib/utils/productSearch.js
 * @description Recherche de produits « tolérante » : trouve P1-540 en tapant p1540.
 *              - Ignore les tirets, espaces, points, barres obliques et autres séparateurs
 *              - Ignore les accents (ecrou trouve ÉCROU)
 *              - Ignore la casse
 *              Deux usages :
 *              1. Côté base (Supabase/PostgREST) : `buildSearchOr()` construit un filtre
 *                 `.or()` combinant le `ilike` habituel ET une expression régulière
 *                 `imatch` qui autorise n'importe quel séparateur entre les caractères.
 *                 `searchWithFallback()` retombe automatiquement sur le `ilike` seul si
 *                 l'opérateur `imatch` n'est pas disponible (aucune régression possible).
 *              2. Côté client (listes déjà chargées en mémoire) : `normalizeSearchKey()`
 *                 + `matchesNormalized()`.
 * @version 1.0.0
 * @date 2026-08-27
 * @changelog
 *   1.0.0 - Version initiale — recherche sans tiret ni accent (Soumissions, BT/BL, AF, Inventaire, BA)
 */

// Variantes accentuées acceptées pour chaque lettre de base.
const ACCENT_CLASSES = {
  a: 'aàáâãäå',
  c: 'cç',
  e: 'eéèêë',
  i: 'iíìîï',
  n: 'nñ',
  o: 'oóòôõö',
  u: 'uúùûü',
  y: 'yýÿ',
};

// Classe de caractères considérés comme « séparateurs » (tiret, espace, point, /, etc.)
const SEPARATOR_CLASS = '[^a-z0-9]*';

/**
 * Réduit une chaîne à sa forme comparable : minuscules, sans accent,
 * sans aucun caractère qui ne soit ni une lettre ni un chiffre.
 * Ex: "P1-540" -> "p1540" ; "ÉCROU 1/2" -> "ecrou12"
 */
export function normalizeSearchKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Vrai si `haystack` contient `term` une fois les deux normalisés.
 * Utilisé pour filtrer une liste déjà chargée en mémoire.
 */
export function matchesNormalized(haystack, term) {
  const key = normalizeSearchKey(term);
  if (!key) return true;
  return normalizeSearchKey(haystack).includes(key);
}

/**
 * Construit l'expression régulière POSIX (opérateur `~*` / `imatch`) correspondant
 * au terme recherché en autorisant n'importe quel séparateur entre les caractères.
 * Ex: "p1540" -> "p[^a-z0-9]*1[^a-z0-9]*5[^a-z0-9]*4[^a-z0-9]*0"
 *
 * N'utilise volontairement aucun des caractères réservés par PostgREST
 * (virgule, point, parenthèses) afin de rester injectable dans un `.or()`.
 *
 * @returns {string|null} null si le terme ne contient rien d'exploitable
 */
export function buildLooseRegex(term) {
  const key = normalizeSearchKey(term);
  if (key.length < 2) return null;
  return key
    .split('')
    .map((char) => {
      const variants = ACCENT_CLASSES[char];
      return variants ? `[${variants}]` : char;
    })
    .join(SEPARATOR_CLASS);
}

/**
 * Filtre `.or()` classique (ilike) — comportement historique, sert de repli.
 */
export function buildPlainOr(term, columns = ['product_id', 'description']) {
  return columns.map((col) => `${col}.ilike.%${term}%`).join(',');
}

/**
 * Filtre `.or()` enrichi : `ilike` habituel + `imatch` tolérant aux tirets/accents.
 */
export function buildSearchOr(term, columns = ['product_id', 'description']) {
  const plain = buildPlainOr(term, columns);
  const regex = buildLooseRegex(term);
  if (!regex) return plain;
  const loose = columns.map((col) => `${col}.imatch.${regex}`).join(',');
  return `${plain},${loose}`;
}

/**
 * Exécute une recherche produits avec le filtre enrichi et retombe silencieusement
 * sur le filtre `ilike` seul si la base rejette l'opérateur `imatch`.
 *
 * @param {(orFilter: string) => PromiseLike<{data: any, error: any}>} queryFactory
 *        Fonction qui construit et exécute la requête Supabase à partir du filtre `.or()`
 * @param {string} term Terme recherché (tel que tapé par l'utilisateur)
 * @param {string[]} columns Colonnes à interroger
 */
export async function searchWithFallback(queryFactory, term, columns = ['product_id', 'description']) {
  const enhanced = buildSearchOr(term, columns);
  const plain = buildPlainOr(term, columns);

  if (enhanced !== plain) {
    const result = await queryFactory(enhanced);
    if (!result?.error) return result;
    console.warn(
      'Recherche tolérante indisponible, repli sur la recherche standard:',
      result.error?.message
    );
  }

  return queryFactory(plain);
}
