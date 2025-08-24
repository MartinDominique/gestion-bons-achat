import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatDate, getStatusEmoji } from './PurchaseOrder/utils/formatting';
import { generateDeliveryNumber, generatePDF } from './PurchaseOrder/utils/pdfGeneration';

const PurchaseOrderModal = ({ isOpen, onClose, editingPO = null, onRefresh }) => {
  // États pour la création/édition BA
  const [formData, setFormData] = useState({
    client_name: '',
    client_email: '',
    client_phone: '',
    client_address: '',
    po_date: new Date().toISOString().split('T')[0],
    delivery_date: '',
    payment_terms: '',
    special_instructions: '',
    submission_no: '',
    items: []
  });

  // États pour les livraisons (PRÉSERVER VOS VARIABLES)
  const [deliveryFormData, setDeliveryFormData] = useState({
    delivery_date: new Date().toISOString().split('T')[0],
    delivery_contact: '',
    transport_company: '',
    tracking_number: '',
    special_instructions: ''
  });
  
  const [deliverySlips, setDeliverySlips] = useState([]);
  const [poItems, setPoItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // États pour l'interface
  const [activeSection, setActiveSection] = useState('info'); // 'info', 'articles', 'livraisons'
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [submissions, setSubmissions] = useState([]);

  // Charger les données si édition
  useEffect(() => {
    if (isOpen && editingPO) {
      loadPOData(editingPO.id);
    } else if (isOpen) {
      resetForm();
    }
  }, [isOpen, editingPO]);

  // Charger les données complètes d'un BA existant
  const loadPOData = async (poId) => {
    try {
      setIsLoading(true);
      
      // Charger le BA principal
      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .select('*')
        .eq('id', poId)
        .single();
      
      if (poError) throw new Error(poError.message);
      
      // Charger les articles depuis client_po_items
      const { data: items, error: itemsError } = await supabase
        .from('client_po_items')
        .select('*')
        .eq('purchase_order_id', poId)
        .order('product_id');
      
      if (itemsError) throw new Error(itemsError.message);
      
      // Charger les bons de livraison
      const { data: slips, error: slipsError } = await supabase
        .from('delivery_slips')
        .select(`
          *,
          delivery_slip_items (*)
        `)
        .eq('purchase_order_id', poId)
        .order('created_at', { ascending: false });
      
      if (slipsError) throw new Error(slipsError.message);

      // Préparer les articles avec statuts de livraison
      const itemsWithStatus = items.map(item => {
        const remainingQty = Math.max(0, item.quantity - (item.delivered_quantity || 0));
        const deliveryPercentage = item.quantity > 0 ? ((item.delivered_quantity || 0) / item.quantity) * 100 : 0;
        
        let deliveryStatus = 'not_started';
        if (deliveryPercentage === 100) deliveryStatus = 'completed';
        else if (deliveryPercentage > 0) deliveryStatus = 'partial';
        
        return {
          ...item,
          remaining_quantity: remainingQty,
          delivery_percentage: Math.round(deliveryPercentage),
          delivery_status: deliveryStatus,
          selected: false,
          quantity_to_deliver: 0
        };
      });

      // Mettre à jour les états
      setFormData({
        client_name: po.client_name || '',
        client_email: po.client_email || '',
        client_phone: po.client_phone || '',
        client_address: po.client_address || '',
        po_date: po.po_date || '',
        delivery_date: po.delivery_date || '',
        payment_terms: po.payment_terms || '',
        special_instructions: po.special_instructions || '',
        submission_no: po.submission_no || '',
        items: itemsWithStatus
      });
      
      setPoItems(itemsWithStatus);
      setDeliverySlips(slips || []);
      
      console.log(`✅ BA ${po.po_number} chargé avec ${items.length} articles et ${slips.length} livraisons`);
      
    } catch (err) {
      console.error('Erreur chargement BA:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      client_name: '',
      client_email: '',
      client_phone: '',
      client_address: '',
      po_date: new Date().toISOString().split('T')[0],
      delivery_date: '',
      payment_terms: '',
      special_instructions: '',
      submission_no: '',
      items: []
    });
    setPoItems([]);
    setDeliverySlips([]);
    setActiveSection('info');
    setError('');
  };

  // SECTION 2: IMPORT SOUMISSION
  const loadSubmissions = async () => {
    try {
      const { data, error } = await supabase
        .from('submissions')
        .select('*')
        .eq('status', 'accepted') // Seulement les soumissions acceptées
        .order('created_at', { ascending: false });
      
      if (error) throw new Error(error.message);
      
      setSubmissions(data || []);
      setShowSubmissionModal(true);
      
    } catch (err) {
      console.error('Erreur chargement soumissions:', err);
      setError(err.message);
    }
  };

  // Importer une soumission sélectionnée
  const importSubmission = async (submission) => {
    try {
      console.log('Import soumission:', submission.submission_number);
      
      // Copier les infos client
      setFormData(prev => ({
        ...prev,
        client_name: submission.client_name || prev.client_name,
        client_email: submission.client_email || prev.client_email,
        client_phone: submission.client_phone || prev.client_phone,
        client_address: submission.client_address || prev.client_address,
        submission_no: submission.submission_number
      }));
      
      // Copier les articles depuis submission.items
      const submissionItems = submission.items || [];
      const importedItems = submissionItems.map((item, index) => ({
        id: `temp-${index}`, // ID temporaire jusqu'à sauvegarde
        product_id: item.product_id || item.code || `ITEM-${index + 1}`,
        description: item.name || item.description || 'Article',
        quantity: parseFloat(item.quantity) || 0,
        unit: item.unit || 'unité',
        selling_price: parseFloat(item.price) || 0,
        delivered_quantity: 0,
        remaining_quantity: parseFloat(item.quantity) || 0,
        delivery_percentage: 0,
        delivery_status: 'not_started',
        selected: false,
        quantity_to_deliver: 0,
        from_submission: true // Flag pour différencier
      }));
      
      setFormData(prev => ({ ...prev, items: importedItems }));
      setPoItems(importedItems);
      setShowSubmissionModal(false);
      setActiveSection('articles'); // Passer automatiquement à la section articles
      
      console.log(`✅ Soumission ${submission.submission_number} importée avec ${importedItems.length} articles`);
      
    } catch (err) {
      console.error('Erreur import soumission:', err);
      setError(err.message);
    }
  };

  // SECTION 3: SAUVEGARDE BA
  const savePurchaseOrder = async () => {
    try {
      setIsLoading(true);
      setError('');
      
      if (!formData.client_name) {
        throw new Error('Le nom du client est requis');
      }
      
      let poData;
      
      if (editingPO) {
        // Mise à jour BA existant
        const { data, error } = await supabase
          .from('purchase_orders')
          .update({
            client_name: formData.client_name,
            client_email: formData.client_email || null,
            client_phone: formData.client_phone || null,
            client_address: formData.client_address || null,
            po_date: formData.po_date,
            delivery_date: formData.delivery_date || null,
            payment_terms: formData.payment_terms || null,
            special_instructions: formData.special_instructions || null,
            submission_no: formData.submission_no || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingPO.id)
          .select()
          .single();
        
        if (error) throw new Error(error.message);
        poData = data;
        
      } else {
        // Création nouveau BA
        const poNumber = await generatePONumber();
        
        const { data, error } = await supabase
          .from('purchase_orders')
          .insert({
            po_number: poNumber,
            client_name: formData.client_name,
            client_email: formData.client_email || null,
            client_phone: formData.client_phone || null,
            client_address: formData.client_address || null,
            po_date: formData.po_date,
            delivery_date: formData.delivery_date || null,
            payment_terms: formData.payment_terms || null,
            special_instructions: formData.special_instructions || null,
            submission_no: formData.submission_no || null,
            status: 'draft',
            total_amount: 0
          })
          .select()
          .single();
        
        if (error) throw new Error(error.message);
        poData = data;
      }
      
      // Sauvegarder les articles dans client_po_items
      if (formData.items.length > 0) {
        // Supprimer les anciens articles si édition
        if (editingPO) {
          await supabase
            .from('client_po_items')
            .delete()
            .eq('purchase_order_id', editingPO.id);
        }
        
        // Insérer les nouveaux articles
        const itemsData = formData.items.map(item => ({
          purchase_order_id: poData.id,
          product_id: item.product_id,
          description: item.description,
          quantity: parseFloat(item.quantity) || 0,
          unit: item.unit || 'unité',
          selling_price: parseFloat(item.selling_price) || 0,
          delivered_quantity: parseFloat(item.delivered_quantity) || 0
        }));
        
        const { error: itemsError } = await supabase
          .from('client_po_items')
          .insert(itemsData);
        
        if (itemsError) throw new Error(`Erreur sauvegarde articles: ${itemsError.message}`);
        
        // Calculer et mettre à jour le montant total
        const totalAmount = itemsData.reduce((sum, item) => sum + (item.quantity * item.selling_price), 0);
        
        await supabase
          .from('purchase_orders')
          .update({ total_amount: totalAmount })
          .eq('id', poData.id);
      }
      
      console.log(`✅ BA ${poData.po_number} sauvegardé avec succès`);
      
      if (onRefresh) onRefresh();
      onClose();
      
    } catch (err) {
      console.error('Erreur sauvegarde BA:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Générer numéro BA
  const generatePONumber = async () => {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const prefix = `BA-${year}${month}`;
    
    const { data } = await supabase
      .from('purchase_orders')
      .select('po_number')
      .like('po_number', `${prefix}%`)
      .order('po_number', { ascending: false })
      .limit(1);
    
    if (!data || data.length === 0) {
      return `${prefix}-001`;
    }
    
    const lastNum = parseInt(data[0].po_number.split('-')[2]) || 0;
    return `${prefix}-${String(lastNum + 1).padStart(3, '0')}`;
  };

  // SECTION 4: GESTION LIVRAISONS (PRÉSERVER VOS FONCTIONS)
  
  // Sélectionner/désélectionner article pour livraison
  const handleItemSelect = (itemId) => {
    const updatedItems = poItems.map(item => 
      item.id === itemId 
        ? { 
            ...item, 
            selected: !item.selected,
            quantity_to_deliver: !item.selected ? item.remaining_quantity : 0
          }
        : item
    );
    setPoItems(updatedItems);
    setFormData(prev => ({ ...prev, items: updatedItems }));
  };

  // Changer quantité à livrer
  const handleQuantityChange = (itemId, newQuantity) => {
    const updatedItems = poItems.map(item => {
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
    });
    setPoItems(updatedItems);
    setFormData(prev => ({ ...prev, items: updatedItems }));
  };

  // UTILISER VOTRE FONCTION createDeliverySlip
  const createDeliverySlip = async () => {
    const selectedItems = poItems.filter(item => item.selected && item.quantity_to_deliver > 0);
    
    if (selectedItems.length === 0) {
      setError('Veuillez sélectionner au moins un article à livrer');
      return;
    }
    
    try {
      setIsLoading(true);
      
      // Générer le numéro de bon de livraison
      const deliveryNumber = await generateDeliveryNumber();
      
      // Créer le bon de livraison principal
      const { data: deliverySlip, error: deliveryError } = await supabase
        .from('delivery_slips')
        .insert({
          delivery_number: deliveryNumber,
          purchase_order_id: editingPO.id,
          delivery_date: deliveryFormData.delivery_date,
          transport_company: deliveryFormData.transport_company || null,
          tracking_number: deliveryFormData.tracking_number || null,
          delivery_contact: deliveryFormData.delivery_contact || null,
          special_instructions: deliveryFormData.special_instructions || null,
          status: 'prepared'
        })
        .select()
        .single();
      
      if (deliveryError) throw new Error(deliveryError.message);
      
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
      
      if (itemsError) throw new Error(itemsError.message);
      
      // Mettre à jour les quantités livrées (triggers automatiques)
      console.log(`✅ Bon de livraison ${deliveryNumber} créé avec succès!`);
      
      // UTILISER VOTRE FONCTION generatePDF
      await generatePDF(deliverySlip, selectedItems, deliveryFormData, editingPO);
      
      // Recharger les données pour voir les nouveaux statuts
      await loadPOData(editingPO.id);
      
    } catch (err) {
      console.error('Erreur création bon de livraison:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Interface principale
  if (!isOpen) return null;

  const sections = [
    { id: 'info', label: 'Informations BA', icon: '📋' },
    { id: 'articles', label: 'Articles', icon: '📦', badge: poItems.length },
    { id: 'livraisons', label: 'Livraisons', icon: '🚚', badge: deliverySlips.length }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-7xl w-full max-h-[95vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">
                {editingPO ? `Modifier BA #${editingPO.po_number}` : 'Nouveau Bon d\'Achat Client'}
              </h2>
              <p className="text-blue-100 mt-1">
                Centre de gestion unifié - Création, Articles, Livraisons
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

        {/* Navigation par onglets */}
        <div className="bg-gray-50 border-b border-gray-200">
          <nav className="flex space-x-0">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`px-6 py-4 border-b-2 font-medium text-sm flex items-center gap-2 ${
                  activeSection === section.id
                    ? 'border-blue-500 text-blue-600 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <span>{section.icon}</span>
                {section.label}
                {section.badge && (
                  <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                    {section.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Message d'erreur */}
        {error && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Contenu des sections */}
        <div className="p-6 overflow-y-auto max-h-[calc(95vh-200px)]">
          
          {/* SECTION 1: INFORMATIONS BA */}
          {activeSection === 'info' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Informations du Bon d'Achat</h3>
                <button
                  onClick={loadSubmissions}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                  📝 Importer Soumission
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nom du client *
                  </label>
                  <input
                    type="text"
                    value={formData.client_name}
                    onChange={(e) => setFormData({...formData, client_name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email du client
                  </label>
                  <input
                    type="email"
                    value={formData.client_email}
                    onChange={(e) => setFormData({...formData, client_email: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Téléphone du client
                  </label>
                  <input
                    type="tel"
                    value={formData.client_phone}
                    onChange={(e) => setFormData({...formData, client_phone: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date du bon d'achat *
                  </label>
                  <input
                    type="date"
                    value={formData.po_date}
                    onChange={(e) => setFormData({...formData, po_date: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Adresse de livraison
                </label>
                <textarea
                  value={formData.client_address}
                  onChange={(e) => setFormData({...formData, client_address: e.target.value})}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Adresse complète de livraison..."
                />
              </div>

              {formData.submission_no && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-green-800">
                    📝 <strong>Soumission liée:</strong> #{formData.submission_no}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* SECTION 2: ARTICLES */}
          {activeSection === 'articles' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">
                  Articles du Bon d'Achat ({poItems.length})
                </h3>
                <button
                  onClick={() => setActiveSection('livraisons')}
                  disabled={poItems.length === 0}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400"
                >
                  🚚 Gérer Livraisons
                </button>
              </div>

              {poItems.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500 mb-4">Aucun article dans ce bon d'achat</p>
                  <button
                    onClick={loadSubmissions}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                  >
                    📝 Importer depuis Soumission
                  </button>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Article</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Quantité</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Prix Unit.</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">État Livraison</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sous-Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {poItems.map((item, index) => (
                        <tr key={item.id || index} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div>
                              <div className="font-medium text-gray-900">{item.product_id}</div>
                              <div className="text-sm text-gray-500">{item.description}</div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="text-sm">
                              <div className="font-medium">{item.quantity} {item.unit}</div>
                              {item.delivered_quantity > 0 && (
                                <div className="text-blue-600">Livré: {item.delivered_quantity}</div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {formatCurrency(item.selling_price)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                item.delivery_status === 'completed' ? 'bg-green-100 text-green-800' :
                                item.delivery_status === 'partial' ? 'bg-blue-100 text-blue-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {item.delivery_status === 'completed' && '✅ Complet'}
                                {item.delivery_status === 'partial' && '📦 Partiel'}
                                {item.delivery_status === 'not_started' && '⏳ Non Commencé'}
                              </span>
                              {item.delivery_percentage > 0 && (
                                <div className="text-xs text-gray-500">
                                  {item.delivery_percentage}%
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-medium">
                            {formatCurrency(item.quantity * item.selling_price)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan="4" className="px-4 py-3 text-right font-semibold">
                          Total:
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-lg">
                          {formatCurrency(poItems.reduce((sum, item) => sum + (item.quantity * item.selling_price), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* SECTION 3: LIVRAISONS */}
          {activeSection === 'livraisons' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold">Gestion des Livraisons</h3>

              {/* Historique des livraisons */}
              {deliverySlips.length > 0 && (
                <div>
                  <h4 className="text-md font-medium mb-3">Historique des livraisons ({deliverySlips.length})</h4>
                  <div className="space-y-2">
                    {deliverySlips.map((slip) => (
                      <div key={slip.id} className="bg-gray-50 rounded-lg p-3">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="font-medium">BL #{slip.delivery_number}</span>
                            <span className="text-gray-500 ml-2">- {formatDate(slip.delivery_date)}</span>
                            {slip.transport_company && (
                              <span className="text-sm text-gray-500 ml-2">({slip.transport_company})</span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500">
                            {slip.delivery_slip_items?.length || 0} article(s)
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Créer nouvelle livraison */}
              {poItems.some(item => item.remaining_quantity > 0) && (
                <div className="border border-dashed border-gray-300 rounded-lg p-6">
                  <h4 className="text-md font-medium mb-4">Nouvelle Livraison</h4>
                  
                  {/* Infos livraison */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Date de livraison
                      </label>
                      <input
                        type="date"
                        value={deliveryFormData.delivery_date}
                        onChange={(e) => setDeliveryFormData({...deliveryFormData, delivery_date: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Contact livraison
                      </label>
                      <input
                        type="text"
                        value={deliveryFormData.delivery_contact}
                        onChange={(e) => setDeliveryFormData({...deliveryFormData, delivery_contact: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Nom du contact"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Transporteur
                      </label>
                      <select
                        value={deliveryFormData.transport_company}
                        onChange={(e) => setDeliveryFormData({...deliveryFormData, transport_company: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        N° de suivi
                      </label>
                      <input
                        type="text"
                        value={deliveryFormData.tracking_number}
                        onChange={(e) => setDeliveryFormData({...deliveryFormData, tracking_number: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Numéro de tracking"
                      />
                    </div>
                  </div>

                  {/* Sélection articles */}
                  <div className="mb-4">
                    <h5 className="text-sm font-medium text-gray-700 mb-2">Articles à livrer (checkboxes)</h5>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left">Sél.</th>
                            <th className="px-4 py-2 text-left">Article</th>
                            <th className="px-4 py-2 text-center">Restant</th>
                            <th className="px-4 py-2 text-center">À Livrer</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {poItems.filter(item => item.remaining_quantity > 0).map((item) => (
                            <tr key={item.id} className={item.selected ? 'bg-blue-50' : ''}>
                              <td className="px-4 py-2">
                                <input
                                  type="checkbox"
                                  checked={item.selected}
                                  onChange={() => handleItemSelect(item.id)}
                                  className="w-4 h-4 text-blue-600"
                                />
                              </td>
                              <td className="px-4 py-2">
                                <div className="font-medium">{item.product_id}</div>
                                <div className="text-sm text-gray-500">{item.description}</div>
                              </td>
                              <td className="px-4 py-2 text-center">
                                {item.remaining_quantity} {item.unit}
                              </td>
                              <td className="px-4 py-2 text-center">
                                <input
                                  type="number"
                                  min="0"
                                  max={item.remaining_quantity}
                                  value={item.quantity_to_deliver}
                                  onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                                  disabled={!item.selected}
                                  className="w-20 px-2 py-1 text-center border rounded"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <button
                    onClick={createDeliverySlip}
                    disabled={!poItems.some(item => item.selected) || isLoading}
                    className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400"
                  >
                    {isLoading ? 'Création...' : '🚚 Créer et Imprimer BL'}
                  </button>
                </div>
              )}

              {!poItems.some(item => item.remaining_quantity > 0) && deliverySlips.length > 0 && (
                <div className="text-center py-8 bg-green-50 rounded-lg">
                  <p className="text-green-800 font-medium">✅ Tous les articles ont été livrés</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex justify-between items-center border-t">
          <div className="text-sm text-gray-600">
            {activeSection === 'articles' && poItems.length > 0 && (
              <span>
                Total: {formatCurrency(poItems.reduce((sum, item) => sum + (item.quantity * item.selling_price), 0))}
              </span>
            )}
            {activeSection === 'livraisons' && (
              <span>
                {poItems.filter(item => item.selected).length} article(s) sélectionné(s) pour livraison
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100"
            >
              {activeSection === 'livraisons' ? 'Fermer' : 'Annuler'}
            </button>
            {(activeSection === 'info' || activeSection === 'articles') && (
              <button
                onClick={savePurchaseOrder}
                disabled={isLoading || !formData.client_name}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                {isLoading ? 'Sauvegarde...' : (editingPO ? 'Mettre à jour' : 'Créer BA')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal import soumissions */}
      {showSubmissionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="bg-blue-600 text-white px-6 py-4 flex justify-between items-center">
              <h3 className="text-xl font-semibold">📝 Sélectionner une Soumission</h3>
              <button
                onClick={() => setShowSubmissionModal(false)}
                className="text-white hover:bg-white/20 rounded-lg p-2"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
              {submissions.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">Aucune soumission acceptée disponible</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {submissions.map((submission) => (
                    <div key={submission.id} className="border rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold">#{submission.submission_number}</h4>
                          <p className="text-gray-600">{submission.client_name}</p>
                          <p className="text-sm text-gray-500">
                            {formatDate(submission.created_at)} • {submission.items?.length || 0} articles
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-green-600">
                            {formatCurrency(submission.total_price)}
                          </div>
                          <button
                            onClick={() => importSubmission(submission)}
                            className="mt-2 bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
                          >
                            Importer
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseOrderModal;
