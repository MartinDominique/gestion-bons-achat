'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import WorkOrderClientView from '../../../../components/work-orders/WorkOrderClientView';
import { Loader2 } from 'lucide-react';

export default function ClientViewPage() {
  const params = useParams();
  const [workOrder, setWorkOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadWorkOrder();
  }, [params.id]);

  const loadWorkOrder = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Utiliser la route publique qui ne nécessite pas d'auth
      const response = await fetch(`/api/work-orders/${params.id}/public`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur chargement BT');
      }
      
      const data = await response.json();
      console.log('CLIENT VIEW - Données BT chargées:', data.data);
      setWorkOrder(data.data);
      
    } catch (error) {
      console.error('Erreur chargement BT:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Chargement du bon de travail...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Bon de travail non trouvé</p>
      </div>
    );
  }

  return <WorkOrderClientView workOrder={workOrder} />;
}
