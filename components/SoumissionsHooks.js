import { useState, useEffect } from 'react';
import * as API from './SoumissionsServices';

export const useSoumissions = () => {
  // ===== ÉTATS PRINCIPAUX =====
  const [soumissions, setSoumissions] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSubmission, setEditingSubmission] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sendingReport, setSendingReport] = useState(false);

  // ===== ÉTATS FORMULAIRE =====
  const [submissionForm, setSubmissionForm] = useState({
    client_name: '',
    description: '',
    amount: 0,
    status: 'draft',
    items: [],
    submission_number: '',
    files: []
  });

  // ===== ÉTATS PRODUITS =====
  const [products, setProducts] = useState([]);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [focusedProductIndex, setFocusedProductIndex] = useState(-1);
  const [calculatedCostTotal, setCalculatedCostTotal] = useState(0);

  // ===== ÉTATS MODALS =====
  const [showQuickAddProduct, setShowQuickAddProduct] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [editingCommentItem, setEditingCommentItem] = useState(null);
  const [tempComment, setTempComment] = useState('');
  const [showQuantityInput, setShowQuantityInput] = useState(false);
  const [selectedProductForQuantity, setSelectedProductForQuantity] = useState(null);
  const [tempQuantity, setTempQuantity] = useState('1');

  // ===== ÉTATS CALCULATEUR USD =====
  const [showUsdCalculator, setShowUsdCalculator] = useState(false);
  const [usdAmount, setUsdAmount] = useState('');
  const [usdToCadRate, setUsdToCadRate] = useState(1.35);
  const [loadingExchangeRate, setLoadingExchangeRate] = useState(false);
  const [exchangeRateError, setExchangeRateError] = useState('');

  // ===== ÉTATS EMAIL =====
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState('');

  // ===== ÉTATS FICHIERS =====
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(null);

  // ===== ÉTATS FORMULAIRE PRODUIT =====
  const [quickProductForm, setQuickProductForm] = useState({
    product_id: '',
    description: '',
    selling_price: '',
    cost_price: '',
    unit: 'Un',
    product_group: 'Non-Inventaire'
  });

  // ===== EFFECTS INITIAUX =====
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadSoumissions(),
        loadClients(),
        loadExchangeRate()
      ]);
    } catch (error) {
      console.error('Erreur chargement initial:', error);
    } finally {
      setLoading(false);
    }
  };

  // ===== EFFECT RECHERCHE PRODUITS AVEC DEBOUNCE =====
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (productSearchTerm.length >= API.SEARCH_CONFIG.MIN_SEARCH_LENGTH) {
        setSearchingProducts(true);
        searchProducts(productSearchTerm).finally(() => {
          setSearchingProducts(false);
        });
      } else {
        setProducts([]);
      }
    }, API.SEARCH_CONFIG.DEBOUNCE_DELAY);

    return () => clearTimeout(timeoutId);
  }, [productSearchTerm]);

  // ===== EFFECT CALCUL AUTOMATIQUE =====
  useEffect(() => {
    const totalSelling = selectedItems.reduce((sum, item) => {
      return sum + (item.selling_price * item.quantity);
    }, 0);
    
    const totalCost = selectedItems.reduce((sum, item) => {
      return sum + (item.cost_price * item.quantity);
    }, 0);
    
    setSubmissionForm(prev => ({ 
      ...prev, 
      amount: totalSelling
    }));
    
    setCalculatedCostTotal(totalCost);
  }, [selectedItems]);

  // ===== EFFECT INITIALISATION ÉDITION =====
  useEffect(() => {
    if (editingSubmission) {
      setSubmissionForm({
        client_name: editingSubmission.client_name || '',
        description: editingSubmission.description || '',
        amount: editingSubmission.amount || 0,
        status: editingSubmission.status || 'draft',
        items: editingSubmission.items || [],
        submission_number: editingSubmission.submission_number || '',
        files: editingSubmission.files || []
      });
      setSelectedItems(editingSubmission.items || []);
      
      const existingCostTotal = (editingSubmission.items || []).reduce((sum, item) => 
        sum + ((item.cost_price || 0) * (item.quantity || 0)), 0
      );
      setCalculatedCostTotal(existingCostTotal);
    }
  }, [editingSubmission]);

  // ===== FONCTIONS DE CHARGEMENT =====
  const loadSoumissions = async () => {
    try {
      const data = await API.fetchSoumissions();
      setSoumissions(data);
    } catch (error) {
      console.error('Erreur chargement soumissions:', error);
    }
  };

  const loadClients = async () => {
    try {
      const data = await API.fetchClients();
      setClients(data);
    } catch (error) {
      console.error('Erreur chargement clients:', error);
    }
  };

  const loadExchangeRate = async () => {
    setLoadingExchangeRate(true);
    setExchangeRateError('');
    
    try {
      const rate = await API.fetchExchangeRate();
      setUsdToCadRate(rate);
    } catch (error) {
      setExchangeRateError('Erreur de connexion - Taux par défaut utilisé');
      setUsdToCadRate(1.35);
    } finally {
      setLoadingExchangeRate(false);
    }
  };

  // ===== RECHERCHE PRODUITS =====
  const searchProducts = async (searchTerm) => {
    try {
      const data = await API.searchProductsWithNonInventory(searchTerm);
      setProducts(data);
    } catch (error) {
      console.error('Erreur recherche produits:', error);
      setProducts([]);
    }
  };

  // ===== GESTION DES SOUMISSIONS =====
  const handleNewSubmission = async () => {
    try {
      const newNumber = await API.generateSubmissionNumber();
      setEditingSubmission({ submission_number: newNumber });
      resetForm();
      setSubmissionForm(prev => ({ ...prev, submission_number: newNumber }));
      setShowForm(true);
    } catch (error) {
      console.error('Erreur génération numéro:', error);
      setShowForm(true);
    }
  };

  const handleEditSubmission = (submission) => {
    setEditingSubmission(submission);
    setShowForm(true);
  };

  const handleSubmissionSubmit = async (e) => {
    e.preventDefault();
    try {
      const submissionData = {
        ...submissionForm,
        items: selectedItems
      };

      if (editingSubmission && editingSubmission.id) {
        await API.updateSubmission(editingSubmission.id, submissionData);
      } else {
        await API.createSubmission(submissionData);
      }

      await loadSoumissions();
      handleCloseForm();
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      alert('Erreur lors de la sauvegarde: ' + error.message);
    }
  };

  const handleDeleteSubmission = async (id) => {
    if (!confirm('🗑️ Êtes-vous sûr de vouloir supprimer cette soumission ?')) return;
    
    try {
      await API.deleteSubmission(id);
      await loadSoumissions();
    } catch (error) {
      console.error('Erreur suppression:', error);
      alert('Erreur lors de la suppression: ' + error.message);
    }
  };

  // ===== GESTION PRODUITS =====
  const selectProductForQuantity = (product) => {
    setSelectedProductForQuantity(product);
    setShowQuantityInput(true);
    setTempQuantity('1');
    setTimeout(() => {
      const input = document.getElementById('quantity-input');
      if (input) {
        input.focus();
        input.select();
      }
    }, 100);
  };

  const addItemToSubmission = (product, quantity = 1) => {
    const floatQuantity = parseFloat(quantity);
    const existingItem = selectedItems.find(item => item.product_id === product.product_id);
    
    if (existingItem) {
      setSelectedItems(selectedItems.map(item => 
        item.product_id === product.product_id 
          ? { ...item, quantity: item.quantity + floatQuantity }
          : item
      ));
    } else {
      setSelectedItems([...selectedItems, {
        ...product,
        quantity: floatQuantity,
        comment: ''
      }]);
    }
  };

  const updateItemQuantity = (productId, quantity) => {
    const floatQuantity = parseFloat(quantity);
    if (floatQuantity <= 0 || isNaN(floatQuantity)) {
      setSelectedItems(selectedItems.filter(item => item.product_id !== productId));
    } else {
      setSelectedItems(selectedItems.map(item =>
        item.product_id === productId ? { ...item, quantity: floatQuantity } : item
      ));
    }
  };

  const updateItemPrice = (productId, field, price) => {
    setSelectedItems(selectedItems.map(item =>
      item.product_id === productId ? { ...item, [field]: parseFloat(price) || 0 } : item
    ));
  };

  const removeItemFromSubmission = (productId) => {
    setSelectedItems(selectedItems.filter(item => item.product_id !== productId));
  };

  // ===== NAVIGATION CLAVIER PRODUITS =====
  const handleProductKeyDown = (e) => {
    const availableProducts = products;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedProductIndex(prev => {
        const newIndex = prev < availableProducts.length - 1 ? prev + 1 : prev;
        setTimeout(() => {
          const element = document.querySelector(`[data-product-index="${newIndex}"]`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }, 0);
        return newIndex;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedProductIndex(prev => {
        const newIndex = prev > 0 ? prev - 1 : prev;
        setTimeout(() => {
          const element = document.querySelector(`[data-product-index="${newIndex}"]`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }, 0);
        return newIndex;
      });
    } else if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      if (focusedProductIndex >= 0 && availableProducts[focusedProductIndex]) {
        selectProductForQuantity(availableProducts[focusedProductIndex]);
      }
    } else if (e.key === 'Escape') {
      setFocusedProductIndex(-1);
    }
  };

  const handleQuantityKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedProductForQuantity && tempQuantity && parseFloat(tempQuantity) > 0) {
        addItemToSubmission(selectedProductForQuantity, parseFloat(tempQuantity));
        closeQuantityModal();
        resetProductSearch();
      }
    } else if (e.key === 'Escape') {
      closeQuantityModal();
    }
  };

  // ===== GESTION COMMENTAIRES =====
  const openCommentModal = (item) => {
    setEditingCommentItem(item);
    setTempComment(item.comment || '');
    setShowCommentModal(true);
  };

  const closeCommentModal = () => {
    setShowCommentModal(false);
    setEditingCommentItem(null);
    setTempComment('');
  };

  const saveComment = () => {
    if (editingCommentItem) {
      setSelectedItems(items => 
        items.map(item => 
          item.product_id === editingCommentItem.product_id 
            ? { ...item, comment: tempComment.trim() }
            : item
        )
      );
    }
    closeCommentModal();
  };

  // ===== GESTION PRODUIT RAPIDE =====
  const addNonInventoryProduct = async () => {
    if (!quickProductForm.product_id || !quickProductForm.description || 
        !quickProductForm.selling_price || !quickProductForm.cost_price) {
      alert('❌ Veuillez remplir tous les champs obligatoires');
      return;
    }

    try {
      const savedProduct = await API.saveNonInventoryProduct(quickProductForm);
      
      if (savedProduct) {
        addItemToSubmission(savedProduct, 1);
        alert('✅ Produit non-inventaire sauvegardé !');
      }
      
    } catch (error) {
      console.error('❌ Erreur sauvegarde:', error);
      alert(`❌ Erreur sauvegarde: ${error.message}`);
      
      // Fallback: ajouter temporairement
      const tempProduct = {
        product_id: quickProductForm.product_id,
        description: quickProductForm.description,
        selling_price: parseFloat(quickProductForm.selling_price),
        cost_price: parseFloat(quickProductForm.cost_price),
        unit: quickProductForm.unit,
        product_group: quickProductForm.product_group || 'Non-Inventaire',
        stock_qty: 0,
        is_non_inventory: true
      };
      
      addItemToSubmission(tempProduct, 1);
      alert('⚠️ Produit ajouté temporairement');
    }
    
    closeQuickAddModal();
  };

  const applyProfitMargin = (percentage) => {
    const costPrice = parseFloat(quickProductForm.cost_price) || 0;
    if (costPrice > 0) {
      const sellingPrice = costPrice * (1 + percentage / 100);
      setQuickProductForm(prev => ({
        ...prev,
        selling_price: sellingPrice.toFixed(2)
      }));
    }
  };

  // ===== CALCULATEUR USD =====
  const useConvertedAmount = () => {
    if (usdAmount && parseFloat(usdAmount) > 0) {
      const convertedAmount = API.convertUsdToCad(usdAmount, usdToCadRate);
      setQuickProductForm(prev => ({
        ...prev,
        cost_price: convertedAmount.toFixed(2)
      }));
      setShowUsdCalculator(false);
      setUsdAmount('');
    }
  };

  // ===== GESTION FICHIERS =====
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploadingFiles(true);
    const uploadedFiles = [];

    for (const file of files) {
      try {
        const uploadedFile = await API.uploadFile(file);
        uploadedFiles.push(uploadedFile);
      } catch (error) {
        console.error('Erreur upload fichier:', file.name, error);
        alert(`Erreur upload "${file.name}": ${error.message}`);
      }
    }

    if (uploadedFiles.length > 0) {
      setSubmissionForm(prev => ({
        ...prev, 
        files: [...(prev.files || []), ...uploadedFiles]
      }));
    }

    setUploadingFiles(false);
    e.target.value = '';
  };

  const removeFile = async (index) => {
    const fileToRemove = submissionForm.files[index];
    
    if (fileToRemove.path) {
      try {
        await API.deleteFile(fileToRemove.path);
      } catch (error) {
        console.error('Erreur suppression fichier:', error);
      }
    }
    
    const newFiles = submissionForm.files.filter((_, i) => i !== index);
    setSubmissionForm(prev => ({...prev, files: newFiles}));
  };

  // ===== IMPRESSION =====
  const handlePrint = () => {
    const originalTitle = document.title;
    document.title = `Soumission ${submissionForm.submission_number}`;
    
    window.print();
    
    setTimeout(() => {
      document.title = originalTitle;
    }, 100);
  };

  const handlePrintClient = () => {
    const originalTitle = document.title;
    document.title = `Soumission ${submissionForm.submission_number}`;
    
    document.body.classList.add('print-client');
    window.print();
    
    setTimeout(() => {
      document.body.classList.remove('print-client');
      document.title = originalTitle;
    }, 100);
  };

  // ===== ENVOI EMAIL =====
  const handleSendSubmissionEmail = async () => {
    if (!submissionForm.client_name) {
      alert('⚠️ Veuillez sélectionner un client avant d\'envoyer l\'email');
      return;
    }
  
    if (selectedItems.length === 0) {
      alert('⚠️ Veuillez ajouter au moins un produit avant d\'envoyer l\'email');
      return;
    }
  
    const client = clients.find(c => c.name === submissionForm.client_name);
    if (!client || !client.email) {
      alert('⚠️ Aucun email trouvé pour ce client. Veuillez vérifier les informations du client.');
      return;
    }
  
    setSendingEmail(true);
    setEmailError('');
    setEmailSent(false);
  
    try {
      console.log('📄 Génération du PDF de soumission...');
      const pdfBase64 = await API.generateSubmissionPDF();
      
      if (!pdfBase64) {
        throw new Error('Erreur lors de la génération du PDF');
      }
  
      const emailData = {
        to: client.email,
        clientName: submissionForm.client_name,
        submissionNumber: submissionForm.submission_number,
        submissionData: {
          client_name: submissionForm.client_name,
          description: submissionForm.description,
          amount: submissionForm.amount,
          items: selectedItems,
          submission_number: submissionForm.submission_number,
          created_at: new Date().toISOString()
        },
        pdfBase64: pdfBase64
      };
  
      console.log('📧 Envoi email avec PDF vers:', client.email);
  
      const result = await API.sendSubmissionEmail(emailData);
      setEmailSent(true);
      alert(`✅ Soumission PDF envoyée avec succès à ${client.email}!`);
      
      if (submissionForm.status === 'draft') {
        setSubmissionForm(prev => ({...prev, status: 'sent'}));
      }
  
    } catch (error) {
      console.error('❌ Erreur envoi PDF:', error);
      setEmailError(error.message);
      alert(`❌ Erreur lors de l'envoi: ${error.message}`);
    } finally {
      setSendingEmail(false);
    }
  };

  const handleSendReport = async () => {
    setSendingReport(true);
    try {
      const result = await API.sendWeeklyReport();
      alert(`📧 Rapport envoyé avec succès !\n${result.result.message || 'Email envoyé'}`);
    } catch (error) {
      alert(`❌ Erreur lors de l'envoi du rapport: ${error.message}`);
    } finally {
      setSendingReport(false);
    }
  };

  // ===== FONCTIONS DE RÉINITIALISATION =====
  const resetForm = () => {
    setSubmissionForm({
      client_name: '',
      description: '',
      amount: 0,
      status: 'draft',
      items: [],
      submission_number: '',
      files: []
    });
    setSelectedItems([]);
    setCalculatedCostTotal(0);
  };

  const resetProductSearch = () => {
    setProductSearchTerm('');
    setProducts([]);
    setFocusedProductIndex(-1);
    setTimeout(() => {
      document.getElementById('product-search')?.focus();
    }, 100);
  };

  const closeQuantityModal = () => {
    setShowQuantityInput(false);
    setSelectedProductForQuantity(null);
    setTempQuantity('1');
  };

  const closeQuickAddModal = () => {
    setShowQuickAddProduct(false);
    setQuickProductForm({
      product_id: '',
      description: '',
      selling_price: '',
      cost_price: '',
      unit: 'Un',
      product_group: 'Non-Inventaire'
    });
    setShowUsdCalculator(false);
    setUsdAmount('');
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingSubmission(null);
    resetForm();
    resetProductSearch();
  };

  // ===== FILTRAGE =====
  const filteredSoumissions = soumissions.filter(sub => {
    const matchesSearch = sub.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         sub.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // ===== STATISTIQUES =====
  const stats = {
    total: soumissions.length,
    drafts: soumissions.filter(s => s.status === API.SUBMISSION_STATUS.DRAFT).length,
    sent: soumissions.filter(s => s.status === API.SUBMISSION_STATUS.SENT).length,
    accepted: soumissions.filter(s => s.status === API.SUBMISSION_STATUS.ACCEPTED),
    acceptedTotal: soumissions
      .filter(s => s.status === API.SUBMISSION_STATUS.ACCEPTED)
      .reduce((sum, s) => sum + (s.amount || 0), 0)
  };

  // ===== RETOUR DU HOOK =====
  return {
    // États principaux
    soumissions,
    clients,
    loading,
    showForm,
    editingSubmission,
    searchTerm,
    statusFilter,
    sendingReport,
    
    // États formulaire
    submissionForm,
    setSubmissionForm,
    
    // États produits
    products,
    productSearchTerm,
    setProductSearchTerm,
    searchingProducts,
    selectedItems,
    focusedProductIndex,
    setFocusedProductIndex,
    calculatedCostTotal,
    
    // États modals
    showQuickAddProduct,
    setShowQuickAddProduct,
    showCommentModal,
    editingCommentItem,
    tempComment,
    setTempComment,
    showQuantityInput,
    selectedProductForQuantity,
    tempQuantity,
    setTempQuantity,
    
    // États USD
    showUsdCalculator,
    setShowUsdCalculator,
    usdAmount,
    setUsdAmount,
    usdToCadRate,
    loadingExchangeRate,
    exchangeRateError,
    
    // États email
    sendingEmail,
    emailSent,
    emailError,
    
    // États fichiers
    uploadingFiles,
    selectedSubmissionId,
    setSelectedSubmissionId,
    
    // Formulaire produit
    quickProductForm,
    setQuickProductForm,
    
    // Données filtrées
    filteredSoumissions,
    stats,
    
    // Handlers principaux
    handleNewSubmission,
    handleEditSubmission,
    handleSubmissionSubmit,
    handleDeleteSubmission,
    handleCloseForm,
    setSearchTerm,
    setStatusFilter,
    
    // Handlers produits
    selectProductForQuantity,
    addItemToSubmission,
    updateItemQuantity,
    updateItemPrice,
    removeItemFromSubmission,
    handleProductKeyDown,
    handleQuantityKeyDown,
    
    // Handlers commentaires
    openCommentModal,
    closeCommentModal,
    saveComment,
    
    // Handlers produit rapide
    addNonInventoryProduct,
    applyProfitMargin,
    closeQuickAddModal,
    
    // Handlers USD
    useConvertedAmount,
    loadExchangeRate,
    
    // Handlers fichiers
    handleFileUpload,
    removeFile,
    
    // Handlers impression
    handlePrint,
    handlePrintClient,
    
    // Handlers email
    handleSendSubmissionEmail,
    handleSendReport,
    
    // Utilitaires
    resetForm,
    resetProductSearch,
    closeQuantityModal
  };
};
