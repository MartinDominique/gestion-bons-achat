// ========================================
// FICHIER 2: hooks/useDeliveries.js
// ========================================
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

const useDeliveries = (clientPO = null) => {
  const [deliverySlips, setDeliverySlips] = useState([]);
  const [availableItems, setAvailableItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Charger les articles disponibles pour un BA donné
  const loadPOItems = useCallback(async (purchaseOrderId) => {
    if (!purchaseOrderId) return [];
    
    try {
      setIsLoading(true);
      console.log('Chargement articles pour BA:', purchaseOrderId);
      
      // 1. Essayer de charger depuis client_po_items (nouveau système)
      const { data: poItems, error: itemsError } = await supabase
        .from('client_po_items')
        .select('*')
        .eq('purchase_order_id', purchaseOrderId)
        .order('product_id');
      
      if (itemsError) {
        console.error('Erreur chargement articles:', itemsError);
        return [];
      }
      
      if (poItems && poItems.length > 0) {
        console.log(`✅ ${poItems.length} articles trouvés dans client_po_items`);
        
        // Préparer les articles avec quantités restantes
        const itemsWithSelection = poItems.map(item => {
          const remainingQuantity = Math.max(0, item.quantity - (item.delivered_quantity || 0));
          
          return {
            id: item.id,
            product_id: item.product_id,
            description: item.description,
            quantity: parseFloat(item.quantity) || 0,
            unit: item.unit || 'unité',
            price: parseFloat(item.selling_price) || 0,
            selected: false,
            quantity_to_deliver: 0,
            remaining_quantity: remainingQuantity,
            delivered_quantity: parseFloat(item.delivered_quantity) || 0,
            from_client_po_items: true
          };
        });
        
        setAvailableItems(itemsWithSelection);
        return itemsWithSelection;
      }
      
      // 2. Fallback vers l'ancien système (submissions.items)
      console.log('Fallback vers système submissions...');
      return await loadFromSubmission(purchaseOrderId);
      
    } catch (error) {
      console.error('Erreur générale loadPOItems:', error);
      setError(`Erreur chargement articles: ${error.message}`);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Créer un bon de livraison
  const createDeliverySlip = useCallback(async (purchaseOrderId, formData, selectedItems) => {
    try {
      setIsLoading(true);
      setError('');

      if (selectedItems.length === 0) {
        throw new Error('Veuillez sélectionner au moins un article à livrer');
      }

      // Générer le numéro de bon de livraison
      const deliveryNumber = await generateDeliveryNumber();

      // 1. Créer le bon de livraison principal
      const { data: deliverySlip, error: deliveryError } = await supabase
        .from('delivery_slips')
        .insert({
          delivery_number: deliveryNumber,
          purchase_order_id: purchaseOrderId,
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

      console.log(`✅ Bon de livraison ${deliveryNumber} créé avec succès!`);
      return deliverySlip;

    } catch (error) {
      console.error('Erreur createDeliverySlip:', error);
      setError(error.message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Générer un numéro de bon de livraison
  const generateDeliveryNumber = useCallback(async () => {
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
  }, []);

  return {
    deliverySlips,
    availableItems,
    isLoading,
    error,
    loadPOItems,
    createDeliverySlip,
    generateDeliveryNumber,
    setAvailableItems
  };
};

export default useDeliveries;
