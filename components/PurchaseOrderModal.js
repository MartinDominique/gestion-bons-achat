/**
 * @file components/PurchaseOrderModal.js
 * @description Modal de gestion des bons d'achat client (BA)
 *              - Création et édition de BA avec onglets (Info, Articles, Livraisons, Documents)
 *              - Import depuis soumissions et achats fournisseurs
 *              - Gestion des bons de livraison liés
 *              - Modal BCC (confirmation de commande)
 * @version 1.1.0
 * @date 2026-02-22
 * @changelog
 *   1.1.0 - Ajout classes dark mode Tailwind CSS
 *   1.0.0 - Version initiale
 */
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import DeliverySlipModal from './DeliverySlipModal';
import BCCConfirmationModal from './PurchaseOrder/BCCConfirmationModal';

const PurchaseOrderModal = ({ isOpen, onClose, editingPO = null, onRefresh, panelMode = false, prefillData = null, keepOpenAfterCreate = false }) => {
  // État principal du formulaire
  const [formData, setFormData] = useState({
    po_number: '',
    client_name: '',
    client_email: '',
    client_phone: '',
    client_address: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    delivery_date: '',
    payment_terms: '',
    special_instructions: '',
    submission_no: '',
    amount: 0,
    status: 'in_progress',
    files: []
  });

  // États de l'interface
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('info');
  
  // États pour les modals
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [showSupplierPurchaseModal, setShowSupplierPurchaseModal] = useState(false);
  const [selectedSupplierPurchase, setSelectedSupplierPurchase] = useState(null);
  const [showBCCModal, setShowBCCModal] = useState(false);
  
  // Nouveaux états pour l'import depuis achats fournisseurs
  const [showSupplierImportModal, setShowSupplierImportModal] = useState(false);
  const [clientSupplierPurchases, setClientSupplierPurchases] = useState([]);
  const [selectedPurchaseForImport, setSelectedPurchaseForImport] = useState(null);
  const [selectedItemsForImport, setSelectedItemsForImport] = useState([]);
  const [isLoadingSupplierPurchases, setIsLoadingSupplierPurchases] = useState(false);
  
  // Données pour les sélections
  const [clients, setClients] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [items, setItems] = useState([]);
  const [deliverySlips, setDeliverySlips] = useState([]);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [supplierPurchases, setSupplierPurchases] = useState([]);
  
  // Vérification soumission existante
  const [hasExistingSubmission, setHasExistingSubmission] = useState(false);
  const [existingSubmissionData, setExistingSubmissionData] = useState(null);

  // États pour upload de fichiers
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  // État pour le mode "Créer et laisser ouvert" - tracks the PO after save
  const [stayOpenEditingPO, setStayOpenEditingPO] = useState(null);

  // États pour l'édition mobile
  const [editingItemIndex, setEditingItemIndex] = useState(null);
  const [editingItemData, setEditingItemData] = useState(null);
  const [showMobileItemEditor, setShowMobileItemEditor] = useState(false);
  const [mobileSearchResults, setMobileSearchResults] = useState([]);
  const [mobileSearchTimeout, setMobileSearchTimeout] = useState(null);

  // Charger les achats fournisseurs liés au client (pour import)
  const loadClientSupplierPurchases = async (clientName) => {
    if (!clientName) {
      setClientSupplierPurchases([]);
      return;
    }

    try {
      setIsLoadingSupplierPurchases(true);
      
      // Rechercher tous les BAs de ce client pour trouver les achats fournisseurs liés
      const { data: clientPOs, error: clientPOsError } = await supabase
        .from('purchase_orders')
        .select('id, po_number')
        .eq('client_name', clientName);

      if (clientPOsError) {
        console.error('Erreur chargement BAs client:', clientPOsError);
        return;
      }

      const clientPOIds = clientPOs?.map(po => po.id) || [];

      // Charger tous les achats fournisseurs liés à ce client
      const { data, error } = await supabase
        .from('supplier_purchases')
        .select('*')
        .or(
          clientPOIds.length > 0 
            ? `linked_po_id.in.(${clientPOIds.join(',')}),supplier_name.ilike.%${clientName}%`
            : `supplier_name.ilike.%${clientName}%`
        )
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erreur chargement achats fournisseurs client:', error);
        setClientSupplierPurchases([]);
      } else {
        // Filtrer pour éviter les doublons et ne garder que ceux avec des items
        const uniquePurchases = (data || []).filter((purchase, index, self) => 
          purchase.items && 
          purchase.items.length > 0 &&
          self.findIndex(p => p.id === purchase.id) === index
        );
        
        setClientSupplierPurchases(uniquePurchases);
        console.log(`${uniquePurchases.length} achats fournisseurs trouvés pour le client ${clientName}`);
      }
    } catch (error) {
      console.error('Erreur loadClientSupplierPurchases:', error);
      setClientSupplierPurchases([]);
    } finally {
      setIsLoadingSupplierPurchases(false);
    }
  };

  // Ouvrir le modal d'import depuis achats fournisseurs
  const openSupplierImportModal = () => {
    if (!formData.client_name) {
      setError('Veuillez d\'abord sélectionner un client avant d\'importer des articles d\'achats fournisseurs.');
      return;
    }
    
    loadClientSupplierPurchases(formData.client_name);
    setShowSupplierImportModal(true);
  };

  // Sélectionner un achat fournisseur pour import
  const selectPurchaseForImport = (purchase) => {
    setSelectedPurchaseForImport(purchase);
    setSelectedItemsForImport([]);
  };

  // Gérer la sélection d'items pour import
  const toggleItemSelection = (itemIndex) => {
    setSelectedItemsForImport(prev => {
      const newSelection = [...prev];
      const existingIndex = newSelection.indexOf(itemIndex);
      
      if (existingIndex > -1) {
        newSelection.splice(existingIndex, 1);
      } else {
        newSelection.push(itemIndex);
      }
      
      return newSelection;
    });
  };

  // Tout sélectionner / désélectionner
  const toggleAllItemsSelection = () => {
    if (!selectedPurchaseForImport?.items) return;
    
    if (selectedItemsForImport.length === selectedPurchaseForImport.items.length) {
      setSelectedItemsForImport([]);
    } else {
      setSelectedItemsForImport(selectedPurchaseForImport.items.map((_, index) => index));
    }
  };

  // Importer les articles sélectionnés
  const importSelectedItems = () => {
    if (!selectedPurchaseForImport || selectedItemsForImport.length === 0) {
      setError('Veuillez sélectionner au moins un article à importer.');
      return;
    }

    try {
      const itemsToImport = selectedItemsForImport.map(itemIndex => {
        const supplierItem = selectedPurchaseForImport.items[itemIndex];
        return {
          id: 'supplier-' + Date.now() + '-' + itemIndex,
          product_id: supplierItem.product_id || supplierItem.code || supplierItem.sku || 'ITEM-' + (itemIndex + 1),
          description: supplierItem.description || supplierItem.name || supplierItem.product_name || 'Article importé',
          quantity: parseFloat(supplierItem.quantity || supplierItem.qty || 1),
          unit: supplierItem.unit || supplierItem.unity || 'unité',
          selling_price: parseFloat(supplierItem.cost_price || supplierItem.price || supplierItem.unit_price || 0),
          delivered_quantity: 0,
          from_supplier_purchase: true,
          supplier_purchase_id: selectedPurchaseForImport.id,
          supplier_purchase_number: selectedPurchaseForImport.purchase_number
        };
      });

      const updatedItems = [...items, ...itemsToImport];
      setItems(updatedItems);
      
      // Recalculer le montant total
      const totalAmount = updatedItems.reduce((sum, item) => 
        sum + (parseFloat(item.quantity || 0) * parseFloat(item.selling_price || 0)), 0
      );
      setFormData(prev => ({ ...prev, amount: totalAmount }));

      setShowSupplierImportModal(false);
      setSelectedPurchaseForImport(null);
      setSelectedItemsForImport([]);
      setActiveTab('articles');

      console.log(`${itemsToImport.length} articles importés depuis l'achat fournisseur ${selectedPurchaseForImport.purchase_number}`);

    } catch (err) {
      console.error('Erreur import articles fournisseur:', err);
      setError('Erreur lors de l\'import des articles: ' + err.message);
    }
  };

  // Charger les achats fournisseurs liés
  const loadSupplierPurchases = async (purchaseOrderId) => {
    if (!purchaseOrderId) {
      setSupplierPurchases([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('supplier_purchases')
        .select('id, purchase_number, supplier_name, linked_po_number, total_amount, created_at, status, delivery_date, subtotal, taxes, shipping_cost, items, notes')
        .eq('linked_po_id', purchaseOrderId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erreur chargement achats fournisseurs:', error);
        setSupplierPurchases([]);
      } else {
        setSupplierPurchases(data || []);
        console.log((data?.length || 0) + ' achats fournisseurs chargés pour le BA ' + purchaseOrderId);
      }
    } catch (error) {
      console.error('Erreur chargement achats fournisseurs:', error);
      setSupplierPurchases([]);
    }
  };

  // Vérifier si le BA a déjà une soumission attribuée
  const checkExistingSubmission = async (purchaseOrderId) => {
    if (!purchaseOrderId) {
      setHasExistingSubmission(false);
      return;
    }
    
    try {
      const { data: poData, error: poError } = await supabase
        .from('purchase_orders')
        .select('submission_no')
        .eq('id', purchaseOrderId)
        .single();
      
      if (poError) throw poError;
      
      if (poData?.submission_no) {
        const { data: submissionData, error: subError } = await supabase
          .from('submissions')
          .select('id, submission_number, status, client_name')
          .eq('submission_number', poData.submission_no)
          .single();
        
        if (subError) {
          console.error('Erreur récupération soumission:', subError);
        }
        
        setHasExistingSubmission(true);
        setExistingSubmissionData(submissionData || { submission_number: poData.submission_no });
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
      loadClients();
      loadPOData(editingPO.id);
      checkExistingSubmission(editingPO.id);
      loadSupplierPurchases(editingPO.id);
    } else if (isOpen) {
      resetForm();
      loadClients();
      // Prefill data from split view panel (e.g., client info from AF form)
      if (prefillData) {
        setFormData(prev => ({
          ...prev,
          client_name: prefillData.client_name || prev.client_name,
          client_email: prefillData.client_email || prev.client_email,
          client_phone: prefillData.client_phone || prev.client_phone,
          client_address: prefillData.client_address || prev.client_address,
        }));
      }
    }
  }, [isOpen, editingPO]);

  // Écouter les événements quand un AF est sauvegardé (pour rafraîchir les achats fournisseurs liés)
  useEffect(() => {
    const currentPOId = editingPO?.id || stayOpenEditingPO?.id;
    if (!isOpen || !currentPOId) return;

    const handleAFSaved = (event) => {
      const linkedPoId = event.detail?.linkedPoId;
      // Rafraîchir si l'AF est lié à CE BA, ou si aucun filtre (rafraîchir par précaution)
      if (!linkedPoId || String(linkedPoId) === String(currentPOId)) {
        console.log('AF sauvegardé lié à ce BA, rafraîchissement des achats fournisseurs pour BA', currentPOId);
        loadSupplierPurchases(currentPOId);
      }
    };

    // Écouter aussi ba-list-updated au cas où
    const handleBAUpdated = () => {
      loadSupplierPurchases(currentPOId);
    };

    window.addEventListener('af-saved', handleAFSaved);
    window.addEventListener('ba-list-updated', handleBAUpdated);
    return () => {
      window.removeEventListener('af-saved', handleAFSaved);
      window.removeEventListener('ba-list-updated', handleBAUpdated);
    };
  }, [isOpen, editingPO?.id, stayOpenEditingPO?.id]);

  // Charger les données complètes d'un BA existant
  const loadPOData = async (poId) => {
    try {
      setIsLoading(true);
      
      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .select('*')
        .eq('id', poId)
        .single();
      
      if (poError) throw new Error(poError.message);
      
      const { data: poItems, error: itemsError } = await supabase
        .from('client_po_items')
        .select('*')
        .eq('purchase_order_id', poId)
        .order('product_id');
      
      if (itemsError) {
        console.error('Erreur chargement articles:', itemsError);
      }
      
      const { data: slips, error: slipsError } = await supabase
        .from('delivery_slips')
        .select('*, delivery_slip_items (*)')
        .eq('purchase_order_id', poId)
        .order('created_at', { ascending: false });
      
      if (slipsError) {
        console.error('Erreur chargement livraisons:', slipsError);
      }

      setFormData(po);
      setItems(poItems || []);
      setDeliverySlips(slips || []);
      setAttachedFiles(po.files || []);
      
      console.log('BA ' + po.po_number + ' chargé avec ' + (poItems?.length || 0) + ' articles et ' + (po.files?.length || 0) + ' fichiers');
      
    } catch (err) {
      console.error('Erreur chargement BA:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Fonctions pour la gestion des fichiers
  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    setIsUploadingFiles(true);
    setUploadProgress(0);

    try {
      const uploadedFiles = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Vérifier le type de fichier
        const allowedTypes = [
          'application/pdf',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/csv',
          'image/jpeg',
          'image/png'
        ];
        
        if (!allowedTypes.includes(file.type)) {
          throw new Error('Type de fichier non supporté: ' + file.name);
        }
        
        // Vérifier la taille (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
          throw new Error('Fichier trop volumineux: ' + file.name + ' (max 10MB)');
        }
        
        // Upload vers Supabase Storage (si configuré) ou stocker en base64
        const fileName = Date.now() + '_' + file.name;
        
        // Option 2: Stockage en base64 (pour cette demo)
        const base64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });
        
        uploadedFiles.push({
          id: Date.now() + i,
          name: file.name,
          size: file.size,
          type: file.type,
          uploadDate: new Date().toISOString(),
          data: base64 // En production, utiliser l'URL du storage
        });
        
        setUploadProgress(((i + 1) / files.length) * 100);
      }
      
      const newFiles = [...attachedFiles, ...uploadedFiles];
      setAttachedFiles(newFiles);
      setFormData(prev => ({ ...prev, files: newFiles }));
      
      console.log(uploadedFiles.length + ' fichier(s) ajouté(s)');
      
    } catch (error) {
      console.error('Erreur upload fichiers:', error);
      setError('Erreur upload: ' + error.message);
    } finally {
      setIsUploadingFiles(false);
      setUploadProgress(0);
      event.target.value = ''; // Reset input
    }
  };

  const deleteFile = (fileId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce fichier ?')) return;
    
    const newFiles = attachedFiles.filter(file => file.id !== fileId);
    setAttachedFiles(newFiles);
    setFormData(prev => ({ ...prev, files: newFiles }));
  };

  const downloadFile = async (file) => {
    if (file.data && file.data.startsWith('data:')) {
      // Télécharger depuis base64
      const link = document.createElement('a');
      link.href = file.data;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (file.url) {
      // Télécharger depuis URL avec le bon nom
      try {
        const response = await fetch(file.url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = file.name || 'document.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      } catch (error) {
        console.error('Erreur téléchargement:', error);
        window.open(file.url, '_blank');
      }
    }
  };

  const viewFile = (file) => {
  if (file.data && file.data.startsWith('data:')) {
    window.open(file.data, '_blank');
  } else if (file.url) {
    window.open(file.url, '_blank');
  }
};

  // Fonction pour voir les détails d'un achat fournisseur
  const visualizeSupplierPurchase = (purchase) => {
    setSelectedSupplierPurchase(purchase);
    setShowSupplierPurchaseModal(true);
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      po_number: '',
      client_name: '',
      client_email: '',
      client_phone: '',
      client_address: '',
      description: '',
      date: new Date().toISOString().split('T')[0],
      delivery_date: '',
      payment_terms: '',
      special_instructions: '',
      submission_no: '',
      amount: 0,
      status: 'in_progress',
      files: []
    });
    setItems([]);
    setDeliverySlips([]);
    setAttachedFiles([]);
    setSupplierPurchases([]);
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
      console.log((data?.length || 0) + ' clients chargés');
      
    } catch (err) {
      console.error('Erreur chargement clients:', err);
      setError(err.message);
    }
  };

  // Charger les soumissions disponibles
  const loadSubmissions = async () => {
    if (hasExistingSubmission) {
      setError('Ce bon d\'achat a déjà une soumission attribuée. Vous ne pouvez pas en ajouter une autre.');
      return;
    }

    try {
      console.log('Chargement des soumissions...');
      
      let query = supabase
        .from('submissions')
        .select('*')
        .in('status', ['sent', 'accepted']);
      
      // Filtrer par client si un client est sélectionné
      if (formData.client_name) {
        query = query.eq('client_name', formData.client_name);
      }
      
      const { data: allSubmissions, error } = await query
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw new Error(error.message);
      
      const { data: usedSubmissions, error: usedError } = await supabase
        .from('purchase_orders')
        .select('submission_no')
        .not('submission_no', 'is', null);
      
      if (usedError) {
        console.error('Erreur récupération soumissions utilisées:', usedError);
      }
      
      const usedSubmissionNumbers = new Set((usedSubmissions || []).map(p => p.submission_no));
      const availableSubmissions = (allSubmissions || []).filter(sub => 
        !usedSubmissionNumbers.has(sub.submission_number)
      );
      
      setSubmissions(availableSubmissions);
      setShowSubmissionModal(true);
      
      console.log((availableSubmissions.length) + ' soumissions disponibles sur ' + (allSubmissions?.length || 0) + ' total');
      
    } catch (err) {
      console.error('Erreur chargement soumissions:', err);
      setError('Erreur soumissions: ' + err.message);
    }
  };

  // Importer une soumission
  const importSubmission = async (submission) => {
    try {
      console.log('Import soumission:', submission.submission_number);
      
      setFormData(prev => ({
        ...prev,
        client_name: submission.client_name || prev.client_name,
        client_email: submission.client_email || prev.client_email,
        client_phone: submission.client_phone || prev.client_phone,
        client_address: submission.client_address || prev.client_address,
        submission_no: submission.submission_number,
        amount: parseFloat(submission.amount) || 0
      }));
      
      const submissionItems = submission.items || [];
      const importedItems = submissionItems.map((item, index) => ({
        id: 'temp-' + index,
        product_id: item.product_id || item.code || 'ITEM-' + (index + 1),
        description: item.name || item.description || 'Article',
        quantity: parseFloat(item.quantity) || 0,
        unit: item.unit || 'unité',
        selling_price: parseFloat(item.price || item.selling_price || item.unit_price || 0),
        delivered_quantity: 0,
        from_submission: true
      }));
      
      setItems(importedItems);
      
      // Recalculer le montant total basé sur les articles importés
      const totalAmount = importedItems.reduce((sum, item) => 
        sum + (parseFloat(item.quantity || 0) * parseFloat(item.selling_price || 0)), 0
      );
      setFormData(prev => ({ ...prev, amount: Math.max(totalAmount, parseFloat(submission.amount) || 0) }));
      setShowSubmissionModal(false);
      setActiveTab('articles');
      
      // Si la soumission est "Envoyée", la passer à "Acceptée" automatiquement
      if (submission.status === 'sent') {
        try {
          await supabase
            .from('submissions')
            .update({ status: 'accepted' })
            .eq('id', submission.id);
          console.log('✅ Soumission ' + submission.submission_number + ' passée à Acceptée');
        } catch (err) {
          console.error('Erreur changement statut soumission:', err);
        }
      }
      
      console.log('Soumission ' + submission.submission_number + ' importée avec ' + importedItems.length + ' articles');
      
    } catch (err) {
      console.error('Erreur import soumission:', err);
      setError(err.message);
    }
  };

  // Ajouter un nouvel article manuellement
  const addNewItem = () => {
    // Détecter si on est sur mobile
    const isMobile = window.innerWidth < 640; // sm breakpoint
    
    if (isMobile) {
      // Sur mobile, ouvrir le modal d'édition
      setEditingItemIndex(null);
      setEditingItemData({
        id: 'new-' + Date.now(),
        product_id: '',
        description: '',
        quantity: 1,
        unit: 'unité',
        selling_price: 0,
        delivered_quantity: 0,
        from_manual: true
      });
      setShowMobileItemEditor(true);
    } else {
      // Sur desktop, comportement normal
      const newItem = {
        id: 'new-' + Date.now(),
        product_id: '',
        description: '',
        quantity: 0,
        unit: 'unité',
        selling_price: 0,
        delivered_quantity: 0,
        from_manual: true
      };
      setItems([newItem, ...items]);
      setActiveTab('articles');
    }
  };

  // Mettre à jour un article
  const updateItem = (index, updatedItem) => {
    const newItems = [...items];
    newItems[index] = updatedItem;
    setItems(newItems);
    
    // Calculer le montant total automatiquement lors de la modification d'articles
    const totalAmount = newItems.reduce((sum, item) => 
      sum + (parseFloat(item.quantity || 0) * parseFloat(item.selling_price || 0)), 0
    );
    setFormData(prev => ({ ...prev, amount: totalAmount }));
  };

  // Supprimer un article
  const deleteItem = (index) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
    
    // Recalculer le montant total après suppression
    const totalAmount = newItems.reduce((sum, item) => 
      sum + (parseFloat(item.quantity || 0) * parseFloat(item.selling_price || 0)), 0
    );
    setFormData(prev => ({ ...prev, amount: totalAmount }));
  };

  // Fonction de recherche pour le modal mobile
  const searchProductsForMobile = async (term) => {
    if (!term || term.length < 2) {
      setMobileSearchResults([]);
      return;
    }

    // Annuler la recherche précédente
    if (mobileSearchTimeout) {
      clearTimeout(mobileSearchTimeout);
    }

    // Délai de 300ms pour éviter trop de requêtes
    const timeoutId = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .or('product_id.ilike.%' + term + '%,description.ilike.%' + term + '%')
          .order('product_id')
          .limit(10);

        if (error) throw error;

        setMobileSearchResults(data || []);
      } catch (error) {
        console.error('Erreur recherche produits mobile:', error);
        setMobileSearchResults([]);
      }
    }, 300);

    setMobileSearchTimeout(timeoutId);
  };

  // Composant pour éditer une ligne d'article
  const ItemRow = ({ item, onUpdate, onDelete }) => {
    const [editMode, setEditMode] = useState(item.from_manual && !item.product_id);
    const [localItem, setLocalItem] = useState(item);
    const [searchResults, setSearchResults] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const searchProducts = async (term) => {
      if (!term || term.length < 2) {
        setSearchResults([]);
        setShowSuggestions(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .or('product_id.ilike.%' + term + '%,description.ilike.%' + term + '%')
          .order('product_id')
          .limit(10);

        if (error) throw error;

        setSearchResults(data || []);
        setShowSuggestions(true);
      } catch (error) {
        console.error('Erreur recherche produits:', error);
      }
    };

    const selectProduct = (product) => {
      setLocalItem({
        ...localItem,
        product_id: product.product_id,
        description: product.description || product.name || '',
        selling_price: parseFloat(product.selling_price || product.price || 0),
        unit: product.unit || 'unité'
      });
      setSearchTerm(product.product_id);
      setShowSuggestions(false);
    };

    const handleProductIdChange = (value) => {
      setSearchTerm(value);
      setLocalItem({...localItem, product_id: value});
      searchProducts(value);
    };

    const handleSave = () => {
      onUpdate(localItem);
      setEditMode(false);
    };

    const handleCancel = () => {
      setLocalItem(item);
      setEditMode(false);
      setShowSuggestions(false);
      if (item.from_manual && !item.product_id) {
        onDelete();
      }
    };

    if (editMode) {
      return (
        <tr className="bg-yellow-50 dark:bg-yellow-900/20">
          <td className="px-1 py-1 relative">
            <input
              type="text"
              value={searchTerm || localItem.product_id}
              onChange={(e) => handleProductIdChange(e.target.value)}
              onFocus={() => {
                if (searchResults.length > 0) setShowSuggestions(true);
              }}
              placeholder="Code..."
              className="w-full px-1 py-1 text-xs border rounded dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
            />
            
            {showSuggestions && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-b shadow-lg z-10 max-h-48 overflow-y-auto">
                {searchResults.map((product) => (
                  <div
                    key={product.id}
                    onClick={() => selectProduct(product)}
                    className="px-2 py-1 hover:bg-blue-50 cursor-pointer border-b border-gray-100"
                  >
                    <div className="font-medium text-xs">{product.product_id}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 truncate">{product.description || product.name}</div>
                  </div>
                ))}
              </div>
            )}
          </td>
          <td className="px-1 py-1">
            <input
              type="text"
              value={localItem.description}
              onChange={(e) => setLocalItem({...localItem, description: e.target.value})}
              placeholder="Description"
              className="w-full px-1 py-1 text-xs border rounded dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
            />
          </td>
          <td className="px-1 py-1">
            <input
              type="number"
              value={localItem.quantity}
              onChange={(e) => setLocalItem({...localItem, quantity: parseFloat(e.target.value) || 0})}
              className="w-12 px-1 py-1 text-xs border rounded text-center dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
              step="0.001"
              min="0"
            />
          </td>
          <td className="px-1 py-1">
            <select
              value={localItem.unit}
              onChange={(e) => setLocalItem({...localItem, unit: e.target.value})}
              className="w-14 px-0 py-1 text-xs border rounded dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
            >
              <option value="unité">UN</option>
              <option value="mètre">M</option>
              <option value="pied">FT</option>
              <option value="kilogramme">KG</option>
              <option value="litre">L</option>
              <option value="heure">H</option>
            </select>
          </td>
          <td className="px-1 py-1">
            <input
              type="number"
              value={localItem.selling_price}
              onChange={(e) => setLocalItem({...localItem, selling_price: parseFloat(e.target.value) || 0})}
              className="w-14 px-1 py-1 text-xs border rounded text-center dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
              step="any"
              min="0"
            />
          </td>
          <td className="px-1 py-1 text-center text-xs">
            {parseFloat(localItem.delivered_quantity || 0)}
          </td>
          <td className="px-1 py-1 text-right text-xs font-medium">
            ${(parseFloat(localItem.quantity || 0) * parseFloat(localItem.selling_price || 0)).toFixed(2)}
          </td>
          <td className="px-1 py-1">
            <div className="flex gap-0.5 justify-center">
              <button
                onClick={handleSave}
                className="text-green-600 hover:text-green-800 text-xs p-1 border border-green-300 rounded"
                disabled={!localItem.product_id || !localItem.description}
                title="Sauvegarder"
              >
                ✓
              </button>
              <button
                onClick={handleCancel}
                className="text-red-600 hover:text-red-800 text-xs p-1 border border-red-300 rounded"
                title="Annuler"
              >
                ✕
              </button>
            </div>
          </td>
        </tr>
      );
    }

    const deliveredQty = parseFloat(item.delivered_quantity) || 0;
    const totalQty = parseFloat(item.quantity) || 0;
    const deliveryPercentage = totalQty > 0 ? (deliveredQty / totalQty) * 100 : 0;

    return (
      <tr className="hover:bg-gray-50 dark:hover:bg-gray-800">
        <td className="px-2 py-2">
          <div className="font-medium text-gray-900 dark:text-gray-100 text-xs">{item.product_id}</div>
        </td>
        <td className="px-2 py-2 max-w-[120px]">
          <div className="text-xs text-gray-900 dark:text-gray-100 truncate">{item.description}</div>
        </td>
        <td className="px-2 py-2 text-center">
          <div className="font-medium text-xs">{item.quantity}</div>
        </td>
        <td className="px-2 py-2 text-center">
          <div className="text-xs dark:text-gray-300">{item.unit}</div>
        </td>
        <td className="px-2 py-2 text-center text-xs">
          ${parseFloat(item.selling_price || 0).toFixed(2)}
        </td>
        <td className="px-2 py-2 text-center">
          <span className="text-xs font-medium">{deliveredQty}/{totalQty}</span>
        </td>
        <td className="px-2 py-2 text-right font-medium text-xs">
          ${(parseFloat(item.quantity || 0) * parseFloat(item.selling_price || 0)).toFixed(2)}
        </td>
        <td className="px-2 py-2">
          <div className="flex gap-0.5 justify-center">
            <button
              onClick={() => {
                setSearchTerm(item.product_id);
                setEditMode(true);
              }}
              className="text-blue-600 hover:text-blue-800 p-1"
              title="Modifier"
            >
              ✏️
            </button>
            <button
              onClick={() => {
                if (window.confirm('Supprimer cet article ?')) {
                  onDelete();
                }
              }}
              className="text-red-600 hover:text-red-800 p-1"
              title="Supprimer"
            >
              🗑️
            </button>
          </div>
        </td>
      </tr>
    );
  };

  // Supprimer le bon d'achat
  const deletePurchaseOrder = async () => {
    if (!editingPO) return;

    const confirmDelete = window.confirm(
      'Êtes-vous sûr de vouloir supprimer le bon d\'achat ' + editingPO.po_number + ' ?\n\n' +
      'Cette action supprimera également :\n' +
      '- Tous les articles du BA\n' +
      '- Tous les bons de livraison associés\n' +
      '- Tous les fichiers joints\n' +
      '- Les liens avec les achats fournisseurs (les achats fournisseurs seront conservés)\n' +
      '- Toutes les données liées\n\n' +
      'Cette action est IRRÉVERSIBLE.'
    );

    if (!confirmDelete) return;

    try {
      setIsLoading(true);
      setError('');

      console.log('Début suppression BA:', editingPO.id);

      // 1. NOUVEAU : Délier les achats fournisseurs (ne pas les supprimer)
      const { error: supplierUnlinkError } = await supabase
        .from('supplier_purchases')
        .update({ 
          linked_po_id: null, 
          linked_po_number: null 
        })
        .eq('linked_po_id', editingPO.id);

      if (supplierUnlinkError) {
        console.warn('Avertissement déliage achats fournisseurs:', supplierUnlinkError);
        // On continue même si ça échoue, pas critique
      } else {
        console.log('✅ Achats fournisseurs déliés du BA');
      }

      // 2. Supprimer les articles de livraison
      if (deliverySlips.length > 0) {
        const { error: deliveryItemsError } = await supabase
          .from('delivery_slip_items')
          .delete()
          .in('delivery_slip_id', deliverySlips.map(slip => slip.id));

        if (deliveryItemsError) {
          throw new Error('Erreur suppression articles livraison: ' + deliveryItemsError.message);
        }
      }

      // 3. Supprimer les bons de livraison
      if (deliverySlips.length > 0) {
        const { error: deliverySlipsError } = await supabase
          .from('delivery_slips')
          .delete()
          .eq('purchase_order_id', editingPO.id);

        if (deliverySlipsError) {
          throw new Error('Erreur suppression bons livraison: ' + deliverySlipsError.message);
        }
      }

      // 4. Supprimer les articles du BA
      const { error: itemsError } = await supabase
        .from('client_po_items')
        .delete()
        .eq('purchase_order_id', editingPO.id);

      if (itemsError) {
        throw new Error('Erreur suppression articles BA: ' + itemsError.message);
      }

      // 5. Enfin, supprimer le BA principal
      const { error: poError } = await supabase
        .from('purchase_orders')
        .delete()
        .eq('id', editingPO.id);

      if (poError) {
        throw new Error('Erreur suppression BA principal: ' + poError.message);
      }

      console.log('✅ BA ' + editingPO.po_number + ' supprimé avec succès');
      
      if (onRefresh) onRefresh();
      onClose();

    } catch (err) {
      console.error('Erreur suppression BA:', err);
      setError('Erreur lors de la suppression: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Sauvegarder le BA
  // stayOpen: if true, keep the form open after creation (switch to edit mode)
  const savePurchaseOrder = async (stayOpen = false) => {
    try {
      setIsLoading(true);
      setError('');
      
      if (!formData.po_number.trim()) {
        throw new Error('Le numéro de bon d\'achat est requis');
      }
      
      if (!formData.client_name.trim()) {
        throw new Error('Le nom du client est requis');
      }
      
      const { data: existingPOs, error: duplicateError } = await supabase
        .from('purchase_orders')
        .select('id')
        .eq('po_number', formData.po_number)
        .not('id', 'eq', editingPO?.id || 0);

      if (duplicateError) {
        throw new Error('Erreur vérification doublons: ' + duplicateError.message);
      }

      if (existingPOs && existingPOs.length > 0) {
        throw new Error('Le numéro de BA "' + formData.po_number + '" existe déjà');
      }
      
      let poData;
      
      if (editingPO) {
        const { data, error } = await supabase
          .from('purchase_orders')
          .update({
            po_number: formData.po_number,
            client_name: formData.client_name,
            client_email: formData.client_email || null,
            client_phone: formData.client_phone || null,
            client_address: formData.client_address || null,
            description: formData.description || null,
            date: formData.date,
            delivery_date: formData.delivery_date || null,
            payment_terms: formData.payment_terms || null,
            special_instructions: formData.special_instructions || null,
            submission_no: formData.submission_no || null,
            amount: formData.amount || 0,
            status: formData.status,
            files: attachedFiles,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingPO.id)
          .select()
          .single();
        
        if (error) throw new Error(error.message);
        poData = data;
        
      } else {
        const { data, error } = await supabase
          .from('purchase_orders')
          .insert({
            po_number: formData.po_number,
            client_name: formData.client_name,
            client_email: formData.client_email || null,
            client_phone: formData.client_phone || null,
            client_address: formData.client_address || null,
            description: formData.description || null,
            date: formData.date,
            delivery_date: formData.delivery_date || null,
            payment_terms: formData.payment_terms || null,
            special_instructions: formData.special_instructions || null,
            submission_no: formData.submission_no || null,
            status: 'in_progress',
            amount: formData.amount || 0,
            files: attachedFiles
          })
          .select()
          .single();
        
        if (error) throw new Error(error.message);
        poData = data;
      }
      
      if (items.length > 0) {
        if (editingPO) {
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
        
        if (itemsError) throw new Error('Erreur sauvegarde articles: ' + itemsError.message);
        
        // Recalculer le montant total basé sur les articles si nécessaire
        if (formData.amount === 0 || !formData.amount) {
          const totalAmount = itemsData.reduce((sum, item) => sum + (item.quantity * item.selling_price), 0);
          
          await supabase
            .from('purchase_orders')
            .update({ amount: totalAmount })
            .eq('id', poData.id);
        }
      }
      
      console.log('BA ' + poData.po_number + ' sauvegardé avec succès');

      if (onRefresh) onRefresh();

      if (stayOpen && !editingPO && !stayOpenEditingPO) {
        // "Créer et laisser ouvert" - reload the created PO in edit mode
        setStayOpenEditingPO(poData);
        loadPOData(poData.id);
        loadSupplierPurchases(poData.id);
        checkExistingSubmission(poData.id);
        console.log('BA créé et gardé ouvert en mode édition');
      } else {
        onClose();
      }
      
    } catch (err) {
      console.error('Erreur sauvegarde BA:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Réimprimer un bon de livraison existant
  const reprintDeliverySlip = async (deliverySlip) => {
    try {
      console.log('Réimpression du bon de livraison:', deliverySlip.delivery_number);
      
      // Récupérer les articles du bon de livraison
      const { data: deliveryItems, error: itemsError } = await supabase
        .from('delivery_slip_items')
        .select('*')
        .eq('delivery_slip_id', deliverySlip.id);

      if (itemsError) {
        setError('Erreur lors du chargement des articles: ' + itemsError.message);
        return;
      }

      if (!deliveryItems || deliveryItems.length === 0) {
        setError('Aucun article trouvé pour ce bon de livraison');
        return;
      }

      // Récupérer les détails des articles depuis client_po_items
      const { data: poItems, error: poItemsError } = await supabase
        .from('client_po_items')
        .select('*')
        .eq('purchase_order_id', deliverySlip.purchase_order_id);

      if (poItemsError) {
        console.error('Erreur chargement articles BA:', poItemsError);
        setError('Erreur lors du chargement des détails des articles');
        return;
      }

      // Mapper les articles de livraison avec leurs détails
      const selectedItems = deliveryItems.map(deliveryItem => {
        // Trouver l'article correspondant dans le BA
        const poItem = poItems.find(item => 
          item.product_id === deliveryItem.product_id ||
          item.id === deliveryItem.client_po_item_id
        );

        return {
          product_id: deliveryItem.product_id || poItem?.product_id || 'N/A',
          description: poItem?.description || deliveryItem.description || 'Article',
          quantity: poItem?.quantity || 1,
          unit: poItem?.unit || 'UN',
          price: poItem?.selling_price || 0,
          quantity_to_deliver: deliveryItem.quantity_delivered || 0
        };
      });

      // Simuler les données du formulaire pour le PDF
      const mockFormData = {
        delivery_date: deliverySlip.delivery_date,
        transport_company: deliverySlip.transport_company || 'Non spécifié',
        tracking_number: deliverySlip.transport_number || deliverySlip.tracking_number || 'N/A',
        delivery_contact: deliverySlip.delivery_contact || '',
        special_instructions: deliverySlip.special_instructions || '',
        items: selectedItems.map(item => ({
          ...item,
          delivered_quantity: 0, // Pour le calcul des quantités restantes
          remaining_quantity: item.quantity,
          quantity_delivered_now: item.quantity_to_deliver,
          remaining_after_delivery: Math.max(0, item.quantity - item.quantity_to_deliver)
        }))
      };

      // Appeler la fonction de génération PDF
      await generateReprinterPDF(deliverySlip, selectedItems, mockFormData);

    } catch (error) {
      console.error('Erreur réimpression:', error);
      setError('Erreur lors de la réimpression: ' + error.message);
    }
  };

  // Fonction de génération PDF pour réimpression - MÊME FORMAT QUE DeliverySlipModal
const generateReprinterPDF = async (deliverySlip, selectedItems, mockFormData) => {
  console.log('Réimpression PDF avec format TMT pour:', deliverySlip.delivery_number);
  
  // Récupérer les informations du BO associé
  let purchaseOrderInfo = '';
  if (editingPO.purchase_order_number) {
    const { data: poData } = await supabase
      .from('purchase_orders')
      .select('po_number, supplier_name, order_date')
      .eq('po_number', editingPO.purchase_order_number)
      .single();
    
    if (poData) {
      purchaseOrderInfo = `BO #${poData.po_number} - ${poData.supplier_name}`;
    }
  }

  // Nettoyer les notes
  let cleanNotes = editingPO.notes || '';
  cleanNotes = cleanNotes.split('\n')
    .filter(line => !line.includes('[LIVRAISON'))
    .join('\n');
  cleanNotes = cleanNotes.split('\n')
    .filter(line => !line.match(/\[\d+\/\d+\/\d+\]\s*Bon de livraison.*créé/i))
    .join('\n');
  cleanNotes = cleanNotes.replace(/\s+/g, ' ').trim();

  // Template d'impression avec design TMT
  const generateCopyContent = (copyType, items, isLastCopy = false) => {
    const ITEMS_PER_PAGE = 29;
    
    const pageGroups = [];
    for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) {
      pageGroups.push(items.slice(i, i + ITEMS_PER_PAGE));
    }
    
    const generateSinglePage = (pageItems, pageNumber, totalPages) => {
      const isVeryLastPage = isLastCopy && (pageNumber === totalPages);
      
      return `
        <div class="print-page" style="min-height: 10.5in; display: flex; flex-direction: column; position: relative; ${isVeryLastPage ? 'page-break-after: avoid;' : ''}">
          
          <!-- HEADER FIXE -->
          <div style="flex-shrink: 0; overflow: hidden;">
            <div class="header" style="display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px;">
              <div style="display: flex; align-items: start; gap: 20px;">
                <div style="width: 140px; height: 100px;">
                  <img src="/logo.png" alt="Services TMT" style="width: 100%; height: 100%; object-fit: contain;" onerror="this.style.display='none'">
                </div>
                <div style="font-size: 11px; line-height: 1.2;">
                  <div style="font-size: 14px; font-weight: bold; margin-bottom: 3px;">Services TMT Inc.</div>
                  3195, 42e Rue Nord<br>
                  Saint-Georges, QC G5Z 0V9<br>
                  Tél: (418) 225-3875<br>
                  info.servicestmt@gmail.com
                </div>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 20px; font-weight: bold; margin-bottom: 5px;">BON DE LIVRAISON</div>
                <div style="font-size: 14px; font-weight: bold; margin-bottom: 3px;">${deliverySlip.delivery_number}</div>
                <div style="font-size: 10px; line-height: 1.2;">
                  Date: ${new Date(mockFormData.delivery_date).toLocaleDateString('fr-CA')}<br>
                  BA Client: ${editingPO.po_number}<br>
                  ${purchaseOrderInfo ? `${purchaseOrderInfo}<br>` : ''}
                  ${editingPO.submission_no ? `Soumission: #${editingPO.submission_no}` : ''}
                </div>
              </div>
            </div>

            <!-- INSTRUCTIONS SPÉCIALES -->
            <div style="border: 2px solid #dd6b20; padding: 5px 8px; border-radius: 4px; margin-bottom: 10px; background: #fef5e7; font-size: 11px; font-weight: bold; text-align: left;">
              <span style="color: #dd6b20;">INSTRUCTIONS SPÉCIALES:</span> ${mockFormData.special_instructions || '________________________________'}
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px;">
              <div style="border: 1px solid #000; padding: 6px; border-radius: 5px; border-left: 4px solid #000;">
                <div style="font-weight: bold; font-size: 11px; border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 4px;">Livrer à :</div>
                <div style="font-size: 11px; line-height: 1.2;">
                  <strong>${editingPO.client_name}</strong><br>
                  ${mockFormData.delivery_contact ? `Contact: ${mockFormData.delivery_contact}<br>` : ''}
                  ${editingPO.delivery_address || editingPO.client_address || 'Adresse de livraison à confirmer'}
                </div>
              </div>
              <div style="border: 1px solid #000; padding: 6px; border-radius: 5px; border-left: 4px solid #000;">
                <div style="font-weight: bold; font-size: 11px; border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 4px;">Informations de transport:</div>
                <div style="font-size: 10px; line-height: 1.2;">
                  Transporteur: <strong>${mockFormData.transport_company || 'Non spécifié'}</strong><br>
                  N° de suivi: <strong>${mockFormData.tracking_number || 'N/A'}</strong><br>
                  Date de livraison: <strong>${new Date(mockFormData.delivery_date).toLocaleDateString('fr-CA')}</strong>
                </div>
              </div>
            </div>

            ${cleanNotes ? `
              <div style="border: 1px solid #000; padding: 4px 8px; border-radius: 3px; margin-bottom: 8px; border-left: 3px solid #000; font-size: 10px;">
                <strong>NOTES:</strong> ${cleanNotes.replace(/[^\x00-\x7F]/g, "")}
              </div>
            ` : ''}
          </div>

          <!-- BODY - TABLEAU -->
          <div style="flex: 1; overflow: hidden; border: 1px solid #000; border-radius: 5px; border-left: 4px solid #000; padding: 8px; background: #fff;">
            <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; table-layout: fixed;">
              <thead>
                <tr>
                  <th style="width: 15%; background: #f59e0b; color: white; padding: 4px; text-align: left; font-size: 10px; font-weight: bold; border-right: 1px solid #000;">Code</th>
                  <th style="width: 65%; background: #f59e0b; color: white; padding: 4px; text-align: left; font-size: 10px; font-weight: bold; border-right: 1px solid #000;">Description</th>
                  <th style="width: 5%; background: #f59e0b; color: white; padding: 4px; text-align: center; font-size: 10px; font-weight: bold; border-right: 1px solid #000;">Unité</th>
                  <th style="width: 5%; background: #f59e0b; color: white; padding: 4px; text-align: center; font-size: 10px; font-weight: bold; border-right: 1px solid #000;">Qté Cmd</th>
                  <th style="width: 5%; background: #f59e0b; color: white; padding: 4px; text-align: center; font-size: 10px; font-weight: bold; border-right: 1px solid #000;">Qté Liv.</th>
                  <th style="width: 5%; background: #f59e0b; color: white; padding: 4px; text-align: center; font-size: 10px; font-weight: bold;">Qté Souff.</th>
                </tr>
              </thead>
              <tbody>
                ${pageItems.map(item => `
                  <tr style="height: 15px;">
                    <td style="padding: 3px; border-bottom: 1px solid #000; border-right: 1px solid #000; font-size: 11px; vertical-align: top; overflow: hidden;"><strong>${item.product_id}</strong></td>
                    <td style="padding: 3px; border-bottom: 1px solid #000; border-right: 1px solid #000; font-size: 11px; vertical-align: top; overflow: hidden;">
                      ${item.description}
                    </td>
                    <td style="padding: 3px; border-bottom: 1px solid #000; border-right: 1px solid #000; font-size: 11px; text-align: center; vertical-align: top;">${item.unit || 'UN'}</td>
                    <td style="padding: 3px; border-bottom: 1px solid #000; border-right: 1px solid #000; font-size: 11px; text-align: center; vertical-align: top;">${item.quantity}</td>
                    <td style="padding: 3px; border-bottom: 1px solid #000; border-right: 1px solid #000; font-size: 11px; text-align: center; vertical-align: top;"><strong>${item.quantity_to_deliver}</strong></td>
                    <td style="padding: 3px; border-bottom: 1px solid #000; font-size: 11px; text-align: center; vertical-align: top;">${Math.max(0, item.quantity - item.quantity_to_deliver)}</td>
                  </tr>
                `).join('')}
                
                ${Array.from({length: Math.max(0, ITEMS_PER_PAGE - pageItems.length)}, () => `
                  <tr style="height: 15px;">
                    <td style="padding: 3px; border-bottom: 1px solid #000; border-right: 1px solid #000;">&nbsp;</td>
                    <td style="padding: 3px; border-bottom: 1px solid #000; border-right: 1px solid #000;">&nbsp;</td>
                    <td style="padding: 3px; border-bottom: 1px solid #000; border-right: 1px solid #000;">&nbsp;</td>
                    <td style="padding: 3px; border-bottom: 1px solid #000; border-right: 1px solid #000;">&nbsp;</td>
                    <td style="padding: 3px; border-bottom: 1px solid #000; border-right: 1px solid #000;">&nbsp;</td>
                    <td style="padding: 3px; border-bottom: 1px solid #000;">&nbsp;</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <!-- FOOTER -->
          <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 1.4in; border-top: 1px solid #000; padding-top: 3px; background: white;">
            <div style="text-align: center; margin-bottom: 3px; padding: 3px; background: #f0f0f0; font-weight: bold; font-size: 12px; border: 1px solid #000; text-transform: uppercase;">
              ${copyType === 'CLIENT' ? 'COPIE CLIENT' : 'COPIE SERVICES TMT'}
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="text-align: center; flex: 1;">
                <div style="border-top: 1px solid #000; width: 200px; margin: 40px auto 2px auto;"></div>
                <div style="font-size: 10px; font-weight: bold;">SIGNATURE CLIENT</div>
              </div>
              
              <div style="flex: 2; padding: 0 5px; text-align: center; margin-top: 35px;">
                <div style="font-size: 10px; font-style: italic; line-height: 1.0; border: 1px solid #ccc; padding: 3px; border-radius: 2px; background: #f9f9f9;">
                  La marchandise demeure la propriété de Services TMT Inc. jusqu'au paiement complet.
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    };
    
    return pageGroups.map((pageItems, index) => 
      generateSinglePage(pageItems, index + 1, pageGroups.length)
    ).join('');
  };

  // Préparer les données des articles
  const allOrderItems = selectedItems.map(item => ({
    ...item,
    remaining_after_delivery: Math.max(0, item.quantity - item.quantity_to_deliver)
  }));

  const fullHTML = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>RÉIMPRESSION-${deliverySlip.delivery_number}.pdf</title>
      <style>
        @page { size: letter; margin: 0.25in; }
        body { font-family: Arial, sans-serif; margin: 0; padding: 10px; color: #000; font-size: 11px; line-height: 1.2; }
        .copy-container { margin: 0; padding: 0; }
        .copy-container:first-child { page-break-after: always; }
        .copy-container:last-child { page-break-after: avoid; }
        @media print {
          body { margin: 0; padding: 0; }
          .copy-container:last-child { page-break-after: never !important; }
          * { page-break-after: avoid !important; }
          .copy-container:first-child { page-break-after: always !important; }
        }
      </style>
    </head>
    <body>
      <div class="copy-container">${generateCopyContent('CLIENT', allOrderItems, false)}</div>
      <div class="copy-container">${generateCopyContent('STMT', allOrderItems, true)}</div>
    </body>
    </html>
  `;
  
  const printWindow = window.open('', '_blank');

if (!printWindow) {
  alert('Veuillez autoriser les popups pour cette application afin de générer le PDF.');
  return;
}

printWindow.document.write(fullHTML);
printWindow.document.close();

printWindow.onload = function() {
  setTimeout(() => {
    printWindow.print();
    setTimeout(() => printWindow.close(), 3000);
  }, 500);
};

setTimeout(() => {
  try {
    if (printWindow && !printWindow.closed) {
      printWindow.close();
    }
  } catch (error) {
    console.log('Fermeture forcée après 8 secondes');
  }
}, 8000);
};

  // Ouvrir le modal de livraison
  const openDeliveryModal = () => {
    if (items.length === 0) {
      setError('Ce bon d\'achat doit avoir au moins un article avant de pouvoir créer une livraison.');
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

  // Formater la taille des fichiers
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Fonctions pour l'édition mobile
  const startEditingItem = (index) => {
    setEditingItemIndex(index);
    setEditingItemData({...items[index]});
    setShowMobileItemEditor(true);
  };

  const saveMobileItemEdit = () => {
    if (editingItemIndex !== null) {
      updateItem(editingItemIndex, editingItemData);
    } else {
      // Nouvel article
      setItems([editingItemData, ...items]);
      // Recalculer le montant total
      const totalAmount = [...items, editingItemData].reduce((sum, item) => 
        sum + (parseFloat(item.quantity || 0) * parseFloat(item.selling_price || 0)), 0
      );
      setFormData(prev => ({ ...prev, amount: totalAmount }));
    }
    setShowMobileItemEditor(false);
    setEditingItemIndex(null);
    setEditingItemData(null);
  };

  const cancelMobileItemEdit = () => {
    setShowMobileItemEditor(false);
    setEditingItemIndex(null);
    setEditingItemData(null);
  };

  const startAddingNewItem = () => {
    setEditingItemIndex(null);
    setEditingItemData({
      id: 'new-' + Date.now(),
      product_id: '',
      description: '',
      quantity: 1,
      unit: 'unité',
      selling_price: 0,
      delivered_quantity: 0,
      from_manual: true
    });
    setShowMobileItemEditor(true);
  };

  if (!isOpen) return null;

  const deliveryStatus = getDeliveryStatus();

  // effectiveEditingPO: use stayOpenEditingPO if the BA was created with "Créer et laisser ouvert"
  const effectiveEditingPO = editingPO || stayOpenEditingPO;

  return (
    <>
      {/* Modal principal adapté mobile - or inline panel */}
      <div className={panelMode ? '' : 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-2 sm:p-4'}>
        <div className={panelMode ? 'bg-white dark:bg-gray-900 flex flex-col overflow-hidden h-full' : 'bg-white dark:bg-gray-900 rounded-xl w-full h-[98vh] sm:max-w-6xl sm:h-[95vh] flex flex-col overflow-hidden'}>
          {/* Header adapté mobile */}
          <div className={`bg-gradient-to-r from-blue-600 to-purple-600 text-white ${panelMode ? 'p-3' : 'p-4 sm:p-6'} flex-shrink-0`}>
            <div className="flex justify-between items-center dark:text-gray-100">
              <div>
                <h2 className={`${panelMode ? 'text-base' : 'text-lg sm:text-2xl'} font-bold`}>
                  {effectiveEditingPO ? `BA #${effectiveEditingPO.po_number || formData.po_number}` : 'Nouveau BA Client'}
                </h2>
                <p className="text-blue-100 mt-1 text-sm hidden sm:block">
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

          {/* Navigation par onglets - VERSION MOBILE OPTIMISÉE */}
          <div className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 overflow-x-auto">
            <nav className="flex space-x-0 min-w-max">
              <button
                onClick={() => setActiveTab('info')}
                className={`px-3 sm:px-6 py-3 sm:py-4 h-14 sm:h-16 border-b-2 font-medium text-xs sm:text-sm flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 whitespace-nowrap ${
                  activeTab === 'info'
                    ? 'border-blue-500 text-blue-600 bg-white dark:bg-gray-900'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <span>📋</span>
                <span>Info</span>
              </button>
              <button
                onClick={() => setActiveTab('articles')}
                className={`px-3 sm:px-6 py-3 sm:py-4 h-14 sm:h-16 border-b-2 font-medium text-xs sm:text-sm flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 whitespace-nowrap ${
                  activeTab === 'articles'
                    ? 'border-blue-500 text-blue-600 bg-white dark:bg-gray-900'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <span>📦</span>
                <span>Articles</span>
                {items.length > 0 && (
                  <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 text-xs px-1 sm:px-2 py-1 rounded-full">
                    {items.length}
                  </span>
                )}
              </button>
              {effectiveEditingPO && (
                <button
                  onClick={() => setActiveTab('livraisons')}
                  className={`px-3 sm:px-6 py-3 sm:py-4 h-14 sm:h-16 border-b-2 font-medium text-xs sm:text-sm flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 whitespace-nowrap ${
                    activeTab === 'livraisons'
                      ? 'border-blue-500 text-blue-600 bg-white dark:bg-gray-900'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <span>🚚</span>
                  <span>Livraisons</span>
                  {deliverySlips.length > 0 && (
                    <span className="bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 text-xs px-1 sm:px-2 py-1 rounded-full">
                      {deliverySlips.length}
                    </span>
                  )}
                </button>
              )}
              <button
                onClick={() => setActiveTab('documents')}
                className={`px-3 sm:px-6 py-3 sm:py-4 h-14 sm:h-16 border-b-2 font-medium text-xs sm:text-sm flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 whitespace-nowrap ${
                  activeTab === 'documents'
                    ? 'border-blue-500 text-blue-600 bg-white dark:bg-gray-900'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <span>📎</span>
                <span>Docs</span>
                {attachedFiles.length > 0 && (
                  <span className="bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 text-xs px-1 sm:px-2 py-1 rounded-full">
                    {attachedFiles.length}
                  </span>
                )}
              </button>
              {effectiveEditingPO && (items.length > 0 || supplierPurchases.length > 0) && (
                <button
                  onClick={() => setShowBCCModal(true)}
                  className="px-3 sm:px-6 py-3 sm:py-4 h-14 sm:h-16 border-b-2 font-medium text-xs sm:text-sm flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 whitespace-nowrap border-transparent text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                >
                  <span>📧</span>
                  <span>BCC</span>
                  {(formData.bcc_sent_count || 0) > 0 && (
                    <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 text-xs px-1 sm:px-2 py-0.5 rounded-full font-bold">
                      {formData.bcc_sent_count}
                    </span>
                  )}
                </button>
              )}
            </nav>
          </div>

          {/* Message d'erreur */}
          {error && (
            <div className="mx-4 sm:mx-6 mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded flex-shrink-0">
              {error}
            </div>
          )}

          {/* Alerte soumission existante */}
          {hasExistingSubmission && existingSubmissionData && (
            <div className="mx-4 sm:mx-6 mt-4 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 dark:border-yellow-600 p-4 flex-shrink-0">
              <div className="flex">
                <div className="flex-shrink-0">⚠️</div>
                <div className="ml-3">
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    <strong>Ce bon d'achat a déjà une soumission attribuée:</strong><br/>
                    Soumission #{existingSubmissionData.submission_number} - {existingSubmissionData.client_name}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Contenu des onglets */}
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto min-h-0 dark:bg-gray-900">
            
            {/* ONGLET INFORMATIONS */}
            {activeTab === 'info' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                  <h3 className="text-lg font-semibold dark:text-gray-100">Informations du Bon d'Achat</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={loadSubmissions}
                      disabled={hasExistingSubmission}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                    >
                      {hasExistingSubmission ? 'Soumission Attribuée' : 'Importer Soumission'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Client *
                    </label>
                    <select
                      value={formData.client_name}
                      onChange={(e) => {
                        const selectedClient = clients.find(c => c.name === e.target.value);
                        if (selectedClient) {
                          setFormData(prev => ({
                            ...prev,
                            client_name: selectedClient.name,
                            client_email: selectedClient.email || '',
                            client_phone: selectedClient.phone || '',
                            client_address: selectedClient.address || ''
                          }));
                        }
                      }}
                      className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:text-gray-100 ${
                        editingPO ? 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed' : 'dark:bg-gray-800'
                      }`}
                      required
                      disabled={!!editingPO}
                    >
                      <option value="">Sélectionner un client...</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.name}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      No. Bon Achat Client *
                    </label>
                    <input
                      type="text"
                      name="po_number"
                      value={formData.po_number}
                      onChange={(e) => setFormData(prev => ({ ...prev, po_number: e.target.value.toUpperCase() }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
                      placeholder="Ex: PO-2025-001"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      No Soumission
                    </label>
                    <input
                      type="text"
                      name="submission_no"
                      value={formData.submission_no}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-gray-100 dark:bg-gray-700 dark:text-gray-400"
                      placeholder="Sera rempli par import soumission"
                      readOnly
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Date *
                    </label>
                    <input
                      type="date"
                      name="date"
                      value={formData.date}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Montant <span className="text-xs text-gray-500">(modifiable manuellement)</span>
                    </label>
                    <input
                      type="number"
                      name="amount"
                      value={formData.amount}
                      onChange={handleChange}
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
                      placeholder="0.00"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Le montant peut être saisi manuellement ou calculé automatiquement depuis les articles
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Statut
                    </label>
                    <select
                      name="status"
                      value={formData.status}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
                    >
                      <option value="in_progress">🔵 En cours</option>
                      <option value="partial">🚚 Partiellement livré</option>
                      <option value="completed">✅ Complété</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Description du BA
                      </label>
                      <textarea
                        name="description"
                        value={formData.description}
                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value.toUpperCase() }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
                        placeholder="Description détaillée du bon d'achat..."
                        rows="3"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">                      
                        Notes complémentaires (optionnel)
                  </label>
                  <input
                    type="text"
                    name="special_instructions"
                    value={formData.special_instructions}
                    onChange={(e) => setFormData(prev => ({ ...prev, special_instructions: e.target.value.toUpperCase() }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
                    placeholder="Notes additionnelles, instructions spéciales..."
                  />
                </div>

                {/* Section client compactée */}
                {formData.client_name && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      <strong>Client:</strong> {formData.client_name}
                      {formData.client_email && <span> • {formData.client_email}</span>}
                      {formData.client_phone && <span> • {formData.client_phone}</span>}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ONGLET ARTICLES - VERSION MOBILE OPTIMISÉE */}
            {activeTab === 'articles' && (
              <div className="space-y-6">
                <div className="flex flex-col gap-4">
                  <h3 className="text-lg font-semibold dark:text-gray-100">
                    Articles du Bon d'Achat ({items.length})
                  </h3>
                  
                  {/* Boutons empilés sur mobile */}
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-2">
                    <button
                      onClick={loadSubmissions}
                      disabled={hasExistingSubmission}
                      className="bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center gap-2 text-sm"
                    >
                      <span>📋</span>
                      <span className="hidden sm:inline">Importer depuis</span>
                      <span>Soumission</span>
                    </button>
                    <button
                      onClick={openSupplierImportModal}
                      disabled={!formData.client_name}
                      className="bg-purple-600 text-white px-3 py-2 rounded-lg hover:bg-purple-700 disabled:bg-gray-400 flex items-center justify-center gap-2 text-sm"
                      title={!formData.client_name ? 'Sélectionnez d\'abord un client' : 'Importer depuis achats fournisseurs'}
                    >
                      <span>📋</span>
                      <span className="hidden sm:inline">Import</span>
                      <span>Fournisseur</span>
                    </button>
                    <button
                      onClick={addNewItem}
                      className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 flex items-center justify-center gap-2 text-sm"
                    >
                      <span>+</span>
                      <span>Ajouter</span>
                    </button>
                  </div>
                </div>

                {items.length === 0 ? (
                  <div className="text-center py-8 sm:py-12 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
                    <p className="text-gray-500 dark:text-gray-400 mb-4">Aucun article dans ce bon d'achat</p>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">Vous pouvez :</p>
                    <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 px-4">
                      <button
                        onClick={addNewItem}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm"
                      >
                        Ajouter manuellement
                      </button>
                      <button
                        onClick={loadSubmissions}
                        disabled={hasExistingSubmission}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 text-sm"
                      >
                        Import soumission
                      </button>
                      <button
                        onClick={openSupplierImportModal}
                        disabled={!formData.client_name}
                        className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:bg-gray-400 text-sm"
                      >
                        Import fournisseur
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* TABLE RESPONSIVE POUR MOBILE */}
                    <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
                      {/* Version mobile - Cards */}
                      <div className="block sm:hidden divide-y divide-gray-200 dark:divide-gray-700">
                        {items.map((item, index) => (
                          <div key={item.id || index} className="p-4 bg-white dark:bg-gray-900">
                            <div className="flex justify-between items-start mb-2">
                              <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">{item.product_id}</div>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => startEditingItem(index)}
                                  className="text-blue-600 hover:text-blue-800 text-xs px-2 py-1 border border-blue-300 rounded"
                                >
                                  ✏️
                                </button>
                                {(item.from_manual || item.from_supplier_purchase) && (
                                  <button
                                    onClick={() => deleteItem(index)}
                                    className="text-red-600 hover:text-red-800 text-xs px-2 py-1 border border-red-300 rounded"
                                  >
                                    🗑️
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">{item.description}</div>
                            <div className="grid grid-cols-2 gap-2 text-sm dark:text-gray-300">
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">Qté:</span>
                                <span className="ml-1 font-medium">{item.quantity}</span>
                              </div>
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">Prix:</span>
                                <span className="ml-1 font-medium">${parseFloat(item.selling_price || 0).toFixed(2)}</span>
                              </div>
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">Livré:</span>
                                <span className="ml-1 font-medium">{item.delivered_quantity || 0}</span>
                              </div>
                              <div>
                                <span className="text-gray-500 dark:text-gray-400">Total:</span>
                                <span className="ml-1 font-bold text-green-600">
                                  ${(parseFloat(item.quantity || 0) * parseFloat(item.selling_price || 0)).toFixed(2)}
                                </span>
                              </div>
                            </div>
                            {item.from_manual && (
                              <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">Article ajouté manuellement</div>
                            )}
                            {item.from_supplier_purchase && (
                              <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                                Importé depuis achat #{item.supplier_purchase_number}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Version desktop - Table normale */}
                      <table className="w-full hidden sm:table">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                          <tr>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Code</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Description</th>
                            <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Qté</th>
                            <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">UM</th>
                            <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Prix</th>
                            <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Livré</th>
                            <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total</th>
                            <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-16">Act.</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {items.map((item, index) => (
                            <ItemRow
                              key={item.id || index}
                              item={item}
                              onUpdate={(updatedItem) => updateItem(index, updatedItem)}
                              onDelete={() => deleteItem(index)}
                            />
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50 dark:bg-gray-800">
                          <tr>
                            <td colSpan="6" className="px-4 py-3 text-right font-semibold dark:text-gray-300">
                              Total:
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-lg dark:text-gray-100">
                              ${items.reduce((sum, item) => sum + (parseFloat(item.quantity || 0) * parseFloat(item.selling_price || 0)), 0).toFixed(2)}
                            </td>
                            <td className="px-4 py-3"></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Total visible sur mobile */}
                    <div className="block sm:hidden bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                      <div className="flex justify-between items-center dark:text-gray-100">
                        <span className="font-semibold text-gray-700 dark:text-gray-300">Total général:</span>
                        <span className="font-bold text-lg text-green-600">
                          ${items.reduce((sum, item) => sum + (parseFloat(item.quantity || 0) * parseFloat(item.selling_price || 0)), 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ONGLET LIVRAISONS */}
            {activeTab === 'livraisons' && effectiveEditingPO && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                  <h3 className="text-lg font-semibold dark:text-gray-100">
                    Livraisons ({deliverySlips.length})
                  </h3>
                  <div className="flex items-center gap-4">
                    <div className={'px-3 py-1 rounded-full text-sm font-medium ' + (
                      deliveryStatus === 'completed' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
                      deliveryStatus === 'partial' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300' :
                      'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                    )}>
                      {deliveryStatus === 'completed' && 'Livraison Complète'}
                      {deliveryStatus === 'partial' && 'Livraison Partielle'}
                      {deliveryStatus === 'not_started' && 'Non Commencé'}
                    </div>
                    <button
                      onClick={openDeliveryModal}
                      disabled={items.length === 0}  // Seulement vérifier qu'il y a des articles
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                    >
                      🚚 Nouvelle Livraison
                    </button>           
                  </div>
                </div>

                {deliverySlips.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-500 dark:text-gray-400 mb-4">Aucune livraison créée</p>
                    <p className="text-sm text-gray-400 dark:text-gray-500">Créez votre première livraison pour ce bon d'achat</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {deliverySlips.map((slip) => (
                      <div key={slip.id} className="border dark:border-gray-700 rounded-lg p-4 dark:bg-gray-800">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-semibold text-lg dark:text-gray-100">{slip.delivery_number}</h4>
                            <p className="text-gray-600 dark:text-gray-400">Date: {new Date(slip.delivery_date).toLocaleDateString()}</p>
                            {slip.transport_company && (
                              <p className="text-sm text-gray-500 dark:text-gray-400">Transport: {slip.transport_company}</p>
                            )}
                            {slip.tracking_number && (
                              <p className="text-sm text-gray-500 dark:text-gray-400">Suivi: {slip.tracking_number}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={'px-2 py-1 rounded-full text-xs font-semibold ' + (
                              slip.status === 'delivered' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
                              slip.status === 'in_transit' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300' :
                              'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
                            )}>
                              {slip.status}
                            </span>
                            
                            <button
                              onClick={() => reprintDeliverySlip(slip)}
                              className="bg-gray-600 text-white px-3 py-1 rounded text-sm hover:bg-gray-700"
                              title="Réimprimer ce bon de livraison"
                            >
                              Réimprimer
                            </button>
                          </div>
                        </div>
                        
                        {slip.delivery_slip_items && slip.delivery_slip_items.length > 0 && (
                          <div className="mt-4">
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Articles livrés ({slip.delivery_slip_items.length}):
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {slip.delivery_slip_items.map((item, index) => (
                                <div key={index} className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 rounded p-2">
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

            {/* ONGLET DOCUMENTS & ACHATS */}
            {activeTab === 'documents' && (
              <div className="space-y-8">
                
                {/* Section Documents */}
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                    <h3 className="text-lg font-semibold dark:text-gray-100">Documents Joints ({attachedFiles.length})</h3>
                    <div className="flex items-center gap-4">
                      <input
                        type="file"
                        id="fileUpload"
                        multiple
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <label
                        htmlFor="fileUpload"
                        className={'bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 cursor-pointer flex items-center gap-2 text-sm ' + (
                          isUploadingFiles ? 'opacity-50 cursor-not-allowed' : ''
                        )}
                      >
                        📎 Choisir Fichiers
                      </label>
                    </div>
                  </div>

                  {/* Progress bar pour upload */}
                  {isUploadingFiles && (
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: uploadProgress + '%' }}
                      ></div>
                    </div>
                  )}

                  {/* Types de fichiers acceptés */}
                  <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-2 rounded">
                    <strong>Types acceptés:</strong> PDF, DOC, DOCX, XLS, XLSX, CSV, PNG, JPG (Max: 10MB par fichier)           ''Voir = Tablette, Télécharger = Ordinateur''
                  </div>

                  {/* Section BCC envoyés */}
                  {attachedFiles.filter(f => f.is_bcc).length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-2 flex items-center gap-2">
                        📧 Confirmations de Commande (BCC) envoyées
                      </h4>
                      <div className="grid gap-2">
                        {attachedFiles.filter(f => f.is_bcc).map((file) => (
                          <div key={file.id} className="border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="flex-shrink-0 bg-emerald-100 dark:bg-emerald-900/40 w-8 h-8 rounded-full flex items-center justify-center text-sm">📧</div>
                              <div>
                                <p className="font-medium text-emerald-900 dark:text-emerald-200">{file.name}</p>
                                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                                  {new Date(file.bcc_date || file.uploadDate).toLocaleDateString('fr-CA', {
                                    timeZone: 'America/Toronto', day: 'numeric', month: 'short', year: 'numeric',
                                    hour: '2-digit', minute: '2-digit'
                                  })}
                                  {file.bcc_items_count && ` • ${file.bcc_items_count} article(s)`}
                                  {file.bcc_total && ` • $${parseFloat(file.bcc_total).toFixed(2)}`}
                                </p>
                                {file.bcc_recipients && (
                                  <p className="text-xs text-emerald-600 dark:text-emerald-500 truncate max-w-[300px]" title={file.bcc_recipients.join(', ')}>
                                    Envoyé à: {file.bcc_recipients.join(', ')}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => viewFile(file)}
                                className="text-emerald-600 hover:text-emerald-800 px-3 py-1 border border-emerald-300 rounded text-sm md:hidden"
                                title="Voir"
                              >
                                Voir
                              </button>
                              <button
                                onClick={() => downloadFile(file)}
                                className="text-emerald-600 hover:text-emerald-800 px-3 py-1 border border-emerald-300 rounded text-sm"
                                title="Télécharger"
                              >
                                Télécharger
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Liste des documents manuels */}
                  {attachedFiles.filter(f => !f.is_bcc).length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
                      <p className="text-gray-500 dark:text-gray-400 mb-2">Aucun document joint</p>
                      <p className="text-sm text-gray-400 dark:text-gray-500">Glissez des fichiers ici ou cliquez sur "Choisir Fichiers"</p>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {attachedFiles.filter(f => !f.is_bcc).map((file) => (
                        <div key={file.id} className="border dark:border-gray-700 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900">
                          <div className="flex items-center gap-3">
                            <div className="flex-shrink-0">
                              {file.type.includes('pdf') ? '📄' :
                               file.type.includes('excel') || file.type.includes('sheet') ? '📊' :
                               file.type.includes('word') || file.type.includes('doc') ? '📝' :
                               file.type.includes('image') ? '🖼️' : '📎'}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 dark:text-gray-100">{file.name}</p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {formatFileSize(file.size)} • Ajouté le {new Date(file.uploadDate).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => viewFile(file)}
                              className="text-blue-600 hover:text-blue-800 px-3 py-1 border border-blue-300 rounded text-sm md:hidden"
                              title="Voir"
                            >
                              Voir
                            </button>
                            <button
                              onClick={() => downloadFile(file)}
                              className="text-green-600 hover:text-green-800 px-3 py-1 border border-green-300 rounded text-sm"
                              title="Télécharger"
                            >
                              Télécharger
                            </button>
                            <button
                              onClick={() => deleteFile(file.id)}
                              className="text-red-600 hover:text-red-800 px-3 py-1 border border-red-300 rounded text-sm"
                              title="Supprimer"
                            >
                              Supprimer
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Section Achats Fournisseurs */}
                <div className="space-y-4 border-t pt-6">
                  <h3 className="text-lg font-semibold dark:text-gray-100">Achats Fournisseurs Liés ({supplierPurchases.length})</h3>
                  
                  {supplierPurchases.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg border dark:border-gray-700">
                      <p className="text-gray-500 dark:text-gray-400">Aucun achat fournisseur lié à ce BA</p>
                      <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                        Les achats fournisseurs apparaîtront ici automatiquement s'ils sont liés à ce bon d'achat
                      </p>
                    </div>
                  ) : (
                    <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">N° Achat</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Fournisseur</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Montant</th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Statut</th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {supplierPurchases.map((purchase) => (
                              <tr key={purchase.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900">
                                <td className="px-4 py-3">
                                  <div className="font-medium text-gray-900 dark:text-gray-100">{purchase.purchase_number}</div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="text-gray-900 dark:text-gray-100">{purchase.supplier_name}</div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="font-medium text-green-600">
                                    ${parseFloat(purchase.total_amount || 0).toFixed(2)}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <div className="text-sm text-gray-600 dark:text-gray-400">
                                    {new Date(purchase.created_at).toLocaleDateString()}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className={'px-2 py-1 rounded-full text-xs font-semibold ' + (
                                    purchase.status === 'completed' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
                                    purchase.status === 'pending' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300' :
                                    'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                                  )}>
                                    {purchase.status}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <button
                                    onClick={() => visualizeSupplierPurchase(purchase)}
                                    className="text-blue-600 hover:text-blue-800 px-3 py-1 border border-blue-300 rounded text-sm"
                                  >
                                    Voir
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* Footer adapté mobile */}
          <div className="bg-gray-50 dark:bg-gray-800 px-4 sm:px-6 py-4 border-t dark:border-gray-700 flex-shrink-0">
            {/* Informations sur une ligne séparée sur mobile */}
            <div className="text-sm text-gray-600 dark:text-gray-400 text-center mb-3 sm:mb-0 sm:hidden">
              {items.length > 0 && (
                <span className="block">
                  Total: ${items.reduce((sum, item) => sum + (parseFloat(item.quantity || 0) * parseFloat(item.selling_price || 0)), 0).toFixed(2)}
                </span>
              )}
              {attachedFiles.length > 0 && (
                <span className="block">
                  {attachedFiles.length} document(s)
                </span>
              )}
            </div>

            {/* Boutons tous ensemble sur mobile */}
            <div className="flex flex-row justify-between items-center gap-2 sm:gap-4">
              {/* Informations desktop à gauche */}
              <div className="hidden sm:block text-sm text-gray-600 dark:text-gray-400">
                {items.length > 0 && (
                  <span>
                    Total: ${items.reduce((sum, item) => sum + (parseFloat(item.quantity || 0) * parseFloat(item.selling_price || 0)), 0).toFixed(2)}
                  </span>
                )}
                {attachedFiles.length > 0 && (
                  <span className={items.length > 0 ? "ml-4" : ""}>
                    {attachedFiles.length} document(s)
                  </span>
                )}
              </div>

              {/* Tous les boutons regroupés */}
              <div className="flex gap-2 flex-1 sm:flex-initial justify-end">
                {effectiveEditingPO && (
                  <button
                    onClick={deletePurchaseOrder}
                    disabled={isLoading}
                    className="px-3 sm:px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm"
                  >
                    <span>🗑️</span>
                    <span className="hidden sm:inline">Supprimer BA</span>
                    <span className="sm:hidden">Suppr.</span>
                  </button>
                )}
                
                <button
                  onClick={onClose}
                  className="px-3 sm:px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-xs sm:text-sm"
                >
                  Fermer
                </button>
                
                {/* Bouton "Créer et laisser ouvert" - seulement en mode création */}
                {!effectiveEditingPO && (
                  <button
                    onClick={() => savePurchaseOrder(true)}
                    disabled={isLoading || !formData.client_name || !formData.po_number}
                    className="px-3 sm:px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 text-xs sm:text-sm whitespace-nowrap"
                    title="Sauvegarder le BA et garder le formulaire ouvert pour composer le BCC"
                  >
                    {isLoading ? '...' : 'Créer et laisser ouvert'}
                  </button>
                )}

                <button
                  onClick={() => savePurchaseOrder(false)}
                  disabled={isLoading || !formData.client_name || !formData.po_number}
                  className="px-3 sm:px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 text-xs sm:text-sm"
                >
                  {isLoading ? 'Sauvegarde...' : (effectiveEditingPO ? 'Mettre à jour' : 'Créer BA')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal import soumissions */}
      {showSubmissionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="bg-blue-600 text-white px-6 py-4 flex justify-between items-center">
              <h3 className="text-xl font-semibold">Sélectionner une Soumission</h3>
              <button
                onClick={() => setShowSubmissionModal(false)}
                className="text-white hover:bg-white/20 rounded-lg p-2"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)] dark:bg-gray-900">
              {submissions.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">Aucune soumission disponible</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                    Seules les soumissions acceptées et non liées sont affichées
                  </p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {submissions.map((submission) => (
                    <div key={submission.id} className="border dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold dark:text-gray-100">#{submission.submission_number || submission.id}</h4>
                          <p className="text-gray-600 dark:text-gray-400">{submission.client_name}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{submission.description}</p>
                          <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
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

      {/* Modal import depuis achats fournisseurs */}
      {showSupplierImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg w-full h-[95vh] sm:max-w-6xl sm:h-[90vh] overflow-hidden">
            <div className="bg-purple-600 text-white px-4 sm:px-6 py-4 flex justify-between items-center">
              <h3 className="text-lg sm:text-xl font-semibold">Import Achats Fournisseurs - {formData.client_name}</h3>
              <button
                onClick={() => {
                  setShowSupplierImportModal(false);
                  setSelectedPurchaseForImport(null);
                  setSelectedItemsForImport([]);
                }}
                className="text-white hover:bg-white/20 rounded-lg p-2"
              >
                ✕
              </button>
            </div>
            
            <div className="flex flex-col sm:flex-row h-[calc(95vh-200px)] sm:h-[calc(90vh-200px)]">
              {/* Liste des achats fournisseurs */}
              <div className="w-full sm:w-1/3 border-r dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4 overflow-y-auto">
                <h4 className="font-semibold mb-4 dark:text-gray-100">Achats Fournisseurs Disponibles</h4>
                
                {isLoadingSupplierPurchases ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-2"></div>
                    <p className="text-gray-500 dark:text-gray-400">Chargement...</p>
                  </div>
                ) : clientSupplierPurchases.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500 dark:text-gray-400">Aucun achat fournisseur trouvé</p>
                    <p className="text-sm text-gray-400 mt-1">
                      Aucun achat fournisseur avec articles disponible pour ce client
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {clientSupplierPurchases.map((purchase) => (
                      <div
                        key={purchase.id}
                        onClick={() => selectPurchaseForImport(purchase)}
                        className={`border rounded-lg p-3 cursor-pointer transition-all ${
                          selectedPurchaseForImport?.id === purchase.id
                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:bg-gray-900 dark:hover:border-gray-600'
                        }`}
                      >
                        <div className="font-semibold text-sm dark:text-gray-100">#{purchase.purchase_number}</div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">{purchase.supplier_name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {purchase.items?.length || 0} articles • ${parseFloat(purchase.total_amount || 0).toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-400 dark:text-gray-500">
                          {new Date(purchase.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Détail des articles */}
              <div className="flex-1 p-4 overflow-y-auto dark:bg-gray-900">
                {!selectedPurchaseForImport ? (
                  <div className="text-center py-16 dark:bg-gray-900">
                    <p className="text-gray-500 dark:text-gray-400">Sélectionnez un achat fournisseur pour voir les articles</p>
                  </div>
                ) : (
                  <div>
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4">
                      <h4 className="font-semibold dark:text-gray-100">
                        Articles de #{selectedPurchaseForImport.purchase_number}
                      </h4>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedItemsForImport.length === selectedPurchaseForImport.items.length}
                            onChange={toggleAllItemsSelection}
                            className="rounded"
                          />
                          Tout sélectionner
                        </label>
                        <span className="text-sm text-gray-500">
                          {selectedItemsForImport.length}/{selectedPurchaseForImport.items?.length || 0} sélectionnés
                        </span>
                      </div>
                    </div>

                    <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                              <th className="px-3 py-2 text-left w-10 dark:text-gray-400">✓</th>
                              <th className="px-3 py-2 text-left dark:text-gray-400">Code</th>
                              <th className="px-3 py-2 text-left dark:text-gray-400">Description</th>
                              <th className="px-3 py-2 text-center dark:text-gray-400">Qté</th>
                              <th className="px-3 py-2 text-center dark:text-gray-400">Prix Unit.</th>
                              <th className="px-3 py-2 text-right dark:text-gray-400">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {(selectedPurchaseForImport.items || []).map((item, index) => {
                              const quantity = parseFloat(item.quantity || item.qty || 1);
                              const unitPrice = parseFloat(item.cost_price || item.price || item.unit_price || 0);
                              const lineTotal = quantity * unitPrice;
                              
                              return (
                                <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900">
                                  <td className="px-3 py-2">
                                    <input
                                      type="checkbox"
                                      checked={selectedItemsForImport.includes(index)}
                                      onChange={() => toggleItemSelection(index)}
                                      className="rounded"
                                    />
                                  </td>
                                  <td className="px-3 py-2 font-medium dark:text-gray-100">
                                    {item.product_id || item.code || item.sku || '-'}
                                  </td>
                                  <td className="px-3 py-2 dark:text-gray-300">
                                    {item.description || item.name || item.product_name || '-'}
                                  </td>
                                  <td className="px-3 py-2 text-center dark:text-gray-300">{quantity}</td>
                                  <td className="px-3 py-2 text-center dark:text-gray-300">${unitPrice.toFixed(2)}</td>
                                  <td className="px-3 py-2 text-right font-medium dark:text-gray-100">${lineTotal.toFixed(2)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {selectedItemsForImport.length > 0 && (
                      <div className="mt-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
                        <p className="text-sm text-purple-700 dark:text-purple-300">
                          <strong>{selectedItemsForImport.length} articles sélectionnés</strong> pour import
                        </p>
                        <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                          Total estimé: ${selectedItemsForImport.reduce((sum, itemIndex) => {
                            const item = selectedPurchaseForImport.items[itemIndex];
                            const quantity = parseFloat(item.quantity || item.qty || 1);
                            const unitPrice = parseFloat(item.cost_price || item.price || item.unit_price || 0);
                            return sum + (quantity * unitPrice);
                          }, 0).toFixed(2)}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer du modal */}
            <div className="bg-gray-50 dark:bg-gray-800 px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 border-t dark:border-gray-700">
              <div></div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowSupplierImportModal(false);
                    setSelectedPurchaseForImport(null);
                    setSelectedItemsForImport([]);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-sm"
                >
                  Annuler
                </button>
                <button
                  onClick={importSelectedItems}
                  disabled={selectedItemsForImport.length === 0}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
                >
                  Importer {selectedItemsForImport.length} article(s)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal visualisation achat fournisseur */}
      {showSupplierPurchaseModal && selectedSupplierPurchase && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg w-full h-[95vh] sm:max-w-4xl sm:h-[90vh] overflow-hidden">
            {/* Header du modal */}
            <div className="bg-white dark:bg-gray-900 px-4 sm:px-6 py-4 flex justify-between items-center border-b dark:border-gray-700">
              <h3 className="text-lg sm:text-xl font-semibold dark:text-gray-100">Achat Fournisseur {selectedSupplierPurchase.purchase_number}</h3>
              <button
                onClick={() => setShowSupplierPurchaseModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ✕
              </button>
            </div>
            
            {/* Contenu du modal - Format d'impression */}
            <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(95vh-120px)] sm:max-h-[calc(90vh-120px)] dark:bg-gray-900">
              <div className="max-w-3xl mx-auto bg-white dark:bg-gray-900">
                {/* En-tête du document */}
                <div className="text-center mb-6 dark:text-gray-100">
                  <h1 className="text-xl sm:text-2xl font-bold mb-4 dark:text-gray-100">ACHAT FOURNISSEUR</h1>
                  <h2 className="text-lg sm:text-xl font-semibold dark:text-gray-100">N°: {selectedSupplierPurchase.purchase_number}</h2>
                  <p className="mt-2 dark:text-gray-300">Date: {new Date(selectedSupplierPurchase.created_at).toLocaleDateString()}</p>
                </div>
                
                <hr className="my-6 border-black dark:border-gray-600" />
                
                {/* Informations principales */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-6">
                  <div>
                    <h3 className="font-bold text-lg mb-2 dark:text-gray-100">FOURNISSEUR:</h3>
                    <p className="text-lg dark:text-gray-300">{selectedSupplierPurchase.supplier_name}</p>
                  </div>
                  
                  <div className="space-y-2 dark:text-gray-300">
                    <p><strong>Date création:</strong> {new Date(selectedSupplierPurchase.created_at).toLocaleDateString()}</p>
                    {selectedSupplierPurchase.delivery_date && (
                      <p><strong>Date livraison:</strong> {new Date(selectedSupplierPurchase.delivery_date).toLocaleDateString()}</p>
                    )}
                    <p><strong>Statut:</strong> {selectedSupplierPurchase.status}</p>
                  </div>
                </div>
                
                {/* Lien avec bon d'achat client */}
                {selectedSupplierPurchase.linked_po_number && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg mb-6">
                    <h3 className="font-bold text-lg mb-2 flex items-center gap-2 dark:text-blue-300">
                      🔗 LIEN AVEC BON D'ACHAT CLIENT:
                    </h3>
                    <p><strong>N° Bon d'achat:</strong> {selectedSupplierPurchase.linked_po_number}</p>
                    <p className="italic text-sm mt-1 dark:text-blue-400">Cet achat fournisseur est lié au bon d'achat client ci-dessus</p>
                  </div>
                )}
                
                {/* Détail des articles */}
                <div className="mb-6">
                  <h3 className="font-bold text-lg mb-4 dark:text-gray-100">DÉTAIL DES ARTICLES:</h3>
                  
                  {selectedSupplierPurchase.items && selectedSupplierPurchase.items.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border border-gray-300 dark:border-gray-700">
                        <thead>
                          <tr className="bg-gray-100 dark:bg-gray-800">
                            <th className="border border-gray-300 dark:border-gray-700 px-2 sm:px-3 py-2 text-left text-xs sm:text-sm dark:text-gray-300">Code</th>
                            <th className="border border-gray-300 dark:border-gray-700 px-2 sm:px-3 py-2 text-left text-xs sm:text-sm dark:text-gray-300">Description</th>
                            <th className="border border-gray-300 dark:border-gray-700 px-2 sm:px-3 py-2 text-center text-xs sm:text-sm dark:text-gray-300">Qté</th>
                            <th className="border border-gray-300 dark:border-gray-700 px-2 sm:px-3 py-2 text-center text-xs sm:text-sm dark:text-gray-300">Unité</th>
                            <th className="border border-gray-300 dark:border-gray-700 px-2 sm:px-3 py-2 text-center text-xs sm:text-sm dark:text-gray-300">Prix Unit.</th>
                            <th className="border border-gray-300 dark:border-gray-700 px-2 sm:px-3 py-2 text-center text-xs sm:text-sm dark:text-gray-300">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedSupplierPurchase.items.map((item, index) => {
                            const quantity = parseFloat(item.quantity || item.qty || 1);
                            const unitPrice = parseFloat(item.cost_price || item.price || item.unit_price || 0);
                            const lineTotal = quantity * unitPrice;
                            
                            return (
                              <tr key={index}>
                                <td className="border border-gray-300 dark:border-gray-700 px-2 sm:px-3 py-2 text-xs sm:text-sm dark:text-gray-300">{item.product_id || item.code || item.sku || '-'}</td>
                                <td className="border border-gray-300 dark:border-gray-700 px-2 sm:px-3 py-2 text-xs sm:text-sm dark:text-gray-300">
                                  <div>{item.description || item.name || item.product_name || '-'}</div>
                                  {item.notes && (
                                    <div className="text-xs text-blue-600 dark:text-blue-400 italic mt-1">📝 {item.notes}</div>
                                  )}
                                </td>
                                <td className="border border-gray-300 dark:border-gray-700 px-2 sm:px-3 py-2 text-center font-medium text-xs sm:text-sm dark:text-gray-300">{quantity}</td>
                                <td className="border border-gray-300 dark:border-gray-700 px-2 sm:px-3 py-2 text-center text-xs sm:text-sm dark:text-gray-300">{item.unit || item.unity || 'UN'}</td>
                                <td className="border border-gray-300 dark:border-gray-700 px-2 sm:px-3 py-2 text-center font-medium text-xs sm:text-sm dark:text-gray-300">${unitPrice.toFixed(2)}</td>
                                <td className="border border-gray-300 dark:border-gray-700 px-2 sm:px-3 py-2 text-center font-bold text-green-600 dark:text-green-400 text-xs sm:text-sm">${lineTotal.toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-gray-500 dark:text-gray-400 italic">Aucun détail d'article disponible</p>
                  )}
                </div>
                
                {/* Totaux */}
                <div className="border-t-2 border-black dark:border-gray-600 pt-4">
                  <div className="flex justify-end">
                    <div className="w-full sm:w-64 dark:text-gray-300">
                      <div className="flex justify-between py-1 text-sm">
                        <span className="font-semibold dark:text-gray-200">Sous-total:</span>
                        <span className="font-semibold">${parseFloat(selectedSupplierPurchase.subtotal || 0).toFixed(2)}</span>
                      </div>
                      {parseFloat(selectedSupplierPurchase.taxes || 0) > 0 && (
                        <div className="flex justify-between py-1 text-sm">
                          <span>Taxes:</span>
                          <span>${parseFloat(selectedSupplierPurchase.taxes || 0).toFixed(2)}</span>
                        </div>
                      )}
                      {parseFloat(selectedSupplierPurchase.shipping_cost || 0) > 0 && (
                        <div className="flex justify-between py-1 text-sm">
                          <span>Livraison:</span>
                          <span>${parseFloat(selectedSupplierPurchase.shipping_cost || 0).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between py-2 border-t border-gray-300 dark:border-gray-600 font-bold text-base sm:text-lg dark:text-gray-100">
                        <span>TOTAL GÉNÉRAL:</span>
                        <span>${parseFloat(selectedSupplierPurchase.total_amount || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Notes si présentes */}
                {selectedSupplierPurchase.notes && (
                  <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded">
                    <h4 className="font-semibold mb-2 dark:text-gray-200">Notes:</h4>
                    <p className="text-sm dark:text-gray-400">{selectedSupplierPurchase.notes}</p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Footer avec bouton imprimer */}
            <div className="bg-gray-50 dark:bg-gray-800 px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 border-t dark:border-gray-700">
              <div></div>
              <div className="flex gap-3">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                >
                  Imprimer
                </button>
                <button
                  onClick={() => setShowSupplierPurchaseModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-sm"
                >
                  Fermer
                </button>
              </div>
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
            if (effectiveEditingPO) {
              loadPOData(effectiveEditingPO.id);
            }
          }}
          purchaseOrder={effectiveEditingPO}
          onRefresh={() => {
            if (onRefresh) onRefresh();
            if (effectiveEditingPO) {
              loadPOData(effectiveEditingPO.id);
            }
          }}
        />
      )}

      {/* Modal d'édition mobile */}
      {showMobileItemEditor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg w-full max-w-md max-h-[90vh] overflow-hidden">
            <div className="bg-blue-600 text-white px-4 py-3 flex justify-between items-center">
              <h3 className="text-lg font-semibold">
                {editingItemIndex !== null ? 'Modifier Article' : 'Nouvel Article'}
              </h3>
              <button
                onClick={cancelMobileItemEdit}
                className="text-white hover:bg-white/20 rounded p-1"
              >
                ✕
              </button>
            </div>
            
            <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(90vh-120px)] dark:bg-gray-900">
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Code Produit * (recherche disponible)
                </label>
                <input
                  type="text"
                  value={editingItemData?.product_id || ''}
                  onChange={(e) => {
                    setEditingItemData(prev => ({...prev, product_id: e.target.value}));
                    // Déclencher la recherche si plus de 2 caractères
                    if (e.target.value.length >= 2) {
                      searchProductsForMobile(e.target.value);
                    } else {
                      setMobileSearchResults([]);
                    }
                  }}
                  placeholder="Ex: PROD-001 ou tapez pour chercher..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
                />
                
                {/* Suggestions de recherche */}
                {mobileSearchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-b shadow-lg z-10 max-h-48 overflow-y-auto">
                    {mobileSearchResults.map((product) => (
                      <div
                        key={product.id}
                        onClick={() => {
                          setEditingItemData(prev => ({
                            ...prev,
                            product_id: product.product_id,
                            description: product.description || product.name || '',
                            selling_price: parseFloat(product.selling_price || product.price || 0),
                            unit: product.unit || 'unité'
                          }));
                          setMobileSearchResults([]);
                        }}
                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100"
                      >
                        <div className="font-medium text-sm dark:text-gray-100">{product.product_id}</div>
                        <div className="text-xs text-gray-600 dark:text-gray-400 truncate">
                          {product.description || product.name}
                        </div>
                        <div className="text-xs text-green-600 dark:text-green-400">
                          ${parseFloat(product.selling_price || product.price || 0).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description *
                </label>
                <textarea
                  value={editingItemData?.description || ''}
                  onChange={(e) => setEditingItemData(prev => ({...prev, description: e.target.value}))}
                  placeholder="Description de l'article"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
                  rows="3"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Quantité *
                  </label>
                  <input
                    type="number"
                    value={editingItemData?.quantity || ''}
                    onChange={(e) => setEditingItemData(prev => ({...prev, quantity: parseFloat(e.target.value) || 0}))}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
                    step="0.01"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Unité
                  </label>
                  <select
                    value={editingItemData?.unit || 'unité'}
                    onChange={(e) => setEditingItemData(prev => ({...prev, unit: e.target.value}))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
                  >
                    <option value="unité">UN</option>
                    <option value="mètre">M</option>
                    <option value="pied">FT</option>
                    <option value="kilogramme">KG</option>
                    <option value="litre">L</option>
                    <option value="heure">H</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Prix Unitaire *
                </label>
                <input
                  type="number"
                  value={editingItemData?.selling_price || ''}
                  onChange={(e) => setEditingItemData(prev => ({...prev, selling_price: parseFloat(e.target.value) || 0}))}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
                  step="0.01"
                />
              </div>
              
              {/* Affichage du total calculé */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <div className="flex justify-between items-center dark:text-gray-100">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total ligne :</span>
                  <span className="text-lg font-bold text-green-600">
                    ${((editingItemData?.quantity || 0) * (editingItemData?.selling_price || 0)).toFixed(2)}
                  </span>
                </div>
              </div>
              
              {/* Bouton supprimer pour les articles modifiables */}
              {editingItemIndex !== null && (
                <div className="pt-4 border-t dark:border-gray-700">
                  <button
                    onClick={() => {
                      if (window.confirm('Êtes-vous sûr de vouloir supprimer cet article ?')) {
                        deleteItem(editingItemIndex);
                        cancelMobileItemEdit();
                      }
                    }}
                    className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center justify-center gap-2"
                  >
                    🗑️ Supprimer l'article
                  </button>
                </div>
              )}
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 flex justify-between items-center border-t dark:border-gray-700">
              <button
                onClick={cancelMobileItemEdit}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-sm"
              >
                Annuler
              </button>
              <button
                onClick={saveMobileItemEdit}
                disabled={!editingItemData?.product_id || !editingItemData?.description}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
              >
                {editingItemIndex !== null ? 'Modifier' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal BCC - Confirmation de Commande */}
      {showBCCModal && effectiveEditingPO && (
        <BCCConfirmationModal
          isOpen={showBCCModal}
          onClose={() => setShowBCCModal(false)}
          purchaseOrder={{ ...formData, id: effectiveEditingPO.id }}
          items={items}
          supplierPurchases={supplierPurchases}
          onBCCSent={() => {
            // Rafraîchir les données du BA pour mettre à jour le compteur BCC et les fichiers
            loadPOData(effectiveEditingPO.id);
          }}
        />
      )}
    </>
  );
};

export default PurchaseOrderModal;
