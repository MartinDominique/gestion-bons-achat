import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

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
