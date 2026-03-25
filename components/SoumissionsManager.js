/**
 * @file components/SoumissionsManager.js
 * @description Gestionnaire complet des soumissions (devis/quotes)
 *              - Création, édition, suppression de soumissions
 *              - Impression PDF (version complète + version client)
 *              - Recherche produits, calcul taxes QC, gestion fichiers
 * @version 2.0.0
 * @date 2026-03-24
 * @changelog
 *   2.0.0 - Desktop: ligne cliquable ouvre soumission + dropdown statut inline sans ouvrir le formulaire
 *   1.9.0 - Forcer majuscules sur description au save + notification auto-dismiss (remplace alert OK)
 *   1.8.2 - Fix curseur qui saute à la fin lors de la saisie dans les champs avec toUpperCase (CSS textTransform + onBlur)
 *   1.8.1 - Ajout attributs autoCorrect/autoCapitalize/spellCheck sur tous les champs texte
 *   1.8.0 - Ajout classes dark mode Tailwind CSS
 *   1.7.1 - Forcer majuscules sur code produit et description des items non-inventaire
 *   1.7.0 - Header répété sur pages 2+ dans le PDF jsPDF (version Client)
 *   1.6.0 - Footer fixe avec conditions+totaux au bas de chaque page + pagination
 *   1.4.0 - Footer = bloc conditions+totaux fixé au bas de chaque page (position:fixed)
 *   1.2.0 - Ajout footer répété (tfoot) sur chaque page imprimée
 *   1.1.0 - Ajout header répété sur pages 2+ pour PDF multi-pages (table wrapper)
 *   1.0.0 - Version initiale
 */
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { MoreVertical, Eye, Edit, Trash2, FileText, Download, Search, Plus, Upload, X, ChevronDown, MessageSquare, DollarSign, Calculator, Printer } from 'lucide-react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import {
  drawHeader, drawFooter, drawMaterialsTable, drawTotals, drawConditions,
  drawTwoColumns, loadLogoBase64Client,
  formatDate as pdfFormatDate, formatCurrency as pdfFormatCurrency, PAGE
} from '../lib/services/pdf-common';

// ============================================
// GÉNÉRATION PDF SOUMISSION (jsPDF)
// ============================================

let _cachedLogoBase64 = null;
async function getLogoBase64() {
  if (_cachedLogoBase64) return _cachedLogoBase64;
  try {
    _cachedLogoBase64 = await loadLogoBase64Client();
  } catch (e) {
    console.warn('⚠️ Logo non chargé:', e.message);
  }
  return _cachedLogoBase64;
}

/**
 * Génère un PDF de soumission standardisé
 * @param {Object} params
 * @param {Object} params.submissionForm - Données du formulaire
 * @param {Array} params.selectedItems - Articles sélectionnés
 * @param {Array} params.clients - Liste des clients
 * @param {boolean} params.isClientVersion - true = version client (sans coûts)
 * @returns {Promise<jsPDF>} Document jsPDF
 */
async function generateSubmissionPDF({ submissionForm, selectedItems, clients, isClientVersion = false }) {
  const doc = new jsPDF({ format: 'letter', unit: 'mm' });
  const logoBase64 = await getLogoBase64();

  // ============ EN-TÊTE ============
  const headerOptions = {
    title: 'SOUMISSION',
    fields: [
      { label: 'N°:', value: submissionForm.submission_number || '' },
      { label: 'Date:', value: pdfFormatDate(new Date()) },
    ],
  };
  let y = drawHeader(doc, logoBase64, headerOptions);

  // ============ CLIENT + DESCRIPTION ============
  const clientData = clients.find(c => c.name === submissionForm.client_name);
  const clientLines = [submissionForm.client_name || ''];
  if (clientData?.address) clientLines.push(clientData.address);
  if (clientData?.phone) clientLines.push('Tél.: ' + clientData.phone);

  const twoColumnsOptions = {
    left: {
      title: 'CLIENT',
      lines: clientLines,
    },
    right: {
      title: 'DESCRIPTION',
      lines: [submissionForm.description || ''],
    },
  };
  y = drawTwoColumns(doc, y, twoColumnsOptions);

  // Sauvegarder la position Y après en-tête+client pour les pages suivantes
  const headerEndY = y;

  // ============ TABLE MATÉRIAUX ============
  let columns, body, columnStyles;

  if (isClientVersion) {
    // Version client: 6 colonnes (Code, Description, Qté, Unité, Prix Unit., Total)
    columns = [
      { header: 'Code', dataKey: 'code' },
      { header: 'Description', dataKey: 'description' },
      { header: 'Qté', dataKey: 'qty' },
      { header: 'Unité', dataKey: 'unit' },
      { header: 'Prix Unit.', dataKey: 'unitPrice' },
      { header: 'Total', dataKey: 'total' },
    ];
    body = selectedItems.map(item => ({
      code: item.product_id,
      description: item.description + (item.comment ? '\n' + item.comment : ''),
      qty: String(item.quantity),
      unit: item.unit,
      unitPrice: pdfFormatCurrency(item.selling_price),
      total: pdfFormatCurrency(item.selling_price * item.quantity),
    }));
    columnStyles = {
      code: { cellWidth: 25 },
      description: { cellWidth: 'auto' },
      qty: { cellWidth: 15, halign: 'center' },
      unit: { cellWidth: 18, halign: 'center' },
      unitPrice: { cellWidth: 25, halign: 'right' },
      total: { cellWidth: 25, halign: 'right' },
    };
  } else {
    // Version complète (bureau): 8 colonnes
    columns = [
      { header: 'No Item', dataKey: 'code' },
      { header: 'Description', dataKey: 'description' },
      { header: 'Unité', dataKey: 'unit' },
      { header: 'Qté', dataKey: 'qty' },
      { header: 'Prix Unit.', dataKey: 'sellingPrice' },
      { header: 'Coût Unit.', dataKey: 'costPrice' },
      { header: 'Total Vente', dataKey: 'totalSelling' },
      { header: 'Total Coût', dataKey: 'totalCost' },
    ];
    body = selectedItems.map(item => ({
      code: item.product_id,
      description: item.description
        + (item.product_group ? '\nGroupe: ' + item.product_group : '')
        + (item.comment ? '\n' + item.comment : ''),
      unit: item.unit,
      qty: String(item.quantity),
      sellingPrice: pdfFormatCurrency(item.selling_price),
      costPrice: pdfFormatCurrency(item.cost_price),
      totalSelling: pdfFormatCurrency(item.selling_price * item.quantity),
      totalCost: pdfFormatCurrency(item.cost_price * item.quantity),
    }));
    const amountPadding = { top: 2, right: 1.5, bottom: 2, left: 1 };
    columnStyles = {
      code: { cellWidth: 30 },
      description: { cellWidth: 'auto' },
      unit: { cellWidth: 11, halign: 'center' },
      qty: { cellWidth: 11, halign: 'center' },
      sellingPrice: { cellWidth: 18, halign: 'right', cellPadding: amountPadding },
      costPrice: { cellWidth: 18, halign: 'right', cellPadding: amountPadding },
      totalSelling: { cellWidth: 20, halign: 'right', cellPadding: amountPadding },
      totalCost: { cellWidth: 20, halign: 'right', cellPadding: amountPadding },
    };
  }

  y = drawMaterialsTable(doc, y, {
    title: 'ARTICLES',
    columns,
    body,
    columnStyles,
    // Réserver l'espace en-tête sur les pages 2+ pour le header répété
    margin: {
      left: PAGE.margin.left,
      right: PAGE.margin.right,
      top: headerEndY,
    },
  });

  // ============ CONDITIONS + TOTAUX ============
  // Vérifier si assez d'espace (~60mm) sinon nouvelle page avec header
  const condTotalsHeight = 60;
  const maxContentY = PAGE.height - PAGE.margin.bottom - 20;
  if (y + condTotalsHeight > maxContentY) {
    doc.addPage();
    y = headerEndY; // Commencer après l'espace réservé au header
  }

  const conditions = [
    'Prix valides pour 30 jours',
    'Paiement: Net 30 jours',
    'Prix sujets à changement sans préavis',
  ];
  y = drawConditions(doc, y, conditions);

  const sousTotal = submissionForm.amount || 0;
  const tps = sousTotal * 0.05;
  const tvq = sousTotal * 0.09975;
  const total = sousTotal + tps + tvq;

  y = drawTotals(doc, y, {
    subtotal: sousTotal,
    tps,
    tvq,
    total,
  });

  // ============ FOOTER ============
  drawFooter(doc);

  // ============ EN-TÊTE RÉPÉTÉ SUR PAGES 2+ ============
  const totalPages = doc.internal.getNumberOfPages();
  if (totalPages > 1) {
    for (let i = 2; i <= totalPages; i++) {
      doc.setPage(i);
      const headerY = drawHeader(doc, logoBase64, headerOptions);
      drawTwoColumns(doc, headerY, twoColumnsOptions);
    }
  }

  return doc;
}

export default function SoumissionsManager() {
  const [soumissions, setSoumissions] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showClientManager, setShowClientManager] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showNonInventoryForm, setShowNonInventoryForm] = useState(false);
  const [showQuickAddProduct, setShowQuickAddProduct] = useState(false);
  
  const [editingSubmission, setEditingSubmission] = useState(null);
  const [editingClient, setEditingClient] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('soumission_statusFilter') || 'all';
    }
    return 'all';
  });
  const [sendingReport, setSendingReport] = useState(false);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(null);
  const [statusDropdownId, setStatusDropdownId] = useState(null);
  
  // États pour la gestion des fichiers uploaded
  const [uploadingFiles, setUploadingFiles] = useState(false);
  
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

  // États pour le modal d'édition de ligne
  const [showEditItemModal, setShowEditItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editItemForm, setEditItemForm] = useState({
    quantity: '',
    selling_price: '',
    cost_price: '',
    comment: ''
  });

  // États pour le calculateur USD
  const [showUsdCalculator, setShowUsdCalculator] = useState(false);
  const [usdAmount, setUsdAmount] = useState('');
  const [usdToCadRate, setUsdToCadRate] = useState(1.35);
  const [loadingExchangeRate, setLoadingExchangeRate] = useState(false);
  const [exchangeRateError, setExchangeRateError] = useState('');

  // Debounce pour la recherche produits
  // Fermer le dropdown statut au clic extérieur
  useEffect(() => {
    if (!statusDropdownId) return;
    const handleClickOutside = () => setStatusDropdownId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [statusDropdownId]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (productSearchTerm.length >= 2) {
        setSearchingProducts(true);
        searchProductsWithNonInventory(productSearchTerm).finally(() => {
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
    submission_number: '',
    files: []
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

  // Changement de statut inline (sans ouvrir le formulaire)
  const handleInlineStatusChange = async (submissionId, newStatus) => {
    try {
      const { error } = await supabase
        .from('submissions')
        .update({ status: newStatus })
        .eq('id', submissionId);

      if (error) throw error;

      setSoumissions(prev => prev.map(s =>
        s.id === submissionId ? { ...s, status: newStatus } : s
      ));
      setStatusDropdownId(null);
    } catch (error) {
      console.error('Erreur mise à jour statut:', error);
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

  const searchProductsWithNonInventory = async (searchTerm) => {
  if (!searchTerm || searchTerm.length < 2) {
    setProducts([]);
    return;
  }

  try {
    console.log('🔍 Recherche combinée pour:', searchTerm);
    
    const [inventoryProducts, nonInventoryItems] = await Promise.all([
      supabase
        .from('products')
        .select('*')
        .or(`description.ilike.%${searchTerm}%,product_id.ilike.%${searchTerm}%,product_group.ilike.%${searchTerm}%`)
        .order('description', { ascending: true })
        .limit(30),
      
      supabase
        .from('non_inventory_items')
        .select('*')
        .or(`description.ilike.%${searchTerm}%,product_id.ilike.%${searchTerm}%,product_group.ilike.%${searchTerm}%`)
        .order('description', { ascending: true })
        .limit(20)
    ]);

    console.log('📦 Inventaire trouvé:', inventoryProducts.data?.length || 0);
    console.log('🏷️ Non-inventaire trouvé:', nonInventoryItems.data?.length || 0);

    const allProducts = [
      ...(inventoryProducts.data || []),
      ...(nonInventoryItems.data || []).map(item => ({
        ...item,
        is_non_inventory: true,
        stock_qty: item.stock_qty || 0,
        selling_price: item.selling_price || 0,
        cost_price: item.cost_price || 0,
        unit: item.unit || 'Un',
        product_group: item.product_group || 'Non-Inventaire'
      }))
    ];

    allProducts.sort((a, b) => a.description.localeCompare(b.description));
    console.log('📋 Total combiné:', allProducts.length);
    setProducts(allProducts);

  } catch (error) {
    console.error('❌ Erreur recherche combinée:', error);
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
    // NOUVEAU: Récupérer les fichiers avant suppression
    const { data: submissionData, error: fetchError } = await supabase
      .from('submissions')
      .select('files')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('Erreur récupération soumission:', fetchError);
    }

    const { error } = await supabase
      .from('submissions')
      .delete()
      .eq('id', id);
    if (error) throw error;

    // NOUVEAU: Nettoyer les fichiers
    if (submissionData?.files) {
      await cleanupFilesForSubmission(submissionData.files);
    }

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
    const input = document.getElementById('quantity-input');
    if (input) {
      input.focus();
      input.select(); // ✅ AJOUT: Sélectionne le texte "1"
    }
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

  // Fonctions pour le modal d'édition de ligne
  const openEditItemModal = (item) => {
    setEditingItem(item);
    setEditItemForm({
      quantity: item.quantity.toString(),
      selling_price: item.selling_price.toString(),
      cost_price: item.cost_price.toString(),
      comment: item.comment || ''
    });
    setShowEditItemModal(true);
  };

  const closeEditItemModal = () => {
    setShowEditItemModal(false);
    setEditingItem(null);
    setEditItemForm({
      quantity: '',
      selling_price: '',
      cost_price: '',
      comment: ''
    });
  };

  const saveEditItemModal = () => {
    if (!editingItem) return;
    
    const qty = parseFloat(editItemForm.quantity);
    if (isNaN(qty) || qty <= 0) {
      alert('⚠️ Quantité invalide');
      return;
    }

    setSelectedItems(selectedItems.map(item =>
      item.product_id === editingItem.product_id
        ? {
            ...item,
            quantity: qty,
            selling_price: parseFloat(editItemForm.selling_price) || 0,
            cost_price: parseFloat(editItemForm.cost_price) || 0,
            comment: editItemForm.comment.trim()
          }
        : item
    ));
    closeEditItemModal();
  };

  const deleteFromEditModal = () => {
    if (!editingItem) return;
    if (confirm(`Supprimer "${editingItem.description}" de la soumission?`)) {
      removeItemFromSubmission(editingItem.product_id);
      closeEditItemModal();
    }
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
  
  const addNonInventoryProduct = async () => {
  if (quickProductForm.product_id && quickProductForm.description && 
      quickProductForm.selling_price && quickProductForm.cost_price) {
    
    try {
      const nonInventoryData = {
        product_id: quickProductForm.product_id.trim().toUpperCase(),
        description: quickProductForm.description.trim().toUpperCase(),
        selling_price: parseFloat(quickProductForm.selling_price),
        cost_price: parseFloat(quickProductForm.cost_price),
        unit: quickProductForm.unit,
        product_group: quickProductForm.product_group || 'Non-Inventaire'
      };

      console.log('💾 Sauvegarde dans non_inventory_items:', nonInventoryData);

      const { data: existingItem, error: checkError } = await supabase
        .from('non_inventory_items')
        .select('*')
        .eq('product_id', nonInventoryData.product_id)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      let result;
      if (existingItem) {
        const { data, error } = await supabase
          .from('non_inventory_items')
          .update(nonInventoryData)
          .eq('product_id', nonInventoryData.product_id)
          .select();
        result = data;
        if (error) throw error;
        console.log('✅ Produit non-inventaire mis à jour:', data[0]);
      } else {
        const { data, error } = await supabase
          .from('non_inventory_items')
          .insert([nonInventoryData])
          .select();
        result = data;
        if (error) throw error;
        console.log('✅ Nouveau produit non-inventaire créé:', data[0]);
      }

      if (result && result.length > 0) {
        const savedItem = {
          ...result[0],
          is_non_inventory: true,
          stock_qty: 0
        };
        addItemToSubmission(savedItem, 1);
        const notification = document.createElement('div');
        notification.innerHTML = '✅ Produit non-inventaire sauvegardé !';
        notification.style.cssText = `
          position: fixed; top: 20px; right: 20px;
          background: #10b981; color: white;
          padding: 16px 24px; border-radius: 8px;
          font-weight: 600; box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          z-index: 9999;
        `;
        document.body.appendChild(notification);
        setTimeout(() => {
          if (document.body.contains(notification)) {
            document.body.removeChild(notification);
          }
        }, 3000);
      }
      
    } catch (error) {
      console.error('❌ Erreur sauvegarde:', error);
      alert(`❌ Erreur sauvegarde: ${error.message}`);
      
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
  } else {
    alert('❌ Veuillez remplir tous les champs obligatoires');
  }
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
    // Permettre quantité zéro, supprimer seulement si vide ou négatif
    if (quantity === '' || floatQuantity < 0 || isNaN(floatQuantity)) {
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
  submission_number: '',
  files: []
});
      setCalculatedCostTotal(0);
    } catch (error) {
      console.error('Erreur sauvegarde:', error.message);
    }
  };

  const handlePrint = async () => {
    try {
      const doc = await generateSubmissionPDF({
        submissionForm, selectedItems, clients, isClientVersion: false
      });
      doc.save(`Soumission Coutant ${submissionForm.submission_number || 'nouveau'}.pdf`);
    } catch (error) {
      console.error('Erreur génération PDF:', error);
      alert('❌ Erreur lors de la génération du PDF');
    }
  };

  const handlePrintClient = async () => {
    const confirmation = confirm(
      '⚠️ AVANT D\'IMPRIMER:\n\n' +
      'Avez-vous mis à jour la soumission avec les dernières modifications?\n\n' +
      '✅ Cliquez OK pour continuer l\'impression\n' +
      '❌ Cliquez Annuler pour revenir et modifier'
    );
    if (!confirmation) return;

    try {
      const doc = await generateSubmissionPDF({
        submissionForm, selectedItems, clients, isClientVersion: true
      });
      doc.save(`Soumission Client ${submissionForm.submission_number || 'nouveau'}.pdf`);
    } catch (error) {
      console.error('Erreur génération PDF:', error);
      alert('❌ Erreur lors de la génération du PDF');
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount || 0);
  };

     const imprimerEtProposerEmail = async () => {
      if (!submissionForm.client_name) {
        alert('⚠️ Veuillez sélectionner un client avant d\'imprimer');
        return;
      }

      if (selectedItems.length === 0) {
        alert('⚠️ Veuillez ajouter au moins un produit avant d\'imprimer');
        return;
      }

      const client = clients.find(c => c.name === submissionForm.client_name);
      if (!client || !client.email) {
        alert('⚠️ Aucun email trouvé pour ce client.');
        return;
      }

      try {
        // Générer et sauvegarder le PDF client
        const doc = await generateSubmissionPDF({
          submissionForm, selectedItems, clients, isClientVersion: true
        });
        doc.save(`SOU-${submissionForm.submission_number}.pdf`);

        // Proposer l'envoi par email
        const confirmation = confirm(
          `✅ PDF sauvegardé : SOU-${submissionForm.submission_number}.pdf\n\n` +
          `Voulez-vous ouvrir eM Client pour envoyer ce PDF à :\n${client.email} ?`
        );

        if (confirmation) {
          const sujet = `Soumission ${submissionForm.submission_number} - Services TMT Inc.`;

          const sousTotal = submissionForm.amount;
          const tps = sousTotal * 0.05;
          const tvq = sousTotal * 0.09975;
          const total = sousTotal + tps + tvq;

          const corpsEmail = `Bonjour,\n\nVeuillez trouver ci-joint notre soumission pour : ${submissionForm.description}\n\nRÉSUMÉ:\n- Sous-total: ${formatCurrency(sousTotal)}\n- TPS (5%): ${formatCurrency(tps)}\n- TVQ (9.975%): ${formatCurrency(tvq)}\n- TOTAL: ${formatCurrency(total)}\n\nDétails:\n- Nombre d'articles: ${selectedItems.length}\n- Validité: 30 jours\n- Paiement: Net 30 jours\n\nN'hésitez pas à nous contacter pour toute question.`;

          const mailtoLink = `mailto:${client.email}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corpsEmail)}`;

          const iframe = document.createElement('iframe');
          iframe.style.display = 'none';
          iframe.src = mailtoLink;
          document.body.appendChild(iframe);

          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 1000);

          // Changement de statut à "Envoyée"
          if (editingSubmission && submissionForm.status !== 'sent') {
            try {
              const { error } = await supabase
                .from('submissions')
                .update({ status: 'sent' })
                .eq('id', editingSubmission.id);

              if (error) throw error;

              setSubmissionForm(prev => ({ ...prev, status: 'sent' }));
              await fetchSoumissions();

              const notification = document.createElement('div');
              notification.innerHTML = '✅ Statut changé à "Envoyée"';
              notification.style.cssText = `
                position: fixed; top: 20px; right: 20px;
                background: #10b981; color: white;
                padding: 16px 24px; border-radius: 8px;
                font-weight: 600; box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                z-index: 9999;
              `;
              document.body.appendChild(notification);
              setTimeout(() => {
                if (document.body.contains(notification)) {
                  document.body.removeChild(notification);
                }
              }, 3000);

            } catch (error) {
              console.error('Erreur mise à jour statut:', error);
              const errorNotif = document.createElement('div');
              errorNotif.innerHTML = '⚠️ Erreur lors du changement de statut';
              errorNotif.style.cssText = `
                position: fixed; top: 20px; right: 20px;
                background: #ef4444; color: white;
                padding: 16px 24px; border-radius: 8px;
                font-weight: 600; box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                z-index: 9999;
              `;
              document.body.appendChild(errorNotif);
              setTimeout(() => {
                if (document.body.contains(errorNotif)) {
                  document.body.removeChild(errorNotif);
                }
              }, 3000);
            }
          }
        }

      } catch (error) {
        alert(`❌ Erreur: ${error.message}`);
      }
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

  // NOUVELLES FONCTIONS À AJOUTER COMPLÈTEMENT
const handleFileUpload = async (e) => {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;

  setUploadingFiles(true);
  const uploadedFiles = [];

  for (const file of files) {
    try {
      const cleanFileName = file.name
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9._-]/g, '')
        .substring(0, 100);

      const fileName = `${Date.now()}_${cleanFileName}`;
      const filePath = `submissions/${fileName}`;

      const { data, error } = await supabase.storage
        .from('submissions-files')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw new Error(`Erreur upload: ${error.message}`);

      const { data: urlData } = supabase.storage
        .from('submissions-files')
        .getPublicUrl(filePath);

      uploadedFiles.push({
        name: file.name,
        cleanName: cleanFileName,
        size: file.size,
        type: file.type,
        path: data.path,
        url: urlData.publicUrl,
        uploaded_at: new Date().toISOString()
      });

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
      const { error } = await supabase.storage
        .from('submissions-files')
        .remove([fileToRemove.path]);
      
      if (error) {
        console.error('Erreur suppression fichier:', error);
      }
    } catch (error) {
      console.error('Erreur suppression fichier:', error);
    }
  }
  
  const newFiles = submissionForm.files.filter((_, i) => i !== index);
  setSubmissionForm(prev => ({...prev, files: newFiles}));
};

const openFile = (file) => {
  if (file.url) {
    window.open(file.url, '_blank');
  } else {
    alert('Fichier non accessible - URL manquante');
  }
};

const downloadFile = async (file) => {
  if (!file.url) {
    alert('Impossible de télécharger - URL manquante');
    return;
  }

  try {
    const response = await fetch(file.url);
    const blob = await response.blob();
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
  } catch (error) {
    console.error('Erreur téléchargement:', error);
    alert('Erreur lors du téléchargement');
  }
};

const getFileIcon = (fileType) => {
  if (fileType?.includes('pdf')) return '📄';
  if (fileType?.includes('excel') || fileType?.includes('sheet')) return '📊';
  if (fileType?.includes('word') || fileType?.includes('document')) return '📝';
  if (fileType?.includes('image')) return '🖼️';
  return '📎';
};

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const cleanupFilesForSubmission = async (files) => {
  if (!files || files.length === 0) return;
  
  try {
    const filePaths = files
      .filter(file => file.path)
      .map(file => file.path);
    
    if (filePaths.length > 0) {
      const { error } = await supabase.storage
        .from('submissions-files')
        .remove(filePaths);
      
      if (error) {
        console.error('Erreur nettoyage fichiers:', error);
      }
    }
  } catch (error) {
    console.error('Erreur lors du nettoyage:', error);
  }
};
  
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
        <style>
          {`
          /* CSS d'impression professionnel amélioré */
          @media print {
           @page {
              size: letter;
              margin: 0.4in 0.6in 0.5in 0.6in;
              @bottom-center {
                content: "Pour toute question: (418) 225-3875 \\2022  Services TMT Inc. \\2022  info.servicestmt@gmail.com";
                font-size: 9px;
                color: #666;
              }
              @bottom-right {
                content: "Page " counter(page) "/" counter(pages);
                font-size: 10px;
                color: #333;
              }
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
              padding: 0;
              font-size: 11px;
              font-family: 'Arial', sans-serif;
              line-height: 1.3;
              color: #000;
            }
            
            /* En-tête professionnel amélioré */
            .print-header {
              display: flex !important;
              justify-content: space-between !important;
              align-items: flex-start !important;
              margin-bottom: 25px;
              padding-bottom: 12px;
              border-bottom: 3px solid #000;
              page-break-inside: avoid;
            }
            
            .print-company-section {
              display: flex !important;
              align-items: flex-start !important;
              flex: 1;
            }
            
            .print-logo {
              width: 160px !important;
              height: auto !important;
              margin-right: 20px !important;
              flex-shrink: 0 !important;
            }
            
            .print-company-info {
              flex: 1;
              font-size: 11px;
              line-height: 1.4;
            }
            
            .print-company-name {
              font-size: 16px !important;
              font-weight: bold !important;
              color: #000 !important;
              margin-bottom: 5px !important;
            }
            
            .print-submission-header {
              text-align: right;
              min-width: 200px;
            }
            
            .print-submission-title {
              font-size: 28px !important;
              font-weight: bold !important;
              margin: 0 0 8px 0 !important;
              color: #000 !important;
              letter-spacing: 2px !important;
            }
            
            .print-submission-details {
              font-size: 12px !important;
              line-height: 1.5 !important;
            }
            
            .print-submission-details p {
              margin: 2px 0 !important;
            }
            
            /* Section client améliorée */
            .print-client-section {
              display: flex !important;
              justify-content: space-between !important;
              margin: 20px 0 25px 0 !important;
              page-break-inside: avoid;
            }
            
            .print-client-info {
              flex: 1;
              margin-right: 20px;
              padding: 0;
              border: none;
              background: none !important;
            }
            
            .print-client-label {
              font-weight: bold !important;
              font-size: 12px !important;
              color: #000 !important;
              margin-bottom: 5px !important;
            }
            
            .print-client-name {
              font-size: 14px !important;
              font-weight: bold !important;
              margin-bottom: 8px !important;
            }
            
            .print-project-info {
              flex: 1;
              padding: 0;
              border: none;
              background: none !important;
            }
            
            /* Références et informations */
            .print-reference-section {
              display: flex !important;
              justify-content: space-between !important;
              margin: 15px 0 !important;
              font-size: 10px !important;
            }
            
            .print-ref-item {
              padding: 5px 8px !important;
              border: 1px solid #000 !important;
              background-color: #f8f9fa !important;
            }
            
            .print-ref-label {
              font-weight: bold !important;
              margin-bottom: 2px !important;
            }
            
            /* Tableau principal amélioré */
            .print-table {
              width: 100% !important;
              border-collapse: collapse !important;
              margin: 20px 0 !important;
              table-layout: fixed !important;
              display: table !important;
              font-size: 10px !important;
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
              border: 2px solid #000 !important;
              padding: 8px 6px !important;
              text-align: left !important;
              vertical-align: top !important;
              word-wrap: break-word !important;
              font-size: 10px !important;
            }
            
            .print-table th {
              background-color: #e9ecef !important;
              font-weight: bold !important;
              text-align: center !important;
              font-size: 10px !important;
              text-transform: uppercase !important;
              letter-spacing: 0.5px !important;
            }
            
            /* Largeurs des colonnes pour version COMPLÈTE */
            .print-table.complete th:nth-child(1),
            .print-table.complete td:nth-child(1) { width: 12% !important; }
            .print-table.complete th:nth-child(2),
            .print-table.complete td:nth-child(2) { width: 32% !important; }
            .print-table.complete th:nth-child(3),
            .print-table.complete td:nth-child(3) { width: 8% !important; text-align: center !important; }
            .print-table.complete th:nth-child(4),
            .print-table.complete td:nth-child(4) { width: 8% !important; text-align: center !important; }
            .print-table.complete th:nth-child(5),
            .print-table.complete td:nth-child(5) { width: 10% !important; text-align: right !important; }
            .print-table.complete th:nth-child(6),
            .print-table.complete td:nth-child(6) { width: 10% !important; text-align: right !important; }
            .print-table.complete th:nth-child(7),
            .print-table.complete td:nth-child(7) { width: 10% !important; text-align: right !important; }
            .print-table.complete th:nth-child(8),
            .print-table.complete td:nth-child(8) { width: 10% !important; text-align: right !important; }
            
            /* Largeurs des colonnes pour version CLIENT */
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
            
            /* Lignes alternées pour meilleure lisibilité */
            .print-table tbody tr:nth-child(even) {
              background-color: #f8f9fa !important;
            }
            
            /* Commentaires dans le tableau */
            .print-comment {
              font-style: italic;
              color: #666 !important;
              font-size: 9px !important;
              margin-top: 3px !important;
              padding: 2px 4px !important;
              background-color: #fff3cd !important;
              border-left: 3px solid #ffc107 !important;
            }
            
            /* Section totaux améliorée */
            .print-totals-section {
              margin-top: 25px !important;
              page-break-inside: avoid;
              border-top: 2px solid #000 !important;
              padding-top: 15px !important;
            }
            
            .print-totals {
              text-align: right;
              font-size: 12px !important;
            }
            
            .print-totals .total-line {
              display: flex !important;
              justify-content: space-between !important;
              margin: 5px 0 !important;
              padding: 3px 0 !important;
            }
            
            .print-totals .total-line.final-total {
              font-size: 16px !important;
              font-weight: bold !important;
              border-top: 2px solid #000 !important;
              border-bottom: 3px double #000 !important;
              padding: 8px 0 !important;
              margin-top: 10px !important;
            }
            
            .print-totals .profit-margin {
              color: #000 !important;
              font-weight: bold !important;
              background-color: #e3f2fd !important;
              padding: 5px 10px !important;
              border: 1px solid #2196f3 !important;
              margin-top: 10px !important;
            }
            
            /* Footer professionnel */
              .print-footer {
              margin-top: 30px !important;
              padding-top: 15px !important;
              border-top: 2px solid #000 !important;
              font-size: 10px !important;
              color: #000 !important;
              page-break-inside: avoid;
              background: white !important;
            }
            
            .print-footer-content {
              display: flex !important;
              justify-content: space-between !important;
              align-items: flex-start !important;
              gap: 20px !important;
            }
            
            .print-conditions {
              flex: 1;
              margin-right: 15px;
              font-size: 7px !important;
            }
            
            .print-contact-footer {
              text-align: right;
              flex-shrink: 0;
              font-size: 8px !important;
            }

            .print-totals-footer {
              min-width: 200px !important;
              flex-shrink: 0 !important;
              margin-left: 20px !important;
            }
                        
            .print-validity {
              background-color: #fff3cd !important;
              border: 1px solid #ffc107 !important;
              padding: 8px !important;
              margin: 15px 0 !important;
              text-align: center !important;
              font-weight: bold !important;
              font-size: 11px !important;
            }
            
            /* Table wrapper pour répéter l'en-tête sur chaque page imprimée */
            .print-wrapper {
              width: 100% !important;
              border-collapse: collapse !important;
            }

            .print-wrapper > thead {
              display: table-header-group !important;
            }

            .print-wrapper > tbody {
              display: table-row-group !important;
            }

            .print-wrapper > tfoot {
              display: table-footer-group !important;
            }

            .print-wrapper > thead > tr > td,
            .print-wrapper > tbody > tr > td,
            .print-wrapper > tfoot > tr > td {
              padding: 0 !important;
              border: none !important;
            }

            /* Spacer dans tfoot pour réserver l'espace du footer fixe sur chaque page */
            .print-footer-spacer {
              height: 1.4in;
            }

            /* Footer fixe positionné au bas de chaque page imprimée */
            .print-page-footer {
              position: fixed;
              bottom: 0;
              left: 0;
              width: 100%;
              background: white;
            }

            /* Éléments à masquer à l'impression */
            .no-print {
              display: none !important;
            }
          }

          @media screen {
            .print-area,
            .print-area-client {
              display: none;
            }
          }
          `}
        </style>

        <div className="max-w-6xl mx-auto p-4">
          {/* VERSION COMPLÈTE AVEC COÛTS - Zone d'impression */}
          {selectedItems.length > 0 && (
            <div className="print-area">
              <table className="print-wrapper">
                <thead>
                  <tr><td>
                    {/* En-tête professionnel amélioré - répété sur chaque page */}
                    <div className="print-header">
                      <div className="print-company-section">
                        <img src="/logo.png" alt="Services TMT" className="print-logo" />
                        <div className="print-company-info">
                          <div className="print-company-name">Services TMT Inc.</div>
                          <div>3195, 42e Rue Nord</div>
                          <div>Saint-Georges, QC G5Z 0V9</div>
                          <div><strong>Tél:</strong> (418) 225-3875</div>
                          <div><strong>Email:</strong> info.servicestmt@gmail.com</div>
                        </div>
                      </div>
                      <div className="print-submission-header">
                        <h1 className="print-submission-title">SOUMISSION</h1>
                        <div className="print-submission-details">
                          <p><strong>N°:</strong> {submissionForm.submission_number}</p>
                          <p><strong>Date:</strong> {new Date().toLocaleDateString('fr-CA')}</p>
                        </div>
                      </div>
                    </div>

                    {/* Section client compacte */}
                    <div className="print-client-section">
                      <div className="print-client-info">
                        <div className="print-client-label">CLIENT:</div>
                        <div className="print-client-name">{submissionForm.client_name}</div>
                        {(() => {
                          const clientData = clients.find(c => c.name === submissionForm.client_name);
                          if (clientData && (clientData.address || clientData.phone)) {
                            return (
                              <div style={{ fontSize: '9px', color: '#666' }}>
                                {clientData.address && clientData.phone
                                  ? `${clientData.address} • Tél.: ${clientData.phone}`
                                  : clientData.address || `Tél.: ${clientData.phone}`
                                }
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      <div className="print-project-info">
                        <div className="print-client-label">DESCRIPTION:</div>
                        <div style={{ fontSize: '11px', fontWeight: 'bold' }}>{submissionForm.description}</div>
                      </div>
                    </div>
                  </td></tr>
                </thead>
                <tbody>
                  <tr><td>

              {/* Tableau principal amélioré */}
              <table className="print-table complete">
                <thead>
                  <tr>
                    <th>No Item</th>
                    <th>Description</th>
                    <th>Unité</th>
                    <th>Qté</th>
                    <th>Prix Unit.</th>
                    <th>Coût Unit.</th>
                    <th>Total Vente</th>
                    <th>Total Coût</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedItems.map((item, index) => (
                    <tr key={item.product_id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{item.product_id}</td>
                      <td>
                        <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>{item.description}</div>
                        {item.product_group && (
                          <div style={{ fontSize: '8px', color: '#666', fontStyle: 'italic' }}>
                            Groupe: {item.product_group}
                          </div>
                        )}
                        {item.comment && (
                          <div className="print-comment">💬 {item.comment}</div>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{item.unit}</td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{item.quantity}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(item.selling_price)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(item.cost_price)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 'bold' }}>
                        {formatCurrency(item.selling_price * item.quantity)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 'bold' }}>
                        {formatCurrency(item.cost_price * item.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

                  </td></tr>
                </tbody>
                <tfoot>
                  <tr><td><div className="print-footer-spacer"></div></td></tr>
                </tfoot>
              </table>
              {/* Footer fixe au bas de chaque page - conditions + totaux */}
              <div className="print-page-footer">
                <div style={{ borderTop: '2px solid #000', paddingTop: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, fontSize: '9px', marginRight: '20px' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>CONDITIONS GÉNÉRALES:</div>
                    </div>
                    <div style={{ minWidth: '250px', fontSize: '12px' }}>
                      {(() => {
                        const sousTotal = submissionForm.amount;
                        const tps = sousTotal * 0.05;
                        const tvq = sousTotal * 0.09975;
                        const total = sousTotal + tps + tvq;
                        return (
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span>Sous-total:</span>
                              <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{formatCurrency(sousTotal)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span>TPS (5%):</span>
                              <span style={{ fontFamily: 'monospace' }}>{formatCurrency(tps)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                              <span>TVQ (9.975%):</span>
                              <span style={{ fontFamily: 'monospace' }}>{formatCurrency(tvq)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #000', paddingTop: '8px', fontWeight: 'bold', fontSize: '16px' }}>
                              <span>TOTAL:</span>
                              <span style={{ fontFamily: 'monospace' }}>{formatCurrency(total)}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VERSION CLIENT SANS COÛTS - Zone d'impression */}
          {selectedItems.length > 0 && (
            <div className="print-area-client">
              <table className="print-wrapper">
                <thead>
                  <tr><td>
                    {/* En-tête professionnel - répété sur chaque page */}
                    <div className="print-header">
                      <div className="print-company-section">
                        <img src="/logo.png" alt="Services TMT" className="print-logo" />
                        <div className="print-company-info">
                          <div className="print-company-name">Services TMT Inc.</div>
                          <div>3195, 42e Rue Nord</div>
                          <div>Saint-Georges, QC G5Z 0V9</div>
                          <div><strong>Tél:</strong> (418) 225-3875</div>
                          <div><strong>Email:</strong> info.servicestmt@gmail.com</div>
                        </div>
                      </div>
                      <div className="print-submission-header">
                        <h1 className="print-submission-title">SOUMISSION</h1>
                        <div className="print-submission-details">
                          <p><strong>N°:</strong> {submissionForm.submission_number}</p>
                          <p><strong>Date:</strong> {new Date().toLocaleDateString('fr-CA')}</p>
                        </div>
                      </div>
                    </div>

                    {/* Section Impression client */}
                    <div className="print-client-section">
                      <div className="print-client-info">
                        <div className="print-client-label">CLIENT:</div>
                        <div className="print-client-name">{submissionForm.client_name}</div>
                        {(() => {
                          const clientData = clients.find(c => c.name === submissionForm.client_name);
                          if (clientData && (clientData.address || clientData.phone)) {
                            return (
                              <div style={{ fontSize: '9px', color: '#666' }}>
                                {clientData.address && clientData.phone
                                  ? `${clientData.address} • Tél.: ${clientData.phone}`
                                  : clientData.address || `Tél.: ${clientData.phone}`
                                }
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      <div className="print-project-info">
                        <div className="print-client-label">DESCRIPTION:</div>
                        <div style={{ fontSize: '11px', fontWeight: 'bold' }}>{submissionForm.description}</div>
                      </div>
                    </div>
                  </td></tr>
                </thead>
                <tbody>
                  <tr><td>

              {/* Tableau client (sans colonnes de coût) */}
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
                      <td style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{item.product_id}</td>
                      <td>
                        <div style={{ fontWeight: 'bold' }}>{item.description}</div>
                        {item.comment && (
                          <div className="print-comment">💬 {item.comment}</div>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{item.quantity}</td>
                      <td style={{ textAlign: 'center' }}>{item.unit}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(item.selling_price)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 'bold' }}>
                        {formatCurrency(item.selling_price * item.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

                  </td></tr>
                </tbody>
                <tfoot>
                  <tr><td><div className="print-footer-spacer"></div></td></tr>
                </tfoot>
              </table>
              {/* Footer fixe au bas de chaque page - conditions + totaux */}
              <div className="print-page-footer">
                <div style={{ borderTop: '2px solid #000', paddingTop: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, fontSize: '9px', marginRight: '20px' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>CONDITIONS GÉNÉRALES:</div>
                      <div>• Prix valides pour 30 jours</div>
                      <div>• Paiement: Net 30 jours</div>
                      <div>• Prix sujets à changement sans préavis</div>
                    </div>
                    <div style={{ minWidth: '250px', fontSize: '12px' }}>
                      {(() => {
                        const sousTotal = submissionForm.amount;
                        const tps = sousTotal * 0.05;
                        const tvq = sousTotal * 0.09975;
                        const total = sousTotal + tps + tvq;
                        return (
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span>Sous-total:</span>
                              <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{formatCurrency(sousTotal)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span>TPS (5%):</span>
                              <span style={{ fontFamily: 'monospace' }}>{formatCurrency(tps)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                              <span>TVQ (9.975%):</span>
                              <span style={{ fontFamily: 'monospace' }}>{formatCurrency(tvq)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #000', paddingTop: '8px', fontWeight: 'bold', fontSize: '16px' }}>
                              <span>TOTAL:</span>
                              <span style={{ fontFamily: 'monospace' }}>{formatCurrency(total)}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* FORMULAIRE SOUMISSION MOBILE-FRIENDLY */}
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-purple-200 dark:border-purple-800 overflow-hidden">
            
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
                    🖨️ Imprimer Coutants
                  </button>
                                    
                  <button
                    onClick={imprimerEtProposerEmail}
                    disabled={selectedItems.length === 0 || !submissionForm.client_name}
                    className={`w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center ${
                      selectedItems.length === 0 || !submissionForm.client_name
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-orange-500/20 hover:bg-orange-500/30 text-white'
                    }`}
                    title={
                      !submissionForm.client_name 
                        ? 'Sélectionnez un client d\'abord'
                        : selectedItems.length === 0 
                        ? 'Ajoutez des produits d\'abord'
                        : 'Imprimer en PDF et proposer email'    // ← NOUVEAU TEXTE
                    }
                  >
                    📧 🖨️ Client
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

            {/* Suite du formulaire reste inchangée... */}
            <div className="p-4 sm:p-6 no-print dark:bg-gray-900">
              <form 
                id="submission-form" 
                onSubmit={handleSubmissionSubmit} 
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.type !== 'submit') {
                    e.preventDefault();
                  }
                }}
                className="space-y-6"
              >
                
                {/* Client et Description - Stack sur mobile */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                    <label className="block text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">
                      👤 Client *
                    </label>
                    <select
                      value={submissionForm.client_name}
                      onChange={(e) => setSubmissionForm({...submissionForm, client_name: e.target.value})}
                      className={`block w-full rounded-lg border-blue-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3 ${
                        editingSubmission ? 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed' : 'dark:bg-gray-800 dark:text-gray-100'
                      }`}
                      required
                      disabled={!!editingSubmission}
                    >
                      <option value="">Sélectionner un client...</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.name}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
                    <label className="block text-sm font-semibold text-green-800 dark:text-green-300 mb-2">
                      📝 Description *
                    </label>
                    <input
                      type="text"
                      value={submissionForm.description}
                      onChange={(e) => setSubmissionForm({...submissionForm, description: e.target.value})}
                      onBlur={(e) => setSubmissionForm(prev => ({...prev, description: prev.description.toUpperCase()}))}
                      style={{ textTransform: 'uppercase' }}
                      className="block w-full rounded-lg border-green-300 dark:border-green-700 shadow-sm focus:border-green-500 focus:ring-green-500 text-base p-3 dark:bg-gray-800 dark:text-gray-100"
                      placeholder="Description de la soumission..."
                      required
                      autoCorrect="on"
                      autoCapitalize="sentences"
                      spellCheck={true}
                    />
                  </div>
                </div>

                {/* Statut pour édition */}
                {editingSubmission && (
                  <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                    <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                      🏷️ Statut
                    </label>
                    <select
                      value={submissionForm.status}
                      onChange={(e) => setSubmissionForm({...submissionForm, status: e.target.value})}
                      className="block w-full rounded-lg border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base p-3 dark:bg-gray-800 dark:text-gray-100"
                    >
                      <option value="draft">📝 Brouillon</option>
                      <option value="sent">📤 Envoyée</option>
                      <option value="accepted">✅ Acceptée</option>
                    </select>
                  </div>
                )}

                {/* Section recherche produits MOBILE-FRIENDLY */}
                <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg border border-indigo-200 dark:border-indigo-800">
                  <h3 className="text-base sm:text-lg font-semibold text-indigo-800 dark:text-indigo-300 mb-4">
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
                          className="block w-full pl-10 pr-4 py-3 rounded-lg border-indigo-300 dark:border-indigo-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base dark:bg-gray-800 dark:text-gray-100"
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
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
                      <span className="text-indigo-600 dark:text-indigo-400">Recherche en cours...</span>
                    </div>
                  )}
                  
                  {productSearchTerm && productSearchTerm.length < 2 && !searchingProducts && (
                    <div className="p-4 text-center text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg dark:bg-gray-800">
                      Tapez au moins 2 caractères pour rechercher dans les 6718 produits
                    </div>
                  )}
                  
                  {productSearchTerm.length >= 2 && !searchingProducts && (
                    <div className="max-h-60 overflow-y-auto border border-indigo-200 dark:border-indigo-800 rounded-lg dark:bg-gray-800">
                      {products.length === 0 ? (
                        <div className="p-4 text-center text-gray-500">
                          Aucun produit trouvé pour "{productSearchTerm}"
                          <br />
                          <span className="text-xs dark:text-gray-500">Essayez avec d'autres mots-clés</span>
                        </div>
                      ) : (
                        <>
                          <div className="p-2 bg-gray-50 dark:bg-gray-700 text-xs text-gray-600 dark:text-gray-300 border-b dark:border-gray-600">
                            {products.length} résultat(s) trouvé(s) {products.length === 50 ? '(50 max affichés)' : ''}
                          </div>
                          {products.map((product, index) => (
                            <div 
                              key={product.product_id} 
                              data-product-index={index}
                              className={`p-3 border-b border-indigo-100 dark:border-indigo-900/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 cursor-pointer ${
                                index === focusedProductIndex ? 'bg-indigo-100 dark:bg-indigo-900/40 border-indigo-300' : 'dark:bg-gray-800'
                              }`}
                              onClick={() => selectProductForQuantity(product)}
                            >
                              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                                <div className="flex-1">
                                  <h4 className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                                  {product.product_id} - {product.description}
                                  {product.is_non_inventory && (
                                  <span className="ml-2 bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs font-medium">
                                  🏷️ Service
                                  </span>
                                  )}
                                  </h4>
                                  <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1 sm:space-y-0 sm:space-x-4 sm:flex">
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
                    <div className="bg-white dark:bg-gray-900 rounded-lg w-full max-w-md">
                      <div className="p-4 sm:p-6">
                        <h3 className="text-lg font-semibold dark:text-gray-100 mb-4">
                          Quantité pour: {selectedProductForQuantity.description}
                        </h3>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Quantité ({selectedProductForQuantity.unit})
                            </label>
                                  <input
                                    id="quantity-input"
                                     type="number"
                                      step="0.001"
                                      min="0"
                                      value={tempQuantity}
                                      onChange={(e) => {
                                    const value = e.target.value;
                                if (value === '' || parseFloat(value) >= 0) {
                                setTempQuantity(value);
                                    }
                                }}
                              onKeyDown={handleQuantityKeyDown}
                            onFocus={(e) => e.target.select()} // ✅ AJOUT: Sélectionne au focus
                                className="block w-full rounded-lg border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3 dark:bg-gray-800 dark:text-gray-100"
                            autoFocus
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                            />
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
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
                    <div className="bg-white dark:bg-gray-900 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                      <div className="p-4 sm:p-6">
                        <h3 className="text-lg font-semibold mb-4 text-orange-600 dark:text-orange-400">
                          ➕ Ajouter Produit Non-Inventaire
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Code Produit *</label>
                            <input
                              type="text"
                              value={quickProductForm.product_id}
                              onChange={(e) => setQuickProductForm({...quickProductForm, product_id: e.target.value})}
                              onBlur={(e) => setQuickProductForm(prev => ({...prev, product_id: prev.product_id.toUpperCase()}))}
                              style={{ textTransform: 'uppercase' }}
                              className="block w-full rounded-lg border-gray-300 dark:border-gray-600 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3 dark:bg-gray-800 dark:text-gray-100"
                              placeholder="Ex: TEMP-001"
                              required
                              autoCorrect="off"
                              autoCapitalize="off"
                              spellCheck={false}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Unité</label>
                            <select
                              value={quickProductForm.unit}
                              onChange={(e) => setQuickProductForm({...quickProductForm, unit: e.target.value})}
                              className="block w-full rounded-lg border-gray-300 dark:border-gray-600 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3 dark:bg-gray-800 dark:text-gray-100"
                            >
                              <option value="Un">Un</option>
                              <option value="M">m</option>
                              <option value="PI">Pi</option>
                              <option value="L">litre</option>
                              <option value="H">heure</option>
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description *</label>
                            <input
                              type="text"
                              value={quickProductForm.description}
                              onChange={(e) => setQuickProductForm({...quickProductForm, description: e.target.value})}
                              onBlur={(e) => setQuickProductForm(prev => ({...prev, description: prev.description.toUpperCase()}))}
                              style={{ textTransform: 'uppercase' }}
                              className="block w-full rounded-lg border-gray-300 dark:border-gray-600 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3 dark:bg-gray-800 dark:text-gray-100"
                              placeholder="Description du produit..."
                              required
                              autoCorrect="on"
                              autoCapitalize="sentences"
                              spellCheck={true}
                            />
                          </div>
                          
                          {/* PRIX COÛT AVEC CALCULATEUR USD */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Prix Coût CAD *</label>
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
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
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
                              <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300 flex items-center">
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
                                    <span className="text-blue-700 dark:text-blue-300">Taux:</span>
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
                                    <div className="text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 p-2 rounded">
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
                                      className="flex-1 rounded border-blue-300 dark:border-blue-700 text-sm p-2 dark:bg-gray-800 dark:text-gray-100"
                                      autoCorrect="off"
                                      autoCapitalize="off"
                                      spellCheck={false}
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
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Prix Vente CAD *</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={quickProductForm.selling_price}
                              onChange={(e) => setQuickProductForm({...quickProductForm, selling_price: e.target.value})}
                              className="block w-full rounded-lg border-gray-300 dark:border-gray-600 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3 dark:bg-gray-800 dark:text-gray-100"
                              placeholder="0.00"
                              required
                              autoCorrect="off"
                              autoCapitalize="off"
                              spellCheck={false}
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
                                    onClick={() => applyProfitMargin(27)}
                                    className="flex-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs hover:bg-purple-200 font-medium"
                                  >
                                    +27%
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {quickProductForm.selling_price && quickProductForm.cost_price && (
                          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                            <p className="text-sm text-blue-800 dark:text-blue-300">
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
                          onClick={addNonInventoryProduct}
                            className="w-full sm:flex-1 px-4 py-2 border border-transparent rounded-lg text-white bg-orange-600 hover:bg-orange-700"
                            >
                        ✅ Sauvegarder et Ajouter
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Modal édition de ligne */}
                {showEditItemModal && editingItem && (
                  <div 
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
                    onClick={(e) => {
                      if (e.target === e.currentTarget) closeEditItemModal();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') closeEditItemModal();
                    }}
                  >
                    <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-md shadow-2xl">
                      {/* Header */}
                      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-4 rounded-t-xl">
                        <h3 className="text-lg font-bold">Modifier l'article</h3>
                        <p className="text-purple-100 text-sm mt-1 truncate">
                          {editingItem.product_id} - {editingItem.description}
                        </p>
                      </div>

                      {/* Formulaire */}
                      <div className="p-6 space-y-4">
                        {/* Quantité */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Quantité ({editingItem.unit})
                          </label>
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={editItemForm.quantity}
                            onChange={(e) => setEditItemForm({...editItemForm, quantity: e.target.value})}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                saveEditItemModal();
                              }
                            }}
                            className="w-full rounded-lg border-gray-300 dark:border-gray-600 shadow-sm focus:border-purple-500 focus:ring-purple-500 p-3 text-lg dark:bg-gray-800 dark:text-gray-100"
                            autoFocus
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                          />
                        </div>

                        {/* Prix de vente */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Prix de vente ($)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editItemForm.selling_price}
                            onChange={(e) => setEditItemForm({...editItemForm, selling_price: e.target.value})}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                saveEditItemModal();
                              }
                            }}
                            className="w-full rounded-lg border-green-300 dark:border-green-700 shadow-sm focus:border-green-500 focus:ring-green-500 p-3 dark:bg-gray-800 dark:text-gray-100"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                          />
                        </div>

                        {/* Prix coûtant */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Prix coûtant ($)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editItemForm.cost_price}
                            onChange={(e) => setEditItemForm({...editItemForm, cost_price: e.target.value})}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                saveEditItemModal();
                              }
                            }}
                            className="w-full rounded-lg border-orange-300 dark:border-orange-700 shadow-sm focus:border-orange-500 focus:ring-orange-500 p-3 dark:bg-gray-800 dark:text-gray-100"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                          />
                        </div>

                        {/* Commentaire */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Commentaire (optionnel)
                          </label>
                          <textarea
                            value={editItemForm.comment}
                            onChange={(e) => setEditItemForm({...editItemForm, comment: e.target.value})}
                            className="w-full rounded-lg border-gray-300 dark:border-gray-600 shadow-sm focus:border-purple-500 focus:ring-purple-500 p-3 dark:bg-gray-800 dark:text-gray-100"
                            rows={2}
                            placeholder="Note pour cet article..."
                            autoCorrect="on"
                            autoCapitalize="sentences"
                            spellCheck={true}
                          />
                        </div>

                        {/* Aperçu totaux */}
                        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">Total vente:</span>
                            <span className="font-medium text-green-700">
                              {formatCurrency((parseFloat(editItemForm.quantity) || 0) * (parseFloat(editItemForm.selling_price) || 0))}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">Total coût:</span>
                            <span className="font-medium text-orange-700">
                              {formatCurrency((parseFloat(editItemForm.quantity) || 0) * (parseFloat(editItemForm.cost_price) || 0))}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm border-t dark:border-gray-700 pt-1 mt-1">
                            <span className="text-gray-600 dark:text-gray-400">Marge:</span>
                            <span className="font-medium text-blue-700">
                              {formatCurrency(
                                ((parseFloat(editItemForm.quantity) || 0) * (parseFloat(editItemForm.selling_price) || 0)) -
                                ((parseFloat(editItemForm.quantity) || 0) * (parseFloat(editItemForm.cost_price) || 0))
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="bg-gray-50 dark:bg-gray-800 px-6 py-4 rounded-b-xl flex justify-between items-center">
                        <button
                          type="button"
                          onClick={deleteFromEditModal}
                          className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 flex items-center gap-2"
                        >
                          🗑️ Supprimer
                        </button>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={closeEditItemModal}
                            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100"
                          >
                            Annuler (Esc)
                          </button>
                          <button
                            type="button"
                            onClick={saveEditItemModal}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                          >
                            Sauvegarder (Enter)
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* MODAL POUR LES COMMENTAIRES */}
                {showCommentModal && editingCommentItem && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-lg w-full max-w-md">
                      <div className="p-4 sm:p-6">
                        <h3 className="text-lg font-semibold mb-4 flex items-center dark:text-gray-100">
                          <MessageSquare className="w-5 h-5 mr-2 text-blue-600" />
                          Commentaire pour: {editingCommentItem.description}
                        </h3>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Commentaire (optionnel)
                            </label>
                            <textarea
                              value={tempComment}
                              onChange={(e) => setTempComment(e.target.value)}
                              className="block w-full rounded-lg border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3 h-24 resize-none dark:bg-gray-800 dark:text-gray-100"
                              placeholder="Ajouter un commentaire pour ce produit..."
                              autoCorrect="on"
                              autoCapitalize="sentences"
                              spellCheck={true}
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
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

                {/* Items sélectionnés MOBILE-FRIENDLY - Reste inchangé mais tronqué pour la taille */}
                {selectedItems.length > 0 && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <h3 className="text-base sm:text-lg font-semibold text-yellow-800 dark:text-yellow-300 mb-4">
                      📦 Produits Sélectionnés ({selectedItems.length})
                    </h3>
                    
                    {/* Tableau responsive */}
                    <div className="hidden sm:block max-h-80 overflow-y-auto border border-yellow-200 dark:border-yellow-800 rounded-lg bg-white dark:bg-gray-900">
                      <table className="w-full text-sm">
                        <thead className="bg-yellow-100 dark:bg-yellow-900/40 sticky top-0">
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
                              <tr 
                                key={item.product_id} 
                                className="border-b border-yellow-100 dark:border-yellow-900/30 hover:bg-yellow-50 dark:hover:bg-yellow-900/10 cursor-pointer dark:bg-gray-900"
                                onClick={() => openEditItemModal(item)}
                              >
                                <td className="p-2 font-mono text-xs dark:text-gray-300">{item.product_id}</td>
                                <td className="p-2">
                                  <div className="max-w-xs">
                                    <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{item.description}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">{item.product_group} • {item.unit}</div>
                                    {item.comment && (
                                      <div className="text-xs text-blue-600 italic mt-1 truncate">
                                        💬 {item.comment}
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    value={item.quantity}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      if (value === '' || parseFloat(value) >= 0) {
                                        updateItemQuantity(item.product_id, value);
                                      }
                                    }}
                                    className="w-16 text-center rounded border-gray-300 dark:border-gray-600 text-sm dark:bg-gray-800 dark:text-gray-100"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                  />
                                </td>
                                <td className="p-2 text-right" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={item.selling_price}
                                    onChange={(e) => updateItemPrice(item.product_id, 'selling_price', e.target.value)}
                                    className="w-20 text-right rounded border-green-300 dark:border-green-700 text-sm focus:border-green-500 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                  />
                                </td>
                                <td className="p-2 text-right" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="number"
                                    step="any"
                                    min="0"
                                    value={item.cost_price}
                                    onChange={(e) => updateItemPrice(item.product_id, 'cost_price', e.target.value)}
                                    className="w-20 text-right rounded border-orange-300 dark:border-orange-700 text-sm focus:border-orange-500 focus:ring-orange-500 dark:bg-gray-800 dark:text-gray-100"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                  />
                                </td>
                                <td className="p-2 text-right font-medium text-green-700">
                                  {formatCurrency(item.selling_price * item.quantity)}
                                </td>
                                <td className="p-2 text-right font-medium text-orange-700">
                                  {formatCurrency(item.cost_price * item.quantity)}
                                </td>
                                <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={() => openCommentModal(item)}
                                    className={`px-2 py-1 rounded text-xs ${
                                      item.comment 
                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50' 
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                                    title={item.comment ? 'Modifier commentaire' : 'Ajouter commentaire'}
                                  >
                                    <MessageSquare className="w-3 h-3" />
                                  </button>
                                </td>
                                <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
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

                    {/* Cards pour mobile - Version tronquée */}
                    <div className="sm:hidden space-y-3">
                      {[...selectedItems].reverse().map((item) => (
                        <div 
                          key={item.product_id} 
                          className="bg-white dark:bg-gray-900 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800 cursor-pointer active:bg-yellow-50 dark:active:bg-yellow-900/20"
                          onClick={() => openEditItemModal(item)}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900 dark:text-gray-100 text-sm">{item.product_id}</h4>
                              <p className="text-xs text-gray-600 dark:text-gray-400">{item.description}</p>
                              {item.comment && (
                                <p className="text-xs text-blue-600 dark:text-blue-400 italic mt-1">💬 {item.comment}</p>
                              )}
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium text-green-700">
                                {formatCurrency(item.selling_price * item.quantity)}
                              </div>
                              <div className="text-xs text-gray-500">
                                Qté: {item.quantity} × {formatCurrency(item.selling_price)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="mt-3 space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-yellow-700 dark:text-yellow-400">
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
                    </div>
                  </div>
                )}

                {/* Section Documents - NOUVEAU */}
<div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg border border-purple-200 dark:border-purple-800">
  <label className="block text-sm font-semibold text-purple-800 dark:text-purple-300 mb-2">
    📎 Documents (PDF, XLS, DOC, etc.)
  </label>
  
  <div className="mb-4">
    <div className="flex flex-col sm:flex-row gap-3">
      <input
        type="file"
        multiple
        accept=".pdf,.xls,.xlsx,.doc,.docx,.txt,.png,.jpg,.jpeg"
        onChange={handleFileUpload}
        disabled={uploadingFiles}
        className="block w-full text-sm text-purple-600 file:mr-4 file:py-3 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700 disabled:opacity-50"
      />
    </div>
    {uploadingFiles && (
      <p className="text-sm text-purple-600 dark:text-purple-400 mt-2 flex items-center">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600 mr-2"></div>
        📤 Upload en cours... Veuillez patienter.
      </p>
    )}
  </div>

  {submissionForm.files && submissionForm.files.length > 0 && (
    <div className="space-y-2">
      <p className="text-sm font-medium text-purple-700 dark:text-purple-400">
        📁 Documents joints ({submissionForm.files.length})
      </p>
      <div className="space-y-2">
        {submissionForm.files.map((file, index) => (
          <div key={index} className="bg-white dark:bg-gray-800 p-3 rounded border border-purple-200 dark:border-purple-800 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <span className="text-xl flex-shrink-0">{getFileIcon(file.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatFileSize(file.size)} • {file.type}
                  </p>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                {file.url ? (
                  <>
                    <button
                      type="button"
                      onClick={() => openFile(file)}
                      className="flex-1 sm:flex-none px-3 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded border border-blue-300 transition-colors md:hidden"
                      title="Ouvrir le fichier"
                    >
                      👁️ Voir
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadFile(file)}
                      className="flex-1 sm:flex-none px-3 py-1 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded border border-green-300 transition-colors"
                      title="Télécharger le fichier"
                    >
                      💾 Télécharger
                    </button>
                  </>
                ) : (
                  <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded">
                    📄 En cours...
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="flex-1 sm:flex-none px-3 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded border border-red-300 transition-colors"
                  title="Supprimer le fichier"
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )}
</div>

                {/* Totaux responsive */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-green-100 dark:bg-green-900/20 p-4 rounded-lg border border-green-300 dark:border-green-800">
                    <label className="block text-base sm:text-lg font-semibold text-green-800 dark:text-green-300 mb-2">
                      💰 Total Vente
                    </label>
                    <div className="text-xl sm:text-2xl font-bold text-green-900 dark:text-green-200">
                      {formatCurrency(submissionForm.amount)}
                    </div>
                  </div>
                  
                  <div className="bg-orange-100 dark:bg-orange-900/20 p-4 rounded-lg border border-orange-300 dark:border-orange-800">
                    <label className="block text-base sm:text-lg font-semibold text-orange-800 dark:text-orange-300 mb-2">
                      🏷️ Total Coût
                    </label>
                    <div className="text-xl sm:text-2xl font-bold text-orange-900 dark:text-orange-200">
                      {formatCurrency(calculatedCostTotal)}
                    </div>
                  </div>

                  <div className="bg-blue-100 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-300 dark:border-blue-800">
                    <label className="block text-base sm:text-lg font-semibold text-blue-800 dark:text-blue-300 mb-2">
                      📈 Marge
                    </label>
                    <div className="text-xl sm:text-2xl font-bold text-blue-900 dark:text-blue-200">
                      {formatCurrency(submissionForm.amount - calculatedCostTotal)}
                    </div>
                    {submissionForm.amount > 0 && calculatedCostTotal > 0 && (
                      <div className="text-sm text-blue-700 dark:text-blue-400">
                        {((submissionForm.amount - calculatedCostTotal) / submissionForm.amount * 100).toFixed(1)}%
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 text-center">
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
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

           <a href="https://drive.google.com/uc?export=download&id=164VvVa2CmpW_O7KQLXmzqz50eAZzGeyy"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-sm font-medium hover:bg-white/20 backdrop-blur-sm text-center"
            >
              📄 Modèle Word
            </a>
            
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

        {/* Statistiques responsive - COMPACT POUR TABLETTE */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="bg-white/20 backdrop-blur-sm p-2 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-lg mr-2">📊</span>
              <div>
                <p className="text-xs font-medium text-white/90">Total</p>
                <p className="text-base sm:text-lg font-bold">{soumissions.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm p-2 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-lg mr-2">📝</span>
              <div>
                <p className="text-xs font-medium text-white/90">Brouillons</p>
                <p className="text-base sm:text-lg font-bold">
                  {soumissions.filter(s => s.status === 'draft').length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm p-2 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-lg mr-2">📤</span>
              <div>
                <p className="text-xs font-medium text-white/90">Envoyées</p>
                <p className="text-base sm:text-lg font-bold">
                  {soumissions.filter(s => s.status === 'sent').length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm p-2 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-lg mr-2">✅</span>
              <div>
                <p className="text-xs font-medium text-white/90">Total Accepté</p>
                <p className="text-sm sm:text-base font-bold">
                  {formatCurrency(soumissions.filter(s => s.status === 'accepted').reduce((sum, s) => sum + (s.amount || 0), 0))}
                </p>
                <p className="text-xs text-white/70">
                  {soumissions.filter(s => s.status === 'accepted').length} soumissions
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Info système */}
      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          📊 6718 produits • 💱 USD→CAD (Taux: {usdToCadRate.toFixed(4)}) • 🎯 Marges auto • 📧 Email .EML
        </p>
      </div>

      {/* Filtres responsive */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="🔍 Rechercher par client ou description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-4 py-3 rounded-lg border-gray-300 dark:border-gray-600 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-base dark:bg-gray-800 dark:text-gray-100"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>
          </div>
          <div className="w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                localStorage.setItem('soumission_statusFilter', e.target.value);
              }}
              className="w-full rounded-lg border-gray-300 dark:border-gray-600 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-base p-3 dark:bg-gray-800 dark:text-gray-100"
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
      <div className="hidden lg:block bg-white dark:bg-gray-900 shadow-lg rounded-lg overflow-hidden">
        {filteredSoumissions.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-6xl mb-4 block">📝</span>
            <p className="text-gray-500 dark:text-gray-400 text-lg">Aucune soumission trouvée</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Soumission
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Client & Description
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Montant
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredSoumissions.map((submission) => (
                <tr
                  key={submission.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                  onClick={() => {
                    setEditingSubmission(submission);
                    setSubmissionForm({
                      client_name: submission.client_name,
                      description: submission.description,
                      amount: submission.amount,
                      status: submission.status,
                      items: submission.items || [],
                      submission_number: submission.submission_number || '',
                      files: submission.files || []
                    });
                    setSelectedItems(submission.items || []);
                    const existingCostTotal = (submission.items || []).reduce((sum, item) =>
                      sum + ((item.cost_price || 0) * (item.quantity || 0)), 0
                    );
                    setCalculatedCostTotal(existingCostTotal);
                    setShowForm(true);
                  }}
                >
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
                      <div className="font-medium text-gray-900 dark:text-gray-100">{submission.client_name}</div>
                      <div className="text-gray-500 dark:text-gray-400 truncate max-w-xs" title={submission.description}>
                        {submission.description}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-medium text-green-600">
                      {formatCurrency(submission.amount)}
                    </div>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-center relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setStatusDropdownId(statusDropdownId === submission.id ? null : submission.id)}
                      className={`px-2 py-1 rounded-full text-xs font-medium cursor-pointer hover:ring-2 hover:ring-purple-300 transition-all ${
                        submission.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                        submission.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                        'bg-green-100 text-green-800'
                      }`}
                      title="Cliquer pour changer le statut"
                    >
                      {submission.status === 'sent' ? '📤' :
                       submission.status === 'draft' ? '📝' : '✅'}
                      <ChevronDown className="w-3 h-3 inline-block ml-0.5" />
                    </button>
                    {statusDropdownId === submission.id && (
                      <div className="absolute z-50 mt-1 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-1 min-w-[140px]">
                        <button
                          onClick={() => handleInlineStatusChange(submission.id, 'draft')}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 ${
                            submission.status === 'draft' ? 'font-bold bg-gray-50 dark:bg-gray-700' : ''
                          }`}
                        >
                          📝 Brouillon
                        </button>
                        <button
                          onClick={() => handleInlineStatusChange(submission.id, 'sent')}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 ${
                            submission.status === 'sent' ? 'font-bold bg-blue-50 dark:bg-gray-700' : ''
                          }`}
                        >
                          📤 Envoyée
                        </button>
                        <button
                          onClick={() => handleInlineStatusChange(submission.id, 'accepted')}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 ${
                            submission.status === 'accepted' ? 'font-bold bg-green-50 dark:bg-gray-700' : ''
                          }`}
                        >
                          ✅ Acceptée
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-center text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(submission.created_at)}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-center space-x-1">
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

      {/* Vue MOBILE/TABLETTE - Layout 2 lignes ULTRA-COMPACT */}
      <div className="lg:hidden">
        {filteredSoumissions.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-8 text-center">
            <span className="text-6xl mb-4 block">📝</span>
            <p className="text-gray-500 dark:text-gray-400 text-lg">Aucune soumission trouvée</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
            {filteredSoumissions.map((submission, index) => (
              <div
                key={submission.id}
                onClick={() => {
                  setEditingSubmission(submission);
                  setSubmissionForm({
                    client_name: submission.client_name,
                    description: submission.description,
                    amount: submission.amount,
                    status: submission.status,
                    items: submission.items || [],
                    submission_number: submission.submission_number || '',
                    files: submission.files || []
                  });
                  setSelectedItems(submission.items || []);
                  const existingCostTotal = (submission.items || []).reduce((sum, item) => 
                    sum + ((item.cost_price || 0) * (item.quantity || 0)), 0
                  );
                  setCalculatedCostTotal(existingCostTotal);
                  setShowForm(true);
                }}
                className={`p-2 sm:p-3 hover:bg-purple-50 active:bg-purple-100 transition-all duration-150 cursor-pointer touch-manipulation ${
                  index % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800/50'
                }`}
              >
                {/* LIGNE 1: Infos principales */}
                <div className="flex items-center gap-2 mb-1">
                  {/* Icône statut */}
                  <div className="text-xl flex-shrink-0">
                    {submission.status === 'sent' ? '📤' :
                     submission.status === 'draft' ? '📝' : '✅'}
                  </div>

                  {/* Numéro soumission */}
                  {submission.submission_number && (
                    <div className="bg-gradient-to-r from-purple-100 to-indigo-100 px-2 py-1 rounded flex-shrink-0">
                      <div className="font-mono text-xs font-bold text-purple-700">#{submission.submission_number}</div>
                    </div>
                  )}

                  {/* Client */}
                  <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate flex-1 min-w-0">
                    {submission.client_name}
                  </div>

                  {/* Date */}
                  <div className="text-xs font-medium text-gray-700 dark:text-gray-400 flex-shrink-0 hidden sm:block">
                    {formatDate(submission.created_at)}
                  </div>

                  {/* Montant */}
                  <div className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap flex-shrink-0">
                    {formatCurrency(submission.amount)}
                  </div>

                  {/* Statut */}
                  <div className={`px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${
                    submission.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                    submission.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {submission.status === 'sent' ? '📤' :
                     submission.status === 'draft' ? '📝' : '✅'}
                  </div>

                  {/* Indicateurs */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {submission.items && submission.items.length > 0 && (
                      <span className="text-xs text-gray-600">📦{submission.items.length}</span>
                    )}
                    {submission.items?.some(item => item.comment) && (
                      <span className="text-xs text-blue-600">💬</span>
                    )}
                  </div>
                </div>

                {/* LIGNE 2: Description + Marge */}
                <div className="flex items-center justify-between gap-2 text-xs text-gray-600 pl-2">
                  <div className="truncate flex-1 min-w-0">
                    {submission.description || 'Aucune description'}
                  </div>
                  {submission.items && submission.items.length > 0 && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-orange-600 font-medium">
                        🏷️ {formatCurrency(
                          submission.items.reduce((sum, item) => sum + ((item.cost_price || 0) * (item.quantity || 0)), 0)
                        )}
                      </span>
                      <span className="text-blue-600 font-medium">
                        📈 {formatCurrency(
                          submission.amount - submission.items.reduce((sum, item) => sum + ((item.cost_price || 0) * (item.quantity || 0)), 0)
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
