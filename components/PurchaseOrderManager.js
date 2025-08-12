import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { MoreVertical, Eye, Edit, Trash2, FileText, Download, ChevronDown, X, Upload, Search, Plus, Minus, Package, Truck, Printer, CheckCircle } from 'lucide-react';
import { Building2, FileUp, ShoppingCart } from 'lucide-react';

export default function PurchaseOrderManager() {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPO, setEditingPO] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sendingReport, setSendingReport] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  
  // NOUVEAU: États pour les achats fournisseurs
  const [supplierPurchases, setSupplierPurchases] = useState([]);
  const [linkedPurchases, setLinkedPurchases] = useState([]);
  const [availablePurchases, setAvailablePurchases] = useState([]);
  const [loadingPurchases, setLoadingPurchases] = useState(false);
  
  // 🆕 NOUVEAU: États pour les LIVRAISONS
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [selectedPOForDelivery, setSelectedPOForDelivery] = useState(null);
  const [deliverySlips, setDeliverySlips] = useState([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const [poItems, setPOItems] = useState([]);
  const [deliveryFormData, setDeliveryFormData] = useState({
    delivery_date: new Date().toISOString().split('T')[0],
    transport_company: '',
    transport_number: '',
    delivery_contact: '',
    special_instructions: '',
    items: []
  });
  
  const [formData, setFormData] = useState({
    client_name: '',
    po_number: '',
    submission_no: '',
    date: new Date().toISOString().split('T')[0],
    amount: '',
    status: 'pending',
    notes: '',
    additionalNotes: '',
    files: [],
    // 🆕 NOUVEAU: Champs pour les articles
    items: []
  });

  // ============ FONCTIONS AVANT useEffect ============
  
  const fetchPurchaseOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erreur Supabase:', error);
        throw error;
      }
      console.log('Bons d\'achat chargés:', data?.length || 0);
      setPurchaseOrders(data || []);
    } catch (error) {
      console.error('Erreur lors du chargement des bons d\'achat:', error);
      console.error('Erreur lors du chargement des bons d\'achat:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        console.error('Erreur chargement clients:', error);
      } else {
        setClients(data || []);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des clients:', error);
    }
  };

  const fetchSubmissions = async () => {
    try {
      const { data, error } = await supabase
        .from('submissions')
        .select('id, submission_number, client_name, description, created_at')
        .order('submission_number', { ascending: false });

      if (error) {
        console.error('Erreur chargement soumissions:', error);
      } else {
        setSubmissions(data || []);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des soumissions:', error);
    }
  };

  // NOUVEAU: Récupérer tous les achats fournisseurs
  const fetchSupplierPurchases = async () => {
    try {
      const { data, error } = await supabase
        .from('supplier_purchases')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Erreur chargement achats fournisseurs:', error);
      } else {
        setSupplierPurchases(data || []);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des achats fournisseurs:', error);
    }
  };

  // NOUVEAU: Récupérer les achats fournisseurs liés à un PO spécifique
  const fetchLinkedPurchases = async (purchaseOrderId) => {
    if (!purchaseOrderId) {
      setLinkedPurchases([]);
      setAvailablePurchases([]);
      return;
    }
    
    setLoadingPurchases(true);
    try {
      // Récupérer les achats liés
      const { data: linked, error: linkedError } = await supabase
        .from('supplier_purchases')
        .select('*')
        .eq('linked_po_id', purchaseOrderId);

      if (linkedError) {
        console.error('Erreur récupération achats liés:', linkedError);
      } else {
        setLinkedPurchases(linked || []);
      }

      // Récupérer les achats disponibles (non liés à ce PO)
      const { data: available, error: availableError } = await supabase
        .from('supplier_purchases')
        .select('*')
        .is('linked_po_id', null)
        .order('created_at', { ascending: false });

      if (availableError) {
        console.error('Erreur récupération achats disponibles:', availableError);
      } else {
        setAvailablePurchases(available || []);
      }

    } catch (error) {
      console.error('Erreur lors du chargement des achats fournisseurs:', error);
    } finally {
      setLoadingPurchases(false);
    }
  };

  // 🆕 NOUVEAU: Récupérer les bons de livraison d'un PO
  const fetchDeliverySlips = async (purchaseOrderId) => {
    if (!purchaseOrderId) return;
    
    setLoadingDeliveries(true);
    try {
      const { data, error } = await supabase
        .from('delivery_slips')
        .select(`
          *,
          delivery_slip_items (*)
        `)
        .eq('client_po_id', purchaseOrderId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erreur récupération bons de livraison:', error);
      } else {
        setDeliverySlips(data || []);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des livraisons:', error);
    } finally {
      setLoadingDeliveries(false);
    }
  };

  // 🆕 NOUVEAU: Récupérer les articles d'un bon d'achat (depuis items JSON ou nouvelle table)
  const fetchPOItems = async (purchaseOrderId) => {
    if (!purchaseOrderId) return;
    
    try {
      // D'abord essayer de récupérer depuis la table purchase_orders (items JSON)
      const { data: poData, error: poError } = await supabase
        .from('purchase_orders')
        .select('*')
        .eq('id', purchaseOrderId)
        .single();

      if (!poError && poData) {
        // Si on a des items dans le JSON
        if (poData.items && Array.isArray(poData.items)) {
          setPOItems(poData.items.map((item, index) => ({
            ...item,
            id: index,
            delivered_quantity: item.delivered_quantity || 0
          })));
        } else {
          // Sinon créer des items factices basés sur la description
          setPOItems([{
            id: 1,
            product_id: 'GENERAL',
            description: poData.notes || poData.description || 'Articles divers',
            quantity: 1,
            unit: 'LOT',
            selling_price: poData.amount || 0,
            cost_price: 0,
            delivered_quantity: 0
          }]);
        }
      }
    } catch (error) {
      console.error('Erreur récupération articles PO:', error);
    }
  };

  // 🆕 NOUVEAU: Générer un numéro de bon de livraison
  const generateDeliveryNumber = async () => {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const prefix = `BL-${year}${month}`;
    
    try {
      const { data, error } = await supabase
        .from('delivery_slips')
        .select('delivery_number')
        .like('delivery_number', `${prefix}%`)
        .order('delivery_number', { ascending: false })
        .limit(1);

      if (error) throw error;

      let nextNumber = '001';
      if (data && data.length > 0) {
        const lastNumber = parseInt(data[0].delivery_number.split('-').pop());
        nextNumber = (lastNumber + 1).toString().padStart(3, '0');
      }

      return `${prefix}-${nextNumber}`;
    } catch (error) {
      console.error('Erreur génération numéro BL:', error);
      return `${prefix}-${Date.now().toString().slice(-3)}`;
    }
  };

  // 🆕 NOUVEAU: Créer un bon de livraison
  const createDeliverySlip = async () => {
    // Filtrer seulement les items sélectionnés
    const selectedItems = deliveryFormData.items.filter(item => item.selected && item.quantity_to_deliver > 0);
    
    if (selectedItems.length === 0) {
      alert('⚠️ Veuillez sélectionner au moins un article à livrer');
      return;
    }

    try {
      const deliveryNumber = await generateDeliveryNumber();
      
      // Créer le bon de livraison
      const { data: deliverySlip, error: slipError } = await supabase
        .from('delivery_slips')
        .insert([{
          client_po_id: selectedPOForDelivery.id,
          delivery_number: deliveryNumber,
          delivery_date: deliveryFormData.delivery_date,
          transport_company: deliveryFormData.transport_company,
          transport_number: deliveryFormData.transport_number,
          delivery_contact: deliveryFormData.delivery_contact,
          special_instructions: deliveryFormData.special_instructions,
          status: 'completed'
        }])
        .select()
        .single();

      if (slipError) throw slipError;

      // Créer les items du bon de livraison (seulement les sélectionnés)
      const deliveryItems = selectedItems.map(item => ({
        delivery_slip_id: deliverySlip.id,
        client_po_item_id: item.id,
        quantity_delivered: item.quantity_to_deliver,
        notes: item.notes || ''
      }));

      if (deliveryItems.length > 0) {
        const { error: itemsError } = await supabase
          .from('delivery_slip_items')
          .insert(deliveryItems);

        if (itemsError) throw itemsError;
      }

      // Mettre à jour les quantités livrées dans le PO
      // (Si vous utilisez une table client_po_items, mettez à jour ici)

      alert('✅ Bon de livraison créé avec succès !');
      
      // Réinitialiser et fermer
      setShowDeliveryModal(false);
      setDeliveryFormData({
        delivery_date: new Date().toISOString().split('T')[0],
        transport_company: '',
        transport_number: '',
        delivery_contact: '',
        special_instructions: '',
        items: []
      });
      
      // Recharger les livraisons
      await fetchDeliverySlips(selectedPOForDelivery.id);
      
      // Imprimer le bon de livraison (avec seulement les items sélectionnés)
      printDeliverySlip(deliverySlip, selectedItems);
      
    } catch (error) {
      console.error('Erreur création bon de livraison:', error);
      alert('❌ Erreur lors de la création du bon de livraison');
    }
  };

  // 🆕 NOUVEAU: Imprimer un bon de livraison
  const printDeliverySlip = (deliverySlip, selectedItems) => {
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    
    // Utiliser seulement les items sélectionnés pour l'impression
    const itemsToDeliver = selectedItems.filter(item => item.selected && item.quantity_to_deliver > 0);
    
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bon de Livraison ${deliverySlip.delivery_number}</title>
        <style>
          @page { size: letter; margin: 0.5in; }
          body { 
            font-family: Arial, sans-serif; 
            margin: 0; 
            padding: 20px;
            font-size: 12pt;
          }
          
          /* Header */
          .header {
            display: flex;
            justify-content: space-between;
            align-items: start;
            border-bottom: 3px solid #000;
            padding-bottom: 20px;
            margin-bottom: 20px;
          }
          
          .company-info {
            flex: 1;
          }
          
          .company-name {
            font-size: 24pt;
            font-weight: bold;
            color: #2563eb;
            margin-bottom: 5px;
          }
          
          .company-details {
            font-size: 10pt;
            color: #666;
            line-height: 1.4;
          }
          
          .document-title {
            flex: 1;
            text-align: right;
          }
          
          .doc-type {
            font-size: 20pt;
            font-weight: bold;
            margin-bottom: 10px;
          }
          
          .doc-number {
            font-size: 14pt;
            color: #2563eb;
            font-weight: bold;
          }
          
          .doc-date {
            font-size: 11pt;
            color: #666;
            margin-top: 5px;
          }
          
          /* Info Sections */
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            margin: 30px 0;
          }
          
          .info-box {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 15px;
            background: #f9f9f9;
          }
          
          .info-box h3 {
            margin: 0 0 10px 0;
            font-size: 12pt;
            color: #2563eb;
            text-transform: uppercase;
            border-bottom: 1px solid #ddd;
            padding-bottom: 5px;
          }
          
          .info-box p {
            margin: 5px 0;
            font-size: 11pt;
          }
          
          .info-box strong {
            color: #333;
          }
          
          /* Transport Info */
          .transport-info {
            background: #e3f2fd;
            border: 1px solid #2563eb;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
          }
          
          /* Table */
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
          }
          
          th {
            background: #2563eb;
            color: white;
            padding: 10px;
            text-align: left;
            font-size: 11pt;
            font-weight: bold;
          }
          
          td {
            border: 1px solid #ddd;
            padding: 8px;
            font-size: 11pt;
          }
          
          tbody tr:nth-child(even) {
            background: #f9f9f9;
          }
          
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          
          /* Footer */
          .signature-section {
            margin-top: 50px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 50px;
          }
          
          .signature-box {
            border-top: 2px solid #333;
            padding-top: 10px;
          }
          
          .signature-label {
            font-size: 10pt;
            color: #666;
            margin-bottom: 5px;
          }
          
          .signature-name {
            font-size: 11pt;
            font-weight: bold;
            margin-bottom: 3px;
          }
          
          .signature-date {
            font-size: 10pt;
            color: #666;
          }
          
          .footer-note {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            font-size: 9pt;
            color: #666;
            text-align: center;
          }
          
          /* Special Instructions */
          .special-instructions {
            background: #fff3cd;
            border: 1px solid #ffc107;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
          }
          
          .special-instructions h4 {
            margin: 0 0 10px 0;
            color: #856404;
            font-size: 11pt;
          }
          
          @media print {
            body { margin: 0; }
            .info-box { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <!-- Header avec logo et infos -->
        <div class="header">
          <div class="company-info">
            <div class="company-name">SERVICES TMT INC.</div>
            <div class="company-details">
              195, 42e Rue Nord<br>
              Saint-Georges, QC G5Z 0V9<br>
              Tél: (418) 225-3875<br>
              info.servicestmt@gmail.com
            </div>
          </div>
          <div class="document-title">
            <div class="doc-type">BON DE LIVRAISON</div>
            <div class="doc-number"># ${deliverySlip.delivery_number}</div>
            <div class="doc-date">Date: ${formatDate(deliverySlip.delivery_date)}</div>
          </div>
        </div>

        <!-- Informations client et livraison -->
        <div class="info-grid">
          <div class="info-box">
            <h3>Livraison À:</h3>
            <p><strong>${selectedPOForDelivery?.client_name || 'N/A'}</strong></p>
            ${selectedPOForDelivery?.delivery_address ? `
              <p>${selectedPOForDelivery.delivery_address.street || ''}</p>
              <p>${selectedPOForDelivery.delivery_address.city || ''}, ${selectedPOForDelivery.delivery_address.province || ''}</p>
              <p>${selectedPOForDelivery.delivery_address.postal_code || ''}</p>
            ` : '<p>Adresse à confirmer</p>'}
          </div>
          
          <div class="info-box">
            <h3>Référence:</h3>
            <p><strong>BA Client:</strong> ${selectedPOForDelivery?.po_number || 'N/A'}</p>
            ${selectedPOForDelivery?.submission_no ? `<p><strong>Soumission:</strong> ${selectedPOForDelivery.submission_no}</p>` : ''}
            <p><strong>Contact:</strong> ${deliveryFormData.delivery_contact || 'À confirmer'}</p>
          </div>
        </div>

        <!-- Information de transport -->
        ${(deliveryFormData.transport_company || deliveryFormData.transport_number) ? `
        <div class="transport-info">
          <h3 style="margin: 0 0 10px 0; font-size: 12pt;">🚚 INFORMATION DE TRANSPORT</h3>
          ${deliveryFormData.transport_company ? `<p><strong>Transporteur:</strong> ${deliveryFormData.transport_company}</p>` : ''}
          ${deliveryFormData.transport_number ? `<p><strong>N° de suivi:</strong> ${deliveryFormData.transport_number}</p>` : ''}
        </div>
        ` : ''}

        <!-- Tableau des articles -->
        <table>
          <thead>
            <tr>
              <th style="width: 15%;">N° PIÈCE</th>
              <th style="width: 40%;">DESCRIPTION</th>
              <th style="width: 10%;" class="text-center">QTÉ CMD</th>
              <th style="width: 10%;" class="text-center">QTÉ LIVRÉE</th>
              <th style="width: 10%;" class="text-center">UNITÉ</th>
              <th style="width: 15%;" class="text-center">RESTANT</th>
            </tr>
          </thead>
          <tbody>
            ${itemsToDeliver.map(item => `
              <tr>
                <td>${item.product_id || 'N/A'}</td>
                <td>${item.description || ''}</td>
                <td class="text-center">${item.quantity || 0}</td>
                <td class="text-center"><strong>${item.quantity_to_deliver || 0}</strong></td>
                <td class="text-center">${item.unit || ''}</td>
                <td class="text-center">${Math.max(0, (item.quantity || 0) - (item.delivered_quantity || 0) - (item.quantity_to_deliver || 0))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- Instructions spéciales -->
        ${deliveryFormData.special_instructions ? `
        <div class="special-instructions">
          <h4>⚠️ INSTRUCTIONS SPÉCIALES:</h4>
          <p>${deliveryFormData.special_instructions}</p>
        </div>
        ` : ''}

        <!-- Section signatures -->
        <div class="signature-section">
          <div class="signature-box">
            <div class="signature-label">SIGNATURE CLIENT:</div>
            <div style="height: 40px;"></div>
            <div class="signature-name">_______________________________</div>
            <div class="signature-date">Date: _______________________</div>
          </div>
          
          <div class="signature-box">
            <div class="signature-label">SIGNATURE LIVREUR:</div>
            <div style="height: 40px;"></div>
            <div class="signature-name">_______________________________</div>
            <div class="signature-date">Date: _______________________</div>
          </div>
        </div>

        <!-- Note de bas de page -->
        <div class="footer-note">
          <strong>IMPORTANT:</strong> La marchandise demeure la propriété de Services TMT Inc. jusqu'au paiement complet.<br>
          Veuillez vérifier la marchandise à la réception. Toute réclamation doit être faite dans les 48 heures.
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };

  // 🆕 NOUVEAU: Ouvrir le modal de livraison
  const openDeliveryModal = async (po) => {
    setSelectedPOForDelivery(po);
    setShowDeliveryModal(true);
    
    // Charger les articles du PO
    await fetchPOItems(po.id);
    
    // Charger les livraisons existantes
    await fetchDeliverySlips(po.id);
  };

  // 🆕 NOUVEAU: Calculer le statut de livraison
  const getDeliveryStatus = (po) => {
    if (!po.items || po.items.length === 0) return 'non_applicable';
    
    const totalQuantity = po.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const deliveredQuantity = po.items.reduce((sum, item) => sum + (item.delivered_quantity || 0), 0);
    
    if (deliveredQuantity === 0) return 'non_livre';
    if (deliveredQuantity < totalQuantity) return 'partiel';
    return 'complet';
  };

  // 🆕 NOUVEAU: Badge de statut de livraison
  const getDeliveryBadge = (status) => {
    switch (status) {
      case 'complet':
        return <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">✅ Livré</span>;
      case 'partiel':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">📦 Partiel</span>;
      case 'non_livre':
        return <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">⏳ À livrer</span>;
      default:
        return null;
    }
  };

  // FONCTION CORRIGÉE - visualizeSupplierPurchase avec détail des articles
  const visualizeSupplierPurchase = async (purchase) => {
    try {
      const { data: purchaseDetails, error } = await supabase
        .from('supplier_purchases')
        .select('*')
        .eq('id', purchase.id)
        .single();

      if (error) throw error;

      const printWindow = window.open('', '_blank', 'width=800,height=600');
      
      const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Achat Fournisseur ${purchaseDetails.purchase_number}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 10px; }
            .info-section { display: flex; justify-content: space-between; margin-bottom: 20px; }
            .supplier-info, .purchase-info { width: 48%; }
            .po-link { background-color: #e3f2fd; padding: 10px; margin: 10px 0; border-radius: 5px; }
            
            /* NOUVEAU: Styles pour le tableau des articles */
            .items-section { margin: 20px 0; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { border: 1px solid #000; padding: 8px; text-align: left; }
            th { background-color: #f0f0f0; font-weight: bold; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .total-row { background-color: #f9f9f9; font-weight: bold; }
            
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>ACHAT FOURNISSEUR</h1>
            <h2>N°: ${purchaseDetails.purchase_number || 'N/A'}</h2>
            <p>Date: ${formatDate(purchaseDetails.delivery_date || purchaseDetails.created_at)}</p>
          </div>
          
          <div class="info-section">
            <div class="supplier-info">
              <h3>FOURNISSEUR:</h3>
              <p><strong>${purchaseDetails.supplier_name || 'N/A'}</strong></p>
              ${purchaseDetails.supplier_contact ? `<p>Contact: ${purchaseDetails.supplier_contact}</p>` : ''}
            </div>
            <div class="purchase-info">
              <p><strong>Date création:</strong> ${formatDate(purchaseDetails.created_at)}</p>
              ${purchaseDetails.delivery_date ? `<p><strong>Date livraison:</strong> ${formatDate(purchaseDetails.delivery_date)}</p>` : ''}
              <p><strong>Statut:</strong> ${purchaseDetails.status || 'En cours'}</p>
            </div>
          </div>

          ${purchaseDetails.linked_po_id ? `
            <div class="po-link">
              <h3>🔗 LIEN AVEC BON D'ACHAT CLIENT:</h3>
              <p><strong>N° Bon d'achat:</strong> ${purchaseDetails.linked_po_number || 'N/A'}</p>
              <p><em>Cet achat fournisseur est lié au bon d'achat client ci-dessus</em></p>
            </div>
          ` : ''}

          <!-- NOUVEAU: Section des articles -->
          ${purchaseDetails.items && purchaseDetails.items.length > 0 ? `
            <div class="items-section">
              <h3>DÉTAIL DES ARTICLES:</h3>
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Description</th>
                    <th class="text-center">Qté</th>
                    <th class="text-center">Unité</th>
                    <th class="text-right">Prix Unit.</th>
                    <th class="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${purchaseDetails.items.map(item => `
                    <tr>
                      <td>${item.product_id || item.code || ''}</td>
                      <td>${item.description || ''}</td>
                      <td class="text-center">${item.quantity || 0}</td>
                      <td class="text-center">${item.unit || ''}</td>
                      <td class="text-right">${formatCurrency(item.cost_price || 0)}</td>
                      <td class="text-right">${formatCurrency((item.cost_price || 0) * (item.quantity || 0))}</td>
                    </tr>
                  `).join('')}
                </tbody>
                <tfoot>
                  <tr class="total-row">
                    <td colspan="5"><strong>Sous-total:</strong></td>
                    <td class="text-right"><strong>${formatCurrency(purchaseDetails.subtotal || 0)}</strong></td>
                  </tr>
                  ${purchaseDetails.taxes && purchaseDetails.taxes > 0 ? `
                    <tr class="total-row">
                      <td colspan="5"><strong>Taxes (14.975%):</strong></td>
                      <td class="text-right"><strong>${formatCurrency(purchaseDetails.taxes)}</strong></td>
                    </tr>
                  ` : ''}
                  ${purchaseDetails.shipping_cost && purchaseDetails.shipping_cost > 0 ? `
                    <tr class="total-row">
                      <td colspan="5"><strong>Frais de livraison:</strong></td>
                      <td class="text-right"><strong>${formatCurrency(purchaseDetails.shipping_cost)}</strong></td>
                    </tr>
                  ` : ''}
                  <tr class="total-row" style="background-color: #e8f5e8;">
                    <td colspan="5"><strong>TOTAL GÉNÉRAL:</strong></td>
                    <td class="text-right"><strong>${formatCurrency(purchaseDetails.total_amount || 0)}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ` : `
            <div class="items-section">
              <h3>DÉTAIL DES ARTICLES:</h3>
              <p style="text-align: center; color: #666; font-style: italic; padding: 20px;">
                Aucun article détaillé pour cet achat fournisseur
              </p>
            </div>
          `}

          <div style="margin: 30px 0; padding: 20px; background-color: #f5f5f5; border-radius: 5px;">
            <h3>MONTANT TOTAL: ${formatCurrency(purchaseDetails.total_amount || 0)}</h3>
          </div>

          ${purchaseDetails.notes ? `
            <div style="margin-top: 30px;">
              <h3>Notes:</h3>
              <p>${purchaseDetails.notes}</p>
            </div>
          ` : ''}
        </body>
        </html>
      `;

      printWindow.document.write(printContent);
      printWindow.document.close();
      
    } catch (error) {
      console.error('Erreur récupération achat fournisseur:', error);
      alert('❌ Erreur lors de la récupération de l\'achat fournisseur');
    }
  };

  // NOUVEAU: Lier un achat fournisseur au PO
  const linkSupplierPurchase = async (supplierPurchaseId) => {
    if (!editingPO) return;

    try {
      const { error } = await supabase
        .from('supplier_purchases')
        .update({ 
          linked_po_id: editingPO.id,
          linked_po_number: editingPO.po_number
        })
        .eq('id', supplierPurchaseId);

      if (error) throw error;

      // Recharger les données
      await fetchLinkedPurchases(editingPO.id);
      alert('✅ Achat fournisseur lié avec succès !');

    } catch (error) {
      console.error('Erreur liaison achat fournisseur:', error);
      alert('❌ Erreur lors de la liaison: ' + error.message);
    }
  };

  // NOUVEAU: Délier un achat fournisseur du PO
  const unlinkSupplierPurchase = async (supplierPurchaseId) => {
    if (!confirm('🔗 Êtes-vous sûr de vouloir délier cet achat fournisseur ?')) return;

    try {
      const { error } = await supabase
        .from('supplier_purchases')
        .update({ 
          linked_po_id: null,
          linked_po_number: null
        })
        .eq('id', supplierPurchaseId);

      if (error) throw error;

      // Recharger les données
      await fetchLinkedPurchases(editingPO.id);
      alert('✅ Achat fournisseur délié avec succès !');

    } catch (error) {
      console.error('Erreur déliage achat fournisseur:', error);
      alert('❌ Erreur lors du déliage: ' + error.message);
    }
  };

  // ============ useEffect CORRIGÉ ============
  useEffect(() => {
    fetchPurchaseOrders();
    fetchClients();
    fetchSubmissions();
    fetchSupplierPurchases(); // NOUVEAU
    
    const handleBeforeUnload = () => {
      supabase.auth.signOut();
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // 🆕 NOUVEAU: useEffect pour préparer les items de livraison
  useEffect(() => {
    if (poItems.length > 0 && showDeliveryModal) {
      // Préparer les items pour la livraison avec le flag selected
      setDeliveryFormData(prev => ({
        ...prev,
        items: poItems.map(item => ({
          ...item,
          selected: false,  // Par défaut non sélectionné
          quantity_to_deliver: 0,
          notes: ''
        }))
      }));
    }
  }, [poItems, showDeliveryModal]);

  // ============ HANDLERS APRÈS useEffect ============

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const dataToSave = {
      client_name: formData.client_name,
      client: formData.client_name,
      po_number: formData.po_number,
      submission_no: formData.submission_no,
      date: formData.date,
      amount: parseFloat(formData.amount),
      status: formData.status,
      notes: formData.notes,
      description: formData.notes,
      additionalNotes: formData.additionalNotes,
      vendor: formData.client_name,
      files: formData.files,
      items: formData.items // 🆕 NOUVEAU: Sauvegarder les items
    };

    try {
      console.log('Données à sauvegarder:', dataToSave);

      if (editingPO) {
        const { data, error } = await supabase
          .from('purchase_orders')
          .update(dataToSave)
          .eq('id', editingPO.id)
          .select();

        if (error) {
          console.error('Erreur UPDATE:', error);
          throw error;
        }
      } else {
        const { data, error } = await supabase
          .from('purchase_orders')
          .insert([dataToSave])
          .select();

        if (error) {
          console.error('Erreur INSERT:', error);
          throw error;
        }
      }

      await fetchPurchaseOrders();
      setShowForm(false);
      setEditingPO(null);
      setFormData({
        client_name: '',
        po_number: '',
        submission_no: '',
        date: new Date().toISOString().split('T')[0],
        amount: '',
        status: 'pending',
        notes: '',
        additionalNotes: '',
        files: [],
        items: []
      });
      
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error.message);
    }
  };

  const handleEdit = (po) => {
    setEditingPO(po);
    setFormData({
      client_name: po.client_name || po.client || '',
      po_number: po.po_number || '',
      submission_no: po.submission_no || '',
      date: po.date || new Date().toISOString().split('T')[0],
      amount: po.amount || '',
      status: po.status || 'pending',
      notes: po.notes || po.description || '',
      additionalNotes: po.additionalNotes || '',
      files: po.files || [],
      items: po.items || [] // 🆕 NOUVEAU: Charger les items
    });
    setShowForm(true);
    
    // NOUVEAU: Charger les achats fournisseurs liés
    fetchLinkedPurchases(po.id);
  };

  const cleanupFilesForPO = async (files) => {
    if (!files || files.length === 0) return;
    
    try {
      const filePaths = files
        .filter(file => file.path)
        .map(file => file.path);
      
      if (filePaths.length > 0) {
        const { error } = await supabase.storage
          .from('purchase-orders-pdfs')
          .remove(filePaths);
        
        if (error) {
          console.error('❌ Erreur nettoyage fichiers:', error);
        } else {
          console.log(`🧹 ${filePaths.length} fichier(s) supprimé(s) du storage`);
        }
      }
    } catch (error) {
      console.error('❌ Erreur lors du nettoyage:', error);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('🗑️ Êtes-vous sûr de vouloir supprimer ce bon d\'achat ?')) {
      return;
    }

    try {
      const { data: poData, error: fetchError } = await supabase
        .from('purchase_orders')
        .select('files')
        .eq('id', id)
        .single();

      if (fetchError) {
        console.error('❌ Erreur récupération bon d\'achat:', fetchError);
      }

      // NOUVEAU: Délier tous les achats fournisseurs avant suppression
      const { error: unlinkError } = await supabase
        .from('supplier_purchases')
        .update({ 
          linked_po_id: null,
          linked_po_number: null 
        })
        .eq('linked_po_id', id);

      if (unlinkError) {
        console.error('❌ Erreur déliage achats fournisseurs:', unlinkError);
      }

      const { error: deleteError } = await supabase
        .from('purchase_orders')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      if (poData?.files) {
        await cleanupFilesForPO(poData.files);
      }

      await fetchPurchaseOrders();
      await fetchSupplierPurchases(); // Recharger pour mettre à jour les liens
      console.log('✅ Bon d\'achat et fichiers supprimés avec succès');

    } catch (error) {
      console.error('❌ Erreur lors de la suppression:', error.message);
      alert('Erreur lors de la suppression du bon d\'achat');
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      const { error } = await supabase
        .from('purchase_orders')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;
      await fetchPurchaseOrders();
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut:', error.message);
    }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploadingFiles(true);
    const uploadedFiles = [];

    console.log('📤 Début upload de', files.length, 'fichier(s)');

    for (const file of files) {
      try {
        console.log('📄 Upload en cours:', file.name);

        const cleanFileName = file.name
          .replace(/\s+/g, '_')
          .replace(/[^a-zA-Z0-9._-]/g, '')
          .substring(0, 100);

        const fileName = `${Date.now()}_${cleanFileName}`;
        const filePath = `purchase-orders/${fileName}`;

        console.log('📁 Nom nettoyé:', fileName);

        const { data, error } = await supabase.storage
          .from('purchase-orders-pdfs')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (error) {
          console.error('❌ Erreur Supabase:', error);
          throw new Error(`Erreur upload: ${error.message}`);
        }

        console.log('✅ Upload réussi:', data.path);

        const { data: urlData } = supabase.storage
          .from('purchase-orders-pdfs')
          .getPublicUrl(filePath);

        console.log('🔗 URL générée:', urlData.publicUrl);

        uploadedFiles.push({
          name: file.name,
          cleanName: cleanFileName,
          size: file.size,
          type: file.type,
          path: data.path,
          url: urlData.publicUrl,
          uploaded_at: new Date().toISOString()
        });

        console.log('✅ Fichier traité avec succès:', file.name);

      } catch (error) {
        console.error('❌ Erreur upload fichier:', file.name, error);
        
        let errorMessage = `Erreur upload "${file.name}": `;
        
        if (error.message.includes('not found')) {
          errorMessage += 'Bucket "purchase-orders-pdfs" non trouvé. Vérifiez la configuration Supabase.';
        } else if (error.message.includes('unauthorized')) {
          errorMessage += 'Accès non autorisé. Vérifiez les politiques du bucket.';
        } else if (error.message.includes('too large')) {
          errorMessage += 'Fichier trop volumineux (max 50MB).';
        } else {
          errorMessage += error.message;
        }
        
        alert(errorMessage);
      }
    }

    if (uploadedFiles.length > 0) {
      setFormData({...formData, files: [...(formData.files || []), ...uploadedFiles]});
      console.log(`✅ ${uploadedFiles.length}/${files.length} fichier(s) uploadé(s) avec succès`);
      
      if (uploadedFiles.length < files.length) {
        alert(`${uploadedFiles.length}/${files.length} fichiers uploadés avec succès. Voir la console pour les erreurs.`);
      }
    }

    setUploadingFiles(false);
    e.target.value = '';
  };

  const removeFile = async (index) => {
    const fileToRemove = formData.files[index];
    
    if (fileToRemove.path) {
      try {
        const { error } = await supabase.storage
          .from('purchase-orders-pdfs')
          .remove([fileToRemove.path]);
        
        if (error) {
          console.error('❌ Erreur suppression fichier:', error);
        } else {
          console.log('🗑️ Fichier supprimé du storage:', fileToRemove.path);
        }
      } catch (error) {
        console.error('❌ Erreur suppression fichier:', error);
      }
    }
    
    const newFiles = formData.files.filter((_, i) => i !== index);
    setFormData({...formData, files: newFiles});
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
      console.error('❌ Erreur téléchargement:', error);
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

  const getStatusEmoji = (status) => {
    switch (status?.toLowerCase()) {
      case 'approved': return '✅';
      case 'pending': return '⏳';
      case 'rejected': return '❌';
      default: return '⏳';
    }
  };

  const getStatusBadge = (status) => {
    const baseClasses = "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium";
    switch (status?.toLowerCase()) {
      case 'approved':
        return `${baseClasses} bg-green-100 text-green-800 border border-green-200`;
      case 'pending':
        return `${baseClasses} bg-yellow-100 text-yellow-800 border border-yellow-200`;
      case 'rejected':
        return `${baseClasses} bg-red-100 text-red-800 border border-red-200`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800 border border-gray-200`;
    }
  };

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

  const filteredPurchaseOrders = purchaseOrders.filter(po => {
    const searchText = searchTerm.toLowerCase();
    const matchesSearch = 
      po.po_number?.toLowerCase().includes(searchText) ||
      po.client_name?.toLowerCase().includes(searchText) ||
      po.client?.toLowerCase().includes(searchText) ||
      po.submission_no?.toLowerCase().includes(searchText) ||
      po.notes?.toLowerCase().includes(searchText);
    
    const matchesStatus = statusFilter === 'all' || po.status?.toLowerCase() === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const totalAmount = filteredPurchaseOrders.reduce((sum, po) => sum + (po.amount || 0), 0);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        <p className="ml-4 text-indigo-600 font-medium">Chargement des bons d'achat...</p>
      </div>
    );
  }

  // [FORMULAIRE EXISTANT RESTE IDENTIQUE - JE CONTINUE AVEC LA PARTIE PRINCIPALE]

  if (showForm) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <div className="bg-white rounded-xl shadow-lg border border-indigo-200 overflow-hidden">
          
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold">
                  {editingPO ? '✏️ Modifier le Bon d\'Achat' : '➕ Nouveau Bon d\'Achat'}
                </h2>
                <p className="text-indigo-100 text-sm mt-1">
                  {editingPO ? 'Modifiez les informations' : 'Créez un nouveau bon d\'achat'}
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingPO(null);
                    setLinkedPurchases([]);
                    setAvailablePurchases([]);
                    setFormData({
                      client_name: '',
                      po_number: '',
                      submission_no: '',
                      date: new Date().toISOString().split('T')[0],
                      amount: '',
                      status: 'pending',
                      notes: '',
                      additionalNotes: '',
                      files: [],
                      items: []
                    });
                  }}
                  className="w-full sm:w-auto px-4 py-2 bg-white/10 border border-white/20 rounded-lg hover:bg-white/20 text-sm font-medium"
                >
                  ❌ Annuler
                </button>
                <button
                  type="submit"
                  form="po-form"
                  className="w-full sm:w-auto px-4 py-2 bg-white text-indigo-600 rounded-lg hover:bg-gray-100 text-sm font-medium"
                >
                  {editingPO ? '💾 Mettre à jour' : '✨ Créer'}
                </button>
              </div>
            </div>
          </div>

  return (
    <div className="space-y-6 p-4">
      {/* HEADER PRINCIPAL - TOUJOURS VISIBLE */}
      <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-xl shadow-lg p-4 sm:p-6 text-white">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold">💼 Gestion des Bons d'Achat</h2>
            <p className="text-white/90 text-sm sm:text-base mt-1">
              Gérez vos bons d'achat et commandes clients
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            {/* Header du Modal */}
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white p-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold">🚚 Créer un Bon de Livraison</h2>
                  <p className="text-blue-100 mt-1">
                    BA Client: {selectedPOForDelivery?.po_number} • {selectedPOForDelivery?.client_name}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowDeliveryModal(false);
                    setSelectedPOForDelivery(null);
                    setDeliveryFormData({
                      delivery_date: new Date().toISOString().split('T')[0],
                      transport_company: '',
                      transport_number: '',
                      delivery_contact: '',
                      special_instructions: '',
                      items: []
                    });
                  }}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Contenu du Modal */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              {/* Informations de livraison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    📅 Date de livraison *
                  </label>
                  <input
                    type="date"
                    value={deliveryFormData.delivery_date}
                    onChange={(e) => setDeliveryFormData({...deliveryFormData, delivery_date: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    👤 Contact de livraison
                  </label>
                  <input
                    type="text"
                    value={deliveryFormData.delivery_contact}
                    onChange={(e) => setDeliveryFormData({...deliveryFormData, delivery_contact: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Nom du contact sur place"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    🚚 Transporteur
                  </label>
                  <select
                    value={deliveryFormData.transport_company}
                    onChange={(e) => setDeliveryFormData({...deliveryFormData, transport_company: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Sélectionner...</option>
                    <option value="Purolator">Purolator</option>
                    <option value="Dicom">Dicom</option>
                    <option value="FedEx">FedEx</option>
                    <option value="UPS">UPS</option>
                    <option value="Postes Canada">Postes Canada</option>
                    <option value="Transport TMT">Transport TMT</option>
                    <option value="Client">Ramassage Client</option>
                    <option value="Autre">Autre</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    📦 N° de suivi
                  </label>
                  <input
                    type="text"
                    value={deliveryFormData.transport_number}
                    onChange={(e) => setDeliveryFormData({...deliveryFormData, transport_number: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Numéro de tracking"
                  />
                </div>
              </div>

              {/* Instructions spéciales */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  📝 Instructions spéciales
                </label>
                <textarea
                  value={deliveryFormData.special_instructions}
                  onChange={(e) => setDeliveryFormData({...deliveryFormData, special_instructions: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows="3"
                  placeholder="Instructions de livraison, notes importantes..."
                />
              </div>

              {/* Articles à livrer */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">📦 Articles à livrer</h3>
                
                {/* Historique des livraisons */}
                {deliverySlips.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-blue-700 font-medium mb-2">
                      📋 Historique: {deliverySlips.length} livraison(s) effectuée(s)
                    </p>
                    <div className="space-y-1">
                      {deliverySlips.slice(0, 3).map(slip => (
                        <div key={slip.id} className="text-xs text-blue-600">
                          • {slip.delivery_number} - {formatDate(slip.delivery_date)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-gray-50 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-200">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">Article</th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-700 uppercase">Qté Totale</th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-700 uppercase">Déjà Livré</th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-700 uppercase">Restant</th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-700 uppercase">À Livrer</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {deliveryFormData.items.map((item, index) => {
                        const remaining = (item.quantity || 0) - (item.delivered_quantity || 0);
                        return (
                          <tr key={index} className={remaining <= 0 ? 'bg-green-50' : ''}>
                            <td className="px-4 py-3">
                              <div className="text-sm font-medium text-gray-900">{item.product_id || 'N/A'}</div>
                              <div className="text-xs text-gray-500">{item.description}</div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-sm font-medium">{item.quantity || 0}</span>
                              <span className="text-xs text-gray-500 ml-1">{item.unit}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-sm">{item.delivered_quantity || 0}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`text-sm font-medium ${remaining > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                                {remaining}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {remaining > 0 ? (
                                <input
                                  type="number"
                                  min="0"
                                  max={remaining}
                                  value={item.quantity_to_deliver || 0}
                                  onChange={(e) => {
                                    const newItems = [...deliveryFormData.items];
                                    newItems[index].quantity_to_deliver = Math.min(
                                      parseFloat(e.target.value) || 0,
                                      remaining
                                    );
                                    setDeliveryFormData({...deliveryFormData, items: newItems});
                                  }}
                                  className="w-20 p-1 border border-gray-300 rounded text-center"
                                />
                              ) : (
                                <span className="text-green-600 text-sm">✅ Complet</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Footer du Modal */}
            <div className="bg-gray-50 px-6 py-4 border-t">
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-600">
                  {deliveryFormData.items.filter(i => i.quantity_to_deliver > 0).length} article(s) sélectionné(s)
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowDeliveryModal(false);
                      setSelectedPOForDelivery(null);
                    }}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={createDeliverySlip}
                    disabled={!deliveryFormData.items.some(i => i.quantity_to_deliver > 0)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Printer className="w-4 h-4" />
                    Créer et Imprimer BL
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HEADER EXISTANT */}
      <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-xl shadow-lg p-4 sm:p-6 text-white">
        {/* ... header existant ... */}
      </div>

      {/* BARRE DE RECHERCHE EXISTANTE */}
      <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6 border border-gray-200">
        {/* ... barre de recherche existante ... */}
      </div>

      {/* TABLEAU DESKTOP MODIFIÉ */}
      <div className="hidden lg:block bg-white shadow-lg overflow-hidden rounded-lg border border-gray-200">
        {filteredPurchaseOrders.length === 0 ? (
          <div className="text-center py-12">
            {/* ... message vide existant ... */}
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Bon d'achat
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client & Description
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Montant
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statut
                </th>
                {/* 🆕 NOUVELLE COLONNE */}
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Livraison
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fichiers
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-40">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPurchaseOrders.map((po) => (
                <tr key={po.id} className="hover:bg-gray-50 transition-colors">
                  {/* ... colonnes existantes ... */}
                  <td className="px-3 py-4 whitespace-nowrap">
                    <div className="text-sm space-y-1">
                      <div className="bg-indigo-100 text-indigo-800 px-2 py-1 rounded text-xs font-medium inline-block">
                        📄 {po.po_number || 'N/A'}
                      </div>
                      {po.submission_no && (
                        <div className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium inline-block ml-1">
                          📋 {po.submission_no}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <div className="text-sm">
                      <div className="font-medium text-gray-900">{po.client_name || po.client || 'N/A'}</div>
                      <div className="text-gray-500 truncate max-w-xs" title={po.notes || po.description}>
                        {po.notes || po.description || 'Aucune description'}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                    {formatDate(po.date || po.created_at)}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-medium text-green-600">
                      {formatCurrency(po.amount)}
                    </div>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      po.status?.toLowerCase() === 'approved' ? 'bg-green-100 text-green-800' :
                      po.status?.toLowerCase() === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      po.status?.toLowerCase() === 'rejected' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {po.status?.toLowerCase() === 'approved' ? '✅' :
                       po.status?.toLowerCase() === 'pending' ? '⏳' :
                       po.status?.toLowerCase() === 'rejected' ? '❌' : '❓'}
                    </span>
                  </td>
                  {/* 🆕 NOUVELLE COLONNE LIVRAISON */}
                  <td className="px-3 py-4 whitespace-nowrap text-center">
                    {getDeliveryBadge(getDeliveryStatus(po))}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                    {po.files && po.files.length > 0 ? (
                      <div className="flex items-center justify-center">
                        <FileText className="w-4 h-4 mr-1" />
                        {po.files.length}
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-center">
                    <div className="flex justify-center space-x-1">
                      {/* 🆕 NOUVEAU BOUTON LIVRAISON */}
                      {po.status?.toLowerCase() === 'approved' && (
                        <button
                          onClick={() => openDeliveryModal(po)}
                          className="bg-purple-100 text-purple-700 hover:bg-purple-200 p-2 rounded-lg transition-colors"
                          title="Gérer les livraisons"
                        >
                          <Truck className="w-4 h-4" />
                        </button>
                      )}
                      {po.status?.toLowerCase() === 'pending' && (
                        <>
                          <button
                            onClick={() => handleStatusChange(po.id, 'approved')}
                            className="bg-green-100 text-green-700 hover:bg-green-200 p-2 rounded-lg transition-colors"
                            title="Approuver"
                          >
                            ✅
                          </button>
                          <button
                            onClick={() => handleStatusChange(po.id, 'rejected')}
                            className="bg-red-100 text-red-700 hover:bg-red-200 p-2 rounded-lg transition-colors"
                            title="Rejeter"
                          >
                            ❌
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleEdit(po)}
                        className="bg-blue-100 text-blue-700 hover:bg-blue-200 p-2 rounded-lg transition-colors"
                        title="Modifier"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(po.id)}
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

      {/* VUE MOBILE MODIFIÉE */}
      <div className="lg:hidden space-y-4">
        {filteredPurchaseOrders.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            {/* ... message vide existant ... */}
          </div>
        ) : (
          filteredPurchaseOrders.map((po) => (
            <div key={po.id} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
              {/* ... carte existante avec ajout du bouton livraison ... */}
              <div className="bg-gray-50 px-4 py-3 flex gap-2">
                <button
                  onClick={() => handleEdit(po)}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  ✏️ Modifier
                </button>
                {po.status?.toLowerCase() === 'approved' && (
                  <button
                    onClick={() => openDeliveryModal(po)}
                    className="flex-1 bg-purple-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
                  >
                    🚚 Livraison
                  </button>
                )}
                {po.status?.toLowerCase() === 'pending' && (
                  <button
                    onClick={() => handleStatusChange(po.id, 'approved')}
                    className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                  >
                    ✅ Approuver
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-700">
          📊 {purchaseOrders.length} bons d'achat • {submissions.length} soumissions disponibles
        </p>
      </div>
    </div>
  );
}
