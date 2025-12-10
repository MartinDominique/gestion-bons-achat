import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import 'jspdf-autotable';
import { supabase } from '../lib/supabase';

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

// Recherche produits
export const searchProducts = async (searchTerm) => {
  if (!searchTerm || searchTerm.length < 2) {
    return [];
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

// Générer le PDF de l'achat fournisseur
export const generatePurchasePDF = (purchase) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  
  // En-tête du document
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('ACHAT FOURNISSEUR', pageWidth / 2, 20, { align: 'center' });
  
  doc.setFontSize(16);
  doc.text(`N° ${purchase.purchase_number}`, pageWidth / 2, 30, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${new Date(purchase.created_at).toLocaleDateString('fr-FR')}`, pageWidth / 2, 40, { align: 'center' });
  
  // Ligne de séparation
  doc.setLineWidth(0.5);
  doc.line(10, 45, pageWidth - 10, 45);
  
  // Informations fournisseur
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('FOURNISSEUR:', 15, 60);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(purchase.supplier_name || 'N/A', 15, 70);
  
  // Informations de base
  const startY = 85;
  doc.text(`Date création: ${new Date(purchase.created_at).toLocaleDateString('fr-FR')}`, 15, startY);
  
  if (purchase.delivery_date) {
    doc.text(`Date livraison: ${new Date(purchase.delivery_date).toLocaleDateString('fr-FR')}`, 15, startY + 8);
  }
  
  doc.text(`Statut: ${PURCHASE_STATUSES[purchase.status] || purchase.status}`, 15, startY + 16);
  
  // NOUVEAU - BA Acomba
  if (purchase.ba_acomba) {
    doc.text(`BA Acomba: ${purchase.ba_acomba}`, 15, startY + 24);
  }
  
  // Référence soumission fournisseur
  if (purchase.supplier_quote_reference) {
    const yPos = purchase.ba_acomba ? startY + 32 : startY + 24;
    doc.text(`Réf. Soumission: ${purchase.supplier_quote_reference}`, 15, yPos);
  }
  
  // Lien avec bon d'achat client si existant
  if (purchase.linked_po_number) {
    const yPos = purchase.supplier_quote_reference ? 
      (purchase.ba_acomba ? startY + 45 : startY + 35) : 
      (purchase.ba_acomba ? startY + 35 : startY + 35);
    
    doc.setFillColor(230, 240, 255);
    doc.rect(10, yPos, pageWidth - 20, 20, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text('LIEN AVEC BON D\'ACHAT CLIENT:', 15, yPos + 10);
    doc.setFont('helvetica', 'normal');
    doc.text(`N° Bon d'achat: ${purchase.linked_po_number}`, 15, yPos + 17);
  }
  
  // Tableau des articles
  const itemsStartY = purchase.linked_po_number ? 
    (purchase.supplier_quote_reference ? 
      (purchase.ba_acomba ? startY + 75 : startY + 65) : 
      (purchase.ba_acomba ? startY + 65 : startY + 65)
    ) : 
    (purchase.supplier_quote_reference ? 
      (purchase.ba_acomba ? startY + 55 : startY + 45) : 
      (purchase.ba_acomba ? startY + 45 : startY + 45)
    );
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('DÉTAIL DES ARTICLES:', 15, itemsStartY);
  
  if (purchase.items && purchase.items.length > 0) {
    const tableData = purchase.items.map(item => {
      const quantity = parseFloat(item.quantity || 1);
      const unitPrice = parseFloat(item.cost_price || 0);
      const lineTotal = quantity * unitPrice;
      
      return [
        item.product_id || '-',
        item.description || '-',
        quantity.toString(),
        item.unit || 'UN',
        `$${unitPrice.toFixed(4)}`,
        `$${lineTotal.toFixed(2)}`
      ];
    });
    
    doc.autoTable({
      startY: itemsStartY + 10,
      head: [['Code', 'Description', 'Qté', 'Unité', 'Prix Unit.', 'Total']],
      body: tableData,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [70, 130, 180] },
      margin: { left: 15, right: 15 }
    });
    
    // Totaux
    const finalY = doc.lastAutoTable.finalY + 10;
    
    doc.setFont('helvetica', 'bold');
    doc.text('Sous-total:', pageWidth - 80, finalY);
    doc.text(`$${parseFloat(purchase.subtotal || 0).toFixed(2)}`, pageWidth - 15, finalY, { align: 'right' });
    
    if (parseFloat(purchase.tps || 0) > 0) {
      doc.text('TPS (5%):', pageWidth - 80, finalY + 8);
      doc.text(`$${parseFloat(purchase.tps || 0).toFixed(2)}`, pageWidth - 15, finalY + 8, { align: 'right' });
    }
    
    if (parseFloat(purchase.tvq || 0) > 0) {
      doc.text('TVQ (9.975%):', pageWidth - 80, finalY + 16);
      doc.text(`$${parseFloat(purchase.tvq || 0).toFixed(2)}`, pageWidth - 15, finalY + 16, { align: 'right' });
    }
    
    if (parseFloat(purchase.shipping_cost || 0) > 0) {
      doc.text('Livraison:', pageWidth - 80, finalY + 24);
      doc.text(`$${parseFloat(purchase.shipping_cost || 0).toFixed(2)}`, pageWidth - 15, finalY + 24, { align: 'right' });
    }
    
    // Ligne de séparation
    const totalLineY = finalY + 32;
    doc.setLineWidth(1);
    doc.line(pageWidth - 80, totalLineY, pageWidth - 15, totalLineY);
    
    doc.setFontSize(14);
    doc.text('TOTAL GÉNÉRAL:', pageWidth - 80, totalLineY + 10);
    doc.text(`$${parseFloat(purchase.total_amount || 0).toFixed(2)}`, pageWidth - 15, totalLineY + 10, { align: 'right' });
    
    // Notes si présentes
    if (purchase.notes) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Notes:', 15, totalLineY + 25);
      doc.setFont('helvetica', 'normal');
      doc.text(purchase.notes, 15, totalLineY + 35, { maxWidth: pageWidth - 30 });
    }
  } else {
    doc.setFont('helvetica', 'italic');
    doc.text('Aucun article disponible', 15, itemsStartY + 15);
  }
  
  return doc;
};

// Exporter PDF avec différentes options
export const exportPDF = async (action = 'download', purchase, purchaseForm) => {
  try {
    const printContainer = document.querySelector('.print-container');
    if (!printContainer) {
      alert("Aucun contenu à exporter.");
      return;
    }

    const purchaseNumber =
      purchaseForm?.purchase_number ||
      purchase?.purchase_number ||
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

// Envoi email à Dominique
export const sendEmailToDominique = async (purchase, pdfBlob) => {
  try {
    const printContainer = document.querySelector('.print-container');
    if (!printContainer) {
      throw new Error('Conteneur d\'impression non trouvé');
    }

    console.log('Génération du PDF professionnel...');
    
    // Styles d'impression améliorés
    const printStyles = document.createElement('style');
    printStyles.textContent = `
      .temp-print-view * { visibility: visible !important; }
      .temp-print-view {
        position: fixed !important;
        left: -9999px !important; 
        top: 0 !important;
        width: 1024px !important; /* Largeur fixe plus grande */
        background: #fff !important;
        padding: 48px !important;
        font-size: 14px !important;
        line-height: 1.5 !important;
        font-family: Arial, sans-serif !important;
        box-sizing: border-box !important;
      }
      .temp-print-view table { 
        width: 100% !important; 
        border-collapse: collapse !important; 
        margin: 20px 0 !important;
      }
      .temp-print-view th, .temp-print-view td {
        border: 1px solid #000 !important; 
        padding: 12px !important; 
        text-align: left !important;
        font-size: 12px !important;
      }
      .temp-print-view th { 
        background-color: #f0f0f0 !important; 
        font-weight: bold !important;
      }
      .temp-print-view .text-right {
        text-align: right !important;
      }
      .temp-print-view .text-center {
        text-align: center !important;
      }
      .temp-print-view h1, .temp-print-view h2, .temp-print-view h3 {
        margin: 10px 0 !important;
      }
    `;
    document.head.appendChild(printStyles);

    const clonedContainer = printContainer.cloneNode(true);
    clonedContainer.className = 'temp-print-view';
    clonedContainer.style.visibility = 'visible';
    clonedContainer.style.display = 'block';
    document.body.appendChild(clonedContainer);

    // Attendre plus longtemps pour le rendu
    await new Promise(resolve => setTimeout(resolve, 300));

    // Capture avec meilleure qualité
    const canvas = await html2canvas(clonedContainer, {
      scale: 2, // Qualité élevée
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: 1024, // Largeur fixe
      height: clonedContainer.scrollHeight,
      windowWidth: 1024,
      windowHeight: clonedContainer.scrollHeight + 100,
      allowTaint: true,
      imageTimeout: 15000
    });

    // Nettoyage
    document.body.removeChild(clonedContainer);
    document.head.removeChild(printStyles);

    // PDF avec meilleure résolution
    const pdf = new jsPDF({ 
      unit: 'pt', 
      format: 'letter',
      compress: true
    });
    
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 50;
    const usableWidth = pageWidth - (margin * 2);
    const usableHeight = pageHeight - (margin * 2);

    // Conversion en JPEG avec qualité élevée
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const imgWidth = usableWidth;
    const imgHeight = canvas.height * (imgWidth / canvas.width);

    if (imgHeight <= usableHeight) {
      // Une seule page
      pdf.addImage(imgData, 'JPEG', margin, margin, imgWidth, imgHeight);
    } else {
      // Pagination
      let heightLeft = imgHeight;
      let positionY = 0;

      while (heightLeft > 0) {
        if (positionY > 0) pdf.addPage();

        pdf.addImage(
          imgData,
          'JPEG',
          margin,
          margin + positionY,
          imgWidth,
          imgHeight
        );

        heightLeft -= usableHeight;
        positionY -= usableHeight;
      }
    }

    const pdfBase64 = pdf.output('dataurlstring').split(',')[1];
    const pdfSizeKB = Math.round((pdfBase64.length * 3) / 4 / 1024);
    
    console.log(`Taille PDF: ${pdfSizeKB} KB`);
    
    if (pdfSizeKB > 5000) {
      throw new Error(`PDF trop volumineux: ${Math.round(pdfSizeKB/1024 * 10)/10} MB`);
    }

    const response = await fetch('/api/send-purchase-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        purchase,
        pdfBase64
      })
    });

    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      const htmlResponse = await response.text();
      throw new Error('Réponse HTML au lieu de JSON');
    }

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || `Erreur ${response.status}`);
    }

    return result;
    
  } catch (error) {
    console.error('Erreur envoi email:', error);
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
    const pdf = generatePurchasePDF(testPurchase);
    const pdfBlob = pdf.output('blob');
    await sendEmailToDominique(testPurchase, pdfBlob);
  } catch (error) {
    console.error('Erreur test email:', error);
    throw error;
  }
};
