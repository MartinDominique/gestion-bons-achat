/**
 * @file components/SplitView/PanelWorkOrder.js
 * @description Read-only panel to display Bon de Travail (BT) details
 *              inside the split view panel.
 *              - Fetches BT by ID or bt_number
 *              - Shows work date, client, description, time entries, materials
 * @version 1.0.0
 * @date 2026-02-27
 * @changelog
 *   1.0.0 - Version initiale (Phase E — Numéros cliquables)
 */

'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useSplitView } from './SplitViewContext';
import { Clock, Calendar, DollarSign, User, FileText, Package, Wrench } from 'lucide-react';

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

export default function PanelWorkOrder({ data }) {
  const { closePanel } = useSplitView();
  const [workOrder, setWorkOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (data?.workOrderId) {
      loadWorkOrder(data.workOrderId);
    } else if (data?.btNumber) {
      loadWorkOrderByNumber(data.btNumber);
    } else if (data?.workOrder) {
      setWorkOrder(data.workOrder);
      setLoading(false);
    }
  }, [data]);

  const loadWorkOrder = async (id) => {
    try {
      setLoading(true);
      const { data: woData, error } = await supabase
        .from('work_orders')
        .select('*, client:clients(name, company, address)')
        .eq('id', id)
        .single();

      if (error) throw error;

      // Charger les matériaux
      const { data: materials } = await supabase
        .from('work_order_materials')
        .select('*')
        .eq('work_order_id', id);

      setWorkOrder({ ...woData, materials: materials || [] });
    } catch (err) {
      console.error('Erreur chargement BT:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadWorkOrderByNumber = async (btNumber) => {
    try {
      setLoading(true);
      const { data: woData, error } = await supabase
        .from('work_orders')
        .select('*, client:clients(name, company, address)')
        .eq('bt_number', btNumber)
        .single();

      if (error) throw error;

      // Charger les matériaux
      const { data: materials } = await supabase
        .from('work_order_materials')
        .select('*')
        .eq('work_order_id', woData.id);

      setWorkOrder({ ...woData, materials: materials || [] });
    } catch (err) {
      console.error('Erreur chargement BT:', err);
    } finally {
      setLoading(false);
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
    draft: 'bg-gray-100 text-gray-800',
    signed: 'bg-blue-100 text-blue-800',
    pending_send: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-green-100 text-green-800',
    sent: 'bg-green-100 text-green-800'
  }[workOrder.status] || 'bg-gray-100 text-gray-800';

  const timeEntries = workOrder.time_entries || [];
  const materials = workOrder.materials || [];

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
      </div>

      {/* Détails */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="w-4 h-4 text-teal-500" />
          <span className="text-gray-600 dark:text-gray-400">Date:</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">{formatDate(workOrder.work_date)}</span>
        </div>

        {workOrder.total_hours > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-blue-500" />
            <span className="text-gray-600 dark:text-gray-400">Heures totales:</span>
            <span className="font-bold text-blue-700 dark:text-blue-400">{formatHours(workOrder.total_hours)}</span>
          </div>
        )}

        {workOrder.is_prix_jobe && (
          <div className="flex items-center gap-2 text-sm">
            <DollarSign className="w-4 h-4 text-purple-500" />
            <span className="font-medium text-purple-700 dark:text-purple-400">Prix Jobe (forfaitaire)</span>
          </div>
        )}

        {workOrder.work_description && (
          <div className="text-sm">
            <span className="text-gray-600 dark:text-gray-400 font-medium">Description:</span>
            <p className="text-gray-900 dark:text-gray-100 mt-1 whitespace-pre-line">{workOrder.work_description}</p>
          </div>
        )}
      </div>

      {/* Entrées de temps */}
      {timeEntries.length > 0 && (
        <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2 border-b dark:border-gray-700">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Temps ({timeEntries.length} entrée{timeEntries.length > 1 ? 's' : ''})
            </h4>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-48 overflow-y-auto">
            {timeEntries.map((entry, idx) => (
              <div key={idx} className="px-3 py-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-900 dark:text-gray-100">
                    {formatDate(entry.date)}
                  </span>
                  <span className="font-medium text-blue-600 dark:text-blue-400">
                    {formatHours(entry.total_hours)}
                  </span>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {entry.start_time} - {entry.end_time}
                  {entry.surcharge_type && entry.surcharge_type !== 'none' && (
                    <span className="ml-2 text-orange-600 dark:text-orange-400 font-medium">
                      ({entry.surcharge_type === 'evening' ? 'Soir' :
                        entry.surcharge_type === 'saturday' ? 'Samedi' :
                        entry.surcharge_type === 'sunday' ? 'Dimanche' :
                        entry.surcharge_type === 'holiday' ? 'Férié' : entry.surcharge_type})
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
