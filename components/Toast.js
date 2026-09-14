/**
 * @file components/Toast.js
 * @description Notification flottante (toast) pour confirmer une action sans déplacer la page.
 *              - Rendue via portail (document.body), position fixe au bas de l'écran, au-dessus
 *                de tout (z-[90]) : la liste en dessous NE BOUGE PAS quand le message apparaît
 *                ou disparaît (fin des taps manqués sur « Créer facture » quand la bande verte
 *                en haut de liste se retirait)
 *              - Se referme seule (3 s succès / 7 s erreur), au tap sur le message, ou via le X
 *              - Types: success (vert) / error (rouge) / warning (ambre)
 *              - Mobile-first: cible tactile 44 px, largeur bornée, safe-area iOS
 * @version 1.0.0
 * @date 2026-09-14
 * @changelog
 *   1.0.0 - Version initiale (remplace les bandes de confirmation en haut de liste)
 */

'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, AlertCircle, AlertTriangle, X } from 'lucide-react';

const STYLES = {
  success: {
    box: 'bg-emerald-600 text-white border-emerald-700',
    Icon: CheckCircle,
    duration: 3000,
  },
  error: {
    box: 'bg-red-600 text-white border-red-700',
    Icon: AlertCircle,
    duration: 7000,
  },
  warning: {
    box: 'bg-amber-500 text-white border-amber-600',
    Icon: AlertTriangle,
    duration: 7000,
  },
};

/**
 * @param {string|null} message  Texte à afficher (null/'' = rien)
 * @param {'success'|'error'|'warning'} type
 * @param {function} onClose     Appelée à la fermeture (auto, tap, X) → le parent remet son state à null
 * @param {number} [duration]    Durée en ms avant fermeture auto (0 = jamais)
 */
export default function Toast({ message, type = 'success', onClose, duration }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const cfg = STYLES[type] || STYLES.success;
  const ms = duration === undefined ? cfg.duration : duration;

  useEffect(() => {
    if (!message || !ms) return;
    const t = setTimeout(() => onClose && onClose(), ms);
    return () => clearTimeout(t);
  }, [message, ms, onClose]);

  if (!mounted || !message) return null;

  const { Icon } = cfg;

  return createPortal(
    <div
      className="fixed inset-x-0 bottom-0 z-[90] flex justify-center px-4 pointer-events-none"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)' }}
    >
      <div
        role="status"
        aria-live="polite"
        onClick={() => onClose && onClose()}
        className={`pointer-events-auto flex items-center gap-3 max-w-md w-full sm:w-auto pl-4 pr-1 py-1 rounded-xl border shadow-2xl text-sm font-medium animate-toast-in cursor-pointer ${cfg.box}`}
      >
        <Icon className="w-5 h-5 flex-shrink-0" />
        <span className="flex-1 py-2 leading-snug">{message}</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose && onClose(); }}
          className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-white/20 flex-shrink-0"
          aria-label="Fermer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>,
    document.body
  );
}
