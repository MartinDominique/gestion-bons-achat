/**
 * @file components/SupplierReceiptModal.js
 * @description Modal de réception d'un achat fournisseur (AF).
 *              - Permet de recevoir partiellement ou totalement les items
 *              - Met à jour le stock (products / non_inventory_items)
 *              - Crée les mouvements d'inventaire (IN)
 *              - Décale l'historique des prix (shift) si le cost_price change
 * @version 1.1.0
 * @date 2026-02-11
 * @changelog
 *   1.1.0 - Ajout décalage historique prix (price shift) lors de la réception AF
 *   1.0.0 - Version initiale
 */
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { buildPriceShiftUpdates } from '../lib/utils/priceShift';
import { Package, Check, X, Truck, AlertCircle, History } from 'lucide-react';

// Formatage monétaire
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD'
  }).format(amount || 0);
};

// Formatage date
const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('fr-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export default function SupplierReceiptModal({ 
  isOpen, 
  onClose, 
  purchase, 
  onReceiptComplete 
}) {
  // États
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Historique des réceptions
  const [previousReceipts, setPreviousReceipts] = useState([]);
  
  // Items avec quantités à recevoir
  const [receiptItems, setReceiptItems] = useState([]);
  
  // Notes de réception
  const [receiptNotes, setReceiptNotes] = useState('');
  
  // Numéro bon de livraison fournisseur
  const [supplierDeliveryNumber, setSupplierDeliveryNumber] = useState('');
  
  // Onglet actif
  const [activeTab, setActiveTab] = useState('receive'); // 'receive' ou 'history'

  // Charger les données quand le modal s'ouvre
  useEffect(() => {
    if (isOpen && purchase) {
      loadReceiptData();
    }
  }, [isOpen, purchase]);

  // Charger les réceptions existantes et préparer les items
  const loadReceiptData = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Charger les réceptions précédentes
      const { data: receipts, error: receiptsError } = await supabase
        .from('supplier_purchase_receipts')
        .select('*')
        .eq('supplier_purchase_id', purchase.id)
        .order('received_at', { ascending: false });
      
      if (receiptsError) throw receiptsError;
      
      setPreviousReceipts(receipts || []);
      
      // Calculer les quantités déjà reçues par produit
      const receivedByProduct = {};
      (receipts || []).forEach(receipt => {
        (receipt.items_received || []).forEach(item => {
          const key = item.product_id;
          receivedByProduct[key] = (receivedByProduct[key] || 0) + (item.quantity_received || 0);
        });
      });
      
      // Charger le stock actuel de tous les produits concernés (products)
      const productIds = (purchase.items || []).filter(item => !item.is_non_inventory).map(item => item.product_id);
      const nonInventoryIds = (purchase.items || []).filter(item => item.is_non_inventory).map(item => item.product_id);
      
      let stockByProduct = {};
      
      // Charger stock des products
      if (productIds.length > 0) {
        const { data: productsStock, error: stockError } = await supabase
          .from('products')
          .select('product_id, stock_qty')
          .in('product_id', productIds);
        
        if (stockError) {
          console.error('Erreur chargement stock products:', stockError);
        }
        
        (productsStock || []).forEach(p => {
          stockByProduct[p.product_id] = parseFloat(p.stock_qty) || 0;
        });
      }
      
      // Charger stock des non_inventory_items
      if (nonInventoryIds.length > 0) {
        const { data: nonInventoryStock, error: nonInvError } = await supabase
          .from('non_inventory_items')
          .select('product_id, stock_qty')
          .in('product_id', nonInventoryIds);
        
        if (nonInvError) {
          console.error('Erreur chargement stock non_inventory:', nonInvError);
        }
        
        (nonInventoryStock || []).forEach(p => {
          stockByProduct[p.product_id] = parseFloat(p.stock_qty) || 0;
        });
      }
      
      // Préparer les items pour la réception
      const items = (purchase.items || []).map((item, index) => {
        const alreadyReceived = receivedByProduct[item.product_id] || 0;
        const remaining = (item.quantity || 0) - alreadyReceived;
        const currentStock = stockByProduct[item.product_id] || 0;
        
        return {
          index,
          product_id: item.product_id,
          description: item.description,
          unit: item.unit || 'UN',
          quantity_ordered: item.quantity || 0,
          quantity_received_before: alreadyReceived,
          quantity_remaining: Math.max(0, remaining),
          quantity_to_receive: 0, // À remplir par l'utilisateur
          selected: false,
          cost_price: item.cost_price || 0,
          product_group: item.product_group || '',
          current_stock: currentStock, // Stock actuel
          is_non_inventory: item.is_non_inventory || false // Type d'item
        };
      });
      
      setReceiptItems(items);
      
    } catch (err) {
      console.error('Erreur chargement réceptions:', err);
      setError('Erreur lors du chargement: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Sélectionner/désélectionner un item
  const toggleItemSelection = (index) => {
    setReceiptItems(prev => prev.map((item, i) => {
      if (i === index) {
        const newSelected = !item.selected;
        return {
          ...item,
          selected: newSelected,
          // Si sélectionné, mettre la quantité restante par défaut
          quantity_to_receive: newSelected ? item.quantity_remaining : 0
        };
      }
      return item;
    }));
  };

  // Tout sélectionner
  const selectAll = () => {
    setReceiptItems(prev => prev.map(item => ({
      ...item,
      selected: item.quantity_remaining > 0,
      quantity_to_receive: item.quantity_remaining
    })));
  };

  // Tout désélectionner
  const deselectAll = () => {
    setReceiptItems(prev => prev.map(item => ({
      ...item,
      selected: false,
      quantity_to_receive: 0
    })));
  };

  // Mettre à jour la quantité à recevoir
  const updateQuantityToReceive = (index, value) => {
    const qty = parseFloat(value) || 0;
    setReceiptItems(prev => prev.map((item, i) => {
      if (i === index) {
        return {
          ...item,
          quantity_to_receive: Math.min(Math.max(0, qty), item.quantity_remaining),
          selected: qty > 0
        };
      }
      return item;
    }));
  };

  // Sauvegarder la réception
  const handleSaveReceipt = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      
      // Filtrer les items avec quantité > 0
      const itemsToReceive = receiptItems.filter(item => item.quantity_to_receive > 0);
      
      if (itemsToReceive.length === 0) {
        setError('Veuillez sélectionner au moins un article à recevoir.');
        setSaving(false);
        return;
      }
      
      // 1. Créer l'entrée de réception
      const receiptData = {
        supplier_purchase_id: purchase.id,
        purchase_number: purchase.purchase_number,
        items_received: itemsToReceive.map(item => ({
          product_id: item.product_id,
          description: item.description,
          quantity_received: item.quantity_to_receive,
          unit: item.unit,
          cost_price: item.cost_price,
          is_non_inventory: item.is_non_inventory
        })),
        notes: receiptNotes,
        supplier_delivery_number: supplierDeliveryNumber || null,
        received_at: new Date().toISOString()
      };
      
      const { data: receipt, error: receiptError } = await supabase
        .from('supplier_purchase_receipts')
        .insert([receiptData])
        .select()
        .single();
      
      if (receiptError) throw receiptError;
      
      // 2. Créer les mouvements d'inventaire (IN)
      const movements = itemsToReceive.map(item => ({
        product_id: item.product_id,
        product_description: item.description,
        product_group: item.product_group,
        unit: item.unit,
        movement_type: 'IN',
        quantity: item.quantity_to_receive,
        unit_cost: item.cost_price,
        total_cost: item.quantity_to_receive * item.cost_price,
        reference_type: 'supplier_purchase',
        reference_id: purchase.id,
        reference_number: purchase.purchase_number,
        notes: `Réception achat ${purchase.purchase_number}`,
        created_at: new Date().toISOString()
      }));
      
      const { error: movementError } = await supabase
        .from('inventory_movements')
        .insert(movements);
      
      if (movementError) {
        console.error('Erreur mouvements:', movementError);
        // Continuer quand même, les mouvements peuvent échouer si le produit n'existe pas
      }
      
      // 3. Mettre à jour le stock + décalage prix dans la bonne table (products ou non_inventory_items)
      for (const item of itemsToReceive) {
        const tableName = item.is_non_inventory ? 'non_inventory_items' : 'products';

        // Récupérer le produit actuel (stock + prix pour le shift)
        const { data: product, error: productError } = await supabase
          .from(tableName)
          .select('stock_qty, cost_price, cost_price_1st, cost_price_2nd, cost_price_3rd')
          .eq('product_id', item.product_id)
          .single();

        if (!productError && product) {
          const currentStock = parseFloat(product.stock_qty) || 0;
          const newStock = currentStock + item.quantity_to_receive;

          // Construire l'update de base (stock)
          const updates = { stock_qty: newStock.toString() };

          // Décalage des prix si le cost_price de l'AF est différent du cost_price actuel
          const priceShiftUpdates = buildPriceShiftUpdates(product, {
            cost_price: item.cost_price,
          });
          Object.assign(updates, priceShiftUpdates);

          await supabase
            .from(tableName)
            .update(updates)
            .eq('product_id', item.product_id);

          const priceChanged = Object.keys(priceShiftUpdates).length > 0;
          console.log(`Stock mis à jour: ${item.product_id} (${tableName}): ${currentStock} → ${newStock}${priceChanged ? ' + prix décalé' : ''}`);
        }
      }
      
      // 4. Vérifier si tout est reçu et mettre à jour le statut
      const allReceived = receiptItems.every(item => {
        const totalReceived = item.quantity_received_before + 
          (itemsToReceive.find(i => i.product_id === item.product_id)?.quantity_to_receive || 0);
        return totalReceived >= item.quantity_ordered;
      });
      
      if (allReceived) {
        await supabase
          .from('supplier_purchases')
          .update({ status: 'received' })
          .eq('id', purchase.id);
      }
      
      setSuccess(`Réception enregistrée! ${itemsToReceive.length} article(s) reçu(s).`);
      
      // Recharger les données
      await loadReceiptData();
      setReceiptNotes('');
      setSupplierDeliveryNumber('');
      
      // Notifier le parent
      if (onReceiptComplete) {
        onReceiptComplete();
      }
      
    } catch (err) {
      console.error('Erreur sauvegarde réception:', err);
      setError('Erreur lors de la sauvegarde: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  // Calculer les statistiques
  const totalItems = receiptItems.length;
  const itemsFullyReceived = receiptItems.filter(i => i.quantity_remaining === 0).length;
  const itemsPartiallyReceived = receiptItems.filter(i => i.quantity_received_before > 0 && i.quantity_remaining > 0).length;
  const itemsToReceiveCount = receiptItems.filter(i => i.quantity_to_receive > 0).length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[95vh] flex flex-col shadow-2xl">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-4 rounded-t-xl">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Truck className="w-6 h-6" />
                Réception - {purchase?.purchase_number}
              </h2>
              <p className="text-green-100 text-sm mt-1">
                {purchase?.supplier_name}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          
          {/* Statistiques */}
          <div className="flex gap-4 mt-4 text-sm">
            <div className="bg-white/20 px-3 py-1 rounded-full">
              Total: {totalItems} articles
            </div>
            <div className="bg-green-500 px-3 py-1 rounded-full">
              ✓ Complets: {itemsFullyReceived}
            </div>
            {itemsPartiallyReceived > 0 && (
              <div className="bg-yellow-500 px-3 py-1 rounded-full">
                ⏳ Partiels: {itemsPartiallyReceived}
              </div>
            )}
            <div className="bg-white/20 px-3 py-1 rounded-full">
              En attente: {totalItems - itemsFullyReceived}
            </div>
          </div>
        </div>

        {/* Onglets */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('receive')}
            className={`flex-1 py-3 px-4 text-center font-medium transition-colors ${
              activeTab === 'receive'
                ? 'text-green-600 border-b-2 border-green-600 bg-green-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Package className="w-4 h-4 inline mr-2" />
            Nouvelle Réception
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-3 px-4 text-center font-medium transition-colors ${
              activeTab === 'history'
                ? 'text-green-600 border-b-2 border-green-600 bg-green-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <History className="w-4 h-4 inline mr-2" />
            Historique ({previousReceipts.length})
          </button>
        </div>

        {/* Messages */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}
        {success && (
          <div className="mx-4 mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 flex items-center gap-2">
            <Check className="w-5 h-5" />
            {success}
          </div>
        )}

        {/* Contenu */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
              <span className="ml-3 text-gray-600">Chargement...</span>
            </div>
          ) : activeTab === 'receive' ? (
            <>
              {/* Boutons de sélection rapide */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={selectAll}
                  className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm hover:bg-green-200"
                >
                  ✓ Tout sélectionner
                </button>
                <button
                  onClick={deselectAll}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
                >
                  ✕ Tout désélectionner
                </button>
                {itemsToReceiveCount > 0 && (
                  <span className="ml-auto px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm">
                    {itemsToReceiveCount} article(s) sélectionné(s)
                  </span>
                )}
              </div>

              {/* Liste des items */}
              <div className="space-y-2">
                {receiptItems.filter(item => item.quantity_remaining > 0).length === 0 ? (
                  <div className="text-center py-8 bg-green-50 rounded-lg border border-green-200">
                    <Check className="w-12 h-12 mx-auto mb-3 text-green-500" />
                    <p className="text-green-700 font-medium">Tous les articles ont été reçus!</p>
                    <p className="text-green-600 text-sm mt-1">Cette commande est complète.</p>
                  </div>
                ) : (
                  receiptItems.filter(item => item.quantity_remaining > 0).map((item) => (
                  <div
                    key={item.index}
                    className={`border rounded-lg p-3 transition-colors ${
                      item.quantity_remaining === 0
                        ? 'bg-green-50 border-green-200'
                        : item.selected
                          ? 'bg-blue-50 border-blue-300'
                          : 'bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => toggleItemSelection(item.index)}
                        disabled={item.quantity_remaining === 0}
                        className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                      
                      {/* Info produit */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded">
                            {item.product_id}
                          </span>
                          {item.is_non_inventory && (
                            <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full">
                              Non-inv.
                            </span>
                          )}
                          {item.quantity_remaining === 0 && (
                            <span className="bg-green-500 text-white text-xs px-2 py-0.5 rounded-full">
                              Complet
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 truncate mt-1">
                          {item.description}
                        </p>
                      </div>
                      
                      {/* Quantités */}
                      <div className="text-right text-sm space-y-1 min-w-[140px]">
                        <div className="text-gray-500">
                          Commandé: <span className="font-medium text-gray-900">{item.quantity_ordered}</span> {item.unit}
                        </div>
                        <div className="text-green-600">
                          Déjà reçu: <span className="font-medium">{item.quantity_received_before}</span>
                        </div>
                        <div className="text-orange-600">
                          Reste: <span className="font-medium">{item.quantity_remaining}</span>
                        </div>
                      </div>
                      
                      {/* Stock actuel et nouveau */}
                      <div className="text-right text-sm space-y-1 min-w-[120px] border-l pl-3">
                        <div className="text-blue-600">
                          Stock actuel: <span className="font-bold">{item.current_stock}</span>
                        </div>
                        {item.quantity_to_receive > 0 && (
                          <div className="text-green-600 bg-green-50 px-2 py-0.5 rounded">
                            Nouveau: <span className="font-bold">{item.current_stock + item.quantity_to_receive}</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Input quantité */}
                      <div className="w-24">
                        <label className="text-xs text-gray-500 block mb-1">À recevoir</label>
                        <input
                          type="number"
                          min="0"
                          max={item.quantity_remaining}
                          value={item.quantity_to_receive || ''}
                          onChange={(e) => updateQuantityToReceive(item.index, e.target.value)}
                          disabled={item.quantity_remaining === 0}
                          className="w-full px-2 py-1 border rounded text-center font-medium disabled:bg-gray-100 disabled:text-gray-400"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  </div>
                ))
                )}
              </div>

             {/* Numéro bon de livraison fournisseur */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  N° Bon de livraison fournisseur (optionnel)
                </label>
                <input
                  type="text"
                  value={supplierDeliveryNumber}
                  onChange={(e) => setSupplierDeliveryNumber(e.target.value.toUpperCase())}
                  placeholder="Ex: BL-12345, 987654..."
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              {/* Notes */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes de réception (optionnel)
                </label>
                <textarea
                  value={receiptNotes}
                  onChange={(e) => setReceiptNotes(e.target.value)}
                  placeholder="Ex: Colis endommagé, manque 2 pièces, etc."
                  className="w-full px-3 py-2 border rounded-lg resize-none"
                  rows={2}
                />
              </div>
            </>
          ) : (
            /* Onglet Historique */
            <div className="space-y-4">
              {previousReceipts.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Aucune réception enregistrée</p>
                </div>
              ) : (
                previousReceipts.map((receipt, index) => (
                  <div key={receipt.id} className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <span className="text-sm font-medium text-gray-900">
                          Réception #{previousReceipts.length - index}
                        </span>
                        <p className="text-xs text-gray-500">
                          {formatDate(receipt.received_at)}
                        </p>
                        {receipt.supplier_delivery_number && (
                          <p className="text-xs text-blue-600 font-medium mt-1">
                            📦 BL: {receipt.supplier_delivery_number}
                          </p>
                        )}
                      </div>
                      <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">
                        {receipt.items_received?.length || 0} article(s)
                      </span>
                    </div>
                    
                    <div className="space-y-1">
                      {(receipt.items_received || []).map((item, i) => (
                        <div key={i} className="flex justify-between text-sm bg-white p-2 rounded">
                          <span className="text-gray-600">
                            <span className="font-mono text-xs bg-gray-100 px-1 rounded mr-2">
                              {item.product_id}
                            </span>
                            {item.description}
                          </span>
                          <span className="font-medium text-green-600">
                            +{item.quantity_received} {item.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                    
                    {receipt.notes && (
                      <p className="mt-2 text-sm text-gray-500 italic">
                        Note: {receipt.notes}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {activeTab === 'receive' && (
          <div className="border-t px-6 py-4 bg-gray-50 rounded-b-xl flex justify-between items-center">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100"
            >
              Fermer
            </button>
            <div className="flex gap-2">
              <button
                onClick={handleSaveReceipt}
                disabled={saving || itemsToReceiveCount === 0}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Enregistrer la réception
                  </>
                )}
              </button>
              <button
                onClick={async () => {
                  await handleSaveReceipt();
                  if (itemsToReceiveCount > 0) onClose();
                }}
                disabled={saving || itemsToReceiveCount === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                Enregistrer et Fermer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
