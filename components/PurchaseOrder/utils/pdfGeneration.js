
import { supabase } from '../../../lib/supabase';
import { formatDate, formatCurrency } from './formatting';

export const generateDeliveryNumber = async () => {
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

export const generatePDF = async (deliverySlip, selectedItems, formData, clientPO) => {
  // Insérez ici toute la fonction generatePDF de DeliverySlipModal.js
      // Générer le PDF (garder la même logique)
  const generatePDF = async (deliverySlip, selectedItems) => {
    console.log('Génération PDF avec 2 copies pour:', deliverySlip);
    
    // Récupérer les informations du BO associé
    let purchaseOrderInfo = '';
    if (clientPO.purchase_order_number) {
      const { data: poData } = await supabase
        .from('purchase_orders')
        .select('po_number, supplier_name, order_date')
        .eq('po_number', clientPO.purchase_order_number)
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
      .eq('delivery_slips.purchase_order_id', clientPO.id)
      .neq('delivery_slips.delivery_number', deliverySlip.delivery_number);

    // Nettoyer les notes une seule fois
    let cleanNotes = clientPO.notes || '';
    cleanNotes = cleanNotes.split('\n')
      .filter(line => !line.includes('[LIVRAISON'))
      .join('\n');
    cleanNotes = cleanNotes.split('\n')
      .filter(line => !line.match(/\[\d+\/\d+\/\d+\]\s*Bon de livraison.*créé/i))
      .join('\n');
    cleanNotes = cleanNotes.replace(/\s+/g, ' ').trim();

    // SOLUTION FINALE - Approche Table Fixe - VERSION MODIFIÉE MARTIN
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
                  <div style="width: 120px; height: 80px;">
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
                    BA Client: ${clientPO.po_number}<br>
                    ${purchaseOrderInfo ? `${purchaseOrderInfo}<br>` : ''}
                    ${clientPO.submission_no ? `Soumission: #${clientPO.submission_no}` : ''}
                  </div>
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px;">
                <div style="border: 1px solid #000; padding: 6px; border-radius: 5px; border-left: 4px solid #000;">
                  <div style="font-weight: bold; font-size: 11px; border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 4px;">Livrer à :</div>
                  <div style="font-size: 10px; line-height: 1.2;">
                    <strong>${clientPO.client_name}</strong><br>
                    ${formData.delivery_contact ? `Contact: ${formData.delivery_contact}<br>` : ''}
                    ${clientPO.delivery_address || clientPO.client_address || 'Adresse de livraison à confirmer'}
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
                    <th style="width: 15%; background: #f59e0b; color: white; padding: 4px; text-align: left; font-size: 9px; font-weight: bold; border-right: 1px solid #000;">Code</th>
                    <th style="width: 65%; background: #f59e0b; color: white; padding: 4px; text-align: left; font-size: 9px; font-weight: bold; border-right: 1px solid #000;">Description</th>
                    <th style="width: 5%; background: #f59e0b; color: white; padding: 4px; text-align: center; font-size: 9px; font-weight: bold; border-right: 1px solid #000;">Unité</th>
                    <th style="width: 5%; background: #f59e0b; color: white; padding: 4px; text-align: center; font-size: 9px; font-weight: bold; border-right: 1px solid #000;">Qté Cmd</th>
                    <th style="width: 5%; background: #f59e0b; color: white; padding: 4px; text-align: center; font-size: 9px; font-weight: bold; border-right: 1px solid #000;">Qté Liv.</th>
                    <th style="width: 5%; background: #f59e0b; color: white; padding: 4px; text-align: center; font-size: 9px; font-weight: bold;">Qté Souff.</th>
                  </tr>
                </thead>
                <tbody>
                  ${pageItems.map(item => `
                    <tr style="height: 20px;">
                      <td style="padding: 3px; border-bottom: 1px solid #000; border-right: 1px solid #000; font-size: 8px; vertical-align: top; overflow: hidden;"><strong>${item.product_id}</strong></td>
                      <td style="padding: 3px; border-bottom: 1px solid #000; border-right: 1px solid #000; font-size: 8px; vertical-align: top; overflow: hidden;">
                        ${item.description}
                      </td>
                      <td style="padding: 3px; border-bottom: 1px solid #000; border-right: 1px solid #000; font-size: 8px; text-align: center; vertical-align: top;">${item.unit || 'UN'}</td>
                      <td style="padding: 3px; border-bottom: 1px solid #000; border-right: 1px solid #000; font-size: 8px; text-align: center; vertical-align: top;">${item.quantity}</td>
                      <td style="padding: 3px; border-bottom: 1px solid #000; border-right: 1px solid #000; font-size: 8px; text-align: center; vertical-align: top;"><strong>${item.quantity_delivered_now}</strong></td>
                      <td style="padding: 3px; border-bottom: 1px solid #000; font-size: 8px; text-align: center; vertical-align: top;">${item.remaining_after_delivery >= 0 ? item.remaining_after_delivery : '0'}</td>
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

              <div style="font-size: 7px; text-align: center; font-style: italic; line-height: 1.1;">
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
  
  // FONCTION MODIFIÉE - Soumettre et sauvegarder (simplifié avec client_po_items)
  const handleSubmit = async () => {
    const selectedItems = formData.items.filter(
      item => item.selected && item.quantity_to_deliver > 0
    );
    
    if (selectedItems.length === 0) {
      alert("Veuillez sélectionner au moins un article à livrer");
      return;
    }
    
    try {
      console.log("Création du bon de livraison...");
      
      // 1. Générer le numéro de bon de livraison
      const deliveryNumber = await generateDeliveryNumber();
      
      // 2. Créer le bon de livraison
      const { data: deliverySlip, error: slipError } = await supabase
        .from('delivery_slips')
        .insert({
          purchase_order_id: clientPO.id,
          delivery_number: deliveryNumber,
          delivery_date: formData.delivery_date,
          transport_number: formData.tracking_number,
          transport_company: formData.transport_company || 'Purolator',
          delivery_contact: formData.delivery_contact,
          special_instructions: formData.special_instructions,
          status: 'pending'
        })
        .select()
        .single();
      
      if (slipError) {
        console.error('Erreur création bon:', slipError);
        alert('❌ Erreur lors de la création du bon de livraison: ' + slipError.message);
        return;
      }
      
      console.log('Bon de livraison créé:', deliverySlip);
      
      // 3. Créer les lignes de livraison - SIMPLIFIÉ avec les vrais IDs
      const deliveryItems = selectedItems.map(item => {
        // Si c'est depuis client_po_items, utiliser l'ID réel
        // Si c'est depuis submission (fallback), on devra chercher/créer l'ID
        if (!item.from_submission) {
          return {
            delivery_slip_id: deliverySlip.id,
            client_po_item_id: item.id, // ID réel de client_po_items
            quantity_delivered: item.quantity_to_deliver,
            notes: `${item.product_id} - ${item.description}`
          };
        } else {
          // Fallback pour ancien système - garder la logique complexe
          return {
            delivery_slip_id: deliverySlip.id,
            client_po_item_id: 1, // Placeholder - À CORRIGER si nécessaire
            quantity_delivered: item.quantity_to_deliver,
            notes: `${item.product_id} - ${item.description}`
          };
        }
      });
      
      const { error: itemsError } = await supabase
        .from('delivery_slip_items')
        .insert(deliveryItems);
      
      if (itemsError) {
        console.error('Erreur création items:', itemsError);
        alert('❌ Erreur sauvegarde articles: ' + itemsError.message);
        return;
      }
      
      // 4. Le trigger update_delivered_quantities() se charge automatiquement de mettre à jour:
      //    - client_po_items.delivered_quantity
      //    - purchase_orders.status 
      
      console.log(`✅ Bon de livraison ${deliveryNumber} créé - Triggers activés automatiquement`);
      
      // 5. Générer le PDF avec 2 copies et impression directe
      await generatePDF(deliverySlip, selectedItems);
      
      // 6. Rafraîchir et fermer
      if (onRefresh) onRefresh();
      onClose();
      
    } catch (error) {
      console.error('Erreur générale:', error);
      alert('❌ Erreur lors de la création du bon de livraison: ' + error.message);
    }
  };

  // Si le modal n'est pas ouvert, ne rien afficher
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">Créer un Bon de Livraison</h2>
              <p className="text-blue-100 mt-1">
                BA Client: {clientPO?.po_number} • {clientPO?.client_name}
              </p>
            </div>
            <button 
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-lg p-2"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body avec scroll */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          
          {/* Informations de livraison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date de livraison
              </label>
              <input
                type="date"
                value={formData.delivery_date}
                onChange={(e) => setFormData({...formData, delivery_date: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Contact de livraison
              </label>
              <input
                type="text"
                placeholder="Nom du contact"
                value={formData.delivery_contact}
                onChange={(e) => setFormData({...formData, delivery_contact: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Transporteur
              </label>
              <select 
                value={formData.transport_company}
                onChange={(e) => setFormData({...formData, transport_company: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="">Sélectionner...</option>
                <option value="purolator">Purolator</option>
                <option value="dicom">Dicom</option>
                <option value="fedex">FedEx</option>
                <option value="client_pickup">Ramassage client</option>
                <option value="livraison_tmt">Livraison TMT</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                N° de suivi
              </label>
              <input
                type="text"
                placeholder="Numéro de tracking"
                value={formData.tracking_number}
                onChange={(e) => setFormData({...formData, tracking_number: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
          </div>

          {/* Instructions spéciales */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Instructions spéciales
            </label>
            <textarea
              placeholder="Instructions particulières pour la livraison..."
              value={formData.special_instructions}
              onChange={(e) => setFormData({...formData, special_instructions: e.target.value})}
              className="w-full px-3 py-2 border rounded-lg h-20"
            />
          </div>

          {/* Articles à livrer */}
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-4">
              Articles à livrer ({formData.items.filter(i => i.selected).length}/{formData.items.length} sélectionnés)
            </h3>
            
            {formData.items.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>Aucun article trouvé</p>
                <p className="text-sm mt-2">Vérifiez que le BA contient des articles dans client_po_items</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left">Sél.</th>
                      <th className="px-4 py-3 text-left">Article</th>
                      <th className="px-4 py-3 text-center">Qté Totale</th>
                      <th className="px-4 py-3 text-center">Déjà Livrée</th>
                      <th className="px-4 py-3 text-center">Restant</th>
                      <th className="px-4 py-3 text-center">À Livrer</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {formData.items.map((item, index) => (
                      <tr key={item.id} className={item.selected ? 'bg-blue-50' : ''}>
                        <td className="px-4 py-3">
                          <input 
                            type="checkbox"
                            checked={item.selected}
                            onChange={() => handleItemSelect(item.id)}
                            className="w-4 h-4"
                            disabled={item.remaining_quantity === 0}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium">{item.product_id}</p>
                            <p className="text-sm text-gray-500">{item.description}</p>
                            {item.from_submission && (
                              <p className="text-xs text-orange-600">⚠ Depuis soumission (ancien système)</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {item.quantity} {item.unit}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-blue-600 font-medium">
                            {item.delivered_quantity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={item.remaining_quantity === 0 ? 'text-green-600 font-bold' : ''}>
                            {item.remaining_quantity}
                            {item.remaining_quantity === 0 && ' ✅'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="number"
                            min="0"
                            max={item.remaining_quantity}
                            value={item.quantity_to_deliver}
                            onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                            disabled={!item.selected || item.remaining_quantity === 0}
                            className={`w-20 px-2 py-1 text-center border rounded ${
                              item.selected ? 'bg-white' : 'bg-gray-100'
                            }`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex justify-between items-center border-t">
          <span className="text-sm text-gray-600">
            {formData.items.filter(i => i.selected).length} article(s) sélectionné(s)
            {formData.items.some(i => i.from_submission) && (
              <span className="text-orange-600 ml-2">⚠ Certains articles depuis ancien système</span>
            )}
          </span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100"
            >
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={formData.items.filter(i => i.selected).length === 0}
              className={`px-6 py-2 rounded-lg ${
                formData.items.filter(i => i.selected).length > 0
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              Créer et Imprimer BL
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeliverySlipModal;
