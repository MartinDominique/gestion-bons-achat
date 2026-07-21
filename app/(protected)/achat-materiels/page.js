/**
 * @file app/(protected)/achat-materiels/page.js
 * @description Module Achats Fournisseurs — 2 onglets:
 *              - « Achats Fournisseurs » (AF): SupplierPurchaseManager
 *              - « À Commander »: liste de réapprovisionnement (OrderListManager)
 *              La bascule vers l'onglet AF remonte SupplierPurchaseManager, dont le
 *              hook lit sessionStorage 'af-prefill' au montage pour pré-remplir l'AF.
 * @version 2.0.0
 * @date 2026-07-21
 * @changelog
 *   2.0.0 - Ajout onglet « À Commander » (liste de réapprovisionnement)
 *   1.0.0 - Version initiale (SupplierPurchaseManager seul)
 */

'use client';

import React, { useState, useEffect } from 'react';
import { ShoppingCart, ClipboardList } from 'lucide-react';
import SupplierPurchaseManager from '../../../components/SupplierPurchaseManager';
import OrderListManager from '../../../components/order-list/OrderListManager';

export default function AchatMaterielsPage() {
  const [tab, setTab] = useState('af'); // 'af' | 'order'
  const [pendingCount, setPendingCount] = useState(0);

  // Compteur d'items à commander (pour la pastille de l'onglet)
  const refreshCount = async () => {
    try {
      const res = await fetch('/api/items-to-order?status=pending');
      const json = await res.json();
      if (json.success) setPendingCount((json.data || []).length);
    } catch (e) {
      /* silencieux */
    }
  };

  useEffect(() => {
    refreshCount();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4">
      {/* Bascule d'onglets */}
      <div className="flex items-center gap-2 mb-4 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setTab('af')}
          style={{ minHeight: '44px' }}
          className={`inline-flex items-center gap-2 px-4 py-2.5 -mb-px text-sm font-medium border-b-2 transition-colors ${
            tab === 'af'
              ? 'border-blue-600 text-blue-700 dark:text-blue-300'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
        >
          <ShoppingCart className="w-5 h-5" />
          Achats Fournisseurs
        </button>
        <button
          onClick={() => setTab('order')}
          style={{ minHeight: '44px' }}
          className={`relative inline-flex items-center gap-2 px-4 py-2.5 -mb-px text-sm font-medium border-b-2 transition-colors ${
            tab === 'order'
              ? 'border-orange-600 text-orange-700 dark:text-orange-300'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
        >
          <ClipboardList className="w-5 h-5" />
          À Commander
          {pendingCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold bg-orange-600 text-white">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* Contenu — rendu conditionnel: bascule vers 'af' remonte le manager (prefill) */}
      {tab === 'af' ? (
        <SupplierPurchaseManager />
      ) : (
        <OrderListManager
          onCreateAF={() => {
            setTab('af');
            // Le compteur sera rafraîchi au retour sur l'onglet À Commander
          }}
          onCountChange={setPendingCount}
        />
      )}
    </div>
  );
}
