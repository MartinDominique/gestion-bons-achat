import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function SoumissionsManager() {
  const [soumissions, setSoumissions] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showClientManager, setShowClientManager] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showNonInventoryForm, setShowNonInventoryForm] = useState(false);
  const [editingSubmission, setEditingSubmission] = useState(null);
  const [editingClient, setEditingClient] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sendingReport, setSendingReport] = useState(false);
  
  // Form states
  const [submissionForm, setSubmissionForm] = useState({
    client_name: '',
    description: '',
    amount: '',
    status: 'draft'
  });

  const [clientForm, setClientForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    contact_person: ''
  });

  const [nonInventoryForm, setNonInventoryForm] = useState({
    name: '',
    description: '',
    price: '',
    category: '',
    supplier: ''
  });

  useEffect(() => {
    fetchSoumissions();
    fetchClients();
  }, []);

  const fetchSoumissions = async () => {
    try {
      const { data, error } = await supabase
        .from('submissions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSoumissions(data || []);
    } catch (error) {
      console.error('Erreur lors du chargement des soumissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        console.error('Table clients pas trouvée, création simulée');
        setClients([]);
        return;
      }
      setClients(data || []);
    } catch (error) {
      console.error('Erreur lors du chargement des clients:', error);
      setClients([]);
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
        alert('❌ Erreur lors de l\'envoi du rapport');
      }
    } catch (error) {
      console.error('Erreur lors de l\'envoi:', error);
      alert('❌ Erreur lors de l\'envoi du rapport');
    } finally {
      setSendingReport(false);
    }
  };

  // Gestion des soumissions
  const handleSubmissionSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingSubmission) {
        const { error } = await supabase
          .from('submissions')
          .update(submissionForm)
          .eq('id', editingSubmission.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('submissions')
          .insert([submissionForm]);
        if (error) throw error;
      }

      await fetchSoumissions();
      setShowForm(false);
      setEditingSubmission(null);
      setSubmissionForm({
        client_name: '',
        description: '',
        amount: '',
        status: 'draft'
      });
      alert('✅ Soumission sauvegardée !');
    } catch (error) {
      console.error('Erreur:', error);
      alert('❌ Erreur lors de la sauvegarde');
    }
  };

  // Gestion des clients
  const handleClientSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingClient) {
        const { error } = await supabase
          .from('clients')
          .update(clientForm)
          .eq('id', editingClient.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('clients')
          .insert([clientForm]);
        if (error) throw error;
      }

      await fetchClients();
      setEditingClient(null);
      setClientForm({
        name: '',
        email: '',
        phone: '',
        address: '',
        contact_person: ''
      });
      alert('✅ Client sauvegardé !');
    } catch (error) {
      console.error('Erreur:', error);
      alert('❌ Erreur lors de la sauvegarde du client');
    }
  };

  const handleDeleteClient = async (id) => {
    if (!confirm('🗑️ Supprimer ce client ?')) return;
    
    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      await fetchClients();
      alert('✅ Client supprimé !');
    } catch (error) {
      console.error('Erreur:', error);
      alert('❌ Erreur lors de la suppression');
    }
  };

  // Gestion items non-inventaire
  const handleNonInventorySubmit = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('non_inventory_items')
        .insert([nonInventoryForm]);
      
      if (error) throw error;
      
      setNonInventoryForm({
        name: '',
        description: '',
        price: '',
        category: '',
        supplier: ''
      });
      setShowNonInventoryForm(false);
      alert('✅ Item non-inventaire ajouté !');
    } catch (error) {
      console.error('Erreur:', error);
      alert('❌ Erreur: ' + error.message);
    }
  };

  // Suppression soumission (historique)
  const handleDeleteSubmission = async (id) => {
    if (!confirm('🗑️ Supprimer définitivement cette soumission ?')) return;
    
    try {
      const { error } = await supabase
        .from('submissions')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      await fetchSoumissions();
      alert('✅ Soumission supprimée !');
    } catch (error) {
      console.error('Erreur:', error);
      alert('❌ Erreur lors de la suppression');
    }
  };

  const handleEditClient = (client) => {
    setEditingClient(client);
    setClientForm({
      name: client.name || '',
      email: client.email || '',
      phone: client.phone || '',
      address: client.address || '',
      contact_person: client.contact_person || ''
    });
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

  const filteredSoumissions = soumissions.filter(sub => {
    const matchesSearch = sub.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         sub.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        <p className="ml-4 text-purple-600 font-medium">Chargement des soumissions...</p>
      </div>
    );
  }

  // Formulaire item non-inventaire
  if (showNonInventoryForm) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-gradient-to-br from-orange-50 via-white to-red-50 rounded-xl shadow-lg border border-orange-200 p-8">
          <div className="bg-orange-600 text-white px-6 py-4 rounded-lg mb-6">
            <h2 className="text-2xl font-bold">📦 Ajouter Item Non-Inventaire</h2>
          </div>
          
          <form onSubmit={handleNonInventorySubmit} className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <label className="block text-sm font-semibold text-blue-800 mb-2">Nom de l'item</label>
              <input
                type="text"
                value={nonInventoryForm.name}
                onChange={(e) => setNonInventoryForm({...nonInventoryForm, name: e.target.value})}
                className="block w-full rounded-lg border-blue-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3"
                required
              />
            </div>

            <div className="bg-green-50 p-4 rounded-lg">
              <label className="block text-sm font-semibold text-green-800 mb-2">Description</label>
              <textarea
                value={nonInventoryForm.description}
                onChange={(e) => setNonInventoryForm({...nonInventoryForm, description: e.target.value})}
                className="block w-full rounded-lg border-green-300 shadow-sm focus:border-green-500 focus:ring-green-500 p-3"
                rows="3"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-yellow-50 p-4 rounded-lg">
                <label className="block text-sm font-semibold text-yellow-800 mb-2">Prix</label>
                <input
                  type="number"
                  step="0.01"
                  value={nonInventoryForm.price}
                  onChange={(e) => setNonInventoryForm({...nonInventoryForm, price: e.target.value})}
                  className="block w-full rounded-lg border-yellow-300 shadow-sm focus:border-yellow-500 focus:ring-yellow-500 p-3"
                  required
                />
              </div>

              <div className="bg-purple-50 p-4 rounded-lg">
                <label className="block text-sm font-semibold text-purple-800 mb-2">Catégorie</label>
                <input
                  type="text"
                  value={nonInventoryForm.category}
                  onChange={(e) => setNonInventoryForm({...nonInventoryForm, category: e.target.value})}
                  className="block w-full rounded-lg border-purple-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 p-3"
                />
              </div>
            </div>

            <div className="bg-indigo-50 p-4 rounded-lg">
              <label className="block text-sm font-semibold text-indigo-800 mb-2">Fournisseur</label>
              <input
                type="text"
                value={nonInventoryForm.supplier}
                onChange={(e) => setNonInventoryForm({...nonInventoryForm, supplier: e.target.value})}
                className="block w-full rounded-lg border-indigo-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-3"
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => setShowNonInventoryForm(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                ❌ Annuler
              </button>
              <button
                type="submit"
                className="px-4 py-2 border border-transparent rounded-lg text-white bg-orange-600 hover:bg-orange-700"
              >
                ✅ Ajouter
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Gestionnaire de clients
  if (showClientManager) {
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 rounded-xl shadow-lg p-6 text-white">
          <div className="flex justify-between items-center">
            <h2 className="text-3xl font-bold">👥 Gestion des Clients</h2>
            <button
              onClick={() => setShowClientManager(false)}
              className="px-4 py-2 bg-white/20 rounded-lg hover:bg-white/30"
            >
              ← Retour
            </button>
          </div>
        </div>

        {/* Formulaire client */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-xl font-bold mb-4">
            {editingClient ? '✏️ Modifier Client' : '➕ Nouveau Client'}
          </h3>
          <form onSubmit={handleClientSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
              <input
                type="text"
                value={clientForm.name}
                onChange={(e) => setClientForm({...clientForm, name: e.target.value})}
                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={clientForm.email}
                onChange={(e) => setClientForm({...clientForm, email: e.target.value})}
                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
              <input
                type="tel"
                value={clientForm.phone}
                onChange={(e) => setClientForm({...clientForm, phone: e.target.value})}
                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Personne contact</label>
              <input
                type="text"
                value={clientForm.contact_person}
                onChange={(e) => setClientForm({...clientForm, contact_person: e.target.value})}
                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
              <textarea
                value={clientForm.address}
                onChange={(e) => setClientForm({...clientForm, address: e.target.value})}
                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                rows="2"
              />
            </div>
            <div className="md:col-span-2 flex justify-end space-x-3">
              {editingClient && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingClient(null);
                    setClientForm({name: '', email: '', phone: '', address: '', contact_person: ''});
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Annuler
                </button>
              )}
              <button
                type="submit"
                className="px-4 py-2 border border-transparent rounded-lg text-white bg-blue-600 hover:bg-blue-700"
              >
                {editingClient ? 'Mettre à jour' : 'Créer'}
              </button>
            </div>
          </form>
        </div>

        {/* Liste des clients */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b">
            <h3 className="text-lg font-medium text-gray-900">Liste des Clients ({clients.length})</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {clients.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                Aucun client enregistré
              </div>
            ) : (
              clients.map((client) => (
                <div key={client.id} className="p-6 hover:bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-lg font-medium text-gray-900">{client.name}</h4>
                      <div className="mt-1 text-sm text-gray-500 space-y-1">
                        {client.email && <p>📧 {client.email}</p>}
                        {client.phone && <p>📞 {client.phone}</p>}
                        {client.contact_person && <p>👤 {client.contact_person}</p>}
                        {client.address && <p>📍 {client.address}</p>}
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEditClient(client)}
                        className="px-3 py-1 text-xs bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200"
                      >
                        ✏️ Modifier
                      </button>
                      <button
                        onClick={() => handleDeleteClient(client.id)}
                        className="px-3 py-1 text-xs bg-red-100 text-red-800 rounded-lg hover:bg-red-200"
                      >
                        🗑️ Supprimer
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // Historique (avec option de suppression)
  if (showHistory) {
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 rounded-xl shadow-lg p-6 text-white">
          <div className="flex justify-between items-center">
            <h2 className="text-3xl font-bold">📚 Historique des Soumissions</h2>
            <button
              onClick={() => setShowHistory(false)}
              className="px-4 py-2 bg-white/20 rounded-lg hover:bg-white/30"
            >
              ← Retour
            </button>
          </div>
          <p className="mt-2 text-white/90">Gérer et supprimer définitivement les soumissions</p>
        </div>

        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {soumissions.length === 0 ? (
            <div className="p-12 text-center">
              <span className="text-6xl mb-4 block">📋</span>
              <p className="text-gray-500 text-lg">Aucune soumission dans l'historique</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {soumissions.map((submission) => (
                <li key={submission.id} className="p-6 hover:bg-gray-50">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">
                        👤 {submission.client_name}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        📝 {submission.description}
                      </p>
                      <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                        <span>💰 {formatCurrency(submission.amount)}</span>
                        <span>📅 {formatDate(submission.created_at)}</span>
                        <span className={`px-2 py-1 rounded text-xs ${
                          submission.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                          submission.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {submission.status === 'sent' ? '📤 Envoyée' :
                           submission.status === 'draft' ? '📝 Brouillon' : '✅ Acceptée'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteSubmission(submission.id)}
                      className="px-4 py-2 bg-red-100 text-red-800 rounded-lg hover:bg-red-200 border border-red-200"
                    >
                      🗑️ Supprimer
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // Formulaire soumission
  if (showForm) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-gradient-to-br from-purple-50 via-white to-indigo-50 rounded-xl shadow-lg border border-purple-200 p-8">
          <div className="bg-purple-600 text-white px-6 py-4 rounded-lg mb-6">
            <h2 className="text-2xl font-bold">
              {editingSubmission ? '✏️ Modifier Soumission' : '📝 Nouvelle Soumission'}
            </h2>
          </div>
          
          <form onSubmit={handleSubmissionSubmit} className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <label className="block text-sm font-semibold text-blue-800 mb-2">Client</label>
              <input
                type="text"
                value={submissionForm.client_name}
                onChange={(e) => setSubmissionForm({...submissionForm, client_name: e.target.value})}
                className="block w-full rounded-lg border-blue-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3"
                required
              />
            </div>

            <div className="bg-green-50 p-4 rounded-lg">
              <label className="block text-sm font-semibold text-green-800 mb-2">Description</label>
              <textarea
                value={submissionForm.description}
                onChange={(e) => setSubmissionForm({...submissionForm, description: e.target.value})}
                className="block w-full rounded-lg border-green-300 shadow-sm focus:border-green-500 focus:ring-green-500 p-3"
                rows="3"
                required
              />
            </div>

            <div className="bg-yellow-50 p-4 rounded-lg">
              <label className="block text-sm font-semibold text-yellow-800 mb-2">Montant</label>
              <input
                type="number"
                step="0.01"
                value={submissionForm.amount}
                onChange={(e) => setSubmissionForm({...submissionForm, amount: e.target.value})}
                className="block w-full rounded-lg border-yellow-300 shadow-sm focus:border-yellow-500 focus:ring-yellow-500 p-3"
                required
              />
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <label className="block text-sm font-semibold text-gray-800 mb-2">Statut</label>
              <select
                value={submissionForm.status}
                onChange={(e) => setSubmissionForm({...submissionForm, status: e.target.value})}
                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 p-3"
              >
                <option value="draft">📝 Brouillon</option>
                <option value="sent">📤 Envoyée</option>
                <option value="accepted">✅ Acceptée</option>
              </select>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingSubmission(null);
                  setSubmissionForm({client_name: '', description: '', amount: '', status: 'draft'});
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                ❌ Annuler
              </button>
              <button
                type="submit"
                className="px-4 py-2 border border-transparent rounded-lg text-white bg-purple-600 hover:bg-purple-700"
              >
                {editingSubmission ? '💾 Mettre à jour' : '✨ Créer'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête avec boutons */}
      <div className="bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 rounded-xl shadow-lg p-6 text-white">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold">📝 Gestion des Soumissions</h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleSendReport}
              disabled={sendingReport}
              className="px-3 py-2 bg-white/20 rounded-lg hover:bg-white/30 text-sm font-medium backdrop-blur-sm"
            >
              📧 {sendingReport ? 'Envoi...' : 'Rapport'}
            </button>
            <button
              onClick={() => setShowNonInventoryForm(true)}
              className="px-3 py-2 bg-orange-600 rounded-lg hover:bg-orange-700 text-sm font-medium"
            >
              📦 Item Non-Inventaire
            </button>
            <button
              onClick={() => setShowClientManager(true)}
              className="px-3 py-2 bg-cyan-600 rounded-lg hover:bg-cyan-700 text-sm font-medium"
            >
              👥 Gestion Clients
            </button>
            <button
              onClick={() => setShowHistory(true)}
              className="px-3 py-2 bg-pink-600 rounded-lg hover:bg-pink-700 text-sm font-medium"
            >
              📚 Historique
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-white text-purple-600 rounded-lg hover:bg-gray-50 font-medium"
            >
              ➕ Nouvelle Soumission
            </button>
          </div>
        </div>

        {/* Statistiques */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg">
            <div className="flex items-center">
              <span className="text-3xl mr-3">📊</span>
              <div>
                <p className="text-sm font-medium text-white/90">Total</p>
                <p className="text-2xl font-bold">{soumissions.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg">
            <div className="flex items-center">
              <span className="text-3xl mr-3">📝</span>
              <div>
                <p className="text-sm font-medium text-white/90">Brouillons</p>
                <p className="text-2xl font-bold">
                  {soumissions.filter(s => s.status === 'draft').length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg">
            <div className="flex items-center">
              <span className="text-3xl mr-3">📤</span>
              <div>
                <p className="text-sm font-medium text-white/90">Envoyées</p>
                <p className="text-2xl font-bold">
                  {soumissions.filter(s => s.status === 'sent').length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg">
            <div className="flex items-center">
              <span className="text-3xl mr-3">💰</span>
              <div>
                <p className="text-sm font-medium text-white/90">Total</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(soumissions.reduce((sum, s) => sum + (s.amount || 0), 0))}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <input
            type="text"
            placeholder="🔍 Rechercher par client ou description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 rounded-lg border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 p-3"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 p-3"
          >
            <option value="all">Tous les statuts</option>
            <option value="draft">📝 Brouillons</option>
            <option value="sent">📤 Envoyées</option>
            <option value="accepted">✅ Acceptées</option>
          </select>
        </div>
      </div>

      {/* Liste des soumissions */}
      <div className="bg-white shadow-lg rounded-lg overflow-hidden">
        {filteredSoumissions.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-6xl mb-4 block">📝</span>
            <p className="text-gray-500 text-lg">Aucune soumission trouvée</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {filteredSoumissions.map((submission) => (
              <li key={submission.id} className="p-6 hover:bg-gray-50">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">
                      👤 {submission.client_name}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      📝 {submission.description}
                    </p>
                    <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                      <span>💰 {formatCurrency(submission.amount)}</span>
                      <span>📅 {formatDate(submission.created_at)}</span>
                      <span className={`px-2 py-1 rounded text-xs ${
                        submission.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                        submission.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {submission.status === 'sent' ? '📤 Envoyée' :
                         submission.status === 'draft' ? '📝 Brouillon' : '✅ Acceptée'}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setEditingSubmission(submission);
                      setSubmissionForm({
                        client_name: submission.client_name,
                        description: submission.description,
                        amount: submission.amount,
                        status: submission.status
                      });
                      setShowForm(true);
                    }}
                    className="px-4 py-2 bg-purple-100 text-purple-800 rounded-lg hover:bg-purple-200"
                  >
                    ✏️ Modifier
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
