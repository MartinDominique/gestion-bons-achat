import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Search, Package, Edit, DollarSign, Filter, X, 
  ChevronDown, Save, AlertCircle, TrendingUp, TrendingDown,
  Eye, Plus, Trash2, RotateCcw, Upload
} from 'lucide-react';

export default function InventoryManager() {
  // États principaux
  const [products, setProducts] = useState([]);
  const [nonInventoryItems, setNonInventoryItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [productGroups, setProductGroups] = useState([]);
  const [activeTab, setActiveTab] = useState('products'); // 'products' ou 'non_inventory'
  const [showFilters, setShowFilters] = useState(false);
  
  // Cache intelligent
  const [cachedProducts, setCachedProducts] = useState(null);
  const [cachedNonInventoryItems, setCachedNonInventoryItems] = useState(null);
  const [lastFetchTime, setLastFetchTime] = useState(null);
  
  // Cache pour les filtres (optimisation supplémentaire)
  const [filteredCache, setFilteredCache] = useState({});
  const [lastFilterParams, setLastFilterParams] = useState('');
  
  // Modal d'édition
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState({
    cost_price: '',
    selling_price: '',
    stock_qty: ''
  });
  const [saving, setSaving] = useState(false);
  
  // États pour l'upload d'inventaire
  const [showInventoryUpload, setShowInventoryUpload] = useState(false);
  const [uploadingInventory, setUploadingInventory] = useState(false);
  
  // Statistiques (gardées pour les calculs internes)
  const [stats, setStats] = useState({
    total: 0,
    lowStock: 0,
    totalValue: 0
  });

  // Chargement initial
  useEffect(() => {
    loadData();
  }, []);

  // Filtrage et recherche
  useEffect(() => {
    applyFilters();
  }, [searchTerm, selectedGroup, activeTab, products, nonInventoryItems]);

  const loadData = async (forceReload = false) => {
    try {
      const now = Date.now();
      const fiveMinutesAgo = now - (5 * 60 * 1000); // 5 minutes en millisecondes
      
      // 🧠 CACHE INTELLIGENT - Vérifier si on peut utiliser le cache
      if (!forceReload && cachedProducts && cachedNonInventoryItems && lastFetchTime && lastFetchTime > fiveMinutesAgo) {
        console.log("✅ Cache utilisé - Chargement instantané (données < 5 min)");
        setProducts(cachedProducts);
        setNonInventoryItems(cachedNonInventoryItems);
        
        // Extraire les groupes depuis le cache
        const allItems = [...cachedProducts, ...cachedNonInventoryItems];
        const groups = [...new Set(allItems
          .map(item => item.product_group)
          .filter(group => group && group.trim() !== '')
        )].sort();
        setProductGroups(groups);
        
        setLoading(false);
        return;
      }
      
      // 📡 Chargement depuis la base de données
      console.log(`📡 Chargement depuis Supabase ${forceReload ? '(rechargement forcé)' : '(données expirées ou premier chargement)'}`);
      setLoading(true);
      
      // Charger TOUS les produits par pagination
      const allProducts = [];
      let page = 0;
      const pageSize = 1000;
      
      while (true) {
        const { data: batch, error } = await supabase
          .from('products')
          .select('*')
          .range(page * pageSize, (page + 1) * pageSize - 1)
          .order('product_id', { ascending: true });
        
        if (error) throw error;
        if (!batch || batch.length === 0) break;
        
        allProducts.push(...batch);
        console.log(`Lot ${page + 1}: ${batch.length} produits (Total: ${allProducts.length})`);
        
        if (batch.length < pageSize) break; // Dernier lot
        page++;
      }
      
      // Charger les articles non-inventaire
      const { data: nonInventoryData, error: nonInventoryError } = await supabase
        .from('non_inventory_items')
        .select('*')
        .order('product_id', { ascending: true });
      
      if (nonInventoryError) throw nonInventoryError;
      
      console.log(`✅ Chargement terminé: ${allProducts.length} produits + ${(nonInventoryData || []).length} non-inventaire`);
      
      // 💾 SAUVEGARDER EN CACHE
      setCachedProducts(allProducts);
      setCachedNonInventoryItems(nonInventoryData || []);
      setLastFetchTime(now);
      console.log("💾 Données mises en cache pour 5 minutes");
      
      // Mettre à jour les états
      setProducts(allProducts);
      setNonInventoryItems(nonInventoryData || []);
      
      // 🧹 Nettoyer le cache de filtres quand les données changent
      setFilteredCache({});
      setLastFilterParams('');
      
      // Extraire les groupes uniques
      const allItems = [...allProducts, ...(nonInventoryData || [])];
      const groups = [...new Set(allItems
        .map(item => item.product_group)
        .filter(group => group && group.trim() !== '')
      )].sort();
      
      setProductGroups(groups);
      
    } catch (error) {
      console.error('Erreur chargement inventaire:', error);
      alert('Erreur lors du chargement de l\'inventaire');
    } finally {
      setLoading(false);
    }
  };

  // Fonction pour gérer l'upload d'inventaire
  const handleInventoryUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploadingInventory(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/import-inventory', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Inventaire importé avec succès !\n${result.message || 'Produits mis à jour'}`);
        await loadData(true); // Force le rechargement après import
      } else {
        const errorData = await response.json();
        alert(`Erreur lors de l'import: ${errorData.error || 'Erreur inconnue'}`);
      }
    } catch (error) {
      console.error('Erreur upload inventaire:', error);
      alert('Erreur lors de l\'upload du fichier');
    } finally {
      setUploadingInventory(false);
      setShowInventoryUpload(false);
    }
  };

  const applyFilters = () => {
    // 🚀 OPTIMISATION - Créer une clé de cache unique basée sur les paramètres de filtre
    const filterKey = `${activeTab}-${searchTerm}-${selectedGroup}`;
    
    // 🧠 Vérifier si on a déjà calculé ce filtre
    if (filteredCache[filterKey] && filterKey === lastFilterParams) {
      console.log("⚡ Cache de filtre utilisé - Instantané");
      setFilteredItems(filteredCache[filterKey].items);
      setStats(filteredCache[filterKey].stats);
      return;
    }
    
    console.log("🔄 Calcul des filtres...");
    const startTime = performance.now();
    
    const sourceData = activeTab === 'products' ? products : nonInventoryItems;
    
    // 🚀 OPTIMISATION - Filtrage optimisé
    let filtered;
    if (!searchTerm && selectedGroup === 'all') {
      // Pas de filtre = toutes les données (évite la boucle)
      filtered = sourceData;
    } else {
      // Filtrage nécessaire
      const searchLower = searchTerm.toLowerCase();
      filtered = sourceData.filter(item => {
        // Recherche optimisée - éviter les appels multiples à toLowerCase()
        const matchesSearch = !searchTerm || 
          item.product_id.toLowerCase().includes(searchLower) ||
          (item.description && item.description.toLowerCase().includes(searchLower));
        
        // Filtre par groupe
        const matchesGroup = selectedGroup === 'all' || item.product_group === selectedGroup;
        
        return matchesSearch && matchesGroup;
      });
    }
    
    // 🚀 OPTIMISATION - Calcul des statistiques optimisé
    let totalValue = 0;
    let lowStock = 0;
    
    if (activeTab === 'products') {
      // Une seule boucle pour calculer les deux statistiques
      for (const item of filtered) {
        const stock = parseInt(item.stock_qty) || 0;
        const cost = parseFloat(item.cost_price) || 0;
        
        totalValue += (stock * cost);
        if (stock < 10) lowStock++;
      }
    } else {
      // Pour non-inventaire, seulement la valeur totale
      for (const item of filtered) {
        const cost = parseFloat(item.cost_price) || 0;
        totalValue += cost; // Pas de stock pour non-inventaire
      }
    }
    
    const newStats = {
      total: filtered.length,
      lowStock: lowStock,
      totalValue: totalValue
    };
    
    // 💾 Sauvegarder en cache
    const cacheData = {
      items: filtered,
      stats: newStats
    };
    
    setFilteredCache(prev => ({
      ...prev,
      [filterKey]: cacheData
    }));
    setLastFilterParams(filterKey);
    
    // Mettre à jour les états
    setFilteredItems(filtered);
    setStats(newStats);
    
    const endTime = performance.now();
    console.log(`✅ Filtres calculés en ${(endTime - startTime).toFixed(2)}ms (${filtered.length} items)`);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setEditForm({
      cost_price: item.cost_price?.toString() || '',
      selling_price: item.selling_price?.toString() || '',
      stock_qty: item.stock_qty?.toString() || ''
    });
  };

  const closeEditModal = () => {
    setEditingItem(null);
    setEditForm({
      cost_price: '',
      selling_price: '',
      stock_qty: ''
    });
  };

  const saveChanges = async () => {
    if (!editingItem) return;
    
    try {
      setSaving(true);
      
      const updates = {
        cost_price: parseFloat(editForm.cost_price) || 0,
        selling_price: parseFloat(editForm.selling_price) || 0,
      };
      
      // Ajouter stock_qty seulement pour les produits
      if (activeTab === 'products') {
        updates.stock_qty = parseInt(editForm.stock_qty) || 0;
      }
      
      const tableName = activeTab === 'products' ? 'products' : 'non_inventory_items';
      
      const { data, error } = await supabase
        .from(tableName)
        .update(updates)
        .eq('product_id', editingItem.product_id)
        .select();
      
      if (error) throw error;
      
      // Mettre à jour localement au lieu de tout recharger
      if (data && data.length > 0) {
        const updatedItem = data[0];
        
        if (activeTab === 'products') {
          setProducts(prevProducts => 
            prevProducts.map(product => 
              product.product_id === updatedItem.product_id ? updatedItem : product
            )
          );
          // Mettre à jour le cache aussi
          setCachedProducts(prevCache => 
            prevCache ? prevCache.map(product => 
              product.product_id === updatedItem.product_id ? updatedItem : product
            ) : null
          );
        } else {
          setNonInventoryItems(prevItems => 
            prevItems.map(item => 
              item.product_id === updatedItem.product_id ? updatedItem : item
            )
          );
          // Mettre à jour le cache aussi
          setCachedNonInventoryItems(prevCache => 
            prevCache ? prevCache.map(item => 
              item.product_id === updatedItem.product_id ? updatedItem : item
            ) : null
          );
        }
        
        console.log('✅ Produit mis à jour localement et en cache');
        
        // 🧹 Nettoyer le cache de filtres car les données ont changé
        setFilteredCache({});
        setLastFilterParams('');
        
        alert('Modifications sauvegardées avec succès !');
      }
      
      closeEditModal();
      
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      alert('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount || 0);
  };

  const getMarginColor = (costPrice, sellingPrice) => {
    const cost = parseFloat(costPrice) || 0;
    const selling = parseFloat(sellingPrice) || 0;
    
    if (cost === 0) return 'text-gray-400';
    
    const margin = ((selling - cost) / cost) * 100;
    
    if (margin < 10) return 'text-red-600';
    if (margin < 25) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getMarginPercentage = (costPrice, sellingPrice) => {
    const cost = parseFloat(costPrice) || 0;
    const selling = parseFloat(sellingPrice) || 0;
    
    if (cost === 0) return '-%';
    
    const margin = ((selling - cost) / cost) * 100;
    return `${margin.toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="ml-4 text-blue-600 font-medium">Chargement de l'inventaire...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-2 sm:p-4 space-y-3">
      
      {/* En-tête compact - STATISTIQUES SUPPRIMÉES */}
      <div className="bg-gradient-to-r from-blue-500 via-purple-500 to-indigo-500 rounded-lg shadow-lg p-3 text-white">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h2 className="text-xl font-bold">Gestion Inventaire</h2>
            <div className="flex items-center gap-2">
              <p className="text-white/90 text-sm mt-1">
                Consultez et modifiez vos produits et prix
              </p>
              {lastFetchTime && (
                <span className="text-xs bg-white/20 px-2 py-1 rounded-full">
                  {Date.now() - lastFetchTime < 300000 ? '🟢 Cache' : '🔄 Actualisé'}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={() => setShowInventoryUpload(true)}
              className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-xs font-medium hover:bg-white/20 disabled:opacity-50 flex items-center"
            >
              <Upload className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Import</span>
            </button>
            <button
              onClick={() => loadData(true)} // Force le rechargement
              disabled={loading}
              className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-xs font-medium hover:bg-white/20 disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div className="bg-white rounded-lg shadow-md">
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('products')}
            className={`flex-1 py-3 px-4 text-sm font-medium border-b-2 ${
              activeTab === 'products'
                ? 'border-blue-500 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Package className="w-4 h-4 inline mr-2" />
            Produits ({products.length})
          </button>
          
          <button
            onClick={() => setActiveTab('non_inventory')}
            className={`flex-1 py-3 px-4 text-sm font-medium border-b-2 ${
              activeTab === 'non_inventory'
                ? 'border-purple-500 text-purple-600 bg-purple-50'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Eye className="w-4 h-4 inline mr-2" />
            Non-inventaire ({nonInventoryItems.length})
          </button>
        </div>

        {/* Barre de recherche et filtres */}
        <div className="p-3 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Recherche */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Rechercher par code ou description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base"
              />
            </div>

            {/* Bouton filtres mobile */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="sm:hidden px-4 py-3 bg-gray-100 rounded-lg border border-gray-300 flex items-center justify-center"
            >
              <Filter className="w-5 h-5 mr-2" />
              Filtres
            </button>
          </div>

          {/* Filtres */}
          <div className={`${showFilters ? 'block' : 'hidden'} sm:block`}>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className="w-full sm:w-auto px-2 py-2 rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
              >
                <option value="all">Tous les groupes</option>
                {productGroups.map(group => (
                  <option key={group} value={group}>{group}</option>
                ))}
              </select>
              
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="w-full sm:w-auto px-2 py-2 bg-red-100 text-red-700 rounded-lg text-xs hover:bg-red-200 flex items-center justify-center"
                >
                  <X className="w-4 h-4 mr-1" />
                  Effacer recherche
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Liste des produits */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {filteredItems.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500 text-lg">
              {searchTerm || selectedGroup !== 'all' 
                ? 'Aucun produit trouvé avec ces critères'
                : 'Aucun produit dans cette catégorie'
              }
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredItems.map((item) => (
              <div key={item.id} className="p-4 hover:bg-gray-50">
                <div className="flex justify-between items-start">
                  
                  {/* Informations produit */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-mono">
                        {item.product_id}
                      </span>
                      {item.product_group && (
                        <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">
                          {item.product_group}
                        </span>
                      )}
                      {activeTab === 'products' && item.stock_qty < 10 && (
                        <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs">
                          Stock faible
                        </span>
                      )}
                    </div>
                    
                    <h3 className="text-sm font-medium text-gray-900 mb-1 pr-2">
                      {item.description || 'Description non disponible'}
                    </h3>
                    
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                      {item.unit && <span>Unité: {item.unit}</span>}
                      {activeTab === 'products' && (
                        <span className={item.stock_qty < 10 ? 'text-red-600 font-medium' : ''}>
                          Stock: {item.stock_qty || 0}
                        </span>
                      )}
                      {item.supplier && <span>Fournisseur: {item.supplier}</span>}
                    </div>
                  </div>

                  {/* Prix et marge */}
                  <div className="flex flex-col items-end space-y-1 ml-4">
                    <div className="text-right">
                      <div className="text-sm font-medium text-gray-900">
                        {formatCurrency(item.selling_price)}
                      </div>
                      <div className="text-xs text-gray-500">
                        Coût: {formatCurrency(item.cost_price)}
                      </div>
                    </div>
                    
                    <div className={`text-xs font-medium ${getMarginColor(item.cost_price, item.selling_price)}`}>
                      {getMarginPercentage(item.cost_price, item.selling_price)}
                    </div>
                    
                    <button
                      onClick={() => openEditModal(item)}
                      className="mt-2 px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-xs flex items-center"
                    >
                      <Edit className="w-3 h-3 mr-1" />
                      Modifier
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal d'édition */}
      {editingItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-md shadow-xl">
            <div className="bg-blue-50 px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-blue-900">
                Modifier {editingItem.product_id}
              </h3>
              <p className="text-sm text-blue-700 mt-1">
                {editingItem.description}
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Prix coût
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.cost_price}
                  onChange={(e) => setEditForm({...editForm, cost_price: e.target.value})}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Prix de vente *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.selling_price}
                  onChange={(e) => setEditForm({...editForm, selling_price: e.target.value})}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3"
                  placeholder="0.00"
                  required
                />
              </div>

              {activeTab === 'products' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quantité en stock
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editForm.stock_qty}
                    onChange={(e) => setEditForm({...editForm, stock_qty: e.target.value})}
                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3"
                    placeholder="0"
                  />
                </div>
              )}

              {/* Aperçu de la marge */}
              {editForm.cost_price && editForm.selling_price && (
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Aperçu marge:</div>
                  <div className={`text-lg font-medium ${getMarginColor(editForm.cost_price, editForm.selling_price)}`}>
                    {getMarginPercentage(editForm.cost_price, editForm.selling_price)}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-gray-50 px-6 py-4 flex gap-3">
              <button
                onClick={closeEditModal}
                disabled={saving}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={saveChanges}
                disabled={saving || !editForm.selling_price}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Sauvegarde...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Sauvegarder
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal upload inventaire */}
      {showInventoryUpload && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md">
            <div className="p-4 sm:p-6">
              <h3 className="text-lg font-semibold mb-4">
                <Upload className="w-5 h-5 inline mr-2 text-blue-600" />
                Importer Inventaire
              </h3>
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Sélectionnez votre fichier d'inventaire Excel (.xlsx, .xls) ou CSV
                </p>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleInventoryUpload}
                  className="block w-full text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-full file:border-0
                    file:text-sm file:font-semibold
                    file:bg-blue-50 file:text-blue-700
                    hover:file:bg-blue-100"
                  disabled={uploadingInventory}
                />
                {uploadingInventory && (
                  <div className="flex items-center justify-center p-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2"></div>
                    <span className="text-blue-600">Import en cours...</span>
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowInventoryUpload(false)}
                    disabled={uploadingInventory}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
