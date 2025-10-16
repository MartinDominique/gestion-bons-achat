
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast'; // ⭐ NOUVEAU
import WorkOrderForm from '../../../components/work-orders/WorkOrderForm';

export default function NouveauBonTravailPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const handleSave = async (workOrderData, status) => {
    setSaving(true);

    console.log('📋 CRÉATION - PARENT REÇOIT - workOrderData complet:', workOrderData);
    console.log('📋 CRÉATION - PARENT REÇOIT - materials:', workOrderData.materials);
    console.log('📋 CRÉATION - PARENT REÇOIT - materials.length:', workOrderData.materials?.length || 0);
    console.log('📋 CRÉATION - PARENT REÇOIT - work_description:', workOrderData.work_description);
    console.log('📋 CRÉATION - status reçu:', status);

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

      const response = await fetch('/api/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const responseData = await response.json();
        console.log('📋 CRÉATION - RETOUR API COMPLET:', responseData);
        console.log('📋 CRÉATION - RETOUR API - data.materials:', responseData.data?.materials);
        console.log('📋 CRÉATION - RETOUR API - data.work_description:', responseData.data?.work_description);
        
        const savedWorkOrder = responseData.success ? responseData.data : responseData;
        console.log('📋 CRÉATION - savedWorkOrder extrait:', savedWorkOrder);
        
        // ⭐ NOUVEAU : Toast au lieu de alert
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
        }
        
        return savedWorkOrder;
        
      } else {
        const errorData = await response.json();
        console.error('📋 CRÉATION - ERREUR API:', errorData);
        
        // ⭐ NOUVEAU : Toast d'erreur
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
      
      // ⭐ NOUVEAU : Toast d'erreur
      toast.error('Erreur: ' + error.message, {
        duration: 5000,
      });
      
      throw error;
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
      {/* ⭐ NOUVEAU : Toaster component */}
      <Toaster 
        position="top-right"
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
