/**
 * @file components/order-list/AddToOrderButton.js
 * @description Bouton réutilisable « + À commander » ajoutant un produit à la liste
 *              de réapprovisionnement (table items_to_order). Utilisé dans le
 *              MaterialSelector (BT + BL), les Soumissions et l'Inventaire.
 *              - Tap direct: envoie code + description + unité + quantité + source.
 *                Le serveur enrichit fournisseur suggéré + coûtant depuis products.
 *              - Feedback visuel: état chargement → « Ajouté ✓ » transitoire.
 *              - stopPropagation intégré (les lignes parentes sont cliquables).
 *              - Touch target 44px (mobile/tablette).
 * @version 1.0.0
 * @date 2026-07-21
 * @changelog
 *   1.0.0 - Version initiale (Liste À Commander MVP)
 */

'use client';

import { useState, useCallback } from 'react';
import { ShoppingCart, Check, Loader2, AlertCircle } from 'lucide-react';

/**
 * Props:
 *  - item: {
 *      product_id, product_code, description, unit, quantity, cost_price, suggested_supplier
 *    }
 *  - source: { type, id, number, clientName }  (provenance de l'item)
 *  - variant: 'chip' (défaut) | 'icon' | 'full'
 *  - label: texte affiché (défaut « À commander »)
 *  - className: classes additionnelles
 *  - onAdded: callback(result) après ajout réussi
 */
export default function AddToOrderButton({
  item,
  source = {},
  variant = 'chip',
  label = 'À commander',
  className = '',
  onAdded,
}) {
  const [status, setStatus] = useState('idle'); // idle | loading | done | error

  const handleClick = useCallback(
    async (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (status === 'loading') return;

      setStatus('loading');
      try {
        const payload = {
          product_id: item?.product_id ?? null,
          product_code: item?.product_code ?? null,
          description: item?.description ?? null,
          unit: item?.unit ?? null,
          quantity: item?.quantity ?? 1,
          cost_price: item?.cost_price ?? null,
          suggested_supplier: item?.suggested_supplier ?? null,
          source_type: source?.type ?? 'manual',
          source_id: source?.id ?? null,
          source_number: source?.number ?? null,
          client_name: source?.clientName ?? null,
        };

        const res = await fetch('/api/items-to-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();

        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Erreur');
        }

        setStatus('done');
        onAdded?.(json);
        // Retour à l'état initial après feedback
        setTimeout(() => setStatus('idle'), 1800);
      } catch (err) {
        console.error('Erreur ajout à commander:', err);
        setStatus('error');
        setTimeout(() => setStatus('idle'), 2500);
      }
    },
    [item, source, status, onAdded]
  );

  // --- Contenu selon l'état ---
  const iconSize = variant === 'icon' ? 20 : 16;
  let icon;
  if (status === 'loading') icon = <Loader2 className="animate-spin" size={iconSize} />;
  else if (status === 'done') icon = <Check size={iconSize} />;
  else if (status === 'error') icon = <AlertCircle size={iconSize} />;
  else icon = <ShoppingCart size={iconSize} />;

  let text = label;
  if (status === 'done') text = 'Ajouté';
  else if (status === 'error') text = 'Erreur';

  // --- Styles selon l'état ---
  const stateColor =
    status === 'done'
      ? 'bg-green-600 hover:bg-green-700 text-white'
      : status === 'error'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : 'bg-orange-600 hover:bg-orange-700 text-white';

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={status === 'loading'}
        title="Ajouter à la liste À commander"
        aria-label="Ajouter à la liste À commander"
        style={{ minHeight: '44px', minWidth: '44px' }}
        className={`inline-flex items-center justify-center rounded-lg transition-colors disabled:opacity-60 ${
          status === 'done'
            ? 'text-green-600 dark:text-green-400'
            : status === 'error'
            ? 'text-red-600 dark:text-red-400'
            : 'text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/30'
        } ${className}`}
      >
        {icon}
      </button>
    );
  }

  if (variant === 'full') {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={status === 'loading'}
        style={{ minHeight: '44px' }}
        className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold transition-colors disabled:opacity-60 ${stateColor} ${className}`}
      >
        {icon}
        {text}
      </button>
    );
  }

  // variant 'chip' (défaut)
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === 'loading'}
      style={{ minHeight: '44px' }}
      className={`inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 ${stateColor} ${className}`}
    >
      {icon}
      <span className="whitespace-nowrap">{text}</span>
    </button>
  );
}
