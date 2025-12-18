//==============================
//app/bons-travail/[id]/modifier/page.js
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
        const response = await fetch(`/api/work-orders/${params.id}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            notFound();
          }
          throw new Error('Erreur chargement bon de travail');
        }

        const responseData = await response.json();
        console.log('Données BT chargées:', responseData);
        
        const workOrderData = responseData.success ? responseData.data : responseData;
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

  // Sauvegarder les modifications
  const handleSave = async (workOrderData, status) => {
    // ✅ NOUVEAU: Vérifier connexion AVANT de commencer
    if (!navigator.onLine) {
      alert('❌ Pas de connexion internet!\n\nImpossible de sauvegarder.\nVérifiez votre connexion et réessayez.');
      return;
    }

    setSaving(true);
    setError(null);

    console.log('📝 MODIFICATION - PARENT REÇOIT - workOrderData complet:', workOrderData);
    console.log('📝 MODIFICATION - PARENT REÇOIT - materials:', workOrderData.materials);
    console.log('📝 MODIFICATION - PARENT REÇOIT - materials.length:', workOrderData.materials?.length || 0);
    console.log('📝 MODIFICATION - PARENT REÇOIT - work_description:', workOrderData.work_description);
    console.log('📝 MODIFICATION - status reçu:', status);

    // ✅ NOUVEAU: Toast de chargement
    const loadingToast = document.createElement('div');
    loadingToast.id = 'loading-toast';
    loadingToast.innerHTML = '💾 Sauvegarde en cours...';
    loadingToast.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #3b82f6;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 9999;
      font-weight: 500;
    `;
    document.body.appendChild(loadingToast);

    try {
      const payload = {
        ...workOrderData,
        status: status || workOrderData.status || 'draft'
      };

      console.log('📝 MODIFICATION - PAYLOAD ENVOYÉ À L\'API:', payload);
      console.log('📝 MODIFICATION - PAYLOAD.materials:', payload.materials);
      console.log('📝 MODIFICATION - PAYLOAD.materials.length:', payload.materials?.length || 0);
      console.log('📝 MODIFICATION - PAYLOAD.work_description:', payload.work_description);
      console.log('📝 MODIFICATION - PAYLOAD.status:', payload.status);

      // ✅ NOUVEAU: Fetch avec timeout de 20 secondes
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetch(`/api/work-orders/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // ✅ NOUVEAU: Retirer le toast de chargement
      const existingToast = document.getElementById('loading-toast');
      if (existingToast) {
        document.body.removeChild(existingToast);
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de la sauvegarde');
      }

      const responseData = await response.json();
      console.log('📝 MODIFICATION - RETOUR API COMPLET:', responseData);
      console.log('📝 MODIFICATION - RETOUR API - data.materials:', responseData.data?.materials);
      console.log('📝 MODIFICATION - RETOUR API - data.work_description:', responseData.data?.work_description);
      
      const savedWorkOrder = responseData.success ? responseData.data : responseData;
      console.log('📝 MODIFICATION - savedWorkOrder extrait:', savedWorkOrder);
      
      // Messages selon statut (seulement si pas "présenter client")
      if (status !== 'ready_for_signature') {
        const messages = {
          completed: 'Bon de travail finalisé avec succès',
          sent: 'Bon de travail envoyé au client'
        };

        const finalStatus = status || workOrderData.status || 'draft';
        const message = messages[finalStatus] || '✅ Bon de travail mis à jour avec succès';
        
        // Créer le toast de succès
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(to right, #10b981, #059669);
          color: white;
          padding: 16px 32px;
          border-radius: 12px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
          z-index: 9999;
          font-weight: 600;
          font-size: 16px;
          animation: slideDown 0.3s ease-out;
        `;
        
        const style = document.createElement('style');
        style.textContent = `
          @keyframes slideDown {
            from {
              opacity: 0;
              transform: translateX(-50%) translateY(-20px);
            }
            to {
              opacity: 1;
              transform: translateX(-50%) translateY(0);
            }
          }
        `;
        document.head.appendChild(style);
        document.body.appendChild(toast);
        
        setTimeout(() => {
          toast.style.opacity = '0';
          toast.style.transition = 'opacity 0.3s ease-out';
          setTimeout(() => {
            document.body.removeChild(toast);
            document.head.removeChild(style);
            router.push('/bons-travail');
          }, 300);
        }, 2000);
      } else {
        // ✅ NOUVEAU: Toast de succès pour ready_for_signature aussi
        const toast = document.createElement('div');
        toast.textContent = '✅ Préparation pour signature...';
        toast.style.cssText = `
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: #10b981;
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          z-index: 9999;
          font-weight: 500;
        `;
        document.body.appendChild(toast);
        setTimeout(() => {
          if (document.body.contains(toast)) {
            document.body.removeChild(toast);
          }
        }, 2000);
      }
      
      // Réinitialiser les changements après sauvegarde
      setHasChanges(false);
      
      return savedWorkOrder;

    } catch (err) {
      console.error('📝 MODIFICATION - Erreur sauvegarde:', err);
      
      // ✅ NOUVEAU: Retirer le toast de chargement en cas d'erreur
      const existingToast = document.getElementById('loading-toast');
      if (existingToast) {
        document.body.removeChild(existingToast);
      }
      
      // ✅ NOUVEAU: Messages d'erreur plus explicites
      let errorMessage = err.message;
      
      if (err.name === 'AbortError') {
        errorMessage = '❌ Délai dépassé!\n\nLa connexion est trop lente.\nVos données n\'ont peut-être PAS été sauvegardées.\n\nVérifiez et réessayez.';
      } else if (err.message === 'Failed to fetch') {
        errorMessage = '❌ Connexion perdue!\n\nVos données n\'ont PAS été sauvegardées.\nVérifiez votre connexion et réessayez.';
      }
      
      setError(errorMessage);
      alert(errorMessage);
      throw err;
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

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Erreur</h2>
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
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Bon de travail introuvable</h2>
          <p className="text-gray-600 mb-6">Le bon de travail demandé n'existe pas ou a été supprimé.</p>
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
            <li className="text-gray-900 font-medium">
              Modifier {workOrder.bt_number}
            </li>
          </ol>
          {/* ✅ NOUVEAU: Badge de connexion */}
          <ConnectionStatus />
        </div>
      </nav>

      {/* Informations du BT */}
      <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-blue-900">
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
            <div className="font-medium text-blue-900">{workOrder.client?.name || 'Client non défini'}</div>
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
