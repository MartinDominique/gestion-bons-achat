import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const DeliverySlipModal = ({ isOpen, onClose, purchaseOrder, onRefresh }) => {
  const [formData, setFormData] = useState({
    delivery_date: new Date().toISOString().split('T')[0],
    transport_company: '',
    tracking_number: '',
    delivery_contact: '',
    special_instructions: '',
    items: []
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasExistingSubmission, setHasExistingSubmission] = useState(false);

  // Vérifier si le BA a déjà une soumission attribuée
  const checkExistingSubmission = async (poId) => {
    if (!poId) return false;
    
    try {
      // Récupérer le BA pour voir s'il a un submission_no
      const { data: poData, error } = await supabase
        .from('purchase_orders')
        .select('submission_no')
        .eq('id', poId)
        .single();
      
      if (error) throw error;
      
      const hasSubmission = poData?.submission_no && poData.submission_no.trim() !== '';
      setHasExistingSubmission(hasSubmission);
      return hasSubmission;
      
    } catch (error) {
      console.error('Erreur vérification soumission:', error);
      return false;
    }
  };

  // Charger les articles depuis client_po_items
  const loadPOItems = async () => {
    if (!purchaseOrder?.id) return;

    try {
      console.log('Chargement articles pour BA:', purchaseOrder.id);
      
      // Vérifier d'abord qu'il y a une soumission attribuée
      const hasSubmission = await checkExistingSubmission(purchaseOrder.id);
      
      if (!hasSubmission) {
        setError('Ce bon d\'achat n\'a pas de soumission attribuée. Impossible de créer une livraison.');
        return;
      }

      // Charger les articles depuis client_po_items
      const { data: poItems, error: itemsError } = await supabase
        .from('client_po_items')
        .select('*')
        .eq('purchase_order_id', purchaseOrder.id)
        .order('product_id');
      
      if (itemsError) {
        console.error('Erreur chargement articles:', itemsError);
        setError('Erreur lors du chargement des articles');
        return;
      }
      
      if (!poItems || poItems.length === 0) {
        setError('Aucun article trouvé pour ce bon d\'achat');
        return;
      }

      // Préparer les articles avec quantités restantes
      const itemsWithSelection = poItems.map(item => {
        const deliveredQty = parseFloat(item.delivered_quantity) || 0;
        const totalQty = parseFloat(item.quantity) || 0;
        const remainingQty = Math.max(0, totalQty - deliveredQty);
        
        return {
          id: item.id,
          product_id: item.product_id,
          description: item.description,
          quantity: totalQty,
          unit: item.unit || 'unité',
          price: parseFloat(item.selling_price) || 0,
          delivered_quantity: deliveredQty,
          remaining_quantity: remainingQty,
          selected: false,
          quantity_to_deliver: 0
        };
      });
      
      setFormData(prev => ({ ...prev, items: itemsWithSelection }));
      console.log(`Articles chargés: ${poItems.length}`);
      
    } catch (error) {
      console.error('Erreur générale chargement:', error);
      setError('Erreur lors du chargement des données');
    }
  };

  // Charger les données quand le modal s'ouvre
  useEffect(() => {
    if (isOpen && purchaseOrder) {
      loadPOItems();
    }
  }, [isOpen, purchaseOrder]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setFormData({
        delivery_date: new Date().toISOString().split('T')[0],
        transport_company: '',
        tracking_number: '',
        delivery_contact: '',
        special_instructions: '',
        items: []
      });
      setError('');
      setHasExistingSubmission(false);
    }
  }, [isOpen]);

  // Sélectionner/désélectionner un article
  const handleItemSelect = (itemId) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item => 
        item.id === itemId 
          ? { 
              ...item, 
              selected: !item.selected,
              quantity_to_deliver: !item.selected ? item.remaining_quantity : 0
            }
          : item
      )
    }));
  };

  // Changer la quantité à livrer
  const handleQuantityChange = (itemId, newQuantity) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id === itemId) {
          const qty = Math.min(
            Math.max(0, parseFloat(newQuantity) || 0), 
            item.remaining_quantity
          );
          return {
            ...item,
            quantity_to_deliver: qty,
            selected: qty > 0
          };
        }
        return item;
      })
    }));
  };

  // Générer le PDF complet avec votre template TMT
  const generatePDF = async (deliverySlip, selectedItems) => {
    console.log('Génération PDF avec 2 copies pour:', deliverySlip);
    
    // Récupérer les informations du BO associé
    let purchaseOrderInfo = '';
    if (purchaseOrder.purchase_order_number) {
      const { data: poData } = await supabase
        .from('purchase_orders')
        .select('po_number, supplier_name, order_date')
        .eq('po_number', purchaseOrder.purchase_order_number)
        .single();
      
      if (poData) {
        purchaseOrderInfo = `BO #${poData.po_number} - ${poData.supplier_name}`;
      }
    }

    // Récupérer les livraisons antérieures
    const { data: previousDeliveries } = await supabase
      .from('delivery_slip_items')
      .select(`
        quantity_delivered,
        notes,
        delivery_slips!inner(delivery_number, delivery_date, purchase_order_id)
      `)
      .eq('delivery_slips.purchase_order_id', purchaseOrder.id)
      .neq('delivery_slips.delivery_number', deliverySlip.delivery_number);

    // Nettoyer les notes une seule fois
    let cleanNotes = purchaseOrder.notes || '';
    cleanNotes = cleanNotes.split('\n')
      .filter(line => !line.includes('[LIVRAISON'))
      .join('\n');
    cleanNotes = cleanNotes.split('\n')
      .filter(line => !line.match(/\[\d+\/\d+\/\d+\]\s*Bon de livraison.*créé/i))
      .join('\n');
    cleanNotes = cleanNotes.replace(/\s+/g, ' ').trim();

    // Template d'impression avec votre design TMT
    const generateCopyContent = (copyType, items, isLastCopy = false) => {
      const ITEMS_PER_PAGE = 30; // Ajusté par Martin
      
      // Diviser les articles en groupes par page
      const pageGroups = [];
      for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) {
        pageGroups.push(items.slice(i, i + ITEMS_PER_PAGE));
      }
      
      // Fonction pour générer UNE page avec hauteur contrôlée
      const generateSinglePage = (pageItems, pageNumber, totalPages) => {
        // LOGIQUE : Éviter page-break sur la toute dernière page du document
        const isVeryLastPage = isLastCopy && (pageNumber === totalPages);
        
        return `
          <!-- PAGE ${pageNumber} ${copyType} -->
          <div class="print-page" style="height: 10.5in; display: block; position: relative; ${isVeryLastPage ? 'page-break-after: avoid;' : ''}">
            
            <!-- HEADER FIXE (2.2 inches - ajusté par Martin) -->
            <div style="height: 2.2in; overflow: hidden;">
              <div class="header" style="display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px;">
                <div style="display: flex; align-items: start; gap: 20px;">
                  <div style="width: 140px; height: 100px;">
                    <img src="/logo.png" alt="Services TMT" style="width: 100%; height: 100%; object-fit: contain;" onerror="this.style.display='none'">
                  </div>
                  <div style="font-size: 11px; line-height: 1.2;">
                    <div style="font-size: 14px; font-weight: bold; margin-bottom: 3px;">Services TMT Inc.</div>
                    3195, 42e Rue Nord<br>
                    Saint-Georges, QC G5Z 0V9<br>
                    Tél: (418) 225-3875<br>
                    info.servicestmt@gmail.com
                  </div>
                </div>
                <div style="text-align: right;">
                  <div style="font-size: 20px; font-weight: bold; margin-bottom: 5px;">BON DE LIVRAISON</div>
                  <div style="font-size: 14px; font-weight: bold; margin-bottom: 3px;">${deliverySlip.delivery_number}</div>
                  <div style="font-size: 10px; line-height: 1.2;">
                    Date: ${new Date(formData.delivery_date).toLocaleDateString('fr-CA')}<br>
                    BA Client: ${purchaseOrder.po_number}<br>
                    ${purchaseOrderInfo ? `${purchaseOrderInfo}<br>` : ''}
                    ${purchaseOrder.submission_no ? `Soumission: #${purchaseOrder.submission_no}` : ''}
                  </div>
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px;">
                <div style="border: 1px solid #000; padding: 6px; border-radius: 5px; border-left: 4px solid #000;">
                  <div style="font-weight: bold; font-size: 11px; border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 4px;">Livrer à :</div>
                  <div style="font-size: 10px; line-height: 1.2;">
                    <strong>${purchaseOrder.client_name}</strong><br>
                    ${formData.delivery_contact ? `Contact: ${formData.delivery_contact}<br>` : ''}
                    ${purchaseOrder.delivery_address || purchaseOrder.client_address || 'Adresse de livraison à confirmer'}
                  </div>
                </div>
                <div style="border: 1px solid #000; padding: 6px; border-radius: 5px; border-left: 4px solid #000;">
                  <div style="font-weight: bold; font-size: 11px; border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 4px;">Informations de transport:</div>
                  <div style="font-size: 10px; line-height: 1.2;">
                    Transporteur: <strong>${formData.transport_company || 'Non spécifié'}</strong><br>
                    N° de suivi: <strong>${formData.tracking_number || 'N/A'}</strong><br>
                    Date de livraison: <strong>${new Date(formData.delivery_date).toLocaleDateString('fr-CA')}</strong>
                  </div>
                </div>
              </div>

              ${cleanNotes ? `
              <div style="border: 1px solid #000; padding: 4px 8px; border-radius: 3px; margin-bottom: 8px; border-left: 3px solid #000; font-size: 10px;">
              <strong>NOTES:</strong> ${cleanNotes.replace(/[^\x00-\x7F]/g, "")}
            </div>
            ` : ''}
            </div>

            <!-- BODY - TABLEAU (6.8 inches - ajusté par Martin) -->
            <div style="height: 6.8in; overflow: hidden; border: 1px solid #000; border-radius: 5px; border-left: 4px solid #000; padding: 8px; background: #fff;">
              <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; table-layout: fixed;">
                <thead>
                  <tr>
                    <th style="width: 15%; background: #f59e0b; color: white; padding: 4px; text-align: left; font-size: 10px; font-weight: bold; border-right: 1px solid #000;">Code</th>
                    <th style="width: 65%; background: #f59e0b; color: white; padding: 4px; text-align: left; font-size: 10px; font-weight: bold; border-right: 1px solid #000;">Description</th>
                    <th style="width: 5%; background: #f59e0b; color: white; padding: 4px; text-align: center; font-size: 10px; font-weight: bold; border-right: 1px solid #000;">Unité</th>
                    <th style="width: 5%; background: #f59e0b; color: white; padding: 4px; text-align: center; font-size: 10px; font-weight: bold; border-right: 1px solid #000;">Qté Cmd</th>
                    <th style="width: 5%; background: #f59e0b; color: white; padding: 4px; text-align: center; font-size: 10px; font-weight: bold; border-right: 1px solid #000;">Qté Liv.</th>
                    <th style="width: 5%; background: #f59e0b; color: white; padding: 4px; text-align: center; font-size: 10px; font-weight: bold;">Qté Souff.</th>
                  </tr>
                </thead>
                <tbody>
                  ${pageItems.map(item => `
                    <tr style="height: 20px;">
                      <td style="padding: 3px; border-bottom: 1px solid #000; border-right: 1px solid #000; font-size: 12px; vertical-align: top; overflow: hidden;"><strong>${item.product_id}</strong></td>
                      <td style="padding: 3px; border-bottom: 1px solid #000; border-right: 1px solid #000; font-size: 12px; vertical-align: top; overflow: hidden;">
                        ${item.description}
                      </td>
                      <td style="padding: 3px; border-bottom: 1px solid #000; border-right: 1px solid #000; font-size: 12px; text-align: center; vertical-align: top;">${item.unit || 'UN'}</td>
                      <td style="padding: 3px; border-bottom: 1px solid #000; border-right: 1px solid #000; font-size: 12px; text-align: center; vertical-align: top;">${item.quantity}</td>
                      <td style="padding: 3px; border-bottom: 1px solid #000; border-right: 1px solid #000; font-size: 12px; text-align: center; vertical-align: top;"><strong>${item.quantity_delivered_now}</strong></td>
                      <td style="padding: 3px; border-bottom: 1px solid #000; font-size: 12px; text-align: center; vertical-align: top;">${item.remaining_after_delivery >= 0 ? item.remaining_after_delivery : '0'}</td>
                    </tr>
                  `).join('')}
                  
                  <!-- Remplir l'espace vide si moins de 30 articles -->
                  ${Array.from({length: Math.max(0, ITEMS_PER_PAGE - pageItems.length)}, () => `
                    <tr style="height: 20px;">
                      <td style="padding: 3px; border-bottom: 1px solid #000; border-right: 1px solid #000;">&nbsp;</td>
                      <td style="padding: 3px; border-bottom: 1px solid #000; border-right: 1px solid #000;">&nbsp;</td>
                      <td style="padding: 3px; border-bottom: 1px solid #000; border-right: 1px solid #000;">&nbsp;</td>
                      <td style="padding: 3px; border-bottom: 1px solid #000; border-right: 1px solid #000;">&nbsp;</td>
                      <td style="padding: 3px; border-bottom: 1px solid #000; border-right: 1px solid #000;">&nbsp;</td>
                      <td style="padding: 3px; border-bottom: 1px solid #000;">&nbsp;</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <!-- FOOTER FIXE (1.3 inches - ajusté par Martin) -->
            <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 1.3in; border-top: 1px solid #000; padding-top: 10px;">
              <div style="text-align: center; margin-bottom: 10px; padding: 8px; background: #f0f0f0; font-weight: bold; font-size: 12px; border: 2px solid #000; text-transform: uppercase; letter-spacing: 1px;">
                ${copyType === 'CLIENT' ? 'COPIE CLIENT' : 'COPIE SERVICES TMT'}
              </div>
              
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div style="text-align: center;">
                  <div style="border-top: 2px solid #000; width: 120px; margin: 10px auto 3px auto;"></div>
                  <div style="font-size: 10px; font-weight: bold;">SIGNATURE CLIENT</div>
                </div>
                <div style="font-size: 10px;">
                  Date de réception: ___________________
                </div>
              </div>

              ${formData.special_instructions && formData.special_instructions !== 'Rien' ? `
                <div style="border: 1px solid #000; padding: 4px 6px; border-radius: 3px; margin-bottom: 6px; border-left: 3px solid #000; font-size: 8px;">
                  <strong>INSTRUCTIONS SPÉCIALES:</strong> ${formData.special_instructions}
                </div>
              ` : ''}

              <div style="font-size: 8px; text-align: center; font-style: italic; line-height: 1.1;">
                La marchandise demeure la propriété de Services TMT Inc. jusqu'au paiement complet.<br>
                Toute réclamation doit être faite dans les 48 heures suivant la réception.
              </div>
            </div>
          </div>
        `;
      };
      
      // Générer toutes les pages pour cette copie
      return pageGroups.map((pageItems, index) => 
        generateSinglePage(pageItems, index + 1, pageGroups.length)
      ).join('');
    };

    // Préparer les données des articles
    const allOrderItems = formData.items.map(item => {
      const deliveredItem = selectedItems.find(si => si.product_id === item.product_id);
      const quantityDeliveredNow = deliveredItem ? deliveredItem.quantity_to_deliver : 0;
      const remainingAfterDelivery = item.remaining_quantity - quantityDeliveredNow;
      
      const previousDeliveryInfo = previousDeliveries
        ?.filter(d => d.notes && d.notes.includes(item.product_id))
        ?.map(d => `[${d.delivery_slips.delivery_number}] - ${new Date(d.delivery_slips.delivery_date).toLocaleDateString('fr-CA')}`)
        ?.join('<br>') || '';
      
      return {
        ...item,
        quantity_delivered_now: quantityDeliveredNow,
        remaining_after_delivery: Math.max(0, remainingAfterDelivery),
        previousDeliveryInfo: previousDeliveryInfo
      };
    });

    const printWindow = window.open('', '_blank');
    
    const fullHTML = `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>${deliverySlip.delivery_number}.pdf</title>
        <style>
          @page { size: letter; margin: 0.25in; }
          body { font-family: Arial, sans-serif; margin: 0; padding: 10px; color: #000; font-size: 11px; line-height: 1.2; }
          .copy-container { margin-bottom: 20px; page-break-inside: avoid; page-break-after: always; }
          @media print {
            body { margin: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        ${generateCopyContent('CLIENT', allOrderItems, false)}
        ${generateCopyContent('STMT', allOrderItems, true)}
      </body>
      </html>
    `;
    
    printWindow.document.write(fullHTML);
    printWindow.document.close();
    
    // IMPRESSION DIRECTE
    printWindow.onload = function() {
      setTimeout(() => {
        printWindow.print();
        
        const closeAttempts = [1000, 3000, 5000];
        closeAttempts.forEach(delay => {
          setTimeout(() => {
            if (!printWindow.closed) {
              printWindow.close();
            }
          }, delay);
        });
        
      }, 100);
    };
  };

  // Générer le numéro de bon de livraison
  const generateDeliveryNumber = async () => {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const prefix = `BL-${year}${month}`;
    
    const { data } = await supabase
      .from('delivery_slips')
      .select('delivery_number')
      .like('delivery_number', `${prefix}%`)
      .order('delivery_number', { ascending: false })
      .limit(1);
    
    if (!data || data.length === 0) {
      return `${prefix}-001`;
    }
    
    const lastNum = parseInt(data[0].delivery_number.split('-')[2]) || 0;
    return `${prefix}-${String(lastNum + 1).padStart(3, '0')}`;
  };

  // Soumettre le formulaire
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const selectedItems = formData.items.filter(item => item.selected && item.quantity_to_deliver > 0);
      
      if (selectedItems.length === 0) {
        setError('Veuillez sélectionner au moins un article à livrer');
        return;
      }

      // Générer le numéro de bon de livraison
      const deliveryNumber = await generateDeliveryNumber();

      // 1. Créer le bon de livraison principal
      const { data: deliverySlip, error: deliveryError } = await supabase
        .from('delivery_slips')
        .insert({
          delivery_number: deliveryNumber,
          purchase_order_id: purchaseOrder.id,
          delivery_date: formData.delivery_date,
          transport_company: formData.transport_company || null,
          transport_number: formData.tracking_number || null, // Correction: transport_number au lieu de tracking_number
          delivery_contact: formData.delivery_contact || null,
          special_instructions: formData.special_instructions || null,
          status: 'prepared'
        })
        .select()
        .single();

      if (deliveryError) {
        throw new Error(`Erreur création bon de livraison: ${deliveryError.message}`);
      }

      // 2. Ajouter les articles du bon de livraison
      const deliveryItems = selectedItems.map(item => ({
        delivery_slip_id: deliverySlip.id,
        client_po_item_id: item.id,
        quantity_delivered: item.quantity_to_deliver,
        notes: `${item.product_id} - ${item.description}` // Stocker les détails dans notes
      }));

      const { error: itemsError } = await supabase
        .from('delivery_slip_items')
        .insert(deliveryItems);

      if (itemsError) {
        throw new Error(`Erreur ajout articles: ${itemsError.message}`);
      }

      // 3. Mettre à jour les quantités livrées dans client_po_items
      for (const item of selectedItems) {
        const newDeliveredQty = item.delivered_quantity + item.quantity_to_deliver;
        
        const { error: updateError } = await supabase
          .from('client_po_items')
          .update({ 
            delivered_quantity: newDeliveredQty,
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id);

        if (updateError) {
          console.error(`Erreur MAJ quantité article ${item.id}:`, updateError);
        }
      }

      // 4. Mettre à jour le statut du BA si nécessaire
      const allItemsDelivered = formData.items.every(item => {
        if (selectedItems.find(si => si.id === item.id)) {
          return (item.delivered_quantity + item.quantity_to_deliver) >= item.quantity;
        }
        return item.delivered_quantity >= item.quantity;
      });

      const newStatus = allItemsDelivered ? 'delivered' : 'partially_delivered';
      
      await supabase
        .from('purchase_orders')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', purchaseOrder.id);

      console.log(`Bon de livraison ${deliveryNumber} créé avec succès!`);
      
      // Générer le PDF complet avec votre template TMT
      await generatePDF(deliverySlip, selectedItems);
      
      if (onRefresh) onRefresh();
      onClose();

    } catch (error) {
      console.error('Erreur création bon de livraison:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const selectedItems = formData.items.filter(item => item.selected);
  const totalItems = selectedItems.reduce((sum, item) => sum + item.quantity_to_deliver, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-blue-600 text-white px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold">
            Créer un Bon de Livraison - BA #{purchaseOrder?.po_number}
          </h2>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {!hasExistingSubmission && (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
              <div className="flex">
                <div className="flex-shrink-0">⚠️</div>
                <div className="ml-3">
                  <p className="text-sm text-yellow-700">
                    <strong>Attention:</strong> Ce bon d'achat n'a pas de soumission attribuée.
                    Vous devez d'abord attribuer une soumission avant de pouvoir créer une livraison.
                  </p>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Informations générales */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date de livraison *
                </label>
                <input
                  type="date"
                  value={formData.delivery_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, delivery_date: e.target.value }))}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Entreprise de transport
                </label>
                <input
                  type="text"
                  value={formData.transport_company}
                  onChange={(e) => setFormData(prev => ({ ...prev, transport_company: e.target.value }))}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: Purolator, UPS, FedEx..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Numéro de transport
                </label>
                <input
                  type="text"
                  value={formData.tracking_number}
                  onChange={(e) => setFormData(prev => ({ ...prev, tracking_number: e.target.value }))}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Numéro de transport du transporteur"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact livraison
                </label>
                <input
                  type="text"
                  value={formData.delivery_contact}
                  onChange={(e) => setFormData(prev => ({ ...prev, delivery_contact: e.target.value }))}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Nom du contact pour la réception"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Instructions spéciales
              </label>
              <textarea
                value={formData.special_instructions}
                onChange={(e) => setFormData(prev => ({ ...prev, special_instructions: e.target.value }))}
                rows={2}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Instructions particulières pour la livraison..."
              />
            </div>

            {/* Sélection des articles */}
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                Sélection des articles à livrer
              </h3>

              {formData.items.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <p>Aucun article disponible pour ce bon d'achat</p>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="max-h-80 overflow-y-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Sélectionner
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Article
                          </th>
                          <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Qté Restante
                          </th>
                          <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Qté à Livrer
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {formData.items.map((item) => (
                          <tr key={item.id} className={item.selected ? 'bg-blue-50' : ''}>
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={item.selected}
                                onChange={() => handleItemSelect(item.id)}
                                disabled={item.remaining_quantity === 0}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {item.product_id}
                                </div>
                                <div className="text-sm text-gray-500">
                                  {item.description}
                                </div>
                                <div className="text-xs text-gray-400">
                                  {item.unit} | Déjà livré: {item.delivered_quantity}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                item.remaining_quantity > 0 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {item.remaining_quantity}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {item.remaining_quantity > 0 ? (
                                <input
                                  type="number"
                                  min="0"
                                  max={item.remaining_quantity}
                                  step="0.01"
                                  value={item.quantity_to_deliver}
                                  onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                                  className="w-20 p-1 text-center border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                                />
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Résumé de la sélection */}
              {selectedItems.length > 0 && (
                <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-medium text-blue-800 mb-2">Résumé de la livraison</h4>
                  <div className="text-sm text-blue-700">
                    <p>Articles sélectionnés: {selectedItems.length}</p>
                    <p>Quantité totale à livrer: {totalItems.toFixed(2)}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Boutons d'action */}
            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={isLoading}
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isLoading || selectedItems.length === 0 || !hasExistingSubmission}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Création...</span>
                  </>
                ) : (
                  <span>Créer le Bon de Livraison</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default DeliverySlipModal;
