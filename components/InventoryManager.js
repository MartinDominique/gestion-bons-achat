/**
 * @file components/InventoryManager.js
 * @description Gestionnaire d'inventaire avec recherche serveur performante
 *              - Recherche côté Supabase (ilike) après 2+ caractères, debounce 300ms
 *              - Aucun produit chargé au départ (page vide + barre de recherche)
 *              - Bouton "Charger tout" pour consultation complète
 *              - Dropdown "Charger par groupe" pour chargement ciblé
 *              - Badge visuel Inventaire vs Non-inventaire
 *              - En main (stock_qty), En commande (AF), Réservé (BT/BL)
 *              - Modal unifié : Édition + Historique mouvements + Historique prix
 * @version 3.3.0
 * @date 2026-02-19
 * @changelog
 *   3.3.0 - Prix coûtant et vendant côte à côte, auto-sélection champs numériques au focus
 *   3.2.1 - Ajout traduction 'direct_receipt' → 'Réception directe' dans historique mouvements
 *   3.2.0 - Toast 2s au lieu de alert(), majuscules Description + Fournisseur,
 *         - Renommé "Fournisseur" en "Dernier fournisseur"
 *   3.1.0 - Ajout champ Fournisseur (supplier) dans l'édition + sauvegarde
 *   3.0.0 - Recherche serveur (plus de chargement initial des ~7000 produits)
 *         - Ajout bouton "Charger tout" + dropdown "Charger par groupe"
 *         - Debounce 300ms sur la recherche, min 2 caractères
 *         - Badge source toujours visible (Inventaire / Non-inv.)
 *   2.0.0 - Modal unifié avec onglets (Édition / Historique / Prix)
 *         - Ajout modification description produit
 *         - Ajout historique prix avec décalage (shift) sur changement
 *         - Intégration historique mouvements dans le modal produit
 *   1.3.0 - Ajout modal historique des mouvements d'inventaire par produit (dates IN/OUT)
 *         - Correction affichage stock_qty pour non-inventaire (était caché)
 *   1.2.0 - Recherche cross-liste (produits + non-inventaire) et quantités pour non-inventaire
 *   1.1.0 - Ajout quantités en commande et réservé dans cartes et modal modifier
 *   1.0.0 - Version initiale
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { buildPriceShiftUpdates } from '../lib/utils/priceShift';
import {
  Search, Package, Edit, DollarSign, Filter, X,
  ChevronDown, Save, AlertCircle, TrendingUp, TrendingDown,
  Eye, Plus, Trash2, RotateCcw, Upload, ShoppingCart, Clock,
  History, ArrowDownCircle, ArrowUpCircle, Loader2, FolderOpen, List
} from 'lucide-react';

export default function InventoryManager() {
  // ===== ÉTATS PRINCIPAUX =====
  const [displayItems, setDisplayItems] = useState([]);       // Items affichés (résultats recherche OU chargement)
  const [loading, setLoading] = useState(false);               // Chargement général
  const [searchLoading, setSearchLoading] = useState(false);   // Chargement recherche
  const [searchTerm, setSearchTerm] = useState('');
  const [productGroups, setProductGroups] = useState([]);
  const [loadMode, setLoadMode] = useState('idle');            // 'idle', 'search', 'all', 'group'
  const [selectedLoadGroup, setSelectedLoadGroup] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [itemCount, setItemCount] = useState({ products: 0, nonInventory: 0 });

  // Quantités en commande et réservé par product_id
  const [quantityMap, setQuantityMap] = useState({});

  // Debounce timer
  const searchTimerRef = useRef(null);

  // Modal d'édition (unifié avec historique)
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState({
    description: '',
    supplier: '',
    cost_price: '',
    selling_price: '',
    stock_qty: ''
  });
  const [saving, setSaving] = useState(false);
  const [marginPercent, setMarginPercent] = useState('');
  const [modalTab, setModalTab] = useState('edit'); // 'edit', 'history', 'prices'

  // États pour l'upload d'inventaire
  const [showInventoryUpload, setShowInventoryUpload] = useState(false);
  const [uploadingInventory, setUploadingInventory] = useState(false);

  // Toast notification (auto-disparaissant)
  const [toast, setToast] = useState(null); // { message, type: 'success' | 'error' }

  // États pour l'historique des mouvements (chargé dans le modal unifié)
  const [historyMovements, setHistoryMovements] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ===== TOAST NOTIFICATION =====
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2000);
  }, []);

  // ===== CHARGEMENT INITIAL (groupes + quantités seulement) =====
  useEffect(() => {
    loadProductGroups();
    loadQuantities();
  }, []);

  // ===== DEBOUNCE RECHERCHE =====
  useEffect(() => {
    // Nettoyer le timer précédent
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    // Si moins de 2 caractères, revenir à idle
    if (searchTerm.length < 2) {
      if (loadMode === 'search') {
        setDisplayItems([]);
        setLoadMode('idle');
        setItemCount({ products: 0, nonInventory: 0 });
      }
      return;
    }

    // Debounce 300ms
    setSearchLoading(true);
    searchTimerRef.current = setTimeout(() => {
      performSearch(searchTerm);
    }, 300);

    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [searchTerm]);

  // ===== CHARGER LES GROUPES DISTINCTS =====
  const loadProductGroups = async () => {
    try {
      const response = await fetch('/api/products/groups');
      const result = await response.json();
      if (result.success) {
        setProductGroups(result.data);
      }
    } catch (error) {
      console.error('Erreur chargement groupes:', error);
    }
  };

  // ===== RECHERCHE SERVEUR =====
  const performSearch = async (term) => {
    try {
      setSearchLoading(true);
      const response = await fetch(`/api/products/search?mode=search&search=${encodeURIComponent(term)}`);
      const result = await response.json();

      if (result.success) {
        setDisplayItems(result.data);
        setLoadMode('search');
        setItemCount({
          products: result.data.filter(i => i._source === 'products').length,
          nonInventory: result.data.filter(i => i._source === 'non_inventory').length,
        });
      } else {
        console.error('Erreur recherche:', result.error);
      }
    } catch (error) {
      console.error('Erreur recherche:', error);
    } finally {
      setSearchLoading(false);
    }
  };

  // ===== CHARGER TOUT =====
  const loadAll = async () => {
    try {
      setLoading(true);
      setSearchTerm('');
      const response = await fetch('/api/products/search?mode=all');
      const result = await response.json();

      if (result.success) {
        setDisplayItems(result.data);
        setLoadMode('all');
        setItemCount({
          products: result.data.filter(i => i._source === 'products').length,
          nonInventory: result.data.filter(i => i._source === 'non_inventory').length,
        });
      } else {
        alert('Erreur lors du chargement: ' + result.error);
      }
    } catch (error) {
      console.error('Erreur charger tout:', error);
      alert('Erreur lors du chargement de l\'inventaire');
    } finally {
      setLoading(false);
    }
  };

  // ===== CHARGER PAR GROUPE =====
  const loadByGroup = async (group) => {
    if (!group) return;
    try {
      setLoading(true);
      setSelectedLoadGroup(group);
      setSearchTerm('');
      const response = await fetch(`/api/products/search?mode=group&group=${encodeURIComponent(group)}`);
      const result = await response.json();

      if (result.success) {
        setDisplayItems(result.data);
        setLoadMode('group');
        setItemCount({
          products: result.data.filter(i => i._source === 'products').length,
          nonInventory: result.data.filter(i => i._source === 'non_inventory').length,
        });
      } else {
        alert('Erreur lors du chargement: ' + result.error);
      }
    } catch (error) {
      console.error('Erreur charger groupe:', error);
      alert('Erreur lors du chargement du groupe');
    } finally {
      setLoading(false);
    }
  };

  // ===== EFFACER / RETOUR IDLE =====
  const clearResults = () => {
    setSearchTerm('');
    setDisplayItems([]);
    setLoadMode('idle');
    setSelectedLoadGroup('');
    setItemCount({ products: 0, nonInventory: 0 });
  };

  // ===== CHARGER QUANTITÉS (en commande + réservé) =====
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
    } catch (error) {
      console.error('Erreur chargement quantités:', error);
    }
  };

  // ===== UPLOAD INVENTAIRE =====
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
        // Recharger les groupes et si on avait des résultats, les rafraîchir
        await loadProductGroups();
        await loadQuantities();
        if (loadMode === 'all') {
          await loadAll();
        } else if (loadMode === 'group' && selectedLoadGroup) {
          await loadByGroup(selectedLoadGroup);
        } else if (loadMode === 'search' && searchTerm.length >= 2) {
          await performSearch(searchTerm);
        }
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

  // ===== FORMATAGE =====
  const formatMovementDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('fr-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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

  // ===== MODAL ÉDITION =====
  const openEditModal = async (item, initialTab = 'edit') => {
    setEditingItem(item);
    setEditForm({
      description: item.description || '',
      supplier: item.supplier || '',
      cost_price: item.cost_price?.toString() || '',
      selling_price: item.selling_price?.toString() || '',
      stock_qty: item.stock_qty?.toString() || ''
    });
    setModalTab(initialTab);
    // Load movement history in background
    setHistoryLoading(true);
    setHistoryMovements([]);
    try {
      const { data: movements, error } = await supabase
        .from('inventory_movements')
        .select('*')
        .eq('product_id', item.product_id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (!error) setHistoryMovements(movements || []);
    } catch (err) {
      console.error('Erreur chargement historique:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeEditModal = () => {
    setEditingItem(null);
    setEditForm({
      description: '',
      supplier: '',
      cost_price: '',
      selling_price: '',
      stock_qty: ''
    });
    setModalTab('edit');
    setMarginPercent('');
  };

  const saveChanges = async () => {
    if (!editingItem) return;

    const isProduct = editingItem._source === 'products';

    try {
      setSaving(true);

      const updates = {
        description: editForm.description.trim(),
        supplier: editForm.supplier.trim() || null,
        cost_price: parseFloat(editForm.cost_price) || 0,
        selling_price: parseFloat(editForm.selling_price) || 0,
        stock_qty: parseInt(editForm.stock_qty) || 0,
      };

      // Price shift: décaler l'historique si le prix change
      const priceShiftUpdates = buildPriceShiftUpdates(editingItem, {
        cost_price: updates.cost_price,
        selling_price: updates.selling_price,
      });
      Object.assign(updates, priceShiftUpdates);

      // Détecter les changements pour l'email
      const changes = [];
      const oldCost = parseFloat(editingItem.cost_price) || 0;
      const oldSelling = parseFloat(editingItem.selling_price) || 0;
      const oldQty = parseInt(editingItem.stock_qty) || 0;
      const oldDescription = editingItem.description || '';
      const oldSupplier = editingItem.supplier || '';

      if (updates.description !== oldDescription) {
        changes.push(`Description: "${oldDescription}" → "${updates.description}"`);
      }
      if ((updates.supplier || '') !== oldSupplier) {
        changes.push(`Fournisseur: "${oldSupplier}" → "${updates.supplier || ''}"`);
      }
      if (updates.cost_price !== oldCost) {
        changes.push(`Prix coûtant: ${oldCost.toFixed(2)}$ → ${updates.cost_price.toFixed(2)}$`);
      }
      if (updates.selling_price !== oldSelling) {
        changes.push(`Prix vendant: ${oldSelling.toFixed(2)}$ → ${updates.selling_price.toFixed(2)}$`);
      }
      if (updates.stock_qty !== oldQty) {
        changes.push(`Quantité: ${oldQty} → ${updates.stock_qty}`);
      }

      const tableName = isProduct ? 'products' : 'non_inventory_items';

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
              type: isProduct ? 'Inventaire' : 'Non-Inventaire'
            })
          });
        } catch (emailError) {
          console.error('Erreur envoi email:', emailError);
        }
      }

      // Mettre à jour localement dans displayItems
      if (data && data.length > 0) {
        const updatedItem = { ...data[0], _source: editingItem._source };

        setDisplayItems(prev =>
          prev.map(item =>
            item.product_id === updatedItem.product_id && item._source === updatedItem._source
              ? updatedItem
              : item
          )
        );

        showToast('Modifications sauvegardées');
      }

      closeEditModal();

    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      showToast('Erreur lors de la sauvegarde', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ===== LABEL DU MODE ACTIF =====
  const getModeLabel = () => {
    switch (loadMode) {
      case 'search':
        return `Résultats pour "${searchTerm}"`;
      case 'all':
        return 'Tous les produits';
      case 'group':
        return `Groupe: ${selectedLoadGroup}`;
      default:
        return null;
    }
  };

  // ===== RENDU =====
  return (
    <div className="max-w-6xl mx-auto p-2 sm:p-4 space-y-3">

      {/* En-tête */}
      <div className="bg-gradient-to-r from-blue-500 via-purple-500 to-indigo-500 rounded-lg shadow-lg p-3 text-white">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h2 className="text-xl font-bold">Gestion Inventaire</h2>
            <p className="text-white/90 text-sm mt-1">
              Recherchez ou chargez vos produits
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowInventoryUpload(true)}
              className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-xs font-medium hover:bg-white/20 disabled:opacity-50 flex items-center"
            >
              <Upload className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Import</span>
            </button>
            {loadMode !== 'idle' && (
              <button
                onClick={clearResults}
                className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-xs font-medium hover:bg-white/20 flex items-center"
                title="Effacer et revenir à l'accueil"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Barre de recherche + Options de chargement */}
      <div className="bg-white rounded-lg shadow-md p-3 space-y-3">
        {/* Recherche */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Rechercher par code ou description (min. 2 caractères)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-10 py-3 rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base"
          />
          {searchLoading && (
            <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 text-blue-500 w-5 h-5 animate-spin" />
          )}
          {searchTerm && !searchLoading && (
            <button
              onClick={() => { setSearchTerm(''); if (loadMode === 'search') clearResults(); }}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Boutons de chargement */}
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Dropdown charger par groupe */}
          <div className="flex-1 relative">
            <select
              value=""
              onChange={(e) => { if (e.target.value) loadByGroup(e.target.value); }}
              className="w-full px-3 py-3 rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm appearance-none bg-white cursor-pointer"
              disabled={loading}
            >
              <option value="">Charger par groupe...</option>
              {productGroups.map(group => (
                <option key={group} value={group}>{group}</option>
              ))}
            </select>
            <FolderOpen className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
          </div>

          {/* Bouton charger tout */}
          <button
            onClick={loadAll}
            disabled={loading}
            className="px-4 py-3 bg-gray-100 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50 flex items-center justify-center gap-2 min-w-[140px]"
          >
            {loading && loadMode !== 'group' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <List className="w-4 h-4" />
            )}
            Charger tout
          </button>
        </div>

        {/* Indicateur du mode actif + compteurs */}
        {loadMode !== 'idle' && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-sm text-gray-600 font-medium">
              {getModeLabel()}
            </span>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
              {itemCount.products} inventaire
            </span>
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
              {itemCount.nonInventory} non-inv.
            </span>
            <span className="text-xs text-gray-500">
              ({displayItems.length} total)
            </span>
          </div>
        )}
      </div>

      {/* État IDLE — Instructions */}
      {loadMode === 'idle' && !loading && (
        <div className="bg-white rounded-lg shadow-md py-16 text-center">
          <Search className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-600 mb-2">
            Recherchez un produit pour commencer
          </h3>
          <p className="text-sm text-gray-400 max-w-md mx-auto">
            Tapez au moins 2 caractères dans la barre de recherche,
            ou utilisez les boutons ci-dessus pour charger les produits par groupe ou en totalité.
          </p>
        </div>
      )}

      {/* Spinner de chargement (charger tout / par groupe) */}
      {loading && (
        <div className="bg-white rounded-lg shadow-md py-16 text-center">
          <Loader2 className="w-12 h-12 mx-auto mb-4 text-blue-500 animate-spin" />
          <p className="text-blue-600 font-medium">
            {loadMode === 'all' || (!selectedLoadGroup && loadMode !== 'group')
              ? 'Chargement de tous les produits...'
              : `Chargement du groupe "${selectedLoadGroup}"...`
            }
          </p>
          <p className="text-sm text-gray-400 mt-1">
            Cela peut prendre quelques secondes
          </p>
        </div>
      )}

      {/* Liste des produits */}
      {!loading && loadMode !== 'idle' && (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {displayItems.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500 text-lg">
                Aucun produit trouvé
              </p>
              {loadMode === 'search' && (
                <p className="text-sm text-gray-400 mt-1">
                  Essayez un autre terme de recherche
                </p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {displayItems.map((item) => {
                const qty = quantityMap[item.product_id] || { onOrder: 0, reserved: 0 };
                const isProduct = item._source === 'products';
                const stockQty = parseInt(item.stock_qty) || 0;
                return (
                  <div
                    key={`${item._source}-${item.product_id}`}
                    className="p-4 hover:bg-blue-50 cursor-pointer active:bg-blue-100 transition-colors"
                    onClick={() => openEditModal(item)}
                  >
                    <div className="flex justify-between items-start">

                      {/* Informations produit */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1 flex-wrap gap-y-1">
                          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-mono">
                            {item.product_id}
                          </span>
                          {item.product_group && (
                            <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">
                              {item.product_group}
                            </span>
                          )}
                          {/* Badge source — toujours visible */}
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                            isProduct
                              ? 'bg-blue-50 text-blue-600 border border-blue-200'
                              : 'bg-purple-50 text-purple-600 border border-purple-200'
                          }`}>
                            {isProduct ? 'Inventaire' : 'Non-inv.'}
                          </span>
                          {stockQty < 10 && isProduct && (
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
                          {item.supplier && <span>Dern. fourn.: {item.supplier}</span>}
                        </div>
                      </div>

                      {/* Quantités */}
                      <div className="flex flex-col items-center mx-3 min-w-[70px] text-xs space-y-0.5">
                        <div className={`font-semibold ${stockQty < 10 && isProduct ? 'text-red-600' : 'text-gray-900'}`}>
                          {stockQty}
                        </div>
                        <div className="text-[10px] text-gray-400 uppercase tracking-wide">en main</div>
                        <div className={`font-medium ${qty.onOrder > 0 ? 'text-blue-600' : 'text-gray-400'}`} title="En commande (AF)">
                          +{qty.onOrder}
                          <span className={`text-[10px] ml-0.5 ${qty.onOrder > 0 ? 'text-blue-400' : 'text-gray-300'}`}>cmd</span>
                        </div>
                        <div className={`font-medium ${qty.reserved > 0 ? 'text-orange-600' : 'text-gray-400'}`} title="Réservé (BT/BL/Soumissions)">
                          -{qty.reserved}
                          <span className={`text-[10px] ml-0.5 ${qty.reserved > 0 ? 'text-orange-400' : 'text-gray-300'}`}>rés</span>
                        </div>
                      </div>

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
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal unifié : Édition + Historique + Prix */}
      {editingItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[95vh] flex flex-col shadow-xl">
            {/* Header */}
            <div className="bg-blue-50 px-6 py-4 border-b">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold text-blue-900">
                    {editingItem.product_id}
                  </h3>
                  <p className="text-sm text-blue-700 mt-1">
                    {editingItem.description}
                  </p>
                </div>
                <button onClick={closeEditModal} className="p-1 hover:bg-blue-100 rounded">
                  <X className="w-5 h-5 text-blue-800" />
                </button>
              </div>
            </div>

            {/* Onglets */}
            <div className="flex border-b">
              <button
                onClick={() => setModalTab('edit')}
                className={`flex-1 py-2.5 px-3 text-sm font-medium border-b-2 transition-colors ${
                  modalTab === 'edit'
                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Edit className="w-4 h-4 inline mr-1" />
                Modifier
              </button>
              <button
                onClick={() => setModalTab('history')}
                className={`flex-1 py-2.5 px-3 text-sm font-medium border-b-2 transition-colors ${
                  modalTab === 'history'
                    ? 'border-gray-700 text-gray-800 bg-gray-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <History className="w-4 h-4 inline mr-1" />
                Mouvements
              </button>
              <button
                onClick={() => setModalTab('prices')}
                className={`flex-1 py-2.5 px-3 text-sm font-medium border-b-2 transition-colors ${
                  modalTab === 'prices'
                    ? 'border-green-500 text-green-700 bg-green-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <DollarSign className="w-4 h-4 inline mr-1" />
                Hist. Prix
              </button>
            </div>

            {/* Contenu scrollable */}
            <div className="flex-1 overflow-y-auto p-5">

              {/* === ONGLET MODIFIER === */}
              {modalTab === 'edit' && (
                <div className="space-y-4">
                  {/* Description (modifiable, majuscules) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      value={editForm.description}
                      onChange={(e) => setEditForm({...editForm, description: e.target.value.toUpperCase()})}
                      className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3"
                      placeholder="Description du produit"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Dernier fournisseur
                    </label>
                    <input
                      type="text"
                      value={editForm.supplier}
                      onChange={(e) => setEditForm({...editForm, supplier: e.target.value.toUpperCase()})}
                      className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3"
                      placeholder="Mis à jour automatiquement lors d'un AF"
                    />
                  </div>

                  {/* Prix coûtant + vendant côte à côte */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Prix coûtant
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        value={editForm.cost_price}
                        onChange={(e) => setEditForm({...editForm, cost_price: e.target.value})}
                        onFocus={(e) => e.target.select()}
                        className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Prix vendant *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        value={editForm.selling_price}
                        onChange={(e) => setEditForm({...editForm, selling_price: e.target.value})}
                        onFocus={(e) => e.target.select()}
                        className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3"
                        placeholder="0.00"
                        required
                      />
                    </div>
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
                          inputMode="numeric"
                          value={marginPercent}
                          onChange={(e) => setMarginPercent(e.target.value)}
                          onFocus={(e) => e.target.select()}
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quantité en stock
                    </label>
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={editForm.stock_qty}
                      onChange={(e) => setEditForm({...editForm, stock_qty: e.target.value})}
                      onFocus={(e) => e.target.select()}
                      className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3"
                      placeholder="0"
                    />
                  </div>

                  {/* Quantités en commande et réservé */}
                  {(() => {
                    const qty = quantityMap[editingItem.product_id] || { onOrder: 0, reserved: 0 };
                    const stockVal = parseInt(editForm.stock_qty) || 0;
                    const dispo = stockVal - qty.reserved;
                    return (
                      <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Détail quantités</div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700">En main (stock)</span>
                          <span className="font-medium text-gray-900">{stockVal}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className={qty.onOrder > 0 ? 'text-blue-700' : 'text-gray-400'}>En commande (AF)</span>
                          <span className={`font-medium ${qty.onOrder > 0 ? 'text-blue-700' : 'text-gray-400'}`}>+{qty.onOrder}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className={qty.reserved > 0 ? 'text-orange-700' : 'text-gray-400'}>Réservé (BT/BL/Soum.)</span>
                          <span className={`font-medium ${qty.reserved > 0 ? 'text-orange-700' : 'text-gray-400'}`}>-{qty.reserved}</span>
                        </div>
                        <div className="border-t pt-1.5 flex justify-between text-sm">
                          <span className={`font-medium ${dispo < 0 ? 'text-red-700' : 'text-green-700'}`}>Disponible réel</span>
                          <span className={`font-bold ${dispo < 0 ? 'text-red-700' : 'text-green-700'}`}>{dispo}</span>
                        </div>
                      </div>
                    );
                  })()}

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
              )}

              {/* === ONGLET HISTORIQUE MOUVEMENTS === */}
              {modalTab === 'history' && (
                <div>
                  {historyLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600"></div>
                      <span className="ml-3 text-gray-600">Chargement...</span>
                    </div>
                  ) : historyMovements.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>Aucun mouvement enregistré pour ce produit</p>
                    </div>
                  ) : (
                    <>
                      {/* Résumé IN/OUT */}
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                          <ArrowDownCircle className="w-5 h-5 mx-auto mb-1 text-green-600" />
                          <div className="text-lg font-bold text-green-700">
                            {historyMovements
                              .filter(m => m.movement_type === 'IN')
                              .reduce((sum, m) => sum + (parseFloat(m.quantity) || 0), 0)
                              .toFixed(2)}
                          </div>
                          <div className="text-xs text-green-600">Total entré (IN)</div>
                        </div>
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                          <ArrowUpCircle className="w-5 h-5 mx-auto mb-1 text-red-600" />
                          <div className="text-lg font-bold text-red-700">
                            {historyMovements
                              .filter(m => m.movement_type === 'OUT')
                              .reduce((sum, m) => sum + (parseFloat(m.quantity) || 0), 0)
                              .toFixed(2)}
                          </div>
                          <div className="text-xs text-red-600">Total sorti (OUT)</div>
                        </div>
                      </div>

                      {/* Liste des mouvements */}
                      <div className="space-y-2">
                        {historyMovements.map((movement, index) => {
                          const isIn = movement.movement_type === 'IN';
                          return (
                            <div
                              key={movement.id || index}
                              className={`border rounded-lg p-3 ${
                                isIn ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                              }`}
                            >
                              <div className="flex justify-between items-start">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                                      isIn
                                        ? 'bg-green-200 text-green-800'
                                        : 'bg-red-200 text-red-800'
                                    }`}>
                                      {isIn ? '+ IN' : '- OUT'}
                                    </span>
                                    <span className="text-sm font-medium text-gray-900">
                                      {parseFloat(movement.quantity).toFixed(2)} {movement.unit}
                                    </span>
                                  </div>
                                  <p className="text-xs text-gray-600 truncate">
                                    {movement.notes || movement.reference_number || '-'}
                                  </p>
                                  {movement.reference_type && (
                                    <span className="text-[10px] text-gray-400 uppercase">
                                      {movement.reference_type === 'supplier_purchase' && 'Achat fournisseur'}
                                      {movement.reference_type === 'work_order' && 'Bon de travail'}
                                      {movement.reference_type === 'delivery_note' && 'Bon de livraison'}
                                      {movement.reference_type === 'delivery_slip' && 'Bon de livraison'}
                                      {movement.reference_type === 'direct_receipt' && 'Réception directe'}
                                      {movement.reference_type === 'adjustment' && 'Ajustement'}
                                      {!['supplier_purchase', 'work_order', 'delivery_note', 'delivery_slip', 'direct_receipt', 'adjustment'].includes(movement.reference_type) && movement.reference_type}
                                    </span>
                                  )}
                                </div>
                                <div className="text-right ml-3 shrink-0">
                                  <div className="text-xs font-medium text-gray-700">
                                    {formatMovementDate(movement.created_at)}
                                  </div>
                                  {movement.unit_cost > 0 && (
                                    <div className="text-[10px] text-gray-400">
                                      {formatCurrency(movement.unit_cost)}/{movement.unit}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* === ONGLET HISTORIQUE PRIX === */}
              {modalTab === 'prices' && (
                <div className="space-y-4">
                  {/* Prix actuel */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="text-xs font-medium text-blue-500 uppercase tracking-wide mb-2">Prix actuel</div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-gray-500">Coûtant</div>
                        <div className="text-lg font-bold text-gray-900">{formatCurrency(editingItem.cost_price)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Vendant</div>
                        <div className="text-lg font-bold text-gray-900">{formatCurrency(editingItem.selling_price)}</div>
                      </div>
                    </div>
                    <div className={`text-sm font-medium mt-1 ${getMarginColor(editingItem.cost_price, editingItem.selling_price)}`}>
                      Marge: {getMarginPercentage(editingItem.cost_price, editingItem.selling_price)}
                    </div>
                  </div>

                  {/* Historique des prix */}
                  {(editingItem.cost_price_1st != null || editingItem.selling_price_1st != null) ? (
                    <div className="space-y-3">
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Historique (du plus récent au plus ancien)</div>

                      {/* Prix précédent (1st) */}
                      {(editingItem.cost_price_1st != null || editingItem.selling_price_1st != null) && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                          <div className="text-xs font-medium text-gray-400 mb-1">Prix précédent (n-1)</div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-xs text-gray-400">Coûtant</div>
                              <div className="text-sm font-medium text-gray-700">
                                {editingItem.cost_price_1st != null ? formatCurrency(editingItem.cost_price_1st) : '-'}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-400">Vendant</div>
                              <div className="text-sm font-medium text-gray-700">
                                {editingItem.selling_price_1st != null ? formatCurrency(editingItem.selling_price_1st) : '-'}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Prix n-2 (2nd) */}
                      {(editingItem.cost_price_2nd != null || editingItem.selling_price_2nd != null) && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                          <div className="text-xs font-medium text-gray-400 mb-1">Avant-dernier (n-2)</div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-xs text-gray-400">Coûtant</div>
                              <div className="text-sm font-medium text-gray-700">
                                {editingItem.cost_price_2nd != null ? formatCurrency(editingItem.cost_price_2nd) : '-'}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-400">Vendant</div>
                              <div className="text-sm font-medium text-gray-700">
                                {editingItem.selling_price_2nd != null ? formatCurrency(editingItem.selling_price_2nd) : '-'}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Prix n-3 (3rd) */}
                      {(editingItem.cost_price_3rd != null || editingItem.selling_price_3rd != null) && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                          <div className="text-xs font-medium text-gray-400 mb-1">Plus ancien (n-3)</div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-xs text-gray-400">Coûtant</div>
                              <div className="text-sm font-medium text-gray-700">
                                {editingItem.cost_price_3rd != null ? formatCurrency(editingItem.cost_price_3rd) : '-'}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-400">Vendant</div>
                              <div className="text-sm font-medium text-gray-700">
                                {editingItem.selling_price_3rd != null ? formatCurrency(editingItem.selling_price_3rd) : '-'}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>Aucun historique de prix enregistré</p>
                      <p className="text-xs mt-1">L'historique se remplira au prochain changement de prix</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer avec boutons */}
            <div className="bg-gray-50 px-6 py-4 flex gap-3 border-t">
              <button
                onClick={closeEditModal}
                disabled={saving}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50"
              >
                {modalTab === 'edit' ? 'Annuler' : 'Fermer'}
              </button>
              {modalTab === 'edit' && (
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
              )}
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

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 transform -translate-x-1/2 z-[100] px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium transition-opacity ${
          toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'
        }`}>
          {toast.message}
        </div>
      )}

    </div>
  );
}
