/**
 * @file components/panel/usePanelUnit.js
 * @description Panneau virtuel — unité d'affichage (mm ou pouces), bascule GLOBALE
 *              mémorisée dans le navigateur (localStorage « panel-unit »). Les
 *              mesures sont toujours stockées en mm.
 *              - usePanelUnit(): [unit, setUnit], synchronisé entre les composants
 *                ouverts en même temps
 *              - UnitToggle: bascule « mm | po » à deux segments (44 px)
 * @version 1.0.0
 * @date 2026-11-25
 * @changelog
 *   1.0.0 - Version initiale (Panneau virtuel PR 1)
 */
import React, { useState, useEffect, useCallback } from 'react';

const KEY = 'panel-unit';
const EVENT = 'panel-unit-change';

function readUnit() {
  try {
    return window.localStorage.getItem(KEY) === 'in' ? 'in' : 'mm';
  } catch (e) {
    return 'mm';
  }
}

export function usePanelUnit() {
  const [unit, setUnitState] = useState('mm');

  useEffect(() => {
    setUnitState(readUnit());
    const sync = () => setUnitState(readUnit());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setUnit = useCallback((next) => {
    const value = next === 'in' ? 'in' : 'mm';
    try { window.localStorage.setItem(KEY, value); } catch (e) { /* stockage bloqué: unité valable pour la session */ }
    setUnitState(value);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [unit, setUnit];
}

export function UnitToggle({ unit, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden" role="group" aria-label="Unité de mesure">
      {[{ v: 'mm', l: 'mm' }, { v: 'in', l: 'po' }].map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          aria-pressed={unit === o.v}
          className={`px-4 min-h-[44px] text-sm font-medium ${
            unit === o.v
              ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900'
              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}
