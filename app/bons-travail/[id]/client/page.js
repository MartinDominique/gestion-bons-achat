'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import WorkOrderClientView from '../../../../components/work-orders/WorkOrderClientView';

export default function ClientViewPage() {
  const { id } = useParams();
  const [workOrder, setWorkOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadWorkOrder = async () => {
      try {
        const response = await fetch(`/api/work-orders/${id}`);
        if (response.ok) {
          const data = await response.json();
          setWorkOrder(data);
        }
      } catch (error) {
        console.error('Erreur chargement BT:', error);
      } finally {
        setLoading(false);
      }
    };

    if (id) loadWorkOrder();
  }, [id]);

  const handleStatusUpdate = (newStatus) => {
    if (workOrder) {
      setWorkOrder({ ...workOrder, status: newStatus });
    }
  };

  if (loading) return <div>Chargement...</div>;
  if (!workOrder) return <div>Bon de travail introuvable</div>;

  return (
    <WorkOrderClientView
      workOrder={workOrder}
      onStatusUpdate={handleStatusUpdate}
      companyInfo={{
        name: "Votre Entreprise Inc.",
        address: "123 Rue Principale, Ville, QC G1A 1A1", 
        phone: "(418) 555-1234",
        email: "contact@votre-entreprise.com",
        logo: "/logo-entreprise.png" // Optionnel
      }}
    />
  );
}'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import WorkOrderClientView from '../../../../components/work-orders/WorkOrderClientView';

export default function ClientViewPage() {
  const { id } = useParams();
  const [workOrder, setWorkOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadWorkOrder = async () => {
      try {
        const response = await fetch(`/api/work-orders/${id}`);
        if (response.ok) {
          const data = await response.json();
          setWorkOrder(data);
        }
      } catch (error) {
        console.error('Erreur chargement BT:', error);
      } finally {
        setLoading(false);
      }
    };

    if (id) loadWorkOrder();
  }, [id]);

  const handleStatusUpdate = (newStatus) => {
    if (workOrder) {
      setWorkOrder({ ...workOrder, status: newStatus });
    }
  };

  if (loading) return <div>Chargement...</div>;
  if (!workOrder) return <div>Bon de travail introuvable</div>;

  return (
    <WorkOrderClientView
      workOrder={workOrder}
      onStatusUpdate={handleStatusUpdate}
      companyInfo={{
        name: "Votre Entreprise Inc.",
        address: "123 Rue Principale, Ville, QC G1A 1A1", 
        phone: "(418) 555-1234",
        email: "contact@votre-entreprise.com",
        logo: "/logo-entreprise.png" // Optionnel
      }}
    />
  );
}
