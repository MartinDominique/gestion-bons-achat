/**
 * @file app/bons-travail/nouveau/page.js
 * @description Page de création d'un nouveau bon de travail
 *              - Vérification connexion + timeout + messages d'erreur explicites
 *              - Pas de redirection si la sauvegarde échoue (le BT reste ouvert)
 * @version 1.0.1
 * @date 2026-10-09
 * @changelog
 *   1.0.1 - Mode sombre: titre et sous-titre de la page
 *   1.0.0 - Version initiale (en-tête ajouté rétroactivement)
 */
//==============================
// app/bons-travail/nouveau/page.js
//===============================
// RÔLE: Page de création d'un nouveau bon de travail
// MODIF: Ajout vérification connexion + timeout + messages d'erreur explicites
// IMPORTANT: Pas de redirection si la sauvegarde échoue - le BT reste ouvert
//===============================

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';
import WorkOrderForm from '../../../components/work-orders/WorkOrderForm';
import ConnectionStatus from '../../../components/ConnectionStatus';

export default function NouveauBonTravailPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const handleSave = async (workOrderData, status) => {
    // ✅ PROTECTION: Bloquer si déjà en cours
    if (saving) {
      console.log('⏸️ Sauvegarde déjà en cours - Requête ignorée');
      toast.error('Sauvegarde déjà en cours...', { duration: 2000 });
      return;
    }

    // ✅ Vérifier connexion AVANT de commencer
    if (!navigator.onLine) {
      toast.error('❌ Pas de connexion internet!\n\nImpossible de sauvegarder.\nVérifiez votre connexion et réessayez.', {
        duration: 6000,
        style: {
          background: '#dc2626',
          color: '#fff',
          whiteSpace: 'pre-line',
          fontWeight: '500',
        },
      });
      return; // ⛔ STOP - ne pas continuer
    }

    setSaving(true);

    console.log('📋 CRÉATION - workOrderData:', workOrderData);
    console.log('📋 CRÉATION - status:', status);

    // ✅ Toast de chargement
    const loadingToastId = toast.loading('💾 Sauvegarde en cours...', {
      style: {
        background: '#3b82f6',
        color: '#fff',
      },
    });

    try {
      const payload = {
        ...workOrderData,
        status: status || workOrderData.status || 'draft'
      };

      // ✅ Fetch avec timeout de 15 secondes
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch('/api/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // ✅ Fermer le toast de chargement
      toast.dismiss(loadingToastId);

      if (response.ok) {
        const responseData = await response.json();
        console.log('📋 CRÉATION - Réponse API:', responseData);
        
        const savedWorkOrder = responseData.success ? responseData.data : responseData;
        
        // ✅ Marquer sauvegardé
        setHasSaved(true);
        setHasChanges(false);
        
        // ✅ SUCCÈS CONFIRMÉ - Maintenant on peut afficher succès et rediriger
        if (status !== 'ready_for_signature') {
          const messages = {
            draft: { text: '💾 Bon de travail sauvegardé!', duration: 3000 },
            completed: { text: '✅ Bon de travail finalisé!', duration: 3000 },
            sent: { text: '📧 Bon de travail envoyé!', duration: 4000 }
          };

          const finalStatus = status || workOrderData.status || 'draft';
          const message = messages[finalStatus] || { text: '✅ Sauvegardé avec succès!', duration: 3000 };
          
          toast.success(message.text, {
            duration: message.duration,
            style: {
              background: '#10b981',
              color: '#fff',
              fontSize: '14px',
              fontWeight: '600',
            },
          });
          
          // ✅ Rediriger SEULEMENT après succès confirmé
          setTimeout(() => {
            router.push('/bons-travail');
          }, 500);
        } else {
          // Pour "présenter au client"
          toast.success('✅ Préparation pour signature...', {
            duration: 2000,
            style: {
              background: '#10b981',
              color: '#fff',
            },
          });
        }
        
        return savedWorkOrder;
        
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erreur serveur (${response.status})`);
      }
      
    } catch (error) {
      console.error('📋 CRÉATION - ERREUR:', error);
      
      // ✅ Fermer le toast de chargement
      toast.dismiss(loadingToastId);
      
      // ✅ Messages d'erreur explicites selon le type
      let errorMessage = '❌ Erreur de sauvegarde\n\n';
      
      if (error.name === 'AbortError') {
        errorMessage += 'Délai dépassé (15 sec)!\n\nConnexion trop lente.\nVos données n\'ont PAS été sauvegardées.';
      } else if (error.message === 'Failed to fetch' || !navigator.onLine) {
        errorMessage += 'Connexion perdue!\n\nVos données n\'ont PAS été sauvegardées.\nVérifiez votre connexion.';
      } else {
        errorMessage += error.message;
      }
      
      toast.error(errorMessage, {
        duration: 8000,
        style: {
          background: '#dc2626',
          color: '#fff',
          whiteSpace: 'pre-line',
        },
      });
      
      // ⛔ NE PAS rediriger - le BT reste ouvert
      // ⛔ NE PAS throw - ça causerait des effets secondaires
      
      return null; // Retourner null pour indiquer échec
      
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (hasChanges && !hasSaved) {
      if (confirm('Annuler la création ? Toutes les données saisies seront perdues.')) {
        router.push('/bons-travail');
      }
    } else {
      router.push('/bons-travail');
    }
  };

  const handleFormChange = () => {
    setHasChanges(true);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Toaster 
        position="top-center"
        toastOptions={{
          success: {
            iconTheme: { primary: '#10b981', secondary: '#fff' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#fff' },
          },
        }}
      />
      
      {/* Header avec indicateur connexion */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Nouveau Bon de Travail
          </h1>
          {/* Badge de connexion */}
          <ConnectionStatus />
        </div>
        <p className="text-gray-600 dark:text-gray-400">
          Créez un nouveau bon de travail avec matériaux et description
        </p>
      </div>

      {/* Formulaire */}
      <WorkOrderForm 
        mode="create"
        onSave={handleSave}
        onCancel={handleCancel}
        onFormChange={handleFormChange}
        saving={saving}
      />
    </div>
  );
}
