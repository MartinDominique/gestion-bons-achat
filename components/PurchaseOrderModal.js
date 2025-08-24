import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import DeliverySlipModal from './DeliverySlipModal';

const PurchaseOrderModal = ({ isOpen, onClose, editingPO = null, onRefresh }) => {
  // État principal du formulaire
  const [formData, setFormData] = useState({
    po_number: '',
    client_name: '',
    client_email: '',
    client_phone: '',
    client_address: '',
    date: new Date().toISOString().split('T')[0],
    delivery_date: '',
    payment_terms: '',
    special_instructions: '',
    submission_no: '',
    amount: 0,
    status: 'draft'
  });

  // États de l'interface
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('info');
  
  // États pour les modals
  const [showClientModal, setShowClientModal] = useState(false);
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  
  // Données pour les sélections
  const [clients, setClients] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [items, setItems] = useState([]);
  const [deliverySlips, setDeliverySlips] = useState([]);
  
  // Vérification soumission existante
  const [hasExistingSubmission, setHasExistingSubmission] = useState(false);
  const [existingSubmissionData, setExistingSubmissionData] = useState(null);

  // Vérifier si le BA a déjà une soumission attribuée
  const checkExistingSubmission = async (purchaseOrderId) => {
    if (!purchaseOrderId) {
      setHasExistingSubmission(false);
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('submissions')
        .select('id, submission_number, status, client_name')
        .eq('linked_po_id', purchaseOrderId)
        .eq('status', 'accepted');
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        setHasExistingSubmission(true);
        setExistingSubmissionData(data[0]);
        setFormData(prev => ({
          ...prev,
          submission_no: data[0].submission_number
        }));
      } else {
        setHasExistingSubmission(false);
        setExistingSubmissionData(null);
      }
    } catch (error) {
      console.error('Erreur vérification soumission:', error);
    }
  };

  // Charger les données si édition
  useEffect(() => {
    if (isOpen && editingPO) {
      loadPOData(editingPO.id);
      checkExistingSubmission(editingPO.id);
    } else if (isOpen) {
      resetForm();
      loadClients();
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
      
      // Charger les articles
      const { data: poItems, error: itemsError } = await supabase
        .from('client_po_items')
        .select('*')
        .eq('purchase_order_id', poId)
        .order('product_id');
      
      if (itemsError) {
        console.error('Erreur chargement articles:', itemsError);
      }
      
      // Charger les bons de livraison
      const { data: slips, error: slipsError } = await supabase
        .from('delivery_slips')
        .select(`
          *,
          delivery_slip_items (*)
        `)
        .eq('purchase_order_id', poId)
        .order('created_at', { ascending: false });
      
      if (slipsError) {
        console.error('Erreur chargement livraisons:', slipsError);
      }

      // Mettre à jour les états
      setFormData(po);
      setItems(poItems || []);
      setDeliverySlips(slips || []);
      
      console.log(`BA ${po.po_number} chargé avec ${poItems?.length || 0} articles`);
      
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
      po_number: '',
      client_name: '',
      client_email: '',
      client_phone: '',
      client_address: '',
      date: new Date().toISOString().split('T')[0],
      delivery_date: '',
      payment_terms: '',
      special_instructions: '',
      submission_no: '',
      amount: 0,
      status: 'draft'
    });
    setItems([]);
    setDeliverySlips([]);
    setActiveTab('info');
    setError('');
    setHasExistingSubmission(false);
    setExistingSubmissionData(null);
  };

  // Charger les clients
  const loadClients = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name');
      
      if (error) throw new Error(error.message);
      
      setClients(data || []);
      console.log(`${data?.length || 0} clients chargés`);
      
    } catch (err) {
      console.error('Erreur chargement clients:', err);
      setError(err.message);
    }
  };

  // Sélectionner un client
  const selectClient = (client) => {
    setFormData(prev => ({
      ...prev,
      client_name: client.name || '',
      client_email: client.email || '',
      client_phone: client.phone || '',
      client_address: client.address || ''
    }));
    setShowClientModal(false);
  };

  // Charger les soumissions disponibles
  const loadSubmissions = async () => {
    if (hasExistingSubmission) {
      setError('Ce bon d\'achat a déjà une soumission attribuée. Vous ne pouvez pas en ajouter une autre.');
      return;
    }

    try {
      console.log('Chargement des soumissions...');
      
      const { data, error } = await supabase
        .from('submissions')
        .select('*')
        .eq('status', 'accepted')
        .is('linked_po_id', null) // Seulement les soumissions non liées
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw new Error(error.message);
      
      setSubmissions(data || []);
      setShowSubmissionModal(true);
      
    } catch (err) {
      console.error('Erreur chargement soumissions:', err);
      setError(`Erreur soumissions: ${err.message}`);
    }
  };

  // Importer une soumission
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
        submission_no: submission.submission_number,
        amount: parseFloat(submission.amount) || 0
      }));
      
      // Copier les articles
      const submissionItems = submission.items || [];
      const importedItems = submissionItems.map((item, index) => ({
        id: `temp-${index}`,
        product_id: item.product_id || item.code || `ITEM-${index + 1}`,
        description: item.name || item.description || 'Article',
        quantity: parseFloat(item.quantity) || 0,
        unit: item.unit || 'unité',
        selling_price: parseFloat(item.price) || 0,
        delivered_quantity: 0,
        from_submission: true
      }));
      
      setItems(importedItems);
      setShowSubmissionModal(false);
      setActiveTab('articles');
      
      console.log(`Soumission ${submission.submission_number} importée avec ${importedItems.length} articles`);
      
    } catch (err) {
      console.error('Erreur import soumission:', err);
      setError(err.message);
    }
  };

  // Sauvegarder le BA
  const savePurchaseOrder = async () => {
    try {
      setIsLoading(true);
      setError('');
      
      // Validations
      if (!formData.po_number.trim()) {
        throw new Error('Le numéro de bon d\'achat est requis');
      }
      
      if (!formData.client_name.trim()) {
        throw new Error('Le nom du client est requis');
      }
      
      // Vérifier que le numéro de BA n'existe pas déjà (sauf en édition)
      const { data: existingPO } = await supabase
        .from('purchase_orders')
        .select('id')
        .eq('po_number', formData.po_number)
        .not('id', 'eq', editingPO?.id || 0)
        .single();
      
      if (existingPO) {
        throw new Error(`Le numéro de BA "${formData.po_number}" existe déjà`);
      }
      
      let poData;
      
      if (editingPO) {
        // Mise à jour BA existant
        const { data, error } = await supabase
          .from('purchase_orders')
          .update({
            po_number: formData.po_number,
            client_name: formData.client_name,
            client_email: formData.client_email || null,
            client_phone: formData.client_phone || null,
            client_address: formData.client_address || null,
            date: formData.date,
            delivery_date: formData.delivery_date || null,
            payment_terms: formData.payment_terms || null,
            special_instructions: formData.special_instructions || null,
            submission_no: formData.submission_no || null,
            amount: formData.amount || 0,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingPO.id)
          .select()
          .single();
        
        if (error) throw new Error(error.message);
        poData = data;
        
      } else {
        // Création nouveau BA
        const { data, error } = await supabase
          .from('purchase_orders')
          .insert({
            po_number: formData.po_number,
            client_name: formData.client_name,
            client_email: formData.client_email || null,
            client_phone: formData.client_phone || null,
            client_address: formData.client_address || null,
            date: formData.date,
            delivery_date: formData.delivery_date || null,
            payment_terms: formData.payment_terms || null,
            special_instructions: formData.special_instructions || null,
            submission_no: formData.submission_no || null,
            status: 'draft',
            amount: formData.amount || 0
          })
          .select()
          .single();
        
        if (error) throw new Error(error.message);
        poData = data;
      }
      
      // Sauvegarder les articles dans client_po_items
      if (items.length > 0) {
        if (editingPO) {
          // Supprimer les anciens articles
          await supabase
            .from('client_po_items')
            .delete()
            .eq('purchase_order_id', editingPO.id);
        }
        
        const itemsData = items.map(item => ({
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
        
        // Mettre à jour le montant total
        const totalAmount = itemsData.reduce((sum, item) => sum + (item.quantity * item.selling_price), 0);
        
        await supabase
          .from('purchase_orders')
          .update({ amount: totalAmount })
          .eq('id', poData.id);
      }

      // Lier la soumission au BA si nécessaire
      if (formData.submission_no && !editingPO) {
        const { error: linkError } = await supabase
          .from('submissions')
          .update({ linked_po_id: poData.id })
          .eq('submission_number', formData.submission_no);
        
        if (linkError) {
          console.error('Erreur liaison soumission:', linkError);
        }
      }
      
      console.log(`BA ${poData.po_number} sauvegardé avec succès`);
      
      if (onRefresh) onRefresh();
      onClose();
      
    } catch (err) {
      console.error('Erreur sauvegarde BA:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Ouvrir le modal de livraison
  const openDeliveryModal = () => {
    if (!hasExistingSubmission) {
      setError('Ce bon d\'achat doit avoir une soumission attribuée avant de pouvoir créer une livraison.');
      return;
    }
    setShowDeliveryModal(true);
  };

  // Calculer le statut de livraison
  const getDeliveryStatus = () => {
    if (items.length === 0) return 'not_started';
    
    const totalItems = items.length;
    const fullyDeliveredItems = items.filter(item => 
      (item.delivered_quantity || 0) >= (item.quantity || 0)
    ).length;
    const partiallyDeliveredItems = items.filter(item => 
      (item.delivered_quantity || 0) > 0 && (item.delivered_quantity || 0) < (item.quantity || 0)
    ).length;
    
    if (fullyDeliveredItems === totalItems) return 'completed';
    if (partiallyDeliveredItems > 0 || fullyDeliveredItems > 0) return 'partial';
    return 'not_started';
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  if (!isOpen) return null;

  const deliveryStatus = getDeliveryStatus();

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-4">
        <div className="bg-white rounded-xl max-w-6xl w-full max-h-[95vh] overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">
                  {editingPO ? `Modifier BA #${editingPO.po_number}` : 'Nouveau Bon d\'Achat Client'}
                </h2>
                <p className="text-blue-100 mt-1">
                  Gestion complète des bons d'achat clients
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
              <button
                onClick={() => setActiveTab('info')}
                className={`px-6 py-4 border-b-2 font-medium text-sm flex items-center gap-2 ${
                  activeTab === 'info'
                    ? 'border-blue-500 text-blue-600 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <span>📋</span>
                Informations
              </button>
              <button
                onClick={() => setActiveTab('articles')}
                className={`px-6 py-4 border-b-2 font-medium text-sm flex items-center gap-2 ${
                  activeTab === 'articles'
                    ? 'border-blue-500 text-blue-600 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <span>📦</span>
                Articles
                {items.length > 0 && (
                  <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                    {items.length}
                  </span>
                )}
              </button>
              {editingPO && (
                <button
                  onClick={() => setActiveTab('livraisons')}
                  className={`px-6 py-4 border-b-2 font-medium text-sm flex items-center gap-2 ${
                    activeTab === 'livraisons'
                      ? 'border-blue-500 text-blue-600 bg-white'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <span>🚚</span>
                  Livraisons
                  {deliverySlips.length > 0 && (
                    <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                      {deliverySlips.length}
                    </span>
                  )}
                </button>
              )}
            </nav>
          </div>

          {/* Message d'erreur */}
          {error && (
            <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {/* Alerte soumission existante */}
          {hasExistingSubmission && existingSubmissionData && (
            <div className="mx-6 mt-4 bg-yellow-50 border-l-4 border-yellow-400 p-4">
              <div className="flex">
                <div className="flex-shrink-0">⚠️</div>
                <div className="ml-3">
                  <p className="text-sm text-yellow-700">
                    <strong>Ce bon d'achat a déjà une soumission attribuée:</strong><br/>
                    Soumission #{existingSubmissionData.submission_number} - {existingSubmissionData.client_name}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Contenu des onglets */}
          <div className="p-6 overflow-y-auto max-h-[calc(95vh-250px)]">
            
            {/* ONGLET INFORMATIONS */}
            {activeTab === 'info' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Informations du Bon d'Achat</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowClientModal(true)}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"
                    >
                      👤 Sélectionner Client
                    </button>
                    <button
                      onClick={loadSubmissions}
                      disabled={hasExistingSubmission}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      📝 {hasExistingSubmission ? 'Soumission Attribuée' : 'Importer Soumission'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Numéro de bon d'achat *
                    </label>
                    <input
                      type="text"
                      name="po_number"
                      value={formData.po_number}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Ex: BA-2024-001"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nom du client *
                    </label>
                    <input
                      type="text"
                      name="client_name"
                      value={formData.client_name}
                      onChange={handleChange}
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
                      name="client_email"
                      value={formData.client_email}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Téléphone du client
                    </label>
                    <input
                      type="tel"
                      name="client_phone"
                      value={formData.client_phone}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Date du bon d'achat *
                    </label>
                    <input
                      type="date"
                      name="date"
                      value={formData.date}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Date de livraison souhaitée
                    </label>
                    <input
                      type="date"
                      name="delivery_date"
                      value={formData.delivery_date}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Adresse de livraison
                  </label>
                  <textarea
                    name="client_address"
                    value={formData.client_address}
                    onChange={handleChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Adresse complète de livraison..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Instructions spéciales
                  </label>
                  <textarea
                    name="special_instructions"
                    value={formData.special_instructions}
                    onChange={handleChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Instructions particulières..."
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

            {/* ONGLET ARTICLES */}
            {activeTab === 'articles' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">
                    Articles du Bon d'Achat ({items.length})
                  </h3>
                  {items.length === 0 && (
                    <button
                      onClick={loadSubmissions}
                      disabled={hasExistingSubmission}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                    >
                      📝 Importer depuis Soumission
                    </button>
                  )}
                </div>

                {items.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-500 mb-4">Aucun article dans ce bon d'achat</p>
                    <p className="text-sm text-gray-400">Importez une soumission pour ajouter des articles</p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Article</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Quantité</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Prix Unit.</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Livré</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sous-Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {items.map((item, index) => {
                          const deliveredQty = parseFloat(item.delivered_quantity) || 0;
                          const totalQty = parseFloat(item.quantity) || 0;
                          const deliveryPercentage = totalQty > 0 ? (deliveredQty / totalQty) * 100 : 0;
                          
                          return (
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
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                ${parseFloat(item.selling_price || 0).toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  <span className="text-sm font-medium">{deliveredQty}</span>
                                  {deliveryPercentage > 0 && (
                                    <div className="w-16 bg-gray-200 rounded-full h-2">
                                      <div
                                        className={`h-2 rounded-full ${
                                          deliveryPercentage === 100 ? 'bg-green-500' : 'bg-blue-500'
                                        }`}
                                        style={{ width: `${Math.min(deliveryPercentage, 100)}%` }}
                                      ></div>
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right font-medium">
                                ${(parseFloat(item.quantity || 0) * parseFloat(item.selling_price || 0)).toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-gray-50">
                        <tr>
                          <td colSpan="4" className="px-4 py-3 text-right font-semibold">
                            Total:
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-lg">
                            ${items.reduce((sum, item) => sum + (parseFloat(item.quantity || 0) * parseFloat(item.selling_price || 0)), 0).toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ONGLET LIVRAISONS */}
            {activeTab === 'livraisons' && editingPO && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">
                    Livraisons ({deliverySlips.length})
                  </h3>
                  <div className="flex items-center gap-4">
                    <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                      deliveryStatus === 'completed' ? 'bg-green-100 text-green-800' :
                      deliveryStatus === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {deliveryStatus === 'completed' && '✅ Livraison Complète'}
                      {deliveryStatus === 'partial' && '📦 Livraison Partielle'}
                      {deliveryStatus === 'not_started' && '⏳ Non Commencé'}
                    </div>
                    <button
                      onClick={openDeliveryModal}
                      disabled={!hasExistingSubmission || items.length === 0}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      🚚 Nouvelle Livraison
                    </button>
                  </div>
                </div>

                {!hasExistingSubmission && (
                  <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                    <div className="flex">
                      <div className="flex-shrink-0">⚠️</div>
                      <div className="ml-3">
                        <p className="text-sm text-yellow-700">
                          Ce bon d'achat doit avoir une soumission attribuée avant de pouvoir créer des livraisons.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {deliverySlips.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-500 mb-4">Aucune livraison créée</p>
                    <p className="text-sm text-gray-400">Créez votre première livraison pour ce bon d'achat</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {deliverySlips.map((slip) => (
                      <div key={slip.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-semibold text-lg">{slip.delivery_number}</h4>
                            <p className="text-gray-600">Date: {new Date(slip.delivery_date).toLocaleDateString()}</p>
                            {slip.transport_company && (
                              <p className="text-sm text-gray-500">Transport: {slip.transport_company}</p>
                            )}
                            {slip.tracking_number && (
                              <p className="text-sm text-gray-500">Suivi: {slip.tracking_number}</p>
                            )}
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            slip.status === 'delivered' ? 'bg-green-100 text-green-800' :
                            slip.status === 'in_transit' ? 'bg-blue-100 text-blue-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {slip.status}
                          </span>
                        </div>
                        
                        {slip.delivery_slip_items && slip.delivery_slip_items.length > 0 && (
                          <div className="mt-4">
                            <p className="text-sm font-medium text-gray-700 mb-2">
                              Articles livrés ({slip.delivery_slip_items.length}):
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {slip.delivery_slip_items.map((item, index) => (
                                <div key={index} className="text-sm text-gray-600 bg-gray-50 rounded p-2">
                                  <span className="font-medium">{item.product_id}</span>
                                  <span className="ml-2">Qté: {item.quantity_delivered}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 flex justify-between items-center border-t">
            <div className="text-sm text-gray-600">
              {items.length > 0 && (
                <span>
                  Total: ${items.reduce((sum, item) => sum + (parseFloat(item.quantity || 0) * parseFloat(item.selling_price || 0)), 0).toFixed(2)}
                </span>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100"
              >
                {activeTab === 'livraisons' ? 'Fermer' : 'Annuler'}
              </button>
              {activeTab !== 'livraisons' && (
                <button
                  onClick={savePurchaseOrder}
                  disabled={isLoading || !formData.client_name || !formData.po_number}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {isLoading ? 'Sauvegarde...' : (editingPO ? 'Mettre à jour' : 'Créer BA')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal sélection client */}
      {showClientModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="bg-green-600 text-white px-6 py-4 flex justify-between items-center">
              <h3 className="text-xl font-semibold">👤 Sélectionner un Client</h3>
              <button
                onClick={() => setShowClientModal(false)}
                className="text-white hover:bg-white/20 rounded-lg p-2"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
              {clients.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">Aucun client disponible</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {clients.map((client) => (
                    <div key={client.id} className="border rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold">{client.name}</h4>
                          <p className="text-gray-600">{client.email}</p>
                          <p className="text-sm text-gray-500">{client.phone}</p>
                          {client.company && (
                            <p className="text-sm text-gray-500">{client.company}</p>
                          )}
                          {client.address && (
                            <p className="text-sm text-gray-500">{client.address}</p>
                          )}
                        </div>
                        <button
                          onClick={() => selectClient(client)}
                          className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700"
                        >
                          Sélectionner
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal import soumissions */}
      {showSubmissionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="bg-blue-600 text-white px-6 py-4 flex justify-between items-center">
              <h3 className="text-xl font-semibold">Sélectionner une Soumission</h3>
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
                  <p className="text-gray-500">Aucune soumission disponible</p>
                  <p className="text-sm text-gray-400 mt-2">
                    Seules les soumissions acceptées et non liées sont affichées
                  </p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {submissions.map((submission) => (
                    <div key={submission.id} className="border rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold">#{submission.submission_number || submission.id}</h4>
                          <p className="text-gray-600">{submission.client_name}</p>
                          <p className="text-sm text-gray-500 mb-2">{submission.description}</p>
                          <div className="flex gap-4 text-xs text-gray-500">
                            <span>Date: {new Date(submission.created_at).toLocaleDateString()}</span>
                            <span className="bg-green-100 text-green-800 px-2 py-1 rounded">
                              {submission.status}
                            </span>
                            <span>{submission.items?.length || 0} articles</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-green-600 mb-2">
                            ${parseFloat(submission.amount || 0).toFixed(2)}
                          </div>
                          <button
                            onClick={() => importSubmission(submission)}
                            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
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

      {/* Modal de livraison */}
      {showDeliveryModal && (
        <DeliverySlipModal
          isOpen={showDeliveryModal}
          onClose={() => {
            setShowDeliveryModal(false);
            if (editingPO) {
              loadPOData(editingPO.id); // Recharger les données après création d'une livraison
            }
          }}
          purchaseOrder={editingPO}
          onRefresh={() => {
            if (onRefresh) onRefresh();
            if (editingPO) {
              loadPOData(editingPO.id);
            }
          }}
        />
      )}
    </>
  );
};

export default PurchaseOrderModal;
