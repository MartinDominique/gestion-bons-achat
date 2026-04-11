/**
 * @file components/SplitView/PanelWorkOrder.js
 * @description Read-only panel to display Bon de Travail (BT) details
 *              inside the split view panel.
 *              - Fetches BT via API (supabaseAdmin, bypass RLS)
 *              - Shows work date, client, address, linked BA, description
 *              - Time entries: start/end, pause, surcharge, transport, travel
 *              - Materials: code, description, qty, unit, price, notes
 *              - Totals summary + signature info
 * @version 2.1.0
 * @date 2026-04-11
 * @changelog
 *   2.1.0 - Fix matériaux invisibles: utilise API route au lieu de Supabase client
 *           (bypass RLS, enrichissement produit garanti)
 *   2.0.0 - Refonte complète: ajout adresse client, BA lié, transport/déplacement,
 *           pauses, surcharges, codes produits, notes matériaux, totaux, signature
 *   1.0.0 - Version initiale (Phase E — Numéros cliquables)
 */

'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useSplitView } from './SplitViewContext';
import { Clock, Calendar, DollarSign, User, FileText, Package, MapPin, Truck, PenTool, Hash, Coffee } from 'lucide-react';

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

const formatHours = (h) => {
  if (!h) return '0h';
  const hours = Math.floor(h);
  const minutes = Math.round((h - hours) * 60);
  return minutes > 0 ? `${hours}h${String(minutes).padStart(2, '0')}` : `${hours}h`;
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

const surchargeLabels = {
  evening: { label: 'Soir', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' },
  saturday: { label: 'Samedi', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
  sunday: { label: 'Dimanche', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  holiday: { label: 'Férié', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
};

export default function PanelWorkOrder({ data }) {
  const { closePanel } = useSplitView();
  const [workOrder, setWorkOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (data?.workOrderId) {
      loadWorkOrderById(data.workOrderId);
    } else if (data?.btNumber) {
      loadWorkOrderByNumber(data.btNumber);
    } else if (data?.workOrder) {
      setWorkOrder(data.workOrder);
      setLoading(false);
    }
  }, [data]);

  // Charger via API route (supabaseAdmin, bypass RLS, matériaux enrichis)
  const loadWorkOrderById = async (id) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/work-orders/${id}`);
      if (res.ok) {
        const result = await res.json();
        if (result.success !== false && (result.data || result)) {
          setWorkOrder(result.data || result);
          return;
        }
      }
      // Fallback Supabase client si API échoue
      await loadWorkOrderFallback('id', id);
    } catch (err) {
      console.error('Erreur chargement BT:', err);
      await loadWorkOrderFallback('id', id);
    } finally {
      setLoading(false);
    }
  };

  const loadWorkOrderByNumber = async (btNumber) => {
    try {
      setLoading(true);
      // Trouver l'ID via Supabase client
      const { data: woData, error } = await supabase
        .from('work_orders')
        .select('id')
        .eq('bt_number', btNumber)
        .single();

      if (error || !woData) {
        console.error('BT non trouvé par numéro:', btNumber);
        setLoading(false);
        return;
      }

      // Charger les détails complets via API
      const res = await fetch(`/api/work-orders/${woData.id}`);
      if (res.ok) {
        const result = await res.json();
        if (result.success !== false && (result.data || result)) {
          setWorkOrder(result.data || result);
          return;
        }
      }
      // Fallback
      await loadWorkOrderFallback('id', woData.id);
    } catch (err) {
      console.error('Erreur chargement BT:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fallback: chargement direct via Supabase client
  const loadWorkOrderFallback = async (field, value) => {
    try {
      const { data: woData, error } = await supabase
        .from('work_orders')
        .select('*, client:clients(*), linked_po:purchase_orders(id, po_number)')
        .eq(field, value)
        .single();

      if (error) throw error;

      const { data: materials } = await supabase
        .from('work_order_materials')
        .select('*')
        .eq('work_order_id', woData.id);

      setWorkOrder({ ...woData, materials: materials || [] });
    } catch (err) {
      console.error('Erreur fallback BT:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div className="p-6 text-center text-gray-500 dark:text-gray-400">
        Bon de travail non trouvé
      </div>
    );
  }

  const statusLabel = {
    draft: 'Brouillon',
    signed: 'Signé',
    pending_send: 'En attente envoi',
    completed: 'Complété',
    sent: 'Envoyé'
  }[workOrder.status] || workOrder.status;

  const statusColor = {
    draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    signed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    pending_send: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    completed: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    sent: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
  }[workOrder.status] || 'bg-gray-100 text-gray-800';

  const timeEntries = workOrder.time_entries || [];
  const materials = workOrder.materials || [];
  const hasAnyPrice = materials.some(m => m.show_price && m.unit_price > 0);
  const totalMaterials = materials
    .filter(m => m.show_price)
    .reduce((sum, m) => sum + (m.quantity || 0) * (m.unit_price || 0), 0);

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-teal-500 to-emerald-500 rounded-lg p-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">{workOrder.bt_number}</h3>
            <p className="text-teal-100 text-sm">
              {workOrder.client?.name || 'Client inconnu'}
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
        {workOrder.is_prix_jobe && (
          <div className="mt-2 bg-white/20 rounded px-2 py-1 text-xs font-semibold inline-block">
            PRIX JOBE (forfaitaire)
          </div>
        )}
      </div>

      {/* Infos client + date */}
      <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="w-4 h-4 text-teal-500 flex-shrink-0" />
          <span className="text-gray-600 dark:text-gray-400">Date:</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">{formatDate(workOrder.work_date)}</span>
        </div>

        {workOrder.client?.address && (
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <span className="text-gray-600 dark:text-gray-400">{workOrder.client.address}</span>
          </div>
        )}

        {workOrder.linked_po?.po_number && (
          <div className="flex items-center gap-2 text-sm">
            <Hash className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <span className="text-gray-600 dark:text-gray-400">BA:</span>
            <span className="font-medium text-blue-600 dark:text-blue-400">{workOrder.linked_po.po_number}</span>
          </div>
        )}

        {workOrder.total_hours > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <span className="text-gray-600 dark:text-gray-400">Heures totales:</span>
            <span className="font-bold text-blue-700 dark:text-blue-400">{formatHours(workOrder.total_hours)}</span>
          </div>
        )}
      </div>

      {/* Description */}
      {workOrder.work_description && (
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-3">
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Description</h4>
          <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-line">{workOrder.work_description}</p>
        </div>
      )}

      {/* Entrées de temps */}
      {timeEntries.length > 0 && (
        <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="bg-blue-50 dark:bg-blue-900/20 px-3 py-2 border-b dark:border-gray-700">
            <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Temps ({timeEntries.length} session{timeEntries.length > 1 ? 's' : ''})
            </h4>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {timeEntries.map((entry, idx) => {
              const sc = entry.surcharge_type && entry.surcharge_type !== 'none' ? surchargeLabels[entry.surcharge_type] : null;
              return (
                <div key={idx} className="px-3 py-2.5 text-sm bg-white dark:bg-gray-800">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <span className="text-gray-900 dark:text-gray-100 font-medium">
                        {formatDate(entry.date)}
                      </span>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {entry.start_time} — {entry.end_time}
                        {entry.pause_minutes > 0 && (
                          <span className="ml-1.5 inline-flex items-center gap-0.5">
                            <Coffee className="w-3 h-3" />
                            -{entry.pause_minutes}min
                          </span>
                        )}
                      </div>
                      {entry.session_description && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 italic">
                          {entry.session_description}
                        </div>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <span className="font-bold text-blue-600 dark:text-blue-400">
                        {formatHours(entry.total_hours)}
                      </span>
                    </div>
                  </div>
                  {/* Badges */}
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {sc && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${sc.color}`}>
                        {sc.label}
                      </span>
                    )}
                    {entry.include_travel && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300">
                        Déplacement
                      </span>
                    )}
                    {entry.include_transport_fee && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 flex items-center gap-0.5">
                        <Truck className="w-2.5 h-2.5" />
                        Transport
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Total heures */}
          <div className="bg-blue-50 dark:bg-blue-900/20 px-3 py-2 border-t dark:border-gray-700 flex justify-between items-center">
            <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">Total heures</span>
            <span className="text-sm font-bold text-blue-700 dark:text-blue-300">{formatHours(workOrder.total_hours)}</span>
          </div>
        </div>
      )}

      {/* Matériaux */}
      {materials.length > 0 && (
        <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 border-b dark:border-gray-700">
            <h4 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5" />
              Matériaux ({materials.length})
            </h4>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {materials.map((mat, idx) => (
              <div key={idx} className="px-3 py-2 text-sm bg-white dark:bg-gray-800">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    {(mat.product_code || mat.product_id) && (
                      <span className="text-xs font-mono text-teal-600 dark:text-teal-400 mr-1.5">
                        [{mat.product_code || mat.product_id}]
                      </span>
                    )}
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {mat.description || mat.product?.description || 'Article'}
                    </span>
                  </div>
                  {mat.show_price && mat.unit_price > 0 && (
                    <span className="text-green-600 dark:text-green-400 font-medium ml-2 flex-shrink-0">
                      {formatCurrency((mat.quantity || 0) * (mat.unit_price || 0))}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {mat.quantity} {mat.unit || 'UN'}
                  {mat.show_price && mat.unit_price > 0 && (
                    <span> × {formatCurrency(mat.unit_price)}</span>
                  )}
                </div>
                {mat.notes && (
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 italic">
                    Note: {mat.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* Total matériaux */}
          {hasAnyPrice && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 border-t dark:border-gray-700 flex justify-between items-center">
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Total matériaux</span>
              <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{formatCurrency(totalMaterials)}</span>
            </div>
          )}
        </div>
      )}

      {/* Signature */}
      {workOrder.signature_data && (
        <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2 border-b dark:border-gray-700">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <PenTool className="w-3.5 h-3.5" />
              Signature
            </h4>
          </div>
          <div className="p-3 bg-white dark:bg-gray-800 text-center">
            <img
              src={workOrder.signature_data}
              alt="Signature client"
              className="max-h-20 mx-auto border dark:border-gray-600 rounded bg-white"
            />
            {workOrder.client_signature_name && (
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 font-medium">{workOrder.client_signature_name}</p>
            )}
            {workOrder.signature_timestamp && (
              <p className="text-xs text-gray-400 dark:text-gray-500">{formatDateTime(workOrder.signature_timestamp)}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
