/**
 * @file components/SplitView/PanelDeliveryNote.js
 * @description Read-only panel to display Bon de Livraison (BL) details
 *              inside the split view panel.
 *              - Fetches BL by ID or bl_number
 *              - Shows delivery date, client, address, linked BA, description
 *              - Materials: code, description, qty, unit, price, notes
 *              - Backorder: ordered, shipped, B/O columns
 *              - Totals summary + signature info
 * @version 2.0.0
 * @date 2026-04-11
 * @changelog
 *   2.0.0 - Refonte complète: ajout adresse client, BA lié, codes produits,
 *           colonnes backorder, notes matériaux, totaux, signature, lien parent/child
 *   1.0.0 - Version initiale (Phase E — Numéros cliquables)
 */

'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useSplitView } from './SplitViewContext';
import { Calendar, DollarSign, Truck, Package, MapPin, Hash, PenTool, ArrowRight, AlertTriangle } from 'lucide-react';

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

const formatDateTime = (isoStr) => {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleString('fr-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
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
        .select('*, client:clients(*), linked_po:purchase_orders(id, po_number)')
        .eq('id', id)
        .single();

      if (error) throw error;

      const { data: materials } = await supabase
        .from('delivery_note_materials')
        .select('*')
        .eq('delivery_note_id', id);

      // Charger les numéros BL parent/child
      const enriched = { ...blData, materials: materials || [] };
      await loadBOLinks(enriched);
      setDeliveryNote(enriched);
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
        .select('*, client:clients(*), linked_po:purchase_orders(id, po_number)')
        .eq('bl_number', blNumber)
        .single();

      if (error) throw error;

      const { data: materials } = await supabase
        .from('delivery_note_materials')
        .select('*')
        .eq('delivery_note_id', blData.id);

      const enriched = { ...blData, materials: materials || [] };
      await loadBOLinks(enriched);
      setDeliveryNote(enriched);
    } catch (err) {
      console.error('Erreur chargement BL:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadBOLinks = async (bl) => {
    if (bl.parent_bl_id) {
      const { data: parentBL } = await supabase
        .from('delivery_notes')
        .select('bl_number')
        .eq('id', bl.parent_bl_id)
        .single();
      bl.parent_bl_number = parentBL?.bl_number || null;
    }
    if (bl.child_bl_id) {
      const { data: childBL } = await supabase
        .from('delivery_notes')
        .select('bl_number')
        .eq('id', bl.child_bl_id)
        .single();
      bl.child_bl_number = childBL?.bl_number || null;
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
    draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    ready_for_signature: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    signed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    pending_send: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    sent: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
  }[deliveryNote.status] || 'bg-gray-100 text-gray-800';

  const materials = deliveryNote.materials || [];
  const hasBackorder = materials.some(m => m.ordered_quantity != null && m.ordered_quantity > 0);
  const hasAnyPrice = materials.some(m => m.show_price && m.unit_price > 0);
  const totalMaterials = materials
    .filter(m => m.show_price)
    .reduce((sum, m) => sum + (m.quantity || 0) * (m.unit_price || 0), 0);

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
        {deliveryNote.is_prix_jobe && (
          <div className="mt-2 bg-white/20 rounded px-2 py-1 text-xs font-semibold inline-block">
            PRIX JOBE (forfaitaire)
          </div>
        )}
      </div>

      {/* Liens backorder parent/child */}
      {(deliveryNote.parent_bl_number || deliveryNote.child_bl_number) && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm space-y-1">
          {deliveryNote.parent_bl_number && (
            <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
              <ArrowRight className="w-3.5 h-3.5" />
              <span>Suite de <strong>{deliveryNote.parent_bl_number}</strong></span>
            </div>
          )}
          {deliveryNote.child_bl_number && (
            <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
              <ArrowRight className="w-3.5 h-3.5" />
              <span>BL de suivi: <strong>{deliveryNote.child_bl_number}</strong></span>
            </div>
          )}
        </div>
      )}

      {/* Infos client + date */}
      <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="w-4 h-4 text-orange-500 flex-shrink-0" />
          <span className="text-gray-600 dark:text-gray-400">Livraison:</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">{formatDate(deliveryNote.delivery_date)}</span>
        </div>

        {deliveryNote.client?.address && (
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <span className="text-gray-600 dark:text-gray-400">{deliveryNote.client.address}</span>
          </div>
        )}

        {deliveryNote.linked_po?.po_number && (
          <div className="flex items-center gap-2 text-sm">
            <Hash className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <span className="text-gray-600 dark:text-gray-400">BA:</span>
            <span className="font-medium text-blue-600 dark:text-blue-400">{deliveryNote.linked_po.po_number}</span>
          </div>
        )}
      </div>

      {/* Description */}
      {deliveryNote.delivery_description && (
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-3">
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Description</h4>
          <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-line">{deliveryNote.delivery_description}</p>
        </div>
      )}

      {/* Matériaux */}
      {materials.length > 0 && (
        <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="bg-orange-50 dark:bg-orange-900/20 px-3 py-2 border-b dark:border-gray-700">
            <h4 className="text-sm font-semibold text-orange-700 dark:text-orange-300 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5" />
              Matériaux ({materials.length})
            </h4>
          </div>

          {/* Table header for backorder mode */}
          {hasBackorder && (
            <div className="bg-gray-50 dark:bg-gray-800 px-3 py-1.5 border-b dark:border-gray-700 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex">
              <span className="flex-1">Article</span>
              <span className="w-14 text-center">Cmd</span>
              <span className="w-14 text-center">Exp</span>
              <span className="w-14 text-center">B/O</span>
            </div>
          )}

          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {materials.map((mat, idx) => {
              const bo = hasBackorder && mat.ordered_quantity
                ? Math.max(0, (mat.ordered_quantity || 0) - (mat.previously_delivered || 0) - (mat.quantity || 0))
                : 0;
              return (
                <div key={idx} className="px-3 py-2 text-sm bg-white dark:bg-gray-800">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      {(mat.product_code || mat.product_id) && (
                        <span className="text-xs font-mono text-orange-600 dark:text-orange-400 mr-1.5">
                          [{mat.product_code || mat.product_id}]
                        </span>
                      )}
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {mat.description || 'Article'}
                      </span>
                    </div>
                    {hasBackorder && mat.ordered_quantity ? (
                      <div className="flex flex-shrink-0 ml-2">
                        <span className="w-14 text-center text-gray-600 dark:text-gray-400">{mat.ordered_quantity}</span>
                        <span className="w-14 text-center font-medium text-gray-900 dark:text-gray-100">{mat.quantity}</span>
                        <span className={`w-14 text-center font-medium ${bo > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                          {bo}
                        </span>
                      </div>
                    ) : (
                      mat.show_price && mat.unit_price > 0 && (
                        <span className="text-green-600 dark:text-green-400 font-medium ml-2 flex-shrink-0">
                          {formatCurrency((mat.quantity || 0) * (mat.unit_price || 0))}
                        </span>
                      )
                    )}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {!hasBackorder && <>{mat.quantity} </>}{mat.unit || 'UN'}
                    {mat.show_price && mat.unit_price > 0 && (
                      <span> × {formatCurrency(mat.unit_price)}</span>
                    )}
                    {mat.previously_delivered > 0 && (
                      <span className="ml-1.5 text-blue-500 dark:text-blue-400">(déjà livré: {mat.previously_delivered})</span>
                    )}
                  </div>
                  {mat.notes && (
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 italic">
                      Note: {mat.notes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {/* Total matériaux */}
          {hasAnyPrice && (
            <div className="bg-orange-50 dark:bg-orange-900/20 px-3 py-2 border-t dark:border-gray-700 flex justify-between items-center">
              <span className="text-sm font-semibold text-orange-700 dark:text-orange-300">Total matériaux</span>
              <span className="text-sm font-bold text-orange-700 dark:text-orange-300">{formatCurrency(totalMaterials)}</span>
            </div>
          )}
        </div>
      )}

      {/* Signature */}
      {deliveryNote.signature_data && (
        <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2 border-b dark:border-gray-700">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <PenTool className="w-3.5 h-3.5" />
              Signature
            </h4>
          </div>
          <div className="p-3 bg-white dark:bg-gray-800 text-center">
            <img
              src={deliveryNote.signature_data}
              alt="Signature client"
              className="max-h-20 mx-auto border dark:border-gray-600 rounded bg-white"
            />
            {deliveryNote.client_signature_name && (
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 font-medium">{deliveryNote.client_signature_name}</p>
            )}
            {deliveryNote.signature_timestamp && (
              <p className="text-xs text-gray-400 dark:text-gray-500">{formatDateTime(deliveryNote.signature_timestamp)}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
