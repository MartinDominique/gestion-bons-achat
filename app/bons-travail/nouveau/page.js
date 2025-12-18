// app/bons-travail/nouveau/page.js

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
    // ✅ PROTECTION CRITIQUE: Bloquer si déjà en cours de sauvegarde
    if (saving) {
      console.log('⏸️ Sauvegarde déjà en cours - Requête ignorée');
      toast.error('Sauvegarde déjà en cours...', { duration: 2000 });
      return;
    }

    // ✅ NOUVEAU: Vérifier connexion AVANT de commencer
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
      return;
    }

    setSaving(true);

    console.log('📋 CRÉATION - PARENT REÇOIT - workOrderData complet:', workOrderData);
    console.log('📋 CRÉATION - PARENT REÇOIT - materials:', workOrderData.materials);
    console.log('📋 CRÉATION - PARENT REÇOIT - materials.length:', workOrderData.materials?.length || 0);
    console.log('📋 CRÉATION - PARENT REÇOIT - work_description:', workOrderData.work_description);
    console.log('📋 CRÉATION - status reçu:', status);

    // ✅ NOUVEAU: Toast de chargement pour feedback immédiat
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

      console.log('📋 CRÉATION - PAYLOAD ENVOYÉ À L\'API:', payload);
      console.log('📋 CRÉATION - PAYLOAD.materials:', payload.materials);
      console.log('📋 CRÉATION - PAYLOAD.materials.length:', payload.materials?.length || 0);
      console.log('📋 CRÉATION - PAYLOAD.work_description:', payload.work_description);
      console.log('📋 CRÉATION - PAYLOAD.status:', payload.status);

      // ✅ NOUVEAU: Fetch avec timeout de 20 secondes
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetch('/api/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const responseData = await response.json();
        console.log('📋 CRÉATION - RETOUR API COMPLET:', responseData);
        console.log('📋 CRÉATION - RETOUR API - data.materials:', responseData.data?.materials);
        console.log('📋 CRÉATION - RETOUR API - data.work_description:', responseData.data?.work_description);
        
        const savedWorkOrder = responseData.success ? responseData.data : responseData;
        console.log('📋 CRÉATION - savedWorkOrder extrait:', savedWorkOrder);
        
        // ✅ Marquer que le BT a été sauvegardé
        setHasSaved(true);
        // ✅ Réinitialiser les changements après sauvegarde
        setHasChanges(false);
        
        // ✅ NOUVEAU: Fermer le toast de chargement avec succès
        toast.dismiss(loadingToastId);
        
        if (status !== 'ready_for_signature') {
          const messages = {
            draft: { text: '💾 Bon de travail sauvegardé en brouillon', duration: 3000 },
            completed: { text: '✅ Bon de travail créé et finalisé', duration: 3000 },
            sent: { text: '📧 Bon de travail créé et envoyé au client', duration: 4000 }
          };

          const finalStatus = status || workOrderData.status || 'draft';
          const message = messages[finalStatus] || { text: '✅ Bon de travail créé avec succès', duration: 3000 };
          
          toast.success(message.text, {
            duration: message.duration,
            style: {
              background: '#10b981',
              color: '#fff',
              fontSize: '14px',
              fontWeight: '500',
            },
          });
          
          // Rediriger après un petit délai pour voir la notification
          setTimeout(() => {
            router.push('/bons-travail');
          }, 500);
        } else {
          // ✅ Pour ready_for_signature, confirmer aussi
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
        const errorData = await response.json();
        console.error('📋 CRÉATION - ERREUR API:', errorData);
        
        // ✅ NOUVEAU: Fermer le toast de chargement
        toast.dismiss(loadingToastId);
        
        toast.error('Erreur lors de la création: ' + (errorData.error || 'Erreur inconnue'), {
          duration: 5000,
          style: {
            background: '#ef4444',
            color: '#fff',
          },
        });
        
        throw new Error(errorData.error || 'Erreur API');
      }
    } catch (error) {
      console.error('📋 CRÉATION - ERREUR CATCH:', error);
      
      // ✅ NOUVEAU: Fermer le toast de chargement
      toast.dismiss(loadingToastId);
      
      // ✅ NOUVEAU: Messages d'erreur plus explicites selon le type d'erreur
      let errorMessage = 'Erreur: ' + error.message;
      
      if (error.name === 'AbortError') {
        errorMessage = '❌ Délai dépassé!\n\nLa connexion est trop lente.\nVos données n\'ont peut-être PAS été sauvegardées.\n\nVérifiez et réessayez.';
      } else if (error.message === 'Failed to fetch') {
        errorMessage = '❌ Connexion perdue!\n\nVos données n\'ont PAS été sauvegardées.\nVérifiez votre connexion et réessayez.';
      }
      
      toast.error(errorMessage, {
        duration: 8000,
        style: {
          background: '#dc2626',
          color: '#fff',
          whiteSpace: 'pre-line',
        },
      });
      
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Afficher confirmation SEULEMENT si des changements ont été faits ET jamais sauvegardé
    if (hasChanges && !hasSaved) {
      if (confirm('Annuler la création ? Toutes les données saisies seront perdues.')) {
        router.push('/bons-travail');
      }
    } else {
      // Pas de changements ou déjà sauvegardé → pas de confirmation
      router.push('/bons-travail');
    }
  };

  // Fonction appelée quand le formulaire change
  const handleFormChange = () => {
    setHasChanges(true);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Toaster 
        position="top-center"
        toastOptions={{
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />
      
      {/* Header avec indicateur de connexion */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-gray-900">
            Nouveau Bon de Travail
          </h1>
          {/* ✅ NOUVEAU: Badge de connexion visible */}
          <ConnectionStatus />
        </div>
        <p className="text-gray-600">
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
