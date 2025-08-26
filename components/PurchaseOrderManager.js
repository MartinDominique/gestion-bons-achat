// components/PurchaseOrderManager.js — VERSION COMPACTE (styles Tailwind seulement)
import React, { useState, useEffect } from 'react';
import { Search, Plus, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Vos composants/utilitaires existants
import PurchaseOrderModal from './PurchaseOrderModal';
// import DeliveryDashboard from './DeliveryDashboard';
import { formatCurrency, formatDate, getStatusEmoji } from './PurchaseOrder/utils/formatting';

const PurchaseOrderManager = () => {
  // --- États (inchangés) ---
  const [activeTab, setActiveTab] = useState('list');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null);

  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [filteredPOs, setFilteredPOs] = useState([]);

  // --- Fetch (inchangé) ---
  const fetchPurchaseOrders = async () => {
    try {
      setIsLoading(true);
      setError('');
      const { data, error: fetchError } = await supabase
        .from('purchase_orders')
        .select('*')
        .order('created_at', { ascending: false });
      if (fetchError) throw new Error(`Erreur chargement BAs: ${fetchError.message}`);
      setPurchaseOrders(data || []);
      console.log(`✅ ${data?.length || 0} bons d'achat chargés`);
    } catch (err) {
      console.error('Erreur fetchPurchaseOrders:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Filtres (inchangé) ---
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

  useEffect(() => { fetchPurchaseOrders(); }, []);

  const handleEditPO = (po) => {
    setSelectedPO(po);
    setShowCreateModal(true);
  };
  const handleModalClose = () => {
    setShowCreateModal(false);
    setSelectedPO(null);
    fetchPurchaseOrders();
  };

  const tabs = [
    { id: 'list', label: "Bons d'Achat", icon: FileText },
    // { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  ];

  // --- Stats (inchangé) ---
  const stats = {
    total: filteredPOs.length,
    draft: filteredPOs.filter(po => po.status === 'draft').length,
    approved: filteredPOs.filter(po => po.status === 'approved').length,
    delivered: filteredPOs.filter(po => po.status === 'delivered').length,
    partial: filteredPOs.filter(po => po.status === 'partially_delivered').length,
    totalValue: filteredPOs.reduce((sum, po) => sum + (parseFloat(po.total_amount) || 0), 0)
  };

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

  const getStatusColor = (status) => {
    const statusColors = {
      draft: 'bg-gray-100 text-gray-800 ring-1 ring-gray-200',
      pending: 'bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200',
      approved: 'bg-green-100 text-green-800 ring-1 ring-green-200',
      partially_delivered: 'bg-blue-100 text-blue-800 ring-1 ring-blue-200',
      delivered: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200',
      cancelled: 'bg-red-100 text-red-800 ring-1 ring-red-200'
    };
    return statusColors[status] || 'bg-gray-100 text-gray-800 ring-1 ring-gray-200';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-72">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" />
          <p className="text-gray-600 text-sm">Chargement des bons d'achat…</p>
        </div>
      </div>
    );
  }

  // ========================= UI COMPACT =========================
  return (
    <div className="space-y-4">
      {/* Header + stats COMPACt */}
      <div className="bg-white rounded-md shadow-sm border border-gray-200 p-4">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-600" />
            <h1 className="text-lg font-semibold text-gray-900">
              Gestion des Bons d'Achat Client
            </h1>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 text-sm inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Nouveau BA
          </button>
        </div>
        <p className="text-gray-500 text-xs">
          Module de gestion des bons d'achat et livraisons partielles
        </p>

        {/* Stats compactes */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mt-3">
          <div className="text-center p-2 bg-gray-50 rounded-md border border-gray-200">
            <div className="text-base font-semibold text-gray-900 leading-5">{stats.total}</div>
            <div className="text-[11px] text-gray-600">Total BAs</div>
          </div>
          <div className="text-center p-2 bg-gray-50 rounded-md border border-gray-200">
            <div className="text-base font-semibold text-gray-700 leading-5">{stats.draft}</div>
            <div className="text-[11px] text-gray-600">Brouillons</div>
          </div>
          <div className="text-center p-2 bg-green-50 rounded-md border border-green-100">
            <div className="text-base font-semibold text-green-700 leading-5">{stats.approved}</div>
            <div className="text-[11px] text-green-700/90">Approuvés</div>
          </div>
          <div className="text-center p-2 bg-blue-50 rounded-md border border-blue-100">
            <div className="text-base font-semibold text-blue-700 leading-5">{stats.partial}</div>
            <div className="text-[11px] text-blue-700/90">Partiels</div>
          </div>
          <div className="text-center p-2 bg-emerald-50 rounded-md border border-emerald-100">
            <div className="text-base font-semibold text-emerald-700 leading-5">{stats.delivered}</div>
            <div className="text-[11px] text-emerald-700/90">Livrés</div>
          </div>
          <div className="text-center p-2 bg-indigo-50 rounded-md border border-indigo-100">
            <div className="text-base font-semibold text-indigo-700 leading-5">
              {formatCurrency(stats.totalValue)}
            </div>
            <div className="text-[11px] text-indigo-700/90">Valeur totale</div>
          </div>
        </div>
      </div>

      {/* Erreur (si besoin) */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">
          <strong>Erreur : </strong>{error}
        </div>
      )}

      {/* Tabs compacts */}
      <div className="bg-white rounded-md shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-6 px-4">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-1.5
                    ${active ? 'border-blue-500 text-blue-600' :
                    'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4">
          {/* LISTE DES BAs */}
          {activeTab === 'list' && (
            <div className="space-y-4">
              {/* Recherche + filtre — compact */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Rechercher par numéro de BA, client ou soumission…"
                    className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  <option value="all">Tous les statuts</option>
                  <option value="draft">Brouillons</option>
                  <option value="approved">Approuvés</option>
                  <option value="partially_delivered">Partiellement livrés</option>
                  <option value="delivered">Livrés</option>
                </select>
              </div>

              {/* Liste — cartes compactes */}
              <div className="space-y-2">
                {filteredPOs.length === 0 ? (
                  <div className="text-center py-10">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="text-base font-medium text-gray-900 mb-2">Aucun bon d'achat trouvé</h3>
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 text-sm"
                    >
                      Créer le premier bon d'achat
                    </button>
                  </div>
                ) : (
                  filteredPOs.map((po) => (
                    <div key={po.id} className="bg-gray-50 rounded-md p-3 hover:bg-gray-100 transition-colors">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <div className="text-base font-semibold text-gray-900">BA #{po.po_number}</div>
                          <span className={`inline-flex px-1.5 py-0.5 text-[11px] font-medium rounded-full ${getStatusColor(po.status)}`}>
                            {getStatusEmoji(po.status)} {formatStatus(po.status)}
                          </span>
                        </div>
                        <button
                          onClick={() => handleEditPO(po)}
                          className="bg-blue-600 text-white px-2.5 py-1 rounded text-xs hover:bg-blue-700"
                        >
                          Gérer
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div>
                          <div className="text-gray-500 text-xs">Client</div>
                          <div className="text-gray-900">{po.client_name || 'N/A'}</div>
                        </div>
                        <div>
                          <div className="text-gray-500 text-xs">Date</div>
                          <div className="text-gray-900">{formatDate(po.date)}</div>
                        </div>
                        <div>
                          <div className="text-gray-500 text-xs">Montant</div>
                          <div className="text-gray-900 font-medium">
                            {formatCurrency(po.amount)}
                          </div>
                        </div>
                      </div>

                      {po.submission_no && (
                        <div className="mt-1 text-xs text-gray-600">
                          Soumission : #{po.submission_no}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Onglet Dashboard si tu l'actives
          {activeTab === 'dashboard' && <DeliveryDashboard />} */}
        </div>
      </div>

      {/* Modal (inchangé) */}
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
// components/PurchaseOrderManager.js — VERSION COMPACTE (styles Tailwind seulement)
import React, { useState, useEffect } from 'react';
import { Search, Plus, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Vos composants/utilitaires existants
import PurchaseOrderModal from './PurchaseOrderModal';
// import DeliveryDashboard from './DeliveryDashboard';
import { formatCurrency, formatDate, getStatusEmoji } from './PurchaseOrder/utils/formatting';

const PurchaseOrderManager = () => {
  // --- États (inchangés) ---
  const [activeTab, setActiveTab] = useState('list');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null);

  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [filteredPOs, setFilteredPOs] = useState([]);

  // --- Fetch (inchangé) ---
  const fetchPurchaseOrders = async () => {
    try {
      setIsLoading(true);
      setError('');
      const { data, error: fetchError } = await supabase
        .from('purchase_orders')
        .select('*')
        .order('created_at', { ascending: false });
      if (fetchError) throw new Error(`Erreur chargement BAs: ${fetchError.message}`);
      setPurchaseOrders(data || []);
      console.log(`✅ ${data?.length || 0} bons d'achat chargés`);
    } catch (err) {
      console.error('Erreur fetchPurchaseOrders:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Filtres (inchangé) ---
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

  useEffect(() => { fetchPurchaseOrders(); }, []);

  const handleEditPO = (po) => {
    setSelectedPO(po);
    setShowCreateModal(true);
  };
  const handleModalClose = () => {
    setShowCreateModal(false);
    setSelectedPO(null);
    fetchPurchaseOrders();
  };

  const tabs = [
    { id: 'list', label: "Bons d'Achat", icon: FileText },
    // { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  ];

  // --- Stats (inchangé) ---
  const stats = {
    total: filteredPOs.length,
    draft: filteredPOs.filter(po => po.status === 'draft').length,
    approved: filteredPOs.filter(po => po.status === 'approved').length,
    delivered: filteredPOs.filter(po => po.status === 'delivered').length,
    partial: filteredPOs.filter(po => po.status === 'partially_delivered').length,
    totalValue: filteredPOs.reduce((sum, po) => sum + (parseFloat(po.total_amount) || 0), 0)
  };

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

  const getStatusColor = (status) => {
    const statusColors = {
      draft: 'bg-gray-100 text-gray-800 ring-1 ring-gray-200',
      pending: 'bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200',
      approved: 'bg-green-100 text-green-800 ring-1 ring-green-200',
      partially_delivered: 'bg-blue-100 text-blue-800 ring-1 ring-blue-200',
      delivered: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200',
      cancelled: 'bg-red-100 text-red-800 ring-1 ring-red-200'
    };
    return statusColors[status] || 'bg-gray-100 text-gray-800 ring-1 ring-gray-200';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-72">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" />
          <p className="text-gray-600 text-sm">Chargement des bons d'achat…</p>
        </div>
      </div>
    );
  }

  // ========================= UI COMPACT =========================
  return (
    <div className="space-y-4">
      {/* Header + stats COMPACt */}
      <div className="bg-white rounded-md shadow-sm border border-gray-200 p-4">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-600" />
            <h1 className="text-lg font-semibold text-gray-900">
              Gestion des Bons d'Achat Client
            </h1>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 text-sm inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Nouveau BA
          </button>
        </div>
        <p className="text-gray-500 text-xs">
          Module de gestion des bons d'achat et livraisons partielles
        </p>

        {/* Stats compactes */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mt-3">
          <div className="text-center p-2 bg-gray-50 rounded-md border border-gray-200">
            <div className="text-base font-semibold text-gray-900 leading-5">{stats.total}</div>
            <div className="text-[11px] text-gray-600">Total BAs</div>
          </div>
          <div className="text-center p-2 bg-gray-50 rounded-md border border-gray-200">
            <div className="text-base font-semibold text-gray-700 leading-5">{stats.draft}</div>
            <div className="text-[11px] text-gray-600">Brouillons</div>
          </div>
          <div className="text-center p-2 bg-green-50 rounded-md border border-green-100">
            <div className="text-base font-semibold text-green-700 leading-5">{stats.approved}</div>
            <div className="text-[11px] text-green-700/90">Approuvés</div>
          </div>
          <div className="text-center p-2 bg-blue-50 rounded-md border border-blue-100">
            <div className="text-base font-semibold text-blue-700 leading-5">{stats.partial}</div>
            <div className="text-[11px] text-blue-700/90">Partiels</div>
          </div>
          <div className="text-center p-2 bg-emerald-50 rounded-md border border-emerald-100">
            <div className="text-base font-semibold text-emerald-700 leading-5">{stats.delivered}</div>
            <div className="text-[11px] text-emerald-700/90">Livrés</div>
          </div>
          <div className="text-center p-2 bg-indigo-50 rounded-md border border-indigo-100">
            <div className="text-base font-semibold text-indigo-700 leading-5">
              {formatCurrency(stats.totalValue)}
            </div>
            <div className="text-[11px] text-indigo-700/90">Valeur totale</div>
          </div>
        </div>
      </div>

      {/* Erreur (si besoin) */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">
          <strong>Erreur : </strong>{error}
        </div>
      )}

      {/* Tabs compacts */}
      <div className="bg-white rounded-md shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-6 px-4">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-1.5
                    ${active ? 'border-blue-500 text-blue-600' :
                    'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4">
          {/* LISTE DES BAs */}
          {activeTab === 'list' && (
            <div className="space-y-4">
              {/* Recherche + filtre — compact */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Rechercher par numéro de BA, client ou soumission…"
                    className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  <option value="all">Tous les statuts</option>
                  <option value="draft">Brouillons</option>
                  <option value="approved">Approuvés</option>
                  <option value="partially_delivered">Partiellement livrés</option>
                  <option value="delivered">Livrés</option>
                </select>
              </div>

              {/* Liste — cartes compactes */}
              <div className="space-y-2">
                {filteredPOs.length === 0 ? (
                  <div className="text-center py-10">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="text-base font-medium text-gray-900 mb-2">Aucun bon d'achat trouvé</h3>
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 text-sm"
                    >
                      Créer le premier bon d'achat
                    </button>
                  </div>
                ) : (
                  filteredPOs.map((po) => (
                    <div key={po.id} className="bg-gray-50 rounded-md p-3 hover:bg-gray-100 transition-colors">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <div className="text-base font-semibold text-gray-900">BA #{po.po_number}</div>
                          <span className={`inline-flex px-1.5 py-0.5 text-[11px] font-medium rounded-full ${getStatusColor(po.status)}`}>
                            {getStatusEmoji(po.status)} {formatStatus(po.status)}
                          </span>
                        </div>
                        <button
                          onClick={() => handleEditPO(po)}
                          className="bg-blue-600 text-white px-2.5 py-1 rounded text-xs hover:bg-blue-700"
                        >
                          Gérer
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div>
                          <div className="text-gray-500 text-xs">Client</div>
                          <div className="text-gray-900">{po.client_name || 'N/A'}</div>
                        </div>
                        <div>
                          <div className="text-gray-500 text-xs">Date</div>
                          <div className="text-gray-900">{formatDate(po.date)}</div>
                        </div>
                        <div>
                          <div className="text-gray-500 text-xs">Montant</div>
                          <div className="text-gray-900 font-medium">
                            {formatCurrency(po.amount)}
                          </div>
                        </div>
                      </div>

                      {po.submission_no && (
                        <div className="mt-1 text-xs text-gray-600">
                          Soumission : #{po.submission_no}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Onglet Dashboard si tu l'actives
          {activeTab === 'dashboard' && <DeliveryDashboard />} */}
        </div>
      </div>

      {/* Modal (inchangé) */}
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
