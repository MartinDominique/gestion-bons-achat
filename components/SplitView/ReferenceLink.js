/**
 * @file components/SplitView/ReferenceLink.js
 * @description Clickable reference link component that opens documents
 *              in the split view panel instead of navigating away.
 *              - Used for BA, AF, and Soumission references
 *              - Renders as a styled clickable badge
 * @version 1.0.1
 * @date 2026-10-09
 * @changelog
 *   1.0.1 - Mode sombre: 4 variantes de couleur du lien de référence
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
    blue: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/60 hover:text-blue-900 dark:hover:text-blue-100',
    orange: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-900/60 hover:text-orange-900 dark:hover:text-orange-100',
    purple: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/60 hover:text-purple-900 dark:hover:text-purple-100',
    green: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/60 hover:text-green-900 dark:hover:text-green-100'
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
