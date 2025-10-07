'use client';

import { useState, useEffect } from 'react';
import { Save, X, Calendar, FileText, User, AlertCircle, Plus, Trash2, Package } from 'lucide-react';
import MaterialSelector from './MaterialSelector';
import TimeTracker from './TimeTracker';
import { supabase } from '../../lib/supabase'; // Ajustez le chemin selon votre structure

export default function WorkOrderForm({ 
  workOrder = null, 
  onSave, 
  onCancel, 
  mode = 'create',
  saving = false 
}) {
  const [formData, setFormData] = useState({
    client_id: '',
    linked_po_id: '',
    work_date: new Date().toISOString().split('T')[0],
    start_time: '',
    end_time: '',
    work_description: '',
    additional_notes: '',
    status: 'draft'
  });

  // État pour descriptions multiligne
  const [descriptions, setDescriptions] = useState(['']);

  const [materials, setMaterials] = useState([]);
  const [errors, setErrors] = useState({});
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  
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

  // Initialisation pour mode édition
  useEffect(() => {
    if (workOrder && mode === 'edit') {
      setFormData({
        client_id: workOrder.client_id?.toString() || '',
        linked_po_id: workOrder.linked_po_id || '',
        work_date: workOrder.work_date || new Date().toISOString().split('T')[0],
        start_time: workOrder.start_time || '',
        end_time: workOrder.end_time || '',
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
    }
  }, [workOrder, mode]);

  // Charger les produits et non-inventory items au démarrage
  useEffect(() => {
    loadProductsCache();
  }, []);

  // Charger les clients
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
    
    loadClients();
  }, [workOrder, mode]);

  // Synchroniser descriptions avec work_description
  useEffect(() => {
    const combinedDescription = descriptions
      .filter(desc => desc.trim())
      .join('\n\n');
    
    setFormData(prev => ({ ...prev, work_description: combinedDescription }));
  }, [descriptions]);

  // NOUVELLE FONCTION : Charger le cache des produits
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

  // NOUVELLE FONCTION : Vérifier si un produit existe
  const findExistingProduct = (productCode) => {
    console.log('🔍 Recherche produit avec code:', productCode);
    
    if (!productCode) {
      console.log('❌ Pas de code produit fourni');
      return { found: false };
    }

    // Chercher dans les produits d'inventaire
    const inventoryProduct = cachedProducts.find(p => 
      p.product_id === productCode || 
      p.id === productCode
    );
    
    if (inventoryProduct) {
      console.log('✅ Trouvé dans inventaire:', inventoryProduct);
      return {
        found: true,
        id: inventoryProduct.id,
        product_id: inventoryProduct.product_id,
        description: inventoryProduct.description,
        type: 'inventory'
      };
    }

    // Chercher dans les non-inventory items
    const nonInventoryProduct = cachedNonInventoryItems.find(p => 
      p.product_id === productCode ||
      p.id === productCode
    );

    if (nonInventoryProduct) {
      console.log('✅ Trouvé dans non-inventory:', nonInventoryProduct);
      return {
        found: true,
        id: nonInventoryProduct.id,
        product_id: nonInventoryProduct.product_id,
        description: nonInventoryProduct.description,
        type: 'non-inventory'
      };
    }

    console.log('❌ Produit non trouvé dans les caches');
    return { found: false };
  };

  // NOUVELLE FONCTION : Charger les soumissions du client
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

  // NOUVELLE FONCTION : Charger les achats fournisseurs du client
  const loadClientSupplierPurchases = async () => {
    if (!selectedClient) {
      setErrors({ materials: 'Veuillez d\'abord sélectionner un client' });
      return;
    }

    setIsLoadingSupplierPurchases(true);
    try {
      // D'abord trouver tous les BAs du client
      const { data: clientPOs, error: poError } = await supabase
        .from('purchase_orders')
        .select('id')
        .eq('client_name', selectedClient.name);

      if (poError) throw poError;

      const poIds = clientPOs?.map(po => po.id) || [];

      // Ensuite charger les achats fournisseurs liés
      let query = supabase
        .from('supplier_purchases')
        .select('*')
        .order('created_at', { ascending: false });

      // Filtrer par les BAs du client ou par nom du fournisseur
      if (poIds.length > 0) {
        query = query.or(`linked_po_id.in.(${poIds.join(',')}),supplier_name.ilike.%${selectedClient.name}%`);
      } else {
        query = query.ilike('supplier_name', `%${selectedClient.name}%`);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Filtrer pour garder seulement ceux avec des items
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

  // NOUVELLE FONCTION : Sélectionner une soumission pour import
  const selectSubmissionForImport = (submission) => {
    setSelectedSubmissionForImport(submission);
    setSelectedSubmissionItems([]);
  };

  // NOUVELLE FONCTION : Gérer la sélection d'items de soumission
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

  // NOUVELLE FONCTION : Tout sélectionner/désélectionner pour soumission
  const toggleAllSubmissionItemsSelection = () => {
    if (!selectedSubmissionForImport?.items) return;
    
    if (selectedSubmissionItems.length === selectedSubmissionForImport.items.length) {
      setSelectedSubmissionItems([]);
    } else {
      setSelectedSubmissionItems(selectedSubmissionForImport.items.map((_, index) => index));
    }
  };

  // NOUVELLE FONCTION : Importer les articles sélectionnés de soumission
  const importSelectedSubmissionItems = () => {
    if (!selectedSubmissionForImport || selectedSubmissionItems.length === 0) {
      setErrors({ materials: 'Veuillez sélectionner au moins un article' });
      return;
    }

    try {
      const itemsToImport = selectedSubmissionItems.map((itemIndex, arrayIndex) => {
        const submissionItem = selectedSubmissionForImport.items[itemIndex];
        
        // Chercher si le produit existe dans l'inventaire ou non-inventory
        const sourceCode = submissionItem.product_id || submissionItem.code;
        const existingProduct = findExistingProduct(sourceCode);
        
        // Pour l'affichage, utiliser le code source ou un code généré
        const displayCode = sourceCode || `SOUM-${itemIndex + 1}`;
        
        // S'assurer d'avoir une description valide avec code si disponible
        const baseDescription = submissionItem.name || 
                              submissionItem.description || 
                              `Article importé depuis soumission`;
        
        // Si le produit n'existe pas, inclure le code dans la description
        const itemDescription = existingProduct.found 
          ? existingProduct.description || baseDescription
          : (sourceCode ? `[${sourceCode}] ${baseDescription}` : baseDescription);
        
        return {
          id: 'sub-' + Date.now() + '-' + arrayIndex,
          // Si le produit existe, utiliser son ID, sinon null
          product_id: existingProduct.found ? existingProduct.id : null,
          description: itemDescription,
          display_code: displayCode,
          // Structure pour MaterialSelector
          product: {
            id: existingProduct.found ? existingProduct.id : 'temp-prod-' + Date.now() + '-' + arrayIndex,
            product_id: existingProduct.found ? existingProduct.product_id : displayCode,
            description: itemDescription,
            selling_price: parseFloat(submissionItem.price || submissionItem.selling_price || submissionItem.unit_price || 0),
            unit: submissionItem.unit || 'unité',
            product_group: existingProduct.found 
              ? (existingProduct.type === 'inventory' ? 'Inventaire' : 'Non-Inventaire')
              : 'Import Soumission'
          },
          quantity: parseFloat(submissionItem.quantity || 0),
          unit: submissionItem.unit || 'unité',
          notes: `Importé de soumission #${selectedSubmissionForImport.submission_number}${existingProduct.found ? ' (Produit existant)' : ''}`,
          showPrice: false,
          from_submission: true,
          submission_number: selectedSubmissionForImport.submission_number
        };
      });

      // Ajouter aux matériaux existants
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

  // NOUVELLE FONCTION : Sélectionner un achat fournisseur
  const selectPurchaseForImport = (purchase) => {
    setSelectedPurchaseForImport(purchase);
    setSelectedItemsForImport([]);
  };

  // NOUVELLE FONCTION : Gérer la sélection d'items
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

  // NOUVELLE FONCTION : Tout sélectionner/désélectionner
  const toggleAllItemsSelection = () => {
    if (!selectedPurchaseForImport?.items) return;
    
    if (selectedItemsForImport.length === selectedPurchaseForImport.items.length) {
      setSelectedItemsForImport([]);
    } else {
      setSelectedItemsForImport(selectedPurchaseForImport.items.map((_, index) => index));
    }
  };

  // NOUVELLE FONCTION : Importer les articles sélectionnés
  const importSelectedItems = () => {
  if (!selectedPurchaseForImport || selectedItemsForImport.length === 0) {
    setErrors({ materials: 'Veuillez sélectionner au moins un article' });
    return;
  }

  console.log('🚀 DÉBUT IMPORT DEPUIS ACHAT FOURNISSEUR');
  console.log('📦 Achat fournisseur:', selectedPurchaseForImport);
  console.log('📋 Items sélectionnés:', selectedItemsForImport);

  try {
    const itemsToImport = selectedItemsForImport.map((itemIndex, arrayIndex) => {
      const supplierItem = selectedPurchaseForImport.items[itemIndex];
      console.log(`\n📌 Import item ${itemIndex}:`, supplierItem);
      
      // IMPORTANT: Récupérer TOUTES les données possibles de l'article
      // Chercher dans tous les champs possibles pour le code produit
      const sourceCode = supplierItem.product_id || 
                        supplierItem.code || 
                        supplierItem.product_code ||
                        supplierItem.sku ||
                        supplierItem.item_code ||
                        '';
      
      console.log('🔎 Code source trouvé:', sourceCode);
      
      // Chercher dans tous les champs possibles pour la description
      const sourceDescription = supplierItem.description || 
                              supplierItem.name || 
                              supplierItem.product_name ||
                              supplierItem.product_description ||
                              supplierItem.item_description ||
                              '';
      
      console.log('📝 Description source trouvée:', sourceDescription);
      
      // Vérifier si le produit existe dans le cache
      const existingProduct = findExistingProduct(sourceCode);
      console.log('🔍 Résultat recherche dans cache:', existingProduct);
      
      // Déterminer le product_id final pour la base de données
      let finalProductId = null;
      if (existingProduct.found && existingProduct.id) {
        finalProductId = existingProduct.id;
        console.log('✅ Produit trouvé dans la base, ID:', finalProductId);
      } else {
        console.log('⚠️ Produit non trouvé dans la base, product_id sera NULL');
      }
      
      // TOUJOURS créer un objet product complet pour l'affichage
      const productObject = {
        id: existingProduct.found ? existingProduct.id : `temp-prod-${Date.now()}-${arrayIndex}`,
        product_id: sourceCode || `IMP-${selectedPurchaseForImport.purchase_number}-${itemIndex + 1}`,
        description: sourceDescription || `Article importé #${itemIndex + 1}`,
        selling_price: parseFloat(
          supplierItem.cost_price || 
          supplierItem.price || 
          supplierItem.unit_price || 
          supplierItem.selling_price ||
          0
        ),
        unit: supplierItem.unit || 
              supplierItem.unity || 
              supplierItem.unit_measure ||
              supplierItem.uom ||
              'UN',
        product_group: existingProduct.found 
          ? (existingProduct.type === 'inventory' ? 'Inventaire' : 'Non-Inventaire')
          : 'Import Fournisseur'
      };
      
      console.log('📦 Objet product créé:', productObject);
      
      // Créer le matériau avec toutes les informations
      const materialToImport = {
        id: `supplier-${Date.now()}-${arrayIndex}`,
        // product_id est NULL si non trouvé pour éviter l'erreur FK
        product_id: finalProductId,
        // Les données pour l'affichage et la sauvegarde
        description: sourceDescription || productObject.description,
        code: sourceCode || productObject.product_id, // IMPORTANT: Ajouter le champ 'code'
        display_code: sourceCode || productObject.product_id,
        // TOUJOURS inclure l'objet product pour MaterialSelector
        product: productObject,
        // Quantité et unité
        quantity: parseFloat(
          supplierItem.quantity || 
          supplierItem.qty || 
          supplierItem.qte ||
          1
        ),
        unit: supplierItem.unit || 
              supplierItem.unity || 
              supplierItem.unit_measure ||
              supplierItem.uom ||
              'UN',
        // Prix unitaire
        unit_price: parseFloat(
          supplierItem.cost_price || 
          supplierItem.price || 
          supplierItem.unit_price || 
          supplierItem.selling_price ||
          0
        ),
        // Métadonnées
        notes: `Importé de #${selectedPurchaseForImport.purchase_number}${
          existingProduct.found ? ' (Produit existant)' : ' (Nouveau produit)'
        }`,
        showPrice: false,
        from_supplier_purchase: true,
        supplier_purchase_id: selectedPurchaseForImport.id,
        supplier_purchase_number: selectedPurchaseForImport.purchase_number
      };
      
      console.log('✅ Matériau final créé:', materialToImport);
      console.log('  - product_id:', materialToImport.product_id);
      console.log('  - code:', materialToImport.code);
      console.log('  - description:', materialToImport.description);
      console.log('  - product:', materialToImport.product);
      
      return materialToImport;
    });

    // Ajouter les matériaux importés
    const updatedMaterials = [...materials, ...itemsToImport];
    setMaterials(updatedMaterials);
    
    console.log(`\n✅ IMPORT TERMINÉ: ${itemsToImport.length} matériaux ajoutés`);
    console.log('📊 État final des matériaux:', updatedMaterials);
    
    // Fermer le modal et réinitialiser
    setShowSupplierImportModal(false);
    setSelectedPurchaseForImport(null);
    setSelectedItemsForImport([]);
    
  } catch (error) {
    console.error('❌ Erreur import articles fournisseur:', error);
    console.error('Stack trace:', error.stack);
    setErrors({ materials: 'Erreur lors de l\'import des articles' });
  }
};

  // Gestion des descriptions multiligne
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

  // Gestion des changements de temps via TimeTracker
  const handleTimeChange = (timeData) => {
    setFormData(prev => ({
      ...prev,
      start_time: timeData.start_time,
      end_time: timeData.end_time,
      total_hours: timeData.total_hours
    }));
  };

  // Validation
  const validateForm = () => {
    const newErrors = {};

    if (!formData.client_id) newErrors.client_id = 'Client requis';
    if (!formData.work_date) newErrors.work_date = 'Date requise';
    
    // Validation sur descriptions combinées
    const hasValidDescription = descriptions.some(desc => desc.trim().length >= 10);
    if (!hasValidDescription) {
      newErrors.work_description = 'Au moins une description de 10 caractères minimum requise';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Gestion des changements
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

  // Sélection client
  const handleClientSelect = (clientId) => {
    const client = clients.find(c => c.id === parseInt(clientId));
    setSelectedClient(client);
    handleChange('client_id', clientId);
  };

  // Gestion des matériaux
  const handleMaterialsChange = (updatedMaterials) => {
    console.log('📄 MATERIALS CHANGED:', updatedMaterials);
    console.log('📄 MATERIALS COUNT:', updatedMaterials.length);
    setMaterials(updatedMaterials);
    // Supprimer l'erreur des matériaux si elle existe
    if (errors.materials) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.materials;
        return newErrors;
      });
    }
  };

  // Soumission avec nouveaux statuts
  const handleSubmit = async (status = 'draft') => {
    if (!validateForm()) return;

    console.log('📝 ÉTAT ACTUEL:');
    console.log('- descriptions:', descriptions);
    console.log('- formData.work_description:', formData.work_description);
    console.log('- materials AVANT normalisation:', materials);
    console.log('- materials.length:', materials.length);

    // Normaliser les matériaux pour la sauvegarde
    const normalizedMaterials = materials.map((material, index) => {
      console.log(`\n🔄 Normalisation matériau ${index}:`, material);
      
      // Si le matériau a une structure product imbriquée (import)
      if (material.product) {
        const normalized = {
          ...material,
          // GARDER product_id tel quel s'il existe déjà
          product_id: material.product_id !== undefined ? material.product_id : null,
          description: material.product.description || material.description || 'Article sans description',
          name: material.product.description || material.name,
          // IMPORTANT: Ajouter 'code' pour WorkOrderClientView
          code: material.product.product_id || material.display_code || material.code,
          selling_price: material.product.selling_price || material.price || material.selling_price,
          unit: material.product.unit || material.unit || 'unité',
          display_code: material.display_code || material.product.product_id,
          // Garder l'objet product pour MaterialSelector
          product: material.product
        };
        
        console.log(`✅ Matériau ${index} normalisé:`, normalized);
        console.log(`🔑 product_id final: ${normalized.product_id} (type: ${typeof normalized.product_id})`);
        console.log(`📋 code pour affichage: ${normalized.code}`);
        
        // NE PAS rejeter les IDs numériques ! Ils sont valides pour non_inventory_items
        // Seuls les strings qui ne sont pas des UUID doivent être vérifiés
        if (normalized.product_id !== null && typeof normalized.product_id === 'string') {
          // Vérifier si c'est un UUID valide
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(normalized.product_id)) {
            console.log(`⚠️ product_id "${normalized.product_id}" n'est pas un UUID, recherche dans la base...`);
            
            // C'est probablement un code produit, pas un ID
            const existingProduct = findExistingProduct(normalized.product_id);
            if (existingProduct.found) {
              normalized.product_id = existingProduct.id;
              console.log(`✅ ID trouvé: ${normalized.product_id}`);
            } else {
              normalized.product_id = null;
              console.log(`❌ Produit non trouvé, mis à NULL`);
            }
          }
        }
        // Les nombres sont VALIDES (IDs de non_inventory_items)
        
        return normalized;
      }
      
      // Matériau sans product imbriqué
      console.log(`📋 Matériau ${index} sans product imbriqué, product_id:`, material.product_id);
      
      // S'assurer que le matériau a un code pour l'affichage
      if (!material.code && material.product_id) {
        material.code = material.product_id;
      }
      
      // Vérifier que product_id est valide pour les matériaux normaux aussi
      if (material.product_id !== null && material.product_id !== undefined) {
        if (typeof material.product_id === 'string') {
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(material.product_id)) {
            // C'est un code produit, chercher l'ID réel
            const existingProduct = findExistingProduct(material.product_id);
            if (existingProduct.found) {
              material.product_id = existingProduct.id;
              console.log(`✅ Code converti en ID: ${material.product_id}`);
            } else {
              console.log(`❌ Code produit "${material.product_id}" non trouvé, mis à NULL`);
              material.product_id = null;
            }
          }
        }
        // Les nombres sont VALIDES - ne pas les toucher
      }
      
      return material;
    });

    console.log('\n📦 MATÉRIAUX NORMALISÉS FINAUX:', normalizedMaterials);
    console.log('🔍 Vérification des product_id:');
    normalizedMaterials.forEach((m, i) => {
      console.log(`  - Matériau ${i}: product_id = ${m.product_id} (type: ${typeof m.product_id}), code = "${m.code}", description = "${m.description}"`);
    });

    const dataToSave = {
      ...formData,
      client_id: parseInt(formData.client_id),
      status,
      materials: normalizedMaterials
    };
    
    console.log('📤 DATA TO SAVE:', dataToSave);
    console.log('📝 DATASAVE.MATERIALS:', dataToSave.materials);
    console.log('📝 DATASAVE.WORK_DESCRIPTION:', dataToSave.work_description);

    // Si mode édition, ajouter l'ID
    if (mode === 'edit' && workOrder) {
      dataToSave.id = workOrder.id;
    }

    try {
      const savedWorkOrder = await onSave(dataToSave, status);
      
      // Si "Présenter au client", ouvrir vue client
      if (status === 'ready_for_signature' && savedWorkOrder) {
        const workOrderId = savedWorkOrder.id || workOrder?.id;
        if (workOrderId) {
          // Ouvrir dans nouvel onglet/fenêtre pour tablette
          window.open(`/bons-travail/${workOrderId}/client`, '_blank');
        }
      }
    } catch (error) {
      console.error('❌ Erreur sauvegarde:', error);
      console.error('❌ Stack trace:', error.stack);
      // Gérer l'erreur selon votre pattern habituel
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 max-w-4xl mx-auto">
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
            <select
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
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
          initialStartTime={formData.start_time}
          initialEndTime={formData.end_time}
          workDate={formData.work_date}
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
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                    errors.work_description && index === 0 ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder={index === 0 ? "Description principale des travaux effectués..." : "Description additionnelle..."}
                  value={description}
                  onChange={(e) => handleDescriptionChange(index, e.target.value)}
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Observations, recommandations, prochaines étapes..."
            value={formData.additional_notes}
            onChange={(e) => handleChange('additional_notes', e.target.value)}
          />
        </div>

        {/* Section Matériaux MODIFIÉE */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-medium text-gray-900 flex items-center mb-3">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-2">
              <span className="text-blue-600 font-bold text-sm">4</span>
            </div>
            Matériaux et Produits
          </h3>
          
          {/* NOUVEAUX BOUTONS D'IMPORT */}
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

        {/* Nouveaux boutons workflow terrain */}
        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
          {/* Bouton Sauvegarder brouillon */}
          <button
            type="button"
            onClick={() => handleSubmit('draft')}
            disabled={saving}
            className="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-200 disabled:opacity-50 flex items-center justify-center font-medium"
          >
            <Save className="mr-2" size={16} />
            {saving ? 'Sauvegarde...' : 'Sauvegarder pour plus tard'}
          </button>

          {/* Bouton Présenter au client */}
          <button
            type="button"
            onClick={() => handleSubmit('ready_for_signature')}
            disabled={saving}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center font-medium"
          >
            <FileText className="mr-2" size={16} />
            {saving ? 'Préparation...' : 'Présenter au client'}
          </button>

          {/* Bouton Annuler */}
          <button
            type="button"
            onClick={onCancel}
            className="bg-white border border-gray-300 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-50 font-medium"
          >
            Annuler
          </button>
        </div>

        {/* Aide contextuelle workflow */}
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <h4 className="font-medium text-blue-900 mb-2">💡 Workflow Terrain</h4>
          <div className="text-sm text-blue-800 space-y-1">
            <p><strong>Sauvegarder pour plus tard:</strong> Garde le BT en brouillon, vous pourrez le reprendre</p>
            <p><strong>Présenter au client:</strong> Prépare le BT pour signature sur tablette</p>
            <p><strong>Afficher prix:</strong> Cochez si le client doit voir les prix des matériaux</p>
          </div>
        </div>
      </form>

      {/* MODAL IMPORT SOUMISSIONS - VERSION AVEC SÉLECTION */}
      {showSubmissionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden">
            <div className="bg-blue-600 text-white px-6 py-4 flex justify-between items-center">
              <h3 className="text-xl font-semibold">Import Soumissions - {selectedClient?.name}</h3>
              <button
                onClick={() => {
                  setShowSubmissionModal(false);
                  setSelectedSubmissionForImport(null);
                  setSelectedSubmissionItems([]);
                }}
                className="text-white hover:bg-white/20 rounded-lg p-2"
              >
                ✕
              </button>
            </div>
            
            <div className="flex h-[calc(90vh-200px)]">
              {/* Liste des soumissions */}
              <div className="w-1/3 border-r bg-gray-50 p-4 overflow-y-auto">
                <h4 className="font-semibold mb-4">Soumissions Disponibles</h4>
                
                {submissions.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">Aucune soumission disponible</p>
                    <p className="text-sm text-gray-400 mt-1">
                      Aucune soumission acceptée pour {selectedClient?.name}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {submissions.map((submission) => (
                      <div
                        key={submission.id}
                        onClick={() => selectSubmissionForImport(submission)}
                        className={`border rounded-lg p-3 cursor-pointer transition-all ${
                          selectedSubmissionForImport?.id === submission.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="font-semibold text-sm">#{submission.submission_number || submission.id}</div>
                        <div className="text-xs text-gray-600 truncate">{submission.description}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {submission.items?.length || 0} articles • ${parseFloat(submission.amount || 0).toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-400">
                          {new Date(submission.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Détail des articles */}
              <div className="flex-1 p-4 overflow-y-auto">
                {!selectedSubmissionForImport ? (
                  <div className="text-center py-16">
                    <p className="text-gray-500">Sélectionnez une soumission pour voir les articles</p>
                  </div>
                ) : (
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="font-semibold">
                        Articles de #{selectedSubmissionForImport.submission_number}
                      </h4>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedSubmissionItems.length === (selectedSubmissionForImport.items?.length || 0)}
                            onChange={toggleAllSubmissionItemsSelection}
                            className="rounded"
                          />
                          Tout sélectionner
                        </label>
                        <span className="text-sm text-gray-500">
                          {selectedSubmissionItems.length}/{selectedSubmissionForImport.items?.length || 0} sélectionnés
                        </span>
                      </div>
                    </div>

                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left w-10">✔</th>
                            <th className="px-3 py-2 text-left">Code</th>
                            <th className="px-3 py-2 text-left">Description</th>
                            <th className="px-3 py-2 text-center">Qté</th>
                            <th className="px-3 py-2 text-center">Prix Unit.</th>
                            <th className="px-3 py-2 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {(selectedSubmissionForImport.items || []).map((item, index) => {
                            const quantity = parseFloat(item.quantity || 1);
                            const unitPrice = parseFloat(item.price || item.selling_price || item.unit_price || 0);
                            const lineTotal = quantity * unitPrice;
                            
                            return (
                              <tr key={index} className="hover:bg-gray-50">
                                <td className="px-3 py-2">
                                  <input
                                    type="checkbox"
                                    checked={selectedSubmissionItems.includes(index)}
                                    onChange={() => toggleSubmissionItemSelection(index)}
                                    className="rounded"
                                  />
                                </td>
                                <td className="px-3 py-2 font-medium">
                                  {item.product_id || item.code || '-'}
                                </td>
                                <td className="px-3 py-2">
                                  {item.name || item.description || '-'}
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

                    {selectedSubmissionItems.length > 0 && (
                      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-sm text-blue-700">
                          <strong>{selectedSubmissionItems.length} articles sélectionnés</strong> pour import
                        </p>
                        <p className="text-xs text-blue-600 mt-1">
                          Total estimé: ${selectedSubmissionItems.reduce((sum, itemIndex) => {
                            const item = selectedSubmissionForImport.items[itemIndex];
                            const quantity = parseFloat(item.quantity || 1);
                            const unitPrice = parseFloat(item.price || item.selling_price || item.unit_price || 0);
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
            <div className="bg-gray-50 px-6 py-4 flex justify-between items-center border-t">
              <div></div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowSubmissionModal(false);
                    setSelectedSubmissionForImport(null);
                    setSelectedSubmissionItems([]);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-sm"
                >
                  Annuler
                </button>
                <button
                  onClick={importSelectedSubmissionItems}
                  disabled={selectedSubmissionItems.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
                >
                  Importer {selectedSubmissionItems.length} article(s)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL IMPORT ACHATS FOURNISSEURS */}
      {showSupplierImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden">
            <div className="bg-purple-600 text-white px-6 py-4 flex justify-between items-center">
              <h3 className="text-xl font-semibold">Import Achats Fournisseurs - {selectedClient?.name}</h3>
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
            
            <div className="flex h-[calc(90vh-200px)]">
              {/* Liste des achats fournisseurs */}
              <div className="w-1/3 border-r bg-gray-50 p-4 overflow-y-auto">
                <h4 className="font-semibold mb-4">Achats Fournisseurs Disponibles</h4>
                
                {clientSupplierPurchases.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">Aucun achat fournisseur trouvé</p>
                    <p className="text-sm text-gray-400 mt-1">
                      Aucun achat avec articles pour {selectedClient?.name}
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
                    <div className="flex justify-between items-center mb-4">
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
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left w-10">✔</th>
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
            <div className="bg-gray-50 px-6 py-4 flex justify-between items-center border-t">
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
    </div>
  );
}
