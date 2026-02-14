/**
 * @file components/SplitView/PanelPurchaseOrder.js
 * @description Wrapper to render PurchaseOrderModal inside the split view panel.
 *              - Renders BA form in inline mode (not as a modal overlay)
 *              - Supports create and edit modes
 *              - Emits events when BA is created/updated
 * @version 1.0.0
 * @date 2026-02-14
 * @changelog
 *   1.0.0 - Version initiale
 */

'use client';

import React from 'react';
import PurchaseOrderModal from '../PurchaseOrderModal';
import { useSplitView } from './SplitViewContext';

export default function PanelPurchaseOrder({ data }) {
  const { closePanel, emitPanelEvent } = useSplitView();

  // data.editingPO - existing PO to edit (null for create)
  // data.prefill - prefill data for new BA (e.g., client info from AF)
  // data.keepOpenAfterCreate - if true, stay open after creation

  const handleClose = () => {
    closePanel();
  };

  const handleRefresh = () => {
    // Emit event so the main page can react (e.g., refresh BA dropdown)
    emitPanelEvent('ba-updated', {});
  };

  return (
    <div className="split-panel-content">
      <PurchaseOrderModal
        isOpen={true}
        onClose={handleClose}
        editingPO={data?.editingPO || null}
        onRefresh={handleRefresh}
        panelMode={true}
        prefillData={data?.prefill || null}
        keepOpenAfterCreate={data?.keepOpenAfterCreate || false}
      />
    </div>
  );
}
