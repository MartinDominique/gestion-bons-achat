/**
 * @file components/SupplierPurchaseServices.js
 * @description Services pour la gestion des achats fournisseurs (AF)
 *              PDF standardisé via pdf-common.js, envoi email, CRUD Supabase
 * @version 2.1.0
 * @date 2026-02-12
 * @changelog
 *   2.1.0 - Ajout quantités inventaire (en main, en commande, réservé) dans recherche produits
 *   2.0.0 - Standardisation PDF avec pdf-common.js, suppression html2canvas
 *   1.5.0 - Sync supplier_name, corrections
 *   1.0.0 - Version initiale
 */

import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { supabase } from '../lib/supabase';
import {
  drawHeader,
  drawFooter,
  drawMaterialsTable,
  drawTotals,
  drawTwoColumns,
  drawSectionTitle,
  loadLogoBase64Client,
  formatDate as pdfFormatDate,
  formatCurrency as pdfFormatCurrency,
  PAGE,
} from '../lib/services/pdf-common';

// Cache logo en mémoire (chargé une seule fois)
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

// ===== CONSTANTES =====

// Configuration email
export const DOMINIQUE_EMAIL = 'info.servicestmt@gmail.com';

// Liste des transporteurs
export const CARRIERS = [
  '',
  'GLS',
  'Purolator', 
  'UPS',
  'FedEx',
  'DHL',
  'Nationex',
  'Poste Canada',
  'Intelcom'
];

// Statuts des achats - MODIFIÉ avec nouveau statut
export const PURCHASE_STATUSES = {
  draft: 'Brouillon',
  in_order: 'En commande', // NOUVEAU STATUT
  ordered: 'Commandé',
  partial: 'Réception partielle',
  received: 'Reçu',
  cancelled: 'Annulé'
};

// Patterns des codes postaux
export const POSTAL_CODE_PATTERNS = {
  Canada: "[A-Za-z]\\d[A-Za-z] \\d[A-Za-z]\\d",
  USA: "\\d{5}(-\\d{4})?",
  default: ""
};

// Placeholders des codes postaux
export const POSTAL_CODE_PLACEHOLDERS = {
  Canada: "H1A 1A1",
  USA: "12345 ou 12345-6789",
  default: ""
};

// Provinces canadiennes
export const CANADIAN_PROVINCES = {
  'QC': 'Québec',
  'ON': 'Ontario',
  'BC': 'Colombie-Britannique',
  'AB': 'Alberta',
  'MB': 'Manitoba',
  'SK': 'Saskatchewan',
  'NS': 'Nouvelle-Écosse',
  'NB': 'Nouveau-Brunswick',
  'NL': 'Terre-Neuve-et-Labrador',
  'PE': 'Île-du-Prince-Édouard',
  'NT': 'Territoires du Nord-Ouest',
  'YT': 'Yukon',
  'NU': 'Nunavut'
};

// ===== FONCTIONS UTILITAIRES =====

// Fonction pour obtenir le pattern du code postal
export const getPostalCodePattern = (country) => {
  return POSTAL_CODE_PATTERNS[country] || POSTAL_CODE_PATTERNS.default;
};

// Fonction pour obtenir le placeholder du code postal
export const getPostalCodePlaceholder = (country) => {
  return POSTAL_CODE_PLACEHOLDERS[country] || POSTAL_CODE_PLACEHOLDERS.default;
};

// Formatage monétaire standard
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD'
  }).format(amount || 0);
};

// Formatage monétaire avec 4 décimales pour les prix unitaires
export const formatUnitPrice = (amount) => {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4
  }).format(amount || 0);
};

// Formatage des dates
export const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('fr-CA');
};

// Génération du numéro d'achat
export const generatePurchaseNumber = async () => {
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

// Fonction utilitaire pour récupérer le PO Number
export const getPONumber = (purchase, purchaseOrders = []) => {
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

// ===== API SUPABASE - ACHATS FOURNISSEURS =====

// Récupérer tous les achats fournisseurs - MODIFIÉ avec BA Acomba
export const fetchSupplierPurchases = async () => {
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
    
    return enrichedData;
  } catch (error) {
    console.error('Erreur chargement achats:', error);
    throw error;
  }
};

// Créer un nouvel achat fournisseur - MODIFIÉ avec BA Acomba
export const createSupplierPurchase = async (purchaseData) => {
  try {
    const { data, error } = await supabase
      .from('supplier_purchases')
      .insert([{
        ...purchaseData,
        // S'assurer que ba_acomba est inclus
        ba_acomba: purchaseData.ba_acomba || ''
      }])
      .select()
      .single();
      
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Erreur création achat:', error);
    throw error;
  }
};

// Mettre à jour un achat fournisseur - MODIFIÉ avec BA Acomba
export const updateSupplierPurchase = async (id, purchaseData) => {
  try {
    const { data, error } = await supabase
      .from('supplier_purchases')
      .update({
        ...purchaseData,
        // S'assurer que ba_acomba est inclus
        ba_acomba: purchaseData.ba_acomba || ''
      })
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Erreur mise à jour achat:', error);
    throw error;
  }
};

// Supprimer un achat fournisseur
export const deleteSupplierPurchase = async (id) => {
  try {
    const { error } = await supabase
      .from('supplier_purchases')
      .delete()
      .eq('id', id);
      
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Erreur suppression achat:', error);
    throw error;
  }
};

// Corriger les achats existants (fonction de maintenance)
export const fixExistingPurchases = async () => {
  try {
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
    
    return { fixed: fixedCount, total: purchasesToFix.length };
  } catch (error) {
    console.error('Erreur lors de la correction:', error);
    throw error;
  }
};

// ===== API SUPABASE - FOURNISSEURS =====

// Récupérer tous les fournisseurs
export const fetchSuppliers = async () => {
  try {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('company_name', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Erreur chargement fournisseurs:', error);
    throw error;
  }
};

// Créer un nouveau fournisseur
export const createSupplier = async (supplierData) => {
  try {
    const { data, error } = await supabase
      .from('suppliers')
      .insert([supplierData])
      .select()
      .single();
      
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Erreur création fournisseur:', error);
    throw error;
  }
};

// Mettre à jour un fournisseur
export const updateSupplier = async (id, supplierData) => {
  try {
    const { error } = await supabase
      .from('suppliers')
      .update(supplierData)
      .eq('id', id);

    if (error) throw error;

    // Synchroniser supplier_name dans supplier_purchases si le nom a changé
    if (supplierData.name) {
      const { error: syncError } = await supabase
        .from('supplier_purchases')
        .update({ supplier_name: supplierData.name })
        .eq('supplier_id', id);

      if (syncError) {
        console.warn('⚠️ Sync supplier_purchases.supplier_name échouée:', syncError.message);
      }
    }

    return true;
  } catch (error) {
    console.error('Erreur mise à jour fournisseur:', error);
    throw error;
  }
};

// Supprimer un fournisseur
export const deleteSupplier = async (id) => {
  try {
    const { error } = await supabase
      .from('suppliers')
      .delete()
      .eq('id', id);
      
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Erreur suppression fournisseur:', error);
    throw error;
  }
};

// ===== API SUPABASE - BONS D'ACHAT =====

// Récupérer tous les bons d'achat
export const fetchPurchaseOrders = async () => {
  try {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('id, po_number, client_name, client_id, amount, status, description')
      .in('status', ['in_progress', 'partially_delivered'])
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Erreur chargement bons achat:', error);
    throw error;
  }
};

// ===== API SUPABASE - ADRESSES DE LIVRAISON =====

// Récupérer toutes les adresses de livraison
export const fetchShippingAddresses = async () => {
  try {
    const { data, error } = await supabase
      .from('shipping_addresses')
      .select('*')
      .order('is_default', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Erreur chargement adresses:', error);
    throw error;
  }
};

// Créer une nouvelle adresse de livraison
export const createShippingAddress = async (addressData) => {
  try {
    // Si on définit cette adresse comme par défaut, enlever le statut par défaut des autres
    if (addressData.is_default) {
      const { error: updateError } = await supabase
        .from('shipping_addresses')
        .update({ is_default: false })
        .neq('id', 0);
      
      if (updateError) {
        console.error('Erreur mise à jour adresses par défaut:', updateError);
      }
    }

    const { data, error } = await supabase
      .from('shipping_addresses')
      .insert([addressData])
      .select()
      .single();
      
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Erreur création adresse:', error);
    throw error;
  }
};

// Mettre à jour une adresse de livraison
export const updateShippingAddress = async (id, addressData) => {
  try {
    // Si on définit cette adresse comme par défaut, enlever le statut par défaut des autres
    if (addressData.is_default) {
      const { error: updateError } = await supabase
        .from('shipping_addresses')
        .update({ is_default: false })
        .neq('id', id);
      
      if (updateError) {
        console.error('Erreur mise à jour adresses par défaut:', updateError);
      }
    }

    const { error } = await supabase
      .from('shipping_addresses')
      .update(addressData)
      .eq('id', id);
      
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Erreur mise à jour adresse:', error);
    throw error;
  }
};

// Supprimer une adresse de livraison
export const deleteShippingAddress = async (id) => {
  try {
    const { error } = await supabase
      .from('shipping_addresses')
      .delete()
      .eq('id', id);
      
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Erreur suppression adresse:', error);
    throw error;
  }
};

// ===== API SUPABASE - PRODUITS =====

// Recherche produits (avec quantités inventaire: en main, en commande, réservé)
export const searchProducts = async (searchTerm) => {
  if (!searchTerm || searchTerm.length < 2) {
    return [];
  }

  try {
    // Lancer toutes les requêtes en parallèle pour la performance
    const [
      { data: inventoryProducts, error: error1 },
      { data: nonInventoryProducts, error: error2 },
      { data: afPurchases },
      { data: draftWorkOrders },
      { data: draftDeliveryNotes },
      { data: acceptedSubmissions }
    ] = await Promise.all([
      // 1. Recherche produits inventaire
      supabase
        .from('products')
        .select('*')
        .or(`description.ilike.%${searchTerm}%,product_id.ilike.%${searchTerm}%`)
        .order('description', { ascending: true })
        .limit(25),
      // 2. Recherche produits non-inventaire
      supabase
        .from('non_inventory_items')
        .select('*')
        .or(`description.ilike.%${searchTerm}%,product_id.ilike.%${searchTerm}%`)
        .order('description', { ascending: true })
        .limit(25),
      // 3. AF en commande (pour "en commande")
      supabase
        .from('supplier_purchases')
        .select('items, status')
        .in('status', ['ordered', 'partial']),
      // 4. BT non complétés (pour "réservé")
      supabase
        .from('work_orders')
        .select('id, status')
        .in('status', ['draft', 'signed', 'pending_send']),
      // 5. BL non envoyés (pour "réservé")
      supabase
        .from('delivery_notes')
        .select('id, status')
        .in('status', ['draft', 'ready_for_signature', 'signed', 'pending_send']),
      // 6. Soumissions acceptées (pour "réservé")
      supabase
        .from('submissions')
        .select('items, status')
        .eq('status', 'accepted')
    ]);

    if (error1) throw error1;
    if (error2) throw error2;

    // Calculer les quantités en commande et réservées par product_id
    const qtyMap = {};

    // En commande: items des AF ordered/partial
    if (afPurchases) {
      afPurchases.forEach(purchase => {
        (purchase.items || []).forEach(item => {
          if (!item.product_id) return;
          if (!qtyMap[item.product_id]) qtyMap[item.product_id] = { onOrder: 0, reserved: 0 };
          qtyMap[item.product_id].onOrder += (parseFloat(item.quantity) || 0);
        });
      });
    }

    // Réservé BT: matériaux des BT non complétés
    if (draftWorkOrders && draftWorkOrders.length > 0) {
      const woIds = draftWorkOrders.map(wo => wo.id);
      const { data: woMaterials } = await supabase
        .from('work_order_materials')
        .select('product_id, quantity')
        .in('work_order_id', woIds);
      if (woMaterials) {
        woMaterials.forEach(m => {
          if (!m.product_id) return;
          if (!qtyMap[m.product_id]) qtyMap[m.product_id] = { onOrder: 0, reserved: 0 };
          qtyMap[m.product_id].reserved += (parseFloat(m.quantity) || 0);
        });
      }
    }

    // Réservé BL: matériaux des BL non envoyés
    if (draftDeliveryNotes && draftDeliveryNotes.length > 0) {
      const blIds = draftDeliveryNotes.map(bl => bl.id);
      const { data: blMaterials } = await supabase
        .from('delivery_note_materials')
        .select('product_id, quantity')
        .in('delivery_note_id', blIds);
      if (blMaterials) {
        blMaterials.forEach(m => {
          if (!m.product_id) return;
          if (!qtyMap[m.product_id]) qtyMap[m.product_id] = { onOrder: 0, reserved: 0 };
          qtyMap[m.product_id].reserved += (parseFloat(m.quantity) || 0);
        });
      }
    }

    // Réservé Soumissions: items des soumissions acceptées
    if (acceptedSubmissions) {
      acceptedSubmissions.forEach(sub => {
        (sub.items || []).forEach(item => {
          if (!item.product_id) return;
          if (!qtyMap[item.product_id]) qtyMap[item.product_id] = { onOrder: 0, reserved: 0 };
          qtyMap[item.product_id].reserved += (parseFloat(item.quantity) || 0);
        });
      });
    }

    // Combiner les résultats avec indicateur de type + quantités
    const combinedResults = [
      ...(inventoryProducts || []).map(item => {
        const qty = qtyMap[item.product_id] || { onOrder: 0, reserved: 0 };
        return { ...item, type: 'inventory', on_order: qty.onOrder, reserved: qty.reserved };
      }),
      ...(nonInventoryProducts || []).map(item => {
        const qty = qtyMap[item.product_id] || { onOrder: 0, reserved: 0 };
        return { ...item, type: 'non_inventory', on_order: qty.onOrder, reserved: qty.reserved };
      })
    ];

    // Trier par description
    combinedResults.sort((a, b) => a.description.localeCompare(b.description));

    return combinedResults;
  } catch (error) {
    console.error('Erreur recherche produits:', error);
    return [];
  }
};

// ===== API SUPABASE - SOUMISSIONS =====

// Récupérer les soumissions envoyées et acceptées
export const fetchAvailableSubmissions = async (clientName = null) => {
  try {
    let query = supabase
      .from('submissions')
      .select('*')
      .in('status', ['sent', 'accepted']);
    
    if (clientName) {
      query = query.eq('client_name', clientName);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Erreur chargement soumissions:', error);
    throw error;
  }
};

// ===== SERVICES PDF =====

// Générer le PDF standardisé de l'achat fournisseur
export const generatePurchasePDF = async (purchase, options = {}) => {
  const { supplier, deliveryAddress } = options;
  const logoBase64 = await getLogoBase64();
  const doc = new jsPDF({ format: 'letter' });

  // === En-tête standardisé ===
  const headerFields = [
    { value: purchase.purchase_number || 'N/A' },
    { label: 'Date:', value: pdfFormatDate(purchase.created_at) },
  ];
  if (purchase.supplier_quote_reference) {
    headerFields.push({ label: 'Soumission:', value: purchase.supplier_quote_reference });
  }
  if (purchase.ba_acomba) {
    headerFields.push({ label: 'BA Acomba:', value: purchase.ba_acomba });
  }
  if (purchase.linked_po_number) {
    headerFields.push({ label: 'BA Client:', value: purchase.linked_po_number });
  }
  if (purchase.delivery_date) {
    headerFields.push({ label: 'Livraison prévue:', value: pdfFormatDate(purchase.delivery_date) });
  }

  let currentY = drawHeader(doc, logoBase64, {
    title: 'BON DE COMMANDE',
    fields: headerFields,
  });

  // === Section Fournisseur / Livrer à ===
  const leftLines = [];
  if (supplier) {
    leftLines.push(supplier.company_name || purchase.supplier_name || 'N/A');
    if (supplier.contact_name) leftLines.push('Contact: ' + supplier.contact_name);
    if (supplier.address) leftLines.push(supplier.address);
    if (supplier.city) leftLines.push(`${supplier.city}, ${supplier.province || ''} ${supplier.postal_code || ''}`);
    if (supplier.country) leftLines.push(supplier.country);
    if (supplier.email) leftLines.push('Email: ' + supplier.email);
    if (supplier.phone) leftLines.push('Tél: ' + supplier.phone);
  } else {
    leftLines.push(purchase.supplier_name || 'N/A');
  }

  const rightLines = [];
  if (deliveryAddress) {
    rightLines.push(deliveryAddress.name || 'Services TMT');
    if (deliveryAddress.address) rightLines.push(deliveryAddress.address);
    if (deliveryAddress.city) rightLines.push(`${deliveryAddress.city}, ${deliveryAddress.province || ''} ${deliveryAddress.postal_code || ''}`);
    if (deliveryAddress.country) rightLines.push(deliveryAddress.country);
  } else {
    rightLines.push('Services TMT');
    rightLines.push('3195 42e Rue Nord');
    rightLines.push('St-Georges, QC G5Z 0V9');
    rightLines.push('Canada');
  }

  currentY = drawTwoColumns(doc, currentY, {
    left: { title: 'Fournisseur:', lines: leftLines },
    right: { title: 'Livrer à :', lines: rightLines },
  });

  // === Tableau des articles ===
  if (purchase.items && purchase.items.length > 0) {
    const columns = [
      { header: 'Code', dataKey: 'code' },
      { header: 'Description', dataKey: 'description' },
      { header: 'Qté', dataKey: 'quantity' },
      { header: 'Unité', dataKey: 'unit' },
      { header: 'Prix Unit.', dataKey: 'unitPrice' },
      { header: 'Total', dataKey: 'total' },
    ];

    const columnStyles = {
      code: { cellWidth: 28, halign: 'left' },
      quantity: { cellWidth: 15, halign: 'center' },
      unit: { cellWidth: 15, halign: 'center' },
      unitPrice: { cellWidth: 25, halign: 'right' },
      total: { cellWidth: 25, halign: 'right' },
    };

    const body = purchase.items.map(item => {
      const qty = parseFloat(item.quantity || 1);
      const unitPrice = parseFloat(item.cost_price || 0);
      const lineTotal = qty * unitPrice;
      const notes = (item.notes && item.notes.trim()) ? '\nNote: ' + item.notes : '';

      return {
        code: item.product_id || '-',
        description: (item.description || '-') + notes,
        quantity: qty.toString(),
        unit: item.unit || 'UN',
        unitPrice: pdfFormatCurrency(unitPrice, 4),
        total: pdfFormatCurrency(lineTotal),
      };
    });

    currentY = drawMaterialsTable(doc, currentY, {
      title: null,
      columns,
      body,
      columnStyles,
    });

    // === Totaux ===
    currentY = drawTotals(doc, currentY, {
      subtotal: parseFloat(purchase.subtotal || 0),
      tps: parseFloat(purchase.tps || 0),
      tvq: parseFloat(purchase.tvq || 0),
      shipping: parseFloat(purchase.shipping_cost || 0),
      total: parseFloat(purchase.total_amount || 0),
    });
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.text('Aucun article disponible', PAGE.margin.left, currentY);
    currentY += 10;
  }

  // === Notes ===
  if (purchase.notes) {
    currentY = drawSectionTitle(doc, 'Notes:', currentY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const noteLines = doc.splitTextToSize(purchase.notes, PAGE.width - PAGE.margin.left - PAGE.margin.right);
    doc.text(noteLines, PAGE.margin.left, currentY);
    currentY += noteLines.length * 4.5 + 5;
  }

  // === Footer standardisé ===
  drawFooter(doc);

  return doc;
};

// Exporter PDF avec différentes options (utilise generatePurchasePDF standardisé)
export const exportPDF = async (action = 'download', purchase, purchaseForm, options = {}) => {
  try {
    const purchaseNumber =
      purchaseForm?.purchase_number ||
      purchase?.purchase_number ||
      'Achat-nouveau';

    // Fusionner les données purchase + purchaseForm
    const pdfData = { ...purchase, ...purchaseForm };
    const doc = await generatePurchasePDF(pdfData, options);

    if (action === 'download') {
      doc.save(`${purchaseNumber}.pdf`);
      return;
    }

    if (action === 'view') {
      const pdfBlob = new Blob([doc.output('arraybuffer')], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(pdfBlob);
      window.open(blobUrl, '_blank');
      return;
    }

    if (action === 'modal') {
      const dataUrl = doc.output('dataurlstring');
      openPdfModal(dataUrl, () => {});
      return;
    }

  } catch (error) {
    console.error('Erreur lors de la génération PDF:', error);
    alert('Erreur lors de la génération du PDF');
  }
};

// Fonction helper pour ouvrir le modal PDF
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

// ===== SERVICES EMAIL =====

// Envoi email à Dominique (utilise le PDF jsPDF standardisé)
export const sendEmailToDominique = async (purchase, pdfDoc) => {
  try {
    // Si pdfDoc n'est pas fourni ou est un Blob (ancien usage), générer le PDF
    let doc = pdfDoc;
    if (!doc || doc instanceof Blob) {
      console.log('📄 Génération du PDF standardisé AF...');
      doc = await generatePurchasePDF(purchase);
    }

    const pdfBase64 = doc.output('dataurlstring').split(',')[1];
    const pdfSizeKB = Math.round((pdfBase64.length * 3) / 4 / 1024);

    console.log(`📧 Envoi email AF - Taille PDF: ${pdfSizeKB} KB`);

    if (pdfSizeKB > 5000) {
      throw new Error(`PDF trop volumineux: ${Math.round(pdfSizeKB / 1024 * 10) / 10} MB`);
    }

    const response = await fetch('/api/send-purchase-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purchase, pdfBase64 }),
    });

    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      throw new Error('Réponse HTML au lieu de JSON');
    }

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || `Erreur ${response.status}`);
    }

    return result;
  } catch (error) {
    console.error('Erreur envoi email AF:', error);
    throw error;
  }
};

// Fonction pour tester l'envoi d'email (développement)
export const testEmailFunction = async () => {
  const testPurchase = {
    id: 'test-123',
    purchase_number: 'TEST-001',
    supplier_name: 'Fournisseur Test',
    total_amount: 1250.00,
    subtotal: 1000.00,
    tps: 50.00,
    tvq: 99.75,
    shipping_cost: 100.25,
    status: 'ordered',
    created_at: new Date().toISOString(),
    delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    linked_po_number: 'PO-2025-001',
    supplier_quote_reference: 'QTE-2025-456',
    ba_acomba: 'BA-TEST-001', // NOUVEAU CHAMP
    notes: 'Ceci est un test d\'envoi d\'email automatique.',
    items: [
      {
        product_id: 'TEST-001',
        description: 'Article de test',
        quantity: 5,
        unit: 'unité',
        cost_price: 100.00
      },
      {
        product_id: 'TEST-002', 
        description: 'Deuxième article test',
        quantity: 10,
        unit: 'mètre',
        cost_price: 50.00
      }
    ]
  };

  try {
    const pdf = await generatePurchasePDF(testPurchase);
    await sendEmailToDominique(testPurchase, pdf);
  } catch (error) {
    console.error('Erreur test email:', error);
    throw error;
  }
};
