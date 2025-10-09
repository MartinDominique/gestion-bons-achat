import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Package, Plus, Minus, X, Edit, Save, 
  AlertCircle, CheckCircle, RotateCcw, Hash, Eye, EyeOff
} from 'lucide-react';

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
  setEditingMaterial(material.id);
  setEditForm({
    quantity: material.quantity?.toString() || '1',
    notes: material.notes || '',
    showPrice: material.showPrice || false
  });
  
  // Focus sur input après ouverture
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
    m.id === editingMaterial
      ? { 
          ...m, 
          quantity: quantity,
          notes: editForm.notes,
          showPrice: editForm.showPrice
        }
      : m
  ));
  
  setEditingMaterial(null);
  setEditForm({ quantity: '', notes: '', showPrice: false });
};

const cancelEditMaterial = () => {
  setEditingMaterial(null);
  setEditForm({ quantity: '', notes: '', showPrice: false });
};

const deleteMaterialFromModal = () => {
  if (!editingMaterial) return;
  
  if (confirm('Retirer ce matériau de la liste ?')) {
    const safeMaterials = materials || [];
    onMaterialsChange(safeMaterials.filter(m => m.id !== editingMaterial));
    setEditingMaterial(null);
    setEditForm({ quantity: '', notes: '', showPrice: false });
  }
};

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount || 0);
  };

  return (
    <div className="space-y-4">
      {/* Header avec bouton d'ajout */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">
          Matériaux utilisés ({(materials || []).length})
        </h3>
        
        <button
          type="button"
          onClick={() => {
            setShowProductSearch(true);
            setTimeout(() => {
              if (searchRef.current) {
                searchRef.current.focus();
              }
            }, 100);
          }}
          className="bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 flex items-center text-sm"
        >
          <Plus className="mr-1" size={16} />
          Ajouter matériau
        </button>
      </div>

      {/* Liste des matériaux ajoutés - VERSION COMPACTE */}
      {(!materials || materials.length === 0) ? (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <Package className="mx-auto mb-2 text-gray-300" size={32} />
          <p className="text-gray-500 mb-2">Aucun matériau ajouté</p>
          <p className="text-sm text-gray-400">
            Cliquez sur "Ajouter matériau" pour commencer
          </p>
        </div>
      ) : (
        <div className="bg-white border rounded-lg divide-y">
          {(materials || []).map((material) => (
            <div 
              key={material.id} 
              onClick={() => startEditMaterial(material)}
              className="p-3 hover:bg-blue-50 cursor-pointer active:bg-blue-100 transition-colors"
            >
              {/* Vue compacte - 2 lignes max */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {/* Ligne 1: Code + Quantité */}
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-mono font-semibold">
                        {material.product?.product_id || 'N/A'}
                      </span>
                      {material.showPrice && (
                        <span className="text-green-600 text-xs font-semibold">
                          {formatCurrency(material.product?.selling_price || 0)}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-bold text-gray-900">
                      Qté: {material.quantity}
                    </span>
                  </div>
                  
                  {/* Ligne 2: Description (tronquée) */}
                  <p className="text-sm text-gray-700 truncate">
                    {material.product?.description || 'Sans description'}
                  </p>
                  
                  {/* Notes si présentes */}
                  {material.notes && (
                    <p className="text-xs text-blue-600 mt-1 truncate">
                      📝 {material.notes}
                    </p>
                  )}
                </div>
                
                {/* Icône de menu */}
                <div className="text-gray-400 mt-1">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          ))}
          
          {/* Total si prix affichés */}
          {materials && materials.some(m => m.showPrice && m.product?.selling_price) && (
            <div className="p-3 bg-green-50 border-t-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-green-900">Total matériaux:</span>
                <span className="text-lg font-bold text-green-900">
                  {formatCurrency(
                    materials
                      .filter(m => m.showPrice && m.product?.selling_price)
                      .reduce((total, m) => 
                        total + (m.product.selling_price || 0) * (m.quantity || 0), 0
                      )
                  )}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal de recherche de produits */}
      {showProductSearch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Rechercher un produit</h3>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => loadProducts(true)}
                  disabled={loading}
                  className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                  title="Actualiser"
                >
                  <RotateCcw size={16} />
                </button>
                <button
                  onClick={() => {
                    setShowProductSearch(false);
                    setSearchTerm('');
                  }}
                  className="p-2 text-gray-400 hover:text-gray-600"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Recherche */}
            <div className="p-4 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Rechercher par code, description ou groupe..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {!searchTerm && (
                <p className="text-sm text-gray-500 mt-2">
                  💡 Tapez au moins 2 caractères pour rechercher dans vos {(products || []).length} produits
                </p>
              )}
            </div>

            {/* Liste produits */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center items-center h-32">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  <p className="ml-2 text-gray-600">Chargement produits...</p>
                </div>
              ) : (filteredProducts || []).length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Package className="mx-auto mb-4 text-gray-300" size={48} />
                  <p className="text-lg font-medium">
                    {searchTerm ? `Aucun produit trouvé pour "${searchTerm}"` : 'Commencez à taper pour rechercher'}
                  </p>
                  {searchTerm && (
                    <p className="text-sm mt-1">
                      Essayez avec un code produit ou une description différente
                    </p>
                  )}
                </div>
              ) : (
                <div className="divide-y">
                  {(filteredProducts || []).map((product) => (
                    <div
                      key={product.id}
                      className="p-4 hover:bg-gray-50 cursor-pointer"
                      onClick={() => addMaterial(product)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-mono">
                              {product.product_id}
                            </span>
                            {product.product_group && (
                              <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">
                                {product.product_group}
                              </span>
                            )}
                            {product.stock_qty < 10 && (
                              <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs">
                                Stock faible
                              </span>
                            )}
                          </div>
                          
                          <h4 className="text-sm font-medium text-gray-900 mb-1">
                            {product.description}
                          </h4>
                          
                          <div className="flex gap-4 text-xs text-gray-600">
                            {product.unit && <span>Unité: {product.unit}</span>}
                            <span>Stock: {product.stock_qty || 0}</span>
                            {/* SUPPRIMÉ: Plus de coûts affichés dans la recherche */}
                          </div>
                        </div>
                        
                        <Plus className="text-blue-600 ml-4" size={20} />
                      </div>
                    </div>
                  ))}
                  
                  {(filteredProducts || []).length >= 100 && (
                    <div className="p-4 bg-blue-50 text-center">
                      <p className="text-sm text-blue-600">
                        Plus de 100 résultats. Affinez votre recherche pour voir plus de produits.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t bg-gray-50 text-sm text-gray-600">
              {searchTerm && (
                <span>{(filteredProducts || []).length} produit(s) trouvé(s) pour "{searchTerm}"</span>
              )}
            </div>
          </div>
        </div>
      )}

        {/* Modal d'édition matériau - Mobile Friendly */}
      {editingMaterial && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-blue-600 text-white p-4 rounded-t-lg sticky top-0">
              <h3 className="text-lg font-semibold">Modifier matériau</h3>
            </div>
            
            {/* Produit info */}
            {(() => {
              const material = materials.find(m => m.id === editingMaterial);
              if (!material) return null;
              
              return (
                <>
                  <div className="p-4 bg-gray-50 border-b">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm font-mono">
                        {material.product?.product_id}
                      </span>
                      {material.product?.product_group && (
                        <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">
                          {material.product.product_group}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-900">
                      {material.product?.description}
                    </p>
                    {material.product?.selling_price && (
                      <p className="text-xs text-green-600 mt-1">
                        Prix: {formatCurrency(material.product.selling_price)} / {material.product?.unit || 'UN'}
                      </p>
                    )}
                  </div>
                  
                  {/* Formulaire d'édition */}
                  <div className="p-6 space-y-6">
                    {/* Quantité */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Quantité
                      </label>
                      <input
                        ref={editQuantityInputRef}
                        type="number"
                        step="0.5"
                        min="0.1"
                        value={editForm.quantity}
                        onChange={(e) => setEditForm({...editForm, quantity: e.target.value})}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            saveEditMaterial();
                          }
                        }}
                        className="w-full text-center text-4xl font-bold border-2 border-blue-500 rounded-lg py-4 px-4 focus:ring-4 focus:ring-blue-300"
                        inputMode="decimal"
                      />
                      <p className="text-center text-xs text-gray-500 mt-2">
                        Unité: {material.product?.unit || 'UN'}
                      </p>
                    </div>
                    
                    {/* Notes */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Notes (optionnel)
                      </label>
                      <textarea
                        rows={3}
                        value={editForm.notes}
                        onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
                        placeholder="Ex: Installé dans le corridor, remplacer en mars..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>
                    
                    {/* Toggle prix */}
                    {material.product?.selling_price && (
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="text-sm font-medium text-gray-900">Afficher le prix au client</p>
                          <p className="text-xs text-gray-600 mt-0.5">
                            {editForm.showPrice 
                              ? `Visible: ${formatCurrency(material.product.selling_price * parseFloat(editForm.quantity || 0))}`
                              : 'Prix masqué'
                            }
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditForm({...editForm, showPrice: !editForm.showPrice})}
                          className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                            editForm.showPrice ? 'bg-green-600' : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                              editForm.showPrice ? 'translate-x-7' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
            
            {/* Actions */}
            <div className="p-4 bg-gray-50 border-t space-y-2 sticky bottom-0">
              {/* Bouton Supprimer */}
              <button
                type="button"
                onClick={deleteMaterialFromModal}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-lg text-lg flex items-center justify-center gap-2"
              >
                <X size={20} />
                Supprimer ce matériau
              </button>
              
              {/* Boutons Annuler / Sauvegarder */}
              <div className="flex gap-3">
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
        </div>
      )}

        {/* Modal de quantité - Clavier numérique */}
      {pendingProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg w-full max-w-md">
            {/* Header */}
            <div className="bg-blue-600 text-white p-4 rounded-t-lg">
              <h3 className="text-lg font-semibold">Quantité</h3>
            </div>
            
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
            
            {/* Input quantité - GROS et clavier numérique */}
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
            
            {/* Actions */}
            <div className="p-4 bg-gray-50 flex gap-3 rounded-b-lg">
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
    </div>
  );
}
