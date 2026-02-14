/**
 * @file app/bons-travail/bl/[id]/modifier/page.js
 * @description Page d'édition d'un Bon de Livraison (BL) existant
 * @version 1.0.0
 * @date 2026-02-12
 * @changelog
 *   1.0.0 - Version initiale
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { notFound } from 'next/navigation';
import DeliveryNoteForm from '../../../../../components/delivery-notes/DeliveryNoteForm';
import ConnectionStatus from '../../../../../components/ConnectionStatus';

export default function ModifierBonLivraisonPage({ params }) {
  const router = useRouter();
  const [deliveryNote, setDeliveryNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Charger le bon de livraison
  useEffect(() => {
    const fetchDeliveryNote = async () => {
      try {
        const response = await fetch(`/api/delivery-notes/${params.id}?t=${Date.now()}`, {
          cache: 'no-store'
        });

        if (!response.ok) {
          if (response.status === 404) {
            notFound();
          }
          throw new Error('Erreur chargement bon de livraison');
        }

        const responseData = await response.json();
        const deliveryNoteData = responseData.success ? responseData.data : responseData;
        setDeliveryNote(deliveryNoteData);

      } catch (err) {
        console.error('Erreur:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (params.id) {
      fetchDeliveryNote();
    }
  }, [params.id]);

  // Toast helper
  const showToast = (message, type = 'info', duration = 3000) => {
    const existingToast = document.getElementById('app-toast');
    if (existingToast) {
      document.body.removeChild(existingToast);
    }

    const colors = {
      loading: { bg: '#3b82f6', text: 'white' },
      success: { bg: 'linear-gradient(to right, #10b981, #059669)', text: 'white' },
      error: { bg: '#dc2626', text: 'white' }
    };

    const color = colors[type] || colors.info;

    const toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.innerHTML = message;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: ${color.bg};
      color: ${color.text};
      padding: 16px 32px;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
      z-index: 9999;
      font-weight: 600;
      font-size: 15px;
      white-space: pre-line;
      text-align: center;
      max-width: 90vw;
    `;
    document.body.appendChild(toast);

    if (duration > 0) {
      setTimeout(() => {
        if (document.body.contains(toast)) {
          toast.style.opacity = '0';
          toast.style.transition = 'opacity 0.3s ease-out';
          setTimeout(() => {
            if (document.body.contains(toast)) {
              document.body.removeChild(toast);
            }
          }, 300);
        }
      }, duration);
    }

    return toast;
  };

  const handleSave = async (deliveryNoteData, status) => {
    if (!navigator.onLine) {
      showToast('Pas de connexion internet!\n\nImpossible de sauvegarder.', 'error', 5000);
      return;
    }

    setSaving(true);
    setError(null);

    showToast('Sauvegarde en cours...', 'loading', 0);

    try {
      const payload = {
        ...deliveryNoteData,
        status: status || deliveryNoteData.status || 'draft'
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`/api/delivery-notes/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erreur serveur (${response.status})`);
      }

      const responseData = await response.json();
      const savedDeliveryNote = responseData.success ? responseData.data : responseData;

      if (status !== 'ready_for_signature') {
        showToast('Sauvegardé avec succès!', 'success', 2000);
        setTimeout(() => {
          router.push('/bons-travail');
        }, 2000);
      } else {
        showToast('Préparation pour signature...', 'success', 2000);
      }

      setHasChanges(false);
      return savedDeliveryNote;

    } catch (err) {
      let errorMessage = 'Erreur de sauvegarde\n\n';
      if (err.name === 'AbortError') {
        errorMessage += 'Délai dépassé (15 sec)!\nVos données n\'ont PAS été sauvegardées.';
      } else if (err.message === 'Failed to fetch' || !navigator.onLine) {
        errorMessage += 'Connexion perdue!\nVos données n\'ont PAS été sauvegardées.';
      } else {
        errorMessage += err.message;
      }

      showToast(errorMessage, 'error', 8000);
      return null;

    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (hasChanges) {
      if (confirm('Annuler les modifications ? Les changements non sauvegardés seront perdus.')) {
        router.push('/bons-travail');
      }
    } else {
      router.push('/bons-travail');
    }
  };

  const handleFormChange = () => {
    setHasChanges(true);
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
          <span className="ml-2">Chargement du bon de livraison...</span>
        </div>
      </div>
    );
  }

  if (error && !deliveryNote) {
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

  if (!deliveryNote) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Bon de livraison introuvable</h2>
          <p className="text-gray-600 mb-6">Le bon de livraison demandé n'existe pas ou a été supprimé.</p>
          <button
            onClick={() => router.push('/bons-travail')}
            className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700"
          >
            Retour à la liste
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <nav className="mb-6">
        <div className="flex items-center justify-between">
          <ol className="flex items-center space-x-2 text-sm text-gray-500">
            <li>
              <button
                onClick={() => router.push('/bons-travail')}
                className="hover:text-teal-600"
              >
                Bons de Travail / Livraison
              </button>
            </li>
            <li>/</li>
            <li className="text-gray-900 font-medium">
              Modifier {deliveryNote.bl_number}
            </li>
          </ol>
          <ConnectionStatus />
        </div>
      </nav>

      <div className="mb-6 bg-orange-50 border border-orange-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-orange-900">
              Modification du bon de livraison {deliveryNote.bl_number}
            </h1>
            <p className="text-orange-700 text-sm mt-1">
              Créé le {new Date(deliveryNote.created_at).toLocaleDateString('fr-CA')} -
              Statut: <span className="font-medium">{deliveryNote.status}</span>
              {deliveryNote.materials && deliveryNote.materials.length > 0 && (
                <span> - {deliveryNote.materials.length} matériau(x)</span>
              )}
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-orange-700">Client:</div>
            <div className="font-medium text-orange-900">{deliveryNote.client?.name || 'Client non défini'}</div>
          </div>
        </div>
      </div>

      <DeliveryNoteForm
        deliveryNote={deliveryNote}
        mode="edit"
        onSave={handleSave}
        onCancel={handleCancel}
        onFormChange={handleFormChange}
        saving={saving}
      />
    </div>
  );
}
