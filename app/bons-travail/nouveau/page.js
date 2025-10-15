'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import WorkOrderForm from '../../../components/work-orders/WorkOrderForm';

export default function NouveauBonTravailPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const handleSave = async (workOrderData, status) => {
    setSaving(true);

    // DEBUG CRITIQUE - AJOUTER CES LIGNES
    console.log('🔍 CRÉATION - PARENT REÇOIT - workOrderData complet:', workOrderData);
    console.log('🔍 CRÉATION - PARENT REÇOIT - materials:', workOrderData.materials);
    console.log('🔍 CRÉATION - PARENT REÇOIT - materials.length:', workOrderData.materials?.length || 0);
    console.log('🔍 CRÉATION - PARENT REÇOIT - work_description:', workOrderData.work_description);
    console.log('🔍 CRÉATION - status reçu:', status);

    try {
      const payload = {
        ...workOrderData,
        status: status || workOrderData.status || 'draft'
      };

      console.log('🔍 CRÉATION - PAYLOAD ENVOYÉ À L\'API:', payload);
      console.log('🔍 CRÉATION - PAYLOAD.materials:', payload.materials);
      console.log('🔍 CRÉATION - PAYLOAD.materials.length:', payload.materials?.length || 0);
      console.log('🔍 CRÉATION - PAYLOAD.work_description:', payload.work_description);
      console.log('🔍 CRÉATION - PAYLOAD.status:', payload.status);

      const response = await fetch('/api/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const responseData = await response.json();
        console.log('🔍 CRÉATION - RETOUR API COMPLET:', responseData);
        console.log('🔍 CRÉATION - RETOUR API - data.materials:', responseData.data?.materials);
        console.log('🔍 CRÉATION - RETOUR API - data.work_description:', responseData.data?.work_description);
        
        // MODIFICATION: Extraire le work order selon le format de l'API
        const savedWorkOrder = responseData.success ? responseData.data : responseData;
        console.log('🔍 CRÉATION - savedWorkOrder extrait:', savedWorkOrder);
        
        // Messages selon statut (MODIFIÉ: seulement si pas "présenter client")
        if (status !== 'ready_for_signature') {
          const messages = {
            draft: 'Bon de travail sauvegardé en brouillon en caca',
            completed: 'Bon de travail créé et finalisé avec succès',
            sent: 'Bon de travail créé et envoyé au client'
          };

          const finalStatus = status || workOrderData.status || 'draft';
          alert(messages[finalStatus] || 'Bon de travail créé avec succès');
          router.push('/bons-travail');
        }
        
        // IMPORTANT: Retourner le work order sauvegardé pour WorkOrderForm
        return savedWorkOrder;
        
      } else {
        const errorData = await response.json();
        console.error('🔍 CRÉATION - ERREUR API:', errorData);
        alert('Erreur lors de la création: ' + (errorData.error || 'Erreur inconnue'));
        throw new Error(errorData.error || 'Erreur API');
      }
    } catch (error) {
      console.error('🔍 CRÉATION - ERREUR CATCH:', error);
      alert('Erreur: ' + error.message);
      throw error; // Re-throw pour que WorkOrderForm puisse gérer
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (confirm('Annuler la création ? Toutes les données saisies seront perdues.')) {
      router.push('/bons-travail');
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Nouveau Bon de Travail
        </h1>
        <p className="text-gray-600">
          Créez un nouveau bon de travail avec matériaux et description
        </p>
      </div>

      {/* Formulaire */}
      <WorkOrderForm 
        mode="create"
        onSave={handleSave}
        onCancel={handleCancel}
        saving={saving}
      />
    </div>
  );
}
