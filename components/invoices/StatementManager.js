/**
 * @file components/invoices/StatementManager.js
 * @description Onglet "État de compte" du module Facturation
 *              - Liste des clients avec solde dû (factures impayées)
 *              - Recherche par nom de client + bascule "impayés / tous"
 *              - Bandeau résumé (total dû, en retard, intérêts)
 *              - Clic sur un client → vue détaillée (ClientStatementView)
 *              - Notes de crédit (factures négatives): pastille « crédit » et solde net
 *              - Tri: Nom (A-Z) / Montant dû / En retard — boutons dans la barre (tous appareils)
 *                + en-têtes cliquables du tableau desktop, choix mémorisé (localStorage)
 *              - Mobile-first (cartes) + tableau desktop
 * @version 1.2.0
 * @date 2026-11-08
 * @changelog
 *   1.2.0 - Outil de tri: Nom (ordre alphabétique, fr-CA), Montant dû (décroissant), En retard
 *           (montant en retard décroissant, puis ancienneté du retard, puis solde). Boutons dans
 *           la barre de recherche + en-têtes Client / En retard / Solde dû cliquables (desktop).
 *           Défaut = Montant dû (ordre actuel), choix mémorisé dans localStorage
 *   1.1.0 - Crédits au dossier affichés (pastille « X $ en crédit ») et solde créditeur
 *           en vert; un client au solde nul mais avec crédit reste listé
 *   1.0.0 - Version initiale (module État de compte client)
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, X, RefreshCw, AlertCircle, Users, Clock, ChevronRight, ArrowDownAZ, ArrowDown01, ArrowUpDown } from 'lucide-react';
import ClientStatementView from './ClientStatementView';

const fmtCurrency = (amount) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(amount || 0);

// Solde créditeur (crédits > factures dues): affiché en vert, jamais en « dû »
const balanceClass = (balance) =>
  (balance || 0) < -0.005
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-gray-900 dark:text-gray-100';

// Tri de la liste des clients (mémorisé entre les visites)
const STORAGE_KEY_SORT = 'statements_sort';
const SORT_OPTIONS = [
  { value: 'name', label: 'Nom (A-Z)', short: 'Nom', Icon: ArrowDownAZ, title: 'Ordre alphabétique du client' },
  { value: 'balance', label: 'Montant dû', short: 'Montant', Icon: ArrowDown01, title: 'Solde dû, du plus élevé au plus bas' },
  { value: 'overdue', label: 'En retard', short: 'Retard', Icon: Clock, title: 'Montant en retard, du plus élevé au plus bas (puis retard le plus ancien)' },
];
const DEFAULT_SORT = 'balance';
const collator = new Intl.Collator('fr-CA', { sensitivity: 'base', numeric: true });

const sortClients = (list, sortBy) => {
  const arr = [...list];
  switch (sortBy) {
    case 'name':
      arr.sort((a, b) => collator.compare(a.client_name || '', b.client_name || ''));
      break;
    case 'overdue':
      arr.sort((a, b) =>
        (b.overdue_balance || 0) - (a.overdue_balance || 0)
        || (b.max_days_overdue || 0) - (a.max_days_overdue || 0)
        || (b.balance || 0) - (a.balance || 0)
        || collator.compare(a.client_name || '', b.client_name || ''));
      break;
    case 'balance':
    default:
      arr.sort((a, b) =>
        (b.balance || 0) - (a.balance || 0)
        || collator.compare(a.client_name || '', b.client_name || ''));
  }
  return arr;
};

// En-tête de colonne cliquable (desktop): active le tri correspondant
function SortableHeader({ label, value, sortBy, onSort, align = 'left' }) {
  const active = sortBy === value;
  return (
    <button
      type="button"
      onClick={() => onSort(value)}
      title={`Trier par ${label.toLowerCase()}`}
      className={`inline-flex items-center gap-1 hover:text-emerald-700 dark:hover:text-emerald-300 ${align === 'right' ? 'flex-row-reverse' : ''} ${
        active ? 'text-emerald-700 dark:text-emerald-300' : ''
      }`}
    >
      {label}
      <ArrowUpDown className={`w-3.5 h-3.5 ${active ? 'opacity-100' : 'opacity-30'}`} aria-hidden="true" />
    </button>
  );
}

export default function StatementManager({ autoOpenClientId, onAutoOpenConsumed }) {
  const [clients, setClients] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [includeAll, setIncludeAll] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [openClientId, setOpenClientId] = useState(null);
  const [sortBy, setSortBy] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_SORT;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY_SORT);
      return SORT_OPTIONS.some(o => o.value === saved) ? saved : DEFAULT_SORT;
    } catch { return DEFAULT_SORT; }
  });

  const changeSort = (value) => {
    setSortBy(value);
    try { window.localStorage.setItem(STORAGE_KEY_SORT, value); } catch { /* stockage indisponible */ }
  };

  const sortedClients = useMemo(() => sortClients(clients, sortBy), [clients, sortBy]);

  // Debounce recherche
  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (includeAll) params.set('all', 'true');
      if (searchTerm) params.set('search', searchTerm);
      const res = await fetch(`/api/statements?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setClients(json.data || []);
        setTotals(json.totals || null);
      } else {
        setError(json.error || 'Erreur de chargement');
      }
    } catch (err) {
      setError('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  }, [includeAll, searchTerm]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Ouverture automatique d'un client (ex: depuis un clic sur l'indicateur de facture)
  useEffect(() => {
    if (autoOpenClientId) {
      setOpenClientId(autoOpenClientId);
      onAutoOpenConsumed?.();
    }
  }, [autoOpenClientId, onAutoOpenConsumed]);

  const handleClose = () => {
    setOpenClientId(null);
    fetchData(); // rafraîchir les soldes après modifications
  };

  return (
    <>
      {/* Bandeau résumé */}
      {totals && (
        <div className="p-4 border-b dark:border-gray-700 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">Clients avec solde</div>
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{totals.client_count}</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">Total dû</div>
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{fmtCurrency(totals.balance)}</div>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
            <div className="text-xs text-red-700 dark:text-red-400">En retard</div>
            <div className="text-lg font-bold text-red-700 dark:text-red-300">{fmtCurrency(totals.overdue_balance)}</div>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
            <div className="text-xs text-amber-700 dark:text-amber-400">Intérêts estimés</div>
            <div className="text-lg font-bold text-amber-700 dark:text-amber-300">{fmtCurrency(totals.interest)}</div>
          </div>
        </div>
      )}

      {/* Recherche + bascule */}
      <div className="p-4 border-b dark:border-gray-700 flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="Rechercher un client..."
            autoCorrect="off" autoCapitalize="off" spellCheck={false}
            className="w-full pl-9 pr-9 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {/* Tri */}
        <div className="flex items-center gap-1 flex-shrink-0" role="group" aria-label="Trier par">
          <ArrowUpDown className="w-3.5 h-3.5 text-gray-400 hidden sm:block" aria-hidden="true" />
          {SORT_OPTIONS.map(opt => {
            const active = sortBy === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => changeSort(opt.value)}
                title={opt.title}
                aria-pressed={active}
                className={`min-h-[44px] sm:min-h-0 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap inline-flex items-center gap-1.5 flex-1 sm:flex-none justify-center ${
                  active
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                <opt.Icon className="w-3.5 h-3.5" />
                <span className="sm:hidden">{opt.short}</span>
                <span className="hidden sm:inline">{opt.label}</span>
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setIncludeAll(v => !v)}
          className={`px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
            includeAll
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          {includeAll ? 'Tous les clients' : 'Impayés seulement'}
        </button>
        <button
          onClick={fetchData}
          disabled={loading}
          className="px-3 py-2 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualiser
        </button>
      </div>

      {error && (
        <div className="m-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mx-auto"></div>
          <p className="mt-3 text-gray-600 dark:text-gray-400">Chargement...</p>
        </div>
      ) : clients.length === 0 ? (
        <div className="p-8 text-center">
          <Users className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-gray-400">
            {searchTerm ? 'Aucun client ne correspond à votre recherche' : 'Aucun client avec solde impayé'}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile */}
          <div className="lg:hidden">
            {sortedClients.map(c => (
              <button
                key={c.client_id || c.client_name}
                onClick={() => c.client_id && setOpenClientId(c.client_id)}
                disabled={!c.client_id}
                className="w-full text-left p-3 border-b dark:border-b-gray-700 last:border-b-0 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 disabled:opacity-60"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900 dark:text-gray-100">{c.client_name}</span>
                  <span className={`font-bold ${balanceClass(c.balance)}`}>{fmtCurrency(c.balance)}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                  <span>{c.open_count} facture(s)</span>
                  {c.credit_balance > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      − {fmtCurrency(c.credit_balance)} en crédit
                    </span>
                  )}
                  {c.overdue_balance > 0 && (
                    <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                      <Clock className="w-3 h-3" /> {fmtCurrency(c.overdue_balance)} en retard
                    </span>
                  )}
                  {c.interest > 0 && <span className="text-amber-600 dark:text-amber-400">+ {fmtCurrency(c.interest)} int.</span>}
                </div>
              </button>
            ))}
          </div>

          {/* Desktop */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-gray-50 to-emerald-50 dark:from-gray-800 dark:to-gray-800">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                    <SortableHeader label="Client" value="name" sortBy={sortBy} onSort={changeSort} />
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-700 dark:text-gray-300">Factures</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
                    <SortableHeader label="En retard" value="overdue" sortBy={sortBy} onSort={changeSort} align="right" />
                  </th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">Intérêts</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
                    <SortableHeader label="Solde dû" value="balance" sortBy={sortBy} onSort={changeSort} align="right" />
                  </th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700 dark:text-gray-300"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {sortedClients.map((c, index) => (
                  <tr
                    key={c.client_id || c.client_name}
                    onClick={() => c.client_id && setOpenClientId(c.client_id)}
                    className={`cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-colors ${
                      index % 2 === 0 ? 'bg-white/50 dark:bg-gray-800/50' : 'bg-gray-50/50 dark:bg-gray-900/30'
                    }`}
                  >
                    <td className="px-6 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                      {c.client_name}
                      {c.credit_balance > 0 && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs px-2 py-0.5">
                          {fmtCurrency(c.credit_balance)} en crédit
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-center text-sm text-gray-600 dark:text-gray-400">{c.open_count}</td>
                    <td className="px-6 py-3 text-right text-sm">
                      {c.overdue_balance > 0
                        ? <span className="text-red-600 dark:text-red-400 font-medium">{fmtCurrency(c.overdue_balance)}</span>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-6 py-3 text-right text-sm">
                      {c.interest > 0
                        ? <span className="text-amber-600 dark:text-amber-400">{fmtCurrency(c.interest)}</span>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className={`px-6 py-3 text-right text-sm font-bold ${balanceClass(c.balance)}`}>{fmtCurrency(c.balance)}</td>
                    <td className="px-6 py-3 text-right">
                      <ChevronRight className="w-4 h-4 text-gray-400 inline" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Vue détaillée */}
      {openClientId && (
        <ClientStatementView
          clientId={openClientId}
          onClose={handleClose}
          onChanged={fetchData}
        />
      )}
    </>
  );
}
