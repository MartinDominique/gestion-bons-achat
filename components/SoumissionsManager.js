import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function SoumissionsManager() {
  const [soumissions, setSoumissions] = useState([]);
  const [inventory, setInventory] = useState([]);
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
  
  // Recherche inventaire
  const [inventorySearchTerm, setInventorySearchTerm] = useState('');
  const [selectedItems, setSelectedItems] = useState([]);
  
  // Form states
  const [submissionForm, setSubmissionForm] = useState({
    client_name: '',
    description: '',
    amount: 0,
    status: 'draft',
    items: []
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
    fetchInventory();
    fetchClients();
  }, []);

  // Calcul automatique du montant
  useEffect(() => {
    const total = selectedItems.reduce((sum, item) => {
      return sum + (item.price * item.quantity);
    }, 0);
    setSubmissionForm(prev => ({ ...prev, amount: total }));
  }, [selectedItems]);

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

  const fetchInventory = async () => {
    try {
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        console.error('Table inventory pas trouvée:', error);
        setInventory([]);
        return;
      }
      setInventory(data || []);
    } catch (error) {
      console.error('Erreur lors du chargement de l\'inventaire:', error);
      setInventory([]);
    }
  };

  const fetchClients = async () => {
    try {
      // Essayer de récupérer les clients depuis la table clients
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        // Si la table n'existe pas, utiliser les clients des soumissions
        console.log('Table clients n\'existe pas, utilisation des clients des soumissions');
        const { data: submissionsData } = await supabase
          .from('submissions')
          .select('client_name')
          .order('client_name');
        
        const uniqueClients = [...new Set(submissionsData?.map(s => s.client_name).filter(Boolean))];
        setClients(uniqueClients.map((name, index) => ({ id: index, name, email: '', phone: '', address: '', contact_person: '' })));
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

  // Gestion des items d'inventaire
  const addItemToSubmission = (inventoryItem) => {
    const existingItem = selectedItems.find(item => item.id === inventoryItem.id);
    
    if (existingItem) {
      setSelectedItems(selectedItems.map(item => 
        item.id === inventoryItem.id 
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setSelectedItems([...selectedItems, {
        ...inventoryItem,
        quantity: 1
      }]);
    }
  };

  const updateItemQuantity = (itemId, quantity) => {
    if (quantity <= 0) {
      setSelectedItems(selectedItems.filter(item => item.id !== itemId));
    } else {
      setSelectedItems(selectedItems.map(item =>
        item.id === itemId ? { ...item, quantity: parseInt(quantity) } : item
      ));
    }
  };

  const removeItemFromSubmission = (itemId) => {
    setSelectedItems(selectedItems.filter(item => item.id !== itemId));
  };

  // Gestion des soumissions
  const handleSubmissionSubmit = async (e) => {
    e.preventDefault();
    try {
      const submissionData = {
        ...submissionForm,
        items: selectedItems
      };

      if (editingSubmission) {
        const { error } = await supabase
          .from('submissions')
          .update(submissionData)
          .eq('id', editingSubmission.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('submissions')
          .insert([submissionData]);
        if (error) throw error;
      }

      await fetchSoumissions();
      setShowForm(false);
      setEditingSubmission(null);
      setSelectedItems([]);
      setSubmissionForm({
        client_name: '',
        description: '',
        amount: 0,
        status: 'draft',
        items: []
      });
      alert('✅ Soumission sauvegardée !');
    } catch (error) {
      console.error('Erreur:', error);
      alert('❌ Erreur lors de la sauvegarde: ' + error.message);
    }
  };

  // Gestion des clients (avec vérification d'existence de table)
  const createClientsTable = async () => {
    try {
      // Tentative de création de la table clients
      const { error } = await supabase.rpc('create_clients_table');
      if (!error) {
        console.log('Table clients créée');
        await fetchClients();
      }
    } catch (error) {
      console.log('Impossible de créer la table clients automatiquement');
    }
  };

  const handleClientSubmit = async (e) => {
    e.preventDefault();
    try {
      // Vérifier si on peut utiliser la table clients
      let canUseClientsTable = true;
      
      try {
        const { data: testData } = await supabase
          .from('clients')
          .select('count')
          .limit(1);
      } catch (testError) {
        canUseClientsTable = false;
      }

      if (!canUseClientsTable) {
        alert('⚠️ Table clients non disponible. Fonctionnalité limitée aux noms de clients dans les soumissions.');
        return;
      }

      if (editingClient && editingClient.id) {
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
      alert('❌ Erreur lors de la sauvegarde du client: ' + error.message);
    }
  };

  const handleDeleteClient = async (client) => {
    if (!confirm(`🗑️ Supprimer le client "${client.name}" ?`)) return;
    
    try {
      // Si c'est un vrai client de la table
      if (typeof client.id === 'number' && client.id >= 0) {
        const { error } = await supabase
          .from('clients')
          .delete()
          .eq('id', client.id);
        
        if (error) throw error;
      } else {
        alert('⚠️ Ce client provient des soumissions et ne peut pas être supprimé directement.');
        return;
      }
      
      await fetchClients();
      alert('✅ Client supprimé !');
    } catch (error) {
      console.error('Erreur:', error);
      alert('❌ Erreur lors de la suppression: ' + error.message);
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
      await fetchInventory(); // Rafraîchir l'inventaire
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
      alert('❌ Erreur lors de la suppression: ' + error.message);
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

  const filteredInventory = inventory.filter(item => 
    item.name?.toLowerCase().includes(inventorySearchTerm.toLowerCase()) ||
    item.description?.toLowerCase().includes(inventorySearchTerm.toLowerCase())
  );

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
          <p className="mt-2 text-white/90">
            ⚠️ Fonctionnalité limitée - Table clients non configurée dans Supabase
          </p>
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
              clients.map((client, index) => (
                <div key={client.id || index} className="p-6 hover:bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-lg font-medium text-gray-900">{client.name}</h4>
                      <div className="mt-1 text-sm text-gray-500 space-y-1">
                        {client.email && <p>📧 {client.email}</p>}
                        {client.phone && <p>📞 {client.phone}</p>}
                        {client.contact_person && <p>👤 {client.contact_person}</p>}
                        {client.address && <p>📍 {client.address}</p>}
                        <p className="text-xs text-gray-400">
                          {typeof client.id === 'number' && client.id >= 0 ? 'Client BD' : 'Client soumissions'}
                        </p>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEditClient(client)}
                        className="px-3 py-1 text-xs bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200"
                        disabled={!(typeof client.id === 'number' && client.id >= 0)}
                      >
                        ✏️ Modifier
                      </button>
                      <button
                        onClick={() => handleDeleteClient(client)}
                        className="px-3 py-1 text-xs bg-red-100 text-red-800 rounded-lg hover:bg-red-200"
                        disabled={!(typeof client.id === 'number' && client.id >= 0)}
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
                        {submission.items && submission.items.length > 0 && (
                          <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded">
                            📦 {submission.items.length} items
                          </span>
                        )}
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

  // Formulaire soumission avec recherche inventaire
  if (showForm) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="bg-gradient-to-br from-purple-50 via-white to-indigo-50 rounded-xl shadow-lg border border-purple-200 p-8">
          <div className="bg-purple-600 text-white px-6 py-4 rounded-lg mb-6">
            <h2 className="text-2xl font-bold">
              {editingSubmission ? '✏️ Modifier Soumission' : '📝 Nouvelle Soumission'}
            </h2>
          </div>
          
          <form onSubmit={handleSubmissionSubmit} className="space-y-6">
            {/* Informations de base */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

            {/* Recherche inventaire */}
            <div className="bg-indigo-50 p-6 rounded-lg border border-indigo-200">
              <h3 className="text-lg font-semibold text-indigo-800 mb-4">🔍 Recherche Inventaire</h3>
              <input
                type="text"
                placeholder="Rechercher un item dans l'inventaire..."
                value={inventorySearchTerm}
                onChange={(e) => setInventorySearchTerm(e.target.value)}
                className="block w-full rounded-lg border-indigo-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-3 mb-4"
              />
              
              {inventorySearchTerm && (
                <div className="max-h-60 overflow-y-auto border border-indigo-200 rounded-lg">
                  {filteredInventory.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">
                      Aucun item trouvé dans l'inventaire
                    </div>
                  ) : (
                    filteredInventory.map((item) => (
                      <div key={item.id} className="p-3 border-b border-indigo-100 hover:bg-indigo-50 flex justify-between items-center">
                        <div>
                          <h4 className="font-medium text-gray-900">{item.name}</h4>
                          <p className="text-sm text-gray-500">{item.description}</p>
                          <p className="text-sm text-indigo-600 font-medium">{formatCurrency(item.price)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => addItemToSubmission(item)}
                          className="px-3 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
                        >
                          ➕ Ajouter
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Items sélectionnés */}
            {selectedItems.length > 0 && (
              <div className="bg-yellow-50 p-6 rounded-lg border border-yellow-200">
                <h3 className="text-lg font-semibold text-yellow-800 mb-4">📦 Items Sélectionnés</h3>
                <div className="space-y-3">
                  {selectedItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-yellow-200">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{item.name}</h4>
                        <p className="text-sm text-gray-500">{item.description}</p>
                        <p className="text-sm text-yellow-600 font-medium">
                          {formatCurrency(item.price)} × {item.quantity} = {formatCurrency(item.price * item.quantity)}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItemQuantity(item.id, e.target.value)}
                          className="w-16 rounded border-gray-300 text-center"
                        />
                        <button
                          type="button"
                          onClick={() => removeItemFromSubmission(item.id)}
                          className="px-2 py-1 bg-red-100 text-red-800 rounded hover:bg-red-200 text-sm"
                        >
                          ❌
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Montant total (calculé automatiquement) */}
            <div className="bg-green-100 p-4 rounded-lg border border-green-300">
              <label className="block text-lg font-semibold text-green-800 mb-2">
                💰 Montant Total (Calculé automatiquement)
              </label>
              <div className="text-3xl font-bold text-green-900">
                {formatCurrency(submissionForm.amount)}
              </div>
              <p className="text-sm text-green-600 mt-1">
                Basé sur {selectedItems.length} item(s) sélectionné(s)
              </p>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingSubmission(null);
                  setSelectedItems([]);
                  setSubmissionForm({client_name: '', description: '', amount: 0, status: 'draft', items: []});
                  setInventorySearchTerm('');
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

      {/* Debug info */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-800">
          🔍 <strong>Debug:</strong> {inventory.length} items inventaire, {clients.length} clients, {soumissions.length} soumissions
        </p>
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
                      {submission.items && submission.items.length > 0 && (
                        <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded">
                          📦 {submission.items.length} items
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setEditingSubmission(submission);
                      setSubmissionForm({
                        client_name: submission.client_name,
                        description: submission.description,
                        amount: submission.amount,
                        status: submission.status,
                        items: submission.items || []
                      });
                      setSelectedItems(submission.items || []);
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
