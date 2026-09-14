/**
 * @file components/DbStatusBadge.js
 * @description Voyant d'état de la base de données (Supabase) dans la navigation
 *              - Interroge /api/health au montage, toutes les 60 s, au retour en
 *                avant-plan et au tap sur le voyant
 *              - Vert = OK, orange = lente (> 1,5 s), rouge = ne répond pas,
 *                gris = vérification en cours
 *              - Un tap relance la vérification et affiche le détail (latence / erreur)
 *              - Sert à savoir si une lenteur ou des erreurs viennent de la base,
 *                pas de l'appareil, et à attendre qu'elle soit revenue avant de
 *                refaire une action (ex. renvoyer une facture)
 * @version 1.0.0
 * @date 2026-09-14
 * @changelog
 *   1.0.0 - Version initiale (diagnostic DB lente / 500 en cascade)
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Database } from 'lucide-react';

const POLL_MS = 60000;

const STYLES = {
  checking: { dot: 'bg-gray-400 animate-pulse', label: 'Vérification…' },
  ok: { dot: 'bg-green-500', label: 'Base de données OK' },
  slow: { dot: 'bg-amber-500 animate-pulse', label: 'Base de données lente' },
  down: { dot: 'bg-red-500 animate-pulse', label: 'Base de données ne répond pas' },
};

export default function DbStatusBadge() {
  const [state, setState] = useState({ status: 'checking', latency: null, error: null, at: null });
  const [showDetail, setShowDetail] = useState(false);

  const check = useCallback(async () => {
    setState(s => ({ ...s, status: s.status === 'checking' ? 'checking' : s.status }));
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 12000);
      const res = await fetch('/api/health', { cache: 'no-store', signal: controller.signal });
      clearTimeout(t);
      const json = await res.json();
      setState({
        status: json.status || (res.ok ? 'ok' : 'down'),
        latency: json.db?.latency_ms ?? null,
        error: json.db?.error || null,
        at: new Date(),
      });
    } catch (err) {
      // Réseau coupé, serveur injoignable ou délai dépassé
      setState({ status: 'down', latency: null, error: err.name === 'AbortError' ? 'Délai dépassé' : 'Serveur injoignable', at: new Date() });
    }
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [check]);

  const style = STYLES[state.status] || STYLES.checking;
  const timeStr = state.at
    ? state.at.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Toronto' })
    : '';
  const detail = state.status === 'checking'
    ? 'Vérification en cours…'
    : state.status === 'down'
      ? `Ne répond pas${state.error ? ` — ${state.error}` : ''}. Attendez avant de refaire une action.`
      : `${style.label} — ${state.latency} ms (vérifié à ${timeStr})`;

  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => { setShowDetail(v => !v); check(); }}
        title={detail}
        aria-label={detail}
        className="min-w-[44px] min-h-[44px] px-2 inline-flex items-center justify-center gap-1.5 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <Database className="w-4 h-4" />
        <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
        {state.status === 'ok' && state.latency != null && (
          <span className="hidden md:inline tabular-nums">{state.latency} ms</span>
        )}
        {(state.status === 'slow' || state.status === 'down') && (
          <span className={`hidden sm:inline font-medium ${state.status === 'down' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
            {state.status === 'down' ? 'BD hors ligne' : 'BD lente'}
          </span>
        )}
      </button>
      {showDetail && (
        <div
          className="absolute left-0 top-full mt-1 z-50 w-72 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg p-3 text-xs text-gray-700 dark:text-gray-200"
          onClick={() => setShowDetail(false)}
        >
          <div className="font-semibold mb-1 flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
            {style.label}
          </div>
          <div>{detail}</div>
          <div className="mt-1 text-gray-500 dark:text-gray-400">Tap sur le voyant pour revérifier.</div>
        </div>
      )}
    </div>
  );
}
