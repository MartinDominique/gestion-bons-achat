import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const DeliverySlipModal = ({ isOpen, onClose, clientPO, onRefresh }) => {
  
  // 👇 AJOUTEZ CETTE LIGNE POUR DÉBUGGER
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

// Fonction pour charger les articles depuis la soumission
  const loadPOItems = async () => {
    try {
      console.log('Recherche soumission:', clientPO.submission_no);
      
      if (!clientPO.submission_no) {
        console.log('Pas de numéro de soumission');
        return;
      }
      
      // 1. Chercher la soumission
      const { data: submission, error: subError } = await supabase
        .from('submissions')
        .select('*')
        .eq('submission_number', clientPO.submission_no)
        .single();
      
      if (subError) {
        console.error('Erreur recherche soumission:', subError);
        return;
      }
      
      console.log('Soumission trouvée:', submission);
      
      // 2. Les articles sont directement dans submission.items!
      const items = submission.items || [];
      
      console.log('Articles trouvés dans la soumission:', items);
      
      // 3. Préparer les articles pour la sélection
      if (items && items.length > 0) {
        const itemsWithSelection = items.map((item, index) => ({
          id: index + 1,  // Générer un ID temporaire
          product_id: item.product_id || item.code || `ITEM-${index + 1}`,
          description: item.name || item.description || 'Article',
          quantity: parseFloat(item.quantity) || 0,
          unit: item.unit || 'unité',
          price: parseFloat(item.price) || 0,
          selected: false,
          quantity_to_deliver: 0,
          remaining_quantity: parseFloat(item.quantity) || 0,
          delivered_quantity: 0
        }));
        
        setFormData(prev => ({ ...prev, items: itemsWithSelection }));
        console.log(`✅ ${items.length} articles chargés!`, itemsWithSelection);
      }
      
    } catch (error) {
      console.error('Erreur générale:', error);
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
          <p>BA Client: {clientPO?.ba_number || clientPO?.po_number || clientPO?.submission_number} • {clientPO?.client_name || clientPO?.client}</p>
          <p className="text-sm text-gray-600 mt-2">ID: {clientPO?.id} - Articles: {formData.items.length}</p>
          
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
