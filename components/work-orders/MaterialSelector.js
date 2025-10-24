import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Package, Plus, Minus, X, Edit, Save, 
  AlertCircle, CheckCircle, RotateCcw, Hash, Eye, EyeOff
} from 'lucide-react';
import { supabase } from '../../lib/supabase'; 

// NOUVEAU: Plus de paramètre showPrices global - géré par ligne
export default function MaterialSelector({ 
  materials = [], 
  onMaterialsChange
}) {
  // États principaux (pattern InventoryManager)
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [showProductSearch, setShowProductSearch] = useState(false);
  
  // Cache intelligent (même pattern que votre InventoryManager)
  const [cachedProducts, setCachedProducts] = useState([]);
  const [lastFetchTime, setLastFetchTime] = useState(null);
  const [filteredCache, setFilteredCache] = useState({});
  
  // Modal d'édition complet
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [editForm, setEditForm] = useState({
    quantity: '',
    notes: '',
    showPrice: false
  });
  const editQuantityInputRef = useRef(null);
  
  const searchRef = useRef(null);
  // Modal de quantité avant ajout
  const [pendingProduct, setPendingProduct] = useState(null);
  const [pendingQuantity, setPendingQuantity] = useState('1');
  const quantityInputRef = useRef(null);

  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState({
    product_id: '',
    description: '',
    unit: 'UN'
  });

  // Chargement initial des produits avec cache
  useEffect(() => {
    loadProducts();
  }, []);

  // Filtrage produits (optimisé comme InventoryManager)
  useEffect(() => {
    applyProductFilters();
  }, [searchTerm, products]);

  const loadProducts = async (forceReload = false) => {
    try {
      const now = Date.now();
      const fiveMinutesAgo = now - (5 * 60 * 1000);
      
      // Cache intelligent - Même pattern que votre InventoryManager
      if (!forceReload && cachedProducts && cachedProducts.length > 0 && lastFetchTime && lastFetchTime > fiveMinutesAgo) {
        console.log("✅ Cache produits utilisé - Chargement instantané");
        setProducts(cachedProducts);
        return;
      }
      
      console.log("🔄 Chargement produits depuis Supabase");
      setLoading(true);
      
      // Charger tous les produits par pagination (comme InventoryManager)
      const allProducts = [];
      let page = 0;
      const pageSize = 1000;
      
      while (true) {
        const response = await fetch(`/api/products?page=${page}&limit=${pageSize}`);
        if (!response.ok) throw new Error('Erreur chargement produits');
        
        const responseData = await response.json();
        console.log(`Lot ${page + 1} - Réponse API produits:`, responseData);
        
        // Gérer différents formats de réponse
        let batch;
        if (Array.isArray(responseData)) {
          batch = responseData;
        } else if (responseData.data && Array.isArray(responseData.data)) {
          batch = responseData.data;
        } else {
          console.error('Format de réponse produits inattendu:', responseData);
          batch = [];
        }
        
        if (!batch || batch.length === 0) break;
        
        allProducts.push(...batch);
        console.log(`Lot ${page + 1}: ${batch.length} produits (Total: ${allProducts.length})`);
        
        if (batch.length < pageSize) break;
        page++;
      }
      
      // Sauvegarder en cache
      setCachedProducts(allProducts);
      setLastFetchTime(now);
      setProducts(allProducts);
      
      console.log(`✅ ${allProducts.length} produits chargés et mis en cache`);
      
    } catch (error) {
      console.error('Erreur chargement produits:', error);
      // Fallback sur cache expiré si disponible
      if (cachedProducts && cachedProducts.length > 0) {
        console.log("⚠️ Utilisation cache expiré comme fallback");
        setProducts(cachedProducts);
      }
    } finally {
      setLoading(false);
    }
  };

  const applyProductFilters = () => {
    // Cache de filtrage (pattern InventoryManager)
    const filterKey = searchTerm;
    
    if (filteredCache[filterKey]) {
      console.log("⚡ Cache de filtre utilisé - Instantané");
      setFilteredProducts(filteredCache[filterKey]);
      return;
    }
    
    const startTime = performance.now();
    
    let filtered;
    if (!searchTerm.trim()) {
      // Limiter à 50 premiers produits si pas de recherche pour la performance
      filtered = Array.isArray(products) ? products.slice(0, 50) : [];
    } else {
      const searchLower = searchTerm.toLowerCase();
      const safeProducts = Array.isArray(products) ? products : [];
      filtered = safeProducts.filter(product => 
        product.product_id && product.product_id.toLowerCase().includes(searchLower) ||
        (product.description && product.description.toLowerCase().includes(searchLower)) ||
        (product.product_group && product.product_group.toLowerCase().includes(searchLower))
      ).slice(0, 100); // Limiter à 100 résultats max
    }
    
    // Sauvegarder en cache
    setFilteredCache(prev => ({
      ...prev,
      [filterKey]: filtered
    }));
    
    setFilteredProducts(filtered);
    
    const endTime = performance.now();
    console.log(`✅ Filtres produits calculés en ${(endTime - startTime).toFixed(2)}ms (${filtered.length} items)`);
  };

  const addMaterial = (product) => {
    const safeMaterials = materials || [];
    // Vérifier si le produit n'est pas déjà ajouté
    if (safeMaterials.some(m => m.product_id === product.id)) {
      alert('Ce produit est déjà dans la liste');
      return;
    }
    
    // Ouvrir modal de quantité
    setPendingProduct(product);
    setPendingQuantity('1');
    
    // Focus sur input après ouverture du modal
    setTimeout(() => {
      if (quantityInputRef.current) {
        quantityInputRef.current.select();
      }
    }, 100);
  };
  
  const confirmAddMaterial = () => {
    if (!pendingProduct) return;
    
    const quantity = parseFloat(pendingQuantity);
    if (isNaN(quantity) || quantity <= 0) {
      alert('Veuillez entrer une quantité valide');
      return;
    }
    
    const safeMaterials = materials || [];
    const newMaterial = {
      id: Date.now().toString(),
      product_id: pendingProduct.id,
      product: pendingProduct,
      quantity: quantity,
      unit: pendingProduct.unit || 'pcs',
      notes: '',
      showPrice: false
    };
    
    onMaterialsChange([newMaterial, ...safeMaterials]);
    
    // Fermer tout
    setPendingProduct(null);
    setPendingQuantity('1');
    setShowProductSearch(false);
    setSearchTerm('');
  };
  
  const cancelAddMaterial = () => {
    setPendingProduct(null);
    setPendingQuantity('1');
  };
  
   const removeMaterial = (materialId) => {
    const safeMaterials = materials || [];
    if (confirm('Retirer ce matériau de la liste ?')) {
      onMaterialsChange(safeMaterials.filter(m => m.id !== materialId));
    }
  };

  const startEditMaterial = (material) => {
    setEditingMaterial(material);
    setEditForm({
      quantity: material.quantity.toString(),
      notes: material.notes || '',
      showPrice: material.showPrice || false
    });
    
    // Focus sur input après ouverture du modal
    setTimeout(() => {
      if (editQuantityInputRef.current) {
        editQuantityInputRef.current.select();
      }
    }, 100);
  };

  const saveEditMaterial = () => {
    if (!editingMaterial) return;
    
    const quantity = parseFloat(editForm.quantity);
    if (isNaN(quantity) || quantity <= 0) {
      alert('Veuillez entrer une quantité valide');
      return;
    }
    
    const safeMaterials = materials || [];
    onMaterialsChange(safeMaterials.map(m => 
      m.id === editingMaterial.id 
        ? { ...m, quantity, notes: editForm.notes, showPrice: editForm.showPrice }
        : m
    ));
    
    setEditingMaterial(null);
  };

  const cancelEditMaterial = () => {
    setEditingMaterial(null);
  };

  const saveQuickAddProduct = async () => {
    if (!quickAddForm.product_id || !quickAddForm.description) {
      alert('Veuillez remplir tous les champs requis');
      return;
    }

    try {
      console.log('💾 Sauvegarde produit non-inventaire:', quickAddForm);
      
      // Vérifier si le produit existe déjà
      const { data: existingProducts, error: checkError } = await supabase
        .from('products')
        .select('id')
        .eq('product_id', quickAddForm.product_id)
        .limit(1);

      if (checkError) {
        console.error('Erreur vérification produit:', checkError);
        throw checkError;
      }

      if (existingProducts && existingProducts.length > 0) {
        alert(`Le code produit "${quickAddForm.product_id}" existe déjà!`);
        return;
      }

      // Insérer le nouveau produit
      const { data: newProduct, error: insertError } = await supabase
        .from('products')
        .insert([{
          product_id: quickAddForm.product_id,
          description: quickAddForm.description,
          unit: quickAddForm.unit,
          product_group: 'NON-INVENTAIRE',
          is_active: true
        }])
        .select()
        .single();

      if (insertError) {
        console.error('Erreur insertion produit:', insertError);
        throw insertError;
      }

      console.log('✅ Produit créé:', newProduct);

      // Recharger les produits pour inclure le nouveau
      await loadProducts(true);

      // Ajouter automatiquement le produit aux matériaux
      const safeMaterials = materials || [];
      const newMaterial = {
        id: Date.now().toString(),
        product_id: newProduct.id,
        product: newProduct,
        quantity: 1,
        unit: newProduct.unit,
        notes: '',
        showPrice: false
      };
      
      onMaterialsChange([newMaterial, ...safeMaterials]);

      // Fermer le modal et réinitialiser
      setShowQuickAddModal(false);
      setQuickAddForm({ product_id: '', description: '', unit: 'UN' });
      
      alert('✅ Produit ajouté à la base de données et à votre bon de travail!');

    } catch (error) {
      console.error('Erreur sauvegarde produit:', error);
      alert('❌ Erreur lors de la sauvegarde du produit. Vérifiez la console.');
    }
  };

  // Liste matériaux (partie visible principale)
  const safeMaterials = materials || [];

  return (
    <div className="space-y-4">
      {/* Header + Bouton Ajouter */}
      <div className="flex justify-between items-center">
        <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <Package size={20} className="text-blue-600" />
          Matériel et Équipement
        </h3>
        <div className="flex gap-2">
          {/* Bouton Ajout Rapide Non-Inventaire */}
          <button
            type="button"
            onClick={() => setShowQuickAddModal(true)}
            className="bg-orange-500 hover:bg-orange-600 text-white p-2 rounded-lg flex items-center gap-1 text-sm"
            title="Ajouter un produit non-inventaire"
          >
            <Hash size={18} />
            <span className="hidden sm:inline">Non-Inv</span>
          </button>

          {/* Bouton Recherche Principale */}
          <button
            type="button"
            onClick={() => {
              setShowProductSearch(!showProductSearch);
              setTimeout(() => searchRef.current?.focus(), 100);
            }}
            className={`${
              showProductSearch 
                ? 'bg-red-500 hover:bg-red-600' 
                : 'bg-blue-600 hover:bg-blue-700'
            } text-white p-2 rounded-lg flex items-center gap-1`}
          >
            {showProductSearch ? <X size={18} /> : <Plus size={18} />}
            <span className="hidden sm:inline">
              {showProductSearch ? 'Fermer' : 'Ajouter'}
            </span>
          </button>
        </div>
      </div>

      {/* Recherche de produits */}
      {showProductSearch && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-3">
            <Search size={18} className="text-gray-400" />
            <input
              ref={searchRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Code produit, description ou groupe..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            )}
          </div>

          {loading && (
            <div className="text-center py-4 text-gray-600 text-sm">
              Chargement des produits...
            </div>
          )}

          {!loading && filteredProducts.length === 0 && searchTerm && (
            <div className="text-center py-4 text-gray-600 text-sm">
              Aucun produit trouvé
            </div>
          )}

          {!loading && filteredProducts.length === 0 && !searchTerm && (
            <div className="text-center py-4 text-gray-600 text-sm">
              Tapez pour rechercher un produit
            </div>
          )}

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {filteredProducts.map((product) => {
              const alreadyAdded = safeMaterials.some(m => m.product_id === product.id);
              
              return (
                <div 
                  key={product.id}
                  className={`p-3 rounded-lg border transition-colors ${
                    alreadyAdded 
                      ? 'bg-gray-100 border-gray-300 opacity-50' 
                      : 'bg-white border-gray-200 hover:bg-blue-50 cursor-pointer'
                  }`}
                  onClick={() => !alreadyAdded && addMaterial(product)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-mono">
                          {product.product_id}
                        </span>
                        {product.product_group && (
                          <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">
                            {product.product_group}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-900 truncate">
                        {product.description}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Unité: {product.unit || 'pcs'}
                      </p>
                    </div>
                    
                    {alreadyAdded ? (
                      <CheckCircle size={20} className="text-green-500 flex-shrink-0" />
                    ) : (
                      <Plus size={20} className="text-blue-600 flex-shrink-0" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-gray-500 mt-3 text-center">
            {filteredProducts.length > 0 
              ? `${filteredProducts.length} produit(s) affiché(s)` 
              : 'Affichage des 50 premiers produits par défaut'
            }
          </p>
        </div>
      )}

      {/* Liste des matériaux ajoutés */}
      {safeMaterials.length === 0 ? (
        <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <Package size={32} className="mx-auto mb-2 text-gray-400" />
          <p className="text-sm">Aucun matériau ajouté</p>
          <p className="text-xs mt-1">Cliquez sur "Ajouter" pour commencer</p>
        </div>
      ) : (
        <div className="space-y-2">
          {safeMaterials.map((material) => {
            const product = material.product || {};
            
            return (
              <div 
                key={material.id} 
                className="bg-white border border-gray-200 rounded-lg p-3"
              >
                <div className="flex items-start gap-3">
                  {/* Infos produit */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-mono">
                        {product.product_id}
                      </span>
                      {product.product_group && (
                        <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">
                          {product.product_group}
                        </span>
                      )}
                    </div>
                    
                    <p className="text-sm font-medium text-gray-900 mb-1">
                      {product.description}
                    </p>
                    
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-gray-700">
                        <strong>Qté:</strong> {material.quantity} {material.unit}
                      </span>
                      
                      {/* Toggle prix avec condition */}
                      {material.showPrice && product.unit_price && (
                        <>
                          <span className="text-gray-400">|</span>
                          <span className="text-gray-700">
                            <strong>Prix:</strong> {product.unit_price.toFixed(2)} $
                          </span>
                          <span className="text-gray-400">|</span>
                          <span className="text-blue-700 font-semibold">
                            Total: {(material.quantity * product.unit_price).toFixed(2)} $
                          </span>
                        </>
                      )}
                    </div>
                    
                    {material.notes && (
                      <p className="text-xs text-gray-600 mt-2 italic">
                        📝 {material.notes}
                      </p>
                    )}
                  </div>
                  
                  {/* Actions */}
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => startEditMaterial(material)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                      title="Modifier"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeMaterial(material.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      title="Retirer"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal d'édition - ADAPTÉ POUR TABLETTE */}
      {editingMaterial && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center p-4 z-[60] overflow-y-auto">
          <div className="bg-white rounded-lg w-full max-w-lg my-4 max-h-[calc(100vh-2rem)] flex flex-col">
            {/* Header - Fixe */}
            <div className="bg-blue-600 text-white p-4 rounded-t-lg flex-shrink-0">
              <h3 className="text-lg font-semibold">Modifier le matériau</h3>
            </div>
            
            {/* Contenu - Scrollable */}
            <div className="flex-1 overflow-y-auto">
              {/* Produit info */}
              <div className="p-4 bg-gray-50 border-b">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm font-mono">
                    {editingMaterial.product?.product_id}
                  </span>
                  {editingMaterial.product?.product_group && (
                    <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">
                      {editingMaterial.product.product_group}
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-gray-900">
                  {editingMaterial.product?.description}
                </p>
              </div>

              {/* Formulaire */}
              <div className="p-4 space-y-4">
                {/* Quantité */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quantité *
                  </label>
                  <input
                    ref={editQuantityInputRef}
                    type="number"
                    step="0.5"
                    min="0.1"
                    value={editForm.quantity}
                    onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        saveEditMaterial();
                      }
                    }}
                    className="w-full text-center text-3xl font-bold border-2 border-blue-500 rounded-lg py-4 px-3 focus:ring-2 focus:ring-blue-300"
                    inputMode="decimal"
                  />
                  <p className="text-xs text-gray-600 mt-1 text-center">
                    Unité: {editingMaterial.unit}
                  </p>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notes (optionnel)
                  </label>
                  <textarea
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    rows={3}
                    placeholder="Ex: Pièce de remplacement, client fourni..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>

                {/* Afficher prix */}
                {editingMaterial.product?.unit_price && (
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      {editForm.showPrice ? <Eye size={18} className="text-blue-600" /> : <EyeOff size={18} className="text-gray-400" />}
                      <span className="text-sm font-medium text-gray-700">
                        Afficher le prix sur le bon
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditForm({ ...editForm, showPrice: !editForm.showPrice })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        editForm.showPrice ? 'bg-blue-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          editForm.showPrice ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            {/* Actions - Fixes en bas */}
            <div className="p-4 bg-gray-50 border-t flex gap-3 rounded-b-lg flex-shrink-0">
              <button
                type="button"
                onClick={cancelEditMaterial}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-3 px-4 rounded-lg text-lg"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={saveEditMaterial}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg text-lg flex items-center justify-center gap-2"
              >
                <Save size={20} />
                Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de quantité - ADAPTÉ POUR TABLETTE */}
      {pendingProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center p-4 z-[60] overflow-y-auto">
          <div className="bg-white rounded-lg w-full max-w-md my-4 max-h-[calc(100vh-2rem)] flex flex-col">
            {/* Header - Fixe */}
            <div className="bg-blue-600 text-white p-4 rounded-t-lg flex-shrink-0">
              <h3 className="text-lg font-semibold">Quantité</h3>
            </div>
            
            {/* Contenu - Scrollable */}
            <div className="flex-1 overflow-y-auto">
              {/* Produit info */}
              <div className="p-4 bg-gray-50 border-b">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm font-mono">
                    {pendingProduct.product_id}
                  </span>
                  {pendingProduct.product_group && (
                    <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">
                      {pendingProduct.product_group}
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-gray-900">
                  {pendingProduct.description}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  Unité: {pendingProduct.unit || 'pcs'}
                </p>
              </div>
              
              {/* Input quantité */}
              <div className="p-8">
                <label className="block text-center text-sm font-medium text-gray-700 mb-4">
                  Entrez la quantité puis appuyez sur Enter
                </label>
                
                <input
                  ref={quantityInputRef}
                  type="number"
                  step="0.5"
                  min="0.1"
                  value={pendingQuantity}
                  onChange={(e) => setPendingQuantity(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      confirmAddMaterial();
                    }
                  }}
                  className="w-full text-center text-5xl font-bold border-4 border-blue-500 rounded-lg py-6 px-4 focus:ring-4 focus:ring-blue-300 focus:border-blue-600"
                  inputMode="decimal"
                  autoFocus
                  placeholder="0"
                />
                
                <p className="text-center text-sm text-gray-500 mt-3">
                  Ex: 10.5 ou 12 puis Enter ⏎
                </p>
              </div>
            </div>
            
            {/* Actions - Fixes en bas */}
            <div className="p-4 bg-gray-50 border-t flex gap-3 rounded-b-lg flex-shrink-0">
              <button
                type="button"
                onClick={cancelAddMaterial}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-4 px-4 rounded-lg text-lg"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmAddMaterial}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-4 rounded-lg text-lg"
              >
                ✓ Ajouter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🆕 NOUVEAU MODAL - AJOUT RAPIDE PRODUIT NON-INVENTAIRE */}
      {showQuickAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-lg w-full max-w-lg">
            {/* Header */}
            <div className="bg-orange-600 text-white p-4 rounded-t-lg flex items-center justify-between">
              <h3 className="text-lg font-semibold">➕ Nouveau Produit Non-Inventaire</h3>
              <button
                onClick={() => {
                  setShowQuickAddModal(false);
                  setQuickAddForm({ product_id: '', description: '', unit: 'UN' });
                }}
                className="text-white hover:text-gray-200"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Formulaire */}
            <div className="p-6 space-y-4">
              {/* Code Produit */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Code Produit / # Pièce *
                </label>
                <input
                  type="text"
                  value={quickAddForm.product_id}
                  onChange={(e) => setQuickAddForm({
                    ...quickAddForm, 
                    product_id: e.target.value.toUpperCase()
                  })}
                  placeholder="Ex: TEMP-001, SERVICE-XYZ"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 uppercase"
                  maxLength={50}
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">
                  Identifiant unique pour ce produit/service
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description *
                </label>
                <textarea
                  rows={3}
                  value={quickAddForm.description}
                  onChange={(e) => setQuickAddForm({
                    ...quickAddForm, 
                    description: e.target.value
                  })}
                  placeholder="Description détaillée du produit ou service..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  maxLength={200}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {quickAddForm.description.length}/200 caractères
                </p>
              </div>

              {/* Unité */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Unité
                </label>
                <select
                  value={quickAddForm.unit}
                  onChange={(e) => setQuickAddForm({
                    ...quickAddForm, 
                    unit: e.target.value
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                >
                  <option value="UN">UN - Unité</option>
                  <option value="M">M - Mètre</option>
                  <option value="PI">PI - Pied</option>
                  <option value="L">L - Litre</option>
                  <option value="H">H - Heure</option>
                  <option value="KG">KG - Kilogramme</option>
                  <option value="M2">M² - Mètre carré</option>
                  <option value="PI2">PI² - Pied carré</option>
                </select>
              </div>

              {/* Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  💡 Ce produit sera sauvegardé dans votre base de données et 
                  pourra être réutilisé pour d'autres bons de travail
                </p>
              </div>
            </div>
            
            {/* Actions */}
            <div className="p-4 bg-gray-50 border-t flex gap-3 rounded-b-lg">
              <button
                type="button"
                onClick={() => {
                  setShowQuickAddModal(false);
                  setQuickAddForm({ product_id: '', description: '', unit: 'UN' });
                }}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-3 px-4 rounded-lg"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={saveQuickAddProduct}
                disabled={!quickAddForm.product_id || !quickAddForm.description}
                className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 px-4 rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                ✅ Sauvegarder et Ajouter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
