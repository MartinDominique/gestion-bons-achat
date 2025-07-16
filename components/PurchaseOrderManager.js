'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '../lib/supabase';
import ClientModal from './ClientModal';
import {
  Plus, Save, Calendar, FileText, DollarSign, Clock,
  CheckCircle, XCircle, Users, History, Search, X
} from 'lucide-react';

export default function PurchaseOrderManager() {
  const supabase = createClient();
  const [user, setUser] = useState(null);
  const [clients, setClients] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // États pour le formulaire de nouveau bon d'achat
  const [showNewOrderForm, setShowNewOrderForm] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().slice(0, 10),
    client_po: '',
    submission_no: '',
    amount: '',
    status: 'en_attente'
  });

  // États pour gestion des clients et recherche de soumissions
  const [showClientModal, setShowClientModal] = useState(false);
  const [showQuoteSearch, setShowQuoteSearch] = useState(false);
  const [quoteSearchTerm, setQuoteSearchTerm] = useState('');
  const [filteredQuotes, setFilteredQuotes] = useState([]);

  // Chargement initial
  useEffect(() => {
    const initializeData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.error('Utilisateur non connecté');
          return;
        }
        setUser(user);

        await Promise.all([
          loadClients(),
          loadQuotes(),
          loadPurchaseOrders()
        ]);
      } catch (error) {
        console.error('Erreur initialisation:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeData();
  }, []);

  async function loadClients() {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name');
      
      if (error) {
        console.error('Erreur chargement clients:', error);
        return;
      }
      
      setClients(data || []);
    } catch (error) {
      console.error('Erreur loadClients:', error);
    }
  }

  async function loadQuotes() {
    try {
      const { data, error } = await supabase
        .from('quotes')
        .select(`
          *,
          clients (name, company)
        `)
        .eq('status', 'draft')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Erreur chargement soumissions:', error);
        return;
      }
      
      setQuotes(data || []);
      setFilteredQuotes(data || []);
    } catch (error) {
      console.error('Erreur loadQuotes:', error);
    }
  }

  async function loadPurchaseOrders() {
    try {
      console.log('📋 Chargement des bons d\'achat...');
      
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          clients!client_id (
            id,
            name, 
            company
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('❌ Erreur chargement bons d\'achat:', error);
        // Essayer sans la jointure si ça pose problème
        const { data: dataSimple, error: errorSimple } = await supabase
          .from('purchase_orders')
          .select('*')
          .order('created_at', { ascending: false });
          
        if (errorSimple) {
          console.error('❌ Erreur même en simple:', errorSimple);
          return;
        }
        
        console.log('✅ Chargement simple réussi:', dataSimple?.length || 0, 'bons d\'achat');
        setPurchaseOrders(dataSimple || []);
        return;
      }
      
      console.log('✅ Chargement avec jointure réussi:', data?.length || 0, 'bons d\'achat');
      setPurchaseOrders(data || []);
    } catch (error) {
      console.error('❌ Exception loadPurchaseOrders:', error);
    }
  }

  // Gestion du formulaire
  function handleClientSelection(clientId) {
    if (!clientId) {
      setSelectedClient(null);
      return;
    }
    
    const client = clients.find(c => String(c.id) === String(clientId));
    setSelectedClient(client || null);
  }

  function handleQuoteSearch(searchTerm) {
    setQuoteSearchTerm(searchTerm);
    if (!searchTerm) {
      setFilteredQuotes(quotes);
      return;
    }
    
    const filtered = quotes.filter(q => 
      q.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.clients?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.clients?.company?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredQuotes(filtered);
  }

  function selectQuote(quote) {
    setSelectedQuote(quote);
    setFormData(prev => ({
      ...prev,
      submission_no: quote.id,
      amount: quote.total.toFixed(2)
    }));
    
    // Sélectionner automatiquement le client de la soumission
    if (quote.clients) {
      const client = clients.find(c => c.id === quote.client_id);
      if (client) {
        setSelectedClient(client);
      }
    }
    
    setShowQuoteSearch(false);
    setQuoteSearchTerm('');
  }

  function resetForm() {
    setFormData({
      date: new Date().toISOString().slice(0, 10),
      client_po: '',
      submission_no: '',
      amount: '',
      status: 'en_attente'
    });
    setSelectedClient(null);
    setSelectedQuote(null);
    setShowNewOrderForm(false);
  }

  async function savePurchaseOrder() {
    if (!selectedClient) {
      alert('Veuillez sélectionner un client');
      return;
    }
    
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      alert('Veuillez saisir un montant valide');
      return;
    }

    try {
      console.log('🔐 Vérification de l\'authentification...');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Vous devez être connecté pour sauvegarder');
        return;
      }
      console.log('✅ Utilisateur connecté:', user.email);

      // Adapté à ta structure réelle
      const orderData = {
        date: formData.date,
        client_id: selectedClient.id,
        client_name: selectedClient.name,
        client_po: formData.client_po || '',
        submission_no: formData.submission_no || '',
        amount: parseFloat(formData.amount),
        status: formData.status || 'en_attente'
      };

      console.log('💾 Données à sauvegarder:', orderData);
      console.log('👤 Client sélectionné:', selectedClient);

      const { data, error } = await supabase
        .from('purchase_orders')
        .insert(orderData)
        .select();

      if (error) {
        console.error('❌ Erreur Supabase détaillée:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        
        // Messages d'erreur plus clairs
        if (error.message.includes('client_id')) {
          alert('Erreur: Problème avec l\'ID du client. Vérifiez que le client existe.');
        } else if (error.message.includes('RLS')) {
          alert('Erreur: Problème de permissions. Contactez l\'administrateur.');
        } else if (error.message.includes('schema')) {
          alert('Erreur: Structure de base de données. Rafraîchissez la page.');
        } else {
          alert('Erreur de sauvegarde: ' + error.message);
        }
        return;
      }

      console.log('✅ Bon d\'achat sauvegardé avec succès:', data);
      alert('Bon d\'achat sauvegardé avec succès !');
      await loadPurchaseOrders();
      resetForm();
      
    } catch (error) {
      console.error('❌ Exception JavaScript:', error);
      alert('Erreur technique: ' + error.message);
    }
  }

  async function updateOrderStatus(orderId, newStatus) {
    try {
      const { error } = await supabase
        .from('purchase_orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (error) {
        console.error('Erreur mise à jour statut:', error);
        alert('Erreur: ' + error.message);
        return;
      }

      await loadPurchaseOrders();
    } catch (error) {
      console.error('Erreur updateOrderStatus:', error);
      alert('Erreur: ' + error.message);
    }
  }

  // Statistiques
  const stats = {
    total: purchaseOrders.length,
    enAttente: purchaseOrders.filter(o => o.status === 'en_attente').length,
    approuve: purchaseOrders.filter(o => o.status === 'approuve').length,
    refuse: purchaseOrders.filter(o => o.status === 'refuse').length,
    montantTotal: purchaseOrders.reduce((sum, o) => sum + parseFloat(o.amount || 0), 0)
  };

  // Fonction pour obtenir l'icône et la couleur du statut
  function getStatusConfig(status) {
    switch (status) {
      case 'approuve':
        return { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100', label: 'Approuvé' };
      case 'refuse':
        return { icon: XCircle, color: 'text-red-600', bg: 'bg-red-100', label: 'Refusé' };
      default:
        return { icon: Clock, color: 'text-orange-600', bg: 'bg-orange-100', label: 'En attente' };
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement des données...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* En-tête avec statistiques */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold flex items-center">
              <FileText className="w-8 h-8 mr-3 text-blue-600" />
              Gestion des Bons d'Achat
            </h1>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowNewOrderForm(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
              >
                <Plus className="w-5 h-5 mr-2" /> Nouveau Bon d'Achat
              </button>
              <button 
                onClick={() => { setShowClientModal(true); }}
                className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center"
              >
                <Users className="w-4 h-4 mr-1" /> Clients
              </button>
            </div>
          </div>

          {/* Statistiques */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center">
                <FileText className="w-8 h-8 text-blue-600 mr-3" />
                <div>
                  <p className="text-sm text-gray-600">Total</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center">
                <Clock className="w-8 h-8 text-orange-600 mr-3" />
                <div>
                  <p className="text-sm text-gray-600">En attente</p>
                  <p className="text-2xl font-bold text-orange-600">{stats.enAttente}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center">
                <CheckCircle className="w-8 h-8 text-green-600 mr-3" />
                <div>
                  <p className="text-sm text-gray-600">Approuvés</p>
                  <p className="text-2xl font-bold text-green-600">{stats.approuve}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center">
                <XCircle className="w-8 h-8 text-red-600 mr-3" />
                <div>
                  <p className="text-sm text-gray-600">Refusés</p>
                  <p className="text-2xl font-bold text-red-600">{stats.refuse}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center">
                <DollarSign className="w-8 h-8 text-blue-600 mr-3" />
                <div>
                  <p className="text-sm text-gray-600">Montant total</p>
                  <p className="text-lg font-bold text-blue-600">
                    ${stats.montantTotal.toLocaleString('fr-CA', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Liste des bons d'achat */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold flex items-center">
              <History className="w-5 h-5 mr-2" />
              Historique des Bons d'Achat ({purchaseOrders.length})
            </h3>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">PO Client</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">N° Soumission</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Montant</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {purchaseOrders.map(order => {
                  const statusConfig = getStatusConfig(order.status);
                  const StatusIcon = statusConfig.icon;
                  
                  return (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {new Date(order.date).toLocaleDateString('fr-CA')}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div>
                          <div className="font-medium text-gray-900">{order.client_name}</div>
                          {order.clients?.company && (
                            <div className="text-gray-500">{order.clients.company}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {order.client_po || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {order.submission_no || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        ${parseFloat(order.amount || 0).toLocaleString('fr-CA', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.color}`}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex gap-1">
                          {order.status !== 'approuve' && (
                            <button
                              onClick={() => updateOrderStatus(order.id, 'approuve')}
                              className="text-green-600 hover:text-green-800"
                              title="Approuver"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                          )}
                          {order.status !== 'refuse' && (
                            <button
                              onClick={() => updateOrderStatus(order.id, 'refuse')}
                              className="text-red-600 hover:text-red-800"
                              title="Refuser"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}
                          {order.status !== 'en_attente' && (
                            <button
                              onClick={() => updateOrderStatus(order.id, 'en_attente')}
                              className="text-orange-600 hover:text-orange-800"
                              title="Remettre en attente"
                            >
                              <Clock className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {purchaseOrders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      <FileText className="mx-auto w-12 h-12 text-gray-400 mb-4" />
                      <p>Aucun bon d'achat trouvé</p>
                      <p className="text-sm mt-2">Créez votre premier bon d'achat en cliquant sur "Nouveau Bon d'Achat"</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Modal - Nouveau Bon d'Achat */}
      {showNewOrderForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white w-full max-w-2xl rounded-lg p-6 relative shadow-xl max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => resetForm()}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold mb-6">Nouveau Bon d'Achat</h2>

            <div className="space-y-4">
              {/* Date */}
              <div>
                <label className="block text-sm font-medium mb-1">Date *</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full border border-gray-300 px-3 py-2 rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Client */}
              <div>
                <label className="block text-sm font-medium mb-1">Client *</label>
                <select
                  value={selectedClient?.id || ''}
                  onChange={(e) => handleClientSelection(e.target.value)}
                  className="w-full border border-gray-300 px-3 py-2 rounded focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Sélectionner un client --</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.company ? `${c.name} (${c.company})` : c.name}
                    </option>
                  ))}
                </select>
                {selectedClient && (
                  <p className="text-sm text-green-600 mt-1">
                    ✓ Client sélectionné: {selectedClient.name}
                  </p>
                )}
              </div>

              {/* PO Client */}
              <div>
                <label className="block text-sm font-medium mb-1">Numéro PO Client</label>
                <input
                  type="text"
                  value={formData.client_po}
                  onChange={e => setFormData(prev => ({ ...prev, client_po: e.target.value }))}
                  placeholder="Ex: PO-2025-001"
                  className="w-full border border-gray-300 px-3 py-2 rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Numéro de soumission */}
              <div>
                <label className="block text-sm font-medium mb-1">Numéro de Soumission</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.submission_no}
                    onChange={e => setFormData(prev => ({ ...prev, submission_no: e.target.value }))}
                    placeholder="Ex: 20250715-1234 ou saisie manuelle"
                    className="flex-1 border border-gray-300 px-3 py-2 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => setShowQuoteSearch(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center"
                  >
                    <Search className="w-4 h-4 mr-1" />
                    Chercher
                  </button>
                </div>
                {selectedQuote && (
                  <p className="text-sm text-green-600 mt-1">
                    ✓ Soumission sélectionnée: {selectedQuote.id} - ${selectedQuote.total.toFixed(2)}
                  </p>
                )}
              </div>

              {/* Montant */}
              <div>
                <label className="block text-sm font-medium mb-1">Montant *</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.amount}
                    onChange={e => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full border border-gray-300 pl-8 pr-3 py-2 rounded focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Statut */}
              <div>
                <label className="block text-sm font-medium mb-1">Statut *</label>
                <select
                  value={formData.status}
                  onChange={e => setFormData(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full border border-gray-300 px-3 py-2 rounded focus:ring-2 focus:ring-blue-500"
                >
                  <option value="en_attente">En attente</option>
                  <option value="approuve">Approuvé</option>
                  <option value="refuse">Refusé</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => resetForm()}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={savePurchaseOrder}
                disabled={!selectedClient || !formData.amount}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded disabled:opacity-50 flex items-center justify-center"
              >
                <Save className="w-4 h-4 mr-2" />
                Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal - Recherche de Soumissions */}
      {showQuoteSearch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white w-full max-w-4xl rounded-lg p-6 relative shadow-xl max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowQuoteSearch(false)}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold mb-4">Sélectionner une Soumission</h2>

            {/* Recherche */}
            <div className="mb-4">
              <input
                type="text"
                value={quoteSearchTerm}
                onChange={e => handleQuoteSearch(e.target.value)}
                placeholder="Rechercher par numéro ou client..."
                className="w-full border border-gray-300 px-3 py-2 rounded focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Liste des soumissions */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Numéro</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredQuotes.map(quote => (
                    <tr key={quote.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 text-sm font-medium">{quote.id}</td>
                      <td className="px-4 py-4 text-sm">
                        {new Date(quote.created_at).toLocaleDateString('fr-CA')}
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <div>
                          <div className="font-medium">{quote.clients?.name}</div>
                          {quote.clients?.company && (
                            <div className="text-gray-500">{quote.clients.company}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm font-medium">
                        ${quote.total.toFixed(2)}
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <button
                          onClick={() => selectQuote(quote)}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
                        >
                          Sélectionner
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredQuotes.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                        Aucune soumission trouvée
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal de gestion des clients */}
      <ClientModal
        open={showClientModal}
        onClose={() => setShowClientModal(false)}
        onSaved={loadClients}
        client={null}
      />

    </div>
  );
}
