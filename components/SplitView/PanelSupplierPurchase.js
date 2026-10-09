/**
 * @file components/SplitView/PanelSupplierPurchase.js
 * @description Wrapper to render AF (Achat Fournisseur) details inside the split view panel.
 *              - Shows AF details in read/edit mode
 * @version 1.0.1
 * @date 2026-10-09
 * @changelog
 *   1.0.1 - Mode sombre: badges de statut AF, libellés BA lié/Livraison/Montant/Créé le, en-tête et lignes de la liste d'articles, encadré Notes
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
    draft: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200',
    in_order: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200',
    ordered: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200',
    partial: 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200',
    received: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200',
    cancelled: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200'
  }[purchase.status] || 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200';

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
            <span className="text-gray-600 dark:text-gray-400">BA lié:</span>
            <span className="font-medium text-blue-700">{purchase.linked_po_number}</span>
          </div>
        )}

        {purchase.ba_acomba && (
          <div className="flex items-center gap-2 text-sm">
            <Package className="w-4 h-4 text-purple-500" />
            <span className="text-gray-600 dark:text-gray-400">BA Acomba:</span>
            <span className="font-medium text-purple-700">{purchase.ba_acomba}</span>
          </div>
        )}

        {purchase.delivery_date && (
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-indigo-500" />
            <span className="text-gray-600 dark:text-gray-400">Livraison prévue:</span>
            <span className="font-medium">{formatDate(purchase.delivery_date)}</span>
          </div>
        )}

        <div className="flex items-center gap-2 text-sm">
          <DollarSign className="w-4 h-4 text-green-500" />
          <span className="text-gray-600 dark:text-gray-400">Montant total:</span>
          <span className="font-bold text-green-700">{formatCurrency(purchase.total_amount)}</span>
        </div>

        {purchase.created_at && (
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-gray-600 dark:text-gray-400">Créé le:</span>
            <span className="font-medium">{formatDate(purchase.created_at)}</span>
          </div>
        )}
      </div>

      {/* Items */}
      {purchase.items && purchase.items.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2 border-b">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Articles ({purchase.items.length})
            </h4>
          </div>
          <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {purchase.items.map((item, idx) => (
              <div key={idx} className="px-3 py-2 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium text-gray-900 dark:text-gray-100 truncate flex-1">
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
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-3">
          <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-1">Notes</h4>
          <p className="text-sm text-yellow-700">{purchase.notes}</p>
        </div>
      )}
    </div>
  );
}
