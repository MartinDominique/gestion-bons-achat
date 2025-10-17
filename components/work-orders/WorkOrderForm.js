'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Save, X, Calendar, FileText, User, AlertCircle, Plus, Trash2, Package, Mail, Check } from 'lucide-react';
import MaterialSelector from './MaterialSelector';
import TimeTracker from './TimeTracker';
import ClientModal from './ClientModal';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

// Arrondir au quart d'heure supérieur à partir de "HH:MM"
const toQuarterHourUp = (startHHMM, endHHMM, pauseMinutes = 0) => {
  const parseHHMM = (t) => {
    const [h, m] = String(t || '').split(':').map((n) => parseInt(n, 10) || 0);
    return h * 60 + m;
  };

  const s = parseHHMM(startHHMM);
  const e = parseHHMM(endHHMM);
  let net = Math.max(0, e - s - (parseInt(pauseMinutes, 10) || 0));

  // Arrondi au 15 min SUPÉRIEUR
  const rounded = Math.ceil(net / 15) * 15;

  // Retour en heures décimales (2 décimales)
  return Math.round((rounded / 60) * 100) / 100;
};


export default function WorkOrderForm({ 
  workOrder = null, 
  onSave, 
  onCancel, 
  mode = 'create',
  saving = false 
}) {
  const router = useRouter(); 
 
  const [formData, setFormData] = useState({
    client_id: '',
    linked_po_id: '',
    work_date: new Date().toISOString().split('T')[0],
    time_entries: [], // NOUVEAU: Array de sessions
    work_description: '',
    additional_notes: '',
    status: 'draft'
  });

  // État pour sélection des emails
  const [selectedEmails, setSelectedEmails] = useState({
    email: true,      // Principal sélectionné par défaut
    email_2: false,
    email_admin: false
  });

  // État pour descriptions multiligne
  const [descriptions, setDescriptions] = useState(['']);

  const [materials, setMaterials] = useState([]);
  const [errors, setErrors] = useState({});
  const [currentWorkOrderId, setCurrentWorkOrderId] = useState(workOrder?.id || null);
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [showClientModal, setShowClientModal] = useState(false);
  
  // Cache des produits pour vérification
  const [cachedProducts, setCachedProducts] = useState([]);
  const [cachedNonInventoryItems, setCachedNonInventoryItems] = useState([]);

  // NOUVEAUX ÉTATS POUR IMPORTS
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [showSupplierImportModal, setShowSupplierImportModal] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [clientSupplierPurchases, setClientSupplierPurchases] = useState([]);
  const [selectedPurchaseForImport, setSelectedPurchaseForImport] = useState(null);
  const [selectedItemsForImport, setSelectedItemsForImport] = useState([]);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);
  const [isLoadingSupplierPurchases, setIsLoadingSupplierPurchases] = useState(false);
  
  // États pour la sélection de soumission
  const [selectedSubmissionForImport, setSelectedSubmissionForImport] = useState(null);
  const [selectedSubmissionItems, setSelectedSubmissionItems] = useState([]);

  // ========================================
  // FONCTIONS POUR GESTION DES EMAILS
  // ========================================

  const loadEmailPreferences = (clientId) => {
    if (!clientId) return;
    
    const saved = localStorage.getItem('workorder_email_preferences');
    if (saved) {
      try {
        const preferences = JSON.parse(saved);
        if (preferences[clientId]) {
          setSelectedEmails(preferences[clientId]);
          return;
        }
      } catch (e) {
        console.error('Erreur chargement préférences email:', e);
      }
    }
    
    // Par défaut : sélectionner l'email principal
    setSelectedEmails({ email: true, email_2: false, email_admin: false });
  };

  const saveEmailPreferences = (clientId, emailSelections) => {
    if (!clientId) return;
    
    const saved = localStorage.getItem('workorder_email_preferences');
    let preferences = {};
    
    if (saved) {
      try {
        preferences = JSON.parse(saved);
      } catch (e) {
        preferences = {};
      }
    }
    
    preferences[clientId] = emailSelections;
    localStorage.setItem('workorder_email_preferences', JSON.stringify(preferences));
  };

  const handleEmailSelection = (emailField) => {
    const newSelection = {
      ...selectedEmails,
      [emailField]: !selectedEmails[emailField]
    };
    
    setSelectedEmails(newSelection);
    
    // Sauvegarder la préférence
    if (formData.client_id) {
      saveEmailPreferences(formData.client_id, newSelection);
    }
  };

  const getSelectedEmailAddresses = () => {
    if (!selectedClient) return [];
    
    const emails = [];
    if (selectedEmails.email && selectedClient.email) {
      emails.push(selectedClient.email);
    }
    if (selectedEmails.email_2 && selectedClient.email_2) {
      emails.push(selectedClient.email_2);
    }
    if (selectedEmails.email_admin && selectedClient.email_admin) {
      emails.push(selectedClient.email_admin);
    }
    
    return emails;
  };

  // Charger les préférences email quand le client change
  useEffect(() => {
    if (formData.client_id && selectedClient) {
      loadEmailPreferences(formData.client_id);
    }
  }, [formData.client_id]);

  // ========================================
  // INITIALISATION
  // ========================================

  // Initialisation pour mode édition
  useEffect(() => {
    if (workOrder && mode === 'edit') {
      setFormData({
        client_id: workOrder.client_id?.toString() || '',
        linked_po_id: workOrder.linked_po?.po_number || workOrder.linked_po_id || '',
        work_date: workOrder.work_date || new Date().toISOString().split('T')[0],
        time_entries: workOrder.time_entries || [], // NOUVEAU
        work_description: workOrder.work_description || '',
        additional_notes: workOrder.additional_notes || '',
        status: workOrder.status || 'draft'
      });
      
      // Convertir description en tableau de paragraphes
      if (workOrder.work_description) {
        const paragraphs = workOrder.work_description.split('\n\n').filter(p => p.trim());
        setDescriptions(paragraphs.length > 0 ? paragraphs : ['']);
      }
      
      if (workOrder.client) {
        setSelectedClient(workOrder.client);
      }

      // Charger les matériaux existants
      if (workOrder.materials) {
        setMaterials(workOrder.materials);
      }

      // Charger les emails sélectionnés si disponibles
      if (workOrder.selected_client_emails) {
        setSelectedEmails(workOrder.selected_client_emails);
      }
    }
  }, [workOrder, mode]);

  // Charger les produits et non-inventory items au démarrage
  useEffect(() => {
    loadProductsCache();
  }, []);

  // Charger les clients avec auto-rechargement
    useEffect(() => {
      const loadClients = async () => {
        try {
          const response = await fetch('/api/clients');
          if (response.ok) {
            const data = await response.json();
            setClients(data);
            
            // Si mode édition, sélectionner le client actuel
            if (workOrder && mode === 'edit') {
              const client = data.find(c => c.id === workOrder.client_id);
              if (client) {
                setSelectedClient(client);
              }
            }
          }
        } catch (error) {
          console.error('Erreur chargement clients:', error);
        }
      };
      
      loadClients(); // Chargement initial
      
      // ✅ SOLUTION 1 : Recharger automatiquement au retour sur la page
      const handleFocus = () => {
        console.log('🔄 Rechargement clients (retour focus)');
        loadClients();
      };
      
      window.addEventListener('focus', handleFocus);
      
      return () => {
        window.removeEventListener('focus', handleFocus);
      };
    }, [workOrder, mode]);

  // Synchroniser descriptions avec work_description
  useEffect(() => {
    const combinedDescription = descriptions
      .filter(desc => desc.trim())
      .join('\n\n');
    
    setFormData(prev => ({ ...prev, work_description: combinedDescription }));
  }, [descriptions]);

  // ========================================
// VÉRIFIER STATUS PÉRIODIQUEMENT SI EN ATTENTE DE SIGNATURE
// ========================================
useEffect(() => {
  if (mode === 'edit' && formData.status === 'ready_for_signature' && workOrder?.id) {
    console.log('👀 Mode surveillance activé');
    
    let intervalId = null;
    
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/work-orders/${workOrder.id}`);
        if (response.ok) {
          const data = await response.json();
          const currentStatus = data.data?.status;
          
          console.log('📊 Status vérifié:', currentStatus);
          
          if (currentStatus === 'sent' || currentStatus === 'signed' || currentStatus === 'pending_send') {
            console.log('✅ Signature détectée !');
            
            // Arrêter le polling
            if (intervalId) clearInterval(intervalId);
            
            toast.success('✅ Le client a signé le bon de travail !', {
              duration: 2000,
            });
            
            setTimeout(() => {
              router.push('/bons-travail');
            }, 2000);
          }
        }
      } catch (error) {
        console.error('Erreur vérification status:', error);
      }
    };
    
    // Première vérification immédiate
    checkStatus();
    
    // Puis toutes les 3 secondes
    intervalId = setInterval(checkStatus, 3000);
    
    return () => {
      if (intervalId) clearInterval(intervalId);
      console.log('🛑 Surveillance arrêtée');
    };
  }
}, [mode, formData.status, workOrder?.id, router]);

  // ========================================
// RECHARGER LES DONNÉES AU RETOUR SUR LA PAGE
// ========================================
useEffect(() => {
  const workOrderId = currentWorkOrderId || workOrder?.id;
  
  if (workOrderId) {
    const handleFocus = async () => {
      try {
        const response = await fetch(`/api/work-orders/${workOrderId}`);
        if (response.ok) {
          const data = await response.json();
          const updatedWorkOrder = data.data;
          
          if (updatedWorkOrder?.status !== formData.status) {
            console.log(`🔄 Status changé: ${formData.status} → ${updatedWorkOrder.status}`);
            
            // Mettre à jour le status dans le formulaire
            setFormData(prev => ({
              ...prev,
              status: updatedWorkOrder.status
            }));
            
            // Si le BT est maintenant signé/envoyé, rediriger
            if (['signed', 'sent', 'pending_send'].includes(updatedWorkOrder.status)) {
              toast.success('✅ Le bon de travail a été traité avec succès !', {
                duration: 2000,
              });
              
              setTimeout(() => {
                router.push('/bons-travail');
              }, 2000);
            }
          }
        }
      } catch (error) {
        console.error('❌ Erreur rechargement status:', error);
      }
    };
    
    // Écouter quand la fenêtre redevient active
    window.addEventListener('focus', handleFocus);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }
}, [currentWorkOrderId, workOrder?.id, formData.status, router]);

  // ========================================
  // FONCTIONS CACHE PRODUITS
  // ========================================

  const loadProductsCache = async () => {
    try {
      // Charger les produits d'inventaire
      const productsResponse = await fetch('/api/products?limit=5000');
      if (productsResponse.ok) {
        const productsData = await productsResponse.json();
        const products = Array.isArray(productsData) ? productsData : productsData.data || [];
        setCachedProducts(products);
        console.log(`${products.length} produits d'inventaire chargés en cache`);
      }

      // Charger les non-inventory items depuis Supabase
      const { data: nonInventoryData, error } = await supabase
        .from('non_inventory_items')
        .select('*')
        .limit(5000);

      if (!error && nonInventoryData) {
        setCachedNonInventoryItems(nonInventoryData);
        console.log(`${nonInventoryData.length} produits non-inventaire chargés en cache`);
      }
    } catch (error) {
      console.error('Erreur chargement cache produits:', error);
    }
  };

  const findExistingProduct = (productCode) => {
    console.log('🔍 Recherche produit avec code:', productCode);
    
    if (!productCode) {
      console.log('❌ Pas de code produit fourni');
      return { found: false };
    }
  
    // Chercher dans les produits d'inventaire par product_id (qui est le code)
    const inventoryProduct = cachedProducts.find(p => 
      p.product_id === productCode
    );
    
    if (inventoryProduct) {
      console.log('✅ Trouvé dans inventaire:', inventoryProduct);
      return {
        found: true,
        id: inventoryProduct.product_id,
        product_id: inventoryProduct.product_id,
        description: inventoryProduct.description,
        type: 'inventory'
      };
    }
  
    // Chercher dans les non-inventory items par product_id
    const nonInventoryProduct = cachedNonInventoryItems.find(p => 
      p.product_id === productCode
    );
  
    if (nonInventoryProduct) {
      console.log('✅ Trouvé dans non-inventory:', nonInventoryProduct);
      return {
        found: true,
        id: nonInventoryProduct.product_id,
        product_id: nonInventoryProduct.product_id,
        description: nonInventoryProduct.description,
        type: 'non-inventory'
      };
    }
  
    console.log('❌ Produit non trouvé dans les caches');
    return { found: false };
  };

  // ========================================
  // FONCTIONS IMPORT SOUMISSIONS
  // ========================================

  const loadClientSubmissions = async () => {
    if (!selectedClient) {
      setErrors({ materials: 'Veuillez d\'abord sélectionner un client' });
      return;
    }

    setIsLoadingSubmissions(true);
    try {
      const { data, error } = await supabase
        .from('submissions')
        .select('*')
        .eq('client_name', selectedClient.name)
        .eq('status', 'accepted')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setSubmissions(data || []);
      setShowSubmissionModal(true);
    } catch (error) {
      console.error('Erreur chargement soumissions:', error);
      setErrors({ materials: 'Erreur lors du chargement des soumissions' });
    } finally {
      setIsLoadingSubmissions(false);
    }
  };

  const selectSubmissionForImport = (submission) => {
    setSelectedSubmissionForImport(submission);
    setSelectedSubmissionItems([]);
  };

  const toggleSubmissionItemSelection = (itemIndex) => {
    setSelectedSubmissionItems(prev => {
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

  const toggleAllSubmissionItemsSelection = () => {
    if (!selectedSubmissionForImport?.items) return;
    
    if (selectedSubmissionItems.length === selectedSubmissionForImport.items.length) {
      setSelectedSubmissionItems([]);
    } else {
      setSelectedSubmissionItems(selectedSubmissionForImport.items.map((_, index) => index));
    }
  };

  const importSelectedSubmissionItems = () => {
    if (!selectedSubmissionForImport || selectedSubmissionItems.length === 0) {
      setErrors({ materials: 'Veuillez sélectionner au moins un article' });
      return;
    }

    try {
      const itemsToImport = selectedSubmissionItems.map((itemIndex, arrayIndex) => {
        const submissionItem = selectedSubmissionForImport.items[itemIndex];
        const sourceCode = submissionItem.product_id || submissionItem.code;
        const existingProduct = findExistingProduct(sourceCode);
        const displayCode = sourceCode || `SOUM-${itemIndex + 1}`;
        const baseDescription = submissionItem.name || submissionItem.description || `Article importé depuis soumission`;
        const itemDescription = existingProduct.found 
          ? existingProduct.description || baseDescription
          : (sourceCode ? `[${sourceCode}] ${baseDescription}` : baseDescription);
        
        return {
          id: 'sub-' + Date.now() + '-' + arrayIndex,
          product_id: existingProduct.found ? existingProduct.id : null,
          description: itemDescription,
          display_code: displayCode,
          product: {
            id: existingProduct.found ? existingProduct.id : 'temp-prod-' + Date.now() + '-' + arrayIndex,
            product_id: existingProduct.found ? existingProduct.product_id : displayCode,
            description: itemDescription,
            selling_price: parseFloat(submissionItem.price || submissionItem.selling_price || submissionItem.unit_price || 0),
            unit: submissionItem.unit || 'unité',
            product_group: existingProduct.found ? (existingProduct.type === 'inventory' ? 'Inventaire' : 'Non-Inventaire') : 'Import Soumission'
          },
          quantity: parseFloat(submissionItem.quantity || 0),
          unit: submissionItem.unit || 'unité',
          notes: `Importé de soumission #${selectedSubmissionForImport.submission_number}${existingProduct.found ? ' (Produit existant)' : ''}`,
          showPrice: false,
          from_submission: true,
          submission_number: selectedSubmissionForImport.submission_number
        };
      });

      const updatedMaterials = [...materials, ...itemsToImport];
      setMaterials(updatedMaterials);
      
      setShowSubmissionModal(false);
      setSelectedSubmissionForImport(null);
      setSelectedSubmissionItems([]);
      
      console.log(`${itemsToImport.length} matériaux importés de la soumission #${selectedSubmissionForImport.submission_number}`);
      
    } catch (error) {
      console.error('Erreur import articles soumission:', error);
      setErrors({ materials: 'Erreur lors de l\'import des articles' });
    }
  };

  // ========================================
  // FONCTIONS IMPORT ACHATS FOURNISSEURS
  // ========================================

  const loadClientSupplierPurchases = async () => {
    if (!selectedClient) {
      setErrors({ materials: 'Veuillez d\'abord sélectionner un client' });
      return;
    }

    setIsLoadingSupplierPurchases(true);
    try {
      const { data: clientPOs, error: poError } = await supabase
        .from('purchase_orders')
        .select('id')
        .eq('client_name', selectedClient.name);

      if (poError) throw poError;

      const poIds = clientPOs?.map(po => po.id) || [];

      let query = supabase
        .from('supplier_purchases')
        .select('*')
        .order('created_at', { ascending: false });

      if (poIds.length > 0) {
        query = query.or(`linked_po_id.in.(${poIds.join(',')}),supplier_name.ilike.%${selectedClient.name}%`);
      } else {
        query = query.ilike('supplier_name', `%${selectedClient.name}%`);
      }

      const { data, error } = await query;

      if (error) throw error;

      const purchasesWithItems = (data || []).filter(p => p.items && p.items.length > 0);
      
      setClientSupplierPurchases(purchasesWithItems);
      setShowSupplierImportModal(true);
    } catch (error) {
      console.error('Erreur chargement achats fournisseurs:', error);
      setErrors({ materials: 'Erreur lors du chargement des achats fournisseurs' });
    } finally {
      setIsLoadingSupplierPurchases(false);
    }
  };

  const selectPurchaseForImport = (purchase) => {
    setSelectedPurchaseForImport(purchase);
    setSelectedItemsForImport([]);
  };

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

  const toggleAllItemsSelection = () => {
    if (!selectedPurchaseForImport?.items) return;
    
    if (selectedItemsForImport.length === selectedPurchaseForImport.items.length) {
      setSelectedItemsForImport([]);
    } else {
      setSelectedItemsForImport(selectedPurchaseForImport.items.map((_, index) => index));
    }
  };

  const importSelectedItems = () => {
    if (!selectedPurchaseForImport || selectedItemsForImport.length === 0) {
      setErrors({ materials: 'Veuillez sélectionner au moins un article' });
      return;
    }

    console.log('🚀 DÉBUT IMPORT DEPUIS ACHAT FOURNISSEUR');

    try {
      const itemsToImport = selectedItemsForImport.map((itemIndex, arrayIndex) => {
        const supplierItem = selectedPurchaseForImport.items[itemIndex];
        console.log(`\n📌 Import item ${itemIndex}:`, supplierItem);
        
        const sourceCode = supplierItem.product_id || supplierItem.code || supplierItem.product_code || supplierItem.sku || '';
        const sourceDescription = supplierItem.description || supplierItem.name || supplierItem.product_name || '';
        
        console.log('🔎 Code source:', sourceCode);
        console.log('📝 Description source:', sourceDescription);
        
        const existingProduct = sourceCode ? findExistingProduct(sourceCode) : { found: false };
        
        let finalProductId = null;
        if (existingProduct.found) {
          finalProductId = existingProduct.product_id;
          console.log('✅ Produit existant, product_id:', finalProductId);
        } else {
          finalProductId = null;
          console.log('⚠️ Produit non trouvé, product_id sera NULL');
        }
        
        const productObject = {
          id: existingProduct.found ? existingProduct.id : `temp-${Date.now()}-${arrayIndex}`,
          product_id: sourceCode || `IMP-${selectedPurchaseForImport.purchase_number}-${itemIndex + 1}`,
          description: sourceDescription || `Article importé #${itemIndex + 1}`,
          selling_price: parseFloat(supplierItem.cost_price || supplierItem.price || 0),
          unit: supplierItem.unit || supplierItem.unity || 'UN',
          product_group: existingProduct.found ? (existingProduct.type === 'inventory' ? 'Inventaire' : 'Non-Inventaire') : 'Import Fournisseur'
        };
        
        const materialToImport = {
          id: `supplier-${Date.now()}-${arrayIndex}`,
          product_id: finalProductId,
          code: sourceCode || productObject.product_id,
          description: sourceDescription || productObject.description,
          product: productObject,
          quantity: parseFloat(supplierItem.quantity || supplierItem.qty || 1),
          unit: supplierItem.unit || supplierItem.unity || 'UN',
          unit_price: parseFloat(supplierItem.cost_price || supplierItem.price || 0),
          notes: `Importé de #${selectedPurchaseForImport.purchase_number}${existingProduct.found ? ' (Produit existant)' : ''}`,
          showPrice: false,
          from_supplier_purchase: true
        };
        
        console.log('✅ Matériau créé:', materialToImport);
        console.log('  - product_id (pour DB):', materialToImport.product_id);
        console.log('  - code (pour affichage):', materialToImport.code);
        
        return materialToImport;
      });

      setMaterials(prev => [...prev, ...itemsToImport]);
      setShowSupplierImportModal(false);
      setSelectedPurchaseForImport(null);
      setSelectedItemsForImport([]);
      
    } catch (error) {
      console.error('❌ Erreur import:', error);
      setErrors({ materials: 'Erreur lors de l\'import des articles' });
    }
  };

  // ========================================
  // GESTION FORMULAIRE
  // ========================================

  const handleDescriptionChange = (index, value) => {
    const newDescriptions = [...descriptions];
    newDescriptions[index] = value;
    setDescriptions(newDescriptions);
  };

  const addDescription = () => {
    setDescriptions([...descriptions, '']);
  };

  const removeDescription = (index) => {
    if (descriptions.length > 1) {
      const newDescriptions = descriptions.filter((_, i) => i !== index);
      setDescriptions(newDescriptions);
    }
  };

 
const handleTimeChange = (timeData) => {
  setFormData(prev => ({
    ...prev,
    time_entries: timeData.time_entries || [],
    total_hours: timeData.total_hours || 0
  }));
};


  const validateForm = () => {
    const newErrors = {};

    if (!formData.client_id) newErrors.client_id = 'Client requis';
    if (!formData.work_date) newErrors.work_date = 'Date requise';
    
    const hasValidDescription = descriptions.some(desc => desc.trim().length >= 10);
    if (!hasValidDescription) {
      newErrors.work_description = 'Au moins une description de 10 caractères minimum requise';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleClientSelect = (clientId) => {
    const client = clients.find(c => c.id === parseInt(clientId));
    setSelectedClient(client);
    handleChange('client_id', clientId);
  };

  const handleMaterialsChange = (updatedMaterials) => {
    console.log('🔄 MATERIALS CHANGED:', updatedMaterials);
    console.log('🔄 MATERIALS COUNT:', updatedMaterials.length);
    setMaterials(updatedMaterials);
    if (errors.materials) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.materials;
        return newErrors;
      });
    }
  };

  // Gestion création nouveau client depuis le formulaire
  const handleClientSaved = async (newClient) => {
    try {
      // Recharger la liste complète
      const response = await fetch('/api/clients');
      if (response.ok) {
        const data = await response.json();
        setClients(data);
        
        // Sélectionner automatiquement le nouveau client
        if (newClient) {
          setSelectedClient(newClient);
          handleChange('client_id', newClient.id);
          toast.success('✅ Client créé et sélectionné !');
        }
      }
    } catch (error) {
      console.error('Erreur rechargement clients:', error);
      toast.error('❌ Erreur actualisation clients');
    }
  };

  // ========================================
  // SOUMISSION
  // ========================================

  const handleSubmit = async (status = 'draft') => {
  if (!validateForm()) return;

  // Sécurité: si des heures sont présentes, on recalcule selon la même règle
  let payload = { ...formData };
  if (payload.start_time && payload.end_time) {
    payload.total_hours = toQuarterHourUp(
      payload.start_time,
      payload.end_time,
      payload.pause_minutes
    );
  }

  console.log('📋 Matériaux AVANT normalisation:', materials);

  // Normaliser les matériaux avec validation stricte
  const normalizedMaterials = materials.map((material, index) => {
    console.log(`\n🔄 Normalisation matériau ${index}:`, material);

    let normalizedProductId = null;

    if (material.product_id !== undefined && material.product_id !== null) {
      const id = material.product_id;

      const isValidUUID = typeof id === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      const isNumber = typeof id === 'number';

      if (isValidUUID || isNumber) {
        normalizedProductId = id;
        console.log(`✅ product_id valide: ${normalizedProductId}`);
      } else {
        console.log(`⚠️ product_id "${id}" n'est pas valide, recherche...`);
        const existingProduct = findExistingProduct(id);
        if (existingProduct.found) {
          normalizedProductId = existingProduct.id;
          console.log(`✅ ID trouvé: ${normalizedProductId}`);
        } else {
          normalizedProductId = null;
          console.log(`❌ Produit non trouvé, mis à NULL`);
        }
      }
    }

    const normalized = {
      ...material,
      product_id: normalizedProductId,
      description: material.description || material.product?.description || 'Article sans description',
      code: material.code || material.product?.product_id || material.display_code || '',
      unit: material.unit || material.product?.unit || 'UN',
      unit_price: material.unit_price || material.product?.selling_price || 0,
      show_price: material.showPrice || material.show_price || false
    };

    if (normalizedProductId === null) {
      delete normalized.product;
    }

    console.log(`📦 Matériau ${index} normalisé - product_id: ${normalized.product_id}`);
    return normalized;
  });

  console.log('\n✅ MATÉRIAUX NORMALISÉS:', normalizedMaterials);
  console.log('🔍 Vérification finale des product_id:');
  normalizedMaterials.forEach((m, i) => {
    console.log(`  ${i}: product_id=${m.product_id} (type: ${typeof m.product_id}), code="${m.code}"`);
  });

  // 🔴 ICI: utiliser payload (pas formData)
  const dataToSave = {
    ...payload,
    client_id: parseInt(payload.client_id),
    status,
    materials: normalizedMaterials,
    selected_client_emails: selectedEmails,
    recipient_emails: getSelectedEmailAddresses()
  };

  if (mode === 'edit' && workOrder) {
    dataToSave.id = workOrder.id;
  }

  try {
    const savedWorkOrder = await onSave(dataToSave, status);
    // ✅ NOUVEAU : Sauvegarder l'ID pour le polling
    if (savedWorkOrder?.id) {
      setCurrentWorkOrderId(savedWorkOrder.id);
    }
    
    console.log('📧 Emails sauvegardés:', savedWorkOrder.recipient_emails);
    console.log('📧 Emails sauvegardés:', savedWorkOrder.recipient_emails);

    if (status === 'ready_for_signature' && savedWorkOrder) {
      const workOrderId = savedWorkOrder.id || workOrder?.id;
      if (workOrderId) {
        window.open(`/bons-travail/${workOrderId}/client`, '_blank');
      }
    }
  } catch (error) {
    console.error('❌ Erreur sauvegarde:', error);
    setErrors({ general: 'Erreur lors de la sauvegarde' });
  }
};


  return (
    <div className="bg-white rounded-lg shadow p-6 max-w-4xl mx-auto">
     
   // {console.log('🟢 WORKORDERFORM RENDU - time_entries:', formData.time_entries)}
   
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">
          {mode === 'create' ? 'Nouveau Bon de Travail' : `Édition ${workOrder?.bt_number}`}
        </h2>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X size={24} />
        </button>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-6">
        {/* Section Client + Bon d'achat */}
        <div className="bg-blue-50 p-4 rounded-lg space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <User className="inline mr-2" size={16} />
              Client *
            </label>
            
            {/* Select + Bouton sur la même ligne */}
            <div className="flex gap-2">
              <select
                className={`flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  errors.client_id ? 'border-red-500' : 'border-gray-300'
                }`}
                value={formData.client_id}
                onChange={(e) => handleClientSelect(e.target.value)}
              >
                <option value="">Sélectionner un client</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
              
              {/* Bouton Nouveau Client à droite */}
              <button
                type="button"
                onClick={() => setShowClientModal(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center whitespace-nowrap font-medium"
                title="Créer un nouveau client"
              >
                <Plus className="mr-1" size={16} />
                Nouveau
              </button>
            </div>
            
            {errors.client_id && (
              <p className="text-red-500 text-sm mt-1">{errors.client_id}</p>
            )}
            {selectedClient && (
              <div className="mt-2 p-2 bg-white rounded text-sm text-blue-800">
                {selectedClient.address && <div>{selectedClient.address}</div>}
                {selectedClient.email && <div>{selectedClient.email}</div>}
              </div>
            )}
          </div>

          {/* Section Sélection des emails - NOUVEAU */}
          {selectedClient && (selectedClient.email || selectedClient.email_2 || selectedClient.email_admin) && (
            <div className="bg-white border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-3 flex items-center">
                <Mail className="mr-2" size={16} />
                Emails pour envoi du bon de travail
              </h3>
              <div className="space-y-2">
                {/* Email principal */}
                {selectedClient.email && (
                  <label className="flex items-center space-x-3 cursor-pointer hover:bg-blue-50 p-2 rounded transition">
                    <input
                      type="checkbox"
                      checked={selectedEmails.email}
                      onChange={() => handleEmailSelection('email')}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-900">Principal</span>
                      <span className="text-sm text-gray-600 ml-2">{selectedClient.email}</span>
                    </div>
                  </label>
                )}
                
                {/* Email secondaire */}
                {selectedClient.email_2 && (
                  <label className="flex items-center space-x-3 cursor-pointer hover:bg-blue-50 p-2 rounded transition">
                    <input
                      type="checkbox"
                      checked={selectedEmails.email_2}
                      onChange={() => handleEmailSelection('email_2')}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-900">Secondaire</span>
                      <span className="text-sm text-gray-600 ml-2">{selectedClient.email_2}</span>
                    </div>
                  </label>
                )}
                
                {/* Email admin */}
                {selectedClient.email_admin && (
                  <label className="flex items-center space-x-3 cursor-pointer hover:bg-blue-50 p-2 rounded transition">
                    <input
                      type="checkbox"
                      checked={selectedEmails.email_admin}
                      onChange={() => handleEmailSelection('email_admin')}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-900">Administration</span>
                      <span className="text-sm text-gray-600 ml-2">{selectedClient.email_admin}</span>
                    </div>
                  </label>
                )}
              </div>
              
              {/* Compteur d'emails sélectionnés */}
              <div className="mt-3 pt-3 border-t border-blue-200">
                <p className="text-xs text-blue-700">
                  {Object.values(selectedEmails).filter(Boolean).length} email(s) sélectionné(s) pour l'envoi
                </p>
              </div>
            </div>
          )}

          {/* Champ texte simple pour PO */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              📋 Numéro bon d'achat / Job client (optionnel)
            </label>
            <input
              type="text"
              placeholder="Ex: BA-2025-001, Job#12345, PO-ABC-789..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              value={formData.linked_po_id}
              onChange={(e) => handleChange('linked_po_id', e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">
              Référence du bon d'achat ou job client pour votre suivi
            </p>
          </div>
        </div>

        {/* Date de travail */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Calendar className="inline mr-2" size={16} />
            Date de travail *
          </label>
          <input
            type="date"
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.work_date ? 'border-red-500' : 'border-gray-300'
            }`}
            value={formData.work_date}
            onChange={(e) => handleChange('work_date', e.target.value)}
          />
          {errors.work_date && (
            <p className="text-red-500 text-sm mt-1">{errors.work_date}</p>
          )}
        </div>

        {/* Système Punch-in/Punch-out */}
        
        <TimeTracker
          onTimeChange={handleTimeChange}
          initialTimeEntries={formData.time_entries || []}
          workDate={formData.work_date}
          status={formData.status}
        />

        {/* Descriptions multiligne avec ajout de lignes */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-gray-700">
              <FileText className="inline mr-2" size={16} />
              Descriptions du travail *
            </label>
            <button
              type="button"
              onClick={addDescription}
              className="bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 flex items-center text-sm"
            >
              <Plus className="mr-1" size={14} />
              Ajouter ligne
            </button>
          </div>
          
           {descriptions.map((description, index) => (
            <div key={index} className="mb-3 flex gap-2">
              <div className="flex-1">
                <textarea
                  rows={2}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 uppercase ${
                    errors.work_description && index === 0 ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder={index === 0 ? "DESCRIPTION PRINCIPALE DES TRAVAUX EFFECTUÉS..." : "DESCRIPTION ADDITIONNELLE..."}
                  value={description}
                  onChange={(e) => handleDescriptionChange(index, e.target.value.toUpperCase())}
                  style={{ textTransform: 'uppercase' }}
                />
              </div>
              {descriptions.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeDescription(index)}
                  className="text-red-500 hover:text-red-700 p-2"
                  title="Supprimer cette ligne"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
          
          {errors.work_description && (
            <p className="text-red-500 text-sm mt-1">{errors.work_description}</p>
          )}
          
          {/* Aperçu combiné */}
          {descriptions.some(d => d.trim()) && (
            <div className="mt-3 p-3 bg-white border rounded-lg">
              <div className="text-xs text-gray-500 mb-2">Aperçu final:</div>
              <div className="text-sm text-gray-700 whitespace-pre-line">
                {descriptions.filter(d => d.trim()).join('\n\n')}
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Notes additionnelles
          </label>
          <textarea
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 uppercase"
            placeholder="OBSERVATIONS, RECOMMANDATIONS, PROCHAINES ÉTAPES..."
            value={formData.additional_notes}
            onChange={(e) => handleChange('additional_notes', e.target.value.toUpperCase())}
            style={{ textTransform: 'uppercase' }}
          />
        </div>

        {/* Section Matériaux */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-medium text-gray-900 flex items-center mb-3">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-2">
              <span className="text-blue-600 font-bold text-sm">4</span>
            </div>
            Matériaux et Produits
          </h3>
          
          {/* BOUTONS D'IMPORT */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              type="button"
              onClick={loadClientSubmissions}
              disabled={!selectedClient || isLoadingSubmissions}
              className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
              title={!selectedClient ? "Sélectionnez d'abord un client" : "Importer depuis une soumission"}
            >
              <FileText size={16} />
              {isLoadingSubmissions ? 'Chargement...' : 'Ajout de soumission'}
            </button>
            
            <button
              type="button"
              onClick={loadClientSupplierPurchases}
              disabled={!selectedClient || isLoadingSupplierPurchases}
              className="bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
              title={!selectedClient ? "Sélectionnez d'abord un client" : "Importer depuis un achat fournisseur"}
            >
              <Package size={16} />
              {isLoadingSupplierPurchases ? 'Chargement...' : 'Ajout de Fournisseur'}
            </button>
          </div>
          
          <MaterialSelector
            materials={materials}
            onMaterialsChange={handleMaterialsChange}
          />
          
          {errors.materials && (
            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded flex items-center">
              <AlertCircle className="text-yellow-600 mr-2" size={16} />
              <p className="text-yellow-800 text-sm">{errors.materials}</p>
            </div>
          )}
        </div>

        {/* Boutons workflow terrain */}
        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
          {/* Afficher bouton Fermer si BT déjà signé/envoyé */}
          {(workOrder?.status === 'signed' || workOrder?.status === 'sent' || workOrder?.status === 'pending_send') ? (
            <button
              type="button"
              onClick={onCancel}
              className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 flex items-center justify-center font-medium"
            >
              <Check className="mr-2" size={16} />
              Terminer - Retour à la liste
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => handleSubmit('draft')}
                disabled={saving}
                className="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-200 disabled:opacity-50 flex items-center justify-center font-medium"
              >
                <Save className="mr-2" size={16} />
                {saving ? 'Sauvegarde...' : 'Sauvegarder pour plus tard'}
              </button>
        
              <button
                type="button"
                onClick={() => handleSubmit('ready_for_signature')}
                disabled={saving}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center font-medium"
              >
                <FileText className="mr-2" size={16} />
                {saving ? 'Préparation...' : 'Présenter au client'}
              </button>
        
              <button
                type="button"
                onClick={onCancel}
                className="bg-white border border-gray-300 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-50 font-medium"
              >
                Annuler
              </button>
            </>
          )}
        </div>

        {/* Aide contextuelle workflow */}
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <h4 className="font-medium text-blue-900 mb-2">💡 Workflow Terrain</h4>
          <div className="text-sm text-blue-800 space-y-1">
            <p><strong>Sauvegarder pour plus tard:</strong> Garde le BT en brouillon, vous pourrez le reprendre</p>
            <p><strong>Présenter au client:</strong> Prépare le BT pour signature sur tablette</p>
            <p><strong>Emails:</strong> Sélectionnez les emails du client qui recevront le BT signé</p>
          </div>
        </div>
      </form>

      {/* ✅ Modal Création Client */}
      <ClientModal
        open={showClientModal}
        onClose={() => setShowClientModal(false)}
        onSaved={handleClientSaved}
        client={null}
      />
    </div>
  );
}
