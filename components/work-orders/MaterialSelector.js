import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Package, Plus, Minus, X, Edit, Save, 
  AlertCircle, CheckCircle, RotateCcw, Hash, Eye, EyeOff
} from 'lucide-react';

// NOUVEAU: Ajout du paramètre showPrices
export default function MaterialSelector({ 
  materials = [], 
  onMaterialsChange, 
  showPrices = false // NOUVEAU: Prix cachés par défaut
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
  
  // Edition inline
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [editForm, setEditForm] = useState({
    quantity: '',
    notes: ''
  });
  
  const searchRef = useRef(null);

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
    
    const newMaterial = {
      id: Date.now().toString(), // Temp ID
      product_id: product.id,
      product: product,
      quantity: 1,
      unit: product.unit || 'pcs',
      notes: ''
    };
    
    onMaterialsChange([...safeMaterials, newMaterial]);
    setShowProductSearch(false);
    setSearchTerm('');
  };

  const removeMaterial = (materialId) => {
    const safeMaterials = materials || [];
    if (confirm('Retirer ce matériau de la liste ?')) {
      onMaterialsChange(safeMaterials.filter(m => m.id !== materialId));
    }
  };

  const updateMaterialQuantity = (materialId, change) => {
    const safeMaterials = materials || [];
    onMaterialsChange(safeMaterials.map(m => 
      m.id === materialId 
        ? { ...m, quantity: Math.max(0, (m.quantity || 0) + change) }
        : m
    ));
  };

  const startEditMaterial = (material) => {
    setEditingMaterial(material.id);
    setEditForm({
      quantity: material.quantity?.toString() || '1',
      notes: material.notes || ''
    });
  };

  const saveEditMaterial = () => {
    if (!editingMaterial) return;
    
    const safeMaterials = materials || [];
    onMaterialsChange(safeMaterials.map(m => 
      m.id === editingMaterial
        ? { 
            ...m, 
            quantity: parseFloat(editForm.quantity) || 1,
            notes: editForm.notes
          }
        : m
    ));
    
    setEditingMaterial(null);
    setEditForm({ quantity: '', notes: '' });
  };

  const cancelEditMaterial = () => {
    setEditingMaterial(null);
    setEditForm({ quantity: '', notes: '' });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount || 0);
  };

  return (
    <div className="space-y-4">
      {/* Header avec bouton d'ajout et indicateur prix */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">
          Matériaux utilisés ({(materials || []).length})
        </h3>
        <div className="flex items-center gap-3">
          {/* NOUVEAU: Indicateur prix */}
          <div className="flex items-center text-sm text-gray-600">
            {showPrices ? (
              <div className="flex items-center">
                <Eye size={14} className="mr-1 text-green-600" />
                <span className="text-green-600">Prix affichés</span>
              </div>
            ) : (
              <div className="flex items-center">
                <EyeOff size={14} className="mr-1 text-gray-400" />
                <span className="text-gray-400">Prix cachés</span>
              </div>
            )}
          </div>
          
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
      </div>

      {/* Liste des matériaux ajoutés */}
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
            <div key={material.id} className="p-4">
              {editingMaterial === material.id ? (
                // Mode édition
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-mono">
                      {material.product?.product_id}
                    </span>
                    <span className="text-sm font-medium text-gray-900">
                      {material.product?.description}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Quantité
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editForm.quantity}
                        onChange={(e) => setEditForm({...editForm, quantity: e.target.value})}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Notes
                      </label>
                      <input
                        type="text"
                        value={editForm.notes}
                        onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
                        placeholder="Notes optionnelles..."
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={saveEditMaterial}
                      className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700 flex items-center"
                    >
                      <Save className="mr-1" size={12} />
                      Sauvegarder
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditMaterial}
                      className="bg-gray-100 text-gray-700 px-3 py-1 rounded text-xs hover:bg-gray-200"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                // Mode affichage - MODIFIÉ: Prix conditionnels
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-mono">
                        {material.product?.product_id}
                      </span>
                      {material.product?.product_group && (
                        <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">
                          {material.product.product_group}
                        </span>
                      )}
                    </div>
                    
                    <h4 className="text-sm font-medium text-gray-900 mb-1">
                      {material.product?.description}
                    </h4>
                    
                    <div className="flex items-center gap-4 text-xs text-gray-600">
                      <span className="font-medium">
                        Qté: {material.quantity} {material.unit}
                      </span>
                      
                      {/* MODIFIÉ: Prix conditionnel */}
                      {showPrices && material.product?.cost_price && (
                        <span className="text-green-600 font-medium">
                          Coût unitaire: {formatCurrency(material.product.cost_price)}
                        </span>
                      )}
                      
                      {/* NOUVEAU: Total si prix affiché */}
                      {showPrices && material.product?.cost_price && (
                        <span className="text-green-700 font-bold">
                          Total: {formatCurrency(material.product.cost_price * material.quantity)}
                        </span>
                      )}
                      
                      {material.notes && (
                        <span className="text-blue-600">
                          Note: {material.notes}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-1 ml-4">
                    {/* Contrôles quantité */}
                    <button
                      type="button"
                      onClick={() => updateMaterialQuantity(material.id, -1)}
                      className="p-1 text-gray-400 hover:text-gray-600 rounded border border-gray-300"
                      disabled={material.quantity <= 1}
                    >
                      <Minus size={12} />
                    </button>
                    
                    <span className="px-2 py-1 bg-gray-50 rounded text-sm min-w-[3rem] text-center">
                      {material.quantity}
                    </span>
                    
                    <button
                      type="button"
                      onClick={() => updateMaterialQuantity(material.id, 1)}
                      className="p-1 text-gray-400 hover:text-gray-600 rounded border border-gray-300"
                    >
                      <Plus size={12} />
                    </button>
                    
                    {/* Actions */}
                    <button
                      type="button"
                      onClick={() => startEditMaterial(material)}
                      className="ml-2 p-1 text-blue-600 hover:text-blue-800"
                      title="Modifier"
                    >
                      <Edit size={14} />
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => removeMaterial(material.id)}
                      className="p-1 text-red-600 hover:text-red-800"
                      title="Retirer"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          
          {/* NOUVEAU: Total général si prix affichés */}
          {showPrices && materials && materials.length > 0 && (
            <div className="p-4 bg-green-50 border-t">
              <div className="flex justify-between items-center">
                <span className="font-medium text-green-900">Total matériaux:</span>
                <span className="text-lg font-bold text-green-900">
                  {formatCurrency(
                    materials.reduce((total, m) => 
                      total + (m.product?.cost_price || 0) * (m.quantity || 0), 0
                    )
                  )}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal de recherche de produits - MODIFIÉ: Prix conditionnels */}
      {showProductSearch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Rechercher un produit</h3>
                {/* NOUVEAU: Indicateur prix dans modal */}
                {showPrices ? (
                  <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs flex items-center">
                    <Eye size={12} className="mr-1" />
                    Prix affichés
                  </span>
                ) : (
                  <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs flex items-center">
                    <EyeOff size={12} className="mr-1" />
                    Prix cachés
                  </span>
                )}
              </div>
              
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
                            
                            {/* MODIFIÉ: Prix conditionnel dans recherche */}
                            {showPrices && product.cost_price && (
                              <span className="text-green-600 font-medium">
                                Prix: {formatCurrency(product.cost_price)}
                              </span>
                            )}
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
    </div>
  );
}
