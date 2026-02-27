/**
 * @file components/SplitView/PanelDeliveryNote.js
 * @description Read-only panel to display Bon de Livraison (BL) details
 *              inside the split view panel.
 *              - Fetches BL by ID or bl_number
 *              - Shows delivery date, client, description, materials
 * @version 1.0.0
 * @date 2026-02-27
 * @changelog
 *   1.0.0 - Version initiale (Phase E — Numéros cliquables)
 */

'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useSplitView } from './SplitViewContext';
import { Calendar, DollarSign, Truck, Package } from 'lucide-react';

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD'
  }).format(amount || 0);
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

export default function PanelDeliveryNote({ data }) {
  const { closePanel } = useSplitView();
  const [deliveryNote, setDeliveryNote] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (data?.deliveryNoteId) {
      loadDeliveryNote(data.deliveryNoteId);
    } else if (data?.blNumber) {
      loadDeliveryNoteByNumber(data.blNumber);
    } else if (data?.deliveryNote) {
      setDeliveryNote(data.deliveryNote);
      setLoading(false);
    }
  }, [data]);

  const loadDeliveryNote = async (id) => {
    try {
      setLoading(true);
      const { data: blData, error } = await supabase
        .from('delivery_notes')
        .select('*, client:clients(name, company, address)')
        .eq('id', id)
        .single();

      if (error) throw error;

      // Charger les matériaux
      const { data: materials } = await supabase
        .from('delivery_note_materials')
        .select('*')
        .eq('delivery_note_id', id);

      setDeliveryNote({ ...blData, materials: materials || [] });
    } catch (err) {
      console.error('Erreur chargement BL:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadDeliveryNoteByNumber = async (blNumber) => {
    try {
      setLoading(true);
      const { data: blData, error } = await supabase
        .from('delivery_notes')
        .select('*, client:clients(name, company, address)')
        .eq('bl_number', blNumber)
        .single();

      if (error) throw error;

      // Charger les matériaux
      const { data: materials } = await supabase
        .from('delivery_note_materials')
        .select('*')
        .eq('delivery_note_id', blData.id);

      setDeliveryNote({ ...blData, materials: materials || [] });
    } catch (err) {
      console.error('Erreur chargement BL:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  if (!deliveryNote) {
    return (
      <div className="p-6 text-center text-gray-500 dark:text-gray-400">
        Bon de livraison non trouvé
      </div>
    );
  }

  const statusLabel = {
    draft: 'Brouillon',
    ready_for_signature: 'Prêt signature',
    signed: 'Signé',
    pending_send: 'En attente envoi',
    sent: 'Envoyé'
  }[deliveryNote.status] || deliveryNote.status;

  const statusColor = {
    draft: 'bg-gray-100 text-gray-800',
    ready_for_signature: 'bg-yellow-100 text-yellow-800',
    signed: 'bg-blue-100 text-blue-800',
    pending_send: 'bg-yellow-100 text-yellow-800',
    sent: 'bg-green-100 text-green-800'
  }[deliveryNote.status] || 'bg-gray-100 text-gray-800';

  const materials = deliveryNote.materials || [];

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-lg p-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">{deliveryNote.bl_number}</h3>
            <p className="text-orange-100 text-sm">
              {deliveryNote.client?.name || deliveryNote.client_name || 'Client inconnu'}
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Détails */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="w-4 h-4 text-orange-500" />
          <span className="text-gray-600 dark:text-gray-400">Date de livraison:</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">{formatDate(deliveryNote.delivery_date)}</span>
        </div>

        {deliveryNote.is_prix_jobe && (
          <div className="flex items-center gap-2 text-sm">
            <DollarSign className="w-4 h-4 text-purple-500" />
            <span className="font-medium text-purple-700 dark:text-purple-400">Prix Jobe (forfaitaire)</span>
          </div>
        )}

        {deliveryNote.delivery_description && (
          <div className="text-sm">
            <span className="text-gray-600 dark:text-gray-400 font-medium">Description:</span>
            <p className="text-gray-900 dark:text-gray-100 mt-1 whitespace-pre-line">{deliveryNote.delivery_description}</p>
          </div>
        )}
      </div>

      {/* Matériaux */}
      {materials.length > 0 && (
        <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2 border-b dark:border-gray-700">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5" />
              Matériaux ({materials.length})
            </h4>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-64 overflow-y-auto">
            {materials.map((mat, idx) => (
              <div key={idx} className="px-3 py-2 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium text-gray-900 dark:text-gray-100 truncate flex-1">
                    {mat.description || mat.product_id}
                  </span>
                  <span className="text-green-600 dark:text-green-400 font-medium ml-2 flex-shrink-0">
                    {formatCurrency((mat.quantity || 0) * (mat.unit_price || 0))}
                  </span>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {mat.quantity} {mat.unit || 'UN'} x {formatCurrency(mat.unit_price || 0)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
