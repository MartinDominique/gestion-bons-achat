/**
 * @file lib/services/billing-group.js
 * @description Compte payeur commun: regroupement de plusieurs fiches client pour
 *              l'état de compte et la saisie des paiements.
 *              - Une fiche « rattachée » (clients.billing_parent_id) pointe vers la fiche
 *                « compte payeur »; toutes deux gardent leurs contacts, BT/BL, BA, factures.
 *              - L'état de compte du groupe porte UN seul nom (clients.statement_name de
 *                la fiche payeur, sinon son nom).
 *              - Tolérant: si la migration 20261127 n'est pas passée, aucun regroupement
 *                (chaque client reste autonome, rien ne casse).
 * @version 1.0.0
 * @date 2026-11-27
 * @changelog
 *   1.0.0 - Version initiale
 */

const PAGE = 1000;

/**
 * Charge la carte des regroupements (toutes les fiches client, 4 colonnes).
 * @returns {Promise<object>} { headOf(id), membersOf(headId), displayName(headId), isGroup(headId), available }
 */
async function loadBillingMap(supabaseAdmin) {
  const rows = [];
  let available = true;

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('clients')
      .select('id, name, billing_parent_id, statement_name')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      // Colonnes absentes (migration non passée) ou raté de lecture: pas de regroupement
      console.warn('Regroupement clients indisponible:', error.message);
      available = false;
      rows.length = 0;
      break;
    }
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }

  const byId = new Map(rows.map(r => [Number(r.id), r]));

  /** Fiche « compte payeur » d'un client (remonte la chaîne, garde anti-boucle). */
  const headOf = (clientId) => {
    let id = Number(clientId);
    const seen = new Set();
    while (byId.has(id) && byId.get(id).billing_parent_id && !seen.has(id)) {
      seen.add(id);
      const parent = Number(byId.get(id).billing_parent_id);
      if (!byId.has(parent)) break; // fiche payeur supprimée: le client redevient autonome
      id = parent;
    }
    return id;
  };

  const membersByHead = new Map();
  for (const r of rows) {
    const id = Number(r.id);
    const head = headOf(id);
    if (!membersByHead.has(head)) membersByHead.set(head, []);
    membersByHead.get(head).push({ id, name: r.name || '' });
  }
  // La fiche payeur en premier, puis les autres par nom
  for (const [head, list] of membersByHead) {
    list.sort((a, b) => (a.id === head ? -1 : b.id === head ? 1 : a.name.localeCompare(b.name, 'fr-CA')));
  }

  const membersOf = (headId) => membersByHead.get(Number(headId)) || [{ id: Number(headId), name: byId.get(Number(headId))?.name || '' }];
  const isGroup = (headId) => membersOf(headId).length > 1;
  /** Nom du relevé: nom personnalisé de la fiche payeur, sinon son nom (null si inconnu). */
  const displayName = (headId) => {
    const head = byId.get(Number(headId));
    if (!head) return null;
    return (head.statement_name || '').trim() || head.name || null;
  };
  const hasCustomName = (headId) => !!(byId.get(Number(headId))?.statement_name || '').trim();

  return { available, headOf, membersOf, isGroup, displayName, hasCustomName };
}

module.exports = { loadBillingMap };
