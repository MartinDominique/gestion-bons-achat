/**
 * @file components/statistics/StatisticsFilters.js
 * @description Composant de filtres pour le module Statistiques de ventes
 *              - Filtres: type document, période, client, n° document, description, produit
 *              - Combinaison AND des filtres
 *              - Bouton réinitialiser
 * @version 1.0.0
 * @date 2026-02-24
 * @changelog
 *   1.0.0 - Version initiale - Phase 1 MVP
 */

import { useState, useEffect } from 'react';
import { Search, RotateCcw, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// Date par défaut: premier jour du mois en cours
function getDefaultDateFrom() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function getDefaultDateTo() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const DEFAULT_FILTERS = {
  types: ['bt', 'bl', 'soumission'],
  dateFrom: getDefaultDateFrom(),
  dateTo: getDefaultDateTo(),
  clientId: '',
  documentNumber: '',
  search: '',
  productId: '',
  sortBy: 'date',
  sortOrder: 'desc',
};

export default function StatisticsFilters({ filters, onFiltersChange, onSearch, loading }) {
  const [clients, setClients] = useState([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('id, name')
      .order('name');

    if (!error && data) {
      setClients(data);
    }
  };

  const handleTypeToggle = (type) => {
    const currentTypes = [...filters.types];
    const index = currentTypes.indexOf(type);
    if (index >= 0) {
      if (currentTypes.length > 1) {
        currentTypes.splice(index, 1);
      }
    } else {
      currentTypes.push(type);
    }
    onFiltersChange({ ...filters, types: currentTypes });
  };

  const handleChange = (field, value) => {
    onFiltersChange({ ...filters, [field]: value });
  };

  const handleReset = () => {
    onFiltersChange({ ...DEFAULT_FILTERS });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      onSearch();
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4">
      {/* Ligne 1: Types + Dates + Rechercher */}
      <div className="flex flex-wrap gap-3 items-end">
        {/* Type de document */}
        <div className="flex-shrink-0">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Type</label>
          <div className="flex gap-1">
            {[
              { key: 'bt', label: 'BT' },
              { key: 'bl', label: 'BL' },
              { key: 'soumission', label: 'Soum.' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handleTypeToggle(key)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  filters.types.includes(key)
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Date début */}
        <div className="flex-shrink-0">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Du</label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => handleChange('dateFrom', e.target.value)}
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
            title="Réinitialiser les filtres"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title="Filtres avancés"
          >
            <Filter className="w-4 h-4" />
            {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Ligne 2: Filtres avancés (collapsible) */}
      {showAdvanced && (
        <div className="flex flex-wrap gap-3 items-end mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          {/* N° Document */}
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">N° Document</label>
            <input
              type="text"
              value={filters.documentNumber}
              onChange={(e) => handleChange('documentNumber', e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="BT-2602-..."
              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400"
            />
          </div>

          {/* Description */}
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Description</label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => handleChange('search', e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Recherche dans la description..."
              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400"
            />
          </div>

          {/* Produit */}
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Produit / Item</label>
            <input
              type="text"
              value={filters.productId}
              onChange={(e) => handleChange('productId', e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Code ou description..."
              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400"
            />
          </div>

          {/* Tri */}
          <div className="flex-shrink-0">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Trier par</label>
            <select
              value={filters.sortBy}
              onChange={(e) => handleChange('sortBy', e.target.value)}
              className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              <option value="date">Date</option>
              <option value="revenue">Revenus</option>
              <option value="cost">Coûts</option>
              <option value="margin">Marge $</option>
              <option value="marginPercent">Marge %</option>
              <option value="client">Client</option>
            </select>
          </div>

          {/* Ordre */}
          <div className="flex-shrink-0">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Ordre</label>
            <select
              value={filters.sortOrder}
              onChange={(e) => handleChange('sortOrder', e.target.value)}
              className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              <option value="desc">Desc.</option>
              <option value="asc">Asc.</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

export { DEFAULT_FILTERS };
