/**
 * @file components/PurchaseOrderManager.js
 * @description Gestionnaire des bons d'achat client (BA)
 *              - Liste compacte 2 lignes avec statut modifiable inline
 *              - Filtre multi-sélection avec mémoire localStorage
 *              - Vue responsive optimisée mobile/tablette
 * @version 1.2.0
 * @date 2026-03-20
 * @changelog
 *   1.2.0 - Ligne dédiée nom client sur mobile (3 lignes: badges / client / description)
 *   1.1.0 - Filtre multi-sélection (toggle buttons) avec mémoire localStorage, fix mobile overflow/client name
 *   1.0.0 - Version initiale
 */
import React, { useState, useEffect } from 'react';
import { Search, Plus, FileText, Truck, BarChart3, Edit, Users, DollarSign, Loader2, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Importer seulement vos composants existants
import PurchaseOrderModal from './PurchaseOrderModal';

// Utiliser vos utilitaires existants
import { formatCurrency, formatDate, getStatusEmoji } from './PurchaseOrder/utils/formatting';
import ReferenceLink from './SplitView/ReferenceLink';

const STORAGE_KEY_STATUS_FILTERS = 'ba_statusFilters';

const PurchaseOrderManager = () => {
  const [activeTab, setActiveTab] = useState('list');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null);

  // États pour la gestion des BAs (logique directe au lieu de hooks)
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [deliveryCounts, setDeliveryCounts] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeStatusFilters, setActiveStatusFilters] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_STATUS_FILTERS);
        if (saved) return JSON.parse(saved);
      } catch (e) { /* ignore */ }
    }
    return ['in_progress', 'partial'];
  });
  const [filteredPOs, setFilteredPOs] = useState([]);
  
  // États pour les modifications de statut rapides
  const [updatingStatus, setUpdatingStatus] = useState({}); // Pour tracker quels BAs sont en cours de mise à jour

  // Charger les bons d'achat directement (sans hook)
  const fetchPurchaseOrders = async () => {
    try {
      setIsLoading(true);
      setError('');
      
      const { data, error: fetchError } = await supabase
        .from('purchase_orders')
        .select('id, po_number, client_name, client_id, description, amount, status, date, created_at, submission_no, bcc_sent_count')
        .order('created_at', { ascending: false });

      if (fetchError) {
        throw new Error('Erreur chargement BAs: ' + fetchError.message);
      }

      setPurchaseOrders(data || []);
      
      // Charger le nombre de livraisons pour chaque BA
      if (data && data.length > 0) {
        await fetchDeliveryCounts(data.map(po => po.id));
      }
      
      console.log('✅ ' + (data?.length || 0) + ' bons d\'achat chargés');
      
    } catch (err) {
      console.error('Erreur fetchPurchaseOrders:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Charger le nombre de livraisons pour chaque BA
  const fetchDeliveryCounts = async (purchaseOrderIds) => {
    try {
      const { data: deliveries, error: deliveryError } = await supabase
        .from('delivery_slips')
        .select('purchase_order_id')
        .in('purchase_order_id', purchaseOrderIds);

      if (deliveryError) {
        console.error('Erreur chargement livraisons:', deliveryError);
        return;
      }

      // Compter les livraisons par BA
      const counts = {};
      purchaseOrderIds.forEach(id => counts[id] = 0);
      
      if (deliveries) {
        deliveries.forEach(delivery => {
          if (delivery.purchase_order_id) {
            counts[delivery.purchase_order_id] = (counts[delivery.purchase_order_id] || 0) + 1;
          }
        });
      }

      setDeliveryCounts(counts);
      
    } catch (err) {
      console.error('Erreur fetchDeliveryCounts:', err);
    }
  };

  // Nouvelle fonction pour mettre à jour le statut directement
  const updatePOStatus = async (poId, newStatus, currentPO) => {
    try {
      // Marquer ce BA comme en cours de mise à jour
      setUpdatingStatus(prev => ({ ...prev, [poId]: true }));
      setError('');

      console.log(`Mise à jour statut BA ${currentPO.po_number}: ${currentPO.status} → ${newStatus}`);

      const { data, error } = await supabase
        .from('purchase_orders')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', poId)
        .select()
        .single();

      if (error) {
        throw new Error(`Erreur mise à jour statut: ${error.message}`);
      }

      // Mettre à jour l'état local pour un feedback immédiat
      setPurchaseOrders(prevPOs => 
        prevPOs.map(po => 
          po.id === poId 
            ? { ...po, status: newStatus, updated_at: data.updated_at }
            : po
        )
      );

      console.log(`✅ Statut du BA ${currentPO.po_number} mis à jour vers "${newStatus}"`);

    } catch (err) {
      console.error('Erreur updatePOStatus:', err);
      setError(`Erreur lors de la mise à jour du statut: ${err.message}`);
      
      // Optionnel: Rétablir l'ancien statut en cas d'erreur
      // Ici on laisse fetchPurchaseOrders() se charger du refresh
      
    } finally {
      // Retirer le flag de chargement
      setUpdatingStatus(prev => {
        const newState = { ...prev };
        delete newState[poId];
        return newState;
      });
    }
  };

  // Toggle un filtre de statut
  const toggleStatusFilter = (status) => {
    setActiveStatusFilters(prev => {
      let next;
      if (prev.includes(status)) {
        next = prev.filter(s => s !== status);
      } else {
        next = [...prev, status];
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_STATUS_FILTERS, JSON.stringify(next));
      }
      return next;
    });
  };

  // Filtrer les BAs
  useEffect(() => {
    let filtered = purchaseOrders;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(po =>
        po.po_number?.toLowerCase().includes(term) ||
        po.client_name?.toLowerCase().includes(term) ||
        po.submission_no?.toLowerCase().includes(term)
      );
    }

    // Multi-select: si aucun filtre actif = tout montrer
    if (activeStatusFilters.length > 0) {
      filtered = filtered.filter(po => {
        if (activeStatusFilters.includes('partial')) {
          return activeStatusFilters.includes(po.status) ||
                 (po.status === 'partially_delivered');
        }
        return activeStatusFilters.includes(po.status);
      });
    }

    setFilteredPOs(filtered);
  }, [purchaseOrders, searchTerm, activeStatusFilters]);

  // Charger au montage
  useEffect(() => {
    fetchPurchaseOrders();
  }, []);

  const handleEditPO = (po) => {
    setSelectedPO(po);
    setShowCreateModal(true);
  };

  const handleModalClose = () => {
    setShowCreateModal(false);
    setSelectedPO(null);
    fetchPurchaseOrders(); // Rafraîchir après modification
  };

  // Statistiques avec toutes les catégories
  const stats = {
    total: purchaseOrders.length,
    inProgress: purchaseOrders.filter(po => po.status === 'in_progress').length,
    partial: purchaseOrders.filter(po => 
      po.status === 'partial' || po.status === 'partially_delivered'
    ).length,
    completed: purchaseOrders.filter(po => po.status === 'completed').length,
    totalValue: purchaseOrders.reduce((sum, po) => sum + (parseFloat(po.amount) || 0), 0)
  };

  // Formater statut
  const formatStatus = (status) => {
    const statusLabels = {
      in_progress: 'En cours',
      partial: 'Partiellement livré',
      completed: 'Complété'
    };
    return statusLabels[status] || status;
  };

  // Couleur statut
  const getStatusColor = (status) => {
    const statusColors = {
      in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      partial: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
    };
    return statusColors[status] || 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
  };

  // Options de statut pour le select
  const statusOptions = [
    { value: 'in_progress', label: 'En cours', emoji: '🔵' },
    { value: 'partial', label: 'Partiellement livré', emoji: '🚚' },
    { value: 'completed', label: 'Complété', emoji: '✅' }
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Chargement des bons d'achat...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header Moderne avec Gradient - COMPACT */}
      <div className="bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-xl shadow-xl text-white p-3 sm:p-4 md:p-6">
        <div className="flex justify-between items-start mb-3 sm:mb-4">
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-1">Bons d'Achat Client</h1>
            <p className="text-white/80 text-xs sm:text-sm">Gestion complète de vos bons d'achat</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-white text-blue-600 px-3 sm:px-4 py-2 rounded-lg hover:bg-blue-50 transition-all duration-200 flex items-center gap-2 font-medium shadow-lg whitespace-nowrap"
          >
            <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="hidden sm:inline">Nouveau BA</span>
            <span className="sm:hidden">Nouveau</span>
          </button>
        </div>

        {/* Statistiques Compactes */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3">
          {/* Total */}
          <div className="bg-white/15 backdrop-blur-sm rounded-lg p-2 border border-white/20">
            <div className="flex items-center justify-between mb-1">
              <FileText className="w-4 h-4 text-white/80" />
              <span className="text-base sm:text-xl font-bold">{stats.total}</span>
            </div>
            <p className="text-white/80 font-medium text-[10px] sm:text-xs">Total</p>
          </div>

          {/* En cours */}
          <div className="bg-white/15 backdrop-blur-sm rounded-lg p-2 border border-white/20">
            <div className="flex items-center justify-between mb-1">
              <div className="w-4 h-4 bg-blue-400 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-[10px]">🔵</span>
              </div>
              <span className="text-base sm:text-xl font-bold text-blue-200">{stats.inProgress}</span>
            </div>
            <p className="text-blue-100 font-medium text-[10px] sm:text-xs">En cours</p>
          </div>

          {/* Partiellement Livrés */}
          <div className="bg-white/15 backdrop-blur-sm rounded-lg p-2 border border-white/20">
            <div className="flex items-center justify-between mb-1">
              <div className="w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-[10px]">🚚</span>
              </div>
              <span className="text-base sm:text-xl font-bold text-yellow-200">{stats.partial}</span>
            </div>
            <p className="text-yellow-100 font-medium text-[10px] sm:text-xs">Partiels</p>
          </div>

          {/* Complétés */}
          <div className="bg-white/15 backdrop-blur-sm rounded-lg p-2 border border-white/20">
            <div className="flex items-center justify-between mb-1">
              <div className="w-4 h-4 bg-green-400 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-[10px]">✅</span>
              </div>
              <span className="text-base sm:text-xl font-bold text-green-200">{stats.completed}</span>
            </div>
            <p className="text-green-100 font-medium text-[10px] sm:text-xs">Complétés</p>
          </div>

          {/* Montant Total */}
          <div className="bg-white/15 backdrop-blur-sm rounded-lg p-2 border border-white/20">
            <div className="flex items-center justify-between mb-1">
              <DollarSign className="w-4 h-4 text-pink-200" />
              <span className="text-base sm:text-lg font-bold text-pink-200">{formatCurrency(stats.totalValue)}</span>
            </div>
            <p className="text-pink-100 font-medium text-[10px] sm:text-xs">Montant Total</p>
          </div>
        </div>
      </div>

      {/* Message d'erreur */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 sm:p-4">
          <div className="text-red-800 dark:text-red-300 text-sm">
            <strong>Erreur:</strong> {error}
            <button
              onClick={() => setError('')}
              className="ml-4 text-red-600 dark:text-red-400 underline hover:no-underline"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Section Principale */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700">
        {/* Barre de recherche compacte */}
        <div className="p-3 sm:p-4 md:p-6 border-b border-gray-100 dark:border-gray-700">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 sm:w-5 sm:h-5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher par numéro, client..."
                className="w-full pl-10 sm:pl-12 pr-3 sm:pr-4 py-2 sm:py-3 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 dark:bg-gray-800 focus:bg-white dark:focus:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 transition-all duration-200 text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center">
              {[
                { value: 'in_progress', label: 'En cours', shortLabel: 'En cours', color: 'blue' },
                { value: 'partial', label: 'Partiel', shortLabel: 'Partiel', color: 'yellow' },
                { value: 'completed', label: 'Complété', shortLabel: 'Complété', color: 'green' }
              ].map(opt => {
                const isActive = activeStatusFilters.includes(opt.value);
                const colorClasses = {
                  blue: isActive
                    ? 'bg-blue-600 text-white border-blue-600 dark:bg-blue-500 dark:border-blue-500'
                    : 'bg-white text-blue-700 border-blue-300 dark:bg-gray-800 dark:text-blue-400 dark:border-blue-700',
                  yellow: isActive
                    ? 'bg-yellow-500 text-white border-yellow-500 dark:bg-yellow-600 dark:border-yellow-600'
                    : 'bg-white text-yellow-700 border-yellow-300 dark:bg-gray-800 dark:text-yellow-400 dark:border-yellow-700',
                  green: isActive
                    ? 'bg-green-600 text-white border-green-600 dark:bg-green-500 dark:border-green-500'
                    : 'bg-white text-green-700 border-green-300 dark:bg-gray-800 dark:text-green-400 dark:border-green-700',
                };
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleStatusFilter(opt.value)}
                    className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg border text-xs sm:text-sm font-medium transition-all duration-150 touch-manipulation ${colorClasses[opt.color]}`}
                  >
                    {isActive && <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
                    {opt.shortLabel}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Pas d'en-têtes - Layout 2 lignes */}

        {/* Liste des BAs - Format 2 LIGNES ULTRA-COMPACT */}
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {filteredPOs.length === 0 ? (
            <div className="text-center py-12 sm:py-16 px-4 sm:px-6">
              <div className="w-16 h-16 sm:w-24 sm:h-24 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <FileText className="w-8 h-8 sm:w-12 sm:h-12 text-gray-400 dark:text-gray-500" />
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Aucun bon d'achat trouvé</h3>
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-4 sm:mb-6">
                {searchTerm || activeStatusFilters.length > 0
                  ? 'Aucun résultat ne correspond à vos critères de recherche.'
                  : 'Commencez par créer votre premier bon d\'achat.'}
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all duration-200 font-medium shadow-lg text-sm"
              >
                Créer le premier bon d'achat
              </button>
            </div>
          ) : (
            filteredPOs.map((po, index) => (
              <div
                key={po.id}
                onClick={() => handleEditPO(po)}
                className={`p-2 sm:p-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 active:bg-blue-100 dark:active:bg-blue-900/30 transition-all duration-150 cursor-pointer touch-manipulation ${
                  index % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800/50'
                }`}
              >
                {/* LIGNE 1: #BA + badges compacts */}
                <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1 min-w-0 flex-wrap">
                  {/* #BA */}
                  <div className="bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded flex-shrink-0">
                    <div className="font-mono text-[10px] sm:text-xs font-bold text-blue-700 dark:text-blue-400">#{po.po_number}</div>
                  </div>

                  {/* CLIENT - visible seulement sur desktop (ligne 1), sur mobile c'est ligne 2 */}
                  <div className="hidden sm:block font-semibold text-gray-900 dark:text-gray-100 text-sm truncate flex-1 min-w-0" title={po.client_name}>
                    {po.client_name || 'N/A'}
                  </div>

                  {/* BCC */}
                  {(po.bcc_sent_count || 0) > 0 && (
                    <div className="flex items-center gap-0.5 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full flex-shrink-0" title={`${po.bcc_sent_count} BCC envoyé(s)`}>
                      <FileText className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-[10px] sm:text-xs font-medium text-emerald-700 dark:text-emerald-400">{po.bcc_sent_count}</span>
                    </div>
                  )}

                  {/* DATE - hidden on mobile */}
                  <div className="text-xs font-medium text-gray-700 dark:text-gray-400 flex-shrink-0 hidden sm:block">
                    {formatDate(po.date)}
                  </div>

                  {/* MONTANT */}
                  <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold whitespace-nowrap flex-shrink-0">
                    {formatCurrency(po.amount)}
                  </div>

                  {/* STATUT - Modifiable */}
                  <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
                    {updatingStatus[po.id] ? (
                      <div className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full text-xs">
                        <Loader2 className="w-3 h-3 animate-spin" />
                      </div>
                    ) : (
                      <select
                        value={po.status}
                        onChange={(e) => updatePOStatus(po.id, e.target.value, po)}
                        className={`text-[10px] sm:text-xs font-medium rounded-full border-0 py-0.5 px-1.5 sm:px-2 focus:ring-2 focus:ring-blue-500 cursor-pointer transition-all ${getStatusColor(po.status)}`}
                      >
                        {statusOptions.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.emoji} {option.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* LIVRAISON */}
                  <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full flex-shrink-0">
                    <Truck className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                    <span className="text-[10px] sm:text-xs font-medium text-gray-700 dark:text-gray-300">{deliveryCounts[po.id] || 0}</span>
                  </div>
                </div>

                {/* LIGNE 2 (mobile seulement): Nom du client complet */}
                <div className="sm:hidden text-sm font-semibold text-gray-900 dark:text-gray-100 pl-1 mb-0.5 truncate" title={po.client_name}>
                  {po.client_name || 'N/A'}
                </div>

                {/* LIGNE 3 (mobile) / LIGNE 2 (desktop): Description + Soumission */}
                <div className="text-[11px] sm:text-xs text-gray-600 dark:text-gray-400 pl-1 sm:pl-2 truncate" onClick={(e) => { if (po.submission_no) e.stopPropagation(); }}>
                  {po.submission_no && (
                    <>
                      <ReferenceLink
                        type="soumission"
                        label={`#${po.submission_no}`}
                        data={{ submissionNumber: po.submission_no }}
                        variant="purple"
                      />
                      <span> • </span>
                    </>
                  )}
                  {po.description || 'Aucune description'}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal centralisé */}
      {showCreateModal && (
        <PurchaseOrderModal
          isOpen={showCreateModal}
          onClose={handleModalClose}
          editingPO={selectedPO}
          onRefresh={fetchPurchaseOrders}
        />
      )}
    </div>
  );
};

export default PurchaseOrderManager;
