import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const DeliverySlipModal = ({ isOpen, onClose, clientPO, onRefresh }) => {
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

  // Fonction pour charger les articles
  const loadPOItems = async () => {
    try {
      const { data: items, error } = await supabase
        .from('client_po_items')
        .select('*')
        .eq('client_po_id', clientPO.id);

      if (error) throw error;

      // Préparer les articles pour la sélection
      const itemsWithSelection = items.map(item => ({
        ...item,
        selected: false,
        quantity_to_deliver: 0,
        remaining_quantity: item.quantity - (item.delivered_quantity || 0)
      }));

      setFormData(prev => ({ ...prev, items: itemsWithSelection }));
      console.log('Articles chargés:', itemsWithSelection);
    } catch (error) {
      console.error('Erreur chargement articles:', error);
    }
  };

  // Si le modal n'est pas ouvert, ne rien afficher
  if (!isOpen) return null;

  // Pour l'instant, juste un modal simple pour tester
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-5xl w-full">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-4">🚚 Créer un Bon de Livraison</h2>
          <p>BA Client: {clientPO?.ba_number} • {clientPO?.client_name}</p>
          
          <div className="mt-6 flex gap-3">
            <button 
              onClick={onClose}
              className="px-4 py-2 bg-gray-300 rounded"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeliverySlipModal;
