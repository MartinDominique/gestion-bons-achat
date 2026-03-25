/**
 * @file components/SplitView/PanelSoumissionsList.js
 * @description Liste des soumissions dans le panneau latéral SplitView
 *              - Affiche toutes les soumissions avec filtre par statut
 *              - Changement de statut inline (dropdown) sans ouvrir le formulaire
 *              - Clic sur une soumission ouvre le détail dans le même panneau
 * @version 1.0.0
 * @date 2026-03-24
 * @changelog
 *   1.0.1 - Ligne entière cliquable pour ouvrir le détail de la soumission
 *   1.0.0 - Version initiale
 */

'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useSplitView } from './SplitViewContext';
import { ChevronDown, Search, FileText } from 'lucide-react';

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD'
  }).format(amount || 0);
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('fr-CA');
};

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Brouillon', emoji: '📝', bgClass: 'bg-gray-100 text-gray-800', activeBg: 'bg-gray-50' },
  { value: 'sent', label: 'Envoyée', emoji: '📤', bgClass: 'bg-blue-100 text-blue-800', activeBg: 'bg-blue-50' },
  { value: 'accepted', label: 'Acceptée', emoji: '✅', bgClass: 'bg-green-100 text-green-800', activeBg: 'bg-green-50' }
];

export default function PanelSoumissionsList({ data }) {
  const { replacePanel } = useSplitView();
  const [soumissions, setSoumissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [statusDropdownId, setStatusDropdownId] = useState(null);

  useEffect(() => {
    loadSoumissions();
  }, []);

  // Fermer le dropdown au clic extérieur
  useEffect(() => {
    if (!statusDropdownId) return;
    const handleClickOutside = () => setStatusDropdownId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [statusDropdownId]);

  const loadSoumissions = async () => {
    try {
      setLoading(true);
      const { data: soumData, error } = await supabase
        .from('submissions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSoumissions(soumData || []);
    } catch (err) {
      console.error('Erreur chargement soumissions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (submissionId, newStatus) => {
    try {
      const { error } = await supabase
        .from('submissions')
        .update({ status: newStatus })
        .eq('id', submissionId);

      if (error) throw error;

      setSoumissions(prev => prev.map(s =>
        s.id === submissionId ? { ...s, status: newStatus } : s
      ));
      setStatusDropdownId(null);
    } catch (err) {
      console.error('Erreur mise à jour statut:', err);
    }
  };

  const filtered = soumissions.filter(s => {
    const matchesSearch = !searchTerm ||
      (s.client_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.submission_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500 to-indigo-500 rounded-lg p-3 text-white">
        <h3 className="text-base font-bold flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Gestion des Soumissions
        </h3>
        <p className="text-purple-100 text-xs mt-1">Cliquer sur le statut pour le modifier</p>
      </div>

      {/* Filtres */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher..."
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:ring-purple-500 focus:border-purple-500"
          />
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              statusFilter === 'all' ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Tous ({soumissions.length})
          </button>
          {STATUS_OPTIONS.map(opt => {
            const count = soumissions.filter(s => s.status === opt.value).length;
            return (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  statusFilter === opt.value ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {opt.emoji} {count}
              </button>
            );
          })}
        </div>
      </div>

      {/* Liste */}
      <div className="space-y-1.5">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
            Aucune soumission trouvée
          </div>
        ) : (
          filtered.map((submission) => {
            const statusOpt = STATUS_OPTIONS.find(o => o.value === submission.status) || STATUS_OPTIONS[0];
            return (
              <div
                key={submission.id}
                onClick={() => replacePanel('soumission', { submissionNumber: submission.submission_number, _fromList: true })}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 hover:border-purple-300 dark:hover:border-purple-600 transition-colors cursor-pointer"
              >
                {/* Ligne 1: N° + Client + Statut */}
                <div className="flex items-center gap-2">
                  {submission.submission_number && (
                    <span
                      className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-xs font-mono font-bold flex-shrink-0"
                    >
                      {submission.submission_number}
                    </span>
                  )}
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate flex-1 min-w-0">
                    {submission.client_name}
                  </span>

                  {/* Dropdown statut */}
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setStatusDropdownId(statusDropdownId === submission.id ? null : submission.id);
                      }}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:ring-2 hover:ring-purple-300 transition-all flex items-center gap-0.5 ${statusOpt.bgClass}`}
                      title="Cliquer pour changer le statut"
                    >
                      {statusOpt.emoji}
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    {statusDropdownId === submission.id && (
                      <div className="absolute z-50 mt-1 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-1 min-w-[130px]">
                        {STATUS_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStatusChange(submission.id, opt.value);
                            }}
                            className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 ${
                              submission.status === opt.value ? `font-bold ${opt.activeBg} dark:bg-gray-700` : ''
                            }`}
                          >
                            {opt.emoji} {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Ligne 2: Description + Montant + Date */}
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                  <span className="truncate flex-1 min-w-0">
                    {submission.description || 'Aucune description'}
                  </span>
                  <span className="text-green-600 font-semibold flex-shrink-0">
                    {formatCurrency(submission.amount)}
                  </span>
                  <span className="flex-shrink-0">
                    {formatDate(submission.created_at)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
