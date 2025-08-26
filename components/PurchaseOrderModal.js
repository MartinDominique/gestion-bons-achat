// PurchaseOrderModal.js - Version de test ultra simple
import React from 'react';
import { X } from 'lucide-react';

const PurchaseOrderModal = ({ isOpen, onClose, editingPO, onRefresh }) => {
  console.log('🔍 Modal rendu avec:', { isOpen, editingPO: editingPO?.po_number });
  
  if (!isOpen) {
    console.log('❌ Modal fermé (isOpen = false)');
    return null;
  }

  console.log('✅ Modal ouvert');

  const handleClose = () => {
    console.log('🔄 Fermeture manuelle du modal');
    onClose();
  };

  const handleBackdropClick = (e) => {
    console.log('🖱️ Clic sur backdrop');
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"
      style={{ zIndex: 9999 }}
      onClick={handleBackdropClick}
    >
      <div 
        className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">
            Test Modal - BA #{editingPO?.po_number || 'Nouveau'}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4">
          <div className="p-4 bg-green-50 border border-green-200 rounded">
            <p className="text-green-800">
              ✅ Modal de test fonctionne !
            </p>
            {editingPO && (
              <div className="mt-2 text-sm text-green-700">
                <p>Client: {editingPO.client_name}</p>
                <p>Numéro: {editingPO.po_number}</p>
                <p>Montant: {editingPO.amount}</p>
              </div>
            )}
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded">
            <p className="text-blue-800 text-sm">
              Si vous voyez ce message et que le modal reste ouvert, 
              le problème venait de l'ancien PurchaseOrderModal.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded hover:bg-gray-300"
          >
            Fermer
          </button>
          <button
            onClick={() => {
              console.log('💾 Simulation sauvegarde');
              alert('Test: sauvegarde simulée');
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Test Sauvegarde
          </button>
        </div>
      </div>
    </div>
  );
};

export default PurchaseOrderModal;
