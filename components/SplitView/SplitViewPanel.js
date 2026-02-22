/**
 * @file components/SplitView/SplitViewPanel.js
 * @description Right-side split view panel component.
 *              - Renders content in a sliding panel on the right
 *              - Supports BA, AF, and Soumission content types
 *              - Independent scrolling from the main content
 *              - Close button to dismiss the panel
 * @version 1.0.0
 * @date 2026-02-14
 * @changelog
 *   1.0.0 - Version initiale - Panneau latéral split view
 */

'use client';

import React from 'react';
import { X } from 'lucide-react';
import { useSplitView } from './SplitViewContext';
import PanelPurchaseOrder from './PanelPurchaseOrder';
import PanelSupplierPurchase from './PanelSupplierPurchase';
import PanelSoumission from './PanelSoumission';

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
