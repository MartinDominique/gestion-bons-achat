/**
 * @file components/SplitView/PanelSupplierPurchase.js
 * @description Wrapper to render AF (Achat Fournisseur) details inside the split view panel.
 *              - Shows AF details in read/edit mode
 * @version 1.0.0
 * @date 2026-02-14
 * @changelog
 *   1.0.0 - Version initiale
 */

'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useSplitView } from './SplitViewContext';
import { formatCurrency, formatDate, PURCHASE_STATUSES } from '../SupplierPurchaseServices';
import { Package, Calendar, DollarSign, Building2, Truck, FileText } from 'lucide-react';

export default function PanelSupplierPurchase({ data }) {
  const { closePanel } = useSplitView();
  const [purchase, setPurchase] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (data?.purchaseId) {
      loadPurchase(data.purchaseId);
    } else if (data?.purchase) {
      setPurchase(data.purchase);
      setLoading(false);
    }
  }, [data]);

  const loadPurchase = async (purchaseId) => {
    try {
      setLoading(true);
      const { data: purchaseData, error } = await supabase
        .from('supplier_purchases')
        .select('*')
        .eq('id', purchaseId)
        .single();

      if (error) throw error;
      setPurchase(purchaseData);
    } catch (err) {
      console.error('Erreur chargement AF:', err);
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

  if (!purchase) {
    return (
      <div className="p-6 text-center text-gray-500">
        Achat fournisseur non trouvé
      </div>
    );
  }

  const statusLabel = PURCHASE_STATUSES[purchase.status] || purchase.status;
  const statusColor = {
    draft: 'bg-gray-100 text-gray-800',
    in_order: 'bg-yellow-100 text-yellow-800',
    ordered: 'bg-blue-100 text-blue-800',
    partial: 'bg-orange-100 text-orange-800',
    received: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800'
  }[purchase.status] || 'bg-gray-100 text-gray-800';

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-lg p-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">{purchase.purchase_number}</h3>
            <p className="text-orange-100 text-sm">{purchase.supplier_name}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-3">
        {purchase.linked_po_number && (
          <div className="flex items-center gap-2 text-sm">
            <FileText className="w-4 h-4 text-blue-500" />
            <span className="text-gray-600">BA lié:</span>
            <span className="font-medium text-blue-700">{purchase.linked_po_number}</span>
          </div>
        )}

        {purchase.ba_acomba && (
          <div className="flex items-center gap-2 text-sm">
            <Package className="w-4 h-4 text-purple-500" />
            <span className="text-gray-600">BA Acomba:</span>
            <span className="font-medium text-purple-700">{purchase.ba_acomba}</span>
          </div>
        )}

        {purchase.delivery_date && (
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-indigo-500" />
            <span className="text-gray-600">Livraison prévue:</span>
            <span className="font-medium">{formatDate(purchase.delivery_date)}</span>
          </div>
        )}

        <div className="flex items-center gap-2 text-sm">
          <DollarSign className="w-4 h-4 text-green-500" />
          <span className="text-gray-600">Montant total:</span>
          <span className="font-bold text-green-700">{formatCurrency(purchase.total_amount)}</span>
        </div>

        {purchase.created_at && (
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-gray-600">Créé le:</span>
            <span className="font-medium">{formatDate(purchase.created_at)}</span>
          </div>
        )}
      </div>

      {/* Items */}
      {purchase.items && purchase.items.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-3 py-2 border-b">
            <h4 className="text-sm font-semibold text-gray-700">
              Articles ({purchase.items.length})
            </h4>
          </div>
          <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {purchase.items.map((item, idx) => (
              <div key={idx} className="px-3 py-2 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium text-gray-900 truncate flex-1">
                    {item.description || item.product_id}
                  </span>
                  <span className="text-green-600 font-medium ml-2 flex-shrink-0">
                    {formatCurrency((item.quantity || 0) * (item.cost_price || item.unit_price || 0))}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {item.quantity} {item.unit || 'UN'} x {formatCurrency(item.cost_price || item.unit_price || 0)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {purchase.notes && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <h4 className="text-sm font-semibold text-yellow-800 mb-1">Notes</h4>
          <p className="text-sm text-yellow-700">{purchase.notes}</p>
        </div>
      )}
    </div>
  );
}
