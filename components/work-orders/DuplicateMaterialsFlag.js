/**
 * @file components/work-orders/DuplicateMaterialsFlag.js
 * @description Avis « produit en double » au haut de la section matériaux (BT + BL)
 *              - Bandeau rose (fuchsia) listant les produits présents sur plus d'une ligne
 *                (code, nombre de lignes, quantité totale)
 *              - DuplicateLineBadge: pastille « ×n » pour marquer chaque ligne concernée
 *              - Signalement seulement: aucune fusion, aucun blocage. Rien si aucun doublon.
 * @version 1.0.0
 * @date 2026-11-19
 * @changelog
 *   1.0.0 - Version initiale
 */
import React from 'react';
import { Copy } from 'lucide-react';
import { findDuplicateMaterials } from '../../lib/utils/duplicateMaterials';

// Classes de la ligne en double (fond + barre à gauche), partagées BT/BL.
export const DUPLICATE_ROW_CLASS =
  'bg-fuchsia-50 dark:bg-fuchsia-900/30 border-l-4 border-l-fuchsia-500';

const formatQty = (n) =>
  new Intl.NumberFormat('fr-CA', { maximumFractionDigits: 2 }).format(n || 0);

export function DuplicateLineBadge({ count }) {
  if (!count || count < 2) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 bg-fuchsia-600 text-white px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap"
      title={`Ce produit est sur ${count} lignes`}
    >
      <Copy size={10} />×{count}
    </span>
  );
}

export default function DuplicateMaterialsFlag({ materials, className = '' }) {
  const duplicates = findDuplicateMaterials(materials);
  if (duplicates.length === 0) return null;

  return (
    <div
      role="alert"
      className={`border-2 border-fuchsia-500 bg-fuchsia-50 dark:bg-fuchsia-900/30 rounded-lg p-3 ${className}`}
    >
      <p className="flex items-center gap-2 text-sm font-bold text-fuchsia-800 dark:text-fuchsia-200">
        <Copy size={18} className="flex-shrink-0" />
        {duplicates.length === 1
          ? '1 produit est sur plus d’une ligne'
          : `${duplicates.length} produits sont sur plus d’une ligne`}
      </p>
      <div className="flex flex-wrap gap-2 mt-2">
        {duplicates.map((d) => (
          <span
            key={d.code}
            className="inline-flex items-center gap-1 bg-white dark:bg-gray-900 border border-fuchsia-400 dark:border-fuchsia-600 text-fuchsia-900 dark:text-fuchsia-100 px-2 py-1 rounded text-xs"
          >
            <span className="font-mono font-bold">{d.code}</span>
            <span>
              — {d.count} lignes, qté totale {formatQty(d.totalQuantity)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
