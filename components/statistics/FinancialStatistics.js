/**
 * @file components/statistics/FinancialStatistics.js
 * @description Orchestrateur du sous-onglet Financier des Statistiques
 *              - Gère les filtres, données et communication avec l'API
 *              - Affiche filtres + rapport financier + export PDF
 *              - 3 vues: Par mois, Par client, En attente
 * @version 1.0.0
 * @date 2026-02-27
 * @changelog
 *   1.0.0 - Version initiale (Phase D — Statistiques Phase 2)
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Download } from 'lucide-react';
import FinancialFilters, { DEFAULT_FINANCIAL_FILTERS } from './FinancialFilters';
import FinancialReport from './FinancialReport';
import { generateFinancialPDF } from './FinancialPDFExport';
import { supabase } from '../../lib/supabase';

export default function FinancialStatistics() {
  const [filters, setFilters] = useState({ ...DEFAULT_FINANCIAL_FILTERS });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [clients, setClients] = useState([]);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Charger la liste des clients pour le PDF
  useEffect(() => {
    const fetchClients = async () => {
      const { data: clientData } = await supabase
        .from('clients')
        .select('id, name')
        .order('name');
      if (clientData) setClients(clientData);
    };
    fetchClients();
  }, []);

  // Charger au montage
  useEffect(() => {
    fetchFinancialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchFinancialData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      if (filters.clientId) params.set('clientId', filters.clientId);
      if (filters.status && filters.status !== 'all') params.set('status', filters.status);

      const response = await fetch(`/api/statistics/financial?${params.toString()}`);
      const result = await response.json();

      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error || 'Erreur lors de la récupération des données financières');
      }
    } catch (err) {
      console.error('Erreur fetch financial statistics:', err);
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const handleSearch = () => {
    fetchFinancialData();
  };

  const handleExportPDF = async () => {
    if (!data) return;

    setPdfLoading(true);
    try {
      await generateFinancialPDF({
        data,
        filters,
        clients,
      });
    } catch (err) {
      console.error('Erreur génération PDF financier:', err);
      setError('Erreur lors de la génération du PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div>
      {/* Bouton PDF */}
      <div className="flex justify-end mb-4">
        <button
          onClick={handleExportPDF}
          disabled={pdfLoading || !data}
          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          <Download className="w-4 h-4" />
          {pdfLoading ? 'Génération...' : 'PDF'}
        </button>
      </div>

      {/* Filtres */}
      <FinancialFilters
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
        <FinancialReport
          data={data}
          loading={loading}
          view={filters.view}
        />
      </div>
    </div>
  );
}
