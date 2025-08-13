import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

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
          id: index + 1,
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
  
  // Générer le PDF (temporaire - juste ouvrir une fenêtre)
  const generatePDF = (deliverySlip, items) => {
    console.log('Génération PDF pour:', deliverySlip);
    // On va implémenter le vrai PDF après
    const content = `
      BON DE LIVRAISON ${deliverySlip.delivery_number}
      Date: ${formData.delivery_date}
      Client: ${clientPO.client_name}
      BA: ${clientPO.po_number}
      
      Articles livrés:
      ${items.map(i => `- ${i.description}: ${i.quantity_to_deliver} ${i.unit}`).join('\n')}
    `;
    
    // Ouvrir dans une nouvelle fenêtre pour impression
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<pre>${content}</pre>`);
    printWindow.document.write('<script>window.print();</script>');
  };
  
  // Fonction pour soumettre et sauvegarder
  const handleSubmit = async () => {
    const selectedItems = formData.items.filter(
      item => item.selected && item.quantity_to_deliver > 0
    );
    
    if (selectedItems.length === 0) {
      alert("Veuillez sélectionner au moins un article à livrer");
      return;
    }
    
    try {
      console.log("Création du bon de livraison...");
      
      // 1. Générer le numéro de bon de livraison
      const deliveryNumber = await generateDeliveryNumber();
      
      // 2. Créer le bon de livraison
  const { data: deliverySlip, error: slipError } = await supabase
    .from('delivery_slips')
    .insert({
      purchase_order_id: clientPO.id,  // ✅ BON NOM!
      delivery_number: deliveryNumber,
      delivery_date: formData.delivery_date,
      transport_number: formData.tracking_number,
      transport_company: formData.transport_company || 'Purolator',
      delivery_contact: formData.delivery_contact,
      special_instructions: formData.special_instructions,
      status: 'pending'
    })
    .select()
    .single();
      
      if (slipError) {
        console.error('Erreur création bon:', slipError);
        alert('Erreur lors de la création du bon de livraison');
        return;
      }
      
      console.log('Bon de livraison créé:', deliverySlip);
      
      // 3. Créer les lignes de livraison
      const deliveryItems = selectedItems.map(item => ({
        delivery_slip_id: deliverySlip.id,
        client_po_item_id: item.id, // On utilisera ceci temporairement
        quantity_delivered: item.quantity_to_deliver,
        notes: `${item.product_id} - ${item.description}`
      }));
      
      const { error: itemsError } = await supabase
        .from('delivery_slip_items')
        .insert(deliveryItems);
      
      if (itemsError) {
        console.error('Erreur création items:', itemsError);
      }
      
      // 4. Mettre à jour le statut du BA
      const allFullyDelivered = formData.items.every(
        item => item.quantity_to_deliver >= item.quantity
      );
      
      const newStatus = allFullyDelivered ? 'delivered' : 'partially_delivered';
      
      await supabase
        .from('purchase_orders')
        .update({ 
          status: newStatus,
          notes: `${clientPO.notes || ''}\n[${new Date().toLocaleDateString()}] Bon de livraison ${deliveryNumber} créé`
        })
        .eq('id', clientPO.id);
      
      alert(`✅ Bon de livraison ${deliveryNumber} créé avec succès!`);
      
      // 5. Générer le PDF (on va ajouter ça après)
      generatePDF(deliverySlip, selectedItems);
      
      // Fermer et rafraîchir
      onRefresh();
      onClose();
      
    } catch (error) {
      console.error('Erreur générale:', error);
      alert('Erreur lors de la création du bon de livraison');
    }
  };

  // Si le modal n'est pas ouvert, ne rien afficher
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">🚚 Créer un Bon de Livraison</h2>
              <p className="text-blue-100 mt-1">
                BA Client: {clientPO?.po_number} • {clientPO?.client_name}
              </p>
            </div>
            <button 
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-lg p-2"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body avec scroll */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          
          {/* Informations de livraison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                📅 Date de livraison
              </label>
              <input
                type="date"
                value={formData.delivery_date}
                onChange={(e) => setFormData({...formData, delivery_date: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                👤 Contact de livraison
              </label>
              <input
                type="text"
                placeholder="Nom du contact"
                value={formData.delivery_contact}
                onChange={(e) => setFormData({...formData, delivery_contact: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                🚚 Transporteur
              </label>
              <select 
                value={formData.transport_company}
                onChange={(e) => setFormData({...formData, transport_company: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="">Sélectionner...</option>
                <option value="purolator">Purolator</option>
                <option value="dicom">Dicom</option>
                <option value="fedex">FedEx</option>
                <option value="client_pickup">Ramassage client</option>
                <option value="livraison_tmt">Livraison TMT</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                📦 N° de suivi
              </label>
              <input
                type="text"
                placeholder="Numéro de tracking"
                value={formData.tracking_number}
                onChange={(e) => setFormData({...formData, tracking_number: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
          </div>

          {/* Articles à livrer */}
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-4">
              📦 Articles à livrer ({formData.items.filter(i => i.selected).length}/{formData.items.length} sélectionnés)
            </h3>
            
            {formData.items.length === 0 ? (
              <p className="text-gray-500 italic">Aucun article trouvé</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left">Sél.</th>
                      <th className="px-4 py-3 text-left">Article</th>
                      <th className="px-4 py-3 text-center">Qté Totale</th>
                      <th className="px-4 py-3 text-center">Restant</th>
                      <th className="px-4 py-3 text-center">À Livrer</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {formData.items.map((item, index) => (
                      <tr key={item.id} className={item.selected ? 'bg-blue-50' : ''}>
                        <td className="px-4 py-3">
                          <input 
                            type="checkbox"
                            checked={item.selected}
                            onChange={() => handleItemSelect(item.id)}
                            className="w-4 h-4"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium">{item.product_id}</p>
                            <p className="text-sm text-gray-500">{item.description}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {item.quantity} {item.unit}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {item.remaining_quantity}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="number"
                            min="0"
                            max={item.remaining_quantity}
                            value={item.quantity_to_deliver}
                            onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                            disabled={!item.selected}
                            className={`w-20 px-2 py-1 text-center border rounded ${
                              item.selected ? 'bg-white' : 'bg-gray-100'
                            }`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex justify-between items-center border-t">
          <span className="text-sm text-gray-600">
            {formData.items.filter(i => i.selected).length} article(s) sélectionné(s)
          </span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100"
            >
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={formData.items.filter(i => i.selected).length === 0}
              className={`px-6 py-2 rounded-lg ${
                formData.items.filter(i => i.selected).length > 0
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
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
