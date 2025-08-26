import React, { useState, useEffect } from 'react';
import { X, FileText, Truck, Package, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatDate } from './PurchaseOrder/utils/formatting';

const PurchaseOrderModal = ({ isOpen, onClose, editingPO, onRefresh }) => {
  const [activeTab, setActiveTab] = useState('info');
  const [isLoading, setIsLoading] = useState(false);
  const [deliveryCounts, setDeliveryCounts] = useState(0);
  const [formData, setFormData] = useState({
    client_name: '',
    po_number: '',
    amount: 0,
    status: 'draft',
    date: new Date().toISOString().split('T')[0],
    submission_no: ''
  });

  // Ne rien rendre si le modal n'est pas ouvert
  if (!isOpen) return null;

  // Charger les données du BA si en édition
  useEffect(() => {
    if (editingPO) {
      setFormData({
        client_name: editingPO.client_name || '',
        po_number: editingPO.po_number || '',
        amount: editingPO.amount || 0,
        status: editingPO.status || 'draft',
        date: editingPO.date || new Date().toISOString().split('T')[0],
        submission_no: editingPO.submission_no || ''
      });
      
      // Charger le nombre de livraisons
      fetchDeliveryCount(editingPO.id);
    }
  }, [editingPO]);

  // Compter les livraisons
  const fetchDeliveryCount = async (poId) => {
    try {
      const { data, error } = await supabase
        .from('delivery_slips')
        .select('id')
        .eq('purchase_order_id', poId);

      if (!error && data) {
        setDeliveryCounts(data.length);
      }
    } catch (err) {
      console.error('Erreur comptage livraisons:', err);
    }
  };

  // Fermer en cliquant sur le backdrop
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Sauvegarder les modifications
  const handleSave = async () => {
    if (!editingPO) return;

    try {
      setIsLoading(true);
      
      const { error } = await supabase
        .from('purchase_orders')
        .update({
          client_name: formData.client_name,
          amount: parseFloat(formData.amount) || 0,
          status: formData.status,
          date: formData.date
        })
        .eq('id', editingPO.id);

      if (error) {
        throw error;
      }

      // Fermer et rafraîchir
      onClose();
      if (onRefresh) onRefresh();
      
    } catch (err) {
      console.error('Erreur sauvegarde:', err);
      alert('Erreur lors de la sauvegarde: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    // CRITIQUE: position fixed pour overlay complet
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
      onClick={handleBackdropClick}
      style={{ zIndex: 9999 }} // Double sécurité pour le z-index
    >
      {/* Conteneur du modal */}
      <div 
        className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()} // Empêcher fermeture en cliquant à l'intérieur
      >
        {/* Header avec onglets */}
        <div className="border-b border-gray-200 bg-gray-50">
          <div className="flex justify-between items-center p-4">
            <h2 className="text-xl font-bold text-gray-900">
              {editingPO ? `Gérer BA #${editingPO.po_number}` : 'Nouveau Bon d\'Achat'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Onglets */}
          <div className="flex space-x-1 px-4">
            <button
              onClick={() => setActiveTab('info')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === 'info'
                  ? 'bg-white text-blue-600 border-t-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <FileText className="w-4 h-4 inline mr-2" />
              Informations
            </button>
            
            {editingPO && (
              <>
                <button
                  onClick={() => setActiveTab('articles')}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                    activeTab === 'articles'
                      ? 'bg-white text-blue-600 border-t-2 border-blue-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Package className="w-4 h-4 inline mr-2" />
                  Articles
                </button>
                
                <button
                  onClick={() => setActiveTab('livraisons')}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                    activeTab === 'livraisons'
                      ? 'bg-white text-blue-600 border-t-2 border-blue-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Truck className="w-4 h-4 inline mr-2" />
                  Livraisons ({deliveryCounts})
                </button>
              </>
            )}
          </div>
        </div>

        {/* Contenu des onglets */}
        <div className="p-6 overflow-y-auto max-h-[70vh]">
          {/* Onglet Informations */}
          {activeTab === 'info' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Client
                  </label>
                  <input
                    type="text"
                    value={formData.client_name}
                    onChange={(e) => setFormData({...formData, client_name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Numéro BA
                  </label>
                  <input
                    type="text"
                    value={formData.po_number}
                    onChange={(e) => setFormData({...formData, po_number: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Montant
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({...formData, amount: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date
                  </label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({...formData, date: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Statut
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({...formData, status: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="draft">Brouillon</option>
                    <option value="pending">En attente</option>
                    <option value="approved">Approuvé</option>
                    <option value="partially_delivered">Partiellement livré</option>
                    <option value="delivered">Livré</option>
                  </select>
                </div>

                {formData.submission_no && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Soumission
                    </label>
                    <div className="px-3 py-2 bg-gray-50 border rounded-lg text-gray-900">
                      #{formData.submission_no}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Onglet Articles */}
          {activeTab === 'articles' && editingPO && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">Articles du Bon d'Achat</h3>
              <div className="text-gray-600">
                Fonctionnalité de gestion des articles en cours d'implémentation...
              </div>
            </div>
          )}

          {/* Onglet Livraisons */}
          {activeTab === 'livraisons' && editingPO && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">
                  Livraisons ({deliveryCounts})
                </h3>
                <button
                  onClick={() => alert('Fonction création livraison à implémenter')}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                >
                  Nouvelle Livraison
                </button>
              </div>
              
              {deliveryCounts === 0 ? (
                <div className="text-center py-8 text-gray-600">
                  <Truck className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  Aucune livraison effectuée pour ce bon d'achat
                </div>
              ) : (
                <div className="text-gray-600">
                  Liste des {deliveryCounts} livraisons en cours d'implémentation...
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          
          {editingPO && (
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Save className="w-4 h-4" />
              )}
              Sauvegarder
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PurchaseOrderModal;
