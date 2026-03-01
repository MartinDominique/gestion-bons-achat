/**
 * @file components/SplitView/ClientSplitViewWrapper.js
 * @description Client-side wrapper that provides the SplitView context
 *              and layout to the app. Used in root layout since layout.js
 *              is a server component.
 * @version 1.1.0
 * @date 2026-03-01
 * @changelog
 *   1.1.0 - Fix layout responsive: panneau split view desktop uniquement (lg+)
 *   1.0.0 - Version initiale
 */

'use client';

import React from 'react';
import { SplitViewProvider, useSplitView } from './SplitViewContext';
import SplitViewPanel from './SplitViewPanel';

function SplitViewInner({ children }) {
  const { panelOpen } = useSplitView();

  return (
    <div className={`flex overflow-hidden ${panelOpen ? 'lg:h-[calc(100vh-80px)]' : ''}`}>
      {/* Main content area — ne rétrécit pas sur mobile/tablette */}
      <div
        className={`transition-all duration-300 ease-in-out ${
          panelOpen
            ? 'w-full lg:w-[55%] min-w-0 overflow-y-auto'
            : 'w-full'
        }`}
      >
        <main className={`${panelOpen ? 'max-w-6xl mx-auto lg:max-w-none lg:mx-4' : 'max-w-6xl mx-auto'} p-6 bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 transition-all duration-300`}>
          {children}
        </main>
      </div>

      {/* Split view panel (right side) - desktop uniquement (lg+) */}
      {panelOpen && (
        <div className="w-[45%] min-w-0 overflow-hidden transition-all duration-300 ease-in-out hidden lg:block">
          <SplitViewPanel />
        </div>
      )}
    </div>
  );
}

export default function ClientSplitViewWrapper({ children }) {
  return (
    <SplitViewProvider>
      <SplitViewInner>{children}</SplitViewInner>
    </SplitViewProvider>
  );
}
