/**
 * @file app/bons-travail/nouveau-bl/page.js
 * @description Page de création d'un nouveau Bon de Livraison (BL)
 * @version 1.0.0
 * @date 2026-02-12
 * @changelog
 *   1.0.0 - Version initiale
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';
import DeliveryNoteForm from '../../../components/delivery-notes/DeliveryNoteForm';
import ConnectionStatus from '../../../components/ConnectionStatus';

export default function NouveauBonLivraisonPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const handleSave = async (deliveryNoteData, status) => {
    if (saving) {
      toast.error('Sauvegarde déjà en cours...', { duration: 2000 });
      return;
    }

    if (!navigator.onLine) {
      toast.error('Pas de connexion internet!\n\nImpossible de sauvegarder.', {
        duration: 6000,
        style: { background: '#dc2626', color: '#fff', whiteSpace: 'pre-line', fontWeight: '500' },
      });
      return;
    }

    setSaving(true);

    const loadingToastId = toast.loading('Sauvegarde en cours...', {
      style: { background: '#3b82f6', color: '#fff' },
    });

    try {
      const payload = {
        ...deliveryNoteData,
        status: status || deliveryNoteData.status || 'draft'
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch('/api/delivery-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      toast.dismiss(loadingToastId);

      if (response.ok) {
        const responseData = await response.json();
        const savedDeliveryNote = responseData.success ? responseData.data : responseData;

        setHasSaved(true);
        setHasChanges(false);

        if (status !== 'ready_for_signature') {
          toast.success('Bon de livraison sauvegardé!', {
            duration: 3000,
            style: { background: '#10b981', color: '#fff', fontSize: '14px', fontWeight: '600' },
          });

          setTimeout(() => {
            router.push('/bons-travail');
          }, 500);
        } else {
          toast.success('Préparation pour signature...', {
            duration: 2000,
            style: { background: '#10b981', color: '#fff' },
          });
        }

        return savedDeliveryNote;
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erreur serveur (${response.status})`);
      }

    } catch (error) {
      toast.dismiss(loadingToastId);

      let errorMessage = 'Erreur de sauvegarde\n\n';
      if (error.name === 'AbortError') {
        errorMessage += 'Délai dépassé (15 sec)!\nVos données n\'ont PAS été sauvegardées.';
      } else if (error.message === 'Failed to fetch' || !navigator.onLine) {
        errorMessage += 'Connexion perdue!\nVos données n\'ont PAS été sauvegardées.';
      } else {
        errorMessage += error.message;
      }

      toast.error(errorMessage, {
        duration: 8000,
        style: { background: '#dc2626', color: '#fff', whiteSpace: 'pre-line' },
      });

      return null;

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
          success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
        }}
      />

      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-gray-900">
            Nouveau Bon de Livraison
          </h1>
          <ConnectionStatus />
        </div>
        <p className="text-gray-600">
          Créez un nouveau bon de livraison avec matériaux
        </p>
      </div>

      <DeliveryNoteForm
        mode="create"
        onSave={handleSave}
        onCancel={handleCancel}
        onFormChange={handleFormChange}
        saving={saving}
      />
    </div>
  );
}
