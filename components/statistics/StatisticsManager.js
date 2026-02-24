/**
 * @file components/statistics/StatisticsManager.js
 * @description Composant principal du module Statistiques de ventes
 *              - Orchestre filtres, rapport de ventes et export PDF
 *              - Gère l'état des données et la communication avec l'API
 *              - Responsive: desktop tableau, mobile cartes
 * @version 1.0.0
 * @date 2026-02-24
 * @changelog
 *   1.0.0 - Version initiale - Phase 1 MVP
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Download, RefreshCw } from 'lucide-react';
import StatisticsFilters, { DEFAULT_FILTERS } from './StatisticsFilters';
import SalesReport from './SalesReport';
import { generateStatisticsPDF } from './StatisticsPDFExport';
import { supabase } from '../../lib/supabase';

export default function StatisticsManager() {
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
  const [documents, setDocuments] = useState(null);
  const [summary, setSummary] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [clients, setClients] = useState([]);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Charger la liste des clients pour le filtre et le PDF
  useEffect(() => {
    const fetchClients = async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, name')
        .order('name');
      if (data) setClients(data);
    };
    fetchClients();
  }, []);

  // Charger automatiquement au montage
  useEffect(() => {
    fetchStatistics(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchStatistics = useCallback(async (page = 0) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('type', filters.types.join(','));
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      if (filters.clientId) params.set('clientId', filters.clientId);
      if (filters.documentNumber) params.set('documentNumber', filters.documentNumber);
      if (filters.search) params.set('search', filters.search);
      if (filters.productId) params.set('productId', filters.productId);
      params.set('sortBy', filters.sortBy);
      params.set('sortOrder', filters.sortOrder);
      params.set('page', String(page));
      params.set('limit', '50');

      const response = await fetch(`/api/statistics?${params.toString()}`);
      const result = await response.json();

      if (result.success) {
        setDocuments(result.data.documents);
        setSummary(result.data.summary);
        setPagination(result.pagination);
      } else {
        setError(result.error || 'Erreur lors de la récupération des données');
      }
    } catch (err) {
      console.error('Erreur fetch statistics:', err);
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const handleSearch = () => {
    fetchStatistics(0);
  };

  const handlePageChange = (newPage) => {
    fetchStatistics(newPage);
  };

  const handleExportPDF = async () => {
    if (!documents || documents.length === 0) return;

    setPdfLoading(true);
    try {
      // Pour le PDF, récupérer TOUS les documents (sans pagination)
      const params = new URLSearchParams();
      params.set('type', filters.types.join(','));
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      if (filters.clientId) params.set('clientId', filters.clientId);
      if (filters.documentNumber) params.set('documentNumber', filters.documentNumber);
      if (filters.search) params.set('search', filters.search);
      if (filters.productId) params.set('productId', filters.productId);
      params.set('sortBy', filters.sortBy);
      params.set('sortOrder', filters.sortOrder);
      params.set('page', '0');
      params.set('limit', '1000'); // Tous les résultats pour le PDF

      const response = await fetch(`/api/statistics?${params.toString()}`);
      const result = await response.json();

      if (result.success) {
        await generateStatisticsPDF({
          documents: result.data.documents,
          summary: result.data.summary,
          filters,
          clients,
        });
      }
    } catch (err) {
      console.error('Erreur génération PDF:', err);
      setError('Erreur lors de la génération du PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Statistiques de Ventes
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportPDF}
            disabled={pdfLoading || !documents || documents.length === 0}
            className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            {pdfLoading ? 'Génération...' : 'PDF'}
          </button>
        </div>
      </div>

      {/* Filtres */}
      <StatisticsFilters
        filters={filters}
        onFiltersChange={setFilters}
        onSearch={handleSearch}
        loading={loading}
      />

      {/* Erreur */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Rapport */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <SalesReport
          documents={documents}
          summary={summary}
          pagination={pagination}
          onPageChange={handlePageChange}
          loading={loading}
        />
      </div>

      {/* Note informative */}
      <div className="mt-4 text-xs text-gray-400 dark:text-gray-500">
        <p>
          Note: Les coûts des BT et BL sont basés sur le prix coûtant actuel des produits dans l'inventaire.
          Si les prix ont changé depuis la création du document, les marges peuvent être approximatives.
        </p>
      </div>
    </div>
  );
}
