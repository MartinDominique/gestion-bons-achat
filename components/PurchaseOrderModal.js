// Remplacer temporairement votre PurchaseOrderModal par ceci :

import React from 'react';
import { X } from 'lucide-react';

const PurchaseOrderModal = ({ isOpen, onClose, editingPO, onRefresh }) => {
  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold text-gray-900">
            {editingPO ? `Gérer BA #${editingPO.po_number}` : 'Nouveau Bon d\'Achat'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {editingPO ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Client
                  </label>
                  <div className="text-gray-900">{editingPO.client_name}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Montant
                  </label>
                  <div className="text-gray-900 font-semibold">
                    {new Intl.NumberFormat('fr-CA', {
                      style: 'currency',
                      currency: 'CAD'
                    }).format(editingPO.amount || 0)}
                  </div>
                </div>
              </div>

              {editingPO.submission_no && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Soumission
                  </label>
                  <div className="text-gray-900">#{editingPO.submission_no}</div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Statut
                </label>
                <div className="text-gray-900 capitalize">{editingPO.status}</div>
              </div>

              {/* Section Actions */}
              <div className="mt-8 pt-4 border-t">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Actions Disponibles</h3>
                <div className="grid grid-cols-1 gap-3">
                  <button
                    onClick={() => {
                      alert('Fonction de modification à implémenter');
                    }}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Modifier les informations
                  </button>
                  
                  <button
                    onClick={() => {
                      alert('Fonction de gestion des articles à implémenter');
                    }}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Gérer les articles
                  </button>
                  
                  <button
                    onClick={() => {
                      alert('Fonction de création de livraison à implémenter');
                    }}
                    className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    Créer une livraison
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-gray-600 mb-4">
                Fonction de création d'un nouveau bon d'achat à implémenter.
              </p>
              <button
                onClick={() => {
                  alert('Fonction de création à implémenter');
                }}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Créer le bon d'achat
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50 rounded-b-lg">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

export default PurchaseOrderModal;
