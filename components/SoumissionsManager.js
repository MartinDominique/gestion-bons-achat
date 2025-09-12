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
  
  const [editingSubmission, setEditingSubmission] = useState(null);
  const [editingClient, setEditingClient] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sendingReport, setSendingReport] = useState(false);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(null);
  
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

  // ===== NOUVELLES FONCTIONS .EML (REMPLACEMENT DE L'EMAIL DÉFAILLANT) =====

  // Fonction pour générer spécifiquement le PDF CLIENT
  const generateClientSubmissionPDF = async () => {
    try {
      const html2canvas = (await import('html2canvas')).default;
      const jsPDF = (await import('jspdf')).default;
      
      const printContainer = document.querySelector('.print-area-client');
      if (!printContainer) {
        throw new Error('Zone d\'impression client non trouvée');
      }

      console.log('Génération du PDF CLIENT (sans coûts)...');
      
      const printStyles = document.createElement('style');
      printStyles.textContent = `
        .temp-client-print-view * { visibility: visible !important; }
        .temp-client-print-view {
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
        .temp-client-print-view table { 
          width: 100% !important; 
          border-collapse: collapse !important; 
          margin: 20px 0 !important;
        }
        .temp-client-print-view th, .temp-client-print-view td {
          border: 1px solid #000 !important; 
          padding: 12px !important; 
          text-align: left !important;
          font-size: 12px !important;
        }
        .temp-client-print-view th { 
          background-color: #f0f0f0 !important; 
          font-weight: bold !important;
        }
        .temp-client-print-view .text-right {
          text-align: right !important;
        }
        .temp-client-print-view .text-center {
          text-align: center !important;
        }
        .temp-client-print-view h1, .temp-client-print-view h2, .temp-client-print-view h3 {
          margin: 10px 0 !important;
        }
      `;
      document.head.appendChild(printStyles);

      const clonedContainer = printContainer.cloneNode(true);
      clonedContainer.className = 'temp-client-print-view';
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
          pdf.addImage(imgData, 'JPEG', margin, margin + positionY, imgWidth, imgHeight);
          heightLeft -= usableHeight;
          positionY -= usableHeight;
        }
      }

      return pdf.output('arraybuffer');
      
    } catch (error) {
      console.error('Erreur génération PDF client:', error);
      throw error;
    }
  };

  // Fonction pour encoder en Base64
  const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    let binary = '';
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  // Fonction pour générer le contenu .EML
  const generateEMLContent = (options) => {
    const {
      destinataire,
      sujet,
      message,
      nomFichier,
      pdfBase64,
      nomComplet = "Services TMT Inc."
    } = options;

    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const date = new Date().toUTCString();

    return `From: ${nomComplet} <info.servicestmt@gmail.com>
To: ${destinataire}
Subject: ${sujet}
Date: ${date}
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="${boundary}"

--${boundary}
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: quoted-printable

${message}

--${boundary}
Content-Type: application/pdf
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="${nomFichier}"

${pdfBase64}

--${boundary}--`;
  };

  // Fonction principale pour créer et télécharger le fichier .EML
  const envoyerSoumissionParEML = async () => {
    if (!submissionForm.client_name) {
      alert('⚠️ Veuillez sélectionner un client avant d\'envoyer');
      return;
    }

    if (selectedItems.length === 0) {
      alert('⚠️ Veuillez ajouter au moins un produit avant d\'envoyer');
      return;
    }

    const client = clients.find(c => c.name === submissionForm.client_name);
    if (!client || !client.email) {
      alert('⚠️ Aucun email trouvé pour ce client. Veuillez vérifier les informations du client.');
      return;
    }

    try {
      console.log('🔄 Génération du PDF client pour email...');
      
      const pdfArrayBuffer = await generateClientSubmissionPDF();
      const pdfBase64 = arrayBufferToBase64(pdfArrayBuffer);
      
      const nomFichier = `Soumission_${submissionForm.submission_number}.pdf`;
      const sujet = `Soumission ${submissionForm.submission_number} - Services TMT Inc.`;
      
      const sousTotal = submissionForm.amount;
      const tps = sousTotal * 0.05;
      const tvq = sousTotal * 0.09975;
      const total = sousTotal + tps + tvq;
      
      const messageHTML = `
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4F46E5; border-bottom: 2px solid #4F46E5; padding-bottom: 10px;">
              Soumission ${submissionForm.submission_number}
            </h2>
            
            <p>Bonjour,</p>
            
            <p>Veuillez trouver ci-joint notre soumission pour :</p>
            <p style="background-color: #F3F4F6; padding: 15px; border-left: 4px solid #4F46E5; margin: 15px 0;">
              <strong>${submissionForm.description}</strong>
            </p>
            
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr>
                <td style="padding: 10px; border: 1px solid #E5E7EB;"><strong>Sous-total:</strong></td>
                <td style="padding: 10px; border: 1px solid #E5E7EB; text-align: right;">${formatCurrency(sousTotal)}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #E5E7EB;"><strong>TPS (5%):</strong></td>
                <td style="padding: 10px; border: 1px solid #E5E7EB; text-align: right;">${formatCurrency(tps)}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border: 1px solid #E5E7EB;"><strong>TVQ (9.975%):</strong></td>
                <td style="padding: 10px; border: 1px solid #E5E7EB; text-align: right;">${formatCurrency(tvq)}</td>
              </tr>
              <tr style="background-color: #F3F4F6; font-weight: bold;">
                <td style="padding: 10px; border: 1px solid #E5E7EB;"><strong>TOTAL:</strong></td>
                <td style="padding: 10px; border: 1px solid #E5E7EB; text-align: right; color: #059669;">${formatCurrency(total)}</td>
              </tr>
            </table>
            
            <div style="background-color: #FEF3C7; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0;"><strong>📋 Détails:</strong></p>
              <ul style="margin: 10px 0;">
                <li>Nombre d'articles: ${selectedItems.length}</li>
                <li>Validité: 30 jours</li>
                <li>Paiement: Net 30 jours</li>
              </ul>
            </div>
            
            <p>N'hésitez pas à nous contacter pour toute question ou précision.</p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #E5E7EB;">
              <p><strong>Services TMT Inc.</strong></p>
              <p style="margin: 5px 0;">📞 (418) 225-3875</p>
              <p style="margin: 5px 0;">📧 info.servicestmt@gmail.com</p>
              <p style="margin: 5px 0;">📍 3195, 42e Rue Nord, Saint-Georges, QC G5Z 0V9</p>
            </div>
            
            <p style="font-size: 12px; color: #6B7280; margin-top: 20px;">
              Merci de votre confiance !
            </p>
          </div>
        </body>
        </html>
      `;

      const emlContent = generateEMLContent({
        destinataire: client.email,
        sujet: sujet,
        message: messageHTML,
        nomFichier: nomFichier,
        pdfBase64: pdfBase64
      });

      const blob = new Blob([emlContent], { type: 'message/rfc822' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `Email_Soumission_${submissionForm.submission_number}.eml`;
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      URL.revokeObjectURL(url);

      alert(`✅ Fichier email créé !\n\n📧 Destinataire: ${client.email}\n📄 Fichier: ${a.download}\n\n💡 Double-cliquez sur le fichier téléchargé pour ouvrir eM Client avec tout pré-rempli.`);

    } catch (error) {
      console.error('❌ Erreur création email:', error);
      alert(`❌ Erreur: ${error.message}`);
    }
  };

  // ===== RESTE DES FONCTIONS EXISTANTES =====

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
        product_id: quickProductForm.product_id,
        description: quickProductForm.description,
        selling_price: parseFloat(quickProductForm.selling_price),
        cost_price: parseFloat(quickProductForm.cost_price),
        unit: quickProductForm.unit,
        product_group: quickProductForm.product_group || 'Non-Inventaire'
      };

      console.log('💾 Sauvegarde dans non_inventory_items:', nonInventoryData);

      const { data: existingItem, error: checkError } = await supabase
        .from('non_inventory_items')
        .select('*')
        .eq('product_id', quickProductForm.product_id)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      let result;
      if (existingItem) {
        const { data, error } = await supabase
          .from('non_inventory_items')
          .update(nonInventoryData)
          .eq('product_id', quickProductForm.product_id)
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
        alert('✅ Produit non-inventaire sauvegardé !');
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
  submission_number: '',
  files: []
});
      setCalculatedCostTotal(0);
    } catch (error) {
      console.error('Erreur sauvegarde:', error.message);
    }
  };

  const handlePrint = () => {
  // Sauvegarder le titre original
  const originalTitle = document.title;
  // Changer le titre pour l'impression
  document.title = `Soumission ${submissionForm.submission_number}`;
  
  window.print();
  
  // Restaurer le titre original après impression
  setTimeout(() => {
    document.title = originalTitle;
  }, 100);
};

const handlePrintClient = () => {
  // Sauvegarder le titre original
  const originalTitle = document.title;
  // Changer le titre pour l'impression
  document.title = `Soumission ${submissionForm.submission_number}`;
  
  // Ajouter classe temporaire pour impression client
  document.body.classList.add('print-client');
  window.print();
  
  // Retirer la classe et restaurer le titre après impression
  setTimeout(() => {
    document.body.classList.remove('print-client');
    document.title = originalTitle;
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
              margin: 0.4in 0.6in 0.8in 0.6in; /* bottom margin plus grand pour footer */
              @bottom-center {
                content: "Pour toute question: (418) 225-3875 • Services TMT Inc. • info.servicestmt@gmail.com";
                font-size: 8px;
                color: #666;
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
              width: 140px !important;
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
              {/* En-tête professionnel amélioré */}
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

              {/* Totaux avec taxes - Version qui fonctionne */}
              <div style={{ marginTop: '30px', borderTop: '2px solid #000', paddingTop: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  
                  {/* Conditions à gauche */}
                  <div style={{ flex: 1, fontSize: '9px', marginRight: '20px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>CONDITIONS GÉNÉRALES:</div>
                    <div>• Prix valides pour 30 jours</div>
                    <div>• Paiement: Net 30 jours</div>
                    <div>• Installation selon disponibilité</div>
                    <div>• Prix sujets à changement sans préavis</div>
                  </div>
                  
                  {/* Totaux avec taxes à droite */}
                  <div style={{ minWidth: '250px', fontSize: '12px' }}>
                    {(() => {
                      const sousTotal = submissionForm.amount;
                      const tps = sousTotal * 0.05;
                      const tvq = sousTotal * 0.09975;
                      const total = sousTotal + tps + tvq;
                      
                      return (
                        <div>
                          <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            marginBottom: '5px',
                            paddingBottom: '3px'
                          }}>
                            <span>Sous-total:</span>
                            <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                              {formatCurrency(sousTotal)}
                            </span>
                          </div>
                          
                          <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            marginBottom: '5px',
                            paddingBottom: '3px'
                          }}>
                            <span>TPS (5%):</span>
                            <span style={{ fontFamily: 'monospace' }}>
                              {formatCurrency(tps)}
                            </span>
                          </div>
                          
                          <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            marginBottom: '10px',
                            paddingBottom: '5px'
                          }}>
                            <span>TVQ (9.975%):</span>
                            <span style={{ fontFamily: 'monospace' }}>
                              {formatCurrency(tvq)}
                            </span>
                          </div>
                          
                          <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            borderTop: '2px solid #000', 
                            paddingTop: '8px',
                            fontWeight: 'bold',
                            fontSize: '16px'
                          }}>
                            <span>TOTAL:</span>
                            <span style={{ fontFamily: 'monospace' }}>
                              {formatCurrency(total)}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
                
                {/* Contact en bas */}
                <div style={{ 
                  marginTop: '20px', 
                  paddingTop: '10px', 
                  borderTop: '1px solid #000',
                  textAlign: 'center',
                  fontSize: '9px'
                }}>
                </div>
              </div>
            </div>
          )}

          {/* VERSION CLIENT SANS COÛTS - Zone d'impression */}
          {selectedItems.length > 0 && (
            <div className="print-area-client">
              {/* En-tête professionnel */}
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

                {/* Totaux avec taxes pour client - Version directe */}
              <div style={{ marginTop: '30px', borderTop: '2px solid #000', paddingTop: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  
                  {/* Conditions à gauche */}
                  <div style={{ flex: 1, fontSize: '9px', marginRight: '20px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>CONDITIONS GÉNÉRALES:</div>
                    <div>• Prix valides pour 30 jours</div>
                    <div>• Paiement: Net 30 jours</div>
                    <div>• Installation selon disponibilité</div>
                    <div>• Prix sujets à changement sans préavis</div>
                  </div>
                  
                  {/* Totaux avec taxes à droite */}
                  <div style={{ minWidth: '250px', fontSize: '12px' }}>
                    {(() => {
                      const sousTotal = submissionForm.amount;
                      const tps = sousTotal * 0.05;
                      const tvq = sousTotal * 0.09975;
                      const total = sousTotal + tps + tvq;
                      
                      return (
                        <div>
                          <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            marginBottom: '5px',
                            paddingBottom: '3px'
                          }}>
                            <span>Sous-total:</span>
                            <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                              {formatCurrency(sousTotal)}
                            </span>
                          </div>
                          
                          <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            marginBottom: '5px',
                            paddingBottom: '3px'
                          }}>
                            <span>TPS (5%):</span>
                            <span style={{ fontFamily: 'monospace' }}>
                              {formatCurrency(tps)}
                            </span>
                          </div>
                          
                          <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            marginBottom: '10px',
                            paddingBottom: '5px'
                          }}>
                            <span>TVQ (9.975%):</span>
                            <span style={{ fontFamily: 'monospace' }}>
                              {formatCurrency(tvq)}
                            </span>
                          </div>
                          
                          <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            borderTop: '2px solid #000', 
                            paddingTop: '8px',
                            fontWeight: 'bold',
                            fontSize: '16px'
                          }}>
                            <span>TOTAL:</span>
                            <span style={{ fontFamily: 'monospace' }}>
                              {formatCurrency(total)}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Validité */}
              <div className="print-validity">
                ⏰ Cette soumission est valide pour 30 jours • Merci de votre confiance!
              </div>

              {/* Footer client */}
              <div className="print-footer">
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                    Pour toute question, n'hésitez pas à nous contacter au (418) 225-3875
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* FORMULAIRE SOUMISSION MOBILE-FRIENDLY */}
          <div className="bg-white rounded-xl shadow-lg border border-purple-200 overflow-hidden">
            
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
                    🖨️ Imprimer
                  </button>
                  <button
                    onClick={handlePrintClient}
                    className="w-full sm:w-auto px-4 py-2 bg-green-500/20 rounded-lg hover:bg-green-500/30 text-sm font-medium"
                  >
                    <Printer className="w-4 h-4 inline mr-1" />
                    Impression Client
                  </button>
                  
                  {/* NOUVEAU: Bouton .EML qui remplace l'email défaillant */}
                  <button
                    onClick={envoyerSoumissionParEML}
                    disabled={selectedItems.length === 0 || !submissionForm.client_name}
                    className={`w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center ${
                      selectedItems.length === 0 || !submissionForm.client_name
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-500/20 hover:bg-blue-500/30 text-white'
                    }`}
                    title={
                      !submissionForm.client_name 
                        ? 'Sélectionnez un client d\'abord'
                        : selectedItems.length === 0 
                        ? 'Ajoutez des produits d\'abord'
                        : 'Créer email .EML pour eM Client'
                    }
                  >
                    📧 Email Client
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
            <div className="p-4 sm:p-6 no-print">
              <form id="submission-form" onSubmit={handleSubmissionSubmit} className="space-y-6">
                
                {/* Client et Description - Stack sur mobile */}
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

                {/* Statut pour édition */}
                {editingSubmission && (
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <label className="block text-sm font-semibold text-gray-800 mb-2">
                      🏷️ Statut
                    </label>
                    <select
                      value={submissionForm.status}
                      onChange={(e) => setSubmissionForm({...submissionForm, status: e.target.value})}
                      className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base p-3"
                    >
                      <option value="draft">📝 Brouillon</option>
                      <option value="sent">📤 Envoyée</option>
                      <option value="accepted">✅ Acceptée</option>
                    </select>
                  </div>
                )}

                {/* Section recherche produits MOBILE-FRIENDLY */}
                <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                  <h3 className="text-base sm:text-lg font-semibold text-indigo-800 mb-4">
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
                          className="block w-full pl-10 pr-4 py-3 rounded-lg border-indigo-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base"
                          autoComplete="off"
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
                      <span className="text-indigo-600">Recherche en cours...</span>
                    </div>
                  )}
                  
                  {productSearchTerm && productSearchTerm.length < 2 && !searchingProducts && (
                    <div className="p-4 text-center text-gray-500 border border-gray-200 rounded-lg">
                      Tapez au moins 2 caractères pour rechercher dans les 6718 produits
                    </div>
                  )}
                  
                  {productSearchTerm.length >= 2 && !searchingProducts && (
                    <div className="max-h-60 overflow-y-auto border border-indigo-200 rounded-lg">
                      {products.length === 0 ? (
                        <div className="p-4 text-center text-gray-500">
                          Aucun produit trouvé pour "{productSearchTerm}"
                          <br />
                          <span className="text-xs">Essayez avec d'autres mots-clés</span>
                        </div>
                      ) : (
                        <>
                          <div className="p-2 bg-gray-50 text-xs text-gray-600 border-b">
                            {products.length} résultat(s) trouvé(s) {products.length === 50 ? '(50 max affichés)' : ''}
                          </div>
                          {products.map((product, index) => (
                            <div 
                              key={product.product_id} 
                              data-product-index={index}
                              className={`p-3 border-b border-indigo-100 hover:bg-indigo-50 cursor-pointer ${
                                index === focusedProductIndex ? 'bg-indigo-100 border-indigo-300' : ''
                              }`}
                              onClick={() => selectProductForQuantity(product)}
                            >
                              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                                <div className="flex-1">
                                  <h4 className="font-medium text-gray-900 text-sm">
                                  {product.product_id} - {product.description}
                                  {product.is_non_inventory && (
                                  <span className="ml-2 bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs font-medium">
                                  🏷️ Service
                                  </span>
                                  )}
                                  </h4>
                                  <div className="text-xs text-gray-500 space-y-1 sm:space-y-0 sm:space-x-4 sm:flex">
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
                    <div className="bg-white rounded-lg w-full max-w-md">
                      <div className="p-4 sm:p-6">
                        <h3 className="text-lg font-semibold mb-4">
                          Quantité pour: {selectedProductForQuantity.description}
                        </h3>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Quantité ({selectedProductForQuantity.unit})
                            </label>
                                  <input
                                    id="quantity-input"
                                     type="number"
                                      step="0.1"
                                      min="0.1"
                                      value={tempQuantity}
                                      onChange={(e) => {
                                    const value = e.target.value;
                                if (value === '' || parseFloat(value) >= 0) {
                                setTempQuantity(value);
                                    }
                                }}
                              onKeyDown={handleQuantityKeyDown}
                            onFocus={(e) => e.target.select()} // ✅ AJOUT: Sélectionne au focus
                                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3"
                            autoFocus
                            />
                          </div>
                          <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
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
                    <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                      <div className="p-4 sm:p-6">
                        <h3 className="text-lg font-semibold mb-4 text-orange-600">
                          ➕ Ajouter Produit Non-Inventaire
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Code Produit *</label>
                            <input
                              type="text"
                              value={quickProductForm.product_id}
                              onChange={(e) => setQuickProductForm({...quickProductForm, product_id: e.target.value})}
                              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3"
                              placeholder="Ex: TEMP-001"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Unité</label>
                            <select
                              value={quickProductForm.unit}
                              onChange={(e) => setQuickProductForm({...quickProductForm, unit: e.target.value})}
                              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3"
                            >
                              <option value="Un">Un</option>
                              <option value="M">m</option>
                              <option value="PI">Pi</option>
                              <option value="L">litre</option>
                              <option value="H">heure</option>
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Description *</label>
                            <input
                              type="text"
                              value={quickProductForm.description}
                              onChange={(e) => setQuickProductForm({...quickProductForm, description: e.target.value})}
                              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3"
                              placeholder="Description du produit..."
                              required
                            />
                          </div>
                          
                          {/* PRIX COÛT AVEC CALCULATEUR USD */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Prix Coût CAD *</label>
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
                              <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="text-sm font-medium text-blue-800 flex items-center">
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
                                    <span className="text-blue-700">Taux:</span>
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
                                    <div className="text-xs text-orange-600 bg-orange-50 p-2 rounded">
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
                                      className="flex-1 rounded border-blue-300 text-sm p-2"
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
                            <label className="block text-sm font-medium text-gray-700 mb-2">Prix Vente CAD *</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={quickProductForm.selling_price}
                              onChange={(e) => setQuickProductForm({...quickProductForm, selling_price: e.target.value})}
                              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3"
                              placeholder="0.00"
                              required
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
                                    onClick={() => applyProfitMargin(25)}
                                    className="flex-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs hover:bg-purple-200 font-medium"
                                  >
                                    +25%
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {quickProductForm.selling_price && quickProductForm.cost_price && (
                          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                            <p className="text-sm text-blue-800">
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

                {/* MODAL POUR LES COMMENTAIRES */}
                {showCommentModal && editingCommentItem && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg w-full max-w-md">
                      <div className="p-4 sm:p-6">
                        <h3 className="text-lg font-semibold mb-4 flex items-center">
                          <MessageSquare className="w-5 h-5 mr-2 text-blue-600" />
                          Commentaire pour: {editingCommentItem.description}
                        </h3>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Commentaire (optionnel)
                            </label>
                            <textarea
                              value={tempComment}
                              onChange={(e) => setTempComment(e.target.value)}
                              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3 h-24 resize-none"
                              placeholder="Ajouter un commentaire pour ce produit..."
                            />
                            <p className="text-xs text-gray-500 mt-1">
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
                  <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                    <h3 className="text-base sm:text-lg font-semibold text-yellow-800 mb-4">
                      📦 Produits Sélectionnés ({selectedItems.length})
                    </h3>
                    
                    {/* Tableau responsive */}
                    <div className="hidden sm:block max-h-80 overflow-y-auto border border-yellow-200 rounded-lg bg-white">
                      <table className="w-full text-sm">
                        <thead className="bg-yellow-100 sticky top-0">
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
                              <tr key={item.product_id} className="border-b border-yellow-100 hover:bg-yellow-50">
                                <td className="p-2 font-mono text-xs">{item.product_id}</td>
                                <td className="p-2">
                                  <div className="max-w-xs">
                                    <div className="font-medium text-gray-900 truncate">{item.description}</div>
                                    <div className="text-xs text-gray-500">{item.product_group} • {item.unit}</div>
                                    {item.comment && (
                                      <div className="text-xs text-blue-600 italic mt-1 truncate">
                                        💬 {item.comment}
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="p-2 text-center">
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0.1"
                                    value={item.quantity}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      if (value === '' || parseFloat(value) >= 0) {
                                        updateItemQuantity(item.product_id, value);
                                      }
                                    }}
                                    className="w-16 text-center rounded border-gray-300 text-sm"
                                  />
                                </td>
                                <td className="p-2 text-right">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={item.selling_price}
                                    onChange={(e) => updateItemPrice(item.product_id, 'selling_price', e.target.value)}
                                    className="w-20 text-right rounded border-green-300 text-sm focus:border-green-500 focus:ring-green-500"
                                  />
                                </td>
                                <td className="p-2 text-right">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={item.cost_price}
                                    onChange={(e) => updateItemPrice(item.product_id, 'cost_price', e.target.value)}
                                    className="w-20 text-right rounded border-orange-300 text-sm focus:border-orange-500 focus:ring-orange-500"
                                  />
                                </td>
                                <td className="p-2 text-right font-medium text-green-700">
                                  {formatCurrency(item.selling_price * item.quantity)}
                                </td>
                                <td className="p-2 text-right font-medium text-orange-700">
                                  {formatCurrency(item.cost_price * item.quantity)}
                                </td>
                                <td className="p-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() => openCommentModal(item)}
                                    className={`px-2 py-1 rounded text-xs ${
                                      item.comment 
                                        ? 'bg-blue-100 text-blue-800 hover:bg-blue-200' 
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                    title={item.comment ? 'Modifier commentaire' : 'Ajouter commentaire'}
                                  >
                                    <MessageSquare className="w-3 h-3" />
                                  </button>
                                </td>
                                <td className="p-2 text-center">
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
                      {[...selectedItems].reverse().slice(0, 3).map((item) => (
                        <div key={item.product_id} className="bg-white p-3 rounded-lg border border-yellow-200">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900 text-sm">{item.product_id}</h4>
                              <p className="text-xs text-gray-600">{item.description}</p>
                            </div>
                            <div className="flex gap-1 ml-2">
                              <button
                                type="button"
                                onClick={() => openCommentModal(item)}
                                className="p-1 bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
                              >
                                <MessageSquare className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeItemFromSubmission(item.product_id)}
                                className="p-1 bg-red-100 text-red-800 rounded hover:bg-red-200"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          <div className="text-sm font-medium text-green-700">
                            Total: {formatCurrency(item.selling_price * item.quantity)}
                          </div>
                        </div>
                      ))}
                      {selectedItems.length > 3 && (
                        <div className="text-center text-sm text-gray-500 bg-gray-50 p-2 rounded">
                          ... et {selectedItems.length - 3} autres produits
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-3 space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-yellow-700">
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
<div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
  <label className="block text-sm font-semibold text-purple-800 mb-2">
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
      <p className="text-sm text-purple-600 mt-2 flex items-center">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600 mr-2"></div>
        📤 Upload en cours... Veuillez patienter.
      </p>
    )}
  </div>

  {submissionForm.files && submissionForm.files.length > 0 && (
    <div className="space-y-2">
      <p className="text-sm font-medium text-purple-700">
        📁 Documents joints ({submissionForm.files.length})
      </p>
      <div className="space-y-2">
        {submissionForm.files.map((file, index) => (
          <div key={index} className="bg-white p-3 rounded border border-purple-200 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <span className="text-xl flex-shrink-0">{getFileIcon(file.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-gray-500">
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
                      className="flex-1 sm:flex-none px-3 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded border border-blue-300 transition-colors"
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

        {/* Statistiques responsive */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">📊</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Total</p>
                <p className="text-xl sm:text-2xl font-bold">{soumissions.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">📝</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Brouillons</p>
                <p className="text-xl sm:text-2xl font-bold">
                  {soumissions.filter(s => s.status === 'draft').length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">📤</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Envoyées</p>
                <p className="text-xl sm:text-2xl font-bold">
                  {soumissions.filter(s => s.status === 'sent').length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">✅</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Total Accepté</p>
                <p className="text-lg sm:text-2xl font-bold">
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
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-sm text-gray-600">
          📊 6718 produits • 💱 USD→CAD (Taux: {usdToCadRate.toFixed(4)}) • 🎯 Marges auto • 📧 Email .EML
        </p>
      </div>

      {/* Filtres responsive */}
      <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="🔍 Rechercher par client ou description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-4 py-3 rounded-lg border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-base"
              />
            </div>
          </div>
          <div className="w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-base p-3"
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
      <div className="hidden lg:block bg-white shadow-lg rounded-lg overflow-hidden">
        {filteredSoumissions.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-6xl mb-4 block">📝</span>
            <p className="text-gray-500 text-lg">Aucune soumission trouvée</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Soumission
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client & Description
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Montant
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredSoumissions.map((submission) => (
                <tr key={submission.id} className="hover:bg-gray-50">
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
                      <div className="font-medium text-gray-900">{submission.client_name}</div>
                      <div className="text-gray-500 truncate max-w-xs" title={submission.description}>
                        {submission.description}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-medium text-green-600">
                      {formatCurrency(submission.amount)}
                    </div>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      submission.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                      submission.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {submission.status === 'sent' ? '📤' :
                       submission.status === 'draft' ? '📝' : '✅'}
                    </span>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                    {formatDate(submission.created_at)}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-center">
                    <div className="flex justify-center space-x-1">
                      <button
                        onClick={() => {
                          setEditingSubmission(submission);
                          setSubmissionForm({
                            client_name: submission.client_name,
                            description: submission.description,
                            amount: submission.amount,
                            status: submission.status,
                            items: submission.items || [],
                            submission_number: submission.submission_number || ''
                          });
                          setSelectedItems(submission.items || []);
                          const existingCostTotal = (submission.items || []).reduce((sum, item) => 
                            sum + ((item.cost_price || 0) * (item.quantity || 0)), 0
                          );
                          setCalculatedCostTotal(existingCostTotal);
                          setShowForm(true);
                        }}
                        className="bg-purple-100 text-purple-700 hover:bg-purple-200 p-2 rounded-lg transition-colors"
                        title="Modifier"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
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

      {/* MOBILE VIEW - Cards empilées */}
      <div className="lg:hidden space-y-4">
        {filteredSoumissions.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <span className="text-6xl mb-4 block">📝</span>
            <p className="text-gray-500 text-lg">Aucune soumission trouvée</p>
          </div>
        ) : (
          filteredSoumissions.map((submission) => (
            <div key={submission.id} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
              
              {/* En-tête de la card */}
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">
                      {submission.status === 'sent' ? '📤' :
                       submission.status === 'draft' ? '📝' : '✅'}
                    </span>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-base">
                        👤 {submission.client_name}
                      </h3>
                      <div className="flex items-center gap-2">
                        {submission.submission_number && (
                          <p className="text-sm text-purple-600">N°: {submission.submission_number}</p>
                        )}
                        {submission.items?.some(item => item.comment) && (
                          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
                            💬 Commentaires
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Menu actions mobile */}
                  <div className="relative">
                    <button
                      onClick={() => setSelectedSubmissionId(selectedSubmissionId === submission.id ? null : submission.id)}
                      className="p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-white/50"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                    
                    {/* Dropdown actions */}
                    {selectedSubmissionId === submission.id && (
                      <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                        <div className="py-1">
                          <button
                            onClick={() => {
                              setEditingSubmission(submission);
                              setSubmissionForm({
                                client_name: submission.client_name,
                                description: submission.description,
                                amount: submission.amount,
                                status: submission.status,
                                items: submission.items || [],
                                submission_number: submission.submission_number || ''
                              });
                              setSelectedItems(submission.items || []);
                              const existingCostTotal = (submission.items || []).reduce((sum, item) => 
                                sum + ((item.cost_price || 0) * (item.quantity || 0)), 0
                              );
                              setCalculatedCostTotal(existingCostTotal);
                              setShowForm(true);
                              setSelectedSubmissionId(null);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            Modifier
                          </button>
                          <hr className="my-1" />
                          <button
                            onClick={() => {
                              handleDeleteSubmission(submission.id);
                              setSelectedSubmissionId(null);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Supprimer
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Contenu de la card */}
              <div className="p-4 space-y-3">
                
                {/* Description */}
                <div>
                  <span className="text-gray-500 text-sm block">📝 Description</span>
                  <p className="text-gray-900 font-medium">{submission.description}</p>
                </div>

                {/* Informations principales */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 block">💰 Montant</span>
                    <span className="font-bold text-green-600 text-base">{formatCurrency(submission.amount)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">📅 Date</span>
                    <span className="font-medium text-gray-900">{formatDate(submission.created_at)}</span>
                  </div>
                </div>

                {/* Statut */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 text-sm">Statut</span>
                  <span className={`px-2 py-1 rounded text-xs ${
                    submission.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                    submission.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {submission.status === 'sent' ? 'Envoyée' :
                     submission.status === 'draft' ? 'Brouillon' : 'Acceptée'}
                  </span>
                </div>

                {/* Marge et coût */}
                {submission.items && submission.items.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-orange-600 font-medium">
                          🏷️ Coût: {formatCurrency(
                            submission.items.reduce((sum, item) => sum + ((item.cost_price || 0) * (item.quantity || 0)), 0)
                          )}
                        </span>
                      </div>
                      <div>
                        <span className="text-blue-600 font-medium">
                          📈 Marge: {formatCurrency(
                            submission.amount - submission.items.reduce((sum, item) => sum + ((item.cost_price || 0) * (item.quantity || 0)), 0)
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-gray-600 flex justify-between">
                      <span>📦 {submission.items.length} item(s)</span>
                      {submission.items.some(item => item.comment) && (
                        <span className="text-blue-600">💬 {submission.items.filter(item => item.comment).length} commentaire(s)</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Actions rapides en bas */}
              <div className="bg-gray-50 px-4 py-3 flex gap-2">
                <button
                  onClick={() => {
                    setEditingSubmission(submission);
                    setSubmissionForm({
                      client_name: submission.client_name,
                      description: submission.description,
                      amount: submission.amount,
                      status: submission.status,
                      items: submission.items || [],
                      submission_number: submission.submission_number || ''
                    });
                    setSelectedItems(submission.items || []);
                    const existingCostTotal = (submission.items || []).reduce((sum, item) => 
                      sum + ((item.cost_price || 0) * (item.quantity || 0)), 0
                    );
                    setCalculatedCostTotal(existingCostTotal);
                    setShowForm(true);
                  }}
                  className="flex-1 bg-purple-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
                >
                  ✏️ Modifier
                </button>
                <button
                  onClick={() => handleDeleteSubmission(submission.id)}
                  className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                >
                  🗑️ Supprimer
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
