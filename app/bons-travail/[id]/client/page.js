'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { notFound } from 'next/navigation';
import WorkOrderClientView from '../../../components/work-orders/WorkOrderClientView';

export default function ClientViewPage() {
  const { id } = useParams();
  const [workOrder, setWorkOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Charger le bon de travail
  useEffect(() => {
    const loadWorkOrder = async () => {
      try {
        const response = await fetch(`/api/work-orders/${id}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            notFound();
          }
          throw new Error('Erreur chargement bon de travail');
        }

        const responseData = await response.json();
        console.log('CLIENT VIEW - Données BT chargées:', responseData);
        
        // Gérer le format {success: true, data: ...}
        const workOrderData = responseData.success ? responseData.data : responseData;
        
        // Vérifier que le BT est prêt pour présentation client
        if (workOrderData.status !== 'ready_for_signature' && 
            workOrderData.status !== 'signed' && 
            workOrderData.status !== 'pending_send' && 
            workOrderData.status !== 'sent') {
          throw new Error('Ce bon de travail n\'est pas prêt pour présentation client');
        }
        
        setWorkOrder(workOrderData);
        
      } catch (err) {
        console.error('CLIENT VIEW - Erreur:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadWorkOrder();
    }
  }, [id]);

  // Gérer les changements de statut
  const handleStatusUpdate = (newStatus) => {
    if (workOrder) {
      setWorkOrder(prev => ({ ...prev, status: newStatus }));
    }
  };

  // États de chargement
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">Chargement du bon de travail...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-red-600 text-5xl mb-4">⚠️</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Erreur</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={() => window.close()}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-gray-400 text-5xl mb-4">📄</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Bon de travail introuvable</h2>
            <p className="text-gray-600 mb-4">
              Le bon de travail demandé n'existe pas ou n'est pas disponible.
            </p>
            <button
              onClick={() => window.close()}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <WorkOrderClientView
      workOrder={workOrder}
      onStatusUpdate={handleStatusUpdate}
      companyInfo={{
        name: "Votre Entreprise Inc.",
        address: "123 Rue Principale, Ville, QC G1A 1A1",
        phone: "(418) 555-1234", 
        email: "contact@votre-entreprise.com",
        // logo: "/logo-entreprise.png" // Optionnel - décommente si tu as un logo
      }}
    />
  );
}
