import React, { useState, useEffect } from 'react';
import { Search, Plus, FileText, Truck, BarChart3, Edit, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Importer seulement vos composants existants
import PurchaseOrderModal from './PurchaseOrderModal';
// import DeliveryDashboard from './DeliveryDashboard'; // Commenté si n'existe pas

// Utiliser vos utilitaires existants
import { formatCurrency, formatDate, getStatusEmoji } from './PurchaseOrder/utils/formatting';

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
  const [statusFilter, setStatusFilter] = useState('all');
  const [filteredPOs, setFilteredPOs] = useState([]);

  // Charger les bons d'achat directement (sans hook)
  const fetchPurchaseOrders = async () => {
    try {
      setIsLoading(true);
      setError('');
      
      const { data, error: fetchError } = await supabase
        .from('purchase_orders')
        .select('*')
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

    if (statusFilter !== 'all') {
      filtered = filtered.filter(po => po.status === statusFilter);
    }

    setFilteredPOs(filtered);
  }, [purchaseOrders, searchTerm, statusFilter]);

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
    fetchPurchaseOrders(); // Rafraîchir après modification (inclut les livraisons)
  };

  const tabs = [
    { id: 'list', label: 'Bons d\'Achat', icon: FileText }
    // { id: 'dashboard', label: 'Dashboard', icon: BarChart3 } // Commenté si DeliveryDashboard n'existe pas
  ];

  // CORRECTION: Utiliser 'amount' au lieu de 'total_amount'
  const stats = {
    total: filteredPOs.length,
    draft: filteredPOs.filter(po => po.status === 'draft').length,
    approved: filteredPOs.filter(po => po.status === 'approved').length,
    delivered: filteredPOs.filter(po => po.status === 'delivered').length,
    partial: filteredPOs.filter(po => po.status === 'partially_delivered').length,
    pending: filteredPOs.filter(po => po.status === 'pending').length,
    totalValue: filteredPOs.reduce((sum, po) => sum + (parseFloat(po.amount) || 0), 0)
  };

  // Formater statut
  const formatStatus = (status) => {
    const statusLabels = {
      draft: 'Brouillon',
      pending: 'En attente',
      approved: 'Approuvé',
      partially_delivered: 'Partiellement livré',
      delivered: 'Livré',
      cancelled: 'Annulé'
    };
    return statusLabels[status] || status;
  };

  // Couleur statut
  const getStatusColor = (status) => {
    const statusColors = {
      draft: 'bg-gray-100 text-gray-800',
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      partially_delivered: 'bg-blue-100 text-blue-800',
      delivered: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800'
    };
    return statusColors[status] || 'bg-gray-100 text-gray-800';
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
      {/* Header Compact avec Gradient - Style Version Main */}
      <div className="bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-lg shadow-lg p-6 text-white">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <FileText className="w-8 h-8" />
              Gestion des Bons d'Achat
            </h1>
            <p className="text-blue-100 mt-1">
              Gérez vos bons d'achat et commandes clients
            </p>
          </div>
          <div className="flex gap-3">
            <button className="bg-white/20 backdrop-blur-sm text-white px-4 py-2 rounded-lg hover:bg-white/30 transition-colors">
              Rapport
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-white text-blue-600 px-4 py-2 rounded-lg hover:bg-gray-100 flex items-center gap-2 font-medium"
            >
              <Plus className="w-5 h-5" />
              Nouveau Bon d'Achat
            </button>
          </div>
        </div>

        {/* Statistiques Compactes Style Version Main */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-5 h-5 text-blue-200" />
              <span className="text-sm font-medium text-blue-100">Total</span>
            </div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </div>
          
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 bg-green-400 rounded-full"></div>
              <span className="text-sm font-medium text-green-100">Approuvés</span>
            </div>
            <div className="text-2xl font-bold text-green-200">{stats.approved}</div>
          </div>

          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
              <span className="text-sm font-medium text-yellow-100">En Attente</span>
            </div>
            <div className="text-2xl font-bold text-yellow-200">{stats.pending}</div>
          </div>

          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
              <span className="text-sm font-medium text-blue-100">Partiels</span>
            </div>
            <div className="text-2xl font-bold text-blue-200">{stats.partial}</div>
          </div>

          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 bg-green-400 rounded-full"></div>
              <span className="text-sm font-medium text-green-100">Livrés</span>
            </div>
            <div className="text-2xl font-bold text-green-200">{stats.delivered}</div>
          </div>

          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 bg-pink-400 rounded-full"></div>
              <span className="text-sm font-medium text-pink-100">Montant Total</span>
            </div>
            <div className="text-xl font-bold text-pink-200">{formatCurrency(stats.totalValue)}</div>
          </div>
        </div>
      </div>

      {/* Message d'erreur */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-red-800">
            <strong>Erreur:</strong> {error}
          </div>
        </div>
      )}

      {/* Section Principale */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* Barre de recherche compacte */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher par numéro PO, client, soumission..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white min-w-[200px]"
            >
              <option value="all">Tous les statuts</option>
              <option value="draft">Brouillons</option>
              <option value="pending">En attente</option>
              <option value="approved">Approuvés</option>
              <option value="partially_delivered">Partiellement livrés</option>
              <option value="delivered">Livrés</option>
            </select>
          </div>
        </div>

        {/* En-têtes de colonnes - Style tableau compact */}
        <div className="hidden lg:grid lg:grid-cols-8 gap-4 px-6 py-3 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-600 uppercase tracking-wide">
          <div>BON D'ACHAT</div>
          <div className="col-span-2">CLIENT & DESCRIPTION</div>
          <div>DATE</div>
          <div>MONTANT</div>
          <div>STATUT</div>
          <div>LIVRAISON</div>
          <div>ACTIONS</div>
        </div>

        {/* Liste des bons d'achat - Style compact tableau */}
        <div>
          {filteredPOs.length === 0 ? (
            <div className="text-center py-12 px-6">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Aucun bon d'achat trouvé</h3>
              <p className="text-gray-600 mb-4">
                {searchTerm || statusFilter !== 'all' 
                  ? 'Aucun résultat ne correspond à vos critères de recherche.'
                  : 'Commencez par créer votre premier bon d\'achat.'}
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                Créer le premier bon d'achat
              </button>
            </div>
          ) : (
            filteredPOs.map((po, index) => (
              <div key={po.id} className={`grid lg:grid-cols-8 gap-4 p-6 hover:bg-gray-50 transition-colors ${index !== filteredPOs.length - 1 ? 'border-b border-gray-100' : ''}`}>
                {/* BON D'ACHAT - Mobile/Desktop */}
                <div className="lg:flex lg:flex-col lg:justify-center">
                  <div className="flex items-center gap-2 lg:block">
                    <span className="text-xs text-gray-500 lg:hidden">BA:</span>
                    <div className="font-mono text-sm font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                      #{po.po_number}
                    </div>
                    {po.submission_no && (
                      <div className="text-xs text-gray-500 mt-1">
                        #{po.submission_no}
                      </div>
                    )}
                  </div>
                </div>

                {/* CLIENT & DESCRIPTION */}
                <div className="col-span-2">
                  <div className="font-medium text-gray-900">{po.client_name || 'N/A'}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    {po.submission_no ? `Soumission: #${po.submission_no}` : 'Aucune description'}
                  </div>
                </div>

                {/* DATE */}
                <div className="flex items-center lg:justify-start">
                  <div className="lg:text-center">
                    <div className="text-sm font-medium text-gray-900">{formatDate(po.date)}</div>
                  </div>
                </div>

                {/* MONTANT */}
                <div className="flex items-center lg:justify-center">
                  <div className="text-sm font-bold text-green-600 bg-green-50 px-2 py-1 rounded">
                    {formatCurrency(po.amount)}
                  </div>
                </div>

                {/* STATUT */}
                <div className="flex items-center lg:justify-center">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-full ${getStatusColor(po.status)}`}>
                    <span>{getStatusEmoji(po.status)}</span>
                    <span className="hidden sm:inline">{formatStatus(po.status)}</span>
                  </span>
                </div>

                {/* LIVRAISON */}
                <div className="flex items-center lg:justify-center">
                  <div className="flex items-center gap-1 text-gray-600">
                    <Truck className="w-4 h-4" />
                    <span className="text-xs font-medium">
                      {deliveryCounts[po.id] || 0}
                    </span>
                  </div>
                </div>

                {/* ACTIONS */}
                <div className="flex items-center lg:justify-center gap-2">
                  <button
                    onClick={() => handleEditPO(po)}
                    className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                    <span className="hidden sm:inline">Gérer</span>
                  </button>
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
