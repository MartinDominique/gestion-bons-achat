import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { generateDeliveryNumber, generatePDF } from './utils/pdfGeneration';

const DeliverySlipModal = ({ isOpen, onClose, clientPO, onRefresh }) => {
  console.log('ClientPO reçu:', clientPO);
  
  // État pour le formulaire
  const [formData, setFormData] = useState({
    delivery_date: new Date().toISOString().split('T')[0],
    transport_company: '',
    tracking_number: '',
    delivery_contact: '',
    special_instructions: '',
    items: []
  });

  // Charger les articles quand le modal s'ouvre
  useEffect(() => {
    if (isOpen && clientPO) {
      loadPOItems();
    }
  }, [isOpen, clientPO]);

  // NOUVELLE FONCTION - Charger depuis client_po_items au lieu de submissions.items
  const loadPOItems = async () => {
    try {
      console.log('Chargement articles depuis client_po_items pour BA:', clientPO.id);
      
      // 1. Charger directement depuis client_po_items
      const { data: poItems, error: itemsError } = await supabase
        .from('client_po_items')
        .select('*')
        .eq('purchase_order_id', clientPO.id)
        .order('product_id');
      
      if (itemsError) {
        console.error('Erreur chargement articles:', itemsError);
        return;
      }
      
      if (!poItems || poItems.length === 0) {
        console.log('Aucun article trouvé dans client_po_items pour ce BA');
        // Fallback vers l'ancien système si pas d'articles dans client_po_items
        await loadFromSubmission();
        return;
      }
      
      console.log('Articles trouvés dans client_po_items:', poItems);

      // 2. Préparer les articles avec quantités restantes (plus simple maintenant!)
      const itemsWithSelection = poItems.map(item => {
        const remainingQuantity = Math.max(0, item.quantity - (item.delivered_quantity || 0));
        
        return {
          id: item.id, // ID réel de client_po_items (important pour delivery_slip_items.client_po_item_id)
          product_id: item.product_id,
          description: item.description,
          quantity: parseFloat(item.quantity) || 0,
          unit: item.unit || 'unité',
          price: parseFloat(item.selling_price) || 0,
          selected: false,
          quantity_to_deliver: 0,
          remaining_quantity: remainingQuantity,
          delivered_quantity: parseFloat(item.delivered_quantity) || 0
        };
      });
      
      setFormData(prev => ({ ...prev, items: itemsWithSelection }));
      console.log(`✅ ${poItems.length} articles chargés depuis client_po_items!`, itemsWithSelection);
      
    } catch (error) {
      console.error('Erreur générale chargement:', error);
    }
  };

  // FONCTION FALLBACK - Ancien système si client_po_items vide
  const loadFromSubmission = async () => {
    try {
      console.log('Fallback: Recherche soumission:', clientPO.submission_no);
      
      if (!clientPO.submission_no) {
        console.log('Pas de numéro de soumission');
        return;
      }
      
      // Charger depuis l'ancien système (submissions.items)
      const { data: submission, error: subError } = await supabase
        .from('submissions')
        .select('items')
        .eq('submission_number', clientPO.submission_no)
        .single();
      
      if (subError) {
        console.error('Erreur recherche soumission:', subError);
        return;
      }
      
      const items = submission.items || [];
      
      // Récupérer les quantités déjà livrées (ancien calcul complexe)
      const { data: deliveredItems } = await supabase
        .from('delivery_slip_items')
        .select(`
          quantity_delivered,
          notes,
          delivery_slips!inner(purchase_order_id)
        `)
        .eq('delivery_slips.purchase_order_id', clientPO.id);

      console.log('Quantités déjà livrées (ancien système):', deliveredItems);
      
      if (items && items.length > 0) {
        const itemsWithSelection = items.map((item, index) => {
          const productId = item.product_id || item.code || `ITEM-${index + 1}`;
          
          // Calculer la quantité déjà livrée pour cet article (ancien système)
          const alreadyDelivered = deliveredItems
            ?.filter(d => d.notes && d.notes.includes(productId))
            ?.reduce((sum, d) => sum + (parseFloat(d.quantity_delivered) || 0), 0) || 0;
          
          const totalQuantity = parseFloat(item.quantity) || 0;
          const remainingQuantity = Math.max(0, totalQuantity - alreadyDelivered);

          return {
            id: index + 1, // ID temporaire (pas réel)
            product_id: productId,
            description: item.name || item.description || 'Article',
            quantity: totalQuantity,
            unit: item.unit || 'unité',
            price: parseFloat(item.price) || 0,
            selected: false,
            quantity_to_deliver: 0,
            remaining_quantity: remainingQuantity,
            delivered_quantity: alreadyDelivered,
            from_submission: true // Flag pour différencier
          };
        });
        
        setFormData(prev => ({ ...prev, items: itemsWithSelection }));
        console.log(`✅ ${items.length} articles chargés depuis submission (fallback)!`);
      }
      
    } catch (error) {
      console.error('Erreur fallback submission:', error);
    }
  };

  // Fonction pour sélectionner/désélectionner un article
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

  // Fonction pour changer la quantité
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
  
  
