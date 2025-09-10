'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import WorkOrderForm from '../../../components/work-orders/WorkOrderForm';

export default function NouveauBonTravailPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const handleSave = async (workOrderData) => {
    setSaving(true);
    try {
      const response = await fetch('/api/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workOrderData)
      });

      if (response.ok) {
        router.push('/bons-travail');
      } else {
        alert('Erreur lors de la création');
      }
    } catch (error) {
      alert('Erreur: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    router.push('/bons-travail');
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <WorkOrderForm 
        mode="create"
        onSave={handleSave}
        onCancel={handleCancel}
        saving={saving}
      />
    </div>
  );
}
