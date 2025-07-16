import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function PurchaseOrderManager() {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPO, setEditingPO] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sendingReport, setSendingReport] = useState(false);
  
  // Form state avec le bon ordre
  const [formData, setFormData] = useState({
    client: '',
    po_number: '',
    description: '',
    amount: '',
    status: 'pending',
    files: []
  });

  useEffect(() => {
    fetchPurchaseOrders();
  }, []);

  const fetchPurchaseOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erreur Supabase:', error);
        throw error;
      }
      console.log('Données récupérées:', data);
      setPurchaseOrders(data || []);
    } catch (error) {
      console.error('Erreur lors du chargement des bons d\'achat:', error);
      alert('Erreur lors du chargement: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendReport = async () => {
    setSendingReport(true);
    try {
      const response = await fetch('/api/send-weekly-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        alert('📧 Rapport envoyé avec succès !');
      } else {
        const errorData = await response.text();
        console.error('Erreur:', errorData);
        alert('❌ Erreur lors de l\'envoi du rapport');
      }
    } catch (error) {
      console.error('Erreur lors de l\'envoi:', error);
      alert('❌ Erreur lors de l\'envoi du rapport');
    } finally {
      setSendingReport(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.client || !formData.po_number || !formData.amount) {
      alert('⚠️ Veuillez remplir tous les champs obligatoires');
      return;
    }

    try {
      const dataToSave = {
        client: formData.client,
        po_number: formData.po_number,
        vendor: formData.client, // Pour compatibilité avec l'ancien système
        description: formData.description,
        amount: parseFloat(formData.amount),
        status: formData.status
      };

      console.log('Données à sauvegarder:', dataToSave);

      if (editingPO) {
        const { data, error } = await supabase
          .from('purchase_orders')
          .update(dataToSave)
          .eq('id', editingPO.id)
          .select();

        if (error) {
          console.error('Erreur UPDATE:', error);
          throw error;
        }
        console.log('Mise à jour réussie:', data);
      } else {
        const { data, error } = await supabase
          .from('purchase_orders')
          .insert([dataToSave])
          .select();

        if (error) {
          console.error('Erreur INSERT:', error);
          throw error;
        }
        console.log('Insertion réussie:', data);
      }

      await fetchPurchaseOrders();
      setShowForm(false);
      setEditingPO(null);
      setFormData({
        client: '',
        po_number: '',
        description: '',
        amount: '',
        status: 'pending',
        files: []
      });
      
      alert('✅ Bon d\'achat sauvegardé avec succès !');
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      alert('❌ Erreur lors de la sauvegarde: ' + error.message);
    }
  };

  const handleEdit = (po) => {
    setEditingPO(po);
    setFormData({
      client: po.client || po.vendor || '',
      po_number: po.po_number || '',
      description: po.description || '',
      amount: po.amount || '',
      status: po.status || 'pending',
      files: []
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('🗑️ Êtes-vous sûr de vouloir supprimer ce bon d\'achat ?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('purchase_orders')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchPurchaseOrders();
      alert('✅ Bon d\'achat supprimé !');
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      alert('❌ Erreur lors de la suppression: ' + error.message);
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      const { error } = await supabase
        .from('purchase_orders')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;
      await fetchPurchaseOrders();
      alert(`✅ Statut mis à jour: ${newStatus === 'approved' ? 'Approuvé' : newStatus === 'rejected' ? 'Rejeté' : 'En attente'}`);
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut:', error);
      alert('❌ Erreur lors de la mise à jour du statut: ' + error.message);
    }
  };

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    setFormData({...formData, files: [...formData.files, ...files]});
  };

  const removeFile = (index) => {
    const newFiles = formData.files.filter((_, i) => i !== index);
    setFormData({...formData, files: newFiles});
  };

  const getStatusEmoji = (status) => {
    switch (status) {
      case 'approved': return '✅';
      case 'pending': return '⏳';
      case 'rejected': return '❌';
      default: return '⏳';
    }
  };

  const getStatusBadge = (status) => {
    const baseClasses = "inline-flex items-center px-3 py-1 rounded-full text-xs font-medium";
    switch (status) {
      case 'approved':
        return `${baseClasses} bg-green-100 text-green-800 border border-green-200`;
      case 'pending':
        return `${baseClasses} bg-yellow-100 text-yellow-800 border border-yellow-200`;
      case 'rejected':
        return `${baseClasses} bg-red-100 text-red-800 border border-red-200`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800 border border-gray-200`;
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('fr-CA');
  };

  const filteredPurchaseOrders = purchaseOrders.filter(po => {
    const matchesSearch = po.po_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         po.vendor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         po.client?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         po.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || po.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const totalAmount = filteredPurchaseOrders.reduce((sum, po) => sum + (po.amount || 0), 0);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        <p className="ml-4 text-indigo-600 font-medium">Chargement des bons d'achat...</p>
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="max-w-4xl mx-auto">
        {/* Formulaire avec couleurs */}
        <div className="bg-gradient-to-br from-indigo-50 via-white to-purple-50 rounded-xl shadow-lg border border-indigo-200 p-8">
          <div className="bg-indigo-600 text-white px-6 py-4 rounded-lg mb-6">
            <h2 className="text-2xl font-bold flex items-center">
              {editingPO ? '✏️ Modifier le Bon d\'Achat' : '➕ Nouveau Bon d\'Achat'}
            </h2>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Client */}
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <label className="block text-sm font-semibold text-blue-800 mb-2">
                👤 Client *
              </label>
              <input
                type="text"
                value={formData.client}
                onChange={(e) => setFormData({...formData, client: e.target.value})}
                className="block w-full rounded-lg border-blue-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-lg p-3"
                placeholder="Nom du client..."
                required
              />
            </div>

            {/* No. Bon d'Achat */}
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <label className="block text-sm font-semibold text-green-800 mb-2">
                📄 Numéro Bon d'Achat *
              </label>
              <input
                type="text"
                value={formData.po_number}
                onChange={(e) => setFormData({...formData, po_number: e.target.value})}
                className="block w-full rounded-lg border-green-300 shadow-sm focus:border-green-500 focus:ring-green-500 text-lg p-3"
                placeholder="Ex: PO-2025-001"
                required
              />
            </div>

            {/* Description */}
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
              <label className="block text-sm font-semibold text-purple-800 mb-2">
                📝 Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="block w-full rounded-lg border-purple-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-lg p-3"
                rows="3"
                placeholder="Description détaillée du bon d'achat..."
              />
            </div>

            {/* Montant */}
            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
              <label className="block text-sm font-semibold text-yellow-800 mb-2">
                💰 Montant *
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({...formData, amount: e.target.value})}
                className="block w-full rounded-lg border-yellow-300 shadow-sm focus:border-yellow-500 focus:ring-yellow-500 text-lg p-3"
                placeholder="0.00"
                required
              />
            </div>

            {/* Fichiers */}
            <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
              <label className="block text-sm font-semibold text-indigo-800 mb-2">
                📎 Fichiers (PDF, XLS, DOC, etc.)
              </label>
              <input
                type="file"
                multiple
                accept=".pdf,.xls,.xlsx,.doc,.docx,.txt"
                onChange={handleFileUpload}
                className="block w-full text-sm text-indigo-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700"
              />
              {formData.files.length > 0 && (
                <div className="mt-3 space-y-2">
                  {formData.files.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-white p-2 rounded border">
                      <span className="text-sm text-gray-700">📄 {file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="text-red-500 hover:text-red-700"
                      >
                        ❌
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Statut */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                🏷️ Statut
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({...formData, status: e.target.value})}
                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-lg p-3"
              >
                <option value="pending">⏳ En attente</option>
                <option value="approved">✅ Approuvé</option>
                <option value="rejected">❌ Rejeté</option>
              </select>
            </div>

            {/* Boutons */}
            <div className="flex justify-end space-x-4 pt-6">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingPO(null);
                  setFormData({
                    client: '',
                    po_number: '',
                    description: '',
                    amount: '',
                    status: 'pending',
                    files: []
                  });
                }}
                className="px-6 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 shadow-sm"
              >
                ❌ Annuler
              </button>
              <button
                type="submit"
                className="px-6 py-3 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                {editingPO ? '💾 Mettre à jour' : '✨ Créer'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête avec statistiques colorées */}
      <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-xl shadow-lg p-6 text-white">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold">💼 Gestion des Bons d'Achat</h2>
          <div className="flex space-x-3">
            <button
              onClick={handleSendReport}
              disabled={sendingReport}
              className="inline-flex items-center px-4 py-2 border border-white/20 rounded-lg shadow-sm text-sm font-medium text-white bg-white/10 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white disabled:opacity-50 backdrop-blur-sm"
            >
              📧 {sendingReport ? 'Envoi...' : 'Envoyer Rapport'}
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-indigo-600 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              ➕ Nouveau Bon d'Achat
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-3xl mr-3">📊</span>
              <div>
                <p className="text-sm font-medium text-white/90">Total</p>
                <p className="text-2xl font-bold text-white">{purchaseOrders.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-3xl mr-3">✅</span>
              <div>
                <p className="text-sm font-medium text-white/90">Approuvés</p>
                <p className="text-2xl font-bold text-white">
                  {purchaseOrders.filter(po => po.status === 'approved').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-3xl mr-3">⏳</span>
              <div>
                <p className="text-sm font-medium text-white/90">En Attente</p>
                <p className="text-2xl font-bold text-white">
                  {purchaseOrders.filter(po => po.status === 'pending').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-3xl mr-3">💰</span>
              <div>
                <p className="text-sm font-medium text-white/90">Montant Total</p>
                <p className="text-2xl font-bold text-white">{formatCurrency(totalAmount)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filtres et recherche */}
      <div className="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          <div className="flex-1 max-w-lg">
            <input
              type="text"
              placeholder="🔍 Rechercher par numéro, client ou description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-lg p-3"
            />
          </div>
          <div className="flex items-center space-x-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-lg p-3"
            >
              <option value="all">Tous les statuts</option>
              <option value="pending">⏳ En attente</option>
              <option value="approved">✅ Approuvé</option>
              <option value="rejected">❌ Rejeté</option>
            </select>
          </div>
        </div>
      </div>

      {/* Debug info */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-800">
          🔍 <strong>Debug:</strong> {purchaseOrders.length} bons d'achat en base, {filteredPurchaseOrders.length} affichés après filtres
        </p>
      </div>

      {/* Liste des bons d'achat */}
      <div className="bg-white shadow-lg overflow-hidden rounded-lg border border-gray-200">
        {filteredPurchaseOrders.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-6xl mb-4 block">📋</span>
            <p className="text-gray-500 text-lg">
              {purchaseOrders.length === 0 ? 'Aucun bon d\'achat créé' : 'Aucun bon d\'achat trouvé avec ces filtres'}
            </p>
            {purchaseOrders.length === 0 && (
              <button
                onClick={() => setShowForm(true)}
                className="mt-4 inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
              >
                ➕ Créer le premier bon d'achat
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {filteredPurchaseOrders.map((po) => (
              <li key={po.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0">
                      <span className="text-2xl">{getStatusEmoji(po.status)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3 mb-2">
                        <p className="text-lg font-semibold text-gray-900">
                          📄 {po.po_number || 'N/A'}
                        </p>
                        <span className={getStatusBadge(po.status)}>
                          {po.status === 'approved' ? 'Approuvé' : 
                           po.status === 'pending' ? 'En attente' : 
                           po.status === 'rejected' ? 'Rejeté' : 'Inconnu'}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                        <p>
                          <span className="font-medium">👤 Client:</span> {po.client || po.vendor || 'N/A'}
                        </p>
                        <p>
                          <span className="font-medium">💰 Montant:</span> {formatCurrency(po.amount)}
                        </p>
                        <p>
                          <span className="font-medium">📅 Date:</span> {formatDate(po.created_at)}
                        </p>
                      </div>
                      {po.description && (
                        <p className="text-sm text-gray-500 mt-2 bg-gray-50 p-2 rounded">
                          📝 {po.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {po.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleStatusChange(po.id, 'approved')}
                          className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-white bg-green-600 hover:bg-green-700 shadow-sm"
                          title="Approuver"
                        >
                          ✅ Approuver
                        </button>
                        <button
                          onClick={() => handleStatusChange(po.id, 'rejected')}
                          className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-white bg-red-600 hover:bg-red-700 shadow-sm"
                          title="Rejeter"
                        >
                          ❌ Rejeter
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleEdit(po)}
                      className="inline-flex items-center px-3 py-1 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 shadow-sm"
                      title="Modifier"
                    >
                      ✏️ Modifier
                    </button>
                    <button
                      onClick={() => handleDelete(po.id)}
                      className="inline-flex items-center px-3 py-1 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-red-50 hover:text-red-700 hover:border-red-300 shadow-sm"
                      title="Supprimer"
                    >
                      🗑️ Supprimer
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
