// ============================================
// SERVICE CLIENT POUR SIGNATURE ET ENVOI AUTO
// Fichier: lib/services/client-signature.js
// CÔTÉ CLIENT UNIQUEMENT - Sans Resend
// ============================================

// ============================================
// FONCTION POUR SAUVEGARDER SIGNATURE + ENVOI AUTO
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
    console.error('💥 Erreur statut BT:', error);
    return null;
  }
}
