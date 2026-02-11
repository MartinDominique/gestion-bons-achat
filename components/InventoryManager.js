/**
 * @file components/InventoryManager.js
 * @description Gestionnaire d'inventaire avec affichage des quantités
 *              - En main (stock_qty)
 *              - En commande (AF commandés/partiels)
 *              - Réservé (BT brouillon/signés + BL non envoyés)
 * @version 1.1.0
 * @date 2026-02-11
 * @changelog
 *   1.1.0 - Ajout quantités en commande et réservé dans cartes et modal modifier
 *   1.0.0 - Version initiale
 */
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  Search, Package, Edit, DollarSign, Filter, X,
  ChevronDown, Save, AlertCircle, TrendingUp, TrendingDown,
  Eye, Plus, Trash2, RotateCcw, Upload, ShoppingCart, Clock
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

  // Quantités en commande et réservé par product_id
  const [quantityMap, setQuantityMap] = useState({});

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
  const [marginPercent, setMarginPercent] = useState('');

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
    loadQuantities();
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

  // Charger les quantités en commande et réservé
  const loadQuantities = async () => {
    try {
      const map = {};

      // 1. En commande: AF avec statut ordered ou partial (items en JSONB)
      const { data: afPurchases, error: afError } = await supabase
        .from('supplier_purchases')
        .select('items, status')
        .in('status', ['ordered', 'partial']);

      if (!afError && afPurchases) {
        afPurchases.forEach(purchase => {
          const items = purchase.items || [];
          items.forEach(item => {
            if (!item.product_id) return;
            if (!map[item.product_id]) map[item.product_id] = { onOrder: 0, reserved: 0 };
            map[item.product_id].onOrder += (parseFloat(item.quantity) || 0);
          });
        });
      }

      // 2. Réservé BT: matériaux dans BT non complétés
      const { data: workOrders, error: woError } = await supabase
        .from('work_orders')
        .select('id, status')
        .in('status', ['draft', 'signed', 'pending_send']);

      if (!woError && workOrders && workOrders.length > 0) {
        const woIds = workOrders.map(wo => wo.id);
        const { data: woMaterials, error: womError } = await supabase
          .from('work_order_materials')
          .select('product_id, quantity')
          .in('work_order_id', woIds);

        if (!womError && woMaterials) {
          woMaterials.forEach(m => {
            if (!m.product_id) return;
            if (!map[m.product_id]) map[m.product_id] = { onOrder: 0, reserved: 0 };
            map[m.product_id].reserved += (parseFloat(m.quantity) || 0);
          });
        }
      }

      // 3. Réservé BL: matériaux dans BL non envoyés
      const { data: deliveryNotes, error: blError } = await supabase
        .from('delivery_notes')
        .select('id, status')
        .in('status', ['draft', 'ready_for_signature', 'signed', 'pending_send']);

      if (!blError && deliveryNotes && deliveryNotes.length > 0) {
        const blIds = deliveryNotes.map(bl => bl.id);
        const { data: blMaterials, error: blmError } = await supabase
          .from('delivery_note_materials')
          .select('product_id, quantity')
          .in('delivery_note_id', blIds);

        if (!blmError && blMaterials) {
          blMaterials.forEach(m => {
            if (!m.product_id) return;
            if (!map[m.product_id]) map[m.product_id] = { onOrder: 0, reserved: 0 };
            map[m.product_id].reserved += (parseFloat(m.quantity) || 0);
          });
        }
      }

      // 4. Réservé Soumissions: items dans soumissions acceptées
      const { data: submissions, error: subError } = await supabase
        .from('submissions')
        .select('items, status')
        .eq('status', 'accepted');

      if (!subError && submissions) {
        submissions.forEach(sub => {
          const items = sub.items || [];
          items.forEach(item => {
            if (!item.product_id) return;
            if (!map[item.product_id]) map[item.product_id] = { onOrder: 0, reserved: 0 };
            map[item.product_id].reserved += (parseFloat(item.quantity) || 0);
          });
        });
      }

      setQuantityMap(map);
      console.log(`✅ Quantités chargées: ${Object.keys(map).length} produits avec données`);
    } catch (error) {
      console.error('Erreur chargement quantités:', error);
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
        await loadData(true);
        await loadQuantities();
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
      
      // Détecter les changements pour l'email
      const changes = [];
      const oldCost = parseFloat(editingItem.cost_price) || 0;
      const oldSelling = parseFloat(editingItem.selling_price) || 0;
      const oldQty = parseInt(editingItem.stock_qty) || 0;
      
      if (updates.cost_price !== oldCost) {
        changes.push(`Prix coûtant: ${oldCost.toFixed(2)}$ → ${updates.cost_price.toFixed(2)}$`);
      }
      if (updates.selling_price !== oldSelling) {
        changes.push(`Prix vendant: ${oldSelling.toFixed(2)}$ → ${updates.selling_price.toFixed(2)}$`);
      }
      if (activeTab === 'products' && updates.stock_qty !== oldQty) {
        changes.push(`Quantité: ${oldQty} → ${updates.stock_qty}`);
      }
      
      const tableName = activeTab === 'products' ? 'products' : 'non_inventory_items';
      
      const { data, error } = await supabase
        .from(tableName)
        .update(updates)
        .eq('product_id', editingItem.product_id)
        .select();
      
      if (error) throw error;
      
      // Envoyer email si des changements ont été faits
      if (changes.length > 0) {
        try {
          await fetch('/api/send-inventory-change', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId: editingItem.product_id,
              description: editingItem.description,
              changes: changes,
              type: activeTab === 'products' ? 'Inventaire' : 'Non-Inventaire'
            })
          });
          console.log('📧 Email de notification envoyé');
        } catch (emailError) {
          console.error('Erreur envoi email:', emailError);
        }
      }
      
      // Mettre à jour localement au lieu de tout recharger
      if (data && data.length > 0) {
        const updatedItem = data[0];
        
        if (activeTab === 'products') {
          setProducts(prevProducts => 
            prevProducts.map(product => 
              product.product_id === updatedItem.product_id ? updatedItem : product
            )
          );
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
          setCachedNonInventoryItems(prevCache => 
            prevCache ? prevCache.map(item => 
              item.product_id === updatedItem.product_id ? updatedItem : item
            ) : null
          );
        }
        
        console.log('✅ Produit mis à jour localement et en cache');
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
              onClick={() => { loadData(true); loadQuantities(); }}
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
            {filteredItems.map((item) => {
              const qty = quantityMap[item.product_id] || { onOrder: 0, reserved: 0 };
              const stockQty = parseInt(item.stock_qty) || 0;
              return (
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
                      {activeTab === 'products' && stockQty < 10 && (
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
                      {item.supplier && <span>Fournisseur: {item.supplier}</span>}
                    </div>
                  </div>

                  {/* Quantités (3e colonne) - seulement pour produits inventaire */}
                  {activeTab === 'products' && (
                    <div className="flex flex-col items-center mx-3 min-w-[70px] text-xs space-y-0.5">
                      <div className={`font-semibold ${stockQty < 10 ? 'text-red-600' : 'text-gray-900'}`}>
                        {stockQty}
                      </div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide">en main</div>
                      {qty.onOrder > 0 && (
                        <div className="text-blue-600 font-medium" title="En commande (AF)">
                          +{qty.onOrder}
                          <span className="text-[10px] text-blue-400 ml-0.5">cmd</span>
                        </div>
                      )}
                      {qty.reserved > 0 && (
                        <div className="text-orange-600 font-medium" title="Réservé (BT/BL/Soumissions)">
                          -{qty.reserved}
                          <span className="text-[10px] text-orange-400 ml-0.5">rés</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Prix et marge */}
                  <div className="flex flex-col items-end space-y-1 ml-3">
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
              );
            })}
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
      
              {/* Calcul automatique de marge */}
              {editForm.cost_price && parseFloat(editForm.cost_price) > 0 && (
                <div className="bg-green-50 p-3 rounded-lg">
                  <label className="block text-sm font-medium text-green-800 mb-2">
                    Calcul automatique par marge %
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={marginPercent}
                      onChange={(e) => setMarginPercent(e.target.value)}
                      className="flex-1 rounded-lg border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 p-2"
                      placeholder="Ex: 25"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const cost = parseFloat(editForm.cost_price) || 0;
                        const margin = parseFloat(marginPercent) || 0;
                        if (cost > 0 && margin > 0) {
                          const newSellingPrice = cost * (1 + margin / 100);
                          setEditForm({...editForm, selling_price: newSellingPrice.toFixed(2)});
                        }
                      }}
                      disabled={!marginPercent || parseFloat(marginPercent) <= 0}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      OK
                    </button>
                  </div>
                  <p className="text-xs text-green-600 mt-1">
                    Entrez le % de marge désiré et cliquez OK
                  </p>
                </div>
              )}
      
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

                  {/* Quantités en commande et réservé (lecture seule) */}
                  {editingItem && (() => {
                    const qty = quantityMap[editingItem.product_id] || { onOrder: 0, reserved: 0 };
                    if (qty.onOrder === 0 && qty.reserved === 0) return null;
                    const stockVal = parseInt(editForm.stock_qty) || 0;
                    const dispo = stockVal - qty.reserved;
                    return (
                      <div className="mt-3 bg-gray-50 rounded-lg p-3 space-y-1.5">
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Détail quantités</div>
                        {qty.onOrder > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-blue-700">En commande (AF)</span>
                            <span className="font-medium text-blue-700">+{qty.onOrder}</span>
                          </div>
                        )}
                        {qty.reserved > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-orange-700">Réservé (BT/BL/Soum.)</span>
                            <span className="font-medium text-orange-700">-{qty.reserved}</span>
                          </div>
                        )}
                        <div className="border-t pt-1.5 flex justify-between text-sm">
                          <span className={`font-medium ${dispo < 0 ? 'text-red-700' : 'text-green-700'}`}>Disponible réel</span>
                          <span className={`font-bold ${dispo < 0 ? 'text-red-700' : 'text-green-700'}`}>{dispo}</span>
                        </div>
                      </div>
                    );
                  })()}
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
                onClick={() => {
                  closeEditModal();
                  setMarginPercent('');
                }}
                disabled={saving}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  saveChanges();
                  setMarginPercent('');
                }}
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
