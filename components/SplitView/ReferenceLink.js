/**
 * @file components/SplitView/ReferenceLink.js
 * @description Clickable reference link component that opens documents
 *              in the split view panel instead of navigating away.
 *              - Used for BA, AF, and Soumission references
 *              - Renders as a styled clickable badge
 * @version 1.0.0
 * @date 2026-02-14
 * @changelog
 *   1.0.0 - Version initiale
 */

'use client';

import React from 'react';
import { useSplitView } from './SplitViewContext';

/**
 * ReferenceLink - A clickable reference badge that opens a document in the split panel.
 *
 * @param {string} type - 'purchase-order' | 'supplier-purchase' | 'soumission'
 * @param {string} label - The display text (e.g., "BA-2601-001", "AF-2602-003")
 * @param {object} data - Data to pass to the panel content component
 * @param {string} [variant] - Color variant: 'blue' (BA), 'orange' (AF), 'purple' (Soumission)
 * @param {string} [className] - Additional CSS classes
 */
export default function ReferenceLink({ type, label, data, variant = 'blue', className = '', onClick: externalOnClick }) {
  const { openPanel } = useSplitView();

  const variantStyles = {
    blue: 'bg-blue-100 text-blue-700 hover:bg-blue-200 hover:text-blue-900',
    orange: 'bg-orange-100 text-orange-700 hover:bg-orange-200 hover:text-orange-900',
    purple: 'bg-purple-100 text-purple-700 hover:bg-purple-200 hover:text-purple-900',
    green: 'bg-green-100 text-green-700 hover:bg-green-200 hover:text-green-900'
  };

  const handleClick = (e) => {
    e.stopPropagation();
    e.preventDefault();

    if (externalOnClick) {
      externalOnClick(e);
    }

    openPanel(type, data);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium cursor-pointer transition-colors duration-150 underline-offset-2 hover:underline ${variantStyles[variant] || variantStyles.blue} ${className}`}
      title={`Ouvrir ${label} dans le panneau latéral`}
    >
      {label}
    </button>
  );
}
