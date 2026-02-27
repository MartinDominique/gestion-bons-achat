/**
 * @file app/api/work-orders/[id]/complete-signature/route.js
 * @description Signature complète + envoi automatique du BT
 *              - Sauvegarde signature client
 *              - Auto-terminaison session en cours
 *              - Envoi email automatique
 *              - Déduction inventaire + mouvement d'inventaire
 *              - Ajout PDF au BA lié
 * @version 1.2.0
 * @date 2026-02-27
 * @changelog
 *   1.2.0 - Inventaire déduit à la signature (avant envoi email), pas seulement si email réussit
 *           Protection anti-doublon via vérification inventory_movements existants
 *   1.1.0 - Ajout déduction inventaire + mouvements (inventory_movements) après envoi email
 *   1.0.0 - Version initiale
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { WorkOrderEmailService, WorkOrderPDFService } from '../../../../../lib/services/email-service.js';

// Client Supabase avec clés service
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================
// POST - SIGNATURE COMPLÈTE + ENVOI AUTO
// ============================================

export async function POST(request, { params }) {
  try {
    const { id } = params;
    const body = await request.json();
    
    console.log('🔏 Signature + envoi auto pour BT:', id);

    // Validation
    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json(
        { error: 'ID invalide' },
        { status: 400 }
      );
    }

    const workOrderId = parseInt(id);

    const {
      signature_data,
      client_signature_name,
      signature_timestamp
    } = body;

    if (!signature_data) {
      return NextResponse.json(
        { error: 'Données de signature requises' },
        { status: 400 }
      );
    }

    // 0. Terminer automatiquement la session en cours s'il y en a une
    const { data: currentBT } = await supabaseAdmin
      .from('work_orders')
      .select('time_entries')
      .eq('id', workOrderId)
      .single();

    if (currentBT?.time_entries && Array.isArray(currentBT.time_entries)) {
      const hasActiveSession = currentBT.time_entries.some(e => e.in_progress === true);
      
      if (hasActiveSession) {
        const now = new Date();
        // Convertir en heure locale Québec
        const endTime = now.toLocaleTimeString('fr-CA', { 
          timeZone: 'America/Toronto', 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        });
        
        const updatedEntries = currentBT.time_entries.map(entry => {
          if (entry.in_progress === true) {
            // Calculer les heures
            const [startH, startM] = entry.start_time.split(':').map(Number);
            const [endH, endM] = endTime.split(':').map(Number);
            const startMinutes = startH * 60 + startM;
            const endMinutes = endH * 60 + endM;
            const netMinutes = Math.max(0, endMinutes - startMinutes - (entry.pause_minutes || 0));
            const totalHours = Math.ceil(netMinutes / 15) * 0.25; // Arrondi au quart d'heure
            
            return {
              ...entry,
              end_time: endTime,
              in_progress: false,
              total_hours: Math.max(1, totalHours) // Minimum 1h
            };
          }
          return entry;
        });

        await supabaseAdmin
          .from('work_orders')
          .update({ time_entries: updatedEntries })
          .eq('id', workOrderId);

        console.log('⏱️ Session auto-terminée à', endTime);
      }
    }

    // 1. Sauvegarder la signature
    const { error: signatureError } = await supabaseAdmin
      .from('work_orders')
      .update({
        signature_data,
        signature_timestamp: signature_timestamp || new Date().toISOString(),
        client_signature_name,
        status: 'signed'
      })
      .eq('id', workOrderId);

    if (signatureError) {
      console.error('❌ Erreur sauvegarde signature:', signatureError);
      return NextResponse.json(
        { error: 'Erreur sauvegarde signature' },
        { status: 500 }
      );
    }

    console.log('✅ Signature sauvegardée, déclenchement envoi auto...');

    // 2. Récupérer le BT complet pour l'envoi AVEC enrichissement manuel
    const { data: workOrder, error: fetchError } = await supabaseAdmin
      .from('work_orders')
      .select(`
        *,
        client:clients(*),
        linked_po:purchase_orders(*),
        materials:work_order_materials(*)
      `)
      .eq('id', workOrderId)
      .single();

    // Enrichir manuellement les matériaux
    if (!fetchError && workOrder && workOrder.materials) {
      for (let material of workOrder.materials) {
        if (material.product_id) {
          // Essayer products
          const { data: product } = await supabaseAdmin
            .from('products')
            .select('*')
            .eq('product_id', material.product_id)
            .single();
          
          if (product) {
            material.product = product;
          } else {
            // Essayer non_inventory_items
            const { data: nonInvProduct } = await supabaseAdmin
              .from('non_inventory_items')
              .select('*')
              .eq('product_id', material.product_id)
              .single();
            
            if (nonInvProduct) {
              material.product = nonInvProduct;
            }
          }
        }
        
        // Créer un objet virtuel si pas de product trouvé
        if (!material.product && (material.product_code || material.description)) {
          material.product = {
            product_id: material.product_code || material.product_id,
            description: material.description,
            unit: material.unit,
            selling_price: material.unit_price
          };
        }
      }
    }

    if (fetchError || !workOrder) {
      console.error('❌ Erreur récupération BT:', fetchError);
      return NextResponse.json(
        {
          signatureSaved: true,
          autoSendResult: { success: false, needsManualSend: true, reason: 'BT introuvable' },
          status: 'signed'
        }
      );
    }

    // 2b. Déduire l'inventaire À LA SIGNATURE (indépendant de l'envoi email)
    if (workOrder.materials && workOrder.materials.length > 0) {
      // Vérifier si l'inventaire a déjà été déduit pour ce BT (protection anti-doublon)
      const { data: existingMovements } = await supabaseAdmin
        .from('inventory_movements')
        .select('id')
        .eq('reference_type', 'work_order')
        .eq('reference_id', workOrder.id.toString())
        .limit(1);

      if (existingMovements && existingMovements.length > 0) {
        console.log('📦 Inventaire déjà déduit pour BT', workOrder.bt_number, '- skip');
      } else {
        console.log('📦 Traitement inventaire pour', workOrder.materials.length, 'matériaux');

        for (const material of workOrder.materials) {
          if (!material.product_id || !material.quantity) continue;

          const qty = parseFloat(material.quantity) || 0;
          if (qty === 0) continue;

          const isCredit = qty < 0;
          const absQty = Math.abs(qty);
          const movementType = isCredit ? 'IN' : 'OUT';

          const isNonInventory = material.product?.is_non_inventory || false;
          const tableName = isNonInventory ? 'non_inventory_items' : 'products';

          try {
            const { data: product, error: productError } = await supabaseAdmin
              .from(tableName)
              .select('stock_qty')
              .eq('product_id', material.product_id)
              .single();

            if (!productError && product) {
              const currentStock = parseFloat(product.stock_qty) || 0;
              const newStock = isCredit ? currentStock + absQty : currentStock - absQty;
              const roundedStock = Math.round(newStock * 10000) / 10000;

              await supabaseAdmin
                .from(tableName)
                .update({ stock_qty: roundedStock.toString() })
                .eq('product_id', material.product_id);

              console.log(`✅ Stock ${isCredit ? 'ajouté' : 'déduit'}: ${material.product_id}: ${currentStock} → ${roundedStock}`);
            }

            const unitCost = Math.abs(parseFloat(material.unit_price) || 0);
            const totalCost = Math.round(absQty * unitCost * 100) / 100;

            await supabaseAdmin
              .from('inventory_movements')
              .insert({
                product_id: material.product_id,
                product_description: material.description || material.product?.description || '',
                product_group: material.product?.product_group || '',
                unit: material.unit || 'UN',
                movement_type: movementType,
                quantity: absQty,
                unit_cost: unitCost,
                total_cost: totalCost,
                reference_type: 'work_order',
                reference_id: workOrder.id.toString(),
                name: `${workOrder.bt_number}.pdf`,
                notes: `BT ${workOrder.bt_number}${isCredit ? ' (CRÉDIT)' : ''} - ${workOrder.client?.company_name || workOrder.client?.name || 'Client'}`,
                created_at: new Date().toISOString()
              });

          } catch (invError) {
            console.error(`⚠️ Erreur inventaire pour ${material.product_id}:`, invError);
          }
        }
      }
    }

    // 3. Vérifier si envoi automatique possible
    const autoSendCheck = checkCanAutoSend(workOrder);
    
    if (!autoSendCheck.canSend) {
      console.log('⏸️ Envoi automatique impossible:', autoSendCheck.reason);
      
      // Mettre en attente d'envoi manuel
      await supabaseAdmin
        .from('work_orders')
        .update({ 
          status: 'pending_send',
          auto_send_failed_reason: autoSendCheck.reason
        })
        .eq('id', workOrderId);
      
      return NextResponse.json({
        signatureSaved: true,
        autoSendResult: { 
          success: false, 
          needsManualSend: true, 
          reason: autoSendCheck.reason 
        },
        status: 'pending_send'
      });
    }

    // 4. ✅ CORRIGÉ : Récupérer les emails cochés + TOUJOURS ajouter email bureau
    let recipientEmails = [];
    
    // Utiliser UNIQUEMENT les emails explicitement cochés dans le formulaire
    if (workOrder.recipient_emails && Array.isArray(workOrder.recipient_emails) && workOrder.recipient_emails.length > 0) {
      recipientEmails = [...workOrder.recipient_emails];
      console.log('📧 Emails cochés dans le formulaire:', recipientEmails);
    }
    
    // ⭐ TOUJOURS ajouter l'email du bureau si configuré
    if (process.env.COMPANY_EMAIL) {
      if (!recipientEmails.includes(process.env.COMPANY_EMAIL)) {
        recipientEmails.push(process.env.COMPANY_EMAIL);
        console.log('📧 Email bureau ajouté:', process.env.COMPANY_EMAIL);
      }
    }
    
    console.log('📧 Liste finale des destinataires:', recipientEmails);
    
    // ⚠️ IMPORTANT: Ne bloquer QUE si vraiment aucun email (même pas le bureau)
    if (recipientEmails.length === 0) {
      console.error('❌ Aucun email disponible (ni client, ni bureau)');
      await supabaseAdmin
        .from('work_orders')
        .update({ 
          status: 'pending_send',
          auto_send_failed_reason: 'Aucun email configuré (ni client, ni bureau)'
        })
        .eq('id', workOrderId);
      
      return NextResponse.json({
        signatureSaved: true,
        autoSendResult: { 
          success: false, 
          needsManualSend: true, 
          reason: 'Aucun email configuré' 
        },
        status: 'pending_send'
      });
    }
    
    console.log('✅ Envoi prévu vers:', recipientEmails.length, 'email(s)');

    // 5. Tenter l'envoi automatique avec les emails sélectionnés
    console.log('🚀 Envoi automatique en cours vers:', recipientEmails.join(', '));
    
    const emailService = new WorkOrderEmailService();
    const result = await emailService.sendWorkOrderEmail(workOrder, {
      sendToBureau: true,
      clientEmail: recipientEmails // ✅ Passer tous les emails sélectionnés
    });

    if (result.success) {
      // 6. Mettre à jour le statut vers "sent"
      const { error: updateError } = await supabaseAdmin
        .from('work_orders')
        .update({ 
          status: 'sent',
          email_sent_at: new Date().toISOString(),
          email_sent_to: recipientEmails.join(', '),
          email_message_id: result.messageId,
          auto_send_success: true
        })
        .eq('id', workOrderId);
    
      if (updateError) {
      console.error('❌ ERREUR mise à jour statut "sent":', updateError);
      } else {
        console.log('✅ Statut mis à jour vers "sent" avec succès');
      }
      
      // 7. Ajouter le PDF au bon d'achat si lié
      console.log('🔍 DEBUG result:', {
        hasResult: !!result,
        hasPdfBase64: !!result.pdfBase64,
        pdfLength: result.pdfBase64?.length || 0,
        linkedPoId: workOrder.linked_po_id
      });
      
      if (workOrder.linked_po_id && result.pdfBase64) {
        try {
          console.log('📎 Ajout du PDF au BA:', workOrder.linked_po_id);
          
          // Récupérer les fichiers existants du BA
          const { data: purchaseOrder } = await supabaseAdmin
            .from('purchase_orders')
            .select('files')
            .eq('id', workOrder.linked_po_id)
            .single();
      
          // Préparer le nouveau fichier
          const newFile = {
            id: Date.now(),
            name: `BT-${workOrder.bt_number}.pdf`,
            data: result.pdfBase64,
            type: 'application/pdf',
            size: result.pdfBase64.length,
            uploadDate: new Date().toISOString()
          };
      
          // Combiner avec fichiers existants
          const existingFiles = purchaseOrder?.files || [];
          const updatedFiles = [...existingFiles, newFile];
      
          // Mettre à jour le BA
          await supabaseAdmin
            .from('purchase_orders')
            .update({ files: updatedFiles })
            .eq('id', workOrder.linked_po_id);
      
          console.log('✅ PDF du BT ajouté au BA:', workOrder.linked_po_id);
        } catch (error) {
          console.error('⚠️ Erreur ajout PDF au BA:', error);
          // Non bloquant - l'email est déjà envoyé
        }
      } else {
        console.log('ℹ️ Pas de BA lié ou pas de PDF à ajouter');
      }
      
      console.log('✅ Envoi automatique réussi vers:', recipientEmails.join(', '));
      
      return NextResponse.json({
        signatureSaved: true,
        autoSendResult: { 
          success: true, 
          messageId: result.messageId,
          sentTo: recipientEmails.join(', ')
        },
        status: 'sent'
      });
    } else {
      // 7. Échec envoi → Mettre en attente manuel
      console.error('❌ Échec envoi automatique:', result.error);
      
      await supabaseAdmin
        .from('work_orders')
        .update({ 
          status: 'pending_send',
          auto_send_failed_reason: result.error
        })
        .eq('id', workOrderId);

      return NextResponse.json({
        signatureSaved: true,
        autoSendResult: { 
          success: false, 
          needsManualSend: true, 
          error: result.error 
        },
        status: 'pending_send'
      });
    }

  } catch (error) {
    console.error('💥 Erreur API signature + envoi auto:', error);
    
    // En cas d'erreur, au moins marquer comme signé
    try {
      await supabaseAdmin
        .from('work_orders')
        .update({ 
          status: 'pending_send',
          auto_send_failed_reason: `Erreur système: ${error.message}`
        })
        .eq('id', parseInt(params.id));
    } catch (updateError) {
      console.error('💥💥 Erreur mise à jour statut:', updateError);
    }

    return NextResponse.json(
      { 
        signatureSaved: false,
        error: error.message,
        autoSendResult: { success: false, needsManualSend: true }
      },
      { status: 500 }
    );
  }
}

// ============================================
// FONCTION DE VÉRIFICATION ENVOI AUTO
// ============================================

function checkCanAutoSend(workOrder) {
  // 1. ✅ CORRIGÉ : Vérifier qu'il y a AU MOINS UN email (client OU bureau)
  const hasClientEmails = (workOrder.recipient_emails && workOrder.recipient_emails.length > 0);
  const hasBureauEmail = !!process.env.COMPANY_EMAIL;
  
  if (!hasClientEmails && !hasBureauEmail) {
    return { 
      canSend: false, 
      reason: 'Aucune adresse email configurée (ni client, ni bureau)' 
    };
  }

  // 2. Vérifier format email (au moins un email valide)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  // Construire la liste des emails à vérifier
  let emailsToValidate = [];
  if (hasClientEmails) {
    emailsToValidate = [...workOrder.recipient_emails];
  }
  if (hasBureauEmail) {
    emailsToValidate.push(process.env.COMPANY_EMAIL);
  }
  
  const hasValidEmail = emailsToValidate.some(email => email && emailRegex.test(email));
  
  if (!hasValidEmail) {
    return { 
      canSend: false, 
      reason: 'Aucun email valide trouvé' 
    };
  }

  // 3. Vérifier que le BT a une signature
  if (!workOrder.signature_data) {
    return { 
      canSend: false, 
      reason: 'Aucune signature trouvée' 
    };
  }

  // 4. Vérifier données minimales BT
  if (!workOrder.work_date || !workOrder.client_id) {
    return { 
      canSend: false, 
      reason: 'Données BT incomplètes' 
    };
  }

  // 5. Vérifier que Resend est configuré
  if (!process.env.RESEND_API_KEY) {
    return { 
      canSend: false, 
      reason: 'Service email non configuré' 
    };
  }

  // 6. Tout est OK pour envoi automatique
  return { 
    canSend: true, 
    reason: 'Prêt pour envoi automatique' 
  };
}
