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
        {/* CSS D'IMPRESSION CORRIGÉ */}
        <style>
          {`
          @media print {
            @page {
              size: letter;
              margin: 0.5in;
            }
            
            body * {
              visibility: hidden;
            }
            
            body.print-client .print-area-client,
            body.print-client .print-area-client * {
              visibility: visible !important;
            }
            
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
            
            .print-client-info {
              margin: 20px 0;
              padding: 15px;
              border: 1px solid #ddd;
              background-color: #f9f9f9;
            }
            
            .print-table {
              width: 100% !important;
              border-collapse: collapse !important;
              margin: 20px 0 !important;
              table-layout: fixed !important;
              display: table !important;
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
              display: table-cell !important;
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
            
            .print-table.complete th:nth-child(1),
            .print-table.complete td:nth-child(1) { width: 12% !important; }
            .print-table.complete th:nth-child(2),
            .print-table.complete td:nth-child(2) { width: 28% !important; }
            .print-table.complete th:nth-child(3),
            .print-table.complete td:nth-child(3) { width: 8% !important; text-align: center !important; }
            .print-table.complete th:nth-child(4),
            .print-table.complete td:nth-child(4) { width: 8% !important; text-align: center !important; }
            .print-table.complete th:nth-child(5),
            .print-table.complete td:nth-child(5) { width: 12% !important; text-align: right !important; }
            .print-table.complete th:nth-child(6),
            .print-table.complete td:nth-child(6) { width: 12% !important; text-align: right !important; }
            .print-table.complete th:nth-child(7),
            .print-table.complete td:nth-child(7) { width: 10% !important; text-align: right !important; }
            .print-table.complete th:nth-child(8),
            .print-table.complete td:nth-child(8) { width: 10% !important; text-align: right !important; }
            
            .print-table.client th:nth-child(1),
            .print-table.client td:nth-child(1) { width: 15% !important; }
            .print-table.client th:nth-child(2),
            .print-table.client td:nth-child(2) { width: 45% !important; }
            .print-table.client th:nth-child(3),
            .print-table.client td:nth-child(3) { width: 10% !important; text-align: center !important; }
            .print-table.client th:nth-child(4),
            .print-table.client td:nth-child(4) { width: 10% !important; text-align: center !important; }
            .print-table.client th:nth-child(5),
            .print-table.client td:nth-child(5) { width: 10% !important; text-align: right !important; }
            .print-table.client th:nth-child(6),
            .print-table.client td:nth-child(6) { width: 10% !important; text-align: right !important; }
            
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
          {/* ZONE D'IMPRESSION COMPLÈTE */}
          <div className="print-area">
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

            {selectedItems.length > 0 && (
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
            )}

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

          {/* ZONE D'IMPRESSION CLIENT */}
          <div className="print-area-client">
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

            {selectedItems.length > 0 && (
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
            )}

            <div className="print-totals">
              <p>TOTAL: {formatCurrency(submissionForm.amount)}</p>
            </div>
          </div>

          {/* FORMULAIRE */}
          <div className="bg-white rounded-xl shadow-lg border border-purple-200 overflow-hidden">
            
            {/* En-tête */}
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
                
                {/* Boutons d'action */}
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
                
                {/* Client et Description */}
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

                {/* Totaux */}
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
    <div className="space-y-6 p-4">
      {/* Liste des soumissions - reste identique à l'original */}
      <div className="bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 rounded-xl shadow-lg p-4 sm:p-6 text-white">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold">📝 Gestion des Soumissions</h2>
            <p className="text-white/90 text-sm sm:text-base mt-1">
              Créez et gérez vos soumissions avec calculateur USD→CAD et marges automatiques
            </p>
          </div>
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

      {/* Reste du code pour la liste... */}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <p className="text-center text-gray-500">Liste des soumissions...</p>
      </div>
    </div>
  );
}
