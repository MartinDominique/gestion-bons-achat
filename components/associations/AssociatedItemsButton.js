/**
 * @file components/associations/AssociatedItemsButton.js
 * @description Le petit carré « As » (items associés) affiché sur une ligne de produit
 *              (BT/BL via MaterialSelector, Soumission, AF, Inventaire).
 *              - Violet plein + compteur quand le produit a des associés; contour violet
 *                (showParentLinks) s'il est seulement suggéré par d'autres; contour gris
 *                pointillé sinon (permet de créer un premier lien depuis le module).
 *              - Sans tap: rien ne change. Un tap ouvre AssociatedItemsModal (sélection
 *                + gestion) ou exécute onClick si fourni (ex. Inventaire → onglet Associés).
 *              - Compteur chargé en lot via lib/utils/associationsCache (1 requête/écran).
 *              - stopPropagation intégré (les lignes parentes sont cliquables); 44 px.
 * @version 1.0.0
 * @date 2026-09-10
 * @changelog
 *   1.0.0 - Version initiale (Items associés MVP)
 */

'use client';

import React, { useState } from 'react';
import { useAssociationCount, normalizeCode } from '../../lib/utils/associationsCache';
import AssociatedItemsModal from './AssociatedItemsModal';

/**
 * Props:
 *  - code: code produit (parent)
 *  - description: description du parent (affichée dans la fenêtre)
 *  - parentQuantity: quantité du parent dans le document (défaut 1)
 *  - onAddItems(entries): ajout des associés cochés → [{ product, quantity, link }]
 *  - existingCodes: codes déjà dans le document
 *  - onClick: remplace l'ouverture de la fenêtre (ex. Inventaire)
 *  - hideWhenEmpty: masque le carré si aucun associé (défaut false)
 *  - showParentLinks: contour violet (sans compteur) si le produit est suggéré par d'autres
 *    (utile dans l'Inventaire pour repérer les deux sens du lien)
 *  - manage: autoriser la gestion des liens dans la fenêtre (défaut true)
 *  - className
 */
export default function AssociatedItemsButton({
  code,
  description = '',
  parentQuantity = 1,
  onAddItems,
  existingCodes = [],
  onClick,
  hideWhenEmpty = false,
  showParentLinks = false,
  manage = true,
  className = '',
}) {
  const normalized = normalizeCode(code);
  const info = useAssociationCount(normalized);
  const [open, setOpen] = useState(false);

  if (!normalized) return null;
  const count = info?.children || 0;
  const parents = info?.parents || 0;
  const has = count > 0;
  const linked = showParentLinks && parents > 0; // n'a pas d'associés mais est suggéré par d'autres
  if (hideWhenEmpty && !has && !linked) return null;

  const handleClick = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (onClick) {
      onClick(e);
      return;
    }
    setOpen(true);
  };

  const title = has
    ? `${count} item${count > 1 ? 's' : ''} associé${count > 1 ? 's' : ''} — appuyer pour choisir`
    : linked
    ? `Suggéré par ${parents} produit${parents > 1 ? 's' : ''} — appuyer pour voir`
    : 'Aucun item associé — appuyer pour en associer';

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title={title}
        aria-label={title}
        className={`relative inline-flex items-center justify-center rounded-lg transition-colors ${
          has ? 'hover:bg-purple-50 dark:hover:bg-purple-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
        } ${className}`}
        style={{ minWidth: '44px', minHeight: '44px' }}
      >
        <span
          className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-[11px] font-bold leading-none select-none ${
            has
              ? 'bg-purple-600 text-white border border-purple-600'
              : linked
              ? 'border border-purple-400 dark:border-purple-500 text-purple-600 dark:text-purple-300'
              : 'border border-dashed border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500'
          }`}
        >
          As
        </span>
        {has && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 text-[9px] font-bold flex items-center justify-center border border-white dark:border-gray-900">
            {count}
          </span>
        )}
      </button>

      {open && !onClick && (
        <AssociatedItemsModal
          open={open}
          onClose={() => setOpen(false)}
          parentCode={normalized}
          parentDescription={description}
          parentQuantity={parentQuantity}
          onAddItems={onAddItems}
          existingCodes={existingCodes}
          manage={manage}
        />
      )}
    </>
  );
}
