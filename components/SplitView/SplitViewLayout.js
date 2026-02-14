/**
 * @file components/SplitView/SplitViewLayout.js
 * @description Layout wrapper that manages the split between main content
 *              and the right-side panel.
 *              - When panel is closed: main content takes full width (centered)
 *              - When panel is open: main ~55% left, panel ~45% right
 *              - Both sides scroll independently
 *              - Desktop only (hidden on tablet/mobile)
 * @version 1.0.0
 * @date 2026-02-14
 * @changelog
 *   1.0.0 - Version initiale
 */

'use client';

import React from 'react';
import { useSplitView } from './SplitViewContext';
import SplitViewPanel from './SplitViewPanel';

export default function SplitViewLayout({ children }) {
  const { panelOpen } = useSplitView();

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* Main content area */}
      <div
        className={`transition-all duration-300 ease-in-out overflow-y-auto ${
          panelOpen
            ? 'w-[55%] min-w-0'
            : 'w-full'
        }`}
      >
        <div className={`${panelOpen ? 'max-w-none mx-4' : 'max-w-6xl mx-auto'} p-6 bg-white rounded-lg shadow`}>
          {children}
        </div>
      </div>

      {/* Split view panel (right side) */}
      {panelOpen && (
        <div className="w-[45%] min-w-0 overflow-hidden transition-all duration-300 ease-in-out hidden lg:block">
          <SplitViewPanel />
        </div>
      )}
    </div>
  );
}
