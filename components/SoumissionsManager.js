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
  const [showQuickAddProduct, setShowQuickAddProduct] = useState(false);
  const [showInventoryUpload, setShowInventoryUpload] = useState(false);
  const [editingSubmission, setEditingSubmission] = useState(null);
  const [editingClient, setEditingClient] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sendingReport, setSendingReport] = useState(false);
  
  // Recherche produits avec debounce et navigation clavier
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [products, setProducts] = useState([]); // Sera vide au démarrage - recherche dynamique
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

  const [quickProductForm, setQuickProductForm] = useState({
    product_id: '',
    description: '',
    selling_price: '',
    cost_price: '',
    unit: 'pcs',
    product_group: 'Divers'
  });

  // Calcul automatique du montant vente (ET coût pour affichage seulement)
  const [calculatedCostTotal, setCalculatedCostTotal] = useState(0);
  
  useEffect(() => {
    const totalSelling = selectedItems.reduce((sum, item) => {
      return sum + (item.selling_price * item.quantity);
    }, 0);
    
    const totalCost = selectedItems.reduce((sum, item) => {
      return sum + (item.cost_price * item.quantity);
    }, 0);
    
    setSubmissionForm(prev => ({ 
      ...prev, 
      amount: totalSelling
    }));
    
    setCalculatedCostTotal(totalCost);
  }, [selectedItems]);

  useEffect(() => {
    fetchSoumissions();
    fetchProducts();
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
        status: 'draft',
        items: []
      });
      setCalculatedCostTotal(0);
      alert('✅ Soumission sauvegardée !');
    } catch (error) {
      console.error('Erreur:', error);
      alert('❌ Erreur lors de la sauvegarde: ' + error.message);
    }
  };

  // Fonction d'impression
  const handlePrint = () => {
    window.print();
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

  // Formulaire soumission avec dropdown clients et navigation clavier
  if (showForm) {
    return (
      <div className="max-w-6xl mx-auto">
        {/* Version écran */}
        <div className="print:hidden bg-gradient-to-br from-purple-50 via-white to-indigo-50 rounded-xl shadow-lg border border-purple-200 p-8">
          <div className="bg-purple-600 text-white px-6 py-4 rounded-lg mb-6 flex justify-between items-center">
            <div className="flex items-center space-x-6">
              <h2 className="text-2xl font-bold">
                {editingSubmission ? '✏️ Modifier Soumission' : '📝 Nouvelle Soumission'}
              </h2>
              {/* Statut dans la barre mauve pendant l'édition */}
              {editingSubmission && (
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium">Statut:</span>
                  <select
                    value={submissionForm.status}
                    onChange={(e) => setSubmissionForm({...submissionForm, status: e.target.value})}
                    className="rounded-md border-white/20 bg-white/10 text-white text-sm px-3 py-1 focus:outline-none focus:ring-2 focus:ring-white/50"
                  >
                    <option value="draft" className="text-gray-900">📝 Brouillon</option>
                    <option value="sent" className="text-gray-900">📤 Envoyée</option>
                    <option value="accepted" className="text-gray-900">✅ Acceptée</option>
                  </select>
                </div>
              )}
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowInventoryUpload(true)}
                className="px-4 py-2 bg-green-600 rounded-lg hover:bg-green-700 flex items-center text-sm"
              >
                📁 Import CSV
              </button>
              <button
                onClick={handlePrint}
                className="px-4 py-2 bg-white/20 rounded-lg hover:bg-white/30 flex items-center"
              >
                🖨️ Imprimer
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingSubmission(null);
                  setSelectedItems([]);
                  setSubmissionForm({client_name: '', description: '', amount: 0, status: 'draft', items: []});
                  setCalculatedCostTotal(0);
                  setProductSearchTerm('');
                  setFocusedProductIndex(-1);
                }}
                className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg hover:bg-white/20 flex items-center"
              >
                ❌ Annuler
              </button>
              <button
                type="submit"
                form="submission-form"
                className="px-4 py-2 bg-white text-purple-600 rounded-lg hover:bg-gray-50 font-medium flex items-center"
              >
                {editingSubmission ? '💾 Mettre à jour' : '✨ Créer'}
              </button>
            </div>
          </div>
          
          <form id="submission-form" onSubmit={handleSubmissionSubmit} className="space-y-6">
            {/* Informations de base - Client et Description sur même ligne */}
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

              {/* Description sur 1 ligne */}
              <div className="bg-green-50 p-4 rounded-lg">
                <label className="block text-sm font-semibold text-green-800 mb-2">Description *</label>
                <input
                  type="text"
                  value={submissionForm.description}
                  onChange={(e) => setSubmissionForm({...submissionForm, description: e.target.value})}
                  className="block w-full rounded-lg border-green-300 shadow-sm focus:border-green-500 focus:ring-green-500 p-3"
                  placeholder="Description de la soumission..."
                  required
                />
              </div>
            </div>

            {/* Recherche produits avec navigation clavier - Réduite de moitié + bouton ajout rapide */}
            <div className="bg-indigo-50 p-6 rounded-lg border border-indigo-200">
              <h3 className="text-lg font-semibold text-indigo-800 mb-4">
                🔍 Recherche Produits (6718 au total)
                <span className="text-sm font-normal text-indigo-600 ml-2">
                  (Tapez 2+ caractères, ↑↓ pour naviguer, TAB/ENTER pour sélectionner)
                </span>
              </h3>
              
              {/* Barre de recherche réduite + bouton ajout rapide */}
              <div className="flex gap-4 mb-4">
                <div className="flex-1 max-w-md">
                  <input
                    id="product-search"
                    type="text"
                    placeholder="Rechercher un produit - minimum 2 caractères..."
                    value={productSearchTerm}
                    onChange={(e) => {
                      setProductSearchTerm(e.target.value);
                      setFocusedProductIndex(-1);
                    }}
                    onKeyDown={handleProductKeyDown}
                    className="block w-full rounded-lg border-indigo-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-3"
                    autoComplete="off"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowQuickAddProduct(true)}
                  className="px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 whitespace-nowrap flex items-center"
                >
                  ➕ Produit Non-Inventaire
                </button>
              </div>
              
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

            {/* Modal ajout rapide produit non-inventaire */}
            {showQuickAddProduct && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
                  <h3 className="text-lg font-semibold mb-4 text-orange-600">
                    ➕ Ajouter Produit Non-Inventaire
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Code Produit *</label>
                      <input
                        type="text"
                        value={quickProductForm.product_id}
                        onChange={(e) => setQuickProductForm({...quickProductForm, product_id: e.target.value})}
                        className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 p-3"
                        placeholder="Ex: TEMP-001"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Unité</label>
                      <select
                        value={quickProductForm.unit}
                        onChange={(e) => setQuickProductForm({...quickProductForm, unit: e.target.value})}
                        className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 p-3"
                      >
                        <option value="pcs">pcs</option>
                        <option value="m">m</option>
                        <option value="m2">m²</option>
                        <option value="kg">kg</option>
                        <option value="litre">litre</option>
                        <option value="heure">heure</option>
                        <option value="lot">lot</option>
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Description *</label>
                      <input
                        type="text"
                        value={quickProductForm.description}
                        onChange={(e) => setQuickProductForm({...quickProductForm, description: e.target.value})}
                        className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 p-3"
                        placeholder="Description du produit..."
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Prix Coût *</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={quickProductForm.cost_price}
                        onChange={(e) => setQuickProductForm({...quickProductForm, cost_price: e.target.value})}
                        className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 p-3"
                        placeholder="0.00"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Prix Vente *</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={quickProductForm.selling_price}
                        onChange={(e) => setQuickProductForm({...quickProductForm, selling_price: e.target.value})}
                        className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 p-3"
                        placeholder="0.00"
                        required
                      />
                    </div>
                  </div>
                  
                  {/* Calcul automatique de la marge */}
                  {quickProductForm.selling_price && quickProductForm.cost_price && (
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                      <p className="text-sm text-blue-800">
                        💰 Marge: {formatCurrency(parseFloat(quickProductForm.selling_price || 0) - parseFloat(quickProductForm.cost_price || 0))} 
                        ({((parseFloat(quickProductForm.selling_price || 0) - parseFloat(quickProductForm.cost_price || 0)) / parseFloat(quickProductForm.selling_price || 1) * 100).toFixed(1)}%)
                      </p>
                    </div>
                  )}
                  
                  <div className="flex justify-end space-x-3 mt-6">
                    <button
                      type="button"
                      onClick={() => {
                        setShowQuickAddProduct(false);
                        setQuickProductForm({
                          product_id: '',
                          description: '',
                          selling_price: '',
                          cost_price: '',
                          unit: 'pcs',
                          product_group: 'Divers'
                        });
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (quickProductForm.product_id && quickProductForm.description && 
                            quickProductForm.selling_price && quickProductForm.cost_price) {
                          // Créer le produit temporaire et l'ajouter directement
                          const tempProduct = {
                            product_id: quickProductForm.product_id,
                            description: quickProductForm.description,
                            selling_price: parseFloat(quickProductForm.selling_price),
                            cost_price: parseFloat(quickProductForm.cost_price),
                            unit: quickProductForm.unit,
                            product_group: quickProductForm.product_group,
                            stock_qty: 0 // Produit non-inventaire
                          };
                          
                          // Ajouter avec quantité 1 par défaut
                          addItemToSubmission(tempProduct, 1);
                          
                          // Fermer le modal et réinitialiser
                          setShowQuickAddProduct(false);
                          setQuickProductForm({
                            product_id: '',
                            description: '',
                            selling_price: '',
                            cost_price: '',
                            unit: 'pcs',
                            product_group: 'Divers'
                          });
                        }
                      }}
                      className="px-4 py-2 border border-transparent rounded-lg text-white bg-orange-600 hover:bg-orange-700"
                    >
                      ✅ Ajouter à la soumission
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Modal upload CSV inventaire */}
            {showInventoryUpload && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
                  <h3 className="text-lg font-semibold mb-4 text-green-600">
                    📁 Import Inventaire CSV
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Fichier CSV
                      </label>
                      <input
                        type="file"
                        accept=".csv"
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                      />
                    </div>
                    <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                      <p className="font-medium mb-2">Format attendu (en-têtes) :</p>
                      <p>product_id, description, selling_price, cost_price, unit, product_group, stock_qty</p>
                    </div>
                  </div>
                  <div className="flex justify-end space-x-3 mt-6">
                    <button
                      type="button"
                      onClick={() => setShowInventoryUpload(false)}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        // Ici tu peux ajouter la logique d'import CSV
                        alert('⚠️ Fonctionnalité import CSV à implémenter');
                        setShowInventoryUpload(false);
                      }}
                      className="px-4 py-2 border border-transparent rounded-lg text-white bg-green-600 hover:bg-green-700"
                    >
                      📁 Importer
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Items sélectionnés - Version compacte pour 50+ items */}
            {selectedItems.length > 0 && (
              <div className="bg-yellow-50 p-6 rounded-lg border border-yellow-200">
                <h3 className="text-lg font-semibold text-yellow-800 mb-4">
                  📦 Produits Sélectionnés ({selectedItems.length})
                  <span className="text-sm font-normal text-yellow-600 ml-2">
                    (Dernier ajouté en haut)
                  </span>
                </h3>
                
                {/* Tableau compact pour beaucoup d'items */}
                <div className="max-h-80 overflow-y-auto border border-yellow-200 rounded-lg bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-yellow-100 sticky top-0">
                      <tr>
                        <th className="text-left p-2 font-semibold">Code</th>
                        <th className="text-left p-2 font-semibold">Description</th>
                        <th className="text-center p-2 font-semibold">Qté</th>
                        <th className="text-right p-2 font-semibold">Prix Unit.</th>
                        <th className="text-right p-2 font-semibold">Total Vente</th>
                        <th className="text-right p-2 font-semibold">Total Coût</th>
                        <th className="text-center p-2 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Inverser l'ordre pour afficher le dernier ajouté en premier */}
                      {[...selectedItems].reverse().map((item, reverseIndex) => {
                        const originalIndex = selectedItems.length - 1 - reverseIndex;
                        return (
                          <tr key={item.product_id} className="border-b border-yellow-100 hover:bg-yellow-50">
                            <td className="p-2 font-mono text-xs">{item.product_id}</td>
                            <td className="p-2">
                              <div className="max-w-xs">
                                <div className="font-medium text-gray-900 truncate">{item.description}</div>
                                <div className="text-xs text-gray-500">{item.product_group} • {item.unit}</div>
                              </div>
                            </td>
                            <td className="p-2 text-center">
                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={item.quantity}
                                onChange={(e) => updateItemQuantity(item.product_id, e.target.value)}
                                className="w-16 text-center rounded border-gray-300 text-sm"
                              />
                            </td>
                            <td className="p-2 text-right">
                              <div className="text-green-600 font-medium">{formatCurrency(item.selling_price)}</div>
                              <div className="text-orange-600 text-xs">{formatCurrency(item.cost_price)}</div>
                            </td>
                            <td className="p-2 text-right font-medium text-green-700">
                              {formatCurrency(item.selling_price * item.quantity)}
                            </td>
                            <td className="p-2 text-right font-medium text-orange-700">
                              {formatCurrency(item.cost_price * item.quantity)}
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => removeItemFromSubmission(item.product_id)}
                                className="px-2 py-1 bg-red-100 text-red-800 rounded hover:bg-red-200 text-xs"
                                title="Supprimer"
                              >
                                ❌
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                
                {/* Résumé rapide */}
                <div className="mt-3 flex justify-between items-center text-sm">
                  <span className="text-yellow-700">
                    📊 {selectedItems.length} article(s) • 
                    Total quantité: {selectedItems.reduce((sum, item) => sum + item.quantity, 0)}
                  </span>
                  <div className="flex space-x-4">
                    <span className="text-green-700 font-medium">
                      💰 {formatCurrency(submissionForm.amount)}
                    </span>
                    <span className="text-orange-700 font-medium">
                      🏷️ {formatCurrency(calculatedCostTotal)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Totaux (vente et coût) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-green-100 p-4 rounded-lg border border-green-300">
                <label className="block text-lg font-semibold text-green-800 mb-2">
                  💰 Total Vente
                </label>
                <div className="text-2xl font-bold text-green-900">
                  {formatCurrency(submissionForm.amount)}
                </div>
              </div>
              
              <div className="bg-orange-100 p-4 rounded-lg border border-orange-300">
                <label className="block text-lg font-semibold text-orange-800 mb-2">
                  🏷️ Total Coût
                </label>
                <div className="text-2xl font-bold text-orange-900">
                  {formatCurrency(calculatedCostTotal)}
                </div>
              </div>

              {/* Marge bénéficiaire */}
              <div className="bg-blue-100 p-4 rounded-lg border border-blue-300">
                <label className="block text-lg font-semibold text-blue-800 mb-2">
                  📈 Marge
                </label>
                <div className="text-2xl font-bold text-blue-900">
                  {formatCurrency(submissionForm.amount - calculatedCostTotal)}
                </div>
                {submissionForm.amount > 0 && calculatedCostTotal > 0 && (
                  <div className="text-sm text-blue-700">
                    {((submissionForm.amount - calculatedCostTotal) / submissionForm.amount * 100).toFixed(1)}%
                  </div>
                )}
              </div>
            </div>

            {/* Note de fin */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-center">
              <p className="text-gray-600 text-sm">
                📋 {selectedItems.length} produit(s) sélectionné(s) • 
                Utilisez les boutons dans la barre mauve ci-dessus pour sauvegarder ou imprimer
              </p>
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
                  {/* Garder l'ordre normal pour l'impression (pas inversé) */}
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
                <p className="text-lg font-semibold">Total Coût: {formatCurrency(calculatedCostTotal)}</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold">Marge: {formatCurrency(submissionForm.amount - calculatedCostTotal)}</p>
                {submissionForm.amount > 0 && calculatedCostTotal > 0 && (
                  <p className="text-sm text-gray-600">
                    ({((submissionForm.amount - calculatedCostTotal) / submissionForm.amount * 100).toFixed(1)}%)
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
                      {submission.items && submission.items.length > 0 && (
                        <span className="font-medium text-orange-600">
                          🏷️ Coût: {formatCurrency(
                            submission.items.reduce((sum, item) => sum + ((item.cost_price || 0) * (item.quantity || 0)), 0)
                          )}
                        </span>
                      )}
                      {submission.amount > 0 && submission.items && submission.items.length > 0 && (
                        <span className="font-medium text-blue-600">
                          📈 Marge: {formatCurrency(
                            submission.amount - submission.items.reduce((sum, item) => sum + ((item.cost_price || 0) * (item.quantity || 0)), 0)
                          )}
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
                        status: submission.status,
                        items: submission.items || []
                      });
                      setSelectedItems(submission.items || []);
                      // Calculer le coût total à partir des items existants
                      const existingCostTotal = (submission.items || []).reduce((sum, item) => 
                        sum + ((item.cost_price || 0) * (item.quantity || 0)), 0
                      );
                      setCalculatedCostTotal(existingCostTotal);
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
