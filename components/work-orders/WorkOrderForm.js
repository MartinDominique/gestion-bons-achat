'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Save, X, Calendar, FileText, User, AlertCircle, Plus, Trash2, Package, Mail, Check, PenTool } from 'lucide-react';
import MaterialSelector from './MaterialSelector';
import TimeTracker from './TimeTracker';
import ClientModal from '../ClientModal';
import PurchaseOrderModal from '../PurchaseOrderModal';
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
  let netMinutes = Math.max(0, e - s - (parseInt(pauseMinutes, 10) || 0));
  
  if (netMinutes < 60) {
    return 1.0;
  }
  
  const hours = Math.floor(netMinutes / 60);
  const minutes = netMinutes % 60;
  
  let roundedMinutes;
  
  if (minutes <= 6) {
    roundedMinutes = 0;
  } else if (minutes <= 21) {
    roundedMinutes = 15;
  } else if (minutes <= 36) {
    roundedMinutes = 30;
  } else if (minutes <= 51) {
    roundedMinutes = 45;
  } else {
    return hours + 1;
  }
  
  const totalMinutes = (hours * 60) + roundedMinutes;
  return Math.round((totalMinutes / 60) * 100) / 100;
};


export default function WorkOrderForm({ 
  workOrder = null, 
  onSave, 
  onCancel, 
  onFormChange,
  mode = 'create',
  saving = false 
}) {
  const router = useRouter(); 
 
  const [formData, setFormData] = useState({
    client_id: '',
    linked_po_id: '',
    work_date: new Date().toISOString().split('T')[0],
    time_entries: [], 
    work_description: '',
    additional_notes: '',
    status: 'draft',
    is_prix_jobe: false
  });

  const [selectedEmails, setSelectedEmails] = useState({
    email: true,      
    email_2: false,
    email_admin: false
  });

  const [descriptions, setDescriptions] = useState(['']);

  const [materials, setMaterials] = useState([]);
  const [errors, setErrors] = useState({});
  const [currentWorkOrderId, setCurrentWorkOrderId] = useState(workOrder?.id || null);
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  
  const [cachedProducts, setCachedProducts] = useState([]);
  const [cachedNonInventoryItems, setCachedNonInventoryItems] = useState([]);

  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [showSupplierImportModal, setShowSupplierImportModal] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [clientSupplierPurchases, setClientSupplierPurchases] = useState([]);
  const [selectedPurchaseForImport, setSelectedPurchaseForImport] = useState(null);
  const [selectedItemsForImport, setSelectedItemsForImport] = useState([]);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);
  const [isLoadingSupplierPurchases, setIsLoadingSupplierPurchases] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [selectedSubmissionForImport, setSelectedSubmissionForImport] = useState(null);
  const [selectedSubmissionItems, setSelectedSubmissionItems] = useState([]);

  // États pour les bons d'achat
  const [clientPurchaseOrders, setClientPurchaseOrders] = useState([]);
  const [showPOModal, setShowPOModal] = useState(false);
  const [useManualPO, setUseManualPO] = useState(false);
  const [manualPOValue, setManualPOValue] = useState('');

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

  useEffect(() => {
    if (formData.client_id && selectedClient) {
      loadEmailPreferences(formData.client_id);
    }
  }, [formData.client_id]);

  // ========================================
  // INITIALISATION
  // ========================================

  useEffect(() => {
    if (workOrder && mode === 'edit') {
      setFormData({
        client_id: workOrder.client_id?.toString() || '',
        linked_po_id: workOrder.linked_po?.po_number || workOrder.linked_po_id || '',
        work_date: workOrder.work_date || new Date().toISOString().split('T')[0],
        time_entries: workOrder.time_entries || [],
        work_description: workOrder.work_description || '',
        additional_notes: workOrder.additional_notes || '',
        status: workOrder.status || 'draft',
        is_prix_jobe: workOrder.is_prix_jobe || false
      });
      
      if (workOrder.work_description) {
        const paragraphs = workOrder.work_description.split('\n\n').filter(p => p.trim());
        setDescriptions(paragraphs.length > 0 ? paragraphs : ['']);
      }
      
      if (workOrder.client) {
        setSelectedClient(workOrder.client);
      }

      if (workOrder.materials) {
        setMaterials(workOrder.materials);
      }

      if (workOrder.selected_client_emails) {
        setSelectedEmails(workOrder.selected_client_emails);
      }

      // Déterminer si le linked_po_id est un BA de la BD ou une saisie manuelle
      if (workOrder.linked_po_id && workOrder.client) {
        const checkPOExists = async () => {
          // Si c'est un nombre, c'est l'ID - on doit convertir en po_number
          if (typeof workOrder.linked_po_id === 'number' || !isNaN(workOrder.linked_po_id)) {
            const { data } = await supabase
              .from('purchase_orders')
              .select('po_number')
              .eq('id', parseInt(workOrder.linked_po_id))
              .single();
            
            if (data?.po_number) {
              // Mettre à jour avec le vrai po_number
              setFormData(prev => ({ ...prev, linked_po_id: data.po_number }));
            } else {
              setUseManualPO(true);
              setManualPOValue(workOrder.linked_po_id.toString());
            }
          } else {
            // C'est déjà une string, vérifier si c'est un BA existant
            const { data } = await supabase
              .from('purchase_orders')
              .select('po_number')
              .eq('client_name', workOrder.client.name)
              .eq('po_number', workOrder.linked_po_id)
              .single();
            
            if (!data) {
              setUseManualPO(true);
              setManualPOValue(workOrder.linked_po_id);
            }
          }
        };
        checkPOExists();
      }
    }
  }, [workOrder, mode]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitializing(false);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    loadProductsCache();
  }, []);

  const loadClients = async () => {
    console.log('📡 loadClients() appelé');
    try {
      console.log('🌐 Fetch /api/clients...');
      const response = await fetch('/api/clients');
      console.log('📥 Réponse reçue, status:', response.status, response.ok);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Clients chargés depuis API:', data.length, 'clients');
        console.log('📋 Liste des clients:', data.map(c => `${c.id}: ${c.name}`).join(', '));
        
        setClients(data);
        console.log('💾 setClients() exécuté');
        
        if (workOrder && mode === 'edit') {
          const client = data.find(c => c.id === workOrder.client_id);
          if (client) {
            setSelectedClient(client);
            console.log('🎯 Client sélectionné en mode édition:', client.name);
          }
        }
      } else {
        console.error('❌ Réponse API non-OK:', response.status);
      }
    } catch (error) {
      console.error('💥 Erreur chargement clients:', error);
    }
  };

  useEffect(() => {
    loadClients();
    
    const handleFocus = () => {
      console.log('🔄 Rechargement clients (retour focus)');
      loadClients();
    };
    
    window.addEventListener('focus', handleFocus);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [workOrder, mode]);

  const handleClientSaved = async (savedClient) => {
    console.log('✅ Client sauvegardé:', savedClient);
    console.log('📊 ID du client:', savedClient.id, typeof savedClient.id);
    
    setClients(prevClients => {
      const exists = prevClients.find(c => c.id === savedClient.id);
      let updatedClients;
      
      if (exists) {
        updatedClients = prevClients.map(c => c.id === savedClient.id ? savedClient : c);
        console.log('🔄 Client mis à jour dans la liste');
      } else {
        updatedClients = [...prevClients, savedClient].sort((a, b) => 
          a.name.localeCompare(b.name)
        );
        console.log('➕ Nouveau client ajouté à la liste');
      }
      
      console.log('📋 Liste clients mise à jour:', updatedClients.length, 'clients');
      return updatedClients;
    });
    
    setTimeout(() => {
      console.log('🎯 Sélection du client:', savedClient.name);
      setSelectedClient(savedClient);
      setFormData(prev => ({
        ...prev,
        client_id: String(savedClient.id)
      }));
      console.log('✅ FormData.client_id défini à:', String(savedClient.id));
    }, 50);
    
    toast.success(`Client ${savedClient.name} ${editingClient ? 'modifié' : 'créé'} avec succès!`);
    
    setTimeout(() => {
      console.log('🔄 Rechargement de la liste depuis l\'API');
      loadClients();
    }, 1000);
  };

  const handleNewClient = () => {
    setEditingClient(null);
    setShowClientModal(true);
  };

  const handleEditClient = () => {
    if (!selectedClient) {
      toast.error('Veuillez sélectionner un client à modifier');
      return;
    }
    setEditingClient(selectedClient);
    setShowClientModal(true);
  };

  // Charger les bons d'achat du client
  const loadClientPurchaseOrders = async (clientName) => {
    if (!clientName) {
      setClientPurchaseOrders([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('id, po_number, description, amount, date, created_at')
        .eq('client_name', clientName)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setClientPurchaseOrders(data || []);
      console.log(`✅ ${data?.length || 0} bons d'achat chargés pour ${clientName}`);
    } catch (error) {
      console.error('❌ Erreur chargement bons d\'achat:', error);
      toast.error('Erreur lors du chargement des bons d\'achat');
    }
  };

  // Charger les BAs quand le client change
  useEffect(() => {
    if (selectedClient?.name) {
      loadClientPurchaseOrders(selectedClient.name);
    } else {
      setClientPurchaseOrders([]);
    }
  }, [selectedClient]);

  useEffect(() => {
    const combinedDescription = descriptions
      .filter(desc => desc.trim())
      .join('\n\n');
    
    setFormData(prev => ({ ...prev, work_description: combinedDescription }));
  }, [descriptions]);

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
      
      checkStatus();
      
      intervalId = setInterval(checkStatus, 3000);
      
      return () => {
        if (intervalId) clearInterval(intervalId);
        console.log('🛑 Surveillance arrêtée');
      };
    }
  }, [mode, formData.status, workOrder?.id, router]);

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
              
              setFormData(prev => ({
                ...prev,
                status: updatedWorkOrder.status
              }));
              
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
      const productsResponse = await fetch('/api/products?limit=5000');
      if (productsResponse.ok) {
        const productsData = await productsResponse.json();
        const products = Array.isArray(productsData) ? productsData : productsData.data || [];
        setCachedProducts(products);
        console.log(`${products.length} produits d'inventaire chargés en cache`);
      }

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
      toast.error('Veuillez d\'abord sélectionner un client');
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

      if (!data || data.length === 0) {
        toast.error('Aucune soumission acceptée trouvée pour ce client');
        setIsLoadingSubmissions(false);
        return;
      }

      setSubmissions(data);
      setShowSubmissionModal(true);
    } catch (error) {
      console.error('Erreur chargement soumissions:', error);
      toast.error('Erreur lors du chargement des soumissions');
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
      toast.error('Veuillez sélectionner au moins un article');
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
      
      toast.success(`${itemsToImport.length} matériaux importés de la soumission #${selectedSubmissionForImport.submission_number}`);
      
    } catch (error) {
      console.error('Erreur import articles soumission:', error);
      toast.error('Erreur lors de l\'import des articles');
    }
  };

  // ========================================
  // FONCTIONS IMPORT ACHATS FOURNISSEURS
  // ========================================

  const loadClientSupplierPurchases = async () => {
    if (!selectedClient) {
      toast.error('Veuillez d\'abord sélectionner un client');
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
      
      if (purchasesWithItems.length === 0) {
        toast.error('Aucun achat fournisseur trouvé pour ce client');
        setIsLoadingSupplierPurchases(false);
        return;
      }

      setClientSupplierPurchases(purchasesWithItems);
      setShowSupplierImportModal(true);
    } catch (error) {
      console.error('Erreur chargement achats fournisseurs:', error);
      toast.error('Erreur lors du chargement des achats fournisseurs');
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
      toast.error('Veuillez sélectionner au moins un article');
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
      
      toast.success(`${itemsToImport.length} matériaux importés de l'achat #${selectedPurchaseForImport.purchase_number}`);
      
    } catch (error) {
      console.error('❌ Erreur import:', error);
      toast.error('Erreur lors de l\'import des articles');
    }
  };

  // ========================================
  // GESTION FORMULAIRE
  // ========================================

  const handleDescriptionChange = (index, value) => {
    const newDescriptions = [...descriptions];
    newDescriptions[index] = value;
    setDescriptions(newDescriptions);
    if (onFormChange && !isInitializing) {
      onFormChange();
    }
  };

  const addDescription = () => {
    setDescriptions([...descriptions, '']);
    if (onFormChange && !isInitializing) {
      onFormChange();
    }
  };

  const removeDescription = (index) => {
    if (descriptions.length > 1) {
      const newDescriptions = descriptions.filter((_, i) => i !== index);
      setDescriptions(newDescriptions);
      if (onFormChange && !isInitializing) {
        onFormChange();
      }
    }
  };

  const handleTimeChange = (timeData) => {
    console.log('📥 WorkOrderForm reçoit timeData:', timeData);
    
    setFormData(prev => ({
      ...prev,
      time_entries: timeData.time_entries || [],
      total_hours: timeData.total_hours || 0
    }));
    if (onFormChange && !isInitializing) {
      onFormChange();
    }
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
    if (onFormChange && !isInitializing) {
      onFormChange();
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
    if (onFormChange && !isInitializing) {
      onFormChange();
    }
  };

  // ========================================
  // SOUMISSION
  // ========================================

  const handleSubmit = async (status = 'draft') => {
    // ✅ PROTECTION: Empêcher double soumission
    if (isSubmitting) {
      console.log('⏸️ Soumission déjà en cours, ignorée');
      return;
    }
    
    if (!validateForm()) return;
  
    setIsSubmitting(true); // 🔒 Bloquer immédiatement

    let payload = { ...formData };
    if (payload.start_time && payload.end_time) {
      payload.total_hours = toQuarterHourUp(
        payload.start_time,
        payload.end_time,
        payload.pause_minutes
      );
    }

    console.log('📋 Matériaux AVANT normalisation:', materials);

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
      
      if (status === 'ready_for_signature' && savedWorkOrder) {
        const workOrderId = savedWorkOrder.id || workOrder?.id;
        if (workOrderId) {
          console.log('🚀 OUVERTURE fenêtre client, ID:', workOrderId);
          window.open(`/bons-travail/${workOrderId}/client`, '_blank');
        }
      }
    } catch (error) {
      console.error('❌ Erreur sauvegarde:', error);
      setErrors({ general: 'Erreur lors de la sauvegarde' });
    } finally {
      setIsSubmitting(false); // 🔓 Débloquer après
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 max-w-4xl mx-auto">
    
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h2 className="text-xl font-bold text-gray-900">
          {mode === 'create' ? 'Nouveau Bon de Travail' : `Édition ${workOrder?.bt_number}`}
        </h2>
        
        {/* Boutons workflow - en haut (colonne sur mobile, ligne sur tablet/PC) */}
        <div className="flex flex-col sm:flex-row gap-2">
          {(workOrder?.status === 'signed' || workOrder?.status === 'sent' || workOrder?.status === 'pending_send') ? (
            <button
              type="button"
              onClick={onCancel}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center justify-center font-medium text-sm"
            >
              <Check className="mr-2" size={16} />
              Terminer
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => handleSubmit('draft')}
                disabled={saving || isSubmitting}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 flex items-center justify-center font-medium text-sm"
              >
                <Save className="mr-2" size={16} />
                {(saving || isSubmitting) ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
        
              <button
                type="button"
                onClick={() => handleSubmit('ready_for_signature')}
                disabled={saving || isSubmitting}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center font-medium text-sm"
              >
                <FileText className="mr-2" size={16} />
                {(saving || isSubmitting) ? 'Préparation...' : 'Présenter'}
              </button>
        
              <button
                type="button"
                onClick={onCancel}
                className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 font-medium text-sm"
              >
                Annuler
              </button>
            </>
          )}
        </div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-6">
        {/* Section Client + Bon d'achat */}
        <div className="bg-blue-50 p-4 rounded-lg space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <User className="inline mr-2" size={16} />
              Client *
            </label>
            
            <div className="flex flex-col sm:flex-row gap-2">
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
              
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    console.log('🔄 Rafraîchissement manuel de la liste clients');
                    loadClients();
                    toast.success('Liste des clients actualisée');
                  }}
                  className="p-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center justify-center"
                  title="🔄 Actualiser la liste des clients"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                  </svg>
                </button>
                
                <button
                  type="button"
                  onClick={handleEditClient}
                  disabled={!selectedClient}
                  className={`p-3 rounded-lg flex items-center justify-center ${
                    selectedClient
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                  title={selectedClient ? '✏️ Modifier le client sélectionné' : 'Sélectionnez un client d\'abord'}
                >
                  <PenTool size={20} />
                </button>
                
                <button
                  type="button"
                  onClick={handleNewClient}
                  className="p-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center"
                  title="➕ Créer un nouveau client"
                >
                  <Plus size={20} />
                </button>
              </div>
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

          {selectedClient && (selectedClient.email || selectedClient.email_2 || selectedClient.email_admin) && (
            <div className="bg-white border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-3 flex items-center">
                <Mail className="mr-2" size={16} />
                Emails pour envoi du bon de travail
              </h3>
              <div className="space-y-2">
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
              
              <div className="mt-3 pt-3 border-t border-blue-200">
                <p className="text-xs text-blue-700">
                  {Object.values(selectedEmails).filter(Boolean).length} email(s) sélectionné(s) pour l'envoi
                </p>
              </div>
            </div>
          )}

            {/* ✅ NOUVEAU - Checkbox Prix Jobé */}
            {selectedClient && (
              <div className="mt-4 bg-amber-50 border-2 border-amber-300 rounded-lg p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_prix_jobe || false}
                    onChange={(e) => {
                      setFormData({ ...formData, is_prix_jobe: e.target.checked });
                      if (onFormChange) onFormChange();
                    }}
                    className="mt-1 w-5 h-5 text-amber-600 rounded focus:ring-2 focus:ring-amber-500"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-amber-900 flex items-center gap-2">
                      💰 Prix Jobé
                    </div>
                    <p className="text-sm text-amber-700 mt-1">
                      Le client recevra un BT simplifié (sans heures ni matériels).
                    </p>
                    <p className="text-xs text-amber-600 mt-1">
                      Le bureau recevra les 2 versions: simplifiée + complète
                    </p>
                  </div>
                </label>
              </div>
            )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              📋 Bon d'achat client (optionnel)
            </label>
            
            {/* Toggle entre Select et Saisie manuelle */}
            <div className="flex items-center gap-4 mb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={!useManualPO}
                  onChange={() => {
                    setUseManualPO(false);
                    setManualPOValue('');
                  }}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-gray-700">Sélectionner un BA</span>
              </label>
              
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={useManualPO}
                  onChange={() => {
                    setUseManualPO(true);
                    setFormData(prev => ({ ...prev, linked_po_id: '' }));
                  }}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-gray-700">Saisie manuelle</span>
              </label>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              {!useManualPO ? (
                // Mode sélection
                <>
                  <select
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    value={formData.linked_po_id}
                    onChange={(e) => handleChange('linked_po_id', e.target.value)}
                    disabled={!selectedClient}
                  >
                    <option value="">
                      {selectedClient 
                        ? clientPurchaseOrders.length > 0 
                          ? 'Sélectionner un bon d\'achat' 
                          : 'Aucun BA trouvé pour ce client'
                        : 'Sélectionnez d\'abord un client'}
                    </option>
                    {clientPurchaseOrders.map(po => (
                      <option key={po.id} value={po.po_number}>
                        {po.po_number} - {po.description ? po.description.substring(0, 50) : 'Sans description'} - {new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(po.amount || 0)} ({new Date(po.date).toLocaleDateString('fr-CA')})
                      </option>
                    ))}
                  </select>
                  
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedClient?.name) {
                          loadClientPurchaseOrders(selectedClient.name);
                          toast.success('Liste des bons d\'achat actualisée');
                        }
                      }}
                      disabled={!selectedClient}
                      className={`p-3 rounded-lg flex items-center justify-center ${
                        selectedClient
                          ? 'bg-gray-600 text-white hover:bg-gray-700'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                      title="🔄 Actualiser la liste des BAs"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                      </svg>
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => setShowPOModal(true)}
                      disabled={!selectedClient}
                      className={`p-3 rounded-lg flex items-center justify-center ${
                        selectedClient
                          ? 'bg-green-600 text-white hover:bg-green-700'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                      title="➕ Créer un nouveau BA"
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                </>
              ) : (
                // Mode saisie manuelle
                <input
                  type="text"
                  placeholder="Ex: BA-2025-001, Job#12345, PO-ABC-789..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  value={manualPOValue}
                  onChange={(e) => {
                    setManualPOValue(e.target.value);
                    handleChange('linked_po_id', e.target.value);
                  }}
                />
              )}
            </div>
            
            <p className="text-xs text-gray-500 mt-1">
              {useManualPO 
                ? 'Saisissez une référence manuelle (pour les BAs externes)'
                : 'Sélectionnez un BA existant ou créez-en un nouveau'
              }
            </p>
          </div>
        </div>

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

        <TimeTracker
          onTimeChange={handleTimeChange}
          initialTimeEntries={formData.time_entries || []}
          workDate={formData.work_date}
          status={formData.status}
          selectedClient={selectedClient}
        />

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
          
          {descriptions.some(d => d.trim()) && (
            <div className="mt-3 p-3 bg-white border rounded-lg">
              <div className="text-xs text-gray-500 mb-2">Aperçu final:</div>
              <div className="text-sm text-gray-700 whitespace-pre-line">
                {descriptions.filter(d => d.trim()).join('\n\n')}
              </div>
            </div>
          )}
        </div>

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

        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-medium text-gray-900 flex items-center mb-3">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-2">
              <span className="text-blue-600 font-bold text-sm">4</span>
            </div>
            Matériaux et Produits
          </h3>
          
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

        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
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

        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <h4 className="font-medium text-blue-900 mb-2">💡 Workflow Terrain</h4>
          <div className="text-sm text-blue-800 space-y-1">
            <p><strong>Sauvegarder pour plus tard:</strong> Garde le BT en brouillon, vous pourrez le reprendre</p>
            <p><strong>Présenter au client:</strong> Prépare le BT pour signature sur tablette</p>
            <p><strong>Emails:</strong> Sélectionnez les emails du client qui recevront le BT signé</p>
          </div>
        </div>
      </form>

      {/* ========================================
          MODAL IMPORT SOUMISSIONS
          ======================================== */}
      {showSubmissionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <FileText className="text-blue-600" size={24} />
                Import depuis Soumissions
              </h2>
              <button
                onClick={() => {
                  setShowSubmissionModal(false);
                  setSelectedSubmissionForImport(null);
                  setSelectedSubmissionItems([]);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {!selectedSubmissionForImport ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 mb-4">
                    Sélectionnez une soumission pour voir ses articles
                  </p>
                  {submissions.map((submission) => (
                    <div
                      key={submission.id}
                      onClick={() => selectSubmissionForImport(submission)}
                      className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            Soumission #{submission.submission_number}
                          </h3>
                          <p className="text-sm text-gray-600 mt-1">
                            {new Date(submission.created_at).toLocaleDateString('fr-CA')}
                          </p>
                          {submission.description && (
                            <p className="text-sm text-gray-500 mt-1">{submission.description}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-500">
                            {submission.items?.length || 0} articles
                          </div>
                          <div className="text-lg font-bold text-gray-900 mt-1">
                            {new Intl.NumberFormat('fr-CA', {
                              style: 'currency',
                              currency: 'CAD'
                            }).format(submission.total || 0)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <button
                      onClick={() => {
                        setSelectedSubmissionForImport(null);
                        setSelectedSubmissionItems([]);
                      }}
                      className="text-blue-600 hover:text-blue-700 flex items-center gap-2"
                    >
                      ← Retour aux soumissions
                    </button>
                    <button
                      onClick={toggleAllSubmissionItemsSelection}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      {selectedSubmissionItems.length === selectedSubmissionForImport.items.length
                        ? 'Tout désélectionner'
                        : 'Tout sélectionner'}
                    </button>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-lg mb-4">
                    <h3 className="font-semibold text-gray-900">
                      Soumission #{selectedSubmissionForImport.submission_number}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {selectedSubmissionItems.length} / {selectedSubmissionForImport.items?.length || 0} articles sélectionnés
                    </p>
                  </div>

                  <div className="space-y-2">
                    {selectedSubmissionForImport.items?.map((item, index) => (
                      <label
                        key={index}
                        className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition ${
                          selectedSubmissionItems.includes(index)
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedSubmissionItems.includes(index)}
                          onChange={() => toggleSubmissionItemSelection(index)}
                          className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex-1">
                              <div className="font-medium text-gray-900">
                                {item.product_id || item.code ? `[${item.product_id || item.code}] ` : ''}
                                {item.name || item.description}
                              </div>
                              <div className="text-sm text-gray-600 mt-1">
                                Qté: {item.quantity} {item.unit || 'unité'}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold text-gray-900">
                                {new Intl.NumberFormat('fr-CA', {
                                  style: 'currency',
                                  currency: 'CAD'
                                }).format(item.price || item.selling_price || item.unit_price || 0)}
                              </div>
                              <div className="text-xs text-gray-500">par {item.unit || 'unité'}</div>
                            </div>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowSubmissionModal(false);
                  setSelectedSubmissionForImport(null);
                  setSelectedSubmissionItems([]);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Annuler
              </button>
              {selectedSubmissionForImport && (
                <button
                  onClick={importSelectedSubmissionItems}
                  disabled={selectedSubmissionItems.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Importer {selectedSubmissionItems.length} article{selectedSubmissionItems.length > 1 ? 's' : ''}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================
          MODAL IMPORT ACHATS FOURNISSEURS
          ======================================== */}
      {showSupplierImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Package className="text-purple-600" size={24} />
                Import depuis Achats Fournisseurs
              </h2>
              <button
                onClick={() => {
                  setShowSupplierImportModal(false);
                  setSelectedPurchaseForImport(null);
                  setSelectedItemsForImport([]);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {!selectedPurchaseForImport ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 mb-4">
                    Sélectionnez un achat fournisseur pour voir ses articles
                  </p>
                  {clientSupplierPurchases.map((purchase) => (
                    <div
                      key={purchase.id}
                      onClick={() => selectPurchaseForImport(purchase)}
                      className="p-4 border border-gray-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 cursor-pointer transition"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            Achat #{purchase.purchase_number}
                          </h3>
                          <p className="text-sm text-gray-600 mt-1">
                            {purchase.supplier_name}
                          </p>
                          <p className="text-sm text-gray-500">
                            {new Date(purchase.created_at).toLocaleDateString('fr-CA')}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-500">
                            {purchase.items?.length || 0} articles
                          </div>
                          <div className="text-lg font-bold text-gray-900 mt-1">
                            {new Intl.NumberFormat('fr-CA', {
                              style: 'currency',
                              currency: purchase.currency || 'CAD'
                            }).format(purchase.total_cost || 0)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <button
                      onClick={() => {
                        setSelectedPurchaseForImport(null);
                        setSelectedItemsForImport([]);
                      }}
                      className="text-purple-600 hover:text-purple-700 flex items-center gap-2"
                    >
                      ← Retour aux achats
                    </button>
                    <button
                      onClick={toggleAllItemsSelection}
                      className="text-sm text-purple-600 hover:text-purple-700"
                    >
                      {selectedItemsForImport.length === selectedPurchaseForImport.items.length
                        ? 'Tout désélectionner'
                        : 'Tout sélectionner'}
                    </button>
                  </div>

                  <div className="bg-purple-50 p-4 rounded-lg mb-4">
                    <h3 className="font-semibold text-gray-900">
                      Achat #{selectedPurchaseForImport.purchase_number}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {selectedPurchaseForImport.supplier_name}
                    </p>
                    <p className="text-sm text-gray-600">
                      {selectedItemsForImport.length} / {selectedPurchaseForImport.items?.length || 0} articles sélectionnés
                    </p>
                  </div>

                  <div className="space-y-2">
                    {selectedPurchaseForImport.items?.map((item, index) => (
                      <label
                        key={index}
                        className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition ${
                          selectedItemsForImport.includes(index)
                            ? 'border-purple-500 bg-purple-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedItemsForImport.includes(index)}
                          onChange={() => toggleItemSelection(index)}
                          className="mt-1 w-4 h-4 text-purple-600 rounded focus:ring-2 focus:ring-purple-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex-1">
                              <div className="font-medium text-gray-900">
                                {item.product_id || item.code || item.product_code || item.sku ? 
                                  `[${item.product_id || item.code || item.product_code || item.sku}] ` : 
                                  ''}
                                {item.description || item.name || item.product_name}
                              </div>
                              <div className="text-sm text-gray-600 mt-1">
                                Qté: {item.quantity || item.qty} {item.unit || item.unity || 'UN'}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold text-gray-900">
                                {new Intl.NumberFormat('fr-CA', {
                                  style: 'currency',
                                  currency: selectedPurchaseForImport.currency || 'CAD'
                                }).format(item.cost_price || item.price || 0)}
                              </div>
                              <div className="text-xs text-gray-500">par {item.unit || item.unity || 'UN'}</div>
                            </div>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowSupplierImportModal(false);
                  setSelectedPurchaseForImport(null);
                  setSelectedItemsForImport([]);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Annuler
              </button>
              {selectedPurchaseForImport && (
                <button
                  onClick={importSelectedItems}
                  disabled={selectedItemsForImport.length === 0}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Importer {selectedItemsForImport.length} article{selectedItemsForImport.length > 1 ? 's' : ''}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <ClientModal
        open={showClientModal}
        onClose={() => {
          setShowClientModal(false);
          setEditingClient(null);
        }}
        onSaved={handleClientSaved}
        client={editingClient}
      />

      {/* Modal Création Bon d'Achat */}
      <PurchaseOrderModal
        isOpen={showPOModal}
        onClose={() => setShowPOModal(false)}
        editingPO={null}
        onRefresh={() => {
          // Après création du BA, recharger la liste et sélectionner le nouveau
          if (selectedClient?.name) {
            loadClientPurchaseOrders(selectedClient.name);
          }
        }}
      />
    </div>
  );
}
