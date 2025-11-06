// ============================================
// SYSTÈME D'ENVOI AUTOMATIQUE CORRIGÉ
// Fichier: lib/services/auto-send.js
// Structure: id=integer, client_id=integer, user_id=uuid
// ============================================

import { createClient } from '@supabase/supabase-js';
import { WorkOrderEmailService } from './email-service.js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================
// FONCTION D'ENVOI AUTOMATIQUE PRINCIPALE
// ============================================

export async function handleWorkOrderSigned(workOrderId) {
  try {
    console.log('🔄 BT signé détecté, vérification envoi auto:', workOrderId);

    // 1. Récupérer le BT complet
    const { data: workOrder, error: fetchError } = await supabaseAdmin
      .from('work_orders')
      .select(`
        *,
        client:clients(*),
        materials:work_order_materials(
          *,
          product:products(*)
        )
      `)
      .eq('id', parseInt(workOrderId)) // Conversion en integer
      .single();

    if (fetchError || !workOrder) {
      console.error('❌ BT introuvable:', fetchError);
      return { success: false, error: 'BT introuvable' };
    }

    // 2. Vérifications pour envoi automatique
    const canAutoSend = checkCanAutoSend(workOrder);
    
    if (!canAutoSend.canSend) {
      console.log('⏸️ Envoi automatique impossible:', canAutoSend.reason);
      
      // Mettre en attente d'envoi manuel
      await supabaseAdmin
        .from('work_orders')
        .update({ 
          status: 'pending_send',
          auto_send_failed_reason: canAutoSend.reason
        })
        .eq('id', parseInt(workOrderId));
      
      return { 
        success: false, 
        needsManualSend: true, 
        reason: canAutoSend.reason 
      };
    }

    // 3. Envoyer automatiquement
    console.log('🚀 Envoi automatique en cours...');
    
    const emailService = new WorkOrderEmailService();
    const result = await emailService.sendWorkOrderEmail(workOrder, {
      sendToBureau: true,
      clientEmail: workOrder.client.email
    });

    if (result.success) {
      // 4. Mettre à jour le statut vers "sent"
      await supabaseAdmin
        .from('work_orders')
        .update({ 
          status: 'sent',
          email_sent_at: new Date().toISOString(),
          email_sent_to: workOrder.client.email,
          email_message_id: result.messageId,
          auto_send_success: true
        })
        .eq('id', parseInt(workOrderId));
    
      console.log('✅ Statut mis à jour vers "sent" avec succès');

        // 5. DEBUG - Vérifier ce qu'on a reçu
        console.log('🔍 DEBUG result:', {
          hasResult: !!result,
          hasPdfBase64: !!result.pdfBase64,
          pdfLength: result.pdfBase64?.length || 0,
          linkedPoId: workOrder.linked_po_id
        });
        
        // 5. Ajouter le PDF au bon d'achat si lié
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
            data: result.pdfBase64
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
      
      console.log('✅ Envoi automatique réussi vers:', workOrder.client.email);
      
      return { 
        success: true, 
        messageId: result.messageId,
        sentTo: workOrder.client.email
      };
    } else {
      // 5. Échec envoi → Mettre en attente manuel
      console.error('❌ Échec envoi automatique:', result.error);
      
      await supabaseAdmin
        .from('work_orders')
        .update({ 
          status: 'pending_send',
          auto_send_failed_reason: result.error
        })
        .eq('id', parseInt(workOrderId));

      return { 
        success: false, 
        needsManualSend: true, 
        error: result.error 
      };
    }

  } catch (error) {
    console.error('💥 Erreur système envoi automatique:', error);
    
    // En cas d'erreur grave, mettre en attente manuel
    try {
      await supabaseAdmin
        .from('work_orders')
        .update({ 
          status: 'pending_send',
          auto_send_failed_reason: `Erreur système: ${error.message}`
        })
        .eq('id', parseInt(workOrderId));
    } catch (updateError) {
      console.error('💥💥 Erreur mise à jour statut:', updateError);
    }

    return { 
      success: false, 
      needsManualSend: true, 
      error: error.message 
    };
  }
}

// ============================================
// VÉRIFICATIONS POUR ENVOI AUTOMATIQUE
// ============================================

function checkCanAutoSend(workOrder) {
  // 1. Vérifier email client
  if (!workOrder.client || !workOrder.client.email) {
    return { 
      canSend: false, 
      reason: 'Aucune adresse email pour le client' 
    };
  }

  // 2. Vérifier format email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(workOrder.client.email)) {
    return { 
      canSend: false, 
      reason: 'Format email client invalide' 
    };
  }

  // 3. Vérifier que le BT est vraiment signé
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

// ============================================
// HOOK POUR DÉTECTER LES SIGNATURES
// ============================================

export async function onSignatureCompleted(workOrderId, signatureData, clientName = null) {
  try {
    console.log('📝 Sauvegarde signature pour BT:', workOrderId);

    // 1. Sauvegarder la signature
    const { error: signatureError } = await supabaseAdmin
      .from('work_orders')
      .update({
        signature_data: signatureData,
        signature_timestamp: new Date().toISOString(),
        client_signature_name: clientName,
        status: 'signed'
      })
      .eq('id', parseInt(workOrderId));

    if (signatureError) {
      throw new Error(`Erreur sauvegarde signature: ${signatureError.message}`);
    }

    console.log('✅ Signature sauvegardée, déclenchement envoi auto...');

    // 2. Déclencher l'envoi automatique
    const autoSendResult = await handleWorkOrderSigned(workOrderId);
    
    return {
      signatureSaved: true,
      autoSendResult
    };

  } catch (error) {
    console.error('💥 Erreur lors de la signature:', error);
    return {
      signatureSaved: false,
      error: error.message
    };
  }
}

// ============================================
// FONCTION POUR RÉESSAYER LES ENVOIS ÉCHOUÉS
// ============================================

export async function retryFailedAutoSends() {
  try {
    console.log('🔄 Recherche des envois automatiques échoués...');

    // Récupérer les BT en pending_send
    const { data: failedWorkOrders, error } = await supabaseAdmin
      .from('work_orders')
      .select(`
        *,
        client:clients(*),
        materials:work_order_materials(
          *,
          product:products(*)
        )
      `)
      .eq('status', 'pending_send')
      .not('auto_send_failed_reason', 'is', null);

    if (error) {
      throw new Error(`Erreur récupération BT échoués: ${error.message}`);
    }

    if (!failedWorkOrders || failedWorkOrders.length === 0) {
      console.log('ℹ️ Aucun envoi échoué à réessayer');
      return { retriedCount: 0, results: [] };
    }

    console.log(`🔄 ${failedWorkOrders.length} envois à réessayer`);

    const results = [];
    let successCount = 0;

    // Réessayer chaque envoi
    for (const workOrder of failedWorkOrders) {
      const result = await handleWorkOrderSigned(workOrder.id);
      results.push({
        id: workOrder.id,
        bt_number: workOrder.bt_number,
        result
      });

      if (result.success) {
        successCount++;
      }

      // Pause entre tentatives
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`✅ ${successCount}/${failedWorkOrders.length} envois réussis lors du retry`);

    return {
      retriedCount: failedWorkOrders.length,
      successCount,
      results
    };

  } catch (error) {
    console.error('💥 Erreur retry envois échoués:', error);
    return {
      error: error.message,
      retriedCount: 0,
      results: []
    };
  }
}

// ============================================
// FONCTION UTILITAIRE - OBTENIR BT EN ATTENTE
// ============================================

export async function getPendingWorkOrders() {
  try {
    const { data: pendingWorkOrders, error } = await supabaseAdmin
      .rpc('get_auto_send_candidates');

    if (error) {
      console.error('Erreur récupération BT candidats:', error);
      return [];
    }

    return pendingWorkOrders || [];
  } catch (error) {
    console.error('Erreur getPendingWorkOrders:', error);
    return [];
  }
}

// ============================================
// FONCTION DE TEST
// ============================================

export async function testAutoSendSystem() {
  try {
    console.log('🧪 Test du système d\'envoi automatique...');

    // 1. Vérifier configuration
    const configCheck = {
      resendKey: !!process.env.RESEND_API_KEY,
      companyEmail: !!process.env.COMPANY_EMAIL,
      supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
    };

    console.log('Configuration:', configCheck);

    // 2. Tester connexion Supabase
    const { data: testData, error: testError } = await supabaseAdmin
      .from('work_orders')
      .select('id, bt_number, status')
      .limit(1);

    if (testError) {
      throw new Error(`Erreur connexion Supabase: ${testError.message}`);
    }

    // 3. Obtenir candidats envoi auto
    const candidates = await getPendingWorkOrders();

    return {
      configurationOK: Object.values(configCheck).every(Boolean),
      supabaseConnection: !testError,
      candidatesCount: candidates.length,
      details: {
        config: configCheck,
        sampleWorkOrder: testData?.[0],
        candidates: candidates.slice(0, 3) // Premiers 3 candidats
      }
    };

  } catch (error) {
    console.error('💥 Erreur test système:', error);
    return {
      configurationOK: false,
      error: error.message
    };
  }
}

// ============================================
// EXPORT DEFAULT
// ============================================

export default {
  handleWorkOrderSigned,
  onSignatureCompleted,
  retryFailedAutoSends,
  getPendingWorkOrders,
  testAutoSendSystem
};
