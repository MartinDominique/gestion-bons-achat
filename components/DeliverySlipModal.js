// 📍 CRÉER: components/DeliverySlipModal.js

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// 👇 Copiez votre config Supabase depuis un autre fichier
const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

const DeliverySlipModal = ({ isOpen, onClose, clientPO, onRefresh }) => {
  // 👇 COLLER TOUT LE CODE DU MODAL QUE J'AI FOURNI ICI
// DeliverySlipModal.js
import React, { useState, useEffect } from 'react';
import { supabase } from './supabase-config';

const DeliverySlipModal = ({ isOpen, onClose, clientPO }) => {
  const [formData, setFormData] = useState({
    delivery_date: new Date().toISOString().split('T')[0],
    transport_company: '',
    tracking_number: '',
    delivery_contact: '',
    special_instructions: '',
    items: []
  });

  // Charger les articles du bon d'achat avec leurs quantités restantes
  useEffect(() => {
    if (isOpen && clientPO) {
      loadPOItems();
    }
  }, [isOpen, clientPO]);

  const loadPOItems = async () => {
    try {
      // Récupérer les articles du BA avec les quantités déjà livrées
      const { data: items, error } = await supabase
        .from('client_po_items')
        .select(`
          *,
          delivered_quantity_sum:delivery_slip_items(quantity_delivered)
        `)
        .eq('client_po_id', clientPO.id);

      if (error) throw error;

      // Calculer les quantités restantes et préparer pour la sélection
      const itemsWithSelection = items.map(item => {
        // Calculer le total déjà livré
        const totalDelivered = item.delivered_quantity || 0;
        const remaining = item.quantity - totalDelivered;
        
        return {
          ...item,
          selected: false,
          quantity_to_deliver: 0,
          remaining_quantity: remaining,
          max_deliverable: remaining
        };
      });

      setFormData(prev => ({ ...prev, items: itemsWithSelection }));
    } catch (error) {
      console.error('Erreur chargement articles:', error);
    }
  };

  // Gérer la sélection d'un article
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

  // Gérer le changement de quantité
  const handleQuantityChange = (itemId, newQuantity) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id === itemId) {
          const qty = Math.min(
            Math.max(0, parseFloat(newQuantity) || 0), 
            item.max_deliverable
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

  // Sauvegarder le bon de livraison
  const handleSubmit = async () => {
    const selectedItems = formData.items.filter(
      item => item.selected && item.quantity_to_deliver > 0
    );
    
    if (selectedItems.length === 0) {
      alert("Veuillez sélectionner au moins un article à livrer");
      return;
    }

    try {
      // 1. Créer le bon de livraison
      const deliveryNumber = await generateDeliveryNumber();
      
      const { data: deliverySlip, error: slipError } = await supabase
        .from('delivery_slips')
        .insert({
          client_po_id: clientPO.id,
          delivery_number: deliveryNumber,
          delivery_date: formData.delivery_date,
          transport_number: formData.tracking_number,
          delivery_contact: formData.delivery_contact,
          special_instructions: formData.special_instructions
        })
        .select()
        .single();

      if (slipError) throw slipError;

      // 2. Créer les lignes de livraison
      const deliveryItems = selectedItems.map(item => ({
        delivery_slip_id: deliverySlip.id,
        client_po_item_id: item.id,
        quantity_delivered: item.quantity_to_deliver,
        notes: item.comment || ''
      }));

      const { error: itemsError } = await supabase
        .from('delivery_slip_items')
        .insert(deliveryItems);

      if (itemsError) throw itemsError;

      // 3. Mettre à jour les quantités livrées dans client_po_items
      for (const item of selectedItems) {
        const newDeliveredQty = (item.delivered_quantity || 0) + item.quantity_to_deliver;
        
        await supabase
          .from('client_po_items')
          .update({ delivered_quantity: newDeliveredQty })
          .eq('id', item.id);
      }

      // 4. Vérifier si tout est livré pour mettre à jour le statut
      const allFullyDelivered = formData.items.every(
        item => (item.delivered_quantity || 0) + 
                (item.selected ? item.quantity_to_deliver : 0) >= item.quantity
      );

      if (allFullyDelivered) {
        await supabase
          .from('client_purchase_orders')
          .update({ status: 'delivered' })
          .eq('id', clientPO.id);
      } else {
        await supabase
          .from('client_purchase_orders')
          .update({ status: 'partially_delivered' })
          .eq('id', clientPO.id);
      }

      alert(`Bon de livraison ${deliveryNumber} créé avec succès!`);
      
      // Générer le PDF ici si nécessaire
      // generateDeliverySlipPDF(deliverySlip, selectedItems);
      
      onClose();
      
    } catch (error) {
      console.error('Erreur création bon de livraison:', error);
      alert('Erreur lors de la création du bon de livraison');
    }
  };

  const selectedCount = formData.items.filter(item => item.selected).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                🚚 Créer un Bon de Livraison
              </h2>
              <p className="text-blue-100 mt-1">
                BA Client: {clientPO?.ba_number} • {clientPO?.client_name}
              </p>
            </div>
            <button onClick={onClose} className="text-white hover:bg-white/20 rounded-lg p-2">
              ✕
            </button>
          </div>
        </div>

        {/* Formulaire */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Champs de formulaire... */}
          {/* (Copiez le reste du JSX depuis l'artifact) */}
        </div>

        {/* Footer avec boutons */}
        <div className="bg-gray-50 px-6 py-4 flex justify-between items-center border-t">
          <span className="text-sm text-gray-600">
            {selectedCount} article(s) sélectionné(s)
          </span>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-6 py-2 border border-gray-300 rounded-lg">
              Annuler
            </button>
            <button 
              onClick={handleSubmit}
              disabled={selectedCount === 0}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg disabled:bg-gray-300"
            >
              Créer et Imprimer BL
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeliverySlipModal;

  const [formData, setFormData] = useState({
    delivery_date: new Date().toISOString().split('T')[0],
    transport_company: '',
    tracking_number: '',
    delivery_contact: '',
    special_instructions: '',
    items: []
  });

  // ... (tout le reste du code du modal que j'ai fourni)
  
  return (
    // ... (le JSX complet du modal)
  );
};

export default DeliverySlipModal;
