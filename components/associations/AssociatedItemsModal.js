/**
 * @file components/associations/AssociatedItemsModal.js
 * @description Fenêtre « Items associés » ouverte par le carré « As » (BT/BL/Soumission/AF).
 *              Enveloppe ProductAssociationsPanel en mode sélection: l'utilisateur coche
 *              les associés voulus (décochés par défaut), ajuste les quantités et confirme.
 *              - Rendue via portail dans <body> + z-index élevé (au-dessus des modales
 *                de formulaire existantes)
 *              - Fermeture: bouton X, fond, ou après l'ajout
 *              - Touch targets 44 px
 * @version 1.0.0
 * @date 2026-09-10
 * @changelog
 *   1.0.0 - Version initiale (Items associés MVP)
 */

'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import ProductAssociationsPanel from './ProductAssociationsPanel';

/**
 * Props:
 *  - open, onClose()
 *  - parentCode, parentDescription, parentQuantity
 *  - onAddItems(entries) → appelé puis la fenêtre se ferme
 *  - existingCodes: codes déjà dans le document
 *  - manage: autoriser la création/suppression de liens (défaut true)
 */
export default function AssociatedItemsModal({
  open,
  onClose,
  parentCode,
  parentDescription,
  parentQuantity = 1,
  onAddItems,
  existingCodes = [],
  manage = true,
}) {
  // Portail vers <body>: évite qu'un conteneur parent (overflow/transform des modales
  // de formulaire) ne rogne la fenêtre. Les événements React remontent quand même
  // l'arbre des composants → stopPropagation ci-dessous protège les lignes cliquables.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { e.stopPropagation(); onClose?.(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Items associés"
    >
      <div
        className="bg-white dark:bg-gray-900 w-full sm:max-w-lg max-h-[92vh] sm:max-h-[85vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-purple-600 text-white text-[11px] font-bold">
              As
            </span>
            Items associés
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
            style={{ minWidth: '44px', minHeight: '44px' }}
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <ProductAssociationsPanel
            parentCode={parentCode}
            parentDescription={parentDescription}
            parentQuantity={parentQuantity}
            selectable={typeof onAddItems === 'function'}
            onAddItems={(entries) => {
              onAddItems?.(entries);
              onClose?.();
            }}
            existingCodes={existingCodes}
            manage={manage}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
