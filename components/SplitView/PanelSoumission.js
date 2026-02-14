/**
 * @file components/SplitView/PanelSoumission.js
 * @description Wrapper to render Soumission details inside the split view panel.
 *              - Shows soumission details in read mode
 *              - Could be extended for edit mode
 * @version 1.0.0
 * @date 2026-02-14
 * @changelog
 *   1.0.0 - Version initiale
 */

'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useSplitView } from './SplitViewContext';
import { FileText, Calendar, DollarSign, User } from 'lucide-react';

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD'
  }).format(amount || 0);
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('fr-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

export default function PanelSoumission({ data }) {
  const { closePanel } = useSplitView();
  const [soumission, setSoumission] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (data?.soumissionId) {
      loadSoumission(data.soumissionId);
    } else if (data?.submissionNumber) {
      loadSoumissionByNumber(data.submissionNumber);
    } else if (data?.soumission) {
      setSoumission(data.soumission);
      setLoading(false);
    }
  }, [data]);

  const loadSoumission = async (soumissionId) => {
    try {
      setLoading(true);
      const { data: soumData, error } = await supabase
        .from('submissions')
        .select('*')
        .eq('id', soumissionId)
        .single();

      if (error) throw error;
      setSoumission(soumData);
    } catch (err) {
      console.error('Erreur chargement soumission:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSoumissionByNumber = async (number) => {
    try {
      setLoading(true);
      const { data: soumData, error } = await supabase
        .from('submissions')
        .select('*')
        .eq('submission_number', number)
        .single();

      if (error) throw error;
      setSoumission(soumData);
    } catch (err) {
      console.error('Erreur chargement soumission:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!soumission) {
    return (
      <div className="p-6 text-center text-gray-500">
        Soumission non trouvée
      </div>
    );
  }

  const statusLabel = {
    draft: 'Brouillon',
    sent: 'Envoyée',
    accepted: 'Acceptée',
    rejected: 'Refusée'
  }[soumission.status] || soumission.status;

  const statusColor = {
    draft: 'bg-gray-100 text-gray-800',
    sent: 'bg-blue-100 text-blue-800',
    accepted: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800'
  }[soumission.status] || 'bg-gray-100 text-gray-800';

  const items = soumission.items || [];

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg p-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">{soumission.submission_number}</h3>
            <p className="text-blue-100 text-sm">{soumission.client_name}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-3">
        {soumission.description && (
          <div className="text-sm">
            <span className="text-gray-600 font-medium">Description:</span>
            <p className="text-gray-900 mt-1">{soumission.description}</p>
          </div>
        )}

        <div className="flex items-center gap-2 text-sm">
          <DollarSign className="w-4 h-4 text-green-500" />
          <span className="text-gray-600">Montant:</span>
          <span className="font-bold text-green-700">{formatCurrency(soumission.amount)}</span>
        </div>

        {soumission.created_at && (
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-gray-600">Date:</span>
            <span className="font-medium">{formatDate(soumission.created_at)}</span>
          </div>
        )}
      </div>

      {/* Items */}
      {items.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-3 py-2 border-b">
            <h4 className="text-sm font-semibold text-gray-700">
              Articles ({items.length})
            </h4>
          </div>
          <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {items.map((item, idx) => (
              <div key={idx} className="px-3 py-2 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium text-gray-900 truncate flex-1">
                    {item.name || item.description || item.product_id}
                  </span>
                  <span className="text-green-600 font-medium ml-2 flex-shrink-0">
                    {formatCurrency((item.quantity || 0) * (item.price || item.selling_price || item.unit_price || 0))}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {item.quantity} {item.unit || 'UN'} x {formatCurrency(item.price || item.selling_price || item.unit_price || 0)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
