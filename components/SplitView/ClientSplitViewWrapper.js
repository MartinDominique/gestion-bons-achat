/**
 * @file components/SplitView/ClientSplitViewWrapper.js
 * @description Client-side wrapper that provides the SplitView context
 *              and layout to the app. Used in root layout since layout.js
 *              is a server component.
 *              - Desktop (≥1024px): 55/45 split side-by-side
 *              - Tablet/Mobile (<1024px): Overlay panel sliding from right
 * @version 2.0.0
 * @date 2026-03-01
 * @changelog
 *   2.0.0 - Overlay mode pour tablette/mobile, fix panneau invisible
 *   1.0.0 - Version initiale
 */

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { SplitViewProvider, useSplitView } from './SplitViewContext';
import SplitViewPanel from './SplitViewPanel';

function SplitViewInner({ children }) {
  const { panelOpen, closePanel } = useSplitView();
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const checkScreen = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    checkScreen();
    window.addEventListener('resize', checkScreen);
    return () => window.removeEventListener('resize', checkScreen);
  }, []);

  return (
    <>
      <div className={`flex ${panelOpen && isDesktop ? 'h-[calc(100vh-64px)]' : ''} overflow-hidden`}>
        {/* Main content area - ne rétrécit que sur desktop */}
        <div
          className={`transition-all duration-300 ease-in-out ${
            panelOpen && isDesktop
              ? 'w-[55%] min-w-0 overflow-y-auto'
              : 'w-full'
          }`}
        >
          <main className={`${panelOpen && isDesktop ? 'max-w-none mx-4' : 'max-w-6xl mx-auto'} p-6 bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 transition-all duration-300`}>
            {children}
          </main>
        </div>

        {/* Split view panel (right side) - desktop seulement */}
        {panelOpen && isDesktop && (
          <div className="w-[45%] min-w-0 overflow-hidden transition-all duration-300 ease-in-out">
            <SplitViewPanel />
          </div>
        )}
      </div>

      {/* Overlay panel - tablette et mobile */}
      {panelOpen && !isDesktop && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closePanel}
          />
          {/* Panel glissant depuis la droite */}
          <div className="absolute right-0 top-0 bottom-0 w-full sm:w-[85%] sm:max-w-lg shadow-2xl animate-slide-in-right">
            <SplitViewPanel />
          </div>
        </div>
      )}
    </>
  );
}

export default function ClientSplitViewWrapper({ children }) {
  return (
    <SplitViewProvider>
      <SplitViewInner>{children}</SplitViewInner>
    </SplitViewProvider>
  );
}
