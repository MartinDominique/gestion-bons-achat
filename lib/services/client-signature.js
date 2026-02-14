/**
 * @file lib/services/client-signature.js
 * @description Service client pour signature et envoi auto (BT + BL)
 *              CÔTÉ CLIENT UNIQUEMENT - Sans Resend
 * @version 2.0.0
 * @date 2026-02-12
 * @changelog
 *   2.0.0 - Ajout support Bon de Livraison (BL)
 *   1.0.0 - Version initiale (BT seulement)
 */

// ============================================
// FONCTIONS BT (Bon de Travail)
// ============================================

export async function handleSignatureWithAutoSend(workOrderId, signatureData, clientName = null) {
  try {
    console.log('📝 Signature + envoi automatique pour BT:', workOrderId);

    // 1. Sauvegarder la signature et déclencher l'envoi automatique
    const response = await fetch(`/api/work-orders/${workOrderId}/complete-signature`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        signature_data: signatureData,
        client_signature_name: clientName,
        signature_timestamp: new Date().toISOString()
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Erreur lors de la signature');
    }

    return {
      success: true,
      signatureSaved: true,
      autoSendResult: result.autoSendResult || { success: false, needsManualSend: true },
      workOrderStatus: result.status
    };

  } catch (error) {
    console.error('💥 Erreur signature avec envoi auto:', error);
    return {
      success: false,
      signatureSaved: false,
      error: error.message
    };
  }
}

// ============================================
// FONCTION POUR ENVOI MANUEL (FALLBACK)
// ============================================

export async function sendWorkOrderManually(workOrderId, options = {}) {
  try {
    console.log('📧 Envoi manuel BT:', workOrderId);

    const response = await fetch(`/api/work-orders/${workOrderId}/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sendToBureau: true,
        ...options
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Erreur lors de l\'envoi');
    }

    return {
      success: true,
      messageId: result.messageId,
      sentTo: result.sentTo
    };

  } catch (error) {
    console.error('💥 Erreur envoi manuel:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================
// FONCTION POUR VÉRIFIER STATUT BT
// ============================================

export async function getWorkOrderStatus(workOrderId) {
  try {
    const response = await fetch(`/api/work-orders/${workOrderId}/send-email`, {
      method: 'GET'
    });

    if (!response.ok) {
      throw new Error('Erreur récupération statut');
    }

    const result = await response.json();
    return result;

  } catch (error) {
    console.error('Erreur statut BT:', error);
    return null;
  }
}

// ============================================
// FONCTIONS BL (Bon de Livraison)
// ============================================

export async function handleBLSignatureWithAutoSend(deliveryNoteId, signatureData, clientName = null) {
  try {
    console.log('Signature + envoi automatique pour BL:', deliveryNoteId);

    const response = await fetch(`/api/delivery-notes/${deliveryNoteId}/complete-signature`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        signature_data: signatureData,
        client_signature_name: clientName,
        signature_timestamp: new Date().toISOString()
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Erreur lors de la signature');
    }

    return {
      success: true,
      signatureSaved: true,
      autoSendResult: result.autoSendResult || { success: false, needsManualSend: true },
      deliveryNoteStatus: result.status
    };

  } catch (error) {
    console.error('Erreur signature BL avec envoi auto:', error);
    return {
      success: false,
      signatureSaved: false,
      error: error.message
    };
  }
}

export async function sendDeliveryNoteManually(deliveryNoteId, options = {}) {
  try {
    console.log('Envoi manuel BL:', deliveryNoteId);

    const response = await fetch(`/api/delivery-notes/${deliveryNoteId}/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sendToBureau: true,
        ...options
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Erreur lors de l\'envoi');
    }

    return {
      success: true,
      messageId: result.messageId,
      sentTo: result.sentTo
    };

  } catch (error) {
    console.error('Erreur envoi manuel BL:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function getDeliveryNoteStatus(deliveryNoteId) {
  try {
    const response = await fetch(`/api/delivery-notes/${deliveryNoteId}/send-email`, {
      method: 'GET'
    });

    if (!response.ok) {
      throw new Error('Erreur récupération statut');
    }

    return await response.json();

  } catch (error) {
    console.error('Erreur statut BL:', error);
    return null;
  }
}
