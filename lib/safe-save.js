// lib/safe-save.js

import toast from 'react-hot-toast';

/**
 * Vérifie la connexion avant une opération
 * @returns {boolean} true si en ligne
 */
export const checkConnection = () => {
  if (!navigator.onLine) {
    toast.error('❌ Pas de connexion internet!\nVos données ne seront pas sauvegardées.', {
      duration: 5000,
      style: {
        background: '#dc2626',
        color: '#fff',
        fontWeight: '500',
      },
    });
    return false;
  }
  return true;
};

/**
 * Exécute un fetch avec vérification de connexion et retry
 * @param {string} url 
 * @param {object} options 
 * @param {number} maxRetries 
 * @returns {Promise<Response>}
 */
export const safeFetch = async (url, options = {}, maxRetries = 2) => {
  // Vérifier connexion d'abord
  if (!navigator.onLine) {
    throw new Error('Pas de connexion internet');
  }

  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erreur HTTP ${response.status}`);
      }
      
      return response;
      
    } catch (error) {
      lastError = error;
      console.warn(`⚠️ Tentative ${attempt + 1}/${maxRetries + 1} échouée:`, error.message);
      
      // Si c'est un abort (timeout) ou erreur réseau, on retry
      if (attempt < maxRetries && (error.name === 'AbortError' || error.message === 'Failed to fetch')) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Délai croissant
        continue;
      }
      
      break;
    }
  }
  
  throw lastError;
};

/**
 * Sauvegarde avec confirmation visuelle
 * @param {Function} saveFn - Fonction de sauvegarde async
 * @param {object} options - Options (successMsg, errorMsg)
 * @returns {Promise<any>}
 */
export const saveWithFeedback = async (saveFn, options = {}) => {
  const {
    successMsg = '✅ Sauvegardé avec succès',
    errorMsg = '❌ Erreur de sauvegarde',
    loadingMsg = '💾 Sauvegarde en cours...'
  } = options;

  // Vérifier connexion
  if (!checkConnection()) {
    return { success: false, error: 'Pas de connexion' };
  }

  const toastId = toast.loading(loadingMsg);

  try {
    const result = await saveFn();
    
    toast.success(successMsg, {
      id: toastId,
      duration: 3000,
    });
    
    return { success: true, data: result };
    
  } catch (error) {
    console.error('❌ Erreur sauvegarde:', error);
    
    let userMessage = errorMsg;
    
    if (error.message === 'Failed to fetch' || error.name === 'AbortError') {
      userMessage = '❌ Connexion perdue pendant la sauvegarde.\nVérifiez votre connexion et réessayez.';
    } else if (error.message === 'Pas de connexion internet') {
      userMessage = '❌ Pas de connexion internet.\nVos données n\'ont pas été sauvegardées.';
    }
    
    toast.error(userMessage, {
      id: toastId,
      duration: 6000,
      style: {
        background: '#dc2626',
        color: '#fff',
      },
    });
    
    return { success: false, error: error.message };
  }
};
