/**
 * @file app/bons-travail/bl/[id]/client/page.js
 * @description Page de signature client pour un BL (accès public)
 * @version 1.1.0
 * @date 2026-02-17
 * @changelog
 *   1.1.0 - Ajout onStatusUpdate pour mise à jour statut après signature
 *   1.0.0 - Version initiale
 */

'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import DeliveryNoteClientView from '../../../../../components/delivery-notes/DeliveryNoteClientView';
import { Loader2 } from 'lucide-react';

export default function ClientViewBLPage() {
  const params = useParams();
  const [deliveryNote, setDeliveryNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDeliveryNote();
  }, [params.id]);

  const loadDeliveryNote = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/delivery-notes/${params.id}/public`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur chargement BL');
      }

      const data = await response.json();
      setDeliveryNote(data.data);

    } catch (error) {
      console.error('Erreur chargement BL:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-teal-600" />
          <p className="text-gray-600">Chargement du bon de livraison...</p>
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
            className="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (!deliveryNote) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Bon de livraison non trouvé</p>
      </div>
    );
  }

  return (
    <DeliveryNoteClientView
      deliveryNote={deliveryNote}
      onStatusUpdate={(newStatus) => {
        setDeliveryNote(prev => prev ? { ...prev, status: newStatus } : prev);
      }}
    />
  );
}
