'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Package, Clock, CheckCircle, AlertTriangle, Eye, Truck, Calendar, Filter } from 'lucide-react';

const DeliveryDashboard = () => {
  const [dashboardData, setDashboardData] = useState([]);
  const [selectedBA, setSelectedBA] = useState(null);
  const [baDetails, setBaDetails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('');

  // Charger les données du dashboard
  const fetchDashboardData = async () => {
    try {
      const { data, error } = await supabase
        .from('ba_status_dashboard')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erreur chargement dashboard:', error);
        return;
      }

      console.log('Dashboard data loaded:', data);
      setDashboardData(data || []);
    } catch (error) {
      console.error('Erreur dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  // Charger les détails d'un BA
  const fetchBADetails = async (baId) => {
    if (!baId) return;
    
    setDetailsLoading(true);
    try {
      // Utiliser la fonction SQL get_ba_items()
      const { data, error } = await supabase
        .rpc('get_ba_items', { ba_id: baId });

      if (error) {
        console.error('Erreur détails BA:', error);
        return;
      }

      console.log('BA details loaded:', data);
      setBaDetails(data || []);
    } catch (error) {
      console.error('Erreur détails:', error);
    } finally {
      setDetailsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (selectedBA) {
      fetchBADetails(selectedBA.id);
    }
  }, [selectedBA]);

  // Filtrer les données
  const filteredData = dashboardData.filter(ba => {
    const statusMatch = statusFilter === 'all' || ba.ba_status.toLowerCase() === statusFilter;
    const clientMatch = !clientFilter || 
      ba.client_name.toLowerCase().includes(clientFilter.toLowerCase()) ||
      ba.po_number.toLowerCase().includes(clientFilter.toLowerCase());
    
    return statusMatch && clientMatch;
  });

  // Statistiques générales
const stats = {
  total: dashboardData.length,
  brouillon: dashboardData.filter(ba => ba.ba_status === 'Brouillon').length,
  enCommande: dashboardData.filter(ba => ba.ba_status === 'En commande').length,
  commande: dashboardData.filter(ba => ba.ba_status === 'Commandé').length,
  recu: dashboardData.filter(ba => ba.ba_status === 'Reçu').length
};

    const getStatusColor = (status) => {
  switch (status) {
    case 'Reçu':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'Commandé':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'En commande':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'Brouillon':
      return 'bg-gray-100 text-gray-800 border-gray-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

  const getStatusIcon = (status) => {
  switch (status) {
    case 'Reçu':
      return <CheckCircle className="w-4 h-4" />;
    case 'Commandé':
      return <Truck className="w-4 h-4" />;
    case 'En commande':
      return <AlertTriangle className="w-4 h-4" />;
    case 'Brouillon':
      return <Clock className="w-4 h-4" />;
    default:
      return <Package className="w-4 h-4" />;
  }
};

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('fr-CA');
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="ml-4 text-blue-600 font-medium">Chargement du dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl shadow-lg p-6 text-white">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Dashboard Livraisons</h1>
            <p className="text-blue-100 mt-1">
              Suivi en temps réel des bons d'achat et livraisons
            </p>
          </div>
          <button
            onClick={fetchDashboardData}
            className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors"
          >
            Actualiser
          </button>
        </div>
      </div>

      {/* Statistiques générales */}
<div className="grid grid-cols-1 md:grid-cols-5 gap-3">
  <div className="bg-white rounded-lg shadow-lg p-4 border border-gray-200">
    <div className="flex items-center">
      <Clock className="w-6 h-6 text-gray-600 mr-2" />
      <div>
        <p className="text-xs font-medium text-gray-600">Brouillons</p>
        <p className="text-xl font-bold text-gray-700">{stats.brouillon}</p>
      </div>
    </div>
  </div>

  <div className="bg-white rounded-lg shadow-lg p-4 border border-yellow-200">
    <div className="flex items-center">
      <AlertTriangle className="w-6 h-6 text-yellow-600 mr-2" />
      <div>
        <p className="text-xs font-medium text-yellow-600">En commande</p>
        <p className="text-xl font-bold text-yellow-700">{stats.enCommande}</p>
      </div>
    </div>
  </div>

  <div className="bg-white rounded-lg shadow-lg p-4 border border-blue-200">
    <div className="flex items-center">
      <Truck className="w-6 h-6 text-blue-600 mr-2" />
      <div>
        <p className="text-xs font-medium text-blue-600">Commandés</p>
        <p className="text-xl font-bold text-blue-700">{stats.commande}</p>
      </div>
    </div>
  </div>

  <div className="bg-white rounded-lg shadow-lg p-4 border border-green-200">
    <div className="flex items-center">
      <CheckCircle className="w-6 h-6 text-green-600 mr-2" />
      <div>
        <p className="text-xs font-medium text-green-600">Reçus</p>
        <p className="text-xl font-bold text-green-700">{stats.recu}</p>
      </div>
    </div>
  </div>

  <div className="bg-white rounded-lg shadow-lg p-4 border border-purple-200">
    <div className="flex items-center">
      <Package className="w-6 h-6 text-purple-600 mr-2" />
      <div>
        <p className="text-xs font-medium text-purple-600">Total</p>
        <p className="text-xl font-bold text-purple-700">
          ${dashboardData.reduce((sum, ba) => sum + (ba.total_amount || 0), 0).toLocaleString()}
        </p>
      </div>
    </div>
  </div>
</div>

      {/* Filtres */}
      <div className="bg-white rounded-lg shadow-lg p-4 border border-gray-200">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Rechercher par client ou numéro BA..."
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                className="block w-full pl-10 pr-4 py-2 rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </div>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 px-4"
          >
            <option value="all">Tous les statuts</option>
            <option value="brouillon">Brouillon</option>
            <option value="en commande">En commande</option>
            <option value="commandé">Commandé</option>
            <option value="reçu">Reçu</option>
          </select>
        </div>
      </div>

      {/* Layout principal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Liste des BAs */}
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b">
            <h2 className="text-xl font-bold text-gray-900">
              Bons d'Achat ({filteredData.length})
            </h2>
          </div>
          
          <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
            {filteredData.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Package className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p>Aucun bon d'achat trouvé</p>
              </div>
            ) : (
              filteredData.map((ba) => (
                <div
                  key={ba.id}
                  className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                    selectedBA?.id === ba.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                  }`}
                  onClick={() => setSelectedBA(ba)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-semibold text-gray-900">
                          BA {ba.po_number}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(ba.ba_status)}`}>
                          <div className="flex items-center gap-1">
                            {getStatusIcon(ba.ba_status)}
                            {ba.ba_status}
                          </div>
                        </span>
                      </div>
                      
                      <p className="text-sm text-gray-600 mb-1">{ba.client_name}</p>
                      
                      {ba.submission_no && (
                        <p className="text-xs text-blue-600">Soumission: {ba.submission_no}</p>
                      )}
                      
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          {ba.total_items} articles
                        </span>
                        
                        {ba.items_partial > 0 && (
                          <span className="text-yellow-600">
                            {ba.items_partial} partiel(s)
                          </span>
                        )}
                        
                        {ba.items_complete > 0 && (
                          <span className="text-green-600">
                            {ba.items_complete} complet(s)
                          </span>
                        )}
                        
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(ba.created_at)}
                        </span>
                      </div>
                    </div>
                    
                    <Eye className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Détails du BA sélectionné */}
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b">
            <h2 className="text-xl font-bold text-gray-900">
              {selectedBA ? `Détails BA ${selectedBA.po_number}` : 'Sélectionnez un BA'}
            </h2>
          </div>
          
          <div className="p-6">
            {!selectedBA ? (
              <div className="text-center py-12 text-gray-500">
                <Eye className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p>Sélectionnez un bon d'achat pour voir les détails</p>
              </div>
            ) : detailsLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-3 text-gray-600">Chargement des détails...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Info du BA */}
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <h3 className="font-semibold text-blue-800 mb-2">Informations générales</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-blue-600 font-medium">Client:</span>
                      <p className="text-blue-800">{selectedBA.client_name}</p>
                    </div>
                    <div>
                      <span className="text-blue-600 font-medium">Statut:</span>
                      <p className="text-blue-800">{selectedBA.ba_status}</p>
                    </div>
                    <div>
                      <span className="text-blue-600 font-medium">Total articles:</span>
                      <p className="text-blue-800">{selectedBA.total_items}</p>
                    </div>
                    <div>
                      <span className="text-blue-600 font-medium">Date création:</span>
                      <p className="text-blue-800">{formatDate(selectedBA.created_at)}</p>
                    </div>
                  </div>
                </div>

                {/* Articles détaillés */}
                <div>
                  <h3 className="font-semibold text-gray-800 mb-3">Articles du bon d'achat</h3>
                  
                  {baDetails.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">Aucun article trouvé</p>
                  ) : (
                    <div className="space-y-2">
                      {baDetails.map((item, index) => (
                        <div
                          key={index}
                          className={`border rounded-lg p-3 ${
                            item.item_status === 'Complet' ? 'bg-green-50 border-green-200' :
                            item.item_status === 'Partiel' ? 'bg-yellow-50 border-yellow-200' :
                            'bg-red-50 border-red-200'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <p className="font-medium text-gray-900">{item.product_id}</p>
                              <p className="text-sm text-gray-600">{item.description}</p>
                            </div>
                            
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              item.item_status === 'Complet' ? 'bg-green-100 text-green-800' :
                              item.item_status === 'Partiel' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {item.item_status}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">Commandé:</span>
                              <p className="font-medium">{item.ordered_qty} {item.unit}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Livré:</span>
                              <p className="font-medium text-blue-600">{item.delivered_qty}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Restant:</span>
                              <p className={`font-medium ${
                                item.remaining_qty > 0 ? 'text-orange-600' : 'text-green-600'
                              }`}>
                                {item.remaining_qty}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeliveryDashboard;
