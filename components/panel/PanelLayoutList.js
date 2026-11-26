/**
 * @file components/panel/PanelLayoutList.js
 * @description Panneau virtuel — page « Panneaux »: liste des dispositions.
 *              - Tableau (desktop) / cartes (étroit): nom, projet, client, soumission,
 *                boîtier retenu, fond, modifiée le, statut (brouillon / approuvé)
 *              - « Nouvelle disposition »: depuis une SOUMISSION (les pièces dont la case
 *                « Panneau virtuel » est cochée arrivent dans la zone « à placer ») ou vide
 *              - Par ligne: Ouvrir, Dupliquer (sert de modèle), Approuver / Remettre en
 *                brouillon, Supprimer (avec confirmation)
 * @version 1.0.0
 * @date 2026-11-25
 * @changelog
 *   1.0.0 - Version initiale (Panneau virtuel PR 2)
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Copy, Trash2, Loader2, Search, X, LayoutGrid, CheckCircle2, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatLength } from '../../lib/panel/specs';
import { usePanelUnit, UnitToggle } from './usePanelUnit';

const INPUT =
  'w-full px-3 py-2 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg text-sm ' +
  'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500';
const BTN =
  'min-h-[44px] px-3 inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 ' +
  'text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40';

const fmtDate = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-CA', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Toronto' });
};

function StatusBadge({ status }) {
  return status === 'approved'
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300"><CheckCircle2 className="w-3 h-3" /> Approuvé</span>
    : <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">Brouillon</span>;
}

function NewLayoutModal({ onClose, onCreated, userId }) {
  const [mode, setMode] = useState('submission'); // 'submission' | 'empty'
  const [name, setName] = useState('');
  const [project, setProject] = useState('');
  const [search, setSearch] = useState('');
  const [subs, setSubs] = useState([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef(null);

  useEffect(() => {
    if (mode !== 'submission') return undefined;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSubsLoading(true);
      try {
        const res = await fetch(`/api/panel-layouts?mode=submissions&search=${encodeURIComponent(search)}`);
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Erreur');
        setSubs(json.data);
      } catch (e) {
        setError(e.message);
      } finally {
        setSubsLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [search, mode]);

  const create = async () => {
    if (busy) return;
    setError('');
    if (mode === 'submission' && !picked) { setError('Choisissez une soumission.'); return; }
    if (mode === 'empty' && !name.trim()) { setError('Donnez un nom à la disposition.'); return; }
    setBusy(true);
    try {
      const body = mode === 'submission'
        ? { from_submission: picked.id, name: name.trim() || undefined, project_code: project.trim() || undefined, user_id: userId }
        : { name: name.trim(), project_code: project.trim() || null, user_id: userId };
      const res = await fetch('/api/panel-layouts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error([json.error, json.details].filter(Boolean).join(' — ') || 'Erreur');
      onCreated(json.data);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Nouvelle disposition</h3>
          <button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Fermer"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
            {[['submission', 'Depuis une soumission'], ['empty', 'Vide']].map(([v, l]) => (
              <button
                key={v} type="button" onClick={() => setMode(v)} aria-pressed={mode === v}
                className={`px-4 min-h-[44px] text-sm font-medium ${mode === v ? 'bg-teal-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200'}`}
              >
                {l}
              </button>
            ))}
          </div>

          {mode === 'submission' && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Les pièces de la soumission dont la case « Panneau virtuel » est cochée dans l&apos;Inventaire seront déposées à côté d&apos;un fond vide, prêtes à placer. Les autres lignes sont ignorées (et comptées).
              </p>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="N° de soumission, client ou description"
                  className={`${INPUT} pl-9`} autoCorrect="off" autoCapitalize="off" spellCheck={false}
                />
              </div>
              <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-lg max-h-64 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-700">
                {subsLoading && <div className="p-3 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Recherche…</div>}
                {!subsLoading && subs.length === 0 && <div className="p-3 text-sm text-gray-500">Aucune soumission trouvée.</div>}
                {subs.map((s) => (
                  <button
                    key={s.id} type="button" onClick={() => setPicked(s)}
                    className={`w-full text-left px-3 py-2 min-h-[44px] ${picked?.id === s.id ? 'bg-teal-50 dark:bg-teal-950/50' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                  >
                    <span className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">{s.submission_number || `#${s.id}`}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400"> · {s.client_name || '—'} · {fmtDate(s.created_at)}</span>
                    <span className="block text-xs text-gray-600 dark:text-gray-300 truncate">{s.description || ''}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Nom{mode === 'submission' ? ' (optionnel)' : ''}</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={INPUT} autoCorrect="on" autoCapitalize="sentences" spellCheck placeholder={mode === 'submission' ? 'Repris de la soumission' : ''} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Code de projet (optionnel)</label>
              <input type="text" value={project} onChange={(e) => setProject(e.target.value)} className={INPUT} autoCorrect="off" autoCapitalize="off" spellCheck={false} placeholder="ex. PGF2701" />
            </div>
          </div>
          {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
        </div>
        <div className="flex gap-3 px-5 py-3 border-t border-gray-200 dark:border-gray-700">
          <button type="button" className={`${BTN} flex-1`} onClick={onClose}>Annuler</button>
          <button type="button" onClick={create} disabled={busy} className="flex-1 min-h-[44px] rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy ? 'Création…' : 'Créer et ouvrir'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PanelLayoutList() {
  const router = useRouter();
  const [unit, setUnit] = usePanelUnit();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [userId, setUserId] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/panel-layouts');
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error([json.error, json.details].filter(Boolean).join(' — ') || 'Erreur');
      setRows(json.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    supabase.auth.getUser().then(({ data }) => { if (data?.user) setUserId(data.user.id); }).catch(() => {});
  }, [load]);

  const act = async (id, fn) => {
    if (busyId) return;
    setBusyId(id);
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };
  const call = async (url, options) => {
    const res = await fetch(url, options);
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error([json.error, json.details].filter(Boolean).join(' — ') || 'Erreur');
    return json;
  };
  const json = (body) => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  const duplicate = (row) => act(row.id, () => call('/api/panel-layouts', { method: 'POST', ...json({ duplicate_from: row.id, user_id: userId }) }));
  const toggleStatus = (row) => act(row.id, () => call(`/api/panel-layouts/${row.id}`, { method: 'PUT', ...json({ status: row.status === 'approved' ? 'draft' : 'approved' }) }));
  const remove = (row) => {
    if (!window.confirm(`Supprimer la disposition « ${row.name} » ?\n\nCette action est définitive.`)) return;
    act(row.id, () => call(`/api/panel-layouts/${row.id}`, { method: 'DELETE' }));
  };

  const meta = (r) => [r.project_code, r.client_name, r.submission_number && `Soum. ${r.submission_number}`].filter(Boolean).join(' · ');
  const actions = (r) => (
    <div className="flex flex-wrap gap-2 justify-end">
      <button type="button" className={BTN} disabled={busyId === r.id} onClick={() => duplicate(r)} title="Dupliquer (sert de modèle)"><Copy className="w-4 h-4" /><span className="hidden xl:inline">Dupliquer</span></button>
      <button type="button" className={BTN} disabled={busyId === r.id} onClick={() => toggleStatus(r)}>{r.status === 'approved' ? 'Remettre en brouillon' : 'Approuver'}</button>
      <button type="button" className={`${BTN} text-red-700 dark:text-red-400 border-red-300 dark:border-red-700`} disabled={busyId === r.id} onClick={() => remove(r)} title="Supprimer"><Trash2 className="w-4 h-4" /></button>
    </div>
  );

  return (
    <div className="max-w-6xl 2xl:max-w-none mx-auto">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <LayoutGrid className="w-7 h-7 text-teal-600" />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Panneaux</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Disposez les pièces sur le fond de panneau, puis choisissez le boîtier.</p>
        </div>
        <UnitToggle unit={unit} onChange={setUnit} />
        <button type="button" onClick={() => setShowNew(true)} className="min-h-[44px] px-4 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 inline-flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nouvelle disposition
        </button>
      </div>

      {error && <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/30 text-sm text-red-800 dark:text-red-200">{error}</div>}

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-teal-600" /></div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
          <FileText className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-700 dark:text-gray-200 font-medium">Aucune disposition pour l&apos;instant</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-md mx-auto">
            Créez-en une à partir d&apos;une soumission: les pièces cochées « Panneau virtuel » dans l&apos;Inventaire arrivent prêtes à placer.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2">Disposition</th>
                  <th className="px-3 py-2">Boîtier retenu</th>
                  <th className="px-3 py-2">Fond (L × H)</th>
                  <th className="px-3 py-2">Modifiée le</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                    <td className="px-3 py-2">
                      <Link href={`/panneaux/${r.id}`} className="font-semibold text-teal-700 dark:text-teal-300 hover:underline inline-flex items-center min-h-[44px]">{r.name}</Link>
                      {meta(r) && <div className="text-xs text-gray-500 dark:text-gray-400">{meta(r)}</div>}
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-800 dark:text-gray-200">{r.enclosure_code || <span className="font-sans text-gray-400">à choisir</span>}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">{formatLength(Number(r.plate_width_mm), unit)} × {formatLength(Number(r.plate_height_mm), unit)}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">{fmtDate(r.updated_at)}</td>
                    <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                    <td className="px-3 py-2">{actions(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Étroit */}
          <div className="md:hidden space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/panneaux/${r.id}`} className="font-semibold text-teal-700 dark:text-teal-300 min-h-[44px] inline-flex items-center">{r.name}</Link>
                  <StatusBadge status={r.status} />
                </div>
                {meta(r) && <div className="text-xs text-gray-500 dark:text-gray-400">{meta(r)}</div>}
                <div className="text-xs text-gray-600 dark:text-gray-300 mt-1 mb-2">
                  Boîtier: {r.enclosure_code || 'à choisir'} · {fmtDate(r.updated_at)}
                </div>
                {actions(r)}
              </div>
            ))}
          </div>
        </>
      )}

      {showNew && (
        <NewLayoutModal
          userId={userId}
          onClose={() => setShowNew(false)}
          onCreated={(row) => router.push(`/panneaux/${row.id}`)}
        />
      )}
    </div>
  );
}
