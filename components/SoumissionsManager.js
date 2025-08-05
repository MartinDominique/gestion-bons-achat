import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { MoreVertical, Eye, Edit, Trash2, FileText, Download, Search, Plus, Upload, X, ChevronDown, MessageSquare, DollarSign, Calculator, Printer } from 'lucide-react';

export default function SoumissionsManager() {
  const [soumissions, setSoumissions] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showClientManager, setShowClientManager] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showNonInventoryForm, setShowNonInventoryForm] = useState(false);
  const [showQuickAddProduct, setShowQuickAddProduct] = useState(false);
  const [showInventoryUpload, setShowInventoryUpload] = useState(false);
  const [editingSubmission, setEditingSubmission] = useState(null);
  const [editingClient, setEditingClient] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sendingReport, setSendingReport] = useState(false);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(null);
  const [uploadingInventory, setUploadingInventory] = useState(false);
  
  // Recherche produits avec debounce et navigation clavier
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [products, setProducts] = useState([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [focusedProductIndex, setFocusedProductIndex] = useState(-1);
  const [tempQuantity, setTempQuantity] = useState('1');
  const [showQuantityInput, setShowQuantityInput] = useState(false);
  const [selectedProductForQuantity, setSelectedProductForQuantity] = useState(null);

  // États pour les commentaires
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [editingCommentItem, setEditingCommentItem] = useState(null);
  const [tempComment, setTempComment] = useState('');

  // États pour le calculateur USD
  const [showUsdCalculator, setShowUsdCalculator] = useState(false);
  const [usdAmount, setUsdAmount] = useState('');
  const [usdToCadRate, setUsdToCadRate] = useState(1.35);
  const [loadingExchangeRate, setLoadingExchangeRate] = useState(false);
  const [exchangeRateError, setExchangeRateError] = useState('');

  // Debounce pour la recherche produits
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (productSearchTerm.length >= 2) {
        setSearchingProducts(true);
        searchProducts(productSearchTerm).finally(() => {
          setSearchingProducts(false);
        });
      } else {
        setProducts([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [productSearchTerm]);
  
  // Form states
  const [submissionForm, setSubmissionForm] = useState({
    client_name: '',
    description: '',
    amount: 0,
    status: 'draft',
    items: [],
    submission_number: ''
  });

  const [clientForm, setClientForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    contact_person: ''
  });

  const [nonInventoryForm, setNonInventoryForm] = useState({
    name: '',
    description: '',
    price: '',
    category: '',
    supplier: ''
  });

  const [quickProductForm, setQuickProductForm] = useState({
    product_id: '',
    description: '',
    selling_price: '',
    cost_price: '',
    unit: 'UN',
    product_group: 'Divers'
  });

  // Calcul automatique du montant vente ET coût
  const [calculatedCostTotal, setCalculatedCostTotal] = useState(0);
  
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

  useEffect(() => {
    fetchSoumissions();
    fetchProducts();
    fetchClients();
    fetchExchangeRate();
  }, []);

  // Fonction pour récupérer le taux de change USD/CAD
  const fetchExchangeRate = async () => {
    setLoadingExchangeRate(true);
    setExchangeRateError('');
    
    try {
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const data = await response.json();
      
      if (data && data.rates && data.rates.CAD) {
        setUsdToCadRate(data.rates.CAD);
      } else {
        throw new Error('Taux CAD non trouvé');
      }
    } catch (error) {
      console.error('Erreur récupération taux de change:', error);
      setExchangeRateError('Erreur de connexion - Taux par défaut utilisé');
      setUsdToCadRate(1.35);
    } finally {
      setLoadingExchangeRate(false);
    }
  };

  // Fonctions pour les boutons de profit
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

  // Fonction pour utiliser le montant USD converti
  const useConvertedAmount = () => {
    const convertedAmount = parseFloat(usdAmount) * usdToCadRate;
    setQuickProductForm(prev => ({
      ...prev,
      cost_price: convertedAmount.toFixed(2)
    }));
    setShowUsdCalculator(false);
    setUsdAmount('');
  };

  // Fonction pour gérer l'upload d'inventaire
  const handleInventoryUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploadingInventory(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload-inventory', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        alert(`✅ Inventaire importé avec succès !\n${result.message || 'Produits mis à jour'}`);
        await fetchProducts();
      } else {
        const errorData = await response.json();
        alert(`❌ Erreur lors de l'import: ${errorData.error || 'Erreur inconnue'}`);
      }
    } catch (error) {
      console.error('Erreur upload inventaire:', error);
      alert('❌ Erreur lors de l\'upload du fichier');
    } finally {
      setUploadingInventory(false);
      setShowInventoryUpload(false);
    }
  };

  // Fonction pour générer le numéro automatique
  const generateSubmissionNumber = async () => {
    const now = new Date();
    const yearMonth = `${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    
    try {
      const { data, error } = await supabase
        .from('submissions')
        .select('submission_number')
        .like('submission_number', `${yearMonth}-%`)
        .order('submission_number', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Erreur récupération numéro:', error);
        return `${yearMonth}-001`;
      }

      if (data && data.length > 0) {
        const lastNumber = data[0].submission_number;
        const sequenceMatch = lastNumber.match(/-(\d{3})$/);
        if (sequenceMatch) {
          const nextSequence = (parseInt(sequenceMatch[1]) + 1).toString().padStart(3, '0');
          const newNumber = `${yearMonth}-${nextSequence}`;
          return newNumber;
        }
      }
      
      const firstNumber = `${yearMonth}-001`;
      return firstNumber;
    } catch (error) {
      console.error('Erreur génération numéro:', error);
      return `${yearMonth}-001`;
    }
  };

  const fetchSoumissions = async () => {
    try {
      const { data, error } = await supabase
        .from('submissions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSoumissions(data || []);
    } catch (error) {
      console.error('Erreur lors du chargement des soumissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    setProducts([]);
  };

  // Recherche dynamique côté serveur avec limite
  const searchProducts = async (searchTerm) => {
    if (!searchTerm || searchTerm.length < 2) {
      setProducts([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .or(`description.ilike.%${searchTerm}%,product_id.ilike.%${searchTerm}%,product_group.ilike.%${searchTerm}%`)
        .order('description', { ascending: true })
        .limit(50);

      if (error) {
        console.error('Erreur recherche produits:', error);
        setProducts([]);
        return;
      }

      setProducts(data || []);
    } catch (error) {
      console.error('Erreur lors de la recherche dynamique:', error);
      setProducts([]);
    }
  };

  const fetchClients = async () => {
    try {
      const { data: clientsData, error: clientsError } = await supabase
        .from('clients')
        .select('*')
        .order('name', { ascending: true });

      if (!clientsError && clientsData) {
        setClients(clientsData);
        return;
      }

      const [submissionsResult, purchaseOrdersResult] = await Promise.all([
        supabase.from('submissions').select('client_name').order('client_name'),
        supabase.from('purchase_orders').select('client_name, client').order('client_name')
      ]);

      const allClientNames = new Set();
      
      submissionsResult.data?.forEach(s => {
        if (s.client_name) allClientNames.add(s.client_name);
      });
      
      purchaseOrdersResult.data?.forEach(po => {
        if (po.client_name) allClientNames.add(po.client_name);
        if (po.client) allClientNames.add(po.client);
      });

      const uniqueClients = Array.from(allClientNames).map((name, index) => ({
        id: `client_${index}`,
        name,
        email: '',
        phone: '',
        address: '',
        contact_person: ''
      }));

      setClients(uniqueClients);
    } catch (error) {
      console.error('Erreur lors du chargement des clients:', error);
      setClients([]);
    }
  };

  const handleDeleteSubmission = async (id) => {
    if (!confirm('🗑️ Êtes-vous sûr de vouloir supprimer cette soumission ?')) return;
    
    try {
      const { error } = await supabase
        .from('submissions')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await fetchSoumissions();
    } catch (error) {
      console.error('Erreur suppression soumission:', error);
    }
  };

  const handleSendReport = async () => {
    setSendingReport(true);
    try {
      const response = await fetch('/api/send-weekly-report', {
        method: 'GET'
      });

      if (response.ok) {
        const result = await response.json();
        console.log('📧 Rapport envoyé avec succès !', result);
        alert(`📧 Rapport envoyé avec succès !\n${result.message || 'Email envoyé'}`);
      } else {
        const errorData = await response.json();
        console.error('❌ Erreur lors de l\'envoi du rapport:', errorData);
        alert(`❌ Erreur lors de l'envoi du rapport: ${errorData.error || 'Erreur inconnue'}`);
      }
    } catch (error) {
      console.error('Erreur lors de l\'envoi:', error);
      alert('❌ Erreur lors de l\'envoi du rapport');
    } finally {
      setSendingReport(false);
    }
  };

  // Navigation clavier pour recherche produits avec auto-scroll
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

  const selectProductForQuantity = (product) => {
    setSelectedProductForQuantity(product);
    setShowQuantityInput(true);
    setTempQuantity('1');
    setTimeout(() => {
      document.getElementById('quantity-input')?.focus();
    }, 100);
  };

  const handleQuantityKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedProductForQuantity && tempQuantity && parseFloat(tempQuantity) > 0) {
        addItemToSubmission(selectedProductForQuantity, parseFloat(tempQuantity));
        setShowQuantityInput(false);
        setSelectedProductForQuantity(null);
        setTempQuantity('1');
        setProductSearchTerm('');
        setFocusedProductIndex(-1);
        setTimeout(() => {
          document.getElementById('product-search')?.focus();
        }, 100);
      }
    } else if (e.key === 'Escape') {
      setShowQuantityInput(false);
      setSelectedProductForQuantity(null);
      setTempQuantity('1');
    }
  };

  // Fonctions pour les commentaires
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

  // Gestion des items de produits avec quantité décimale
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

  // Gestion des soumissions avec numéro automatique
  const handleSubmissionSubmit = async (e) => {
    e.preventDefault();
    try {
      let submissionNumber = submissionForm.submission_number;
      
      if (!editingSubmission) {
        submissionNumber = await generateSubmissionNumber();
      }

      const submissionData = {
        ...submissionForm,
        submission_number: submissionNumber,
        items: selectedItems
      };

      if (editingSubmission) {
        const { error } = await supabase
          .from('submissions')
          .update(submissionData)
          .eq('id', editingSubmission.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('submissions')
          .insert([submissionData]);
        if (error) throw error;
      }

      await fetchSoumissions();
      setShowForm(false);
      setEditingSubmission(null);
      setSelectedItems([]);
      setSubmissionForm({
        client_name: '',
        description: '',
        amount: 0,
        status: 'draft',
        items: [],
        submission_number: ''
      });
      setCalculatedCostTotal(0);
    } catch (error) {
      console.error('Erreur sauvegarde:', error.message);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handlePrintClient = () => {
    // Ajouter classe temporaire pour impression client
    document.body.classList.add('print-client');
    window.print();
    // Retirer la classe après impression
    setTimeout(() => {
      document.body.classList.remove('print-client');
    }, 100);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('fr-CA');
  };

  const filteredSoumissions = soumissions.filter(sub => {
    const matchesSearch = sub.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         sub.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        <p className="ml-4 text-purple-600 font-medium">Chargement des soumissions...</p>
      </div>
    );
  }

  if (showForm) {
    return (
      <>
        /* STYLES CSS POUR L'IMPRESSION OPTIMISÉE */
/* CORRECTION POUR LE CSS D'IMPRESSION - Remplacez vos styles d'impression par ceci */

<style>
{`
/* IMPORTANT: CSS d'impression corrigé pour tableau horizontal */
@media print {
  @page {
    size: letter;
    margin: 0.5in;
  }
  
  body * {
    visibility: hidden;
  }
  
  /* Version client - sans coûts */
  body.print-client .print-area-client,
  body.print-client .print-area-client * {
    visibility: visible !important;
  }
  
  /* Version complète - avec coûts */
  body:not(.print-client) .print-area,
  body:not(.print-client) .print-area * {
    visibility: visible !important;
  }
  
  .print-area,
  .print-area-client {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    background: white;
    padding: 20px;
    font-size: 12px;
    font-family: Arial, sans-serif;
  }
  
  /* Header professionnel */
  .print-header {
    display: flex !important;
    justify-content: space-between !important;
    align-items: flex-start !important;
    margin-bottom: 30px;
    padding-bottom: 15px;
    border-bottom: 2px solid #333;
  }
  
  .print-company-info {
    flex: 1;
    font-size: 11px;
    line-height: 1.4;
  }
  
  .print-submission-header {
    text-align: right;
  }
  
  .print-submission-header h1 {
    font-size: 20px;
    margin: 0 0 5px 0;
    font-weight: bold;
  }
  
  /* Client info */
  .print-client-info {
    margin: 20px 0;
    padding: 15px;
    border: 1px solid #ddd;
    background-color: #f9f9f9;
  }
  
  /* CORRECTION PRINCIPALE - Tableau horizontal */
  .print-table {
    width: 100% !important;
    border-collapse: collapse !important;
    margin: 20px 0 !important;
    table-layout: fixed !important;
    display: table !important; /* Force l'affichage en tableau */
  }
  
  .print-table thead {
    display: table-header-group !important;
  }
  
  .print-table tbody {
    display: table-row-group !important;
  }
  
  .print-table tr {
    display: table-row !important;
    page-break-inside: avoid;
  }
  
  .print-table th,
  .print-table td {
    display: table-cell !important; /* CRUCIAL - Force l'affichage en cellule */
    border: 1px solid #333 !important;
    padding: 8px !important;
    text-align: left !important;
    font-size: 10px !important;
    vertical-align: top !important;
    word-wrap: break-word !important;
  }
  
  .print-table th {
    background-color: #f0f0f0 !important;
    font-weight: bold !important;
    text-align: center !important;
  }
  
  /* Largeurs des colonnes pour version COMPLÈTE */
  .print-table.complete th:nth-child(1),
  .print-table.complete td:nth-child(1) { width: 12% !important; } /* Code */
  
  .print-table.complete th:nth-child(2),
  .print-table.complete td:nth-child(2) { width: 28% !important; } /* Description */
  
  .print-table.complete th:nth-child(3),
  .print-table.complete td:nth-child(3) { width: 8% !important; text-align: center !important; } /* Qté */
  
  .print-table.complete th:nth-child(4),
  .print-table.complete td:nth-child(4) { width: 8% !important; text-align: center !important; } /* Unité */
  
  .print-table.complete th:nth-child(5),
  .print-table.complete td:nth-child(5) { width: 12% !important; text-align: right !important; } /* Prix Unit */
  
  .print-table.complete th:nth-child(6),
  .print-table.complete td:nth-child(6) { width: 12% !important; text-align: right !important; } /* Coût Unit */
  
  .print-table.complete th:nth-child(7),
  .print-table.complete td:nth-child(7) { width: 10% !important; text-align: right !important; } /* Total Vente */
  
  .print-table.complete th:nth-child(8),
  .print-table.complete td:nth-child(8) { width: 10% !important; text-align: right !important; } /* Total Coût */
  
  /* Largeurs des colonnes pour version CLIENT */
  .print-table.client th:nth-child(1),
  .print-table.client td:nth-child(1) { width: 15% !important; } /* Code */
  
  .print-table.client th:nth-child(2),
  .print-table.client td:nth-child(2) { width: 45% !important; } /* Description */
  
  .print-table.client th:nth-child(3),
  .print-table.client td:nth-child(3) { width: 10% !important; text-align: center !important; } /* Qté */
  
  .print-table.client th:nth-child(4),
  .print-table.client td:nth-child(4) { width: 10% !important; text-align: center !important; } /* Unité */
  
  .print-table.client th:nth-child(5),
  .print-table.client td:nth-child(5) { width: 10% !important; text-align: right !important; } /* Prix Unit */
  
  .print-table.client th:nth-child(6),
  .print-table.client td:nth-child(6) { width: 10% !important; text-align: right !important; } /* Total */
  
  /* Totaux */
  .print-totals {
    margin-top: 30px;
    text-align: right;
    page-break-inside: avoid;
  }
  
  .print-totals p {
    font-size: 14px;
    font-weight: bold;
    margin: 8px 0;
  }
  
  /* Commentaires */
  .print-comment {
    font-style: italic;
    color: #666;
    font-size: 9px;
    margin-top: 3px;
  }
  
  .no-print {
    display: none !important;
  }
}
`}
</style>

        <div className="max-w-6xl mx-auto p-4">
          {/* TABLE COMPLÈTE - Avec coûts */}
    <table className="print-table complete">
      <thead>
        <tr>
          <th>Code</th>
          <th>Description</th>
          <th>Qté</th>
          <th>Unité</th>
          <th>Prix Unit.</th>
          <th>Coût Unit.</th>
          <th>Total Vente</th>
          <th>Total Coût</th>
        </tr>
      </thead>
      <tbody>
        {selectedItems.map((item, index) => (
          <tr key={item.product_id}>
            <td>{item.product_id}</td>
            <td>
              {item.description}
              {item.comment && (
                <div className="print-comment">💬 {item.comment}</div>
              )}
            </td>
            <td style={{ textAlign: 'center' }}>{item.quantity}</td>
            <td style={{ textAlign: 'center' }}>{item.unit}</td>
            <td style={{ textAlign: 'right' }}>{formatCurrency(item.selling_price)}</td>
            <td style={{ textAlign: 'right' }}>{formatCurrency(item.cost_price)}</td>
            <td style={{ textAlign: 'right' }}>{formatCurrency(item.selling_price * item.quantity)}</td>
            <td style={{ textAlign: 'right' }}>{formatCurrency(item.cost_price * item.quantity)}</td>
          </tr>
        ))}
      </tbody>
    </table>

    <div className="print-totals">
      <p>TOTAL VENTE: {formatCurrency(submissionForm.amount)}</p>
      <p>TOTAL COÛT: {formatCurrency(calculatedCostTotal)}</p>
      <p style={{ color: '#2563eb' }}>
        MARGE: {formatCurrency(submissionForm.amount - calculatedCostTotal)}
        {submissionForm.amount > 0 && calculatedCostTotal > 0 && (
          <span style={{ fontSize: '12px' }}>
            {" "}({((submissionForm.amount - calculatedCostTotal) / submissionForm.amount * 100).toFixed(1)}%)
          </span>
        )}
      </p>
    </div>
  </div>
            )}
          </td>
          <td style={{ display: 'table-cell', border: '1px solid #333', padding: '8px', textAlign: 'center', fontSize: '11px' }}>{item.quantity}</td>
          <td style={{ display: 'table-cell', border: '1px solid #333', padding: '8px', textAlign: 'center', fontSize: '11px' }}>{item.unit}</td>
          <td style={{ display: 'table-cell', border: '1px solid #333', padding: '8px', textAlign: 'right', fontSize: '11px' }}>{formatCurrency(item.selling_price)}</td>
          <td style={{ display: 'table-cell', border: '1px solid #333', padding: '8px', textAlign: 'right', fontSize: '11px' }}>{formatCurrency(item.cost_price)}</td>
          <td style={{ display: 'table-cell', border: '1px solid #333', padding: '8px', textAlign: 'right', fontSize: '11px' }}>{formatCurrency(item.selling_price * item.quantity)}</td>
          <td style={{ display: 'table-cell', border: '1px solid #333', padding: '8px', textAlign: 'right', fontSize: '11px' }}>{formatCurrency(item.cost_price * item.quantity)}</td>
        </tr>
      ))}
    </tbody>
  </table>
)}

            <div className="print-totals">
              <p style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>
                TOTAL VENTE: {formatCurrency(submissionForm.amount)}
              </p>
              <p style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>
                TOTAL COÛT: {formatCurrency(calculatedCostTotal)}
              </p>
              <p style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '20px', color: '#2563eb' }}>
                MARGE: {formatCurrency(submissionForm.amount - calculatedCostTotal)}
                {submissionForm.amount > 0 && calculatedCostTotal > 0 && (
                  <span style={{ fontSize: '12px', marginLeft: '10px' }}>
                    ({((submissionForm.amount - calculatedCostTotal) / submissionForm.amount * 100).toFixed(1)}%)
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* TABLE HTML CORRIGÉE - Version Client */}
{selectedItems.length > 0 && (
  <div className="print-area-client">
    {/* Header reste identique */}
    <div className="print-header">
      <div className="print-company-info">
        <strong>Services TMT Inc.</strong><br />
        195, 42e Rue Nord<br />
        Saint-Georges, QC G5Z 0V9<br />
        Tél: (418) 225-3875<br />
        info.servicestmt@gmail.com
      </div>
      <div className="print-submission-header">
        <h1>SOUMISSION</h1>
        <p><strong>N°:</strong> {submissionForm.submission_number}</p>
        <p><strong>Date:</strong> {new Date().toLocaleDateString('fr-CA')}</p>
      </div>
    </div>

    <div className="print-client-info">
      <strong>CLIENT:</strong> {submissionForm.client_name}<br />
      <strong>DESCRIPTION:</strong> {submissionForm.description}
    </div>

    {/* TABLE CORRIGÉE - Horizontale */}
    <table className="print-table client">
      <thead>
        <tr>
          <th>Code</th>
          <th>Description</th>
          <th>Qté</th>
          <th>Unité</th>
          <th>Prix Unit.</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {selectedItems.map((item, index) => (
          <tr key={item.product_id}>
            <td>{item.product_id}</td>
            <td>
              {item.description}
              {item.comment && (
                <div className="print-comment">💬 {item.comment}</div>
              )}
            </td>
            <td style={{ textAlign: 'center' }}>{item.quantity}</td>
            <td style={{ textAlign: 'center' }}>{item.unit}</td>
            <td style={{ textAlign: 'right' }}>{formatCurrency(item.selling_price)}</td>
            <td style={{ textAlign: 'right' }}>{formatCurrency(item.selling_price * item.quantity)}</td>
          </tr>
        ))}
      </tbody>
    </table>

    <div className="print-totals">
      <p>TOTAL: {formatCurrency(submissionForm.amount)}</p>
    </div>
  </div>
            )}
          </td>
          <td style={{ display: 'table-cell', border: '1px solid #333', padding: '8px', textAlign: 'center', fontSize: '11px' }}>{item.quantity}</td>
          <td style={{ display: 'table-cell', border: '1px solid #333', padding: '8px', textAlign: 'center', fontSize: '11px' }}>{item.unit}</td>
          <td style={{ display: 'table-cell', border: '1px solid #333', padding: '8px', textAlign: 'right', fontSize: '11px' }}>{formatCurrency(item.selling_price)}</td>
          <td style={{ display: 'table-cell', border: '1px solid #333', padding: '8px', textAlign: 'right', fontSize: '11px' }}>{formatCurrency(item.selling_price * item.quantity)}</td>
        </tr>
      ))}
    </tbody>
  </table>
)}

            <div className="print-totals">
              <p style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '20px' }}>
                TOTAL: {formatCurrency(submissionForm.amount)}
              </p>
            </div>
          </div>

          {/* FORMULAIRE SOUMISSION MOBILE-FRIENDLY */}
          <div className="bg-white rounded-xl shadow-lg border border-purple-200 overflow-hidden">
            
            {/* En-tête du formulaire responsive */}
            <div className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white p-4 sm:p-6 no-print">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                <div className="flex items-center space-x-4">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold">
                      {editingSubmission ? '✏️ Modifier Soumission' : '📝 Nouvelle Soumission'}
                    </h2>
                    <p className="text-purple-100 text-sm mt-1">
                      {editingSubmission ? 'Modifiez les informations' : 'Créez une nouvelle soumission'}
                    </p>
                  </div>
                  {submissionForm.submission_number && (
                    <div className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-lg">
                      <span className="text-sm font-medium">N°: {submissionForm.submission_number}</span>
                    </div>
                  )}
                </div>
                
                {/* Boutons d'action responsive */}
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                  <button
                    onClick={handlePrint}
                    className="w-full sm:w-auto px-4 py-2 bg-white/20 rounded-lg hover:bg-white/30 text-sm font-medium"
                  >
                    🖨️ Imprimer
                  </button>
                  <button
                    onClick={handlePrintClient}
                    className="w-full sm:w-auto px-4 py-2 bg-green-500/20 rounded-lg hover:bg-green-500/30 text-sm font-medium"
                  >
                    <Printer className="w-4 h-4 inline mr-1" />
                    Impression Client
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditingSubmission(null);
                      setSelectedItems([]);
                      setSubmissionForm({
                        client_name: '', 
                        description: '', 
                        amount: 0, 
                        status: 'draft', 
                        items: [],
                        submission_number: ''
                      });
                      setCalculatedCostTotal(0);
                      setProductSearchTerm('');
                      setFocusedProductIndex(-1);
                    }}
                    className="w-full sm:w-auto px-4 py-2 bg-white/10 border border-white/20 rounded-lg hover:bg-white/20 text-sm font-medium"
                  >
                    ❌ Annuler
                  </button>
                  <button
                    type="submit"
                    form="submission-form"
                    className="w-full sm:w-auto px-4 py-2 bg-white text-purple-600 rounded-lg hover:bg-gray-50 font-medium text-sm"
                  >
                    {editingSubmission ? '💾 Mettre à jour' : '✨ Créer'}
                  </button>
                </div>
              </div>
            </div>
            
            {/* Contenu du formulaire */}
            <div className="p-4 sm:p-6 no-print">
              <form id="submission-form" onSubmit={handleSubmissionSubmit} className="space-y-6">
                
                {/* Client et Description - Stack sur mobile */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <label className="block text-sm font-semibold text-blue-800 mb-2">
                      👤 Client *
                    </label>
                    <select
                      value={submissionForm.client_name}
                      onChange={(e) => setSubmissionForm({...submissionForm, client_name: e.target.value})}
                      className="block w-full rounded-lg border-blue-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3"
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

                  <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                    <label className="block text-sm font-semibold text-green-800 mb-2">
                      📝 Description *
                    </label>
                    <input
                      type="text"
                      value={submissionForm.description}
                      onChange={(e) => setSubmissionForm({...submissionForm, description: e.target.value})}
                      className="block w-full rounded-lg border-green-300 shadow-sm focus:border-green-500 focus:ring-green-500 text-base p-3"
                      placeholder="Description de la soumission..."
                      required
                    />
                  </div>
                </div>

                {/* Statut pour édition */}
                {editingSubmission && (
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <label className="block text-sm font-semibold text-gray-800 mb-2">
                      🏷️ Statut
                    </label>
                    <select
                      value={submissionForm.status}
                      onChange={(e) => setSubmissionForm({...submissionForm, status: e.target.value})}
                      className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base p-3"
                    >
                      <option value="draft">📝 Brouillon</option>
                      <option value="sent">📤 Envoyée</option>
                      <option value="accepted">✅ Acceptée</option>
                    </select>
                  </div>
                )}

                {/* Section recherche produits MOBILE-FRIENDLY */}
                <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                  <h3 className="text-base sm:text-lg font-semibold text-indigo-800 mb-4">
                    🔍 Recherche Produits (6718 au total)
                  </h3>
                  
                  <div className="flex flex-col sm:flex-row gap-3 mb-4">
                    <div className="flex-1">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                          id="product-search"
                          type="text"
                          placeholder="Rechercher un produit - minimum 2 caractères..."
                          value={productSearchTerm}
                          onChange={(e) => {
                            setProductSearchTerm(e.target.value);
                            setFocusedProductIndex(-1);
                          }}
                          onKeyDown={handleProductKeyDown}
                          className="block w-full pl-10 pr-4 py-3 rounded-lg border-indigo-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base"
                          autoComplete="off"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowQuickAddProduct(true)}
                      className="w-full sm:w-auto px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-medium flex items-center justify-center"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Produit Non-Inventaire
                    </button>
                  </div>
                  
                  {/* Résultats recherche mobile-friendly */}
                  {searchingProducts && (
                    <div className="flex items-center justify-center p-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mr-2"></div>
                      <span className="text-indigo-600">Recherche en cours...</span>
                    </div>
                  )}
                  
                  {productSearchTerm && productSearchTerm.length < 2 && !searchingProducts && (
                    <div className="p-4 text-center text-gray-500 border border-gray-200 rounded-lg">
                      Tapez au moins 2 caractères pour rechercher dans les 6718 produits
                    </div>
                  )}
                  
                  {productSearchTerm.length >= 2 && !searchingProducts && (
                    <div className="max-h-60 overflow-y-auto border border-indigo-200 rounded-lg">
                      {products.length === 0 ? (
                        <div className="p-4 text-center text-gray-500">
                          Aucun produit trouvé pour "{productSearchTerm}"
                          <br />
                          <span className="text-xs">Essayez avec d'autres mots-clés</span>
                        </div>
                      ) : (
                        <>
                          <div className="p-2 bg-gray-50 text-xs text-gray-600 border-b">
                            {products.length} résultat(s) trouvé(s) {products.length === 50 ? '(50 max affichés)' : ''}
                          </div>
                          {products.map((product, index) => (
                            <div 
                              key={product.product_id} 
                              data-product-index={index}
                              className={`p-3 border-b border-indigo-100 hover:bg-indigo-50 cursor-pointer ${
                                index === focusedProductIndex ? 'bg-indigo-100 border-indigo-300' : ''
                              }`}
                              onClick={() => selectProductForQuantity(product)}
                            >
                              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                                <div className="flex-1">
                                  <h4 className="font-medium text-gray-900 text-sm">
                                    {product.product_id} - {product.description}
                                  </h4>
                                  <div className="text-xs text-gray-500 space-y-1 sm:space-y-0 sm:space-x-4 sm:flex">
                                    <span>📦 Groupe: {product.product_group}</span>
                                    <span>📏 Unité: {product.unit}</span>
                                    <span>📊 Stock: {product.stock_qty}</span>
                                  </div>
                                  <div className="flex flex-col sm:flex-row sm:space-x-4 text-xs mt-1">
                                    <span className="text-indigo-600 font-medium">
                                      💰 Vente: {formatCurrency(product.selling_price)}
                                    </span>
                                    <span className="text-orange-600 font-medium">
                                      🏷️ Coût: {formatCurrency(product.cost_price)}
                                    </span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className="w-full sm:w-auto px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
                                >
                                  ➕ Ajouter
                                </button>
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Modal quantité MOBILE-FRIENDLY */}
                {showQuantityInput && selectedProductForQuantity && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg w-full max-w-md">
                      <div className="p-4 sm:p-6">
                        <h3 className="text-lg font-semibold mb-4">
                          Quantité pour: {selectedProductForQuantity.description}
                        </h3>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Quantité ({selectedProductForQuantity.unit})
                            </label>
                            <input
                              id="quantity-input"
                              type="number"
                              step="0.1"
                              min="0.1"
                              value={tempQuantity}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (value === '' || parseFloat(value) >= 0) {
                                  setTempQuantity(value);
                                }
                              }}
                              onKeyDown={handleQuantityKeyDown}
                              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3"
                              autoFocus
                            />
                          </div>
                          <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                            <p>Prix vente: {formatCurrency(selectedProductForQuantity.selling_price)} / {selectedProductForQuantity.unit}</p>
                            <p>Prix coût: {formatCurrency(selectedProductForQuantity.cost_price)} / {selectedProductForQuantity.unit}</p>
                            <p className="font-medium text-green-700 mt-2">
                              Total vente: {formatCurrency(selectedProductForQuantity.selling_price * parseFloat(tempQuantity || 0))}
                            </p>
                            <p className="font-medium text-orange-700">
                              Total coût: {formatCurrency(selectedProductForQuantity.cost_price * parseFloat(tempQuantity || 0))}
                            </p>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                setShowQuantityInput(false);
                                setSelectedProductForQuantity(null);
                                setTempQuantity('1');
                              }}
                              className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                            >
                              Annuler
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (tempQuantity && parseFloat(tempQuantity) > 0) {
                                  addItemToSubmission(selectedProductForQuantity, parseFloat(tempQuantity));
                                  setShowQuantityInput(false);
                                  setSelectedProductForQuantity(null);
                                  setTempQuantity('1');
                                  setProductSearchTerm('');
                                  setFocusedProductIndex(-1);
                                }
                              }}
                              className="w-full sm:flex-1 px-4 py-2 border border-transparent rounded-lg text-white bg-blue-600 hover:bg-blue-700"
                            >
                              Ajouter
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Modal ajout rapide produit MOBILE-FRIENDLY */}
                {showQuickAddProduct && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                      <div className="p-4 sm:p-6">
                        <h3 className="text-lg font-semibold mb-4 text-orange-600">
                          ➕ Ajouter Produit Non-Inventaire
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Code Produit *</label>
                            <input
                              type="text"
                              value={quickProductForm.product_id}
                              onChange={(e) => setQuickProductForm({...quickProductForm, product_id: e.target.value})}
                              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3"
                              placeholder="Ex: TEMP-001"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Unité</label>
                            <select
                              value={quickProductForm.unit}
                              onChange={(e) => setQuickProductForm({...quickProductForm, unit: e.target.value})}
                              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3"
                            >
                              <option value="Un">Un</option>
                              <option value="M">m</option>
                              <option value="PI">Pi</option>
                              <option value="L">litre</option>
                              <option value="H">heure</option>
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Description *</label>
                            <input
                              type="text"
                              value={quickProductForm.description}
                              onChange={(e) => setQuickProductForm({...quickProductForm, description: e.target.value})}
                              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3"
                              placeholder="Description du produit..."
                              required
                            />
                          </div>
                          
                          {/* PRIX COÛT AVEC CALCULATEUR USD */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Prix Coût CAD *</label>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={quickProductForm.cost_price}
                                onChange={(e) => setQuickProductForm({...quickProductForm, cost_price: e.target.value})}
                                className="flex-1 rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3"
                                placeholder="0.00"
                                required
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setShowUsdCalculator(!showUsdCalculator);
                                  if (!showUsdCalculator) {
                                    fetchExchangeRate();
                                  }
                                }}
                                className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm font-medium flex items-center"
                                title="Convertir USD → CAD"
                              >
                                <DollarSign className="w-4 h-4 mr-1" />
                                USD
                              </button>
                            </div>

                            {/* MINI-CALCULATEUR USD INLINE */}
                            {showUsdCalculator && (
                              <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="text-sm font-medium text-blue-800 flex items-center">
                                    <Calculator className="w-4 h-4 mr-1" />
                                    Convertir USD → CAD
                                  </h4>
                                  <button
                                    type="button"
                                    onClick={() => setShowUsdCalculator(false)}
                                    className="text-blue-600 hover:text-blue-800"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                                
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2 text-sm">
                                    <span className="text-blue-700">Taux:</span>
                                    <span className="font-medium">1 USD = {usdToCadRate.toFixed(4)} CAD</span>
                                    {loadingExchangeRate && (
                                      <div className="animate-spin rounded-full h-3 w-3 border-b border-blue-600"></div>
                                    )}
                                    <button
                                      type="button"
                                      onClick={fetchExchangeRate}
                                      className="text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded hover:bg-blue-300"
                                      disabled={loadingExchangeRate}
                                    >
                                      🔄 Actualiser
                                    </button>
                                  </div>
                                  
                                  {exchangeRateError && (
                                    <div className="text-xs text-orange-600 bg-orange-50 p-2 rounded">
                                      {exchangeRateError}
                                    </div>
                                  )}
                                  
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={usdAmount}
                                      onChange={(e) => setUsdAmount(e.target.value)}
                                      placeholder="Montant USD"
                                      className="flex-1 rounded border-blue-300 text-sm p-2"
                                    />
                                    <span className="text-sm text-blue-700">USD</span>
                                    <span className="text-sm">=</span>
                                    <span className="font-medium text-green-700">
                                      {usdAmount ? (parseFloat(usdAmount) * usdToCadRate).toFixed(2) : '0.00'} CAD
                                    </span>
                                  </div>
                                  
                                  <button
                                    type="button"
                                    onClick={useConvertedAmount}
                                    disabled={!usdAmount || parseFloat(usdAmount) <= 0}
                                    className="w-full px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                                  >
                                    ✅ Utiliser {usdAmount ? (parseFloat(usdAmount) * usdToCadRate).toFixed(2) : '0.00'} CAD
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* PRIX VENTE AVEC BOUTONS DE PROFIT */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Prix Vente CAD *</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={quickProductForm.selling_price}
                              onChange={(e) => setQuickProductForm({...quickProductForm, selling_price: e.target.value})}
                              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3"
                              placeholder="0.00"
                              required
                            />
                            
                            {/* BOUTONS DE PROFIT */}
                            {quickProductForm.cost_price && parseFloat(quickProductForm.cost_price) > 0 && (
                              <div className="mt-2">
                                <p className="text-xs text-gray-600 mb-2">Profit automatique:</p>
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => applyProfitMargin(15)}
                                    className="flex-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200 font-medium"
                                  >
                                    +15%
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => applyProfitMargin(20)}
                                    className="flex-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 font-medium"
                                  >
                                    +20%
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => applyProfitMargin(25)}
                                    className="flex-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs hover:bg-purple-200 font-medium"
                                  >
                                    +25%
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {quickProductForm.selling_price && quickProductForm.cost_price && (
                          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                            <p className="text-sm text-blue-800">
                              💰 Marge: {formatCurrency(parseFloat(quickProductForm.selling_price || 0) - parseFloat(quickProductForm.cost_price || 0))} 
                              ({((parseFloat(quickProductForm.selling_price || 0) - parseFloat(quickProductForm.cost_price || 0)) / parseFloat(quickProductForm.selling_price || 1) * 100).toFixed(1)}%)
                            </p>
                          </div>
                        )}
                        
                        <div className="flex flex-col sm:flex-row gap-3 mt-6">
                          <button
                            type="button"
                            onClick={() => {
                              setShowQuickAddProduct(false);
                              setQuickProductForm({
                                product_id: '',
                                description: '',
                                selling_price: '',
                                cost_price: '',
                                unit: 'Un',
                                product_group: 'Divers'
                              });
                              setShowUsdCalculator(false);
                              setUsdAmount('');
                            }}
                            className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                          >
                            Annuler
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (quickProductForm.product_id && quickProductForm.description && 
                                  quickProductForm.selling_price && quickProductForm.cost_price) {
                                const tempProduct = {
                                  product_id: quickProductForm.product_id,
                                  description: quickProductForm.description,
                                  selling_price: parseFloat(quickProductForm.selling_price),
                                  cost_price: parseFloat(quickProductForm.cost_price),
                                  unit: quickProductForm.unit,
                                  product_group: quickProductForm.product_group,
                                  stock_qty: 0
                                };
                                
                                addItemToSubmission(tempProduct, 1);
                                
                                setShowQuickAddProduct(false);
                                setQuickProductForm({
                                  product_id: '',
                                  description: '',
                                  selling_price: '',
                                  cost_price: '',
                                  unit: 'Un',
                                  product_group: 'Divers'
                                });
                                setShowUsdCalculator(false);
                                setUsdAmount('');
                              }
                            }}
                            className="w-full sm:flex-1 px-4 py-2 border border-transparent rounded-lg text-white bg-orange-600 hover:bg-orange-700"
                          >
                            ✅ Ajouter à la soumission
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* MODAL POUR LES COMMENTAIRES */}
                {showCommentModal && editingCommentItem && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg w-full max-w-md">
                      <div className="p-4 sm:p-6">
                        <h3 className="text-lg font-semibold mb-4 flex items-center">
                          <MessageSquare className="w-5 h-5 mr-2 text-blue-600" />
                          Commentaire pour: {editingCommentItem.description}
                        </h3>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Commentaire (optionnel)
                            </label>
                            <textarea
                              value={tempComment}
                              onChange={(e) => setTempComment(e.target.value)}
                              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3 h-24 resize-none"
                              placeholder="Ajouter un commentaire pour ce produit..."
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              Ce commentaire apparaîtra sur la soumission imprimée
                            </p>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-3">
                            <button
                              type="button"
                              onClick={closeCommentModal}
                              className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                            >
                              Annuler
                            </button>
                            <button
                              type="button"
                              onClick={saveComment}
                              className="w-full sm:flex-1 px-4 py-2 border border-transparent rounded-lg text-white bg-blue-600 hover:bg-blue-700"
                            >
                              💾 Enregistrer
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Items sélectionnés MOBILE-FRIENDLY */}
                {selectedItems.length > 0 && (
                  <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                    <h3 className="text-base sm:text-lg font-semibold text-yellow-800 mb-4">
                      📦 Produits Sélectionnés ({selectedItems.length})
                    </h3>
                    
                    {/* Tableau responsive */}
                    <div className="hidden sm:block max-h-80 overflow-y-auto border border-yellow-200 rounded-lg bg-white">
                      <table className="w-full text-sm">
                        <thead className="bg-yellow-100 sticky top-0">
                          <tr>
                            <th className="text-left p-2 font-semibold">Code</th>
                            <th className="text-left p-2 font-semibold">Description</th>
                            <th className="text-center p-2 font-semibold">Qté</th>
                            <th className="text-right p-2 font-semibold text-green-700">💰 Prix Vente</th>
                            <th className="text-right p-2 font-semibold text-orange-700">🏷️ Prix Coût</th>
                            <th className="text-right p-2 font-semibold">Total Vente</th>
                            <th className="text-right p-2 font-semibold">Total Coût</th>
                            <th className="text-center p-2 font-semibold">💬</th>
                            <th className="text-center p-2 font-semibold">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...selectedItems].reverse().map((item, reverseIndex) => {
                            const originalIndex = selectedItems.length - 1 - reverseIndex;
                            return (
                              <tr key={item.product_id} className="border-b border-yellow-100 hover:bg-yellow-50">
                                <td className="p-2 font-mono text-xs">{item.product_id}</td>
                                <td className="p-2">
                                  <div className="max-w-xs">
                                    <div className="font-medium text-gray-900 truncate">{item.description}</div>
                                    <div className="text-xs text-gray-500">{item.product_group} • {item.unit}</div>
                                    {item.comment && (
                                      <div className="text-xs text-blue-600 italic mt-1 truncate">
                                        💬 {item.comment}
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="p-2 text-center">
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0.1"
                                    value={item.quantity}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      if (value === '' || parseFloat(value) >= 0) {
                                        updateItemQuantity(item.product_id, value);
                                      }
                                    }}
                                    className="w-16 text-center rounded border-gray-300 text-sm"
                                  />
                                </td>
                                <td className="p-2 text-right">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={item.selling_price}
                                    onChange={(e) => updateItemPrice(item.product_id, 'selling_price', e.target.value)}
                                    className="w-20 text-right rounded border-green-300 text-sm focus:border-green-500 focus:ring-green-500"
                                  />
                                </td>
                                <td className="p-2 text-right">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={item.cost_price}
                                    onChange={(e) => updateItemPrice(item.product_id, 'cost_price', e.target.value)}
                                    className="w-20 text-right rounded border-orange-300 text-sm focus:border-orange-500 focus:ring-orange-500"
                                  />
                                </td>
                                <td className="p-2 text-right font-medium text-green-700">
                                  {formatCurrency(item.selling_price * item.quantity)}
                                </td>
                                <td className="p-2 text-right font-medium text-orange-700">
                                  {formatCurrency(item.cost_price * item.quantity)}
                                </td>
                                <td className="p-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() => openCommentModal(item)}
                                    className={`px-2 py-1 rounded text-xs ${
                                      item.comment 
                                        ? 'bg-blue-100 text-blue-800 hover:bg-blue-200' 
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                    title={item.comment ? 'Modifier commentaire' : 'Ajouter commentaire'}
                                  >
                                    <MessageSquare className="w-3 h-3" />
                                  </button>
                                </td>
                                <td className="p-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() => removeItemFromSubmission(item.product_id)}
                                    className="px-2 py-1 bg-red-100 text-red-800 rounded hover:bg-red-200 text-xs"
                                    title="Supprimer"
                                  >
                                    ❌
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Cards pour mobile */}
                    <div className="sm:hidden space-y-3">
                      {[...selectedItems].reverse().map((item) => (
                        <div key={item.product_id} className="bg-white p-3 rounded-lg border border-yellow-200">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900 text-sm">{item.product_id}</h4>
                              <p className="text-xs text-gray-600">{item.description}</p>
                              <p className="text-xs text-gray-500">{item.product_group} • {item.unit}</p>
                              {item.comment && (
                                <p className="text-xs text-blue-600 italic mt-1">💬 {item.comment}</p>
                              )}
                            </div>
                            <div className="flex gap-1 ml-2">
                              <button
                                type="button"
                                onClick={() => openCommentModal(item)}
                                className={`p-1 rounded ${
                                  item.comment 
                                    ? 'bg-blue-100 text-blue-800 hover:bg-blue-200' 
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                                title={item.comment ? 'Modifier commentaire' : 'Ajouter commentaire'}
                              >
                                <MessageSquare className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeItemFromSubmission(item.product_id)}
                                className="p-1 bg-red-100 text-red-800 rounded hover:bg-red-200"
                                title="Supprimer"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Quantité</label>
                              <input
                                type="number"
                                step="0.1"
                                min="0.1"
                                value={item.quantity}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  if (value === '' || parseFloat(value) >= 0) {
                                    updateItemQuantity(item.product_id, value);
                                  }
                                }}
                                className="w-full text-center rounded border-gray-300 text-sm p-2"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-green-700 mb-1">Prix Vente</label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={item.selling_price}
                                onChange={(e) => updateItemPrice(item.product_id, 'selling_price', e.target.value)}
                                className="w-full text-right rounded border-green-300 text-sm focus:border-green-500 focus:ring-green-500 p-2"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-orange-700 mb-1">Prix Coût</label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={item.cost_price}
                                onChange={(e) => updateItemPrice(item.product_id, 'cost_price', e.target.value)}
                                className="w-full text-right rounded border-orange-300 text-sm focus:border-orange-500 focus:ring-orange-500 p-2"
                              />
                            </div>
                          </div>
                          
                          <div className="mt-2 pt-2 border-t border-gray-200 flex justify-between text-sm">
                            <span className="text-green-700 font-medium">
                              Total vente: {formatCurrency(item.selling_price * item.quantity)}
                            </span>
                            <span className="text-orange-700 font-medium">
                              Total coût: {formatCurrency(item.cost_price * item.quantity)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="mt-3 space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-yellow-700">
                          📊 {selectedItems.length} article(s) • 
                          Total quantité: {selectedItems.reduce((sum, item) => sum + parseFloat(item.quantity), 0).toFixed(1)} unités
                        </span>
                        <div className="flex flex-col sm:flex-row sm:space-x-4">
                          <span className="text-green-700 font-medium">
                            💰 {formatCurrency(submissionForm.amount)}
                          </span>
                          <span className="text-orange-700 font-medium">
                            🏷️ {formatCurrency(calculatedCostTotal)}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-yellow-600 bg-yellow-200 p-2 rounded">
                        💡 Utilisez ↑↓ pour naviguer, quantités décimales (0.1), prix modifiables, 💬 commentaires, 💱 USD→CAD, +15/20/25% profit
                      </div>
                    </div>
                  </div>
                )}

                {/* Totaux responsive */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-green-100 p-4 rounded-lg border border-green-300">
                    <label className="block text-base sm:text-lg font-semibold text-green-800 mb-2">
                      💰 Total Vente
                    </label>
                    <div className="text-xl sm:text-2xl font-bold text-green-900">
                      {formatCurrency(submissionForm.amount)}
                    </div>
                  </div>
                  
                  <div className="bg-orange-100 p-4 rounded-lg border border-orange-300">
                    <label className="block text-base sm:text-lg font-semibold text-orange-800 mb-2">
                      🏷️ Total Coût
                    </label>
                    <div className="text-xl sm:text-2xl font-bold text-orange-900">
                      {formatCurrency(calculatedCostTotal)}
                    </div>
                  </div>

                  <div className="bg-blue-100 p-4 rounded-lg border border-blue-300">
                    <label className="block text-base sm:text-lg font-semibold text-blue-800 mb-2">
                      📈 Marge
                    </label>
                    <div className="text-xl sm:text-2xl font-bold text-blue-900">
                      {formatCurrency(submissionForm.amount - calculatedCostTotal)}
                    </div>
                    {submissionForm.amount > 0 && calculatedCostTotal > 0 && (
                      <div className="text-sm text-blue-700">
                        {((submissionForm.amount - calculatedCostTotal) / submissionForm.amount * 100).toFixed(1)}%
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-center">
                  <p className="text-gray-600 text-sm">
                    📋 {selectedItems.length} produit(s) sélectionné(s) • 
                    Utilisez les boutons dans la barre violette ci-dessus pour sauvegarder
                  </p>
                </div>
              </form>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    // Le reste du code reste identique...
    <div className="space-y-6 p-4">
      {/* En-tête responsive avec statistiques */}
      <div className="bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 rounded-xl shadow-lg p-4 sm:p-6 text-white">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold">📝 Gestion des Soumissions</h2>
            <p className="text-white/90 text-sm sm:text-base mt-1">
              Créez et gérez vos soumissions avec calculateur USD→CAD et marges automatiques
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            {/* Modal upload inventaire */}
            {showInventoryUpload && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg w-full max-w-md">
                  <div className="p-4 sm:p-6">
                    <h3 className="text-lg font-semibold mb-4">
                      <Upload className="w-5 h-5 inline mr-2 text-purple-600" />
                      Importer Inventaire
                    </h3>
                    <div className="space-y-4">
                      <p className="text-sm text-gray-600">
                        Sélectionnez votre fichier d'inventaire Excel (.xlsx, .xls) ou CSV
                      </p>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleInventoryUpload}
                        className="block w-full text-sm text-gray-500
                          file:mr-4 file:py-2 file:px-4
                          file:rounded-full file:border-0
                          file:text-sm file:font-semibold
                          file:bg-purple-50 file:text-purple-700
                          hover:file:bg-purple-100"
                        disabled={uploadingInventory}
                      />
                      {uploadingInventory && (
                        <div className="flex items-center justify-center p-4">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600 mr-2"></div>
                          <span className="text-purple-600">Import en cours...</span>
                        </div>
                      )}
                      <div className="flex gap-3">
                        <button
                          onClick={() => setShowInventoryUpload(false)}
                          disabled={uploadingInventory}
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={() => setShowInventoryUpload(true)}
              className="w-full sm:w-auto px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-sm font-medium hover:bg-white/20 backdrop-blur-sm flex items-center justify-center"
            >
              <Upload className="w-4 h-4 mr-2" />
              Inventaire
            </button>
            <button
              onClick={handleSendReport}
              disabled={sendingReport}
              className="w-full sm:w-auto px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-sm font-medium hover:bg-white/20 backdrop-blur-sm"
            >
              📧 {sendingReport ? 'Envoi...' : 'Rapport'}
            </button>
            <button
              onClick={async () => {
                try {
                  const newNumber = await generateSubmissionNumber();
                  setSubmissionForm(prev => ({
                    ...prev,
                    submission_number: newNumber
                  }));
                  setShowForm(true);
                } catch (error) {
                  console.error('Erreur génération numéro:', error);
                  setShowForm(true);
                }
              }}
              className="w-full sm:w-auto px-4 py-2 bg-white text-purple-600 rounded-lg hover:bg-gray-100 font-medium text-sm"
            >
              ➕ Nouvelle Soumission
            </button>
          </div>
        </div>

        {/* Statistiques responsive */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">📊</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Total</p>
                <p className="text-xl sm:text-2xl font-bold">{soumissions.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">📝</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Brouillons</p>
                <p className="text-xl sm:text-2xl font-bold">
                  {soumissions.filter(s => s.status === 'draft').length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">📤</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Envoyées</p>
                <p className="text-xl sm:text-2xl font-bold">
                  {soumissions.filter(s => s.status === 'sent').length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">💰</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Total Vente</p>
                <p className="text-lg sm:text-2xl font-bold">
                  {formatCurrency(soumissions.reduce((sum, s) => sum + (s.amount || 0), 0))}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Info système */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-sm text-gray-600">
          📊 {soumissions.length} soumissions • {clients.length} clients • 6718 produits • 💬 Commentaires • 💱 USD→CAD (Taux: {usdToCadRate.toFixed(4)}) • 🎯 Marges auto • 📁 Import inventaire
        </p>
      </div>

      {/* Filtres responsive */}
      <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="🔍 Rechercher par client ou description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-4 py-3 rounded-lg border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-base"
              />
            </div>
          </div>
          <div className="w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-base p-3"
            >
              <option value="all">Tous les statuts</option>
              <option value="draft">📝 Brouillons</option>
              <option value="sent">📤 Envoyées</option>
              <option value="accepted">✅ Acceptées</option>
            </select>
          </div>
        </div>
      </div>

      {/* DESKTOP VIEW - Table compacte */}
      <div className="hidden lg:block bg-white shadow-lg rounded-lg overflow-hidden">
        {filteredSoumissions.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-6xl mb-4 block">📝</span>
            <p className="text-gray-500 text-lg">Aucune soumission trouvée</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Soumission
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client & Description
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Montant
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredSoumissions.map((submission) => (
                <tr key={submission.id} className="hover:bg-gray-50">
                  <td className="px-3 py-4 whitespace-nowrap">
                    <div className="text-sm space-y-1">
                      {submission.submission_number && (
                        <div className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs font-medium inline-block">
                          N°: {submission.submission_number}
                        </div>
                      )}
                      {submission.items?.some(item => item.comment) && (
                        <div className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium inline-block ml-1">
                          💬
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <div className="text-sm">
                      <div className="font-medium text-gray-900">{submission.client_name}</div>
                      <div className="text-gray-500 truncate max-w-xs" title={submission.description}>
                        {submission.description}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-medium text-green-600">
                      {formatCurrency(submission.amount)}
                    </div>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      submission.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                      submission.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {submission.status === 'sent' ? '📤' :
                       submission.status === 'draft' ? '📝' : '✅'}
                    </span>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                    {formatDate(submission.created_at)}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-center">
                    <div className="flex justify-center space-x-1">
                      <button
                        onClick={() => {
                          setEditingSubmission(submission);
                          setSubmissionForm({
                            client_name: submission.client_name,
                            description: submission.description,
                            amount: submission.amount,
                            status: submission.status,
                            items: submission.items || [],
                            submission_number: submission.submission_number || ''
                          });
                          setSelectedItems(submission.items || []);
                          const existingCostTotal = (submission.items || []).reduce((sum, item) => 
                            sum + ((item.cost_price || 0) * (item.quantity || 0)), 0
                          );
                          setCalculatedCostTotal(existingCostTotal);
                          setShowForm(true);
                        }}
                        className="bg-purple-100 text-purple-700 hover:bg-purple-200 p-2 rounded-lg transition-colors"
                        title="Modifier"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteSubmission(submission.id)}
                        className="bg-red-100 text-red-700 hover:bg-red-200 p-2 rounded-lg transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* MOBILE VIEW - Cards empilées */}
      <div className="lg:hidden space-y-4">
        {filteredSoumissions.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <span className="text-6xl mb-4 block">📝</span>
            <p className="text-gray-500 text-lg">Aucune soumission trouvée</p>
          </div>
        ) : (
          filteredSoumissions.map((submission) => (
            <div key={submission.id} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
              
              {/* En-tête de la card */}
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">
                      {submission.status === 'sent' ? '📤' :
                       submission.status === 'draft' ? '📝' : '✅'}
                    </span>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-base">
                        👤 {submission.client_name}
                      </h3>
                      <div className="flex items-center gap-2">
                        {submission.submission_number && (
                          <p className="text-sm text-purple-600">N°: {submission.submission_number}</p>
                        )}
                        {submission.items?.some(item => item.comment) && (
                          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
                            💬 Commentaires
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Menu actions mobile */}
                  <div className="relative">
                    <button
                      onClick={() => setSelectedSubmissionId(selectedSubmissionId === submission.id ? null : submission.id)}
                      className="p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-white/50"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                    
                    {/* Dropdown actions */}
                    {selectedSubmissionId === submission.id && (
                      <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                        <div className="py-1">
                          <button
                            onClick={() => {
                              setEditingSubmission(submission);
                              setSubmissionForm({
                                client_name: submission.client_name,
                                description: submission.description,
                                amount: submission.amount,
                                status: submission.status,
                                items: submission.items || [],
                                submission_number: submission.submission_number || ''
                              });
                              setSelectedItems(submission.items || []);
                              const existingCostTotal = (submission.items || []).reduce((sum, item) => 
                                sum + ((item.cost_price || 0) * (item.quantity || 0)), 0
                              );
                              setCalculatedCostTotal(existingCostTotal);
                              setShowForm(true);
                              setSelectedSubmissionId(null);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            Modifier
                          </button>
                          <hr className="my-1" />
                          <button
                            onClick={() => {
                              handleDeleteSubmission(submission.id);
                              setSelectedSubmissionId(null);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Supprimer
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Contenu de la card */}
              <div className="p-4 space-y-3">
                
                {/* Description */}
                <div>
                  <span className="text-gray-500 text-sm block">📝 Description</span>
                  <p className="text-gray-900 font-medium">{submission.description}</p>
                </div>

                {/* Informations principales */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 block">💰 Montant</span>
                    <span className="font-bold text-green-600 text-base">{formatCurrency(submission.amount)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">📅 Date</span>
                    <span className="font-medium text-gray-900">{formatDate(submission.created_at)}</span>
                  </div>
                </div>

                {/* Statut */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 text-sm">Statut</span>
                  <span className={`px-2 py-1 rounded text-xs ${
                    submission.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                    submission.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {submission.status === 'sent' ? 'Envoyée' :
                     submission.status === 'draft' ? 'Brouillon' : 'Acceptée'}
                  </span>
                </div>

                {/* Marge et coût */}
                {submission.items && submission.items.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-orange-600 font-medium">
                          🏷️ Coût: {formatCurrency(
                            submission.items.reduce((sum, item) => sum + ((item.cost_price || 0) * (item.quantity || 0)), 0)
                          )}
                        </span>
                      </div>
                      <div>
                        <span className="text-blue-600 font-medium">
                          📈 Marge: {formatCurrency(
                            submission.amount - submission.items.reduce((sum, item) => sum + ((item.cost_price || 0) * (item.quantity || 0)), 0)
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-gray-600 flex justify-between">
                      <span>📦 {submission.items.length} item(s)</span>
                      {submission.items.some(item => item.comment) && (
                        <span className="text-blue-600">💬 {submission.items.filter(item => item.comment).length} commentaire(s)</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Actions rapides en bas */}
              <div className="bg-gray-50 px-4 py-3 flex gap-2">
                <button
                  onClick={() => {
                    setEditingSubmission(submission);
                    setSubmissionForm({
                      client_name: submission.client_name,
                      description: submission.description,
                      amount: submission.amount,
                      status: submission.status,
                      items: submission.items || [],
                      submission_number: submission.submission_number || ''
                    });
                    setSelectedItems(submission.items || []);
                    const existingCostTotal = (submission.items || []).reduce((sum, item) => 
                      sum + ((item.cost_price || 0) * (item.quantity || 0)), 0
                    );
                    setCalculatedCostTotal(existingCostTotal);
                    setShowForm(true);
                  }}
                  className="flex-1 bg-purple-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
                >
                  ✏️ Modifier
                </button>
                <button
                  onClick={() => handleDeleteSubmission(submission.id)}
                  className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                >
                  🗑️ Supprimer
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
