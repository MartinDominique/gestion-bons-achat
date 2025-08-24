// ========================================
// FICHIER 6: PurchaseOrderManager.js
// ========================================
import React, { useState } from 'react';
import { Search, Plus, FileText, Truck, BarChart3 } from 'lucide-react';

// Hooks personnalisés
import usePurchaseOrders from './hooks/usePurchaseOrders';
import useDeliveries from './hooks/useDeliveries';
import useFileUpload from './hooks/useFileUpload';

// Composants
import DeliveryDashboard from '../DeliveryDashboard';

// Utilitaires
import { formatCurrency, formatDate, formatStatus, getStatusColor } from './utils/formatting';

const PurchaseOrderManager = () => {
  const [activeTab, setActiveTab] = useState('list');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);

  // Hooks personnalisés
  const {
    purchaseOrders,
    clients,
    isLoading,
    error,
    searchTerm,
    statusFilter,
    setSearchTerm,
    setStatusFilter,
    fetchPurchaseOrders,
    createPurchaseOrder
  } = usePurchaseOrders();

  const deliveryHook = useDeliveries(selectedPO);
  const fileUploadHook = useFileUpload();

  const handleCreatePO = async (formData) => {
    try {
      await createPurchaseOrder(formData);
      setShowCreateModal(false);
    } catch (error) {
      console.error('Erreur création BA:', error);
    }
  };

  const handleDeliveryClick = (po) => {
    setSelectedPO(po);
    setShowDeliveryModal(true);
  };

  const tabs = [
    { id: 'list', label: 'Bons d\'Achat', icon: FileText },
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 }
  ];

  const stats = {
    total: purchaseOrders.length,
    draft: purchaseOrders.filter(po => po.status === 'draft').length,
    approved: purchaseOrders.filter(po => po.status === 'approved').length,
    delivered: purchaseOrders.filter(po => po.status === 'delivered').length,
    partial: purchaseOrders.filter(po => po.status === 'partially_delivered').length,
    totalValue: purchaseOrders.reduce((sum, po) => sum + (parseFloat(po.total_amount) || 0), 0)
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement des bons d'achat...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header avec statistiques */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <FileText className="w-8 h-8 text-blue-600" />
              Gestion des Bons d'Achat Client
            </h1>
            <p className="text-gray-600 mt-2">
              Module complet de gestion des bons d'achat et livraisons partielles
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Nouveau BA
          </button>
        </div>

        {/* Statistiques rapides */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-sm text-gray-600">Total BAs</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-600">{stats.draft}</div>
            <div className="text-sm text-gray-600">Brouillons</div>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
            <div className="text-sm text-green-600">Approuvés</div>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{stats.partial}</div>
            <div className="text-sm text-blue-600">Partiels</div>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{stats.delivered}</div>
            <div className="text-sm text-green-600">Livrés</div>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{formatCurrency(stats.totalValue)}</div>
            <div className="text-sm text-blue-600">Valeur totale</div>
          </div>
        </div>
      </div>

      {/* Navigation par onglets */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'list' && (
            <div className="space-y-6">
              {/* Barre de recherche */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Rechercher par numéro de BA, client ou soumission..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">Tous les statuts</option>
                  <option value="draft">Brouillons</option>
                  <option value="approved">Approuvés</option>
                  <option value="partially_delivered">Partiellement livrés</option>
                  <option value="delivered">Livrés</option>
                </select>
              </div>

              {/* Liste des bons d'achat */}
              <div className="space-y-4">
                {purchaseOrders.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun bon d'achat trouvé</h3>
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                    >
                      Créer le premier bon d'achat
                    </button>
                  </div>
                ) : (
                  purchaseOrders.map((po) => (
                    <div key={po.id} className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3">
                          <div className="text-lg font-semibold text-gray-900">BA #{po.po_number}</div>
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(po.status)}`}>
                            {formatStatus(po.status)}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          {(po.status === 'approved' || po.status === 'partially_delivered') && (
                            <button
                              onClick={() => handleDeliveryClick(po)}
                              className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 flex items-center gap-1"
                            >
                              <Truck className="w-4 h-4" />
                              Livrer
                            </button>
                          )}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="font-medium text-gray-700">Client</div>
                          <div className="text-gray-900">{po.client_name || 'N/A'}</div>
                        </div>
                        <div>
                          <div className="font-medium text-gray-700">Date</div>
                          <div className="text-gray-900">{formatDate(po.po_date)}</div>
                        </div>
                        <div>
                          <div className="font-medium text-gray-700">Montant</div>
                          <div className="text-gray-900 font-semibold">{formatCurrency(po.total_amount)}</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'dashboard' && (
            <DeliveryDashboard />
          )}
        </div>
      </div>
    </div>
  );
};

export default PurchaseOrderManager;
