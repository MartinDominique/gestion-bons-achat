import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function SoumissionsManager() {
  const [soumissions, setSoumissions] = useState([]);
  const [products, setProducts] = useState([]);
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
  
  // Recherche produits avec debounce et navigation clavier
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [products, setProducts] = useState([]); // Sera vide au démarrage
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [focusedProductIndex, setFocusedProductIndex] = useState(-1);
  const [tempQuantity, setTempQuantity] = useState('1');
  const [showQuantityInput, setShowQuantityInput] = useState(false);
  const [selectedProductForQuantity, setSelectedProductForQuantity] = useState(null);

  // Debounce pour la recherche produits
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (productSearchTerm.length >= 2) {
        setSearchingProducts(true);
        searchProducts(productSearchTerm).finally(() => {
          setSearchingProducts(false);
        });
      } else {
        setProducts([]);
      }
    }, 300); // Attendre 300ms après la dernière frappe

    return () => clearTimeout(timeoutId);
  }, [productSearchTerm]);
  
  // Form states
  const [submissionForm, setSubmissionForm] = useState({
    client_name: '',
    description: '',
    amount: 0,
    cost_total: 0,
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
    fetchProducts();
    fetchClients();
  }, []);

  // Calcul automatique du montant vente ET coût
  useEffect(() => {
    const totalSelling = selectedItems.reduce((sum, item) => {
      return sum + (item.selling_price * item.quantity);
    }, 0);
    
    const totalCost = selectedItems.reduce((sum, item) => {
      return sum + (item.cost_price * item.quantity);
    }, 0);
    
    setSubmissionForm(prev => ({ 
      ...prev, 
      amount: totalSelling,
      cost_total: totalCost 
    }));
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

  // Ne plus charger tous les produits au démarrage - recherche dynamique uniquement
  const fetchProducts = async () => {
    // Ne rien faire - les produits seront chargés dynamiquement via searchProducts
    console.log('Recherche dynamique activée - pas de chargement initial des 6718 produits');
    setProducts([]);
  };

  // Recherche dynamique côté serveur avec limite
  const searchProducts = async (searchTerm) => {
    if (!searchTerm || searchTerm.length < 2) {
      setProducts([]);
      return;
    }

    try {
      console.log('🔍 Recherche dynamique:', searchTerm);
      
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .or(`description.ilike.%${searchTerm}%,product_id.ilike.%${searchTerm}%,product_group.ilike.%${searchTerm}%`)
        .order('description', { ascending: true })
        .limit(50); // Limite à 50 résultats pour la performance

      if (error) {
        console.error('Erreur recherche produits:', error);
        setProducts([]);
        return;
      }

      console.log(`📦 Trouvé ${data?.length || 0} produits sur 6718`);
      setProducts(data || []);
    } catch (error) {
      console.error('Erreur lors de la recherche dynamique:', error);
      setProducts([]);
    }
  };

  const fetchClients = async () => {
    try {
      // Essayer d'abord la table clients
      const { data: clientsData, error: clientsError } = await supabase
        .from('clients')
        .select('*')
        .order('name', { ascending: true });

      if (!clientsError && clientsData) {
        setClients(clientsData);
        return;
      }

      // Sinon, récupérer les clients des soumissions ET purchase_orders
      console.log('Table clients pas trouvée, récupération des noms depuis soumissions et purchase_orders');
      
      const [submissionsResult, purchaseOrdersResult] = await Promise.all([
        supabase.from('submissions').select('client_name').order('client_name'),
        supabase.from('purchase_orders').select('client_name, client').order('client_name')
      ]);

      const allClientNames = new Set();
      
      // Ajouter les clients des soumissions
      submissionsResult.data?.forEach(s => {
        if (s.client_name) allClientNames.add(s.client_name);
      });
      
      // Ajouter les clients des purchase_orders
      purchaseOrdersResult.data?.forEach(po => {
        if (po.client_name) allClientNames.add(po.client_name);
        if (po.client) allClientNames.add(po.client);
      });

      const uniqueClients = Array.from(allClientNames).map((name, index) => ({
        id: `client_${index}`,
        name,
        email: '',
        phone: '',
        address: '',
        contact_person: ''
      }));

      setClients(uniqueClients);
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

  // Navigation clavier pour recherche produits (utilise les résultats de searchProducts)
  const handleProductKeyDown = (e) => {
    // Les produits sont maintenant chargés dynamiquement via searchProducts
    const availableProducts = products; // Résultats de la recherche côté serveur

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedProductIndex(prev => 
        prev < availableProducts.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedProductIndex(prev => prev > 0 ? prev - 1 : prev);
    } else if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      if (focusedProductIndex >= 0 && availableProducts[focusedProductIndex]) {
        selectProductForQuantity(availableProducts[focusedProductIndex]);
      }
    } else if (e.key === 'Escape') {
      setFocusedProductIndex(-1);
    }
  };

  const selectProductForQuantity = (product) => {
    setSelectedProductForQuantity(product);
    setShowQuantityInput(true);
    setTempQuantity('1');
    setTimeout(() => {
      document.getElementById('quantity-input')?.focus();
    }, 100);
  };

  const handleQuantityKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedProductForQuantity && tempQuantity && parseFloat(tempQuantity) > 0) {
        addItemToSubmission(selectedProductForQuantity, parseFloat(tempQuantity));
        setShowQuantityInput(false);
        setSelectedProductForQuantity(null);
        setTempQuantity('1');
        setProductSearchTerm('');
        setFocusedProductIndex(-1);
        // Remettre le focus sur la recherche
        setTimeout(() => {
          document.getElementById('product-search')?.focus();
        }, 100);
      }
    } else if (e.key === 'Escape') {
      setShowQuantityInput(false);
      setSelectedProductForQuantity(null);
      setTempQuantity('1');
    }
  };

  // Gestion des items de produits avec quantité
  const addItemToSubmission = (product, quantity = 1) => {
    const existingItem = selectedItems.find(item => item.product_id === product.product_id);
    
    if (existingItem) {
      setSelectedItems(selectedItems.map(item => 
        item.product_id === product.product_id 
          ? { ...item, quantity: item.quantity + quantity }
          : item
      ));
    } else {
      setSelectedItems([...selectedItems, {
        ...product,
        quantity: quantity
      }]);
    }
  };

  const updateItemQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      setSelectedItems(selectedItems.filter(item => item.product_id !== productId));
    } else {
      setSelectedItems(selectedItems.map(item =>
        item.product_id === productId ? { ...item, quantity: parseFloat(quantity) } : item
      ));
    }
  };

  const removeItemFromSubmission = (productId) => {
    setSelectedItems(selectedItems.filter(item => item.product_id !== productId));
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
        cost_total: 0,
        status: 'draft',
        items: []
      });
      alert('✅ Soumission sauvegardée !');
    } catch (error) {
      console.error('Erreur:', error);
      alert('❌ Erreur lors de la sauvegarde: ' + error.message);
    }
  };

  // Gestion des clients
  const handleClientSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingClient && typeof editingClient.id === 'number') {
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

  // Fonction d'impression
  const handlePrint = () => {
    window.print();
  };

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
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEditClient(client)}
                        className="px-3 py-1 text-xs bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200"
                        disabled={!(typeof client.id === 'number')}
                      >
                        ✏️ Modifier
                      </button>
                      <button
                        onClick={() => handleDeleteClient(client)}
                        className="px-3 py-1 text-xs bg-red-100 text-red-800 rounded-lg hover:bg-red-200"
                        disabled={!(typeof client.id === 'number')}
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
                        <span>💰 Vente: {formatCurrency(submission.amount)}</span>
                        {submission.cost_total && (
                          <span>🏷️ Coût: {formatCurrency(submission.cost_total)}</span>
                        )}
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

  // Formulaire soumission avec dropdown clients et navigation clavier
  if (showForm) {
    return (
      <div className="max-w-6xl mx-auto">
        {/* Version écran */}
        <div className="print:hidden bg-gradient-to-br from-purple-50 via-white to-indigo-50 rounded-xl shadow-lg border border-purple-200 p-8">
          <div className="bg-purple-600 text-white px-6 py-4 rounded-lg mb-6 flex justify-between items-center">
            <h2 className="text-2xl font-bold">
              {editingSubmission ? '✏️ Modifier Soumission' : '📝 Nouvelle Soumission'}
            </h2>
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-white/20 rounded-lg hover:bg-white/30"
            >
              🖨️ Imprimer
            </button>
          </div>
          
          <form onSubmit={handleSubmissionSubmit} className="space-y-6">
            {/* Informations de base */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Dropdown Client */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <label className="block text-sm font-semibold text-blue-800 mb-2">Client *</label>
                <select
                  value={submissionForm.client_name}
                  onChange={(e) => setSubmissionForm({...submissionForm, client_name: e.target.value})}
                  className="block w-full rounded-lg border-blue-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3"
                  required
                >
                  <option value="">Sélectionner un client...</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.name}>
                      {client.name}
                    </option>
                  ))}
                </select>
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

            {/* Recherche produits avec navigation clavier */}
            <div className="bg-indigo-50 p-6 rounded-lg border border-indigo-200">
              <h3 className="text-lg font-semibold text-indigo-800 mb-4">
                🔍 Recherche Produits (6718 au total)
                <span className="text-sm font-normal text-indigo-600 ml-2">
                  (Tapez 2+ caractères, ↑↓ pour naviguer, TAB/ENTER pour sélectionner)
                </span>
              </h3>
              <input
                id="product-search"
                type="text"
                placeholder="Rechercher un produit (ID, description, groupe) - minimum 2 caractères..."
                value={productSearchTerm}
                onChange={(e) => {
                  setProductSearchTerm(e.target.value);
                  setFocusedProductIndex(-1);
                }}
                onKeyDown={handleProductKeyDown}
                className="block w-full rounded-lg border-indigo-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-3 mb-4"
                autoComplete="off"
              />
              
              {/* Indicateur de recherche */}
              {searchingProducts && (
                <div className="flex items-center justify-center p-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mr-2"></div>
                  <span className="text-indigo-600">Recherche en cours...</span>
                </div>
              )}
              
              {/* Message d'aide */}
              {productSearchTerm && productSearchTerm.length < 2 && !searchingProducts && (
                <div className="p-4 text-center text-gray-500 border border-gray-200 rounded-lg">
                  Tapez au moins 2 caractères pour rechercher dans les 6718 produits
                </div>
              )}
              
              {/* Résultats de recherche */}
              {productSearchTerm.length >= 2 && !searchingProducts && (
                <div className="max-h-60 overflow-y-auto border border-indigo-200 rounded-lg">
                  {products.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">
                      Aucun produit trouvé pour "{productSearchTerm}"
                      <br />
                      <span className="text-xs">Essayez avec d'autres mots-clés</span>
                    </div>
                  ) : (
                    <>
                      <div className="p-2 bg-gray-50 text-xs text-gray-600 border-b">
                        {products.length} résultat(s) trouvé(s) {products.length === 50 ? '(50 max affichés)' : ''}
                      </div>
                      {products.map((product, index) => (
                        <div 
                          key={product.product_id} 
                          className={`p-3 border-b border-indigo-100 hover:bg-indigo-50 flex justify-between items-center cursor-pointer ${
                            index === focusedProductIndex ? 'bg-indigo-100 border-indigo-300' : ''
                          }`}
                          onClick={() => selectProductForQuantity(product)}
                        >
                          <div>
                            <h4 className="font-medium text-gray-900">
                              {product.product_id} - {product.description}
                            </h4>
                            <div className="text-sm text-gray-500 space-x-4">
                              <span>📦 Groupe: {product.product_group}</span>
                              <span>📏 Unité: {product.unit}</span>
                              <span>📊 Stock: {product.stock_qty}</span>
                            </div>
                            <div className="flex space-x-4 text-sm">
                              <span className="text-indigo-600 font-medium">
                                💰 Vente: {formatCurrency(product.selling_price)}
                              </span>
                              <span className="text-orange-600 font-medium">
                                🏷️ Coût: {formatCurrency(product.cost_price)}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="px-3 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
                          >
                            ➕ Ajouter
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Modal quantité */}
            {showQuantityInput && selectedProductForQuantity && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                  <h3 className="text-lg font-semibold mb-4">
                    Quantité pour: {selectedProductForQuantity.description}
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Quantité ({selectedProductForQuantity.unit})
                      </label>
                      <input
                        id="quantity-input"
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={tempQuantity}
                        onChange={(e) => setTempQuantity(e.target.value)}
                        onKeyDown={handleQuantityKeyDown}
                        className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3 text-lg"
                        autoFocus
                      />
                    </div>
                    <div className="text-sm text-gray-600">
                      <p>Prix vente: {formatCurrency(selectedProductForQuantity.selling_price)} / {selectedProductForQuantity.unit}</p>
                      <p>Prix coût: {formatCurrency(selectedProductForQuantity.cost_price)} / {selectedProductForQuantity.unit}</p>
                      <p className="font-medium text-green-700">
                        Total vente: {formatCurrency(selectedProductForQuantity.selling_price * parseFloat(tempQuantity || 0))}
                      </p>
                      <p className="font-medium text-orange-700">
                        Total coût: {formatCurrency(selectedProductForQuantity.cost_price * parseFloat(tempQuantity || 0))}
                      </p>
                    </div>
                    <div className="flex justify-end space-x-3">
                      <button
                        type="button"
                        onClick={() => {
                          setShowQuantityInput(false);
                          setSelectedProductForQuantity(null);
                          setTempQuantity('1');
                        }}
                        className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (tempQuantity && parseFloat(tempQuantity) > 0) {
                            addItemToSubmission(selectedProductForQuantity, parseFloat(tempQuantity));
                            setShowQuantityInput(false);
                            setSelectedProductForQuantity(null);
                            setTempQuantity('1');
                            setProductSearchTerm('');
                            setFocusedProductIndex(-1);
                          }
                        }}
                        className="px-4 py-2 border border-transparent rounded-lg text-white bg-blue-600 hover:bg-blue-700"
                      >
                        Ajouter
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Items sélectionnés */}
            {selectedItems.length > 0 && (
              <div className="bg-yellow-50 p-6 rounded-lg border border-yellow-200">
                <h3 className="text-lg font-semibold text-yellow-800 mb-4">📦 Produits Sélectionnés</h3>
                <div className="space-y-3">
                  {selectedItems.map((item) => (
                    <div key={item.product_id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-yellow-200">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">
                          {item.product_id} - {item.description}
                        </h4>
                        <div className="text-sm text-gray-500">
                          <span>📦 {item.product_group}</span> • <span>📏 {item.unit}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm mt-1">
                          <p className="text-green-600 font-medium">
                            💰 Vente: {formatCurrency(item.selling_price)} × {item.quantity} = {formatCurrency(item.selling_price * item.quantity)}
                          </p>
                          <p className="text-orange-600 font-medium">
                            🏷️ Coût: {formatCurrency(item.cost_price)} × {item.quantity} = {formatCurrency(item.cost_price * item.quantity)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={item.quantity}
                          onChange={(e) => updateItemQuantity(item.product_id, e.target.value)}
                          className="w-20 rounded border-gray-300 text-center"
                        />
                        <button
                          type="button"
                          onClick={() => removeItemFromSubmission(item.product_id)}
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

            {/* Totaux (vente et coût) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-green-100 p-4 rounded-lg border border-green-300">
                <label className="block text-lg font-semibold text-green-800 mb-2">
                  💰 Total Vente (Calculé automatiquement)
                </label>
                <div className="text-3xl font-bold text-green-900">
                  {formatCurrency(submissionForm.amount)}
                </div>
              </div>
              
              <div className="bg-orange-100 p-4 rounded-lg border border-orange-300">
                <label className="block text-lg font-semibold text-orange-800 mb-2">
                  🏷️ Total Coût
                </label>
                <div className="text-3xl font-bold text-orange-900">
                  {formatCurrency(submissionForm.cost_total)}
                </div>
              </div>
            </div>

            {/* Marge bénéficiaire */}
            {submissionForm.amount > 0 && submissionForm.cost_total > 0 && (
              <div className="bg-blue-100 p-4 rounded-lg border border-blue-300">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold text-blue-800">📈 Marge Bénéficiaire</span>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-900">
                      {formatCurrency(submissionForm.amount - submissionForm.cost_total)}
                    </div>
                    <div className="text-sm text-blue-700">
                      {((submissionForm.amount - submissionForm.cost_total) / submissionForm.amount * 100).toFixed(1)}% marge
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingSubmission(null);
                  setSelectedItems([]);
                  setSubmissionForm({client_name: '', description: '', amount: 0, cost_total: 0, status: 'draft', items: []});
                  setProductSearchTerm('');
                  setFocusedProductIndex(-1);
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

        {/* Version impression */}
        <div className="hidden print:block bg-white p-8 max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">SOUMISSION</h1>
            <p className="text-gray-600">Date: {new Date().toLocaleDateString('fr-CA')}</p>
          </div>

          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Client:</h3>
              <p>{submissionForm.client_name}</p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Statut:</h3>
              <p>{submissionForm.status === 'draft' ? 'Brouillon' : 
                  submissionForm.status === 'sent' ? 'Envoyée' : 'Acceptée'}</p>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="font-semibold text-gray-900 mb-2">Description:</h3>
            <p>{submissionForm.description}</p>
          </div>

          {selectedItems.length > 0 && (
            <div className="mb-8">
              <h3 className="font-semibold text-gray-900 mb-4">Articles:</h3>
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 p-2 text-left">Code</th>
                    <th className="border border-gray-300 p-2 text-left">Description</th>
                    <th className="border border-gray-300 p-2 text-center">Qté</th>
                    <th className="border border-gray-300 p-2 text-right">Prix Unit.</th>
                    <th className="border border-gray-300 p-2 text-right">Coût Unit.</th>
                    <th className="border border-gray-300 p-2 text-right">Total Vente</th>
                    <th className="border border-gray-300 p-2 text-right">Total Coût</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedItems.map((item) => (
                    <tr key={item.product_id}>
                      <td className="border border-gray-300 p-2">{item.product_id}</td>
                      <td className="border border-gray-300 p-2">{item.description}</td>
                      <td className="border border-gray-300 p-2 text-center">{item.quantity}</td>
                      <td className="border border-gray-300 p-2 text-right">{formatCurrency(item.selling_price)}</td>
                      <td className="border border-gray-300 p-2 text-right">{formatCurrency(item.cost_price)}</td>
                      <td className="border border-gray-300 p-2 text-right">{formatCurrency(item.selling_price * item.quantity)}</td>
                      <td className="border border-gray-300 p-2 text-right">{formatCurrency(item.cost_price * item.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="border-t-2 border-gray-300 pt-4">
            <div className="grid grid-cols-2 gap-8">
              <div>
                <p className="text-lg font-semibold">Total Vente: {formatCurrency(submissionForm.amount)}</p>
                <p className="text-lg font-semibold">Total Coût: {formatCurrency(submissionForm.cost_total)}</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold">Marge: {formatCurrency(submissionForm.amount - submissionForm.cost_total)}</p>
                {submissionForm.amount > 0 && (
                  <p className="text-sm text-gray-600">
                    ({((submissionForm.amount - submissionForm.cost_total) / submissionForm.amount * 100).toFixed(1)}%)
                  </p>
                )}
              </div>
            </div>
          </div>
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
                <p className="text-sm font-medium text-white/90">Total Vente</p>
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
          🔍 <strong>Debug:</strong> Recherche dynamique activée sur 6718 produits (max 50 résultats), {clients.length} clients disponibles, {soumissions.length} soumissions
        </p>
        {productSearchTerm && (
          <p className="text-xs text-yellow-700 mt-1">
            Recherche actuelle: "{productSearchTerm}" → {products.length} résultats
          </p>
        )}
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
                      <span className="font-medium text-green-600">💰 Vente: {formatCurrency(submission.amount)}</span>
                      {submission.cost_total && (
                        <span className="font-medium text-orange-600">🏷️ Coût: {formatCurrency(submission.cost_total)}</span>
                      )}
                      {submission.amount > 0 && submission.cost_total > 0 && (
                        <span className="font-medium text-blue-600">
                          📈 Marge: {formatCurrency(submission.amount - submission.cost_total)}
                        </span>
                      )}
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
                        cost_total: submission.cost_total || 0,
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
