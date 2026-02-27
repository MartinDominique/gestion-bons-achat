/**
 * @file components/DirectReceiptModal.js
 * @description Modal de réception directe de marchandises (sans AF).
 *              - Recherche et sélection de produits existants
 *              - Création de nouveaux produits dans l'inventaire
 *              - Mode Réception (IN) et mode Ajustement (+/-)
 *              - Met à jour le stock (products / non_inventory_items)
 *              - Crée les mouvements d'inventaire
 *              - Décalage historique prix (price shift) si cost_price change
 * @version 1.3.0
 * @date 2026-02-22
 * @changelog
 *   1.3.0 - Ajout support dark mode
 *   1.2.0 - Ajout prix vendant + % marge par article (calcul auto), auto-sélection champs numériques
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

// Formatage monétaire
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD'
  }).format(amount || 0);
};

export default function DirectReceiptModal({ isOpen, onClose, onReceiptComplete }) {
  // États principaux
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Mode ajustement (prise d'inventaire)
  const [isAdjustment, setIsAdjustment] = useState(false);

  // Items sélectionnés pour réception
  const [receiptItems, setReceiptItems] = useState([]);

  // Recherche de produits
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const searchInputRef = useRef(null);

  // Création nouvel item
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

  // Ajouter un produit existant à la liste
  const addProductToReceipt = (product) => {
    // Vérifier doublon
    const existing = receiptItems.find(i => i.product_id === product.product_id);
    if (existing) {
      setError(`Le produit ${product.product_id} est déjà dans la liste.`);
      return;
    }

    setReceiptItems(prev => [...prev, {
      product_id: product.product_id,
      description: product.description,
      unit: product.unit || 'Un',
      cost_price: parseFloat(product.cost_price) || 0,
      selling_price: parseFloat(product.selling_price) || 0,
      current_stock: parseFloat(product.stock_qty) || 0,
      quantity: 1,
      is_non_inventory: product.is_non_inventory || false,
      product_group: product.product_group || '',
      _margin_percent: ''
    }]);

    setProductSearchTerm('');
    setSearchResults([]);
    setFocusedIndex(-1);
    setError('');
    // Focus back on search
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  // Créer un nouvel item et l'ajouter
  const handleCreateNewItem = async () => {
    const { product_id, description, cost_price, selling_price } = newItemForm;

    if (!product_id || !description || !cost_price || !selling_price) {
      setError('Veuillez remplir tous les champs obligatoires (code, description, prix coûtant, prix vente).');
      return;
    }

    // Vérifier doublon dans la liste
    const existingInList = receiptItems.find(i => i.product_id === product_id);
    if (existingInList) {
      setError(`Le produit ${product_id} est déjà dans la liste.`);
      return;
    }

    try {
      // Vérifier si le produit existe déjà dans products
      const { data: existingProduct } = await supabase
        .from('products')
        .select('product_id')
        .eq('product_id', product_id)
        .single();

      // Vérifier aussi dans non_inventory_items
      if (!existingProduct) {
        const { data: existingInNonInv } = await supabase
          .from('non_inventory_items')
          .select('product_id')
          .eq('product_id', product_id)
          .single();

        if (existingInNonInv) {
          setError(`Le code ${product_id} existe déjà dans les items non-inventaire. Utilisez la recherche.`);
          return;
        }
      }

      // Créer le produit s'il n'existe pas (toujours dans products)
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
          setError('Erreur lors de la création du produit: ' + insertError.message);
          return;
        }
      }

      // Ajouter à la liste de réception
      setReceiptItems(prev => [...prev, {
        product_id,
        description,
        unit: newItemForm.unit || 'Un',
        cost_price: parseFloat(cost_price),
        selling_price: parseFloat(selling_price),
        current_stock: 0,
        quantity: 1,
        is_non_inventory: false,
        product_group: newItemForm.product_group || '',
        _margin_percent: ''
      }]);

      setShowNewItemForm(false);
      resetNewItemForm();
      setError('');
    } catch (err) {
      console.error('Erreur création produit:', err);
      setError('Erreur: ' + err.message);
    }
  };

  // Mettre à jour la quantité d'un item
  const updateItemQuantity = (productId, value) => {
    const qty = parseFloat(value);
    if (isNaN(qty)) return;

    setReceiptItems(prev => prev.map(item =>
      item.product_id === productId
        ? { ...item, quantity: qty }
        : item
    ));
  };

  // Mettre à jour le prix coûtant d'un item (recalcule vendant si % marge actif)
  const updateItemCostPrice = (productId, value) => {
    const price = parseFloat(value);
    if (isNaN(price)) return;

    setReceiptItems(prev => prev.map(item => {
      if (item.product_id !== productId) return item;
      const updated = { ...item, cost_price: price };
      const margin = parseFloat(item._margin_percent) || 0;
      if (price > 0 && margin > 0) {
        updated.selling_price = parseFloat((price * (1 + margin / 100)).toFixed(2));
      }
      return updated;
    }));
  };

  // Mettre à jour le prix vendant d'un item
  const updateItemSellingPrice = (productId, value) => {
    const price = parseFloat(value);
    if (isNaN(price)) return;

    setReceiptItems(prev => prev.map(item =>
      item.product_id === productId
        ? { ...item, selling_price: price, _margin_percent: '' }
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

  // Sauvegarder la réception
  const handleSaveReceipt = async (closeAfter = false) => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const validItems = receiptItems.filter(item => item.quantity !== 0);

      if (validItems.length === 0) {
        setError('Veuillez ajouter au moins un article avec une quantité.');
        setSaving(false);
        return;
      }

      // En mode réception (non-ajustement), les quantités doivent être positives
      if (!isAdjustment) {
        const negativeItems = validItems.filter(i => i.quantity < 0);
        if (negativeItems.length > 0) {
          setError('En mode Réception, les quantités doivent être positives. Activez le mode Ajustement pour les corrections négatives.');
          setSaving(false);
          return;
        }
      }

      // Générer un numéro de référence pour le lot
      const refNumber = `RD-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;

      // 1. Créer les mouvements d'inventaire
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
          : `Réception directe${supplierName ? ` de ${supplierName}` : ''}${supplierDeliveryNumber ? ` (BL: ${supplierDeliveryNumber})` : ''}${receiptNotes ? ` - ${receiptNotes}` : ''}`,
        created_at: new Date().toISOString()
      }));

      const { error: movementError } = await supabase
        .from('inventory_movements')
        .insert(movements);

      if (movementError) {
        console.error('Erreur mouvements:', movementError);
      }

      // 2. Mettre à jour le stock + décalage prix
      for (const item of validItems) {
        const tableName = item.is_non_inventory ? 'non_inventory_items' : 'products';

        const { data: product, error: productError } = await supabase
          .from(tableName)
          .select('stock_qty, cost_price, cost_price_1st, cost_price_2nd, cost_price_3rd, selling_price, selling_price_1st, selling_price_2nd, selling_price_3rd')
          .eq('product_id', item.product_id)
          .single();

        if (!productError && product) {
          const currentStock = parseFloat(product.stock_qty) || 0;
          const newStock = currentStock + item.quantity; // quantity peut être négatif en ajustement

          const updates = { stock_qty: Math.max(0, newStock).toString() };

          // Décalage prix pour les réceptions
          if (item.quantity > 0) {
            const priceShiftUpdates = buildPriceShiftUpdates(product, {
              cost_price: item.cost_price,
              selling_price: item.selling_price,
            });
            Object.assign(updates, priceShiftUpdates);
          } else if (item.selling_price > 0) {
            // En ajustement négatif, mettre à jour le selling_price si changé
            const sellingUpdates = buildPriceShiftUpdates(product, {
              selling_price: item.selling_price,
            });
            Object.assign(updates, sellingUpdates);
          }

          await supabase
            .from(tableName)
            .update(updates)
            .eq('product_id', item.product_id);

          console.log(`Stock mis à jour: ${item.product_id} (${tableName}): ${currentStock} → ${Math.max(0, newStock)}`);
        }
      }

      const actionLabel = isAdjustment ? 'Ajustement' : 'Réception';
      setSuccess(`${actionLabel} enregistré(e)! ${validItems.length} article(s) traité(s). Réf: ${refNumber}`);

      // Reset les items après sauvegarde
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
      console.error('Erreur sauvegarde réception:', err);
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
      <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-4xl max-h-[95vh] flex flex-col shadow-2xl">

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
                  <><Truck className="w-6 h-6" /> Réception directe</>
                )}
              </h2>
              <p className="text-white/80 text-sm mt-1">
                {isAdjustment
                  ? 'Correction de stock suite à une prise d\'inventaire'
                  : 'Réceptionner du matériel acheté directement (sans AF)'}
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
          <div className="mx-4 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-red-700 dark:text-red-400 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {success && (
          <div className="mx-4 mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg text-green-700 dark:text-green-300 flex items-center gap-2">
            <Check className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{success}</span>
          </div>
        )}

        {/* Contenu */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Recherche de produits */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Rechercher un produit
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
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
                className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
              {searching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-teal-600"></div>
                </div>
              )}
            </div>

            {/* Résultats de recherche */}
            {searchResults.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {searchResults.map((product, index) => (
                  <div
                    key={product.product_id}
                    onClick={() => addProductToReceipt(product)}
                    className={`px-4 py-2 cursor-pointer flex items-center justify-between ${
                      index === focusedIndex ? 'bg-teal-50 dark:bg-teal-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-0.5 rounded">
                          {product.product_id}
                        </span>
                        {product.is_non_inventory && (
                          <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs px-1.5 py-0.5 rounded-full">
                            Non-inv.
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 truncate mt-0.5">{product.description}</p>
                    </div>
                    <div className="text-right ml-3 flex-shrink-0">
                      <div className="text-xs text-gray-500 dark:text-gray-400">Stock: {parseFloat(product.stock_qty) || 0}</div>
                      <div className="text-xs text-teal-600 dark:text-teal-400">{formatCurrency(product.cost_price)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pas de résultats */}
            {productSearchTerm.length >= 2 && !searching && searchResults.length === 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 text-center">
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">Aucun produit trouvé</p>
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
                  Créer un nouveau produit
                </button>
              </div>
            )}
          </div>

          {/* Bouton créer nouveau produit */}
          {!showNewItemForm && (
            <button
              onClick={() => setShowNewItemForm(true)}
              className="w-full py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400 hover:border-teal-400 hover:text-teal-600 dark:hover:border-teal-500 dark:hover:text-teal-400 text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Créer un nouveau produit
            </button>
          )}

          {/* Formulaire nouveau produit */}
          {showNewItemForm && (
            <div className="border-2 border-teal-200 dark:border-teal-700 rounded-lg p-4 bg-teal-50/50 dark:bg-teal-900/10">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold text-teal-800 dark:text-teal-300">Nouveau produit</h3>
                <button
                  onClick={() => { setShowNewItemForm(false); resetNewItemForm(); }}
                  className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Code produit *</label>
                  <input
                    type="text"
                    value={newItemForm.product_id}
                    onChange={(e) => setNewItemForm(prev => ({ ...prev, product_id: e.target.value.toUpperCase() }))}
                    placeholder="Ex: PROD-001"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description *</label>
                  <input
                    type="text"
                    value={newItemForm.description}
                    onChange={(e) => setNewItemForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Description du produit"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Prix coûtant *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={newItemForm.cost_price}
                    onChange={(e) => setNewItemForm(prev => ({ ...prev, cost_price: e.target.value }))}
                    onFocus={(e) => e.target.select()}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Prix vente *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={newItemForm.selling_price}
                    onChange={(e) => setNewItemForm(prev => ({ ...prev, selling_price: e.target.value }))}
                    onFocus={(e) => e.target.select()}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Unité</label>
                  <select
                    value={newItemForm.unit}
                    onChange={(e) => setNewItemForm(prev => ({ ...prev, unit: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="Un">Un</option>
                    <option value="M">M (mètre)</option>
                    <option value="Pi">Pi (pied)</option>
                    <option value="Bte">Bte (boîte)</option>
                    <option value="Rl">Rl (rouleau)</option>
                    <option value="Kg">Kg</option>
                    <option value="Lb">Lb (livre)</option>
                    <option value="L">L (litre)</option>
                    <option value="Pqt">Pqt (paquet)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Groupe</label>
                  <input
                    type="text"
                    value={newItemForm.product_group}
                    onChange={(e) => setNewItemForm(prev => ({ ...prev, product_group: e.target.value }))}
                    placeholder="Ex: Électrique, Plomberie..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-3">
                <button
                  onClick={() => { setShowNewItemForm(false); resetNewItemForm(); }}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                >
                  Annuler
                </button>
                <button
                  onClick={handleCreateNewItem}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Créer et ajouter
                </button>
              </div>
            </div>
          )}

          {/* Liste des items sélectionnés */}
          {receiptItems.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Articles à {isAdjustment ? 'ajuster' : 'réceptionner'}
              </h3>
              <div className="space-y-2">
                {receiptItems.map((item) => (
                  <div
                    key={item.product_id}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750"
                  >
                    {/* Row 1: Info produit + stock + supprimer */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-0.5 rounded">
                            {item.product_id}
                          </span>
                          {item.is_non_inventory && (
                            <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs px-1.5 py-0.5 rounded-full">
                              Non-inv.
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 truncate mt-0.5">{item.description}</p>
                      </div>

                      <div className="text-right text-sm min-w-[80px]">
                        <div className="text-blue-600 dark:text-blue-400 text-xs">
                          Stock: <span className="font-bold">{item.current_stock}</span>
                        </div>
                        {item.quantity !== 0 && (
                          <div className={`text-xs px-1.5 py-0.5 rounded mt-0.5 ${
                            item.quantity > 0 ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                          }`}>
                            Nouveau: <span className="font-bold">{Math.max(0, item.current_stock + item.quantity)}</span>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => removeItem(item.product_id)}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                        title="Retirer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Row 2: Coûtant + % + Vendant + Qté */}
                    <div className="flex items-end gap-2 mt-2 flex-wrap">
                      <div className="w-[90px]">
                        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Coûtant</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          value={item.cost_price || ''}
                          onChange={(e) => updateItemCostPrice(item.product_id, e.target.value)}
                          onFocus={(e) => e.target.select()}
                          className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-center text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        />
                      </div>

                      <div className="w-16">
                        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">%</label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          inputMode="numeric"
                          value={item._margin_percent || ''}
                          onChange={(e) => {
                            const pct = e.target.value;
                            const cost = parseFloat(item.cost_price) || 0;
                            const margin = parseFloat(pct) || 0;
                            const newSelling = cost > 0 && margin > 0
                              ? parseFloat((cost * (1 + margin / 100)).toFixed(2))
                              : item.selling_price;
                            setReceiptItems(prev => prev.map(i =>
                              i.product_id === item.product_id
                                ? { ...i, _margin_percent: pct, selling_price: newSelling }
                                : i
                            ));
                          }}
                          onFocus={(e) => e.target.select()}
                          className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-center text-sm bg-green-50 dark:bg-green-900/20 text-gray-900 dark:text-gray-100"
                          placeholder="%"
                        />
                      </div>

                      <div className="w-[90px]">
                        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Vendant</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          value={item.selling_price || ''}
                          onChange={(e) => updateItemSellingPrice(item.product_id, e.target.value)}
                          onFocus={(e) => e.target.select()}
                          className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-center text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        />
                      </div>

                      <div className="flex-1 min-w-[80px]">
                        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">
                          {isAdjustment ? 'Ajust. (+/-)' : 'Qté'}
                        </label>
                        <input
                          type="number"
                          step="1"
                          min={isAdjustment ? undefined : "0"}
                          inputMode="numeric"
                          value={item.quantity || ''}
                          onChange={(e) => updateItemQuantity(item.product_id, e.target.value)}
                          onFocus={(e) => e.target.select()}
                          className={`w-full px-2 py-1.5 border rounded text-center font-medium text-sm ${
                            item.quantity < 0 ? 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                          }`}
                          placeholder="0"
                        />
                      </div>
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Fournisseur (optionnel)
                  </label>
                  <input
                    type="text"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="Nom du fournisseur"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    N° BL fournisseur (optionnel)
                  </label>
                  <input
                    type="text"
                    value={supplierDeliveryNumber}
                    onChange={(e) => setSupplierDeliveryNumber(e.target.value.toUpperCase())}
                    placeholder="Ex: BL-12345"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
              </>
            )}
            <div className={!isAdjustment ? 'sm:col-span-2' : 'col-span-full'}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Notes (optionnel)
              </label>
              <textarea
                value={receiptNotes}
                onChange={(e) => setReceiptNotes(e.target.value)}
                placeholder={isAdjustment ? 'Ex: Prise d\'inventaire février 2026' : 'Ex: Achat direct au comptoir...'}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg resize-none text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                rows={2}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 bg-gray-50 dark:bg-gray-800 rounded-b-xl flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm"
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
