import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  // API Functions
  fetchSupplierPurchases,
  fetchSuppliers,
  fetchPurchaseOrders,
  fetchShippingAddresses,
  createSupplierPurchase,
  updateSupplierPurchase,
  deleteSupplierPurchase,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  createShippingAddress,
  updateShippingAddress,
  deleteShippingAddress,
  searchProducts,
  fetchAvailableSubmissions,
  fixExistingPurchases,
  
  // Services
  generatePurchaseNumber,
  sendEmailToDominique,
  generatePurchasePDF,
  testEmailFunction,
  
  // Utils
  formatCurrency,
  formatUnitPrice,
  formatDate,
  getPONumber
} from './SupplierPurchaseServices';

export const useSupplierPurchase = () => {
  // ===== ÉTATS PRINCIPAUX =====
  const [supplierPurchases, setSupplierPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [shippingAddresses, setShippingAddresses] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // ===== ÉTATS UI =====
  const [showForm, setShowForm] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [showAddressFormModal, setShowAddressFormModal] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [editingAddress, setEditingAddress] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedPurchaseId, setSelectedPurchaseId] = useState(null);
  const [showSupplierFormModal, setShowSupplierFormModal] = useState(false);
  
  // ===== NOUVEAUX ÉTATS POUR FILTRES DATE =====
  const [dateFilter, setDateFilter] = useState('all'); // all, today, this_week, this_month, custom
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  
  // ===== ÉTATS IMPORT SOUMISSION =====
  const [showImportSubmissionModal, setShowImportSubmissionModal] = useState(false);
  const [availableSubmissions, setAvailableSubmissions] = useState([]);
  const [selectedSubmissionForImport, setSelectedSubmissionForImport] = useState(null);
  const [itemsToImport, setItemsToImport] = useState([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [emailStatus, setEmailStatus] = useState('');
  const [isLoadingEmail, setIsLoadingEmail] = useState(false);
  
  // ===== ÉTATS RECHERCHE PRODUITS =====
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [focusedProductIndex, setFocusedProductIndex] = useState(-1);
  const [showQuantityInput, setShowQuantityInput] = useState(false);
  const [selectedProductForQuantity, setSelectedProductForQuantity] = useState(null);
  const [tempQuantity, setTempQuantity] = useState('1');
  
  // ===== ÉTAT CORRECTION =====
  const [isFixingPOs, setIsFixingPOs] = useState(false);
  
  // ===== FORMULAIRE PRINCIPAL - MODIFIÉ avec ba_acomba =====
  const [purchaseForm, setPurchaseForm] = useState({
    supplier_id: '',
    supplier_name: '',
    linked_po_id: '',
    linked_po_number: '',
    linked_submission_id: null,
    supplier_quote_reference: '',
    ba_acomba: '', // NOUVEAU CHAMP
    shipping_address_id: '',
    shipping_company: '',
    shipping_account: '',
    delivery_date: '',
    items: [],
    subtotal: 0,
    tps: 0,
    tvq: 0,
    shipping_cost: 0,
    total_amount: 0,
    status: 'draft',
    notes: '',
    purchase_number: ''
  });

  // ===== FORMULAIRE FOURNISSEUR =====
  const [supplierForm, setSupplierForm] = useState({
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    province: 'QC',
    postal_code: '',
    country: 'Canada',
    notes: '',
    preferred_english: false,
    tax_id: '',
    tax_exempt: false
  });

  // ===== FORMULAIRE ADRESSE =====
  const [addressForm, setAddressForm] = useState({
    name: '',
    address: '',
    city: '',
    province: 'QC',
    postal_code: '',
    country: 'Canada',
    is_default: false
  });

  const [nonInventoryForm, setNonInventoryForm] = useState({
  product_id: '',
  description: '',
  cost_price: '',
  selling_price: '',
  unit: 'Un',
  product_group: 'Non-Inventaire'
});

  // États pour le modal non-inventaire
const [showNonInventoryModal, setShowNonInventoryModal] = useState(false);
const [showUsdCalculatorCost, setShowUsdCalculatorCost] = useState(false);
const [showUsdCalculatorSelling, setShowUsdCalculatorSelling] = useState(false);
const [usdAmountCost, setUsdAmountCost] = useState('');
const [usdAmountSelling, setUsdAmountSelling] = useState('');
const [usdToCadRate, setUsdToCadRate] = useState(1.35);
const [loadingExchangeRate, setLoadingExchangeRate] = useState(false);
const [exchangeRateError, setExchangeRateError] = useState('');

  // États pour le modal mise à jour prix inventaire
const [showPriceUpdateModal, setShowPriceUpdateModal] = useState(false);
const [priceUpdateItem, setPriceUpdateItem] = useState(null);
const [priceUpdateForm, setPriceUpdateForm] = useState({
  newCostPrice: '',
  newSellingPrice: '',
  marginPercent: ''
});

  // ===== NOUVELLE FONCTION HELPER POUR STATISTIQUES PAR DATE =====
  const getDateFilterStats = () => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    const todayCount = supplierPurchases.filter(p => {
      if (!p.created_at) return false;
      const purchaseDate = new Date(p.created_at);
      const startOfToday = new Date(today);
      startOfToday.setHours(0, 0, 0, 0);
      return purchaseDate >= startOfToday && purchaseDate <= today;
    }).length;
    
    const thisWeekCount = supplierPurchases.filter(p => {
      if (!p.created_at) return false;
      const purchaseDate = new Date(p.created_at);
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      return purchaseDate >= startOfWeek && purchaseDate <= today;
    }).length;
    
    const thisMonthCount = supplierPurchases.filter(p => {
      if (!p.created_at) return false;
      const purchaseDate = new Date(p.created_at);
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      return purchaseDate >= startOfMonth && purchaseDate <= today;
    }).length;
    
    return { todayCount, thisWeekCount, thisMonthCount };
  };

  // ===== CHARGEMENT INITIAL =====
  useEffect(() => {
    const initializeData = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Erreur auth:', error);
          setLoading(false);
          return;
        }
        
        if (!session) {
          console.warn('Aucune session utilisateur');
          setLoading(false);
          return;
        }
        
        console.log('Session utilisateur valide');
        
        await loadAllData();
        
      } catch (error) {
        console.error('Erreur initialisation:', error);
        setLoading(false);
      }
    };

    initializeData();
  }, []);

  // ===== RECHERCHE PRODUITS AVEC DEBOUNCE =====
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (productSearchTerm.length >= 2) {
        setSearchingProducts(true);
        handleSearchProducts(productSearchTerm).finally(() => {
          setSearchingProducts(false);
        });
      } else {
        setProducts([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [productSearchTerm]);

  // ===== CALCUL AUTOMATIQUE DES TOTAUX =====
  useEffect(() => {
    const subtotal = selectedItems.reduce((sum, item) => {
      return sum + (item.cost_price * item.quantity);
    }, 0);
    
    // Vérifier le pays du fournisseur sélectionné
    const selectedSupplier = suppliers.find(s => s.id === purchaseForm.supplier_id);
    const isCanadianSupplier = !selectedSupplier || selectedSupplier.country === 'Canada';
    
    // Appliquer les taxes seulement pour les fournisseurs canadiens
    const tps = isCanadianSupplier ? subtotal * 0.05 : 0;
    const tvq = isCanadianSupplier ? subtotal * 0.09975 : 0;
    
    const total = subtotal + tps + tvq + parseFloat(purchaseForm.shipping_cost || 0);
    
    setPurchaseForm(prev => ({ 
      ...prev, 
      subtotal,
      tps,
      tvq,
      total_amount: total
    }));
  }, [selectedItems, purchaseForm.shipping_cost, purchaseForm.supplier_id, suppliers]);

  useEffect(() => {
  fetchExchangeRate();
}, []);

  // ===== FONCTIONS DE CHARGEMENT =====
  const loadAllData = async () => {
    try {
      await Promise.all([
        loadSupplierPurchases(),
        loadSuppliers(),
        loadPurchaseOrders(),
        loadShippingAddresses()
      ]);
    } catch (error) {
      console.error('Erreur chargement données:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSupplierPurchases = async () => {
    try {
      const data = await fetchSupplierPurchases();
      setSupplierPurchases(data);
    } catch (error) {
      console.error('Erreur chargement achats:', error);
    }
  };

  const loadSuppliers = async () => {
    try {
      const data = await fetchSuppliers();
      setSuppliers(data);
    } catch (error) {
      console.error('Erreur chargement fournisseurs:', error);
    }
  };

  const loadPurchaseOrders = async () => {
    try {
      const data = await fetchPurchaseOrders();
      setPurchaseOrders(data);
    } catch (error) {
      console.error('Erreur chargement bons achat:', error);
    }
  };

  const loadShippingAddresses = async () => {
    try {
      const data = await fetchShippingAddresses();
      setShippingAddresses(data);
    } catch (error) {
      console.error('Erreur chargement adresses:', error);
    }
  };

  // ===== GESTION RECHERCHE PRODUITS =====
  const handleSearchProducts = async (searchTerm) => {
    try {
      const results = await searchProducts(searchTerm);
      setProducts(results);
    } catch (error) {
      console.error('Erreur recherche produits:', error);
      setProducts([]);
    }
  };

  // ===== GESTION SOUMISSIONS =====
  const handleFetchAvailableSubmissions = async () => {
  setLoadingSubmissions(true);
  try {
    let clientName = null;
    if (purchaseForm.linked_po_id) {
      const selectedPO = purchaseOrders.find(po => String(po.id) === String(purchaseForm.linked_po_id));
      clientName = selectedPO?.client_name || null;
      console.log('BA sélectionné:', purchaseForm.linked_po_id);
      console.log('PO trouvé:', selectedPO);
      console.log('Client name:', clientName);
    } else {
      console.log('Aucun BA sélectionné');
    }
    
    const data = await fetchAvailableSubmissions(clientName);
    console.log('Soumissions trouvées:', data.length);
    setAvailableSubmissions(data);
  } catch (error) {
    console.error('Erreur chargement soumissions:', error);
    alert('Erreur lors du chargement des soumissions');
  } finally {
    setLoadingSubmissions(false);
  }
};

  const handleSubmissionSelect = (submission) => {
    setSelectedSubmissionForImport(submission);
    const itemsWithSelection = (submission.items || []).map(item => ({
      ...item,
      selected: false,
      importQuantity: item.quantity || 1
    }));
    setItemsToImport(itemsWithSelection);
  };

  const toggleItemSelection = (productId, isSelected) => {
    setItemsToImport(items => 
      items.map(item => 
        item.product_id === productId 
          ? { ...item, selected: isSelected }
          : item
      )
    );
  };

  const updateImportQuantity = (productId, newQuantity) => {
    const quantity = parseFloat(newQuantity);
    if (quantity > 0) {
      setItemsToImport(items => 
        items.map(item => 
          item.product_id === productId 
            ? { ...item, importQuantity: quantity }
            : item
        )
      );
    }
  };

  const handleImportSelectedItems = () => {
    const selectedItemsForImport = itemsToImport.filter(item => item.selected);
    
    if (selectedItemsForImport.length === 0) {
      alert('Veuillez sélectionner au moins un item à importer');
      return;
    }

    const importedItems = selectedItemsForImport.map(item => ({
      ...item,
      quantity: item.importQuantity,
      cost_price: item.cost_price,
      original_selling_price: item.selling_price,
      notes: '',
    }));

    const existingProductIds = selectedItems.map(item => item.product_id);
    const filteredExisting = selectedItems.filter(item => 
      !existingProductIds.includes(item.product_id)
    );
    
    setSelectedItems([...filteredExisting, ...importedItems]);
    
    setPurchaseForm(prev => ({
      ...prev,
      linked_submission_id: selectedSubmissionForImport.id,
      
    }));

    setShowImportSubmissionModal(false);
    setSelectedSubmissionForImport(null);
    setItemsToImport([]);
    
    alert(`${importedItems.length} item(s) importé(s) depuis la soumission ${selectedSubmissionForImport.submission_number}`);
  };

  // ===== GESTION PRODUITS =====
  const handleProductKeyDown = (e) => {
    const availableProducts = products;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedProductIndex(prev => {
        const newIndex = prev < availableProducts.length - 1 ? prev + 1 : prev;
        return newIndex;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedProductIndex(prev => prev > 0 ? prev - 1 : prev);
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
      if (selectedProductForQuantity && tempQuantity && parseInt(tempQuantity) > 0) {
        addItemToPurchase(selectedProductForQuantity, parseInt(tempQuantity));
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

  const addItemToPurchase = (product, quantity = 1) => {
    const existingItem = selectedItems.find(item => item.product_id === product.product_id);
    
    if (existingItem) {
      setSelectedItems(selectedItems.map(item => 
        item.product_id === product.product_id 
          ? { ...item, quantity: item.quantity + quantity }
          : item
      ));
    } else {
      setSelectedItems([{
        ...product,
        quantity: quantity,
        notes: '',
        original_cost_price: product.cost_price
      }, ...selectedItems]);
    }
  };

  const updateItemQuantity = (productId, quantity) => {
    const intQuantity = parseInt(quantity);
    if (intQuantity <= 0 || isNaN(intQuantity)) {
      setSelectedItems(selectedItems.filter(item => item.product_id !== productId));
    } else {
      setSelectedItems(selectedItems.map(item =>
        item.product_id === productId ? { ...item, quantity: intQuantity } : item
      ));
    }
  };

  const updateItemPrice = (productId, price) => {
    setSelectedItems(selectedItems.map(item =>
      item.product_id === productId ? { ...item, cost_price: parseFloat(price) || 0 } : item
    ));
  };

  // Vérifier si le prix a changé et ouvrir le modal
    const handlePriceBlur = (productId, newPrice) => {
      const item = selectedItems.find(i => i.product_id === productId);
      if (!item) return;
      
      const newPriceFloat = parseFloat(newPrice) || 0;
      const originalPrice = parseFloat(item.original_cost_price) || 0;
      
      // Si le prix a changé, ouvrir le modal
      if (newPriceFloat !== originalPrice && newPriceFloat > 0) {
        setPriceUpdateItem({
          ...item,
          newCostPrice: newPriceFloat,
          originalCostPrice: originalPrice
        });
        setPriceUpdateForm({
          newCostPrice: newPriceFloat.toFixed(2),
          newSellingPrice: '',
          marginPercent: ''
        });
        setShowPriceUpdateModal(true);
      }
    };
    
    // Appliquer la marge pour calculer le prix de vente
    const applyPriceUpdateMargin = (percentage) => {
      const cost = parseFloat(priceUpdateForm.newCostPrice) || 0;
      if (cost > 0 && percentage > 0) {
        const newSelling = cost * (1 + percentage / 100);
        setPriceUpdateForm(prev => ({
          ...prev,
          newSellingPrice: newSelling.toFixed(2),
          marginPercent: percentage.toString()
        }));
      }
    };
    
    // Mettre à jour le prix dans l'inventaire
    const updateInventoryPrice = async () => {
      if (!priceUpdateItem || !priceUpdateForm.newSellingPrice) {
        alert('⚠️ Veuillez entrer un prix de vente');
        return;
      }
    
      try {
        const tableName = priceUpdateItem.is_non_inventory ? 'non_inventory_items' : 'products';
        
        const { error } = await supabase
          .from(tableName)
          .update({
            cost_price: parseFloat(priceUpdateForm.newCostPrice),
            selling_price: parseFloat(priceUpdateForm.newSellingPrice)
          })
          .eq('product_id', priceUpdateItem.product_id);
    
        if (error) throw error;
    
        console.log(`✅ Prix mis à jour dans ${tableName}:`, priceUpdateItem.product_id);
        
        // Mettre à jour l'item dans selectedItems avec le nouveau original_cost_price
        setSelectedItems(prev => prev.map(item =>
          item.product_id === priceUpdateItem.product_id
            ? { ...item, original_cost_price: parseFloat(priceUpdateForm.newCostPrice), selling_price: parseFloat(priceUpdateForm.newSellingPrice) }
            : item
        ));
    
        setShowPriceUpdateModal(false);
        setPriceUpdateItem(null);
        setPriceUpdateForm({ newCostPrice: '', newSellingPrice: '', marginPercent: '' });
    
      } catch (error) {
        console.error('Erreur mise à jour prix:', error);
        alert('❌ Erreur: ' + error.message);
      }
    };
    
    // Fermer le modal sans mettre à jour l'inventaire
    const closePriceUpdateModal = () => {
      setShowPriceUpdateModal(false);
      setPriceUpdateItem(null);
      setPriceUpdateForm({ newCostPrice: '', newSellingPrice: '', marginPercent: '' });
    };

  const updateItemNotes = (productId, notes) => {
    setSelectedItems(selectedItems.map(item =>
      item.product_id === productId ? { ...item, notes: notes } : item
    ));
  };

  const removeItemFromPurchase = (productId) => {
    setSelectedItems(selectedItems.filter(item => item.product_id !== productId));
  };

  // ===== GESTION MODAL NON-INVENTAIRE =====
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

    const applyProfitMargin = (percentage) => {
      const costPrice = parseFloat(nonInventoryForm.cost_price) || 0;
      if (costPrice > 0) {
        const sellingPrice = costPrice * (1 + percentage / 100);
        setNonInventoryForm(prev => ({
          ...prev,
          selling_price: sellingPrice.toFixed(2)
        }));
      }
    };

    const useConvertedAmountCost = () => {
      const convertedAmount = parseFloat(usdAmountCost) * usdToCadRate;
      setNonInventoryForm(prev => ({
        ...prev,
        cost_price: convertedAmount.toFixed(2)
      }));
      setShowUsdCalculatorCost(false);
      setUsdAmountCost('');
    };

    const useConvertedAmountSelling = () => {
      const convertedAmount = parseFloat(usdAmountSelling) * usdToCadRate;
      setNonInventoryForm(prev => ({
        ...prev,
        selling_price: convertedAmount.toFixed(2)
      }));
      setShowUsdCalculatorSelling(false);
      setUsdAmountSelling('');
    };

    const addNonInventoryProduct = async () => {
      if (!nonInventoryForm.product_id || !nonInventoryForm.description || 
          !nonInventoryForm.cost_price || !nonInventoryForm.selling_price) {
        alert('⚠️ Veuillez remplir tous les champs obligatoires');
        return;
      }
    
      // Vérifier si le produit existe déjà dans selectedItems
      const existingInList = selectedItems.find(item => item.product_id === nonInventoryForm.product_id);
      if (existingInList) {
        alert('⚠️ Ce code produit existe déjà dans la liste');
        return;
      }
    
      try {
        // ✅ Vérifier si le produit existe déjà dans la BD
        const { data: existingProduct } = await supabase
          .from('non_inventory_items')
          .select('product_id')
          .eq('product_id', nonInventoryForm.product_id)
          .single();
    
        // Si le produit n'existe pas, le créer dans la BD
        if (!existingProduct) {
          const { error: insertError } = await supabase
            .from('non_inventory_items')
            .insert({
              product_id: nonInventoryForm.product_id,
              description: nonInventoryForm.description,
              cost_price: parseFloat(nonInventoryForm.cost_price),
              selling_price: parseFloat(nonInventoryForm.selling_price),
              unit: nonInventoryForm.unit || 'Un',
              product_group: nonInventoryForm.product_group || 'Non-Inventaire',
              is_non_inventory: true
            });
    
          if (insertError) {
            console.error('Erreur création produit:', insertError);
            alert('❌ Erreur lors de la création du produit: ' + insertError.message);
            return;
          }
          console.log('✅ Produit non-inventaire créé dans la BD:', nonInventoryForm.product_id);
        } else {
          console.log('ℹ️ Produit existe déjà dans la BD:', nonInventoryForm.product_id);
        }
    
        // Ajouter au BA en cours
        const newItem = {
          product_id: nonInventoryForm.product_id,
          description: nonInventoryForm.description,
          cost_price: parseFloat(nonInventoryForm.cost_price),
          selling_price: parseFloat(nonInventoryForm.selling_price),
          unit: nonInventoryForm.unit,
          product_group: nonInventoryForm.product_group,
          quantity: 1,
          notes: '',
          is_non_inventory: true
        };
    
        setSelectedItems([...selectedItems, newItem]);
        
        // Reset form
        setNonInventoryForm({
          product_id: '',
          description: '',
          cost_price: '',
          selling_price: '',
          unit: 'Un',
          product_group: 'Non-Inventaire'
        });
        setShowNonInventoryModal(false);
        setShowUsdCalculatorCost(false);
        setShowUsdCalculatorSelling(false);
        setUsdAmountCost('');
        setUsdAmountSelling('');
        
      } catch (error) {
        console.error('Erreur:', error);
        alert('❌ Erreur: ' + error.message);
      }
    };

  // ===== GESTION ACHATS FOURNISSEURS =====
  const handlePurchaseSubmit = async (e) => {
    e.preventDefault();
    try {
      let purchaseNumber = purchaseForm.purchase_number;
      
      if (!editingPurchase) {
        purchaseNumber = await generatePurchaseNumber();
      }

      const purchaseData = {
        supplier_id: purchaseForm.supplier_id,
        supplier_name: purchaseForm.supplier_name,
        linked_po_id: purchaseForm.linked_po_id || null,
        linked_po_number: purchaseForm.linked_po_number,
        linked_submission_id: purchaseForm.linked_submission_id || null,
        supplier_quote_reference: purchaseForm.supplier_quote_reference,
        ba_acomba: purchaseForm.ba_acomba, // NOUVEAU CHAMP
        shipping_address_id: purchaseForm.shipping_address_id,
        shipping_company: purchaseForm.shipping_company,
        shipping_account: purchaseForm.shipping_account,
        delivery_date: purchaseForm.delivery_date || (() => {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          return tomorrow.toISOString().split('T')[0];
        })(),
        items: selectedItems,
        subtotal: purchaseForm.subtotal,
        tps: purchaseForm.tps,
        tvq: purchaseForm.tvq,
        shipping_cost: parseFloat(purchaseForm.shipping_cost || 0),
        total_amount: purchaseForm.total_amount,
        status: purchaseForm.status,
        notes: purchaseForm.notes,
        purchase_number: purchaseNumber
      };

      let savedPurchase;

      if (editingPurchase) {
        savedPurchase = await updateSupplierPurchase(editingPurchase.id, purchaseData);
        console.log('Achat mis à jour avec succès');
      } else {
        savedPurchase = await createSupplierPurchase(purchaseData);
        console.log('Achat créé avec succès');
      }

      // LOGIQUE EMAIL MODIFIÉE
      const shouldSendEmailStatuses = ['in_order', 'ordered']; // EN COMMANDE et COMMANDÉ
      const isEmailableStatus = shouldSendEmailStatuses.includes(savedPurchase.status);

      console.log('📧 DÉBOGAGE EMAIL:');
      console.log('- Status:', savedPurchase.status);
      console.log('- isEmailableStatus:', isEmailableStatus);
      console.log('- editingPurchase:', !!editingPurchase);

      if (isEmailableStatus) {
        if (!editingPurchase) {
          // CRÉATION - Email automatique
          console.log('📧 Création avec statut email → Envoi automatique');
          
          const pdf = generatePurchasePDF(savedPurchase);
          const pdfBlob = pdf.output('blob');
          
          setIsLoadingEmail(true);
          setEmailStatus('Envoi automatique en cours...');
          
          sendEmailToDominique(savedPurchase, pdfBlob)
            .then(() => {
              console.log('📧 EMAIL AUTOMATIQUE ENVOYÉ');
              setEmailStatus('✅ Email envoyé automatiquement à Dominique');
            })
            .catch((emailError) => {
              console.error('📧 ERREUR EMAIL:', emailError);
              setEmailStatus(`❌ Erreur email: ${emailError.message}`);
            })
            .finally(() => {
              setIsLoadingEmail(false);
            });
        } else {
          // MODIFICATION - Demander confirmation
          console.log('📧 Modification avec statut email → Demander confirmation');
          
          const shouldSendEmail = confirm(
            `Voulez-vous envoyer l'email de confirmation à Dominique ?\n\n` +
            `Bon d'achat: ${savedPurchase.purchase_number}\n` +
            `Statut: ${savedPurchase.status === 'in_order' ? 'En commande' : 'Commandé'}\n` +
            `Fournisseur: ${savedPurchase.supplier_name}`
          );
          
          if (shouldSendEmail) {
            const pdf = generatePurchasePDF(savedPurchase);
            const pdfBlob = pdf.output('blob');
            
            setIsLoadingEmail(true);
            setEmailStatus('Envoi en cours...');
            
            sendEmailToDominique(savedPurchase, pdfBlob)
              .then(() => {
                console.log('📧 EMAIL MANUEL ENVOYÉ');
                setEmailStatus('✅ Email envoyé avec succès');
              })
              .catch((emailError) => {
                console.error('📧 ERREUR EMAIL:', emailError);
                setEmailStatus(`❌ Erreur email: ${emailError.message}`);
              })
              .finally(() => {
                setIsLoadingEmail(false);
              });
          } else {
            setEmailStatus('📧 Email non envoyé (choix utilisateur)');
          }
        }
      } else {
        console.log('📧 Statut ne nécessite pas d\'email');
      }
      
      await loadSupplierPurchases();
      resetForm();
      
    } catch (error) {
      console.error('Erreur sauvegarde achat:', error);
      alert('Erreur lors de la sauvegarde: ' + (error.message || 'Erreur inconnue'));
    }
  };

  // ===== NOUVELLE FONCTION - MISE À JOUR RAPIDE DU STATUT =====
  const handleQuickStatusUpdate = async (purchaseId, newStatus, purchase) => {
    try {
      // Mettre à jour seulement le statut
      const updatedData = {
        ...purchase,
        status: newStatus
      };
      
      const savedPurchase = await updateSupplierPurchase(purchaseId, updatedData);
      
      // Appliquer la même logique d'email que dans handlePurchaseSubmit
      const shouldSendEmailStatuses = ['in_order', 'ordered'];
      const isEmailableStatus = shouldSendEmailStatuses.includes(newStatus);
      
      if (isEmailableStatus) {
        // Pour les mises à jour rapides, toujours demander confirmation
        const shouldSendEmail = confirm(
          `Voulez-vous envoyer l'email de confirmation à Dominique ?\n\n` +
          `Bon d'achat: ${purchase.purchase_number}\n` +
          `Nouveau statut: ${newStatus === 'in_order' ? 'En commande' : 'Commandé'}\n` +
          `Fournisseur: ${purchase.supplier_name}`
        );
        
        if (shouldSendEmail) {
          const pdf = generatePurchasePDF(savedPurchase);
          const pdfBlob = pdf.output('blob');
          
          setIsLoadingEmail(true);
          setEmailStatus('Envoi en cours...');
          
          sendEmailToDominique(savedPurchase, pdfBlob)
            .then(() => {
              setEmailStatus('✅ Email envoyé avec succès');
            })
            .catch((emailError) => {
              setEmailStatus(`❌ Erreur email: ${emailError.message}`);
            })
            .finally(() => {
              setIsLoadingEmail(false);
            });
        } else {
          setEmailStatus('📧 Email non envoyé (choix utilisateur)');
        }
      }
      
      // Recharger la liste
      await loadSupplierPurchases();
      
    } catch (error) {
      console.error('Erreur mise à jour statut:', error);
      alert('Erreur lors de la mise à jour du statut: ' + error.message);
    }
  };

      const handleDeletePurchase = async (id) => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cet achat ?')) return;
        
        try {
          await deleteSupplierPurchase(id);
          await loadSupplierPurchases();
        } catch (error) {
          console.error('Erreur suppression achat:', error);
          alert('Erreur lors de la suppression');
        }
      };

      const handleEditPurchase = (purchase) => {
        setEditingPurchase(purchase);
        setPurchaseForm(purchase);
        setSelectedItems(purchase.items || []);
        setShowForm(true);
      };

  // ===== GESTION FOURNISSEURS =====
  const handleSupplierSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingSupplier) {
        await updateSupplier(editingSupplier.id, supplierForm);
      } else {
        await createSupplier(supplierForm);
      }

      await loadSuppliers();
      setShowSupplierModal(false);
      
      // Fermer le modal dialog s'il est ouvert
      const modal = document.getElementById('supplier-form-modal');
      if (modal) {
        modal.close();
      }
      
      resetSupplierForm();
    } catch (error) {
      console.error('Erreur sauvegarde fournisseur:', error);
      alert('Erreur lors de la sauvegarde du fournisseur');
    }
  };

  const handleDeleteSupplier = async (id) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce fournisseur ?')) return;
    
    try {
      await deleteSupplier(id);
      await loadSuppliers();
    } catch (error) {
      console.error('Erreur suppression fournisseur:', error);
      alert('Erreur lors de la suppression');
    }
  };

  const handleSupplierFormSubmit = async (e) => {
    e.preventDefault();
    try {
      const newSupplier = await createSupplier(supplierForm);
      await loadSuppliers();
      
      // Auto-sélectionner le nouveau fournisseur
      setPurchaseForm({
        ...purchaseForm,
        supplier_id: newSupplier.id,
        supplier_name: newSupplier.company_name
      });
      
      setShowSupplierFormModal(false);
      resetSupplierForm();
      
      alert('Fournisseur créé et sélectionné!');
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la création');
    }
  };

  // ===== GESTION ADRESSES =====
  const handleAddressSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingAddress) {
        await updateShippingAddress(editingAddress.id, addressForm);
      } else {
        await createShippingAddress(addressForm);
      }

      await loadShippingAddresses();
      setShowAddressFormModal(false);
      resetAddressForm();
      
      alert(editingAddress ? 'Adresse mise à jour avec succès!' : 'Adresse créée avec succès!');
      
    } catch (error) {
      console.error('Erreur sauvegarde adresse:', error);
      alert('Erreur lors de la sauvegarde de l\'adresse: ' + error.message);
    }
  };

  const handleDeleteAddress = async (id) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette adresse ?')) return;
    
    try {
      await deleteShippingAddress(id);
      await loadShippingAddresses();
    } catch (error) {
      console.error('Erreur suppression adresse:', error);
      alert('Erreur lors de la suppression');
    }
  };

  // ===== FONCTIONS DE RESET =====
  const resetForm = () => {
    setShowForm(false);
    setEditingPurchase(null);
    setSelectedItems([]);
    setPurchaseForm({
      supplier_id: '',
      supplier_name: '',
      linked_po_id: '',
      linked_po_number: '',
      linked_submission_id: null,
      supplier_quote_reference: '',
      ba_acomba: '', // NOUVEAU CHAMP
      shipping_address_id: '',
      shipping_company: '',
      shipping_account: '',
      delivery_date: '',
      items: [],
      subtotal: 0,
      tps: 0,
      tvq: 0,
      shipping_cost: 0,
      total_amount: 0,
      status: 'draft',
      notes: '',
      purchase_number: ''
    });
    setProductSearchTerm('');
    setFocusedProductIndex(-1);
    setEmailStatus('');
    setIsLoadingEmail(false);
  };

  const resetSupplierForm = () => {
    setEditingSupplier(null);
    setSupplierForm({
      company_name: '',
      contact_name: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      province: 'QC',
      postal_code: '',
      country: 'Canada',
      notes: '',
      preferred_english: false,
      tax_id: '',
      tax_exempt: false
    });
  };

  const resetAddressForm = () => {
    setEditingAddress(null);
    setAddressForm({
      name: '',
      address: '',
      city: '',
      province: 'QC',
      postal_code: '',
      country: 'Canada',
      is_default: false
    });
  };

  // ===== UTILITAIRES =====
  const shouldShowBilingual = () => {
    const selectedSupplier = suppliers.find(s => s.id === purchaseForm.supplier_id);
    return selectedSupplier?.preferred_english || false;
  };
  
  const isCanadianSupplier = () => {
    const selectedSupplier = suppliers.find(s => s.id === purchaseForm.supplier_id);
    return !selectedSupplier || selectedSupplier.country === 'Canada';
  };

  const handleFixExistingPurchases = async () => {
    if (isFixingPOs) return;
    
    try {
      setIsFixingPOs(true);
      console.log('Correction des achats existants...');
      
      const result = await fixExistingPurchases();
      
      console.log(`Correction terminée! ${result.fixed} achats corrigés.`);
      alert(`Correction terminée!\n${result.fixed} achat(s) corrigé(s).`);
      
      await loadSupplierPurchases();
      
    } catch (error) {
      console.error('Erreur lors de la correction:', error);
      alert('Erreur lors de la correction: ' + error.message);
    } finally {
      setIsFixingPOs(false);
    }
  };

  const handleTestEmail = async () => {
    try {
      setIsLoadingEmail(true);
      setEmailStatus('Test en cours...');
      await testEmailFunction();
      setEmailStatus('✅ Test email envoyé');
    } catch (error) {
      setEmailStatus(`❌ Erreur test: ${error.message}`);
    } finally {
      setIsLoadingEmail(false);
    }
  };

  // ===== FILTRAGE AMÉLIORÉ AVEC DATE DE CRÉATION =====
  const filteredPurchases = supplierPurchases.filter(purchase => {
    // Filtrage par texte existant (inchangé)
    const matchesSearch = 
      purchase.purchase_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      purchase.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      purchase.linked_po_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      purchase.ba_acomba?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getPONumber(purchase, purchaseOrders)?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || purchase.status === statusFilter;
    
    // NOUVEAU - Filtrage par date de création
    let matchesDate = true;
    if (dateFilter !== 'all' && purchase.created_at) {
      const purchaseDate = new Date(purchase.created_at);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      
      switch (dateFilter) {
        case 'today':
          const startOfToday = new Date(today);
          startOfToday.setHours(0, 0, 0, 0);
          matchesDate = purchaseDate >= startOfToday && purchaseDate <= today;
          break;
          
        case 'this_week':
          const startOfWeek = new Date(today);
          startOfWeek.setDate(today.getDate() - today.getDay());
          startOfWeek.setHours(0, 0, 0, 0);
          matchesDate = purchaseDate >= startOfWeek && purchaseDate <= today;
          break;
          
        case 'this_month':
          const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
          matchesDate = purchaseDate >= startOfMonth && purchaseDate <= today;
          break;
          
        case 'custom':
          if (customStartDate || customEndDate) {
            const start = customStartDate ? new Date(customStartDate + 'T00:00:00') : new Date(0);
            const end = customEndDate ? new Date(customEndDate + 'T23:59:59') : new Date();
            matchesDate = purchaseDate >= start && purchaseDate <= end;
          }
          break;
          
        default:
          matchesDate = true;
      }
    }
    
    return matchesSearch && matchesStatus && matchesDate;
  });

  // ===== RETURN DU HOOK =====
  return {
    // États principaux
    supplierPurchases,
    suppliers,
    purchaseOrders,
    shippingAddresses,
    products,
    loading,
    
    // États UI
    showForm,
    setShowForm,
    showSupplierModal,
    setShowSupplierModal,
    showAddressModal,
    setShowAddressModal,
    showAddressFormModal,
    setShowAddressFormModal,
    editingPurchase,
    setEditingPurchase,
    editingSupplier,
    setEditingSupplier,
    editingAddress,
    setEditingAddress,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    selectedPurchaseId,
    setSelectedPurchaseId,
    showSupplierFormModal,
    setShowSupplierFormModal,
    
    // NOUVEAUX ÉTATS POUR FILTRES DATE
    dateFilter,
    setDateFilter,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    getDateFilterStats,
    
    // États import soumission
    showImportSubmissionModal,
    setShowImportSubmissionModal,
    availableSubmissions,
    selectedSubmissionForImport,
    itemsToImport,
    loadingSubmissions,
    emailStatus,
    setEmailStatus,
    isLoadingEmail,
    
    // États recherche produits
    productSearchTerm,
    setProductSearchTerm,
    searchingProducts,
    selectedItems,
    setSelectedItems,
    focusedProductIndex,
    setFocusedProductIndex,
    showQuantityInput,
    setShowQuantityInput,
    selectedProductForQuantity,
    setSelectedProductForQuantity,
    tempQuantity,
    setTempQuantity,

    // États modal non-inventaire
    showNonInventoryModal,
    setShowNonInventoryModal,
    nonInventoryForm,
    setNonInventoryForm,
    showUsdCalculatorCost,
    setShowUsdCalculatorCost,
    showUsdCalculatorSelling,
    setShowUsdCalculatorSelling,
    usdAmountCost,
    setUsdAmountCost,
    usdAmountSelling,
    setUsdAmountSelling,
    usdToCadRate,
    loadingExchangeRate,
    exchangeRateError,
    
    // Fonctions modal non-inventaire
    fetchExchangeRate,
    applyProfitMargin,
    useConvertedAmountCost,
    useConvertedAmountSelling,
    addNonInventoryProduct,
    
    // État correction
    isFixingPOs,
    
    // Formulaires
    purchaseForm,
    setPurchaseForm,
    supplierForm,
    setSupplierForm,
    addressForm,
    setAddressForm,
    
    // Handlers principaux
    handlePurchaseSubmit,
    handleDeletePurchase,
    handleEditPurchase,
    handleQuickStatusUpdate, // NOUVELLE FONCTION
    handleSupplierSubmit,
    handleSupplierFormSubmit,
    handleDeleteSupplier,
    handleAddressSubmit,
    handleDeleteAddress,
    
    // Handlers produits
    handleProductKeyDown,
    handleQuantityKeyDown,
    selectProductForQuantity,
    addItemToPurchase,
    updateItemQuantity,
    updateItemPrice,
    updateItemNotes,
    removeItemFromPurchase,
    
    // Handlers soumissions
    handleFetchAvailableSubmissions,
    handleSubmissionSelect,
    toggleItemSelection,
    updateImportQuantity,
    handleImportSelectedItems,
    
    // Fonctions utilitaires
    resetForm,
    resetSupplierForm,
    resetAddressForm,
    shouldShowBilingual,
    isCanadianSupplier,
    handleFixExistingPurchases,
    handleTestEmail,
    loadSupplierPurchases,
    
    // Données filtrées
    filteredPurchases,
    
    // Fonctions de formatage (réexportées pour facilité)
    formatCurrency,
    formatUnitPrice,
    formatDate,
    getPONumber,

    // États modal mise à jour prix
    showPriceUpdateModal,
    setShowPriceUpdateModal,
    priceUpdateItem,
    priceUpdateForm,
    setPriceUpdateForm,
    
    // Fonctions modal mise à jour prix
    handlePriceBlur,
    applyPriceUpdateMargin,
    updateInventoryPrice,
    closePriceUpdateModal
  };
};
