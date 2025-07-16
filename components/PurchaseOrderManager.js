'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '../lib/supabase';
import ClientModal from './ClientModal';
import {
  Plus, Save, Calendar, FileText, DollarSign, Clock,
  CheckCircle, XCircle, Users, History, Search, X, Edit2,
  Upload, Download, Paperclip, Trash, Mail, Eye
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
  const [editingOrderId, setEditingOrderId] = useState(null);
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

  // États pour upload de fichiers
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [showFileViewer, setShowFileViewer] = useState(false);
  const [currentFiles, setCurrentFiles] = useState([]);
  const fileUploadRef = useRef(null);

  // États pour email
  const [sendingEmail, setSendingEmail] = useState(false);

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
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('❌ Erreur chargement bons d\'achat:', error);
        setPurchaseOrders([]);
        return;
      }
      
      console.log('✅ Bons d\'achat chargés:', data?.length || 0);
      
      if (data && data.length > 0) {
        // Enrichir avec les infos clients
        const clientIds = [...new Set(data.map(order => order.client_id).filter(Boolean))];
        
        if (clientIds.length > 0) {
          const { data: clientsData } = await supabase
            .from('clients')
            .select('id, name, company')
            .in('id', clientIds);
          
          const enrichedOrders = data.map(order => ({
            ...order,
            clients: clientsData?.find(client => parseInt(client.id) === parseInt(order.client_id)) || null
          }));
          
          setPurchaseOrders(enrichedOrders);
        } else {
          setPurchaseOrders(data);
        }
      } else {
        setPurchaseOrders([]);
      }
      
    } catch (error) {
      console.error('❌ Exception loadPurchaseOrders:', error);
      setPurchaseOrders([]);
    }
  }

  // Gestion du formulaire
  function handleClientSelection(clientId) {
    if (!clientId) {
      setSelectedClient(null);
      return;
    }
    
    const client = clients.find(c => parseInt(c.id) === parseInt(clientId));
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
    
    if (quote.clients) {
      const client = clients.find(c => c.id === quote.client_id);
      if (client) {
        setSelectedClient(client);
      }
    }
    
    setShowQuoteSearch(false);
    setQuoteSearchTerm('');
  }

  // Upload de fichiers
  async function handleFileUpload(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setUploading(true);
    try {
      const uploadPromises = files.map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `purchase-orders/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, file);

        if (uploadError) {
          console.error('Erreur upload:', uploadError);
          return null;
        }

        // Obtenir l'URL publique
        const { data } = supabase.storage
          .from('documents')
          .getPublicUrl(filePath);

        return {
          name: file.name,
          path: filePath,
          url: data.publicUrl,
          size: file.size,
          type: file.type
        };
      });

      const results = await Promise.all(uploadPromises);
      const successfulUploads = results.filter(Boolean);

      setUploadedFiles(prev => [...prev, ...successfulUploads]);
      alert(`${successfulUploads.length} fichier(s) uploadé(s) avec succès !`);

    } catch (error) {
      console.error('Erreur upload:', error);
      alert('Erreur lors de l\'upload: ' + error.message);
    } finally {
      setUploading(false);
    }
  }

  function removeFile(index) {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  }

  // Charger un bon d'achat pour modification
  async function editPurchaseOrder(order) {
    try {
      setEditingOrderId(order.id);
      setFormData({
        date: order.date,
        client_po: order.client_po || '',
        submission_no: order.submission_no || '',
        amount: order.amount?.toString() || '',
        status: order.status || 'en_attente'
      });
      
      // Sélectionner le client
      if (order.client_id) {
        const client = clients.find(c => parseInt(c.id) === parseInt(order.client_id));
        setSelectedClient(client || null);
      }

      // Charger les fichiers associés
      if (order.files_data) {
        try {
          const files = JSON.parse(order.files_data);
          setUploadedFiles(files || []);
        } catch (e) {
          console.error('Erreur parsing files_data:', e);
          setUploadedFiles([]);
        }
      }

      setShowNewOrderForm(true);
      console.log('✏️ Bon d\'achat chargé pour modification:', order.id);
    } catch (error) {
      console.error('Erreur editPurchaseOrder:', error);
      alert('Erreur: ' + error.message);
    }
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
    setEditingOrderId(null);
    setUploadedFiles([]);
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

      const orderData = {
        date: formData.date,
        client_id: parseInt(selectedClient.id),
        client_name: selectedClient.name,
        client_po: formData.client_po || '',
        submission_no: formData.submission_no || '',
        amount: parseFloat(formData.amount),
        status: formData.status || 'en_attente',
        files_data: JSON.stringify(uploadedFiles)
      };

      if (editingOrderId) {
        // Modification
        const { error } = await supabase
          .from('purchase_orders')
          .update(orderData)
          .eq('id', editingOrderId);

        if (error) {
          console.error('❌ Erreur modification:', error);
          alert('Erreur modification: ' + error.message);
          return;
        }

        alert('Bon d\'achat modifié avec succès !');
      } else {
        // Création
        const { error } = await supabase
          .from('purchase_orders')
          .insert(orderData);

        if (error) {
          console.error('❌ Erreur création:', error);
          alert('Erreur création: ' + error.message);
          return;
        }

        alert('Bon d\'achat créé avec succès !');
      }

      await loadPurchaseOrders();
      resetForm();
      
    } catch (error) {
      console.error('❌ Exception savePurchaseOrder:', error);
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

  // Voir les fichiers d'un bon d'achat
  function viewOrderFiles(order) {
    try {
      const files = order.files_data ? JSON.parse(order.files_data) : [];
      setCurrentFiles(files);
      setShowFileViewer(true);
    } catch (e) {
      console.error('Erreur parsing files:', e);
      setCurrentFiles([]);
      setShowFileViewer(true);
    }
  }

  // Envoyer rapport par email
  async function sendEmailReport() {
    setSendingEmail(true);
    try {
      const response = await fetch('/api/send-weekly-report', {
        method: 'GET'
      });

      const result = await response.json();

      if (response.ok) {
        alert(`Rapport envoyé avec succès ! ${result.message || ''}`);
      } else {
        alert('Erreur envoi email: ' + result.error);
      }
    } catch (error) {
      console.error('Erreur envoi email:', error);
      alert('Erreur technique: ' + error.message);
    } finally {
      setSendingEmail(false);
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
                onClick={sendEmailReport}
                disabled={sendingEmail}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center disabled:opacity-50"
              >
                <Mail className="w-4 h-4 mr-2" />
                {sendingEmail ? 'Envoi...' : 'Email Rapport'}
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fichiers</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {purchaseOrders.map(order => {
                  const statusConfig = getStatusConfig(order.status);
                  const StatusIcon = statusConfig.icon;
                  const hasFiles = order.files_data && order.files_data !== '[]';
                  
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {hasFiles ? (
                          <button
                            onClick={() => viewOrderFiles(order)}
                            className="text-blue-600 hover:text-blue-800 flex items-center"
                          >
                            <Paperclip className="w-4 h-4 mr-1" />
                            Fichiers
                          </button>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.color}`}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex gap-1">
                          <button
                            onClick={() => editPurchaseOrder(order)}
                            className="text-blue-600 hover:text-blue-800"
                            title="Modifier"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
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
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
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

      {/* Modal - Nouveau/Modifier Bon d'Achat */}
      {showNewOrderForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white w-full max-w-4xl rounded-lg p-6 relative shadow-xl max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => resetForm()}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold mb-6">
              {editingOrderId ? `Modifier Bon d'Achat #${editingOrderId}` : 'Nouveau Bon d\'Achat'}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Colonne gauche - Informations */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-2">Informations</h3>
                
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
                      placeholder="Ex: 2507-01 ou saisie manuelle"
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

              {/* Colonne droite - Upload de fichiers */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-2">Documents & Fichiers</h3>
                
                {/* Zone d'upload */}
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <input
                    ref={fileUploadRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Upload className="mx-auto w-12 h-12 text-gray-400 mb-4" />
                  <p className="text-gray-600 mb-2">Glissez vos fichiers ici ou</p>
                  <button
                    onClick={() => fileUploadRef.current?.click()}
                    disabled={uploading}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50"
                  >
                    {uploading ? 'Upload...' : 'Sélectionner des fichiers'}
                  </button>
                  <p className="text-xs text-gray-500 mt-2">
                    PDF, DOC, XLS, images (max 10MB par fichier)
                  </p>
                </div>

                {/* Liste des fichiers uploadés */}
                {uploadedFiles.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-gray-900">Fichiers attachés:</h4>
                    {uploadedFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-50 p-3 rounded">
                        <div className="flex items-center">
                          <Paperclip className="w-4 h-4 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-900">{file.name}</span>
                          <span className="text-xs text-gray-500 ml-2">
                            ({(file.size / 1024 / 1024).toFixed(1)} MB)
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <Eye className="w-4 h-4" />
                          </a>
                          <button
                            onClick={() => removeFile(index)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6 pt-6 border-t">
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
                {editingOrderId ? 'Modifier' : 'Sauvegarder'}
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

            <div className="mb-4">
              <input
                type="text"
                value={quoteSearchTerm}
                onChange={e => handleQuoteSearch(e.target.value)}
                placeholder="Rechercher par numéro ou client..."
                className="w-full border border-gray-300 px-3 py-2 rounded focus:ring-2 focus:ring-blue-500"
              />
            </div>

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

      {/* Modal - Visionneuse de fichiers */}
      {showFileViewer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white w-full max-w-2xl rounded-lg p-6 relative shadow-xl max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowFileViewer(false)}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold mb-4">Fichiers attachés</h2>

            {currentFiles.length > 0 ? (
              <div className="space-y-3">
                {currentFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between bg-gray-50 p-4 rounded">
                    <div className="flex items-center">
                      <Paperclip className="w-5 h-5 text-gray-400 mr-3" />
                      <div>
                        <p className="font-medium text-gray-900">{file.name}</p>
                        <p className="text-sm text-gray-500">
                          {(file.size / 1024 / 1024).toFixed(1)} MB
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm flex items-center"
                      >
                        <Download className="w-4 h-4 mr-1" />
                        Télécharger
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">Aucun fichier attaché</p>
            )}
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
