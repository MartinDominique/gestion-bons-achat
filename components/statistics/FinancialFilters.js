/**
 * @file components/statistics/FinancialFilters.js
 * @description Filtres pour le sous-onglet Financier des Statistiques
 *              - Période (défaut: 12 derniers mois)
 *              - Client, Statut facture
 *              - Vue: Par mois / Par client / En attente
 * @version 1.0.0
 * @date 2026-02-27
 * @changelog
 *   1.0.0 - Version initiale (Phase D — Statistiques Phase 2)
 */

import { useState, useEffect } from 'react';
import { Search, RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabase';

function getDefaultDateFrom() {
  const now = new Date();
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  return `${oneYearAgo.getFullYear()}-${String(oneYearAgo.getMonth() + 1).padStart(2, '0')}-01`;
}

function getDefaultDateTo() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const DEFAULT_FINANCIAL_FILTERS = {
  dateFrom: getDefaultDateFrom(),
  dateTo: getDefaultDateTo(),
  clientId: '',
  status: 'all',
  view: 'byMonth',
};

export default function FinancialFilters({ filters, onFiltersChange, onSearch, loading }) {
  const [clients, setClients] = useState([]);

  useEffect(() => {
    const fetchClients = async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .order('name');
      if (!error && data) setClients(data);
    };
    fetchClients();
  }, []);

  const handleChange = (field, value) => {
    onFiltersChange({ ...filters, [field]: value });
  };

  const handleReset = () => {
    onFiltersChange({ ...DEFAULT_FINANCIAL_FILTERS });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') onSearch();
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4">
      <div className="flex flex-wrap gap-3 items-end">
        {/* Date début */}
        <div className="flex-shrink-0">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Du</label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => handleChange('dateFrom', e.target.value)}
            onKeyDown={handleKeyDown}
            className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
        </div>

        {/* Date fin */}
        <div className="flex-shrink-0">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Au</label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => handleChange('dateTo', e.target.value)}
            onKeyDown={handleKeyDown}
            className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
        </div>

        {/* Client */}
        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Client</label>
          <select
            value={filters.clientId}
            onChange={(e) => handleChange('clientId', e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          >
            <option value="">Tous les clients</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Statut */}
        <div className="flex-shrink-0">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Statut</label>
          <select
            value={filters.status}
            onChange={(e) => handleChange('status', e.target.value)}
            className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          >
            <option value="all">Toutes</option>
            <option value="draft">Brouillon</option>
            <option value="sent">Envoyées</option>
            <option value="paid">Payées</option>
          </select>
        </div>

        {/* Boutons */}
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={onSearch}
            disabled={loading}
            className="flex items-center gap-1 px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Search className="w-4 h-4" />
            {loading ? 'Chargement...' : 'Rechercher'}
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title="Réinitialiser"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Vue toggle */}
      <div className="flex gap-1 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400 self-center mr-2">Vue:</label>
        {[
          { key: 'byMonth', label: 'Par mois' },
          { key: 'byClient', label: 'Par client' },
          { key: 'outstanding', label: 'En attente' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleChange('view', key)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              filters.view === key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export { DEFAULT_FINANCIAL_FILTERS };
