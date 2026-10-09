/**
 * @file app/bons-travail/[id]/modifier/page.js
 * @description Page d'édition d'un bon de travail existant
 *              - Vérification connexion + timeout + messages d'erreur explicites
 *              - Pas de redirection si la sauvegarde échoue (le BT reste ouvert)
 * @version 1.0.1
 * @date 2026-10-09
 * @changelog
 *   1.0.1 - Mode sombre: encadré d'erreur, page « introuvable », liste de contrôle, bandeau d'en-tête bleu
 *   1.0.0 - Version initiale (en-tête ajouté rétroactivement)
 */
//==============================
// app/bons-travail/[id]/modifier/page.js
//===============================
// RÔLE: Page d'édition d'un bon de travail existant
// MODIF: Ajout vérification connexion + timeout + messages d'erreur explicites
// IMPORTANT: Pas de redirection si la sauvegarde échoue - le BT reste ouvert
//===============================

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { notFound } from 'next/navigation';
import WorkOrderForm from '../../../../components/work-orders/WorkOrderForm';
import ConnectionStatus from '../../../../components/ConnectionStatus';

export default function ModifierBonTravailPage({ params }) {
  const router = useRouter();
  const [workOrder, setWorkOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Charger le bon de travail
  useEffect(() => {
    const fetchWorkOrder = async () => {
      try {
        const response = await fetch(`/api/work-orders/${params.id}?t=${Date.now()}`, {
          cache: 'no-store'
        });
        
        if (!response.ok) {
          if (response.status === 404) {
            notFound();
          }
          throw new Error('Erreur chargement bon de travail');
        }

        const responseData = await response.json();
        console.log('Données BT chargées:', responseData);

        const workOrderData = responseData.success ? responseData.data : responseData;
        console.log('🕐 MODIFIER - time_entries du BT:', JSON.stringify(workOrderData.time_entries));
        console.log('🕐 MODIFIER - total_hours du BT:', workOrderData.total_hours);
        setWorkOrder(workOrderData);
        
      } catch (err) {
        console.error('Erreur:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (params.id) {
      fetchWorkOrder();
    }
  }, [params.id]);

  // =============================================
  // FONCTION UTILITAIRE: Afficher un toast
  // =============================================
  const showToast = (message, type = 'info', duration = 3000) => {
    // Supprimer tout toast existant
    const existingToast = document.getElementById('app-toast');
    if (existingToast) {
      document.body.removeChild(existingToast);
    }

    const colors = {
      loading: { bg: '#3b82f6', text: 'white' },
      success: { bg: 'linear-gradient(to right, #10b981, #059669)', text: 'white' },
      error: { bg: '#dc2626', text: 'white' }
    };

    const color = colors[type] || colors.info;

    const toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.innerHTML = message;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: ${color.bg};
      color: ${color.text};
      padding: 16px 32px;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
      z-index: 9999;
      font-weight: 600;
      font-size: 15px;
      white-space: pre-line;
      text-align: center;
      max-width: 90vw;
    `;
    document.body.appendChild(toast);

    if (duration > 0) {
      setTimeout(() => {
        if (document.body.contains(toast)) {
          toast.style.opacity = '0';
          toast.style.transition = 'opacity 0.3s ease-out';
          setTimeout(() => {
            if (document.body.contains(toast)) {
              document.body.removeChild(toast);
            }
          }, 300);
        }
      }, duration);
    }

    return toast;
  };

  // =============================================
  // SAUVEGARDER LES MODIFICATIONS
  // =============================================
  const handleSave = async (workOrderData, status) => {
    // ✅ Vérifier connexion AVANT de commencer
    if (!navigator.onLine) {
      showToast('❌ Pas de connexion internet!\n\nImpossible de sauvegarder.', 'error', 5000);
      return; // ⛔ STOP - ne pas continuer
    }

    setSaving(true);
    setError(null);

    console.log('📝 MODIFICATION - workOrderData:', workOrderData);
    console.log('📝 MODIFICATION - status:', status);

    // Afficher toast de chargement (durée 0 = reste affiché)
    showToast('💾 Sauvegarde en cours...', 'loading', 0);

    try {
      const payload = {
        ...workOrderData,
        status: status || workOrderData.status || 'draft'
      };

      // ✅ Fetch avec timeout de 15 secondes
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`/api/work-orders/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // ✅ Vérifier si la réponse est OK
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erreur serveur (${response.status})`);
      }

      const responseData = await response.json();
      console.log('📝 MODIFICATION - Réponse API:', responseData);

      const savedWorkOrder = responseData.success ? responseData.data : responseData;
      console.log('🕐 PUT RÉPONSE - time_entries sauvegardées:', JSON.stringify(savedWorkOrder.time_entries));
      console.log('🕐 PUT RÉPONSE - total_hours sauvegardé:', savedWorkOrder.total_hours);

      // ✅ SUCCÈS CONFIRMÉ - Maintenant on peut afficher succès et rediriger
      if (status !== 'ready_for_signature') {
        const messages = {
          completed: '✅ Bon de travail finalisé!',
          sent: '📧 Bon de travail envoyé!'
        };
        const finalStatus = status || workOrderData.status || 'draft';
        const message = messages[finalStatus] || '✅ Sauvegardé avec succès!';
        
        showToast(message, 'success', 2000);
        
        // ✅ Rediriger SEULEMENT après succès confirmé
        setTimeout(() => {
          router.push('/bons-travail');
        }, 2000);
      } else {
        // Pour "présenter au client"
        showToast('✅ Préparation pour signature...', 'success', 2000);
      }
      
      setHasChanges(false);
      return savedWorkOrder;

    } catch (err) {
      console.error('📝 MODIFICATION - ERREUR:', err);
      
      // ✅ Messages d'erreur explicites selon le type
      let errorMessage = '❌ Erreur de sauvegarde\n\n';
      
      if (err.name === 'AbortError') {
        errorMessage += 'Délai dépassé (15 sec)!\n\nConnexion trop lente.\nVos données n\'ont PAS été sauvegardées.';
      } else if (err.message === 'Failed to fetch' || !navigator.onLine) {
        errorMessage += 'Connexion perdue!\n\nVos données n\'ont PAS été sauvegardées.\nVérifiez votre connexion.';
      } else {
        errorMessage += err.message;
      }
      
      // ✅ Afficher erreur - le toast reste 8 secondes
      showToast(errorMessage, 'error', 8000);
      
      // ⛔ NE PAS rediriger - le BT reste ouvert
      // ⛔ NE PAS throw - ça causerait des effets secondaires
      
      return null; // Retourner null pour indiquer échec
      
    } finally {
      setSaving(false);
    }
  };

  // Annuler et retourner à la liste
  const handleCancel = () => {
    if (hasChanges) {
      if (confirm('Annuler les modifications ? Les changements non sauvegardés seront perdus.')) {
        router.push('/bons-travail');
      }
    } else {
      router.push('/bons-travail');
    }
  };

  // Fonction appelée quand le formulaire change
  const handleFormChange = () => {
    setHasChanges(true);
  };

  // États de chargement
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2">Chargement du bon de travail...</span>
        </div>
      </div>
    );
  }

  if (error && !workOrder) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">Erreur</h2>
          <p className="text-red-700 whitespace-pre-line">{error}</p>
          <button
            onClick={() => router.push('/bons-travail')}
            className="mt-4 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
          >
            Retour à la liste
          </button>
        </div>
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Bon de travail introuvable</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">Le bon de travail demandé n'existe pas ou a été supprimé.</p>
          <button
            onClick={() => router.push('/bons-travail')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Retour à la liste
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb avec indicateur de connexion */}
      <nav className="mb-6">
        <div className="flex items-center justify-between">
          <ol className="flex items-center space-x-2 text-sm text-gray-500">
            <li>
              <button
                onClick={() => router.push('/bons-travail')}
                className="hover:text-blue-600"
              >
                Bons de Travail
              </button>
            </li>
            <li>/</li>
            <li className="text-gray-900 dark:text-gray-100 font-medium">
              Modifier {workOrder.bt_number}
            </li>
          </ol>
          {/* Badge de connexion */}
          <ConnectionStatus />
        </div>
      </nav>

      {/* Informations du BT */}
      <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-blue-900 dark:text-blue-200">
              Modification du bon de travail {workOrder.bt_number}
            </h1>
            <p className="text-blue-700 text-sm mt-1">
              Créé le {new Date(workOrder.created_at).toLocaleDateString('fr-CA')} - 
              Statut: <span className="font-medium">{workOrder.status}</span>
              {workOrder.materials && workOrder.materials.length > 0 && (
                <span> - {workOrder.materials.length} matériau(x)</span>
              )}
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-blue-700">Client:</div>
            <div className="font-medium text-blue-900 dark:text-blue-200">{workOrder.client?.name || 'Client non défini'}</div>
          </div>
        </div>
      </div>

      {/* Formulaire d'édition */}
      <WorkOrderForm
        workOrder={workOrder}
        mode="edit"
        onSave={handleSave}
        onCancel={handleCancel}
        onFormChange={handleFormChange}
        saving={saving}
      />
    </div>
  );
}
