/**
 * @file components/SplitView/SplitViewContext.js
 * @description Context provider for the split-view panel system.
 *              - Manages state for the right-side panel
 *              - Provides open/close/replace panel functions
 *              - Tracks panel content type and data
 * @version 1.0.0
 * @date 2026-02-14
 * @changelog
 *   1.0.0 - Version initiale - Split view context et provider
 */

'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

const SplitViewContext = createContext(null);

/**
 * Panel content types:
 * - 'purchase-order' : BA (Bon d'Achat Client) - PurchaseOrderModal in panel mode
 * - 'supplier-purchase' : AF (Achat Fournisseur) - SupplierPurchaseManager in panel mode
 * - 'soumission' : Soumission - SoumissionsManager in panel mode
 */

export function SplitViewProvider({ children }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelContent, setPanelContent] = useState(null); // { type, data, props }
  const [onPanelEvent, setOnPanelEvent] = useState(null); // callback for events from panel

  const openPanel = useCallback((type, data = {}, props = {}) => {
    setPanelContent({ type, data, props });
    setPanelOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setPanelContent(null);
    setOnPanelEvent(null);
  }, []);

  const replacePanel = useCallback((type, data = {}, props = {}) => {
    setPanelContent({ type, data, props });
    if (!panelOpen) setPanelOpen(true);
  }, [panelOpen]);

  // Register a callback that the main page can listen to for panel events
  // e.g., when a BA is created in the panel, the AF form can react
  const registerPanelEventHandler = useCallback((handler) => {
    setOnPanelEvent(() => handler);
  }, []);

  const emitPanelEvent = useCallback((eventName, eventData) => {
    if (onPanelEvent) {
      onPanelEvent(eventName, eventData);
    }
  }, [onPanelEvent]);

  const value = {
    panelOpen,
    panelContent,
    openPanel,
    closePanel,
    replacePanel,
    registerPanelEventHandler,
    emitPanelEvent
  };

  return (
    <SplitViewContext.Provider value={value}>
      {children}
    </SplitViewContext.Provider>
  );
}

export function useSplitView() {
  const context = useContext(SplitViewContext);
  if (!context) {
    throw new Error('useSplitView must be used within a SplitViewProvider');
  }
  return context;
}

export default SplitViewContext;
