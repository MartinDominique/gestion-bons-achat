// ========================================
// FICHIER 2: hooks/useDeliveries.js
// (Adapté pour utiliser VOTRE pdfGeneration.js)
// ========================================
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { generateDeliveryNumber, generatePDF } from '../utils/pdfGeneration';

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

  // Fallback - Charger depuis submissions.items (ancien système)
  const loadFromSubmission = useCallback(async (purchaseOrderId) => {
    try {
      // Récupérer le BA pour avoir submission_no
      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .select('submission_no')
        .eq('id', purchaseOrderId)
        .single();
      
      if (poError || !po.submission_no) {
        console.log('Pas de numéro de soumission trouvé');
        return [];
      }
      
      // Charger la soumission
      const { data: submission, error: subError } = await supabase
        .from('submissions')
        .select('items')
        .eq('submission_number', po.submission_no)
        .single();
      
      if (subError || !submission.items) {
        console.error('Erreur chargement soumission:', subError);
        return [];
      }
      
      const items = submission.items || [];
      
      // Récupérer les quantités déjà livrées (calcul complexe ancien système)
      const { data: deliveredItems } = await supabase
        .from('delivery_slip_items')
        .select(`
          quantity_delivered,
          notes,
          delivery_slips!inner(purchase_order_id)
        `)
        .eq('delivery_slips.purchase_order_id', purchaseOrderId);

      console.log('Quantités déjà livrées (ancien système):', deliveredItems);
      
      // Préparer les articles avec calcul des quantités restantes
      const itemsWithSelection = items.map((item, index) => {
        const productId = item.product_id || item.code || `ITEM-${index + 1}`;
        
        // Calculer la quantité déjà livrée pour cet article
        const alreadyDelivered = deliveredItems
          ?.filter(d => d.notes && d.notes.includes(productId))
          ?.reduce((sum, d) => sum + (parseFloat(d.quantity_delivered) || 0), 0) || 0;
        
        const totalQuantity = parseFloat(item.quantity) || 0;
        const remainingQuantity = Math.max(0, totalQuantity - alreadyDelivered);

        return {
          id: `submission-${index}`, // ID temporaire
          product_id: productId,
          description: item.name || item.description || 'Article',
          quantity: totalQuantity,
          unit: item.unit || 'unité',
          price: parseFloat(item.price) || 0,
          selected: false,
          quantity_to_deliver: 0,
          remaining_quantity: remainingQuantity,
          delivered_quantity: alreadyDelivered,
          from_submission: true
        };
      });
      
      console.log(`✅ ${items.length} articles chargés depuis submission (fallback)`);
      setAvailableItems(itemsWithSelection);
      return itemsWithSelection;
      
    } catch (error) {
      console.error('Erreur loadFromSubmission:', error);
      return [];
    }
  }, []);

  // Charger les bons de livraison pour un BA
  const fetchDeliverySlips = useCallback(async (purchaseOrderId) => {
    if (!purchaseOrderId) return;
    
    try {
      const { data, error } = await supabase
        .from('delivery_slips')
        .select(`
          *,
          delivery_slip_items (
            id,
            product_id,
            description,
            quantity_delivered,
            unit,
            notes
          )
        `)
        .eq('purchase_order_id', purchaseOrderId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erreur chargement bons de livraison:', error);
        return;
      }

      setDeliverySlips(data || []);
      console.log(`✅ ${data?.length || 0} bons de livraison chargés`);
      
    } catch (err) {
      console.error('Erreur fetchDeliverySlips:', err);
      setError(`Erreur chargement livraisons: ${err.message}`);
    }
  }, []);

  // UTILISER VOTRE FONCTION generatePDF existante
  const createDeliverySlipWithPDF = useCallback(async (purchaseOrderId, formData, selectedItems) => {
    try {
      setIsLoading(true);
      setError('');

      if (selectedItems.length === 0) {
        throw new Error('Veuillez sélectionner au moins un article à livrer');
      }

      // Générer le numéro de bon de livraison (utiliser VOTRE fonction)
      const deliveryNumber = await generateDeliveryNumber();

      // Créer le bon de livraison principal
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

      // Ajouter les articles du bon de livraison
      const deliveryItems = selectedItems.map(item => ({
        delivery_slip_id: deliverySlip.id,
        client_po_item_id: item.from_submission ? null : item.id,
        product_id: item.product_id,
        description: item.description,
        quantity_delivered: item.quantity_to_deliver,
        unit: item.unit,
        notes: item.from_submission ? `Depuis soumission: ${item.product_id}` : null
      }));

      const { error: itemsError } = await supabase
        .from('delivery_slip_items')
        .insert(deliveryItems);

      if (itemsError) {
        throw new Error(`Erreur ajout articles: ${itemsError.message}`);
      }

      // Mettre à jour les quantités livrées dans client_po_items (seulement si nouveau système)
      for (const item of selectedItems.filter(i => !i.from_submission)) {
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

      console.log(`✅ Bon de livraison ${deliveryNumber} créé avec succès!`);

      // UTILISER VOTRE FONCTION generatePDF (plus complète)
      await generatePDF(deliverySlip, selectedItems, formData, clientPO);
      
      // Rafraîchir les données
      await fetchDeliverySlips(purchaseOrderId);
      await loadPOItems(purchaseOrderId);
      
      return deliverySlip;

    } catch (error) {
      console.error('Erreur createDeliverySlipWithPDF:', error);
      setError(error.message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [fetchDeliverySlips, loadPOItems, generatePDF]);

  // Charger les données quand le BA change
  useEffect(() => {
    if (clientPO?.id) {
      loadPOItems(clientPO.id);
      fetchDeliverySlips(clientPO.id);
    }
  }, [clientPO, loadPOItems, fetchDeliverySlips]);

  return {
    // État
    deliverySlips,
    availableItems,
    isLoading,
    error,
    
    // Actions
    loadPOItems,
    fetchDeliverySlips,
    createDeliverySlipWithPDF, // Utilise VOTRE logique PDF complète
    
    // Manipulation des articles
    setAvailableItems
  };
};

export default useDeliveries;
