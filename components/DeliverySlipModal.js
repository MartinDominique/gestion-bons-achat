import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const DeliverySlipModal = ({ isOpen, onClose, purchaseOrder, onRefresh }) => {
  const [formData, setFormData] = useState({
    delivery_date: new Date().toISOString().split('T')[0],
    transport_company: '',
    tracking_number: '',
    delivery_contact: '',
    special_instructions: '',
    items: []
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasExistingSubmission, setHasExistingSubmission] = useState(false);

  // Vérifier si le BA a déjà une soumission attribuée
  const checkExistingSubmission = async (poId) => {
    if (!poId) return false;
    
    try {
      // Récupérer le BA pour voir s'il a un submission_no
      const { data: poData, error } = await supabase
        .from('purchase_orders')
        .select('submission_no')
        .eq('id', poId)
        .single();
      
      if (error) throw error;
      
      const hasSubmission = poData?.submission_no && poData.submission_no.trim() !== '';
      setHasExistingSubmission(hasSubmission);
      return hasSubmission;
      
    } catch (error) {
      console.error('Erreur vérification soumission:', error);
      return false;
    }
  };

  // Charger les articles depuis client_po_items
  const loadPOItems = async () => {
    if (!purchaseOrder?.id) return;

    try {
      console.log('Chargement articles pour BA:', purchaseOrder.id);
      
      // Vérifier d'abord qu'il y a une soumission attribuée
      const hasSubmission = await checkExistingSubmission(purchaseOrder.id);
      
      if (!hasSubmission) {
        setError('Ce bon d\'achat n\'a pas de soumission attribuée. Impossible de créer une livraison.');
        return;
      }

      // Charger les articles depuis client_po_items
      const { data: poItems, error: itemsError } = await supabase
        .from('client_po_items')
        .select('*')
        .eq('purchase_order_id', purchaseOrder.id)
        .order('product_id');
      
      if (itemsError) {
        console.error('Erreur chargement articles:', itemsError);
        setError('Erreur lors du chargement des articles');
        return;
      }
      
      if (!poItems || poItems.length === 0) {
        setError('Aucun article trouvé pour ce bon d\'achat');
        return;
      }

      // Préparer les articles avec quantités restantes
      const itemsWithSelection = poItems.map(item => {
        const deliveredQty = parseFloat(item.delivered_quantity) || 0;
        const totalQty = parseFloat(item.quantity) || 0;
        const remainingQty = Math.max(0, totalQty - deliveredQty);
        
        return {
          id: item.id,
          product_id: item.product_id,
          description: item.description,
          quantity: totalQty,
          unit: item.unit || 'unité',
          price: parseFloat(item.selling_price) || 0,
          delivered_quantity: deliveredQty,
          remaining_quantity: remainingQty,
          selected: false,
          quantity_to_deliver: 0
        };
      });
      
      setFormData(prev => ({ ...prev, items: itemsWithSelection }));
      console.log(`Articles chargés: ${poItems.length}`);
      
    } catch (error) {
      console.error('Erreur générale chargement:', error);
      setError('Erreur lors du chargement des données');
    }
  };

  // Charger les données quand le modal s'ouvre
  useEffect(() => {
    if (isOpen && purchaseOrder) {
      loadPOItems();
    }
  }, [isOpen, purchaseOrder]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setFormData({
        delivery_date: new Date().toISOString().split('T')[0],
        transport_company: '',
        tracking_number: '',
        delivery_contact: '',
        special_instructions: '',
        items: []
      });
      setError('');
      setHasExistingSubmission(false);
    }
  }, [isOpen]);

  // Sélectionner/désélectionner un article
  const handleItemSelect = (itemId) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item => 
        item.id === itemId 
          ? { 
              ...item, 
              selected: !item.selected,
              quantity_to_deliver: !item.selected ? item.remaining_quantity : 0
            }
          : item
      )
    }));
  };

  // Changer la quantité à livrer
  const handleQuantityChange = (itemId, newQuantity) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id === itemId) {
          const qty = Math.min(
            Math.max(0, parseFloat(newQuantity) || 0), 
            item.remaining_quantity
          );
          return {
            ...item,
            quantity_to_deliver: qty,
            selected: qty > 0
          };
        }
        return item;
      })
    }));
  };

  // Générer le numéro de bon de livraison
  const generateDeliveryNumber = async () => {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const prefix = `BL-${year}${month}`;
    
    const { data } = await supabase
      .from('delivery_slips')
      .select('delivery_number')
      .like('delivery_number', `${prefix}%`)
      .order('delivery_number', { ascending: false })
      .limit(1);
    
    if (!data || data.length === 0) {
      return `${prefix}-001`;
    }
    
    const lastNum = parseInt(data[0].delivery_number.split('-')[2]) || 0;
    return `${prefix}-${String(lastNum + 1).padStart(3, '0')}`;
  };

  // Soumettre le formulaire
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const selectedItems = formData.items.filter(item => item.selected && item.quantity_to_deliver > 0);
      
      if (selectedItems.length === 0) {
        setError('Veuillez sélectionner au moins un article à livrer');
        return;
      }

      // Générer le numéro de bon de livraison
      const deliveryNumber = await generateDeliveryNumber();

      // 1. Créer le bon de livraison principal
      const { data: deliverySlip, error: deliveryError } = await supabase
        .from('delivery_slips')
        .insert({
          delivery_number: deliveryNumber,
          purchase_order_id: purchaseOrder.id,
          delivery_date: formData.delivery_date,
          transport_company: formData.transport_company || null,
          tracking_number: formData.tracking_number || null,
          delivery_contact: formData.delivery_contact || null,
          special_instructions: formData.special_instructions || null,
          status: 'prepared'
        })
        .select()
        .single();

      if (deliveryError) {
        throw new Error(`Erreur création bon de livraison: ${deliveryError.message}`);
      }

      // 2. Ajouter les articles du bon de livraison
      const deliveryItems = selectedItems.map(item => ({
        delivery_slip_id: deliverySlip.id,
        client_po_item_id: item.id,
        product_id: item.product_id,
        description: item.description,
        quantity_delivered: item.quantity_to_deliver,
        unit: item.unit
      }));

      const { error: itemsError } = await supabase
        .from('delivery_slip_items')
        .insert(deliveryItems);

      if (itemsError) {
        throw new Error(`Erreur ajout articles: ${itemsError.message}`);
      }

      // 3. Mettre à jour les quantités livrées dans client_po_items
      for (const item of selectedItems) {
        const newDeliveredQty = item.delivered_quantity + item.quantity_to_deliver;
        
        const { error: updateError } = await supabase
          .from('client_po_items')
          .update({ 
            delivered_quantity: newDeliveredQty,
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id);

        if (updateError) {
          console.error(`Erreur MAJ quantité article ${item.id}:`, updateError);
        }
      }

      // 4. Mettre à jour le statut du BA si nécessaire
      const allItemsDelivered = formData.items.every(item => {
        if (selectedItems.find(si => si.id === item.id)) {
          return (item.delivered_quantity + item.quantity_to_deliver) >= item.quantity;
        }
        return item.delivered_quantity >= item.quantity;
      });

      const newStatus = allItemsDelivered ? 'delivered' : 'partially_delivered';
      
      await supabase
        .from('purchase_orders')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', purchaseOrder.id);

      console.log(`Bon de livraison ${deliveryNumber} créé avec succès!`);
      
      if (onRefresh) onRefresh();
      onClose();

    } catch (error) {
      console.error('Erreur création bon de livraison:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const selectedItems = formData.items.filter(item => item.selected);
  const totalItems = selectedItems.reduce((sum, item) => sum + item.quantity_to_deliver, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-blue-600 text-white px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold">
            Créer un Bon de Livraison - BA #{purchaseOrder?.po_number}
          </h2>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {!hasExistingSubmission && (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
              <div className="flex">
                <div className="flex-shrink-0">⚠️</div>
                <div className="ml-3">
                  <p className="text-sm text-yellow-700">
                    <strong>Attention:</strong> Ce bon d'achat n'a pas de soumission attribuée.
                    Vous devez d'abord attribuer une soumission avant de pouvoir créer une livraison.
                  </p>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Informations générales */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date de livraison *
                </label>
                <input
                  type="date"
                  value={formData.delivery_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, delivery_date: e.target.value }))}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Entreprise de transport
                </label>
                <input
                  type="text"
                  value={formData.transport_company}
                  onChange={(e) => setFormData(prev => ({ ...prev, transport_company: e.target.value }))}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: Purolator, UPS, FedEx..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Numéro de suivi
                </label>
                <input
                  type="text"
                  value={formData.tracking_number}
                  onChange={(e) => setFormData(prev => ({ ...prev, tracking_number: e.target.value }))}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Numéro de suivi du transporteur"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact livraison
                </label>
                <input
                  type="text"
                  value={formData.delivery_contact}
                  onChange={(e) => setFormData(prev => ({ ...prev, delivery_contact: e.target.value }))}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Nom du contact pour la réception"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Instructions spéciales
              </label>
              <textarea
                value={formData.special_instructions}
                onChange={(e) => setFormData(prev => ({ ...prev, special_instructions: e.target.value }))}
                rows={2}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Instructions particulières pour la livraison..."
              />
            </div>

            {/* Sélection des articles */}
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                Sélection des articles à livrer
              </h3>

              {formData.items.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <p>Aucun article disponible pour ce bon d'achat</p>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="max-h-80 overflow-y-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Sélectionner
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Article
                          </th>
                          <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Qté Restante
                          </th>
                          <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Qté à Livrer
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {formData.items.map((item) => (
                          <tr key={item.id} className={item.selected ? 'bg-blue-50' : ''}>
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={item.selected}
                                onChange={() => handleItemSelect(item.id)}
                                disabled={item.remaining_quantity === 0}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {item.product_id}
                                </div>
                                <div className="text-sm text-gray-500">
                                  {item.description}
                                </div>
                                <div className="text-xs text-gray-400">
                                  {item.unit} | Déjà livré: {item.delivered_quantity}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                item.remaining_quantity > 0 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {item.remaining_quantity}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {item.remaining_quantity > 0 ? (
                                <input
                                  type="number"
                                  min="0"
                                  max={item.remaining_quantity}
                                  step="0.01"
                                  value={item.quantity_to_deliver}
                                  onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                                  className="w-20 p-1 text-center border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                                />
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Résumé de la sélection */}
              {selectedItems.length > 0 && (
                <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-medium text-blue-800 mb-2">Résumé de la livraison</h4>
                  <div className="text-sm text-blue-700">
                    <p>Articles sélectionnés: {selectedItems.length}</p>
                    <p>Quantité totale à livrer: {totalItems.toFixed(2)}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Boutons d'action */}
            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={isLoading}
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isLoading || selectedItems.length === 0 || !hasExistingSubmission}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Création...</span>
                  </>
                ) : (
                  <span>Créer le Bon de Livraison</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default DeliverySlipModal;
