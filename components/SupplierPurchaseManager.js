import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  MoreVertical, Eye, Edit, Trash2, FileText, Download, Search, 
  Plus, Upload, X, ChevronDown, ShoppingCart, Building2, Truck,
  MapPin, Calendar, Package, DollarSign, Printer, Wrench
} from 'lucide-react';

// Fonction pour obtenir le pattern du code postal
const getPostalCodePattern = (country) => {
  switch (country) {
    case 'Canada':
      return "[A-Za-z]\\d[A-Za-z] \\d[A-Za-z]\\d";
    case 'USA':
      return "\\d{5}(-\\d{4})?";
    default:
      return "";
  }
};

// Fonction pour obtenir le placeholder du code postal
const getPostalCodePlaceholder = (country) => {
  switch (country) {
    case 'Canada':
      return "H1A 1A1";
    case 'USA':
      return "12345 ou 12345-6789";
    default:
      return "";
  }
};

export default function SupplierPurchaseManager() {
  // États principaux
  const [supplierPurchases, setSupplierPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [shippingAddresses, setShippingAddresses] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // États UI
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
  
  // NOUVEAUX ÉTATS POUR IMPORT SOUMISSION
  const [showImportSubmissionModal, setShowImportSubmissionModal] = useState(false);
  const [availableSubmissions, setAvailableSubmissions] = useState([]);
  const [selectedSubmissionForImport, setSelectedSubmissionForImport] = useState(null);
  const [itemsToImport, setItemsToImport] = useState([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  
  // Recherche produits
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [focusedProductIndex, setFocusedProductIndex] = useState(-1);
  const [showQuantityInput, setShowQuantityInput] = useState(false);
  const [selectedProductForQuantity, setSelectedProductForQuantity] = useState(null);
  const [tempQuantity, setTempQuantity] = useState('1');
  
  // État pour la correction
  const [isFixingPOs, setIsFixingPOs] = useState(false);
  
  // Formulaire principal - MODIFIÉ avec linked_submission_id
  const [purchaseForm, setPurchaseForm] = useState({
    supplier_id: '',
    supplier_name: '',
    linked_po_id: '',
    linked_po_number: '',
    linked_submission_id: null,
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

  // Formulaire fournisseur
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

  // Formulaire adresse
  const [addressForm, setAddressForm] = useState({
    name: '',
    address: '',
    city: '',
    province: 'QC',
    postal_code: '',
    country: 'Canada',
    is_default: false
  });

  // Chargement initial avec vérification auth
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
        
        await fetchSupplierPurchases();
        await fetchSuppliers();
        await fetchPurchaseOrders();
        await fetchShippingAddresses();
        
      } catch (error) {
        console.error('Erreur initialisation:', error);
        setLoading(false);
      }
    };

    initializeData();
  }, []);
  
  // Recherche produits avec debounce
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

  // Calcul automatique des totaux
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

  // NOUVELLES FONCTIONS POUR IMPORT SOUMISSION
  
  // Fonction pour récupérer les soumissions acceptées
  const fetchAvailableSubmissions = async () => {
    setLoadingSubmissions(true);
    try {
      const { data, error } = await supabase
        .from('submissions')
        .select('*')
        .eq('status', 'accepted')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAvailableSubmissions(data || []);
    } catch (error) {
      console.error('Erreur chargement soumissions:', error);
      alert('Erreur lors du chargement des soumissions');
    } finally {
      setLoadingSubmissions(false);
    }
  };

  // Fonction pour gérer la sélection d'une soumission
  const handleSubmissionSelect = (submission) => {
    setSelectedSubmissionForImport(submission);
    const itemsWithSelection = (submission.items || []).map(item => ({
      ...item,
      selected: false,
      importQuantity: item.quantity || 1
    }));
    setItemsToImport(itemsWithSelection);
  };

  // Fonction pour toggle la sélection d'un item
  const toggleItemSelection = (productId, isSelected) => {
    setItemsToImport(items => 
      items.map(item => 
        item.product_id === productId 
          ? { ...item, selected: isSelected }
          : item
      )
    );
  };

  // Fonction pour modifier la quantité d'import
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

  // Fonction pour importer les items sélectionnés
  const handleImportSelectedItems = () => {
    const selectedItems = itemsToImport.filter(item => item.selected);
    
    if (selectedItems.length === 0) {
      alert('Veuillez sélectionner au moins un item à importer');
      return;
    }

    const importedItems = selectedItems.map(item => ({
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
      notes: prev.notes + 
        `\nImporté depuis soumission ${selectedSubmissionForImport.submission_number} - ${selectedSubmissionForImport.client_name}`
    }));

    setShowImportSubmissionModal(false);
    setSelectedSubmissionForImport(null);
    setItemsToImport([]);
    
    alert(`${importedItems.length} item(s) importé(s) depuis la soumission ${selectedSubmissionForImport.submission_number}`);
  };

  // Fonction pour générer le numéro d'achat
  const generatePurchaseNumber = async () => {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const prefix = `ACH-${year}${month}`;
    
    try {
      const { data, error } = await supabase
        .from('supplier_purchases')
        .select('purchase_number')
        .like('purchase_number', `${prefix}-%`)
        .order('purchase_number', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0) {
        const lastNumber = data[0].purchase_number;
        const sequenceMatch = lastNumber.match(/-(\d{3})$/);
        if (sequenceMatch) {
          const nextSequence = (parseInt(sequenceMatch[1]) + 1).toString().padStart(3, '0');
          return `${prefix}-${nextSequence}`;
        }
      }
      
      return `${prefix}-001`;
    } catch (error) {
      console.error('Erreur génération numéro:', error);
      return `${prefix}-001`;
    }
  };

  // FONCTION CORRIGÉE - fetchSupplierPurchases avec jointure
  const fetchSupplierPurchases = async () => {
    try {
      const { data, error } = await supabase
        .from('supplier_purchases')
        .select(`
          *,
          purchase_orders!linked_po_id(po_number, client_name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Enrichir les données avec les informations du PO si elles manquent
      const enrichedData = (data || []).map(purchase => {
        // Si linked_po_number est vide mais qu'on a un linked_po_id ET des données de PO
        if (!purchase.linked_po_number && purchase.linked_po_id && purchase.purchase_orders) {
          console.log(`Enrichissement PO pour achat ${purchase.purchase_number}:`, purchase.purchase_orders.po_number);
          return {
            ...purchase,
            linked_po_number: purchase.purchase_orders.po_number,  
            linked_client_name: purchase.purchase_orders.client_name
          };
        }
        return purchase;
      });
      
      setSupplierPurchases(enrichedData);
    } catch (error) {
      console.error('Erreur chargement achats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('company_name', { ascending: true });

      if (error) throw error;
      setSuppliers(data || []);
    } catch (error) {
      console.error('Erreur chargement fournisseurs:', error);
    }
  };

  const fetchPurchaseOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('id, po_number, client_name, amount, status')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPurchaseOrders(data || []);
    } catch (error) {
      console.error('Erreur chargement bons achat:', error);
    }
  };

  const fetchShippingAddresses = async () => {
    try {
      const { data, error } = await supabase
        .from('shipping_addresses')
        .select('*')
        .order('is_default', { ascending: false });

      if (error) throw error;
      setShippingAddresses(data || []);
    } catch (error) {
      console.error('Erreur chargement adresses:', error);
    }
  };

  // NOUVELLE FONCTION - Correction des achats existants
  const fixExistingPurchases = async () => {
    if (isFixingPOs) return; // Éviter les clics multiples
    
    try {
      setIsFixingPOs(true);
      console.log('Correction des achats existants...');
      
      // Récupérer tous les achats qui ont un linked_po_id mais pas de linked_po_number
      const { data: purchasesToFix, error: fetchError } = await supabase
        .from('supplier_purchases')
        .select('id, purchase_number, linked_po_id, linked_po_number')
        .not('linked_po_id', 'is', null)
        .or('linked_po_number.is.null,linked_po_number.eq.');
      
      if (fetchError) throw fetchError;
      
      console.log(`${purchasesToFix.length} achats à vérifier`);
      
      // Récupérer tous les POs
      const { data: allPOs, error: poError } = await supabase
        .from('purchase_orders')
        .select('id, po_number, client_name');
        
      if (poError) throw poError;
      
      let fixedCount = 0;
      
      // Corriger chaque achat
      for (const purchase of purchasesToFix) {
        const po = allPOs.find(p => p.id === purchase.linked_po_id);
        if (po && (!purchase.linked_po_number || purchase.linked_po_number === '')) {
          const { error: updateError } = await supabase
            .from('supplier_purchases')
            .update({
              linked_po_number: po.po_number
            })
            .eq('id', purchase.id);
            
          if (updateError) {
            console.error(`Erreur correction achat ${purchase.purchase_number}:`, updateError);
          } else {
            console.log(`Achat ${purchase.purchase_number} corrigé avec PO ${po.po_number}`);
            fixedCount++;
          }
        }
      }
      
      console.log(`Correction terminée! ${fixedCount} achats corrigés.`);
      alert(`Correction terminée!\n${fixedCount} achat(s) corrigé(s).`);
      
      // Recharger les données
      await fetchSupplierPurchases();
      
    } catch (error) {
      console.error('Erreur lors de la correction:', error);
      alert('Erreur lors de la correction: ' + error.message);
    } finally {
      setIsFixingPOs(false);
    }
  };

  // FONCTION UTILITAIRE pour récupérer le PO Number
  const getPONumber = (purchase) => {
    // Priorité 1: linked_po_number sauvegardé
    if (purchase.linked_po_number) {
      return purchase.linked_po_number;
    }
    
    // Priorité 2: chercher dans la liste des POs chargés
    if (purchase.linked_po_id) {
      const po = purchaseOrders.find(p => p.id === purchase.linked_po_id);
      return po?.po_number || '';
    }
    
    // Priorité 3: données enrichies de la jointure
    if (purchase.purchase_orders?.po_number) {
      return purchase.purchase_orders.po_number;
    }
    
    return '';
  };

  // Recherche produits
  const searchProducts = async (searchTerm) => {
    if (!searchTerm || searchTerm.length < 2) {
      setProducts([]);
      return;
    }

    try {
      // Recherche dans les produits inventaire
      const { data: inventoryProducts, error: error1 } = await supabase
        .from('products')
        .select('*')
        .or(`description.ilike.%${searchTerm}%,product_id.ilike.%${searchTerm}%`)
        .order('description', { ascending: true })
        .limit(25);

      if (error1) throw error1;

      // Recherche dans les produits non-inventaire
      const { data: nonInventoryProducts, error: error2 } = await supabase
        .from('non_inventory_items')
        .select('*')
        .or(`description.ilike.%${searchTerm}%,product_id.ilike.%${searchTerm}%`)
        .order('description', { ascending: true })
        .limit(25);

      if (error2) throw error2;

      // Combiner les résultats avec un indicateur de type
      const combinedResults = [
        ...(inventoryProducts || []).map(item => ({ ...item, type: 'inventory' })),
        ...(nonInventoryProducts || []).map(item => ({ ...item, type: 'non_inventory' }))
      ];

      // Trier par description
      combinedResults.sort((a, b) => a.description.localeCompare(b.description));

      setProducts(combinedResults);
    } catch (error) {
      console.error('Erreur recherche produits:', error);
      setProducts([]);
    }
  };

  // Gestion des fournisseurs
  const handleSupplierSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingSupplier) {
        const { error } = await supabase
          .from('suppliers')
          .update(supplierForm)
          .eq('id', editingSupplier.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('suppliers')
          .insert([supplierForm]);
        if (error) throw error;
      }

      await fetchSuppliers();
      setShowSupplierModal(false);
      
      // Fermer le modal dialog s'il est ouvert
      const modal = document.getElementById('supplier-form-modal');
      if (modal) {
        modal.close();
      }
      
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
    } catch (error) {
      console.error('Erreur sauvegarde fournisseur:', error);
      alert('Erreur lors de la sauvegarde du fournisseur');
    }
  };

  const handleDeleteSupplier = async (id) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce fournisseur ?')) return;
    
    try {
      const { error } = await supabase
        .from('suppliers')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await fetchSuppliers();
    } catch (error) {
      console.error('Erreur suppression fournisseur:', error);
      alert('Erreur lors de la suppression');
    }
  };

  // Gestion des adresses
  const handleAddressSubmit = async (e) => {
    e.preventDefault();
    try {
      // Si on définit cette adresse comme par défaut, enlever le statut par défaut des autres
      if (addressForm.is_default) {
        const { error: updateError } = await supabase
          .from('shipping_addresses')
          .update({ is_default: false })
          .neq('id', editingAddress?.id || 0);
        
        if (updateError) {
          console.error('Erreur mise à jour adresses par défaut:', updateError);
        }
      }

      if (editingAddress) {
        const { error } = await supabase
          .from('shipping_addresses')
          .update(addressForm)
          .eq('id', editingAddress.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('shipping_addresses')
          .insert([addressForm]);
        if (error) throw error;
      }

      await fetchShippingAddresses();
      
      // Fermer la modal et réinitialiser
      setShowAddressFormModal(false);
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
      
      // Message de succès
      alert(editingAddress ? 'Adresse mise à jour avec succès!' : 'Adresse créée avec succès!');
      
    } catch (error) {
      console.error('Erreur sauvegarde adresse:', error);
      alert('Erreur lors de la sauvegarde de l\'adresse: ' + error.message);
    }
  };

  // Gestion des produits
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
      setSelectedItems([...selectedItems, {
        ...product,
        quantity: quantity,
        notes: ''
      }]);
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

  const updateItemNotes = (productId, notes) => {
    setSelectedItems(selectedItems.map(item =>
      item.product_id === productId ? { ...item, notes: notes } : item
    ));
  };

  const removeItemFromPurchase = (productId) => {
    setSelectedItems(selectedItems.filter(item => item.product_id !== productId));
  };

  // Sauvegarde achat - MODIFIÉE avec linked_submission_id
  const handlePurchaseSubmit = async (e) => {
    e.preventDefault();
    try {
      let purchaseNumber = purchaseForm.purchase_number;
      
      if (!editingPurchase) {
        purchaseNumber = await generatePurchaseNumber();
      }

      // CORRECTION: Filtrer les données pour ne garder que les colonnes de la table
      const purchaseData = {
        supplier_id: purchaseForm.supplier_id,
        supplier_name: purchaseForm.supplier_name,
        linked_po_id: purchaseForm.linked_po_id || null,
        linked_po_number: purchaseForm.linked_po_number,
        linked_submission_id: purchaseForm.linked_submission_id || null, // NOUVEAU CHAMP
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

      if (editingPurchase) {
        const { error } = await supabase
          .from('supplier_purchases')
          .update(purchaseData)
          .eq('id', editingPurchase.id);
        if (error) throw error;
        console.log('Achat mis à jour avec succès');
      } else {
        const { error } = await supabase
          .from('supplier_purchases')
          .insert([purchaseData]);
        if (error) throw error;
        console.log('Achat créé avec succès');
      }

      await fetchSupplierPurchases();
      resetForm();
      console.log(editingPurchase ? 'Achat modifié avec succès!' : 'Achat créé avec succès!');
    } catch (error) {
      console.error('Erreur sauvegarde achat:', error);
      alert('Erreur lors de la sauvegarde: ' + (error.message || 'Erreur inconnue'));
    }
  };

  const handleDeletePurchase = async (id) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet achat ?')) return;
    
    try {
      const { error } = await supabase
        .from('supplier_purchases')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await fetchSupplierPurchases();
    } catch (error) {
      console.error('Erreur suppression achat:', error);
    }
  };

  // resetForm MODIFIÉE avec linked_submission_id
  const resetForm = () => {
    setShowForm(false);
    setEditingPurchase(null);
    setSelectedItems([]);
    setPurchaseForm({
      supplier_id: '',
      supplier_name: '',
      linked_po_id: '',
      linked_po_number: '',
      linked_submission_id: null, // NOUVEAU CHAMP
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
  };

  const handlePrint = () => {
    // Sauvegarder le titre original
    const originalTitle = document.title;
    
    // Changer temporairement le titre pour le nom du fichier PDF
    const pdfFileName = purchaseForm.purchase_number || 'Achat-nouveau';
    document.title = pdfFileName;
    
    // Imprimer
    window.print();
    
    // Restaurer le titre original après un délai
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };

  const exportPDF = async (action = 'download') => {
    try {
      const printContainer = document.querySelector('.print-container');
      if (!printContainer) {
        alert("Aucun contenu à exporter.");
        return;
      }

      const purchaseNumber =
        purchaseForm?.purchase_number ||
        editingPurchase?.purchase_number ||
        'Achat-nouveau';

      // 1) Styles d'impression temporaires
      const printStyles = document.createElement('style');
      printStyles.textContent = `
        .temp-print-view * { visibility: visible !important; }
        .temp-print-view {
          position: absolute !important;
          left: 0 !important; top: 0 !important;
          width: 8.5in !important;
          background: #fff !important;
          padding: 0.5in !important;
          font-size: 12px !important;
          line-height: 1.4 !important;
        }
        .temp-print-view table { width: 100% !important; border-collapse: collapse !important; }
        .temp-print-view th, .temp-print-view td {
          border: 1px solid #000 !important; padding: 8px !important; text-align: left !important;
        }
        .temp-print-view th { background-color: #f0f0f0 !important; }
      `;
      document.head.appendChild(printStyles);

      // 2) Cloner le contenu
      const clonedContainer = printContainer.cloneNode(true);
      clonedContainer.className = 'temp-print-view';
      clonedContainer.style.visibility = 'visible';
      clonedContainer.style.display = 'block';
      document.body.appendChild(clonedContainer);

      await new Promise(r => setTimeout(r, 80));

      // 3) Canvas (laisser html2canvas gérer la hauteur)
      const canvas = await html2canvas(clonedContainer, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });

      // Nettoyage DOM temporaire
      document.body.removeChild(clonedContainer);
      document.head.removeChild(printStyles);

      // 4) PDF avec pagination, marges, numéros de page
      const pdf = new jsPDF({ unit: 'pt', format: 'letter' }); // 612 x 792
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = { top: 36, right: 36, bottom: 36, left: 36 };
      const usableWidth = pageWidth - margin.left - margin.right;
      const usableHeight = pageHeight - margin.top - margin.bottom;

      const imgData = canvas.toDataURL('image/png');
      const imgWidth = usableWidth;
      const imgHeight = canvas.height * (imgWidth / canvas.width);

      let heightLeft = imgHeight;
      let positionY = 0;
      let page = 1;

      while (heightLeft > 0) {
        if (page > 1) pdf.addPage();

        pdf.addImage(
          imgData,
          'PNG',
          margin.left,
          margin.top + positionY,
          imgWidth,
          imgHeight
        );

        // pied de page: numéro de page
        pdf.setFontSize(10);
        pdf.text(
          `Page ${page}`,
          pageWidth - margin.right,
          pageHeight - 14,
          { align: 'right', baseline: 'bottom' }
        );

        heightLeft -= usableHeight;
        positionY -= usableHeight;
        page++;
      }

      // 5) Actions : download / view / modal
      if (action === 'download') {
        pdf.save(`${purchaseNumber}.pdf`);
        return;
      }

      if (action === 'view') {
        // Nouvel onglet sans téléchargement auto
        const pdfBlob = new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(pdfBlob);
        window.open(blobUrl, '_blank');
        return;
      }

      if (action === 'modal') {
        // Data URL = rendu inline fiable dans <embed>
        const dataUrl = pdf.output('dataurlstring');
        openPdfModal(dataUrl, () => {
          /* rien à révoquer pour data: URL */
        });
        return;
      }

    } catch (error) {
      console.error('Erreur lors de la génération PDF:', error);
      alert('Erreur lors de la génération du PDF');
    }
  };

  function openPdfModal(pdfUrl, onClose) {
    // Création des éléments
    const overlay = document.createElement('div');
    const modal = document.createElement('div');
    const header = document.createElement('div');
    const title = document.createElement('div');
    const closeBtn = document.createElement('button');
    const viewer = document.createElement('embed');

    // Styles
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = `
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.6);
      z-index: 99999;
      display: flex; align-items: center; justify-content: center;
      padding: 24px;
    `;
    modal.style.cssText = `
      background: #fff; width: 100%; max-width: 1100px; height: 85vh;
      border-radius: 12px; overflow: hidden;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      display: flex; flex-direction: column;
    `;
    header.style.cssText = `
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 14px; background: #f7f7f7; border-bottom: 1px solid #e5e5e5;
    `;
    title.textContent = 'Aperçu PDF';
    title.style.cssText = `font-weight: 600; font-size: 14px;`;

    closeBtn.type = 'button';
    closeBtn.textContent = 'Fermer';
    closeBtn.style.cssText = `
      padding: 6px 12px; background: #222; color: #fff; border: 0; border-radius: 6px;
      cursor: pointer; font-size: 13px;
    `;

    // Rendu PDF inline fiable
    viewer.type = 'application/pdf';
    viewer.src = pdfUrl;
    viewer.style.cssText = `border: 0; width: 100%; height: 100%;`;

    // Fallback "ouvrir dans un onglet" si jamais
    const fallbackBar = document.createElement('div');
    fallbackBar.style.cssText = `display:flex; gap:8px; align-items:center; padding:8px 14px; border-top:1px solid #eee;`;
    const openTabBtn = document.createElement('a');
    openTabBtn.textContent = 'Ouvrir dans un onglet';
    openTabBtn.href = pdfUrl;
    openTabBtn.target = '_blank';
    openTabBtn.rel = 'noopener';
    openTabBtn.style.cssText = `font-size: 12px; color: #2563eb; text-decoration: underline;`;
    fallbackBar.style.display = 'none';

    // Structure
    header.appendChild(title);
    header.appendChild(closeBtn);
    modal.appendChild(header);
    modal.appendChild(viewer);
    modal.appendChild(fallbackBar);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Si le PDF ne se rend pas, on montre le fallback
    viewer.addEventListener('error', () => { fallbackBar.style.display = 'flex'; fallbackBar.appendChild(openTabBtn); });
    viewer.addEventListener('load', () => { /* ok */ });

    // Fermeture (Échap, clic overlay, bouton)
    const escHandler = (e) => { if (e.key === 'Escape') doClose(); };
    const clickHandler = (e) => { if (e.target === overlay) doClose(); };

    function doClose() {
      viewer.src = 'about:blank';
      document.removeEventListener('keydown', escHandler);
      overlay.removeEventListener('click', clickHandler);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (typeof onClose === 'function') onClose();
    }

    closeBtn.addEventListener('click', doClose);
    document.addEventListener('keydown', escHandler);
    overlay.addEventListener('click', clickHandler);
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('fr-CA');
  };

    // Fonction pour déterminer si le bon doit être bilingue basé sur le fournisseur
const shouldShowBilingual = () => {
  const selectedSupplier = suppliers.find(s => s.id === purchaseForm.supplier_id);
  return selectedSupplier?.preferred_english || false;
};
  
    // Fonction pour vérifier si c'est un fournisseur canadien (pour les taxes)
  const isCanadianSupplier = () => {
  const selectedSupplier = suppliers.find(s => s.id === purchaseForm.supplier_id);
  return !selectedSupplier || selectedSupplier.country === 'Canada';
};

  const filteredPurchases = supplierPurchases.filter(purchase => {
    const matchesSearch = 
      purchase.purchase_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      purchase.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      purchase.linked_po_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getPONumber(purchase)?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || purchase.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
        <p className="ml-4 text-orange-600 font-medium">Chargement des achats fournisseurs...</p>
      </div>
    );
  }

  // Formulaire d'achat
  if (showForm) {
    const selectedSupplier = suppliers.find(s => s.id === purchaseForm.supplier_id);
    const selectedAddress = shippingAddresses.find(a => a.id === purchaseForm.shipping_address_id);

    return (
      <>
        {/* STYLES D'IMPRESSION */}
        <style jsx>{`
          @media print {
            @page {
              size: letter;
              margin: 0.5in;
            }
            
            body * {
              visibility: hidden;
            }
            
            .print-container, .print-container * {
              visibility: visible;
            }
            
            .print-container {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              background: white;
              font-size: 12px;
              line-height: 1.4;
            }
            
            .no-print {
              display: none !important;
            }
            
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 1rem 0;
            }
            
            th, td {
              border: 1px solid #000;
              padding: 8px;
              text-align: left;
              font-size: 11px;
            }
            
            th {
              background-color: #f0f0f0 !important;
              font-weight: bold;
            }
            
            .grid {
              display: grid !important;
            }
            
            .grid-cols-2 {
              grid-template-columns: 1fr 1fr !important;
            }
            
            .gap-8 {
              gap: 2rem !important;
            }
          }
          
          /* Styles pour la capture HTML2Canvas */
          .temp-print-view {
            font-family: Arial, sans-serif;
            background: white;
            padding: 36pt;
            width: 576pt; /* 8 inches */
          }
        `}</style>

        {/* ZONE D'IMPRESSION - VERSION CONDITIONNELLE BASÉE SUR FOURNISSEUR */}
        <div className="print-container hidden print:block">
          {/* En-tête avec logo et informations du bon de commande */}
          <div className="flex justify-between items-start mb-8">
            <div className="flex-shrink-0">
              <img src="/logo.png" alt="Logo" className="h-20 mb-4" />
            </div>
            
            <div className="text-right">
              <h1 className="text-2xl font-bold mb-2">
                {shouldShowBilingual() ? 'PURCHASE ORDER' : 'BON DE COMMANDE'}
              </h1>
              <div className="text-sm text-gray-600 space-y-1">
                <p><strong>{purchaseForm.purchase_number}</strong></p>
                <p><strong>{shouldShowBilingual() ? 'Date:' : 'Date:'}</strong> {formatDate(new Date())}</p>
                {purchaseForm.linked_po_number && (
                  <p><strong>{shouldShowBilingual() ? 'Client PO:' : 'BA Client:'}</strong> {purchaseForm.linked_po_number}</p>
                )}
                {purchaseForm.delivery_date && (
                  <p><strong>{shouldShowBilingual() ? 'Expected Delivery:' : 'Livraison prévue:'}</strong> {formatDate(purchaseForm.delivery_date)}</p>
                )}
              </div>
            </div>
          </div>

          {/* Section Fournisseur et Livrer à côte à côte */}
          <div className="grid grid-cols-2 gap-8 mb-6">
            {/* Fournisseur à gauche */}
            {selectedSupplier && (
              <div>
                <h3 className="font-bold mb-2 text-lg border-b border-gray-300 pb-1">
                  {shouldShowBilingual() ? 'Supplier:' : 'Fournisseur:'}
                </h3>
                <div className="space-y-1">
                  <p className="font-medium text-base">{selectedSupplier.company_name}</p>
                  {selectedSupplier.contact_name && (
                    <p>{shouldShowBilingual() ? 'Contact:' : 'Contact:'} {selectedSupplier.contact_name}</p>
                  )}
                  <p>{selectedSupplier.address}</p>
                  <p>{selectedSupplier.city}, {selectedSupplier.province} {selectedSupplier.postal_code}</p>
                  <p>{selectedSupplier.country}</p>
                  {selectedSupplier.email && <p>Email: {selectedSupplier.email}</p>}
                  {selectedSupplier.phone && (
                    <p>{shouldShowBilingual() ? 'Tel:' : 'Tél:'} {selectedSupplier.phone}</p>
                  )}
                </div>
              </div>
            )}
            
            {/* Livrer à droite */}
            {selectedAddress && (
              <div>
                <h3 className="font-bold mb-2 text-lg border-b border-gray-300 pb-1">
                  {shouldShowBilingual() ? 'Ship to:' : 'Livrer à :'}
                </h3>
                <div className="space-y-1">
                  <p className="font-medium text-base">{selectedAddress.name}</p>
                  <p>{selectedAddress.address}</p>
                  <p>{selectedAddress.city}, {selectedAddress.province} {selectedAddress.postal_code}</p>
                  <p>{selectedAddress.country}</p>
                </div>
              </div>
            )}
          </div>

          {/* Informations de livraison */}
          {(purchaseForm.shipping_company || purchaseForm.shipping_account) && (
            <div className="mb-6 bg-gray-50 p-3 rounded">
              <h3 className="font-bold mb-2">
                {shouldShowBilingual() ? 'Shipping:' : 'Livraison:'}
              </h3>
              <div className="flex gap-6">
                {purchaseForm.shipping_company && (
                  <p><strong>{shouldShowBilingual() ? 'Carrier:' : 'Transporteur:'}</strong> {purchaseForm.shipping_company}</p>
                )}
                {purchaseForm.shipping_account && (
                  <p><strong>{shouldShowBilingual() ? 'Account #:' : 'N° de compte:'}</strong> {purchaseForm.shipping_account}</p>
                )}
              </div>
            </div>
          )}

          {/* Tableau des produits */}
          <table className="mb-6">
            <thead>
              <tr>
                <th>{shouldShowBilingual() ? 'Code' : 'Code'}</th>
                <th>{shouldShowBilingual() ? 'Description' : 'Description'}</th>
                <th>{shouldShowBilingual() ? 'Qty' : 'Qté'}</th>
                <th>{shouldShowBilingual() ? 'Unit' : 'Unité'}</th>
                <th>{shouldShowBilingual() ? 'Unit Price' : 'Prix Unit.'}</th>
                <th>{shouldShowBilingual() ? 'Total' : 'Total'}</th>
              </tr>
            </thead>
            <tbody>
              {selectedItems.map((item) => (
                <tr key={item.product_id}>
                  <td>{item.product_id}</td>
                  <td>
                    {item.description}
                    {item.notes && (
                    <div style={{fontSize: '10px', color: '#666', marginTop: '4px', fontStyle: 'italic'}}>
                    {item.notes}
                    </div>
                    )}
                </td>
                  <td className="text-center">{item.quantity}</td>
                  <td className="text-center">{item.unit}</td>
                  <td className="text-right">{formatCurrency(item.cost_price)}</td>
                  <td className="text-right">{formatCurrency(item.cost_price * item.quantity)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="5" className="text-right font-medium">
                  {shouldShowBilingual() ? 'Sous-total / Subtotal:' : 'Sous-total:'}
                </td>
                <td className="text-right">{formatCurrency(purchaseForm.subtotal)}</td>
              </tr>
              
              {/* Afficher les taxes seulement si le fournisseur est canadien ET non-exempté */}
{isCanadianSupplier() && (
  <>
    <tr>
      <td colSpan="5" className="text-right font-medium">
        {shouldShowBilingual() ? 'GST (5%):' : 'TPS (5%):'}
      </td>
      <td className="text-right">{formatCurrency(purchaseForm.tps)}</td>
    </tr>
    <tr>
      <td colSpan="5" className="text-right font-medium">
        {shouldShowBilingual() ? 'PST (9.975%):' : 'TVQ (9.975%):'}
      </td>
      <td className="text-right">{formatCurrency(purchaseForm.tvq)}</td>
    </tr>
  </>
)}
              
              {purchaseForm.shipping_cost > 0 && (
                <tr>
                  <td colSpan="5" className="text-right font-medium">
                    {shouldShowBilingual() ? 'Shipping:' : 'Frais de livraison:'}
                  </td>
                  <td className="text-right">{formatCurrency(purchaseForm.shipping_cost)}</td>
                </tr>
              )}
              <tr>
                <td colSpan="5" className="text-right font-bold text-lg bg-gray-100">
                  {shouldShowBilingual() ? 'TOTAL CAD$:' : 'TOTAL:'}
                </td>
                <td className="text-right font-bold text-lg bg-gray-100">{formatCurrency(purchaseForm.total_amount)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Notes */}
          {purchaseForm.notes && (
            <div className="mt-6 border-t pt-4">
              <h3 className="font-bold mb-2">
                {shouldShowBilingual() ? 'Notes:' : 'Notes:'}
              </h3>
              <p className="text-sm">{purchaseForm.notes}</p>
            </div>
          )}
        </div>

        {/* FORMULAIRE */}
        <div className="max-w-6xl mx-auto p-4 no-print">
          <div className="bg-white rounded-xl shadow-lg border border-orange-200 overflow-hidden">
            
            {/* En-tête */}
            <div className="bg-gradient-to-r from-orange-500 to-red-600 text-white p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold">
                    {editingPurchase ? 'Modifier Achat Fournisseur' : 'Nouvel Achat Fournisseur'}
                  </h2>
                  <p className="text-orange-100 text-sm mt-1">
                    {purchaseForm.purchase_number && `N°: ${purchaseForm.purchase_number}`}
                  </p>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                  <button
                    onClick={() => exportPDF('download')}
                    className="w-full sm:w-auto px-4 py-2 bg-white/20 rounded-lg hover:bg-white/30 text-sm font-medium"
                  >
                    Télécharger PDF
                  </button>
                  <button
                    onClick={() => exportPDF('modal')}
                    className="w-full sm:w-auto px-4 py-2 bg-white/20 rounded-lg hover:bg-white/30 text-sm font-medium"
                  >
                    Aperçu Modal
                  </button>
                  <button
                    onClick={() => exportPDF('view')}
                    className="w-full sm:w-auto px-4 py-2 bg-white/20 rounded-lg hover:bg-white/30 text-sm font-medium"
                  >
                    Voir PDF
                  </button>
                  <button
                    onClick={handlePrint}
                    className="w-full sm:w-auto px-4 py-2 bg-white/20 rounded-lg hover:bg-white/30 text-sm font-medium"
                  >
                    Imprimer
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="w-full sm:w-auto px-4 py-2 bg-white/10 border border-white/20 rounded-lg hover:bg-white/20 text-sm font-medium"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    form="purchase-form"
                    className="w-full sm:w-auto px-4 py-2 bg-white text-orange-600 rounded-lg hover:bg-gray-100 font-medium text-sm"
                  >
                    {editingPurchase ? 'Mettre à jour' : 'Créer'}
                  </button>
                </div>
              </div>
            </div>
            
            {/* Contenu du formulaire */}
            <div className="p-4 sm:p-6">
              <form id="purchase-form" onSubmit={handlePurchaseSubmit} className="space-y-6">
                
                {/* Fournisseur et Bon d'achat lié */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <label className="block text-sm font-semibold text-blue-800 mb-2">
                      Fournisseur *
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={purchaseForm.supplier_id}
                        onChange={(e) => {
                          const supplier = suppliers.find(s => s.id === e.target.value);
                          setPurchaseForm({
                            ...purchaseForm, 
                            supplier_id: e.target.value,
                            supplier_name: supplier?.company_name || ''
                          });
                        }}
                        className="block flex-1 rounded-lg border-blue-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3"
                        required
                      >
                        <option value="">Sélectionner un fournisseur...</option>
                        {suppliers.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.company_name}
                          </option>
                        ))}
                      </select>
                      
                      <button
                        type="button"
                        onClick={() => setShowSupplierFormModal(true)}
                        className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex-shrink-0"
                        title="Nouveau fournisseur"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => setShowSupplierModal(true)}
                        className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 flex-shrink-0"
                        title="Gérer les fournisseurs"
                      >
                        <Building2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                    <label className="block text-sm font-semibold text-green-800 mb-2">
                      Bon d'achat client lié
                    </label>
                    <select
                      value={purchaseForm.linked_po_id}
                      onChange={(e) => {
                        const selectedPoId = e.target.value;
                        const po = purchaseOrders.find(p => p.id === selectedPoId);
                        
                        console.log('PO sélectionné:', po);
                        
                        setPurchaseForm({
                          ...purchaseForm, 
                          linked_po_id: selectedPoId,
                          linked_po_number: po?.po_number || '',
                        });
                      }}
                      className="block w-full rounded-lg border-green-300 shadow-sm focus:border-green-500 focus:ring-green-500 text-base p-3"
                    >
                      <option value="">Aucun (optionnel)</option>
                      {purchaseOrders.map((po) => (
                        <option key={po.id} value={po.id}>
                          {po.po_number} - {po.client_name} ({formatCurrency(po.amount)})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Adresse de livraison et Méthode */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                  <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                    <label className="block text-sm font-semibold text-purple-800 mb-2">
                      Adresse de livraison *
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={purchaseForm.shipping_address_id}
                        onChange={(e) => setPurchaseForm({...purchaseForm, shipping_address_id: e.target.value})}
                        className="block flex-1 rounded-lg border-purple-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-base p-3"
                        required
                      >
                        <option value="">Sélectionner une adresse...</option>
                        {shippingAddresses.map((address) => (
                          <option key={address.id} value={address.id}>
                            {address.name} - {address.city}
                            {address.is_default && ' ⭐'}
                          </option>
                        ))}
                      </select>
                      
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          
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
                          
                          setShowAddressFormModal(true);
                        }}
                        className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex-shrink-0"
                        title="Nouvelle adresse"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => setShowAddressModal(true)}
                        className="px-3 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 flex-shrink-0"
                        title="Gérer les adresses"
                      >
                        <MapPin className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-semibold text-orange-800 mb-2">
                          Transporteur
                        </label>
                        <input
                          type="text"
                          value={purchaseForm.shipping_company}
                          onChange={(e) => setPurchaseForm({...purchaseForm, shipping_company: e.target.value})}
                          className="block w-full rounded-lg border-orange-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3"
                          placeholder="Ex: FedEx, UPS..."
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-orange-800 mb-2">
                          N° Compte
                        </label>
                        <input
                          type="text"
                          value={purchaseForm.shipping_account}
                          onChange={(e) => setPurchaseForm({...purchaseForm, shipping_account: e.target.value})}
                          className="block w-full rounded-lg border-orange-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3"
                          placeholder="N° compte..."
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Date de livraison et Statut */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                  <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                    <label className="block text-sm font-semibold text-yellow-800 mb-2">
                      Date livraison prévue
                    </label>
                    <input
                      type="date"
                      value={purchaseForm.delivery_date}
                      onChange={(e) => setPurchaseForm({...purchaseForm, delivery_date: e.target.value})}
                      className="block w-full rounded-lg border-yellow-300 shadow-sm focus:border-yellow-500 focus:ring-yellow-500 text-base p-3"
                    />
                  </div>

                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <label className="block text-sm font-semibold text-gray-800 mb-2">
                      Statut
                    </label>
                    <select
                      value={purchaseForm.status}
                      onChange={(e) => setPurchaseForm({...purchaseForm, status: e.target.value})}
                      className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base p-3"
                    >
                      <option value="draft">Brouillon</option>
                      <option value="ordered">Commandé</option>
                      <option value="received">Reçu</option>
                      <option value="cancelled">Annulé</option>
                    </select>
                  </div>

                  <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                    <label className="block text-sm font-semibold text-red-800 mb-2">
                      Frais de livraison
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={purchaseForm.shipping_cost}
                      onChange={(e) => setPurchaseForm({...purchaseForm, shipping_cost: e.target.value})}
                      className="block w-full rounded-lg border-red-300 shadow-sm focus:border-red-500 focus:ring-red-500 text-base p-3"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* Recherche produits AVEC BOUTON IMPORT SOUMISSION */}
                <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                  <h3 className="text-base sm:text-lg font-semibold text-indigo-800 mb-4">
                    Recherche Produits
                  </h3>
                  
                  <div className="flex flex-col sm:flex-row gap-3 mb-4">
                    <div className="flex-1">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                          id="product-search"
                          type="text"
                          placeholder="Rechercher un produit (min. 2 caractères)..."
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
                    
                    {/* NOUVEAU BOUTON IMPORT SOUMISSION */}
                    <button
                      type="button"
                      onClick={() => {
                        fetchAvailableSubmissions();
                        setShowImportSubmissionModal(true);
                      }}
                      className="w-full sm:w-auto px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium flex items-center justify-center"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Importer depuis Soumission
                    </button>
                  </div>
                  
                  {/* Résultats recherche */}
                  {searchingProducts && (
                    <div className="flex items-center justify-center p-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mr-2"></div>
                      <span className="text-indigo-600">Recherche en cours...</span>
                    </div>
                  )}
                  
                  {productSearchTerm.length >= 2 && !searchingProducts && products.length > 0 && (
                    <div className="mt-3 max-h-60 overflow-y-auto border border-indigo-200 rounded-lg">
                      {products.map((product, index) => (
                        <div 
                          key={product.product_id} 
                          className={`p-3 border-b hover:bg-indigo-50 cursor-pointer ${
                            index === focusedProductIndex ? 'bg-indigo-100' : ''
                          }`}
                          onClick={() => selectProductForQuantity(product)}
                        >
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-medium">{product.product_id} - {product.description}</p>
                              <p className="text-sm text-gray-600">
                                Prix coût: {formatCurrency(product.cost_price)} / {product.unit}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm"
                            >
                              Ajouter
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Modal quantité */}
                {showQuantityInput && selectedProductForQuantity && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg w-full max-w-md p-6">
                      <h3 className="text-lg font-semibold mb-4">
                        Quantité pour: {selectedProductForQuantity.description}
                      </h3>
                      <input
                        id="quantity-input"
                        type="number"
                        step="1"
                        min="1"
                        value={tempQuantity}
                        onChange={(e) => setTempQuantity(e.target.value)}
                        onKeyDown={handleQuantityKeyDown}
                        className="block w-full rounded-lg border-gray-300 shadow-sm text-base p-3 mb-4"
                        autoFocus
                      />
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setShowQuantityInput(false);
                            setSelectedProductForQuantity(null);
                            setTempQuantity('1');
                          }}
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (tempQuantity && parseInt(tempQuantity) > 0) {
                              addItemToPurchase(selectedProductForQuantity, parseInt(tempQuantity));
                              setShowQuantityInput(false);
                              setSelectedProductForQuantity(null);
                              setTempQuantity('1');
                              setProductSearchTerm('');
                            }
                          }}
                          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                          Ajouter
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Items sélectionnés */}
                {selectedItems.length > 0 && (
                  <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                    <h3 className="text-base sm:text-lg font-semibold text-yellow-800 mb-4">
                      Produits Sélectionnés ({selectedItems.length})
                    </h3>
                    
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-yellow-100">
                          <tr>
                            <th className="text-left p-2">Code</th>
                            <th className="text-left p-2">Description</th>
                            <th className="text-center p-2">Qté</th>
                            <th className="text-right p-2">Prix Coût</th>
                            <th className="text-right p-2">Total</th>
                            <th className="text-left p-2">Notes</th>
                            <th className="text-center p-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedItems.map((item) => (
                            <tr key={item.product_id} className="border-b">
                              <td className="p-2">{item.product_id}</td>
                              <td className="p-2">{item.description}</td>
                              <td className="p-2 text-center">
                                <input
                                  type="number"
                                  step="1"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) => updateItemQuantity(item.product_id, e.target.value)}
                                  className="w-16 text-center rounded border-gray-300"
                                />
                              </td>
                              <td className="p-2 text-right">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={item.cost_price}
                                  onChange={(e) => updateItemPrice(item.product_id, e.target.value)}
                                  className="w-20 text-right rounded border-gray-300"
                                />
                              </td>
                              <td className="p-2 text-right font-medium">
                                {formatCurrency(item.cost_price * item.quantity)}
                              </td>
                              <td className="p-2">
                                <input
                                  type="text"
                                  value={item.notes || ''}
                                  onChange={(e) => updateItemNotes(item.product_id, e.target.value)}
                                  className="w-32 rounded border-gray-300 text-sm p-1"
                                  placeholder="Notes..."
                                />
                              </td>
                              <td className="p-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => removeItemFromPurchase(item.product_id)}
                                  className="text-red-600 hover:text-red-800"
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    Notes
                  </label>
                  <textarea
                    value={purchaseForm.notes}
                    onChange={(e) => setPurchaseForm({...purchaseForm, notes: e.target.value})}
                    className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500 text-base p-3"
                    rows="3"
                    placeholder="Notes additionnelles..."
                  />
                </div>

                {/* Totaux */}
                <div className={`grid grid-cols-1 gap-4 ${isCanadianSupplier() ? 'sm:grid-cols-5' : 'sm:grid-cols-3'}`}>
                  <div className="bg-green-100 p-4 rounded-lg border border-green-300">
                    <p className="text-sm font-semibold text-green-800">Sous-total</p>
                    <p className="text-xl font-bold text-green-900">{formatCurrency(purchaseForm.subtotal)}</p>
                  </div>
                  
                  {isCanadianSupplier() && (
                    <>
                      <div className="bg-blue-100 p-4 rounded-lg border border-blue-300">
                        <p className="text-sm font-semibold text-blue-800">TPS (5%)</p>
                        <p className="text-xl font-bold text-blue-900">{formatCurrency(purchaseForm.tps)}</p>
                      </div>
                      <div className="bg-cyan-100 p-4 rounded-lg border border-cyan-300">
                        <p className="text-sm font-semibold text-cyan-800">TVQ (9.975%)</p>
                        <p className="text-xl font-bold text-cyan-900">{formatCurrency(purchaseForm.tvq)}</p>
                      </div>
                    </>
                  )}
                  
                  <div className="bg-orange-100 p-4 rounded-lg border border-orange-300">
                    <p className="text-sm font-semibold text-orange-800">Livraison</p>
                    <p className="text-xl font-bold text-orange-900">{formatCurrency(purchaseForm.shipping_cost)}</p>
                  </div>
                  <div className="bg-purple-100 p-4 rounded-lg border border-purple-300">
                    <p className="text-sm font-semibold text-purple-800">TOTAL</p>
                    <p className="text-xl font-bold text-purple-900">{formatCurrency(purchaseForm.total_amount)}</p>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* MODAL IMPORT SOUMISSION - AJOUTÉ ICI */}
        {showImportSubmissionModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
              
              {/* En-tête */}
              <div className="bg-green-50 p-6 border-b border-green-200">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-2xl font-bold text-green-600">Importer depuis une Soumission</h2>
                    <p className="text-green-700 text-sm mt-1">
                      Sélectionnez une soumission acceptée et choisissez les items à commander
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowImportSubmissionModal(false);
                      setSelectedSubmissionForImport(null);
                      setItemsToImport([]);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Fermer
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {/* Étape 1: Sélection de la soumission */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">
                    1. Sélectionnez une soumission acceptée
                  </h3>
                  
                  {loadingSubmissions ? (
                    <div className="flex items-center justify-center p-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mr-3"></div>
                      <span className="text-green-600">Chargement des soumissions...</span>
                    </div>
                  ) : availableSubmissions.length === 0 ? (
                    <div className="text-center p-8 text-gray-500">
                      <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                      <p>Aucune soumission acceptée trouvée</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {availableSubmissions.map((submission) => (
                        <div 
                          key={submission.id} 
                          className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                            selectedSubmissionForImport?.id === submission.id 
                              ? 'border-green-500 bg-green-50' 
                              : 'border-gray-200 hover:border-green-300 hover:bg-green-25'
                          }`}
                          onClick={() => handleSubmissionSelect(submission)}
                        >
                          <div className="space-y-2">
                            <div className="flex justify-between items-start">
                              <h4 className="font-semibold text-gray-900">
                                {submission.submission_number}
                              </h4>
                              <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
                                Acceptée
                              </span>
                            </div>
                            <p className="text-sm text-gray-600">
                              <strong>Client:</strong> {submission.client_name}
                            </p>
                            <p className="text-sm text-gray-600">
                              <strong>Description:</strong> {submission.description}
                            </p>
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-green-600 font-medium">
                                {formatCurrency(submission.amount)}
                              </span>
                              <span className="text-gray-500">
                                {submission.items?.length || 0} item(s)
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">
                              {formatDate(submission.created_at)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Étape 2: Sélection des items */}
                {selectedSubmissionForImport && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">
                      2. Sélectionnez les items à commander
                    </h3>
                    
                    <div className="bg-blue-50 p-4 rounded-lg mb-4">
                      <p className="text-blue-800 text-sm">
                        <strong>Soumission sélectionnée:</strong> {selectedSubmissionForImport.submission_number} - {selectedSubmissionForImport.client_name}
                      </p>
                      <p className="text-blue-700 text-xs mt-1">
                        Les prix de coût de la soumission deviendront les prix de coût de l'achat. Les prix de vente sont conservés pour référence.
                      </p>
                    </div>

                    {itemsToImport.length === 0 ? (
                      <p className="text-gray-500 text-center py-8">Cette soumission ne contient aucun item</p>
                    ) : (
                      <>
                        {/* Actions en lot */}
                        <div className="flex gap-3 mb-4">
                          <button
                            type="button"
                            onClick={() => {
                              setItemsToImport(items => items.map(item => ({ ...item, selected: true })));
                            }}
                            className="px-4 py-2 bg-green-100 text-green-800 rounded-lg hover:bg-green-200 text-sm"
                          >
                            Tout sélectionner
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setItemsToImport(items => items.map(item => ({ ...item, selected: false })));
                            }}
                            className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 text-sm"
                          >
                            Tout désélectionner
                          </button>
                        </div>

                        {/* Tableau des items */}
                        <div className="overflow-x-auto border border-gray-200 rounded-lg">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="text-left p-3 font-semibold">Sélection</th>
                                <th className="text-left p-3 font-semibold">Code</th>
                                <th className="text-left p-3 font-semibold">Description</th>
                                <th className="text-center p-3 font-semibold">Qté Originale</th>
                                <th className="text-center p-3 font-semibold">Qté à Commander</th>
                                <th className="text-right p-3 font-semibold">Prix Coût</th>
                                <th className="text-right p-3 font-semibold">Prix Vente (Réf)</th>
                                <th className="text-right p-3 font-semibold">Total Coût</th>
                              </tr>
                            </thead>
                            <tbody>
                              {itemsToImport.map((item, index) => (
                                <tr key={item.product_id} className="border-t hover:bg-gray-50">
                                  <td className="p-3 text-center">
                                    <input
                                      type="checkbox"
                                      checked={item.selected}
                                      onChange={(e) => toggleItemSelection(item.product_id, e.target.checked)}
                                      className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                                    />
                                  </td>
                                  <td className="p-3 font-mono text-xs">{item.product_id}</td>
                                  <td className="p-3">
                                    <div>
                                      <div className="font-medium">{item.description}</div>
                                      <div className="text-xs text-gray-500">{item.unit}</div>
                                    </div>
                                  </td>
                                  <td className="p-3 text-center text-gray-600">
                                    {item.quantity}
                                  </td>
                                  <td className="p-3 text-center">
                                    <input
                                      type="number"
                                      step="0.1"
                                      min="0.1"
                                      value={item.importQuantity}
                                      onChange={(e) => updateImportQuantity(item.product_id, e.target.value)}
                                      disabled={!item.selected}
                                      className={`w-20 text-center rounded border p-1 ${
                                        item.selected 
                                          ? 'border-green-300 focus:border-green-500 focus:ring-green-500' 
                                          : 'border-gray-200 bg-gray-50'
                                      }`}
                                    />
                                  </td>
                                  <td className="p-3 text-right font-medium text-orange-600">
                                    {formatCurrency(item.cost_price || 0)}
                                  </td>
                                  <td className="p-3 text-right font-medium text-blue-600">
                                    {formatCurrency(item.selling_price || 0)}
                                  </td>
                                  <td className="p-3 text-right font-bold">
                                    {formatCurrency((item.cost_price || 0) * (item.importQuantity || 0))}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-gray-50">
                              <tr>
                                <td colSpan="7" className="p-3 text-right font-semibold">
                                  Total Coût Sélectionné:
                                </td>
                                <td className="p-3 text-right font-bold text-green-600">
                                  {formatCurrency(
                                    itemsToImport
                                      .filter(item => item.selected)
                                      .reduce((sum, item) => sum + (item.cost_price || 0) * (item.importQuantity || 0), 0)
                                  )}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>

                        {/* Actions finales */}
                        <div className="flex justify-between items-center mt-6">
                          <div className="text-sm text-gray-600">
                            {itemsToImport.filter(item => item.selected).length} item(s) sélectionné(s) 
                            sur {itemsToImport.length}
                          </div>
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                setShowImportSubmissionModal(false);
                                setSelectedSubmissionForImport(null);
                                setItemsToImport([]);
                              }}
                              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                              Annuler
                            </button>
                            <button
                              type="button"
                              onClick={handleImportSelectedItems}
                              disabled={itemsToImport.filter(item => item.selected).length === 0}
                              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                            >
                              Importer {itemsToImport.filter(item => item.selected).length} item(s)
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Vue liste principale
  return (
    <div className="space-y-6 p-4">
      {/* En-tête avec statistiques */}
      <div className="bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 rounded-xl shadow-lg p-4 sm:p-6 text-white">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold">Gestion des Achats Fournisseurs</h2>
            <p className="text-white/90 text-sm sm:text-base mt-1">
              Gérez vos commandes fournisseurs et suivez vos achats
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={fixExistingPurchases}
              disabled={isFixingPOs}
              className={`w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium ${
                isFixingPOs 
                  ? 'bg-yellow-400 text-yellow-800 cursor-not-allowed' 
                  : 'bg-yellow-600 text-white hover:bg-yellow-700'
              }`}
              title="Corriger les PO manquants dans les achats existants"
            >
              {isFixingPOs ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-800 inline mr-2"></div>
                  Correction...
                </>
              ) : (
                <>
                  <Wrench className="w-4 h-4 inline mr-2" />
                  Corriger POs
                </>
              )}
            </button>
            <button
              onClick={() => setShowSupplierModal(true)}
              className="w-full sm:w-auto px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-sm font-medium hover:bg-white/20"
            >
              <Building2 className="w-4 h-4 inline mr-2" />
              Gestion Fournisseurs
            </button>
            <button
              onClick={async () => {
                const newNumber = await generatePurchaseNumber();
                setPurchaseForm(prev => ({
                  ...prev,
                  purchase_number: newNumber
                }));
                setShowForm(true);
              }}
              className="w-full sm:w-auto px-4 py-2 bg-white text-orange-600 rounded-lg hover:bg-gray-100 font-medium text-sm"
            >
              Nouvel Achat
            </button>
          </div>
        </div>

        {/* Statistiques */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">📊</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Total Achats</p>
                <p className="text-xl sm:text-2xl font-bold">{supplierPurchases.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">📝</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Brouillons</p>
                <p className="text-xl sm:text-2xl font-bold">
                  {supplierPurchases.filter(p => p.status === 'draft').length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">📤</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Commandés</p>
                <p className="text-xl sm:text-2xl font-bold">
                  {supplierPurchases.filter(p => p.status === 'ordered').length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">💰</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Total</p>
                <p className="text-lg sm:text-2xl font-bold">
                  {formatCurrency(supplierPurchases.reduce((sum, p) => sum + (p.total_amount || 0), 0))}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Rechercher par numéro, fournisseur..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-4 py-3 rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base"
              />
            </div>
          </div>
          <div className="w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3"
            >
              <option value="all">Tous les statuts</option>
              <option value="draft">Brouillons</option>
              <option value="ordered">Commandés</option>
              <option value="received">Reçus</option>
              <option value="cancelled">Annulés</option>
            </select>
          </div>
        </div>
      </div>

      {/* Liste des achats - Desktop */}
      <div className="hidden lg:block bg-white shadow-lg rounded-lg overflow-hidden">
        {filteredPurchases.length === 0 ? (
          <div className="text-center py-12">
            <ShoppingCart className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500 text-lg">Aucun achat fournisseur trouvé</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">N° Achat</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fournisseur</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">PO Client Lié</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Date Livraison</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Montant</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Statut</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredPurchases.map((purchase) => {
                const poNumber = getPONumber(purchase);
                return (
                  <tr key={purchase.id} className="hover:bg-gray-50">
                    <td className="px-3 py-4 whitespace-nowrap">
                      <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs font-medium">
                        {purchase.purchase_number}
                      </span>
                    </td>
                    <td className="px-3 py-4">
                      <div className="text-sm font-medium text-gray-900">{purchase.supplier_name}</div>
                    </td>
                    <td className="px-3 py-4 text-center">
                      {poNumber ? (
                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                          {poNumber}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-4 text-center text-sm text-gray-500">
                      {formatDate(purchase.delivery_date)}
                    </td>
                    <td className="px-3 py-4 text-center">
                      <span className="text-sm font-medium text-green-600">
                        {formatCurrency(purchase.total_amount)}
                      </span>
                    </td>
                    <td className="px-3 py-4 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        purchase.status === 'ordered' ? 'bg-blue-100 text-blue-800' :
                        purchase.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                        purchase.status === 'received' ? 'bg-green-100 text-green-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {purchase.status === 'ordered' ? 'Commandé' :
                         purchase.status === 'draft' ? 'Brouillon' :
                         purchase.status === 'received' ? 'Reçu' : 'Annulé'}
                      </span>
                    </td>
                    <td className="px-3 py-4 text-center">
                      <div className="flex justify-center space-x-1">
                        <button
                          onClick={() => {
                            setEditingPurchase(purchase);
                            setPurchaseForm(purchase);
                            setSelectedItems(purchase.items || []);
                            setShowForm(true);
                          }}
                          className="bg-orange-100 text-orange-700 hover:bg-orange-200 p-2 rounded-lg"
                          title="Modifier"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeletePurchase(purchase.id)}
                          className="bg-red-100 text-red-700 hover:bg-red-200 p-2 rounded-lg"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Liste mobile */}
      <div className="lg:hidden space-y-4">
        {filteredPurchases.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <ShoppingCart className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500">Aucun achat fournisseur trouvé</p>
          </div>
        ) : (
          filteredPurchases.map((purchase) => {
            const poNumber = getPONumber(purchase);
            return (
              <div key={purchase.id} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-orange-50 to-red-50 px-4 py-3 border-b">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-semibold text-gray-900">{purchase.purchase_number}</h3>
                      <p className="text-sm text-gray-600">{purchase.supplier_name}</p>
                    </div>
                    <div className="relative">
                      <button
                        onClick={() => setSelectedPurchaseId(selectedPurchaseId === purchase.id ? null : purchase.id)}
                        className="p-2 text-gray-400 hover:text-gray-600"
                      >
                        <MoreVertical className="w-5 h-5" />
                      </button>
                      
                      {selectedPurchaseId === purchase.id && (
                        <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border z-10">
                          <div className="py-1">
                            <button
                              onClick={() => {
                                setEditingPurchase(purchase);
                                setPurchaseForm(purchase);
                                setSelectedItems(purchase.items || []);
                                setShowForm(true);
                                setSelectedPurchaseId(null);
                              }}
                              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                            >
                              <Edit className="w-4 h-4 inline mr-2" />
                              Modifier
                            </button>
                            <hr />
                            <button
                              onClick={() => {
                                handleDeletePurchase(purchase.id);
                                setSelectedPurchaseId(null);
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4 inline mr-2" />
                              Supprimer
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  {poNumber && (
                    <div>
                      <span className="text-gray-500 text-sm">PO Client lié</span>
                      <p className="font-medium">{poNumber}</p>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500 block">Date livraison</span>
                      <span className="font-medium">{formatDate(purchase.delivery_date)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Montant</span>
                      <span className="font-bold text-green-600">{formatCurrency(purchase.total_amount)}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 text-sm">Statut</span>
                    <span className={`px-2 py-1 rounded text-xs ${
                      purchase.status === 'ordered' ? 'bg-blue-100 text-blue-800' :
                      purchase.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                      purchase.status === 'received' ? 'bg-green-100 text-green-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {purchase.status === 'ordered' ? 'Commandé' :
                       purchase.status === 'draft' ? 'Brouillon' :
                       purchase.status === 'received' ? 'Reçu' : 'Annulé'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Gestion Fournisseurs */}
      {showSupplierModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-6 border-b bg-orange-50">
              <h2 className="text-2xl font-bold text-orange-600">Gestion des Fournisseurs</h2>
              <div className="flex gap-3">
                <button
                  onClick={() => {
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
                    document.getElementById('supplier-form-modal').showModal();
                  }}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
                >
                  Nouveau Fournisseur
                </button>
                <button
                  onClick={() => setShowSupplierModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Fermer
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {suppliers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Building2 className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p>Aucun fournisseur enregistré</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {suppliers.map((supplier) => (
                    <div key={supplier.id} className="border rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg">{supplier.company_name}</h3>
                          <div className="text-sm text-gray-600 mt-2 space-y-1">
                            {supplier.contact_name && <p>Contact: {supplier.contact_name}</p>}
                            {supplier.email && <p>{supplier.email}</p>}
                            {supplier.phone && <p>{supplier.phone}</p>}
                            {supplier.address && (
                              <p>{supplier.address}, {supplier.city}, {supplier.province} {supplier.postal_code}</p>
                            )}
                            {supplier.notes && <p className="italic">{supplier.notes}</p>}
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => {
                              setEditingSupplier(supplier);
                              setSupplierForm({
                                ...supplier,
                                preferred_english: supplier.preferred_english || false,
                                tax_id: supplier.tax_id || '',
                                tax_exempt: supplier.tax_exempt || false
                              });
                              document.getElementById('supplier-form-modal').showModal();
                            }}
                            className="px-3 py-2 bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
                          >
                            Modifier
                          </button>
                          <button
                            onClick={() => handleDeleteSupplier(supplier.id)}
                            className="px-3 py-2 bg-red-100 text-red-800 rounded hover:bg-red-200"
                          >
                            Supprimer
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

      {/* Modal Formulaire Fournisseur */}
      <dialog id="supplier-form-modal" className="p-0 rounded-lg backdrop:bg-black backdrop:bg-opacity-50">
        <div className="bg-white rounded-lg w-full max-w-2xl p-6">
          <h3 className="text-xl font-bold text-orange-600 mb-4">
            {editingSupplier ? 'Modifier Fournisseur' : 'Nouveau Fournisseur'}
          </h3>
          
          <form onSubmit={handleSupplierSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom de l'entreprise *
                </label>
                <input
                  type="text"
                  value={supplierForm.company_name}
                  onChange={(e) => setSupplierForm({...supplierForm, company_name: e.target.value})}
                  className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom du contact
                </label>
                <input
                  type="text"
                  value={supplierForm.contact_name}
                  onChange={(e) => setSupplierForm({...supplierForm, contact_name: e.target.value})}
                  className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={supplierForm.email}
                  onChange={(e) => setSupplierForm({...supplierForm, email: e.target.value})}
                  className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Téléphone
                </label>
                <input
                  type="tel"
                  value={supplierForm.phone}
                  onChange={(e) => setSupplierForm({...supplierForm, phone: e.target.value})}
                  className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                />
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Adresse
                </label>
                <input
                  type="text"
                  value={supplierForm.address}
                  onChange={(e) => setSupplierForm({...supplierForm, address: e.target.value})}
                  className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pays
                </label>
                <select
                  value={supplierForm.country}
                  onChange={(e) => {
                    const newCountry = e.target.value;
                    setSupplierForm({
                      ...supplierForm, 
                      country: newCountry,
                      province: newCountry === 'Canada' ? 'QC' : '',
                      postal_code: ''
                    });
                  }}
                  className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                >
                  <option value="Canada">Canada</option>
                  <option value="USA">USA</option>
                  <option value="Mexique">Mexique</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ville
                </label>
                <input
                  type="text"
                  value={supplierForm.city}
                  onChange={(e) => setSupplierForm({...supplierForm, city: e.target.value})}
                  className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {supplierForm.country === 'USA' ? 'État' : 'Province'}
                </label>
                {supplierForm.country === 'Canada' ? (
                  <select
                    value={supplierForm.province}
                    onChange={(e) => setSupplierForm({...supplierForm, province: e.target.value})}
                    className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                  >
                    <option value="QC">Québec</option>
                    <option value="ON">Ontario</option>
                    <option value="BC">Colombie-Britannique</option>
                    <option value="AB">Alberta</option>
                    <option value="MB">Manitoba</option>
                    <option value="SK">Saskatchewan</option>
                    <option value="NS">Nouvelle-Écosse</option>
                    <option value="NB">Nouveau-Brunswick</option>
                    <option value="NL">Terre-Neuve-et-Labrador</option>
                    <option value="PE">Île-du-Prince-Édouard</option>
                    <option value="NT">Territoires du Nord-Ouest</option>
                    <option value="YT">Yukon</option>
                    <option value="NU">Nunavut</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    value={supplierForm.province}
                    onChange={(e) => setSupplierForm({...supplierForm, province: e.target.value})}
                    className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                    placeholder={supplierForm.country === 'USA' ? 'Ex: California, Texas...' : 'État/Province'}
                  />
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {supplierForm.country === 'USA' ? 'ZIP Code' : 'Code postal'}
                </label>
                <input
                  type="text"
                  value={supplierForm.postal_code}
                  onChange={(e) => {
                    let value = e.target.value;
                    if (supplierForm.country === 'Canada') {
                      value = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                      if (value.length >= 4) {
                        value = value.slice(0, 3) + ' ' + value.slice(3, 6);
                      }
                    }
                    setSupplierForm({...supplierForm, postal_code: value});
                  }}
                  className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                  placeholder={getPostalCodePlaceholder(supplierForm.country)}
                  pattern={getPostalCodePattern(supplierForm.country)}
                />
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  value={supplierForm.notes}
                  onChange={(e) => setSupplierForm({...supplierForm, notes: e.target.value})}
                  className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                  rows="3"
                />
              </div>

              <div className="md:col-span-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={supplierForm.preferred_english}
                    onChange={(e) => setSupplierForm({...supplierForm, preferred_english: e.target.checked})}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Préférence anglais / English preference
                  </span>
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Si coché, les bons de commande seront générés en anglais/français pour ce fournisseur
                </p>
              </div>

              <div className="md:col-span-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={supplierForm.tax_exempt}
                    onChange={(e) => setSupplierForm({...supplierForm, tax_exempt: e.target.checked})}
                    className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Exempt de taxes / Tax exempt
                  </span>
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Si coché, aucune taxe ne sera appliquée aux commandes de ce fournisseur
                </p>
              </div>

              {/* Tax ID pour les fournisseurs américains */}
              {supplierForm.country === 'USA' && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tax ID / EIN (optionnel)
                  </label>
                  <input
                    type="text"
                    value={supplierForm.tax_id}
                    onChange={(e) => setSupplierForm({...supplierForm, tax_id: e.target.value})}
                    className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                    placeholder="12-3456789"
                  />
                </div>
              )}
            </div>
            
            <div className="flex gap-3 justify-end pt-4">
              <button
                type="button"
                onClick={() => document.getElementById('supplier-form-modal').close()}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
              >
                {editingSupplier ? 'Mettre à jour' : 'Créer'}
              </button>
            </div>
          </form>
        </div>
      </dialog>

      {/* Modal Gestion Adresses */}
      {showAddressModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4"
          style={{ zIndex: 50 }}
          onClick={() => setShowAddressModal(false)}
        >
          <div 
            className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-6 border-b bg-purple-50">
              <h2 className="text-2xl font-bold text-purple-600">Gestion des Adresses de Livraison</h2>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
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
                    setShowAddressModal(false);
                    setShowAddressFormModal(true);
                  }}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  Nouvelle Adresse
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddressModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Fermer
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {shippingAddresses.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <MapPin className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p>Aucune adresse de livraison enregistrée</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {shippingAddresses.map((address) => (
                    <div key={address.id} className="border rounded-lg p-4 hover:bg-gray-50 relative">
                      {address.is_default && (
                        <div className="absolute top-2 right-2">
                          <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs font-medium">
                            Par défaut
                          </span>
                        </div>
                      )}
                      
                      <div className="flex justify-between">
                        <div className="flex-1 pr-4">
                          <h3 className="font-semibold text-lg">{address.name}</h3>
                          <div className="text-sm text-gray-600 mt-2 space-y-1">
                            <p>{address.address}</p>
                            <p>{address.city}, {address.province} {address.postal_code}</p>
                            <p>{address.country}</p>
                          </div>
                        </div>
                        
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => {
                              setEditingAddress(address);
                              setAddressForm(address);
                              setShowAddressModal(false);
                              setShowAddressFormModal(true);
                            }}
                            className="px-3 py-2 bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
                          >
                            Modifier
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm('Êtes-vous sûr de vouloir supprimer cette adresse ?')) return;
                              
                              try {
                                const { error } = await supabase
                                  .from('shipping_addresses')
                                  .delete()
                                  .eq('id', address.id);
                                
                                if (error) throw error;
                                await fetchShippingAddresses();
                              } catch (error) {
                                console.error('Erreur suppression adresse:', error);
                                alert('Erreur lors de la suppression');
                              }
                            }}
                            className="px-3 py-2 bg-red-100 text-red-800 rounded hover:bg-red-200"
                          >
                            Supprimer
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

      {/* Modal Formulaire Adresse */}
      {showAddressFormModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4"
          style={{ zIndex: 60 }}
        >
          <div 
            className="bg-white rounded-lg w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-purple-600 mb-4">
              {editingAddress ? 'Modifier Adresse' : 'Nouvelle Adresse'}
            </h3>
            
            <form onSubmit={handleAddressSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nom de l'adresse *
                  </label>
                  <input
                    type="text"
                    value={addressForm.name}
                    onChange={(e) => setAddressForm({...addressForm, name: e.target.value})}
                    className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                    placeholder="Ex: Bureau principal, Entrepôt..."
                    required
                  />
                </div>
                
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Adresse complète *
                  </label>
                  <input
                    type="text"
                    value={addressForm.address}
                    onChange={(e) => setAddressForm({...addressForm, address: e.target.value})}
                    className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                    placeholder="123 Rue Principale, App. 456"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ville *
                  </label>
                  <input
                    type="text"
                    value={addressForm.city}
                    onChange={(e) => setAddressForm({...addressForm, city: e.target.value})}
                    className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Province *
                  </label>
                  <select
                    value={addressForm.province}
                    onChange={(e) => setAddressForm({...addressForm, province: e.target.value})}
                    className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                    required
                  >
                    <option value="QC">Québec</option>
                    <option value="ON">Ontario</option>
                    <option value="BC">Colombie-Britannique</option>
                    <option value="AB">Alberta</option>
                    <option value="MB">Manitoba</option>
                    <option value="SK">Saskatchewan</option>
                    <option value="NS">Nouvelle-Écosse</option>
                    <option value="NB">Nouveau-Brunswick</option>
                    <option value="NL">Terre-Neuve-et-Labrador</option>
                    <option value="PE">Île-du-Prince-Édouard</option>
                    <option value="NT">Territoires du Nord-Ouest</option>
                    <option value="YT">Yukon</option>
                    <option value="NU">Nunavut</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Code postal
                  </label>
                  <input
                    type="text"
                    value={addressForm.postal_code}
                    onChange={(e) => setAddressForm({...addressForm, postal_code: e.target.value.toUpperCase()})}
                    className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                    placeholder="H1A 1A1"
                    pattern="[A-Za-z]\d[A-Za-z] \d[A-Za-z]\d"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Pays
                  </label>
                  <select
                    value={addressForm.country}
                    onChange={(e) => setAddressForm({...addressForm, country: e.target.value})}
                    className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                  >
                    <option value="Canada">Canada</option>
                    <option value="USA">USA</option>
                    <option value="Mexique">Mexique</option>
                  </select>
                </div>
                
                <div className="md:col-span-2">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={addressForm.is_default}
                      onChange={(e) => setAddressForm({...addressForm, is_default: e.target.checked})}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Définir comme adresse par défaut
                    </span>
                  </label>
                </div>
              </div>
              
              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddressFormModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  {editingAddress ? 'Mettre à jour' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Formulaire Fournisseur Simple */}
      {showSupplierFormModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
          <div className="bg-white rounded-lg w-full max-w-2xl p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-blue-600 mb-4">Nouveau Fournisseur</h3>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                const { data, error } = await supabase
                  .from('suppliers')
                  .insert([supplierForm])
                  .select()
                  .single();
                if (error) throw error;

                await fetchSuppliers();
                
                // Auto-sélectionner le nouveau fournisseur
                setPurchaseForm({
                  ...purchaseForm,
                  supplier_id: data.id,
                  supplier_name: data.company_name
                });
                
                setShowSupplierFormModal(false);
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
                
                alert('Fournisseur créé et sélectionné!');
              } catch (error) {
                console.error('Erreur:', error);
                alert('Erreur lors de la création');
              }
            }} className="space-y-4">
              <input
                type="text"
                placeholder="Nom de l'entreprise *"
                value={supplierForm.company_name}
                onChange={(e) => setSupplierForm({...supplierForm, company_name: e.target.value})}
                className="w-full rounded-lg border-gray-300 p-3"
                required
              />
              
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="email"
                  placeholder="Email"
                  value={supplierForm.email}
                  onChange={(e) => setSupplierForm({...supplierForm, email: e.target.value})}
                  className="w-full rounded-lg border-gray-300 p-3"
                />
                <input
                  type="tel"
                  placeholder="Téléphone"
                  value={supplierForm.phone}
                  onChange={(e) => setSupplierForm({...supplierForm, phone: e.target.value})}
                  className="w-full rounded-lg border-gray-300 p-3"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  checked={supplierForm.preferred_english}
                  onChange={(e) => setSupplierForm({...supplierForm, preferred_english: e.target.checked})}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Préférence anglais / English preference</span>
              </div>
                      
              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setShowSupplierFormModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
