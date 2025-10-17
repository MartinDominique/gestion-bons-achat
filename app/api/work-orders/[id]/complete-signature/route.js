// ============================================
// API ROUTE - SIGNATURE + ENVOI AUTOMATIQUE
// Fichier: app/api/work-orders/[id]/complete-signature/route.js
// ============================================

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
    
    console.log('📝 Signature + envoi auto pour BT:', id);

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

    // 4. ✅ NOUVEAU : Récupérer les emails sélectionnés
    let recipientEmails = [];
    
    if (workOrder.recipient_emails && Array.isArray(workOrder.recipient_emails) && workOrder.recipient_emails.length > 0) {
      // Utiliser les emails sélectionnés dans le formulaire
      recipientEmails = workOrder.recipient_emails;
      console.log('📧 Emails sélectionnés trouvés:', recipientEmails);
    } else if (workOrder.client?.email) {
      // Fallback sur email principal
      recipientEmails = [workOrder.client.email];
      console.log('📧 Utilisation email principal:', recipientEmails);
    } else {
      console.error('❌ Aucun email disponible');
      await supabaseAdmin
        .from('work_orders')
        .update({ 
          status: 'pending_send',
          auto_send_failed_reason: 'Aucun email disponible'
        })
        .eq('id', workOrderId);
      
      return NextResponse.json({
        signatureSaved: true,
        autoSendResult: { 
          success: false, 
          needsManualSend: true, 
          reason: 'Aucun email disponible' 
        },
        status: 'pending_send'
      });
    }

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
    
      console.log('✅ Envoi automatique réussi vers:', recipientEmails.join(', '));
      
      return NextResponse.json({
        signatureSaved: true,
        autoSendResult: { 
          success: true, 
          messageId: result.messageId,
          sentTo: recipientEmails.join(', ') // ✅ Retourner tous les emails
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
  // 1. ✅ MODIFIÉ : Vérifier emails (sélectionnés ou principal)
  const hasEmails = (workOrder.recipient_emails && workOrder.recipient_emails.length > 0) ||
                    (workOrder.client && workOrder.client.email);
  
  if (!hasEmails) {
    return { 
      canSend: false, 
      reason: 'Aucune adresse email pour le client' 
    };
  }

  // 2. Vérifier format email (au moins un email valide)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emails = workOrder.recipient_emails || [workOrder.client?.email];
  const hasValidEmail = emails.some(email => email && emailRegex.test(email));
  
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
