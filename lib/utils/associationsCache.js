/**
 * @file lib/utils/associationsCache.js
 * @description Cache client des compteurs d'« items associés » par code produit,
 *              pour les carrés « As » affichés sur chaque ligne (BT/BL/Soum./AF/Inventaire).
 *              - Regroupe les demandes de plusieurs lignes en UNE requête
 *                (/api/product-associations?mode=counts&codes=A,B,C) grâce à un
 *                micro-délai de 30 ms (batching).
 *              - Abonnement par code: un carré se met à jour dès qu'un lien est créé
 *                ou supprimé (setCount / invalidateCount).
 *              - Hook useAssociationCount(code) → undefined (inconnu) | { children, parents }.
 * @version 1.0.0
 * @date 2026-09-10
 * @changelog
 *   1.0.0 - Version initiale (Items associés MVP)
 */

'use client';

import { useEffect, useState } from 'react';

const counts = new Map();     // CODE -> { children: n, parents: n }
const listeners = new Map();  // CODE -> Set<fn>
const inflight = new Set();   // codes en cours de chargement
let pending = new Set();      // codes à demander au prochain flush
let timer = null;

export function normalizeCode(code) {
  if (code == null) return '';
  return String(code).trim().toUpperCase();
}

function notify(code) {
  const set = listeners.get(code);
  if (set) set.forEach((fn) => { try { fn(); } catch (e) { /* noop */ } });
}

async function flush() {
  timer = null;
  const codes = [...pending].filter((c) => !inflight.has(c) && !counts.has(c));
  pending = new Set();
  if (codes.length === 0) return;
  codes.forEach((c) => inflight.add(c));

  // Lots de 80 codes pour garder l'URL courte
  for (let i = 0; i < codes.length; i += 80) {
    const chunk = codes.slice(i, i + 80);
    try {
      const res = await fetch(
        `/api/product-associations?mode=counts&codes=${encodeURIComponent(chunk.join(','))}`
      );
      const json = await res.json();
      if (res.ok && json.success) {
        chunk.forEach((c) => {
          counts.set(c, {
            children: Number(json.counts?.[c]) || 0,
            parents: Number(json.parent_counts?.[c]) || 0,
          });
          notify(c);
        });
      }
    } catch (err) {
      console.error('Erreur chargement compteurs items associés:', err);
    } finally {
      chunk.forEach((c) => inflight.delete(c));
    }
  }
}

/** Demande (groupée) le compteur d'un code si inconnu. */
export function requestCount(code) {
  const c = normalizeCode(code);
  if (!c || counts.has(c) || inflight.has(c)) return;
  pending.add(c);
  if (!timer) timer = setTimeout(flush, 30);
}

/** Compteurs connus { children, parents } (ou undefined si jamais chargés). */
export function getCount(code) {
  return counts.get(normalizeCode(code));
}

/** Fixe le nombre d'associés (après création/suppression d'un lien) et prévient les abonnés. */
export function setCount(code, n) {
  const c = normalizeCode(code);
  if (!c) return;
  const prev = counts.get(c) || { children: 0, parents: 0 };
  counts.set(c, { ...prev, children: Math.max(0, Number(n) || 0) });
  notify(c);
}

/** Oublie un compteur et le recharge. */
export function invalidateCount(code) {
  const c = normalizeCode(code);
  if (!c) return;
  counts.delete(c);
  requestCount(c);
}

export function subscribe(code, fn) {
  const c = normalizeCode(code);
  if (!c) return () => {};
  if (!listeners.has(c)) listeners.set(c, new Set());
  listeners.get(c).add(fn);
  return () => {
    const set = listeners.get(c);
    if (set) {
      set.delete(fn);
      if (set.size === 0) listeners.delete(c);
    }
  };
}

/**
 * Hook: compteurs d'un code produit → undefined tant que non chargé, puis
 * { children: nb d'associés, parents: nb de produits qui le suggèrent }.
 */
export function useAssociationCount(code) {
  const c = normalizeCode(code);
  const [count, setCountState] = useState(() => (c ? getCount(c) : undefined));

  useEffect(() => {
    if (!c) {
      setCountState(undefined);
      return undefined;
    }
    setCountState(getCount(c));
    const unsub = subscribe(c, () => setCountState(getCount(c)));
    requestCount(c);
    return unsub;
  }, [c]);

  return count;
}
