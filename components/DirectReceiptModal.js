/**
 * @file components/DirectReceiptModal.js
 * @description Modal de r\u00e9ception directe de marchandises (sans AF).
 *              - Recherche et s\u00e9lection de produits existants
 *              - Cr\u00e9ation de nouveaux produits dans l'inventaire
 *              - Mode R\u00e9ception (IN) et mode Ajustement (+/-)
 *              - Met \u00e0 jour le stock (products / non_inventory_items)
 *              - Cr\u00e9e les mouvements d'inventaire
 *              - D\u00e9calage historique prix (price shift) si cost_price change
 * @version 1.1.0
 * @date 2026-02-18
 * @changelog
 *   1.1.0 - Retrait checkbox non-inventaire du formulaire création (items toujours dans products)
 *   1.0.0 - Version initiale
 */
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { buildPriceShiftUpdates } from '../lib/utils/priceShift';
import { searchProducts } from './SupplierPurchaseServices';
import {
  Package, Check, X, Truck, AlertCircle, Search, Plus, Trash2, ToggleLeft, ToggleRight
} from 'lucide-react';

// Formatage mon\u00e9taire
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD'
  }).format(amount || 0);
};

export default function DirectReceiptModal({ isOpen, onClose, onReceiptComplete }) {
  // \u00c9tats principaux
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Mode ajustement (prise d'inventaire)
  const [isAdjustment, setIsAdjustment] = useState(false);

  // Items s\u00e9lectionn\u00e9s pour r\u00e9ception
  const [receiptItems, setReceiptItems] = useState([]);

  // Recherche de produits
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const searchInputRef = useRef(null);

  // Cr\u00e9ation nouvel item
  const [showNewItemForm, setShowNewItemForm] = useState(false);
  const [newItemForm, setNewItemForm] = useState({
    product_id: '',
    description: '',
    cost_price: '',
    selling_price: '',
    unit: 'Un',
    product_group: ''
  });

  // Champs optionnels
  const [supplierDeliveryNumber, setSupplierDeliveryNumber] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [receiptNotes, setReceiptNotes] = useState('');

  // Recherche avec debounce
  useEffect(() => {
    if (!productSearchTerm || productSearchTerm.length < 2) {
      setSearchResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchProducts(productSearchTerm);
        setSearchResults(results);
      } catch (err) {
        console.error('Erreur recherche:', err);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [productSearchTerm]);

  // Reset quand le modal s'ouvre
  useEffect(() => {
    if (isOpen) {
      setReceiptItems([]);
      setProductSearchTerm('');
      setSearchResults([]);
      setError('');
      setSuccess('');
      setSupplierDeliveryNumber('');
      setSupplierName('');
      setReceiptNotes('');
      setIsAdjustment(false);
      setShowNewItemForm(false);
      resetNewItemForm();
    }
  }, [isOpen]);

  const resetNewItemForm = () => {
    setNewItemForm({
      product_id: '',
      description: '',
      cost_price: '',
      selling_price: '',
      unit: 'Un',
      product_group: ''
    });
  };

  // Ajouter un produit existant \u00e0 la liste
  const addProductToReceipt = (product) => {
    // V\u00e9rifier doublon
    const existing = receiptItems.find(i => i.product_id === product.product_id);
    if (existing) {
      setError(`Le produit ${product.product_id} est d\u00e9j\u00e0 dans la liste.`);
      return;
    }

    setReceiptItems(prev => [...prev, {
      product_id: product.product_id,
      description: product.description,
      unit: product.unit || 'Un',
      cost_price: parseFloat(product.cost_price) || 0,
      current_stock: parseFloat(product.stock_qty) || 0,
      quantity: 1,
      is_non_inventory: product.is_non_inventory || false,
      product_group: product.product_group || ''
    }]);

    setProductSearchTerm('');
    setSearchResults([]);
    setFocusedIndex(-1);
    setError('');
    // Focus back on search
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  // Cr\u00e9er un nouvel item et l'ajouter
  const handleCreateNewItem = async () => {
    const { product_id, description, cost_price, selling_price } = newItemForm;

    if (!product_id || !description || !cost_price || !selling_price) {
      setError('Veuillez remplir tous les champs obligatoires (code, description, prix co\u00fbtant, prix vente).');
      return;
    }

    // V\u00e9rifier doublon dans la liste
    const existingInList = receiptItems.find(i => i.product_id === product_id);
    if (existingInList) {
      setError(`Le produit ${product_id} est d\u00e9j\u00e0 dans la liste.`);
      return;
    }

    try {
      // V\u00e9rifier si le produit existe d\u00e9j\u00e0 dans products
      const { data: existingProduct } = await supabase
        .from('products')
        .select('product_id')
        .eq('product_id', product_id)
        .single();

      // V\u00e9rifier aussi dans non_inventory_items
      if (!existingProduct) {
        const { data: existingInNonInv } = await supabase
          .from('non_inventory_items')
          .select('product_id')
          .eq('product_id', product_id)
          .single();

        if (existingInNonInv) {
          setError(`Le code ${product_id} existe d\u00e9j\u00e0 dans les items non-inventaire. Utilisez la recherche.`);
          return;
        }
      }

      // Cr\u00e9er le produit s'il n'existe pas (toujours dans products)
      if (!existingProduct) {
        const { error: insertError } = await supabase
          .from('products')
          .insert({
            product_id,
            description,
            cost_price: parseFloat(cost_price),
            selling_price: parseFloat(selling_price),
            unit: newItemForm.unit || 'Un',
            product_group: newItemForm.product_group || '',
            stock_qty: 0
          });

        if (insertError) {
          setError('Erreur lors de la cr\u00e9ation du produit: ' + insertError.message);
          return;
        }
      }

      // Ajouter \u00e0 la liste de r\u00e9ception
      setReceiptItems(prev => [...prev, {
        product_id,
        description,
        unit: newItemForm.unit || 'Un',
        cost_price: parseFloat(cost_price),
        current_stock: 0,
        quantity: 1,
        is_non_inventory: false,
        product_group: newItemForm.product_group || ''
      }]);

      setShowNewItemForm(false);
      resetNewItemForm();
      setError('');
    } catch (err) {
      console.error('Erreur cr\u00e9ation produit:', err);
      setError('Erreur: ' + err.message);
    }
  };

  // Mettre \u00e0 jour la quantit\u00e9 d'un item
  const updateItemQuantity = (productId, value) => {
    const qty = parseFloat(value);
    if (isNaN(qty)) return;

    setReceiptItems(prev => prev.map(item =>
      item.product_id === productId
        ? { ...item, quantity: qty }
        : item
    ));
  };

  // Mettre \u00e0 jour le prix co\u00fbtant d'un item
  const updateItemCostPrice = (productId, value) => {
    const price = parseFloat(value);
    if (isNaN(price)) return;

    setReceiptItems(prev => prev.map(item =>
      item.product_id === productId
        ? { ...item, cost_price: price }
        : item
    ));
  };

  // Supprimer un item de la liste
  const removeItem = (productId) => {
    setReceiptItems(prev => prev.filter(item => item.product_id !== productId));
  };

  // Navigation clavier dans la recherche
  const handleSearchKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => Math.min(prev + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedIndex >= 0 && searchResults[focusedIndex]) {
        addProductToReceipt(searchResults[focusedIndex]);
      }
    } else if (e.key === 'Escape') {
      setProductSearchTerm('');
      setSearchResults([]);
      setFocusedIndex(-1);
    }
  };

  // Sauvegarder la r\u00e9ception
  const handleSaveReceipt = async (closeAfter = false) => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const validItems = receiptItems.filter(item => item.quantity !== 0);

      if (validItems.length === 0) {
        setError('Veuillez ajouter au moins un article avec une quantit\u00e9.');
        setSaving(false);
        return;
      }

      // En mode r\u00e9ception (non-ajustement), les quantit\u00e9s doivent \u00eatre positives
      if (!isAdjustment) {
        const negativeItems = validItems.filter(i => i.quantity < 0);
        if (negativeItems.length > 0) {
          setError('En mode R\u00e9ception, les quantit\u00e9s doivent \u00eatre positives. Activez le mode Ajustement pour les corrections n\u00e9gatives.');
          setSaving(false);
          return;
        }
      }

      // G\u00e9n\u00e9rer un num\u00e9ro de r\u00e9f\u00e9rence pour le lot
      const refNumber = `RD-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;

      // 1. Cr\u00e9er les mouvements d'inventaire
      const movements = validItems.map(item => ({
        product_id: item.product_id,
        product_description: item.description,
        product_group: item.product_group || '',
        unit: item.unit,
        movement_type: item.quantity > 0 ? 'IN' : 'OUT',
        quantity: Math.abs(item.quantity),
        unit_cost: item.cost_price,
        total_cost: Math.abs(item.quantity) * item.cost_price,
        reference_type: 'direct_receipt',
        reference_id: null,
        reference_number: refNumber,
        notes: isAdjustment
          ? `Ajustement inventaire${supplierName ? ` - ${supplierName}` : ''}${receiptNotes ? ` - ${receiptNotes}` : ''}`
          : `R\u00e9ception directe${supplierName ? ` de ${supplierName}` : ''}${supplierDeliveryNumber ? ` (BL: ${supplierDeliveryNumber})` : ''}${receiptNotes ? ` - ${receiptNotes}` : ''}`,
        created_at: new Date().toISOString()
      }));

      const { error: movementError } = await supabase
        .from('inventory_movements')
        .insert(movements);

      if (movementError) {
        console.error('Erreur mouvements:', movementError);
      }

      // 2. Mettre \u00e0 jour le stock + d\u00e9calage prix
      for (const item of validItems) {
        const tableName = item.is_non_inventory ? 'non_inventory_items' : 'products';

        const { data: product, error: productError } = await supabase
          .from(tableName)
          .select('stock_qty, cost_price, cost_price_1st, cost_price_2nd, cost_price_3rd')
          .eq('product_id', item.product_id)
          .single();

        if (!productError && product) {
          const currentStock = parseFloat(product.stock_qty) || 0;
          const newStock = currentStock + item.quantity; // quantity peut \u00eatre n\u00e9gatif en ajustement

          const updates = { stock_qty: Math.max(0, newStock).toString() };

          // D\u00e9calage prix seulement pour les r\u00e9ceptions (pas les ajustements n\u00e9gatifs)
          if (item.quantity > 0) {
            const priceShiftUpdates = buildPriceShiftUpdates(product, {
              cost_price: item.cost_price,
            });
            Object.assign(updates, priceShiftUpdates);
          }

          await supabase
            .from(tableName)
            .update(updates)
            .eq('product_id', item.product_id);

          console.log(`Stock mis \u00e0 jour: ${item.product_id} (${tableName}): ${currentStock} \u2192 ${Math.max(0, newStock)}`);
        }
      }

      const actionLabel = isAdjustment ? 'Ajustement' : 'R\u00e9ception';
      setSuccess(`${actionLabel} enregistr\u00e9(e)! ${validItems.length} article(s) trait\u00e9(s). R\u00e9f: ${refNumber}`);

      // Reset les items apr\u00e8s sauvegarde
      setReceiptItems([]);
      setSupplierDeliveryNumber('');
      setReceiptNotes('');

      if (onReceiptComplete) {
        onReceiptComplete();
      }

      if (closeAfter) {
        setTimeout(() => onClose(), 1500);
      }

    } catch (err) {
      console.error('Erreur sauvegarde r\u00e9ception:', err);
      setError('Erreur lors de la sauvegarde: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const itemCount = receiptItems.length;
  const totalValue = receiptItems.reduce((sum, item) => sum + (Math.abs(item.quantity) * item.cost_price), 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[95vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className={`${isAdjustment
          ? 'bg-gradient-to-r from-amber-600 to-orange-600'
          : 'bg-gradient-to-r from-teal-600 to-green-600'
        } text-white px-6 py-4 rounded-t-xl`}>
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                {isAdjustment ? (
                  <><Package className="w-6 h-6" /> Ajustement d'inventaire</>
                ) : (
                  <><Truck className="w-6 h-6" /> R\u00e9ception directe</>
                )}
              </h2>
              <p className="text-white/80 text-sm mt-1">
                {isAdjustment
                  ? 'Correction de stock suite \u00e0 une prise d\'inventaire'
                  : 'R\u00e9ceptionner du mat\u00e9riel achet\u00e9 directement (sans AF)'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Stats + toggle */}
          <div className="flex flex-wrap gap-3 mt-4 items-center">
            <div className="bg-white/20 px-3 py-1 rounded-full text-sm">
              {itemCount} article(s)
            </div>
            <div className="bg-white/20 px-3 py-1 rounded-full text-sm">
              Valeur: {formatCurrency(totalValue)}
            </div>
            <div className="ml-auto">
              <button
                onClick={() => setIsAdjustment(!isAdjustment)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  isAdjustment
                    ? 'bg-amber-500 text-white'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                {isAdjustment ? (
                  <ToggleRight className="w-5 h-5" />
                ) : (
                  <ToggleLeft className="w-5 h-5" />
                )}
                Ajustement
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {success && (
          <div className="mx-4 mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 flex items-center gap-2">
            <Check className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{success}</span>
          </div>
        )}

        {/* Contenu */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Recherche de produits */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rechercher un produit
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                ref={searchInputRef}
                type="text"
                value={productSearchTerm}
                onChange={(e) => {
                  setProductSearchTerm(e.target.value);
                  setFocusedIndex(-1);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Rechercher par code ou description..."
                className="w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
              {searching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-teal-600"></div>
                </div>
              )}
            </div>

            {/* R\u00e9sultats de recherche */}
            {searchResults.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {searchResults.map((product, index) => (
                  <div
                    key={product.product_id}
                    onClick={() => addProductToReceipt(product)}
                    className={`px-4 py-2 cursor-pointer flex items-center justify-between ${
                      index === focusedIndex ? 'bg-teal-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
                          {product.product_id}
                        </span>
                        {product.is_non_inventory && (
                          <span className="bg-purple-100 text-purple-700 text-xs px-1.5 py-0.5 rounded-full">
                            Non-inv.
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 truncate mt-0.5">{product.description}</p>
                    </div>
                    <div className="text-right ml-3 flex-shrink-0">
                      <div className="text-xs text-gray-500">Stock: {parseFloat(product.stock_qty) || 0}</div>
                      <div className="text-xs text-teal-600">{formatCurrency(product.cost_price)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pas de r\u00e9sultats */}
            {productSearchTerm.length >= 2 && !searching && searchResults.length === 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-4 text-center">
                <p className="text-gray-500 text-sm mb-2">Aucun produit trouv\u00e9</p>
                <button
                  onClick={() => {
                    setShowNewItemForm(true);
                    setNewItemForm(prev => ({ ...prev, description: productSearchTerm }));
                    setProductSearchTerm('');
                    setSearchResults([]);
                  }}
                  className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 inline-flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Cr\u00e9er un nouveau produit
                </button>
              </div>
            )}
          </div>

          {/* Bouton cr\u00e9er nouveau produit */}
          {!showNewItemForm && (
            <button
              onClick={() => setShowNewItemForm(true)}
              className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-teal-400 hover:text-teal-600 text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Cr\u00e9er un nouveau produit
            </button>
          )}

          {/* Formulaire nouveau produit */}
          {showNewItemForm && (
            <div className="border-2 border-teal-200 rounded-lg p-4 bg-teal-50/50">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold text-teal-800">Nouveau produit</h3>
                <button
                  onClick={() => { setShowNewItemForm(false); resetNewItemForm(); }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Code produit *</label>
                  <input
                    type="text"
                    value={newItemForm.product_id}
                    onChange={(e) => setNewItemForm(prev => ({ ...prev, product_id: e.target.value.toUpperCase() }))}
                    placeholder="Ex: PROD-001"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Description *</label>
                  <input
                    type="text"
                    value={newItemForm.description}
                    onChange={(e) => setNewItemForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Description du produit"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Prix co\u00fbtant *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={newItemForm.cost_price}
                    onChange={(e) => setNewItemForm(prev => ({ ...prev, cost_price: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Prix vente *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={newItemForm.selling_price}
                    onChange={(e) => setNewItemForm(prev => ({ ...prev, selling_price: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Unit\u00e9</label>
                  <select
                    value={newItemForm.unit}
                    onChange={(e) => setNewItemForm(prev => ({ ...prev, unit: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="Un">Un</option>
                    <option value="M">M (m\u00e8tre)</option>
                    <option value="Pi">Pi (pied)</option>
                    <option value="Bte">Bte (bo\u00eete)</option>
                    <option value="Rl">Rl (rouleau)</option>
                    <option value="Kg">Kg</option>
                    <option value="Lb">Lb (livre)</option>
                    <option value="L">L (litre)</option>
                    <option value="Pqt">Pqt (paquet)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Groupe</label>
                  <input
                    type="text"
                    value={newItemForm.product_group}
                    onChange={(e) => setNewItemForm(prev => ({ ...prev, product_group: e.target.value }))}
                    placeholder="Ex: \u00c9lectrique, Plomberie..."
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-3">
                <button
                  onClick={() => { setShowNewItemForm(false); resetNewItemForm(); }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  onClick={handleCreateNewItem}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Cr\u00e9er et ajouter
                </button>
              </div>
            </div>
          )}

          {/* Liste des items s\u00e9lectionn\u00e9s */}
          {receiptItems.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                Articles \u00e0 {isAdjustment ? 'ajuster' : 'r\u00e9ceptionner'}
              </h3>
              <div className="space-y-2">
                {receiptItems.map((item) => (
                  <div
                    key={item.product_id}
                    className="border rounded-lg p-3 bg-white hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      {/* Info produit */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
                            {item.product_id}
                          </span>
                          {item.is_non_inventory && (
                            <span className="bg-purple-100 text-purple-700 text-xs px-1.5 py-0.5 rounded-full">
                              Non-inv.
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 truncate mt-0.5">{item.description}</p>
                      </div>

                      {/* Stock actuel */}
                      <div className="text-right text-sm min-w-[80px]">
                        <div className="text-blue-600 text-xs">
                          Stock: <span className="font-bold">{item.current_stock}</span>
                        </div>
                        {item.quantity !== 0 && (
                          <div className={`text-xs px-1.5 py-0.5 rounded mt-0.5 ${
                            item.quantity > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                          }`}>
                            Nouveau: <span className="font-bold">{Math.max(0, item.current_stock + item.quantity)}</span>
                          </div>
                        )}
                      </div>

                      {/* Prix co\u00fbtant */}
                      <div className="w-24">
                        <label className="text-xs text-gray-500 block mb-0.5">Prix co\u00fbt.</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          value={item.cost_price || ''}
                          onChange={(e) => updateItemCostPrice(item.product_id, e.target.value)}
                          className="w-full px-2 py-1 border rounded text-center text-sm"
                        />
                      </div>

                      {/* Quantit\u00e9 */}
                      <div className="w-24">
                        <label className="text-xs text-gray-500 block mb-0.5">
                          {isAdjustment ? 'Ajust. (+/-)' : 'Qt\u00e9'}
                        </label>
                        <input
                          type="number"
                          step="1"
                          min={isAdjustment ? undefined : "0"}
                          inputMode="numeric"
                          value={item.quantity || ''}
                          onChange={(e) => updateItemQuantity(item.product_id, e.target.value)}
                          className={`w-full px-2 py-1 border rounded text-center font-medium text-sm ${
                            item.quantity < 0 ? 'border-red-300 bg-red-50 text-red-700' : ''
                          }`}
                          placeholder="0"
                        />
                      </div>

                      {/* Supprimer */}
                      <button
                        onClick={() => removeItem(item.product_id)}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                        title="Retirer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Champs optionnels */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {!isAdjustment && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fournisseur (optionnel)
                  </label>
                  <input
                    type="text"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="Nom du fournisseur"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    N\u00b0 BL fournisseur (optionnel)
                  </label>
                  <input
                    type="text"
                    value={supplierDeliveryNumber}
                    onChange={(e) => setSupplierDeliveryNumber(e.target.value.toUpperCase())}
                    placeholder="Ex: BL-12345"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </>
            )}
            <div className={!isAdjustment ? 'sm:col-span-2' : 'col-span-full'}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes (optionnel)
              </label>
              <textarea
                value={receiptNotes}
                onChange={(e) => setReceiptNotes(e.target.value)}
                placeholder={isAdjustment ? 'Ex: Prise d\'inventaire f\u00e9vrier 2026' : 'Ex: Achat direct au comptoir...'}
                className="w-full px-3 py-2 border rounded-lg resize-none text-sm"
                rows={2}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 bg-gray-50 rounded-b-xl flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-sm"
          >
            Fermer
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => handleSaveReceipt(false)}
              disabled={saving || receiptItems.length === 0}
              className={`px-4 py-2 text-white rounded-lg text-sm disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 ${
                isAdjustment
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Enregistrement...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Enregistrer
                </>
              )}
            </button>
            <button
              onClick={() => handleSaveReceipt(true)}
              disabled={saving || receiptItems.length === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Enregistrer et Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
