/**
 * @file components/SplitView/SplitViewPanel.js
 * @description Right-side split view panel component.
 *              - Renders content in a sliding panel on the right
 *              - Supports BA, AF, Soumission, BT, and BL content types
 *              - Independent scrolling from the main content
 *              - Close button to dismiss the panel
 * @version 1.2.0
 * @date 2026-03-24
 * @changelog
 *   1.2.0 - Ajout panneau soumissions-list (liste avec statut inline)
 *   1.1.0 - Ajout panneaux BT (work-order) et BL (delivery-note) (Phase E)
 *   1.0.0 - Version initiale - Panneau latéral split view
 */

'use client';

import React from 'react';
import { X } from 'lucide-react';
import { useSplitView } from './SplitViewContext';
import PanelPurchaseOrder from './PanelPurchaseOrder';
import PanelSupplierPurchase from './PanelSupplierPurchase';
import PanelSoumission from './PanelSoumission';
import PanelWorkOrder from './PanelWorkOrder';
import PanelDeliveryNote from './PanelDeliveryNote';
import PanelSoumissionsList from './PanelSoumissionsList';

export default function SplitViewPanel() {
  const { panelOpen, panelContent, closePanel } = useSplitView();

  if (!panelOpen || !panelContent) return null;

  const renderContent = () => {
    switch (panelContent.type) {
      case 'purchase-order':
        return (
          <PanelPurchaseOrder
            data={panelContent.data}
            {...panelContent.props}
          />
        );
      case 'supplier-purchase':
        return (
          <PanelSupplierPurchase
            data={panelContent.data}
            {...panelContent.props}
          />
        );
      case 'soumission':
        return (
          <PanelSoumission
            data={panelContent.data}
            {...panelContent.props}
          />
        );
      case 'work-order':
        return (
          <PanelWorkOrder
            data={panelContent.data}
            {...panelContent.props}
          />
        );
      case 'delivery-note':
        return (
          <PanelDeliveryNote
            data={panelContent.data}
            {...panelContent.props}
          />
        );
      case 'soumissions-list':
        return (
          <PanelSoumissionsList
            data={panelContent.data}
            {...panelContent.props}
          />
        );
      default:
        return (
          <div className="p-6 text-center text-gray-500">
            Type de contenu non reconnu: {panelContent.type}
          </div>
        );
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-lg">
      {/* Panel header with close button */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
          {panelContent.type === 'purchase-order' && 'Bon d\'Achat Client'}
          {panelContent.type === 'supplier-purchase' && 'Achat Fournisseur'}
          {panelContent.type === 'soumission' && 'Soumission'}
          {panelContent.type === 'work-order' && 'Bon de Travail'}
          {panelContent.type === 'delivery-note' && 'Bon de Livraison'}
          {panelContent.type === 'soumissions-list' && 'Soumissions'}
        </span>
        <button
          onClick={closePanel}
          className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          title="Fermer le panneau"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Panel content with independent scroll */}
      <div className="flex-1 overflow-y-auto">
        {renderContent()}
      </div>
    </div>
  );
}
