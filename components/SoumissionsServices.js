// components/SoumissionsServices.js
// INSTRUCTION : Créez ce fichier dans /components/SoumissionsServices.js

import { supabase } from '../lib/supabase';

// ===== CONSTANTES =====
export const SUBMISSION_STATUS = {
  DRAFT: 'draft',
  SENT: 'sent',
  ACCEPTED: 'accepted'
};

export const SUBMISSION_STATUS_LABELS = {
  [SUBMISSION_STATUS.DRAFT]: '📝 Brouillon',
  [SUBMISSION_STATUS.SENT]: '📤 Envoyée', 
  [SUBMISSION_STATUS.ACCEPTED]: '✅ Acceptée'
};

export const PROFIT_MARGINS = [
  { value: 15, label: '+15%', color: 'green' },
  { value: 20, label: '+20%', color: 'blue' },
  { value: 25, label: '+25%', color: 'purple' }
];

export const DEFAULT_UNITS = ['Un', 'M', 'PI', 'L', 'H'];

export const SEARCH_CONFIG = {
  MIN_SEARCH_LENGTH: 2,
  DEBOUNCE_DELAY: 300,
  MAX_RESULTS: 50
};

export const FILE_CONFIG = {
  ALLOWED_TYPES: '.pdf,.xls,.xlsx,.doc,.docx,.txt,.png,.jpg,.jpeg',
  MAX_SIZE_MB: 5,
  UPLOAD_PATH: 'submissions'
};

// ===== UTILITAIRES =====
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD'
  }).format(amount || 0);
};

export const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('fr-CA');
};

export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const getFileIcon = (fileType) => {
  if (fileType?.includes('pdf')) return '📄';
  if (fileType?.includes('excel') || fileType?.includes('sheet')) return '📊';
  if (fileType?.includes('word') || fileType?.includes('document')) return '📝';
  if (fileType?.includes('image')) return '🖼️';
  return '📎';
};

// ===== GÉNÉRATION NUMÉRO SOUMISSION =====
export const generateSubmissionNumber = async () => {
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
        return `${yearMonth}-${nextSequence}`;
      }
    }
    
    return `${yearMonth}-001`;
  } catch (error) {
    console.error('Erreur génération numéro:', error);
    return `${yearMonth}-001`;
  }
};

// ===== API SOUMISSIONS =====
export const fetchSoumissions = async () => {
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Erreur lors du chargement des soumissions:', error);
    return [];
  }
};

export const createSubmission = async (submissionData) => {
  try {
    const { error } = await supabase
      .from('submissions')
      .insert([submissionData]);
    
    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Erreur création soumission:', error);
    throw error;
  }
};

export const updateSubmission = async (id, submissionData) => {
  try {
    const { error } = await supabase
      .from('submissions')
      .update(submissionData)
      .eq('id', id);
    
    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Erreur mise à jour soumission:', error);
    throw error;
  }
};

export const deleteSubmission = async (id) => {
  try {
    // Récupérer les fichiers avant suppression
    const { data: submissionData } = await supabase
      .from('submissions')
      .select('files')
      .eq('id', id)
      .single();

    const { error } = await supabase
      .from('submissions')
      .delete()
      .eq('id', id);
    
    if (error) throw error;

    // Nettoyer les fichiers
    if (submissionData?.files) {
      await cleanupFilesForSubmission(submissionData.files);
    }

    return { success: true };
  } catch (error) {
    console.error('Erreur suppression soumission:', error);
    throw error;
  }
};

// ===== API CLIENTS =====
export const fetchClients = async () => {
  try {
    const { data: clientsData, error: clientsError } = await supabase
      .from('clients')
      .select('*')
      .order('name', { ascending: true });

    if (!clientsError && clientsData) {
      return clientsData;
    }

    // Fallback: récupérer les clients depuis les soumissions existantes
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

    return uniqueClients;
  } catch (error) {
    console.error('Erreur lors du chargement des clients:', error);
    return [];
  }
};

// ===== API PRODUITS =====
export const searchProductsWithNonInventory = async (searchTerm) => {
  if (!searchTerm || searchTerm.length < SEARCH_CONFIG.MIN_SEARCH_LENGTH) {
    return [];
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
    return allProducts;

  } catch (error) {
    console.error('❌ Erreur recherche combinée:', error);
    return [];
  }
};

export const saveNonInventoryProduct = async (productData) => {
  try {
    const nonInventoryData = {
      product_id: productData.product_id,
      description: productData.description,
      selling_price: parseFloat(productData.selling_price),
      cost_price: parseFloat(productData.cost_price),
      unit: productData.unit,
      product_group: productData.product_group || 'Non-Inventaire'
    };

    console.log('💾 Sauvegarde dans non_inventory_items:', nonInventoryData);

    const { data: existingItem, error: checkError } = await supabase
      .from('non_inventory_items')
      .select('*')
      .eq('product_id', productData.product_id)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }

    let result;
    if (existingItem) {
      const { data, error } = await supabase
        .from('non_inventory_items')
        .update(nonInventoryData)
        .eq('product_id', productData.product_id)
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
      return {
        ...result[0],
        is_non_inventory: true,
        stock_qty: 0
      };
    }
    
    return null;
  } catch (error) {
    console.error('❌ Erreur sauvegarde:', error);
    throw error;
  }
};

// ===== TAUX DE CHANGE =====
export const fetchExchangeRate = async () => {
  try {
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const data = await response.json();
    
    if (data && data.rates && data.rates.CAD) {
      return data.rates.CAD;
    } else {
      throw new Error('Taux CAD non trouvé');
    }
  } catch (error) {
    console.error('Erreur récupération taux de change:', error);
    return 1.35; // Taux par défaut
  }
};

export const convertUsdToCad = (usdAmount, rate) => {
  return parseFloat(usdAmount) * rate;
};

// ===== GESTION FICHIERS =====
export const uploadFile = async (file) => {
  try {
    const cleanFileName = file.name
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .substring(0, 100);

    const fileName = `${Date.now()}_${cleanFileName}`;
    const filePath = `${FILE_CONFIG.UPLOAD_PATH}/${fileName}`;

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

    return {
      name: file.name,
      cleanName: cleanFileName,
      size: file.size,
      type: file.type,
      path: data.path,
      url: urlData.publicUrl,
      uploaded_at: new Date().toISOString()
    };
  } catch (error) {
    console.error('Erreur upload fichier:', error);
    throw error;
  }
};

export const deleteFile = async (filePath) => {
  try {
    const { error } = await supabase.storage
      .from('submissions-files')
      .remove([filePath]);
    
    if (error) {
      console.error('Erreur suppression fichier:', error);
    }
  } catch (error) {
    console.error('Erreur suppression fichier:', error);
  }
};

export const cleanupFilesForSubmission = async (files) => {
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

// ===== GÉNÉRATION PDF =====
export const generateSubmissionPDF = async () => {
  try {
    const html2canvas = (await import('html2canvas')).default;
    const jsPDF = (await import('jspdf')).default;
    
    const printContainer = document.querySelector('.print-area-client');
    if (!printContainer) {
      throw new Error('Zone d\'impression client non trouvée');
    }

    console.log('Génération du PDF professionnel...');
    
    const printStyles = document.createElement('style');
    printStyles.textContent = `
      .temp-print-view * { visibility: visible !important; }
      .temp-print-view {
        position: fixed !important;
        left: -9999px !important; 
        top: 0 !important;
        width: 1024px !important;
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

    await new Promise(resolve => setTimeout(resolve, 300));

    const canvas = await html2canvas(clonedContainer, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: 1024,
      height: clonedContainer.scrollHeight,
      windowWidth: 1024,
      windowHeight: clonedContainer.scrollHeight + 100,
      allowTaint: true,
      imageTimeout: 15000
    });

    document.body.removeChild(clonedContainer);
    document.head.removeChild(printStyles);

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

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const imgWidth = usableWidth;
    const imgHeight = canvas.height * (imgWidth / canvas.width);

    if (imgHeight <= usableHeight) {
      pdf.addImage(imgData, 'JPEG', margin, margin, imgWidth, imgHeight);
    } else {
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

    return pdfBase64;
    
  } catch (error) {
    console.error('Erreur génération PDF:', error);
    throw error;
  }
};

// ===== ENVOI EMAIL =====
export const sendSubmissionEmail = async (emailData) => {
  try {
    const response = await fetch('/api/send-submission-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailData)
    });

    if (response.ok) {
      const result = await response.json();
      return { success: true, result };
    } else {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Erreur lors de l\'envoi');
    }
  } catch (error) {
    console.error('❌ Erreur envoi email:', error);
    throw error;
  }
};

export const sendWeeklyReport = async () => {
  try {
    const response = await fetch('/api/send-weekly-report', {
      method: 'GET'
    });

    if (response.ok) {
      const result = await response.json();
      return { success: true, result };
    } else {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Erreur inconnue');
    }
  } catch (error) {
    console.error('Erreur lors de l\'envoi:', error);
    throw error;
  }
};
