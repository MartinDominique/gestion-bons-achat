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
    }
  }, [isOpen, editingPO]);

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

  const downloadFile = (file) => {
    if (file.data && file.data.startsWith('data:')) {
      // Télécharger depuis base64
      const link = document.createElement('a');
      link.href = file.data;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (file.url) {
      // Télécharger depuis URL
      window.open(file.url, '_blank');
    }
  };

  const viewFile = (file) => {
    if (file.data && file.data.startsWith('data:')) {
      // Convertir base64 en Blob pour un meilleur support navigateur
      try {
        // Extraire le type MIME et les données base64
        const [header, base64Data] = file.data.split(',');
        const mimeMatch = header.match(/data:([^;]+)/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
        
        // Convertir base64 en array de bytes
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        
        // Créer le Blob et l'URL
        const blob = new Blob([byteArray], { type: mimeType });
        const blobUrl = URL.createObjectURL(blob);
        
        // Ouvrir dans un nouvel onglet
        window.open(blobUrl, '_blank');
        
        // Nettoyer l'URL après un délai
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      } catch (error) {
        console.error('Erreur affichage fichier:', error);
        downloadFile(file);
      }
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
      setItems([...items, newItem]);
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
        <tr className="bg-yellow-50">
          <td className="px-2 py-2 relative">
            <input
              type="text"
              value={searchTerm || localItem.product_id}
              onChange={(e) => handleProductIdChange(e.target.value)}
              onFocus={() => {
                if (searchResults.length > 0) setShowSuggestions(true);
              }}
              placeholder="Tapez pour chercher..."
              className="w-full px-2 py-1 text-sm border rounded"
            />
            
            {showSuggestions && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-b shadow-lg z-10 max-h-48 overflow-y-auto">
                {searchResults.map((product) => (
                  <div
                    key={product.id}
                    onClick={() => selectProduct(product)}
                    className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100"
                  >
                    <div className="font-medium text-sm">{product.product_id}</div>
                    <div className="text-xs text-gray-600 truncate">
                      {product.description || product.name}
                    </div>
                    <div className="text-xs text-green-600">
                      ${parseFloat(product.selling_price || product.price || 0).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </td>
          <td className="px-2 py-2">
            <input
              type="text"
              value={localItem.description}
              onChange={(e) => setLocalItem({...localItem, description: e.target.value})}
              placeholder="Description"
              className="w-full px-2 py-1 text-sm border rounded"
            />
          </td>
          <td className="px-2 py-2">
            <input
              type="number"
              value={localItem.quantity}
              onChange={(e) => setLocalItem({...localItem, quantity: parseFloat(e.target.value) || 0})}
              placeholder="Qté"
              className="w-16 px-2 py-1 text-sm border rounded text-center"
              step="0.01"
            />
          </td>
          <td className="px-2 py-2">
            <select
              value={localItem.unit}
              onChange={(e) => setLocalItem({...localItem, unit: e.target.value})}
              className="w-20 px-2 py-1 text-sm border rounded"
            >
              <option value="unité">UN</option>
              <option value="mètre">M</option>
              <option value="pied">FT</option>
              <option value="kilogramme">KG</option>
              <option value="litre">L</option>
              <option value="heure">H</option>
            </select>
          </td>
          <td className="px-2 py-2">
            <input
              type="number"
              value={localItem.selling_price}
              onChange={(e) => setLocalItem({...localItem, selling_price: parseFloat(e.target.value) || 0})}
              placeholder="Prix"
              className="w-20 px-2 py-1 text-sm border rounded text-center"
              step="0.01"
            />
          </td>
          <td className="px-2 py-2 text-center text-sm">
            {parseFloat(localItem.delivered_quantity || 0)}
          </td>
          <td className="px-2 py-2 text-right text-sm font-medium">
            ${(parseFloat(localItem.quantity || 0) * parseFloat(localItem.selling_price || 0)).toFixed(2)}
          </td>
          <td className="px-2 py-2">
            <div className="flex gap-1">
              <button
                onClick={handleSave}
                className="text-green-600 hover:text-green-800 text-sm px-2 py-1 border border-green-300 rounded"
                disabled={!localItem.product_id || !localItem.description}
                title="Sauvegarder"
              >
                ✓
              </button>
              <button
                onClick={handleCancel}
                className="text-red-600 hover:text-red-800 text-sm px-2 py-1 border border-red-300 rounded"
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
      <tr className="hover:bg-gray-50">
        <td className="px-4 py-3">
          <div className="font-medium text-gray-900">{item.product_id}</div>
        </td>
        <td className="px-4 py-3">
          <div className="text-sm text-gray-900">{item.description}</div>
          {item.from_manual && (
            <div className="text-xs text-blue-600">Article ajouté manuellement</div>
          )}
          {item.from_supplier_purchase && (
            <div className="text-xs text-purple-600">
              Importé depuis achat fournisseur #{item.supplier_purchase_number}
            </div>
          )}
        </td>
        <td className="px-4 py-3 text-center">
          <div className="font-medium">{item.quantity}</div>
        </td>
        <td className="px-4 py-3 text-center">
          <div className="text-sm">{item.unit}</div>
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
        <td className="px-4 py-3">
          <div className="flex gap-1">
            <button
              onClick={() => {
                setSearchTerm(item.product_id);
                setEditMode(true);
              }}
              className="text-blue-600 hover:text-blue-800 text-sm px-2 py-1"
              title="Modifier"
            >
              ✏️
            </button>
            <button
              onClick={() => {
                if (window.confirm('Êtes-vous sûr de vouloir supprimer cet article ?')) {
                  onDelete();
                }
              }}
              className="text-red-600 hover:text-red-800 text-sm px-2 py-1"
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
  const savePurchaseOrder = async () => {
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
      onClose();
      
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
      setItems([...items, editingItemData]);
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

  return (
    <>
      {/* Modal principal adapté mobile */}
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-2 sm:p-4">
        <div className="bg-white rounded-xl w-full h-[98vh] sm:max-w-6xl sm:h-[95vh] flex flex-col overflow-hidden">
          {/* Header adapté mobile */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 sm:p-6 flex-shrink-0">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg sm:text-2xl font-bold">
                  {editingPO ? `BA #${editingPO.po_number}` : 'Nouveau BA Client'}
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
          <div className="bg-gray-50 border-b border-gray-200 flex-shrink-0 overflow-x-auto">
            <nav className="flex space-x-0 min-w-max">
              <button
                onClick={() => setActiveTab('info')}
                className={`px-3 sm:px-6 py-3 sm:py-4 h-14 sm:h-16 border-b-2 font-medium text-xs sm:text-sm flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 whitespace-nowrap ${
                  activeTab === 'info'
                    ? 'border-blue-500 text-blue-600 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <span>📋</span>
                <span>Info</span>
              </button>
              <button
                onClick={() => setActiveTab('articles')}
                className={`px-3 sm:px-6 py-3 sm:py-4 h-14 sm:h-16 border-b-2 font-medium text-xs sm:text-sm flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 whitespace-nowrap ${
                  activeTab === 'articles'
                    ? 'border-blue-500 text-blue-600 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <span>📦</span>
                <span>Articles</span>
                {items.length > 0 && (
                  <span className="bg-blue-100 text-blue-800 text-xs px-1 sm:px-2 py-1 rounded-full">
                    {items.length}
                  </span>
                )}
              </button>
              {editingPO && (
                <button
                  onClick={() => setActiveTab('livraisons')}
                  className={`px-3 sm:px-6 py-3 sm:py-4 h-14 sm:h-16 border-b-2 font-medium text-xs sm:text-sm flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 whitespace-nowrap ${
                    activeTab === 'livraisons'
                      ? 'border-blue-500 text-blue-600 bg-white'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <span>🚚</span>
                  <span>Livraisons</span>
                  {deliverySlips.length > 0 && (
                    <span className="bg-green-100 text-green-800 text-xs px-1 sm:px-2 py-1 rounded-full">
                      {deliverySlips.length}
                    </span>
                  )}
                </button>
              )}
              <button
                onClick={() => setActiveTab('documents')}
                className={`px-3 sm:px-6 py-3 sm:py-4 h-14 sm:h-16 border-b-2 font-medium text-xs sm:text-sm flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 whitespace-nowrap ${
                  activeTab === 'documents'
                    ? 'border-blue-500 text-blue-600 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <span>📎</span>
                <span>Docs</span>
                {attachedFiles.length > 0 && (
                  <span className="bg-purple-100 text-purple-800 text-xs px-1 sm:px-2 py-1 rounded-full">
                    {attachedFiles.length}
                  </span>
                )}
              </button>
            </nav>
          </div>

          {/* Message d'erreur */}
          {error && (
            <div className="mx-4 sm:mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded flex-shrink-0">
              {error}
            </div>
          )}

          {/* Alerte soumission existante */}
          {hasExistingSubmission && existingSubmissionData && (
            <div className="mx-4 sm:mx-6 mt-4 bg-yellow-50 border-l-4 border-yellow-400 p-4 flex-shrink-0">
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
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto min-h-0">
            
            {/* ONGLET INFORMATIONS */}
            {activeTab === 'info' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                  <h3 className="text-lg font-semibold">Informations du Bon d'Achat</h3>
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      No. Bon Achat Client *
                    </label>
                    <input
                      type="text"
                      name="po_number"
                      value={formData.po_number}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Ex: PO-2025-001"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      No Soumission
                    </label>
                    <input
                      type="text"
                      name="submission_no"
                      value={formData.submission_no}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-gray-100"
                      placeholder="Sera rempli par import soumission"
                      readOnly
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Date *
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
                      Montant <span className="text-xs text-gray-500">(modifiable manuellement)</span>
                    </label>
                    <input
                      type="number"
                      name="amount"
                      value={formData.amount}
                      onChange={handleChange}
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Le montant peut être saisi manuellement ou calculé automatiquement depuis les articles
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Statut
                    </label>
                    <select
                      name="status"
                      value={formData.status}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="in_progress">🔵 En cours</option>
                      <option value="partial">🚚 Partiellement livré</option>
                      <option value="completed">✅ Complété</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                        Description du BA
                      </label>
                      <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Description détaillée du bon d'achat..."
                        rows="3"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">                      
                        Notes complémentaires (optionnel)
                  </label>
                  <input
                    type="text"
                    name="special_instructions"
                    value={formData.special_instructions}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Notes additionnelles, instructions spéciales..."
                  />
                </div>

                {/* Section client compactée */}
                {formData.client_name && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-700">
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
                  <h3 className="text-lg font-semibold">
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
                  <div className="text-center py-8 sm:py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                    <p className="text-gray-500 mb-4">Aucun article dans ce bon d'achat</p>
                    <p className="text-sm text-gray-400 mb-4">Vous pouvez :</p>
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
                    <div className="border rounded-lg overflow-hidden">
                      {/* Version mobile - Cards */}
                      <div className="block sm:hidden divide-y divide-gray-200">
                        {items.map((item, index) => (
                          <div key={item.id || index} className="p-4 bg-white">
                            <div className="flex justify-between items-start mb-2">
                              <div className="font-medium text-gray-900 text-sm">{item.product_id}</div>
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
                            <div className="text-sm text-gray-600 mb-2">{item.description}</div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <span className="text-gray-500">Qté:</span>
                                <span className="ml-1 font-medium">{item.quantity}</span>
                              </div>
                              <div>
                                <span className="text-gray-500">Prix:</span>
                                <span className="ml-1 font-medium">${parseFloat(item.selling_price || 0).toFixed(2)}</span>
                              </div>
                              <div>
                                <span className="text-gray-500">Livré:</span>
                                <span className="ml-1 font-medium">{item.delivered_quantity || 0}</span>
                              </div>
                              <div>
                                <span className="text-gray-500">Total:</span>
                                <span className="ml-1 font-bold text-green-600">
                                  ${(parseFloat(item.quantity || 0) * parseFloat(item.selling_price || 0)).toFixed(2)}
                                </span>
                              </div>
                            </div>
                            {item.from_manual && (
                              <div className="text-xs text-blue-600 mt-1">Article ajouté manuellement</div>
                            )}
                            {item.from_supplier_purchase && (
                              <div className="text-xs text-purple-600 mt-1">
                                Importé depuis achat #{item.supplier_purchase_number}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Version desktop - Table normale */}
                      <table className="w-full hidden sm:table">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code Produit</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Quantité</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Unité</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Prix Unit.</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Livré</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sous-Total</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {items.map((item, index) => (
                            <ItemRow
                              key={item.id || index}
                              item={item}
                              onUpdate={(updatedItem) => updateItem(index, updatedItem)}
                              onDelete={() => deleteItem(index)}
                            />
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50">
                          <tr>
                            <td colSpan="6" className="px-4 py-3 text-right font-semibold">
                              Total:
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-lg">
                              ${items.reduce((sum, item) => sum + (parseFloat(item.quantity || 0) * parseFloat(item.selling_price || 0)), 0).toFixed(2)}
                            </td>
                            <td className="px-4 py-3"></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Total visible sur mobile */}
                    <div className="block sm:hidden bg-gray-50 rounded-lg p-4">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-700">Total général:</span>
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
            {activeTab === 'livraisons' && editingPO && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                  <h3 className="text-lg font-semibold">
                    Livraisons ({deliverySlips.length})
                  </h3>
                  <div className="flex items-center gap-4">
                    <div className={'px-3 py-1 rounded-full text-sm font-medium ' + (
                      deliveryStatus === 'completed' ? 'bg-green-100 text-green-800' :
                      deliveryStatus === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
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
                          <div className="flex items-center gap-2">
                            <span className={'px-2 py-1 rounded-full text-xs font-semibold ' + (
                              slip.status === 'delivered' ? 'bg-green-100 text-green-800' :
                              slip.status === 'in_transit' ? 'bg-blue-100 text-blue-800' :
                              'bg-yellow-100 text-yellow-800'
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

            {/* ONGLET DOCUMENTS & ACHATS */}
            {activeTab === 'documents' && (
              <div className="space-y-8">
                
                {/* Section Documents */}
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                    <h3 className="text-lg font-semibold">Documents Joints ({attachedFiles.length})</h3>
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
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: uploadProgress + '%' }}
                      ></div>
                    </div>
                  )}

                  {/* Types de fichiers acceptés */}
                  <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                    <strong>Types acceptés:</strong> PDF, DOC, DOCX, XLS, XLSX, CSV, PNG, JPG (Max: 10MB par fichier)
                  </div>

                  {/* Liste des documents */}
                  {attachedFiles.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                      <p className="text-gray-500 mb-2">Aucun document joint</p>
                      <p className="text-sm text-gray-400">Glissez des fichiers ici ou cliquez sur "Choisir Fichiers"</p>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {attachedFiles.map((file) => (
                        <div key={file.id} className="border rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-gray-50">
                          <div className="flex items-center gap-3">
                            <div className="flex-shrink-0">
                              {file.type.includes('pdf') ? '📄' :
                               file.type.includes('excel') || file.type.includes('sheet') ? '📊' :
                               file.type.includes('word') || file.type.includes('doc') ? '📝' :
                               file.type.includes('image') ? '🖼️' : '📎'}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{file.name}</p>
                              <p className="text-sm text-gray-500">
                                {formatFileSize(file.size)} • Ajouté le {new Date(file.uploadDate).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => viewFile(file)}
                              className="text-blue-600 hover:text-blue-800 px-3 py-1 border border-blue-300 rounded text-sm"
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
                  <h3 className="text-lg font-semibold">Achats Fournisseurs Liés ({supplierPurchases.length})</h3>
                  
                  {supplierPurchases.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 rounded-lg border">
                      <p className="text-gray-500">Aucun achat fournisseur lié à ce BA</p>
                      <p className="text-sm text-gray-400 mt-1">
                        Les achats fournisseurs apparaîtront ici automatiquement s'ils sont liés à ce bon d'achat
                      </p>
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">N° Achat</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fournisseur</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Montant</th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Date</th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Statut</th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {supplierPurchases.map((purchase) => (
                              <tr key={purchase.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3">
                                  <div className="font-medium text-gray-900">{purchase.purchase_number}</div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="text-gray-900">{purchase.supplier_name}</div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="font-medium text-green-600">
                                    ${parseFloat(purchase.total_amount || 0).toFixed(2)}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <div className="text-sm text-gray-600">
                                    {new Date(purchase.created_at).toLocaleDateString()}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className={'px-2 py-1 rounded-full text-xs font-semibold ' + (
                                    purchase.status === 'completed' ? 'bg-green-100 text-green-800' :
                                    purchase.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-gray-100 text-gray-800'
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
          <div className="bg-gray-50 px-4 sm:px-6 py-4 border-t flex-shrink-0">
            {/* Informations sur une ligne séparée sur mobile */}
            <div className="text-sm text-gray-600 text-center mb-3 sm:mb-0 sm:hidden">
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
              <div className="hidden sm:block text-sm text-gray-600">
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
                {editingPO && (
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
                
                <button
                  onClick={savePurchaseOrder}
                  disabled={isLoading || !formData.client_name || !formData.po_number}
                  className="px-3 sm:px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 text-xs sm:text-sm"
                >
                  {isLoading ? 'Sauvegarde...' : (editingPO ? 'Mettre à jour' : 'Créer BA')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

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

      {/* Modal import depuis achats fournisseurs */}
      {showSupplierImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-lg w-full h-[95vh] sm:max-w-6xl sm:h-[90vh] overflow-hidden">
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
              <div className="w-full sm:w-1/3 border-r bg-gray-50 p-4 overflow-y-auto">
                <h4 className="font-semibold mb-4">Achats Fournisseurs Disponibles</h4>
                
                {isLoadingSupplierPurchases ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-2"></div>
                    <p className="text-gray-500">Chargement...</p>
                  </div>
                ) : clientSupplierPurchases.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">Aucun achat fournisseur trouvé</p>
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
                            ? 'border-purple-500 bg-purple-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="font-semibold text-sm">#{purchase.purchase_number}</div>
                        <div className="text-xs text-gray-600">{purchase.supplier_name}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {purchase.items?.length || 0} articles • ${parseFloat(purchase.total_amount || 0).toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-400">
                          {new Date(purchase.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Détail des articles */}
              <div className="flex-1 p-4 overflow-y-auto">
                {!selectedPurchaseForImport ? (
                  <div className="text-center py-16">
                    <p className="text-gray-500">Sélectionnez un achat fournisseur pour voir les articles</p>
                  </div>
                ) : (
                  <div>
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4">
                      <h4 className="font-semibold">
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

                    <div className="border rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left w-10">✓</th>
                              <th className="px-3 py-2 text-left">Code</th>
                              <th className="px-3 py-2 text-left">Description</th>
                              <th className="px-3 py-2 text-center">Qté</th>
                              <th className="px-3 py-2 text-center">Prix Unit.</th>
                              <th className="px-3 py-2 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {(selectedPurchaseForImport.items || []).map((item, index) => {
                              const quantity = parseFloat(item.quantity || item.qty || 1);
                              const unitPrice = parseFloat(item.cost_price || item.price || item.unit_price || 0);
                              const lineTotal = quantity * unitPrice;
                              
                              return (
                                <tr key={index} className="hover:bg-gray-50">
                                  <td className="px-3 py-2">
                                    <input
                                      type="checkbox"
                                      checked={selectedItemsForImport.includes(index)}
                                      onChange={() => toggleItemSelection(index)}
                                      className="rounded"
                                    />
                                  </td>
                                  <td className="px-3 py-2 font-medium">
                                    {item.product_id || item.code || item.sku || '-'}
                                  </td>
                                  <td className="px-3 py-2">
                                    {item.description || item.name || item.product_name || '-'}
                                  </td>
                                  <td className="px-3 py-2 text-center">{quantity}</td>
                                  <td className="px-3 py-2 text-center">${unitPrice.toFixed(2)}</td>
                                  <td className="px-3 py-2 text-right font-medium">${lineTotal.toFixed(2)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {selectedItemsForImport.length > 0 && (
                      <div className="mt-4 bg-purple-50 border border-purple-200 rounded-lg p-3">
                        <p className="text-sm text-purple-700">
                          <strong>{selectedItemsForImport.length} articles sélectionnés</strong> pour import
                        </p>
                        <p className="text-xs text-purple-600 mt-1">
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
            <div className="bg-gray-50 px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 border-t">
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
          <div className="bg-white rounded-lg w-full h-[95vh] sm:max-w-4xl sm:h-[90vh] overflow-hidden">
            {/* Header du modal */}
            <div className="bg-white px-4 sm:px-6 py-4 flex justify-between items-center border-b">
              <h3 className="text-lg sm:text-xl font-semibold">Achat Fournisseur {selectedSupplierPurchase.purchase_number}</h3>
              <button
                onClick={() => setShowSupplierPurchaseModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ✕
              </button>
            </div>
            
            {/* Contenu du modal - Format d'impression */}
            <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(95vh-120px)] sm:max-h-[calc(90vh-120px)]">
              <div className="max-w-3xl mx-auto bg-white">
                {/* En-tête du document */}
                <div className="text-center mb-6">
                  <h1 className="text-xl sm:text-2xl font-bold mb-4">ACHAT FOURNISSEUR</h1>
                  <h2 className="text-lg sm:text-xl font-semibold">N°: {selectedSupplierPurchase.purchase_number}</h2>
                  <p className="mt-2">Date: {new Date(selectedSupplierPurchase.created_at).toLocaleDateString()}</p>
                </div>
                
                <hr className="my-6 border-black" />
                
                {/* Informations principales */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-6">
                  <div>
                    <h3 className="font-bold text-lg mb-2">FOURNISSEUR:</h3>
                    <p className="text-lg">{selectedSupplierPurchase.supplier_name}</p>
                  </div>
                  
                  <div className="space-y-2">
                    <p><strong>Date création:</strong> {new Date(selectedSupplierPurchase.created_at).toLocaleDateString()}</p>
                    {selectedSupplierPurchase.delivery_date && (
                      <p><strong>Date livraison:</strong> {new Date(selectedSupplierPurchase.delivery_date).toLocaleDateString()}</p>
                    )}
                    <p><strong>Statut:</strong> {selectedSupplierPurchase.status}</p>
                  </div>
                </div>
                
                {/* Lien avec bon d'achat client */}
                {selectedSupplierPurchase.linked_po_number && (
                  <div className="bg-blue-50 p-4 rounded-lg mb-6">
                    <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
                      🔗 LIEN AVEC BON D'ACHAT CLIENT:
                    </h3>
                    <p><strong>N° Bon d'achat:</strong> {selectedSupplierPurchase.linked_po_number}</p>
                    <p className="italic text-sm mt-1">Cet achat fournisseur est lié au bon d'achat client ci-dessus</p>
                  </div>
                )}
                
                {/* Détail des articles */}
                <div className="mb-6">
                  <h3 className="font-bold text-lg mb-4">DÉTAIL DES ARTICLES:</h3>
                  
                  {selectedSupplierPurchase.items && selectedSupplierPurchase.items.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border border-gray-300">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="border border-gray-300 px-2 sm:px-3 py-2 text-left text-xs sm:text-sm">Code</th>
                            <th className="border border-gray-300 px-2 sm:px-3 py-2 text-left text-xs sm:text-sm">Description</th>
                            <th className="border border-gray-300 px-2 sm:px-3 py-2 text-center text-xs sm:text-sm">Qté</th>
                            <th className="border border-gray-300 px-2 sm:px-3 py-2 text-center text-xs sm:text-sm">Unité</th>
                            <th className="border border-gray-300 px-2 sm:px-3 py-2 text-center text-xs sm:text-sm">Prix Unit.</th>
                            <th className="border border-gray-300 px-2 sm:px-3 py-2 text-center text-xs sm:text-sm">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedSupplierPurchase.items.map((item, index) => {
                            const quantity = parseFloat(item.quantity || item.qty || 1);
                            const unitPrice = parseFloat(item.cost_price || item.price || item.unit_price || 0);
                            const lineTotal = quantity * unitPrice;
                            
                            return (
                              <tr key={index}>
                                <td className="border border-gray-300 px-2 sm:px-3 py-2 text-xs sm:text-sm">{item.product_id || item.code || item.sku || '-'}</td>
                                <td className="border border-gray-300 px-2 sm:px-3 py-2 text-xs sm:text-sm">
                                  <div>{item.description || item.name || item.product_name || '-'}</div>
                                  {item.notes && (
                                    <div className="text-xs text-blue-600 italic mt-1">📝 {item.notes}</div>
                                  )}
                                </td>
                                <td className="border border-gray-300 px-2 sm:px-3 py-2 text-center font-medium text-xs sm:text-sm">{quantity}</td>
                                <td className="border border-gray-300 px-2 sm:px-3 py-2 text-center text-xs sm:text-sm">{item.unit || item.unity || 'UN'}</td>
                                <td className="border border-gray-300 px-2 sm:px-3 py-2 text-center font-medium text-xs sm:text-sm">${unitPrice.toFixed(2)}</td>
                                <td className="border border-gray-300 px-2 sm:px-3 py-2 text-center font-bold text-green-600 text-xs sm:text-sm">${lineTotal.toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-gray-500 italic">Aucun détail d'article disponible</p>
                  )}
                </div>
                
                {/* Totaux */}
                <div className="border-t-2 border-black pt-4">
                  <div className="flex justify-end">
                    <div className="w-full sm:w-64">
                      <div className="flex justify-between py-1 text-sm">
                        <span className="font-semibold">Sous-total:</span>
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
                      <div className="flex justify-between py-2 border-t border-gray-300 font-bold text-base sm:text-lg">
                        <span>TOTAL GÉNÉRAL:</span>
                        <span>${parseFloat(selectedSupplierPurchase.total_amount || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Notes si présentes */}
                {selectedSupplierPurchase.notes && (
                  <div className="mt-6 p-4 bg-gray-50 rounded">
                    <h4 className="font-semibold mb-2">Notes:</h4>
                    <p className="text-sm">{selectedSupplierPurchase.notes}</p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Footer avec bouton imprimer */}
            <div className="bg-gray-50 px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 border-t">
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
            if (editingPO) {
              loadPOData(editingPO.id);
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

      {/* Modal d'édition mobile */}
      {showMobileItemEditor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md max-h-[90vh] overflow-hidden">
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
            
            <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(90vh-120px)]">
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                
                {/* Suggestions de recherche */}
                {mobileSearchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-b shadow-lg z-10 max-h-48 overflow-y-auto">
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
                        <div className="font-medium text-sm">{product.product_id}</div>
                        <div className="text-xs text-gray-600 truncate">
                          {product.description || product.name}
                        </div>
                        <div className="text-xs text-green-600">
                          ${parseFloat(product.selling_price || product.price || 0).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description *
                </label>
                <textarea
                  value={editingItemData?.description || ''}
                  onChange={(e) => setEditingItemData(prev => ({...prev, description: e.target.value}))}
                  placeholder="Description de l'article"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows="3"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Quantité *
                  </label>
                  <input
                    type="number"
                    value={editingItemData?.quantity || ''}
                    onChange={(e) => setEditingItemData(prev => ({...prev, quantity: parseFloat(e.target.value) || 0}))}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    step="0.01"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unité
                  </label>
                  <select
                    value={editingItemData?.unit || 'unité'}
                    onChange={(e) => setEditingItemData(prev => ({...prev, unit: e.target.value}))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Prix Unitaire *
                </label>
                <input
                  type="number"
                  value={editingItemData?.selling_price || ''}
                  onChange={(e) => setEditingItemData(prev => ({...prev, selling_price: parseFloat(e.target.value) || 0}))}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  step="0.01"
                />
              </div>
              
              {/* Affichage du total calculé */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-700">Total ligne :</span>
                  <span className="text-lg font-bold text-green-600">
                    ${((editingItemData?.quantity || 0) * (editingItemData?.selling_price || 0)).toFixed(2)}
                  </span>
                </div>
              </div>
              
              {/* Bouton supprimer pour les articles modifiables */}
              {editingItemIndex !== null && (
                <div className="pt-4 border-t">
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
            
            <div className="bg-gray-50 px-4 py-3 flex justify-between items-center border-t">
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
    </>
  );
};

export default PurchaseOrderModal;
