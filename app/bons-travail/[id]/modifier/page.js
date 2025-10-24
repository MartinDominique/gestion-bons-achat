//==============================
//app/bons-travail/[id]/modifier/page.js
//===============================

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { notFound } from 'next/navigation';
import WorkOrderForm from '../../../../components/work-orders/WorkOrderForm';

export default function ModifierBonTravailPage({ params }) {
  const router = useRouter();
  const [workOrder, setWorkOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [hasChanges, setHasChanges] = useState(false); // ✅ Suivre si des changements ont été faits

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
        
        // CORRECTION: Gérer le format {success: true, data: ...}
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
    setSaving(true);
    setError(null);

    // DEBUG CRITIQUE - AJOUTER CES LIGNES
    console.log('🔍 MODIFICATION - PARENT REÇOIT - workOrderData complet:', workOrderData);
    console.log('🔍 MODIFICATION - PARENT REÇOIT - materials:', workOrderData.materials);
    console.log('🔍 MODIFICATION - PARENT REÇOIT - materials.length:', workOrderData.materials?.length || 0);
    console.log('🔍 MODIFICATION - PARENT REÇOIT - work_description:', workOrderData.work_description);
    console.log('🔍 MODIFICATION - status reçu:', status);

    try {
      const payload = {
        ...workOrderData,
        status: status || workOrderData.status || 'draft'
      };

      console.log('🔍 MODIFICATION - PAYLOAD ENVOYÉ À L\'API:', payload);
      console.log('🔍 MODIFICATION - PAYLOAD.materials:', payload.materials);
      console.log('🔍 MODIFICATION - PAYLOAD.materials.length:', payload.materials?.length || 0);
      console.log('🔍 MODIFICATION - PAYLOAD.work_description:', payload.work_description);
      console.log('🔍 MODIFICATION - PAYLOAD.status:', payload.status);

      // CORRECTION: Utiliser la bonne URL avec l'ID
      const response = await fetch(`/api/work-orders/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de la sauvegarde');
      }

      const responseData = await response.json();
      console.log('🔍 MODIFICATION - RETOUR API COMPLET:', responseData);
      console.log('🔍 MODIFICATION - RETOUR API - data.materials:', responseData.data?.materials);
      console.log('🔍 MODIFICATION - RETOUR API - data.work_description:', responseData.data?.work_description);
      
      // MODIFICATION: Extraire le work order selon le format de l'API
      const savedWorkOrder = responseData.success ? responseData.data : responseData;
      console.log('🔍 MODIFICATION - savedWorkOrder extrait:', savedWorkOrder);
      
      // Messages selon statut (MODIFIÉ: seulement si pas "présenter client")
      if (status !== 'ready_for_signature') {
        const messages = {
          //draft: 'Bon de travail sauvegardé en brouillon',
          completed: 'Bon de travail finalisé avec succès',
          sent: 'Bon de travail envoyé au client'
        };

       const finalStatus = status || workOrderData.status || 'draft';
        const message = messages[finalStatus] || 'Bon de travail mis à jour avec succès';
        
        // Créer le toast
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
        
        // Ajouter l'animation CSS
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
        
        // Rediriger après 2 secondes
        setTimeout(() => {
          toast.style.opacity = '0';
          toast.style.transition = 'opacity 0.3s ease-out';
          setTimeout(() => {
            document.body.removeChild(toast);
            document.head.removeChild(style);
            router.push('/bons-travail');
          }, 300);
        }, 2000);
      }
      
      // ✅ Réinitialiser les changements après sauvegarde
      setHasChanges(false);
      
      // IMPORTANT: Retourner le work order sauvegardé pour WorkOrderForm
      return savedWorkOrder;

    } catch (err) {
      console.error('🔍 MODIFICATION - Erreur sauvegarde:', err);
      setError(err.message);
      alert('Erreur: ' + err.message);
      throw err; // Re-throw pour que WorkOrderForm puisse gérer
    } finally {
      setSaving(false);
    }
  };

  // Annuler et retourner à la liste
  const handleCancel = () => {
    // Afficher confirmation SEULEMENT si des changements ont été faits
    if (hasChanges) {
      if (confirm('Annuler les modifications ? Les changements non sauvegardés seront perdus.')) {
        router.push('/bons-travail');
      }
    } else {
      // Pas de changements → pas de confirmation
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
          <p className="text-red-700">{error}</p>
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
      {/* Breadcrumb */}
      <nav className="mb-6">
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
