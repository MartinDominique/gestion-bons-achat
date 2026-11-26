/**
 * @file components/panel/editor/PanelEditor.js
 * @description Panneau virtuel — éditeur de disposition PLEIN ÉCRAN (100 % de la fenêtre,
 *              aucun défilement de page; seul le panneau de droite défile).
 *              - Charge la disposition (/api/panel-layouts/[id]) et la bibliothèque des
 *                fiches actives (/api/panel-specs?mode=library)
 *              - État des pièces + historique annuler / rétablir (Ctrl+Z / Ctrl+Y)
 *              - Sauvegarde automatique (1,5 s après le dernier changement) + indicateur;
 *                avertit avant de quitter si un changement n'est pas encore enregistré
 *              - Raccourcis: flèches 1 mm (Maj: 10 mm), Suppr, Ctrl+D dupliquer, R pivoter,
 *                Ctrl+A tout sélectionner, Échap désélectionner
 *              - Une pièce qui ne touche pas le fond est « à placer »: elle ne compte ni
 *                dans les conflits ni dans le calcul du boîtier
 *              - Tous les calculs viennent de lib/panel/layout.ts (module pur, testé)
 *              Desktop d'abord; utilisable au doigt sur tablette (glisser, pincer).
 * @version 1.0.0
 * @date 2026-11-25
 * @changelog
 *   1.0.0 - Version initiale (Panneau virtuel PR 2)
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Undo2, Redo2, Maximize, Loader2, Check, AlertTriangle, PanelRightClose, PanelRightOpen, MousePointerClick } from 'lucide-react';
import PanelCanvas from './PanelCanvas';
import EditorSidePanel from './EditorSidePanel';
import { supabase } from '../../../lib/supabase';
import { usePanelUnit, UnitToggle } from '../usePanelUnit';
import {
  findConflicts, requiredPlate, requiredDepth, heatLoad, suggestEnclosures, fitPlate, snapToRail,
  alignItems, distributeItems, itemBox, overlaps, snap,
} from '../../../lib/panel/layout';
import { itemFromSpec, newRail, newDuct, newFreePiece, newId } from '../../../lib/panel/items';
import { formatLength } from '../../../lib/panel/specs';

const n = (v, fallback = 0) => {
  const x = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(x) ? x : fallback;
};
const SAVE_DELAY = 1500;
const HISTORY_MAX = 100;
const isTyping = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

export default function PanelEditor({ layoutId }) {
  const [unit, setUnit] = usePanelUnit();
  const [layout, setLayout] = useState(null);   // réglages (tout sauf items)
  const [items, setItems] = useState([]);
  const [library, setLibrary] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [multiMode, setMultiMode] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [saveState, setSaveState] = useState('saved'); // 'saved' | 'dirty' | 'saving' | 'error' | 'conflict'
  const [saveError, setSaveError] = useState('');
  const [userId, setUserId] = useState(null);
  const [, forceHistory] = useState(0);

  const canvasRef = useRef(null);
  const stateRef = useRef({ layout: null, items: [] });
  stateRef.current = { layout, items };
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const lastTag = useRef({ tag: null, at: 0 });
  const versionRef = useRef(1);
  const dirtyCount = useRef(0);
  const saving = useRef(false);
  const timer = useRef(null);
  const blocked = useRef(false); // conflit de version: plus aucune écriture

  // ----- Chargement -----
  const loadLibrary = useCallback(async () => {
    try {
      const res = await fetch('/api/panel-specs?mode=library');
      const json = await res.json();
      if (res.ok && json.success) setLibrary(json.data || []);
    } catch (e) {
      console.error('Bibliothèque Panneau virtuel:', e);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/panel-layouts/${layoutId}`);
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Erreur de chargement');
        if (cancelled) return;
        const { items: loaded, ...rest } = json.data;
        versionRef.current = rest.version;
        setItems(Array.isArray(loaded) ? loaded : []);
        setLayout(rest);
      } catch (e) {
        if (!cancelled) setLoadError(e.message);
      }
    })();
    loadLibrary();
    supabase.auth.getUser().then(({ data }) => { if (data?.user) setUserId(data.user.id); }).catch(() => {});
    return () => { cancelled = true; };
  }, [layoutId, loadLibrary]);

  // ----- Sauvegarde automatique -----
  const doSave = useCallback(async () => {
    if (saving.current || blocked.current) return;
    const { layout: l, items: its } = stateRef.current;
    if (!l) return;
    saving.current = true;
    const snapshot = dirtyCount.current;
    setSaveState('saving');
    try {
      const { id, created_at, updated_at, user_id, version, import_report, ...fields } = l;
      const res = await fetch(`/api/panel-layouts/${layoutId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, items: its, version: versionRef.current }),
      });
      const json = await res.json();
      if (res.status === 409) {
        blocked.current = true;
        setSaveError(json.error);
        setSaveState('conflict');
        return;
      }
      if (!res.ok || !json.success) throw new Error([json.error, json.details].filter(Boolean).join(' — ') || 'Erreur');
      versionRef.current = json.data.version;
      setSaveError('');
      if (dirtyCount.current === snapshot) setSaveState('saved');
      else { setSaveState('dirty'); timer.current = setTimeout(doSave, SAVE_DELAY); }
    } catch (e) {
      setSaveError(e.message);
      setSaveState('error');
    } finally {
      saving.current = false;
    }
  }, [layoutId]);

  const markDirty = useCallback(() => {
    if (blocked.current) return;
    dirtyCount.current += 1;
    setSaveState((s) => (s === 'saving' ? s : 'dirty'));
    clearTimeout(timer.current);
    timer.current = setTimeout(doSave, SAVE_DELAY);
  }, [doSave]);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (saveState === 'saved') return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveState]);

  // ----- Modifications + historique -----
  /**
   * change({ items?, layout? }, tag?): applique un changement et l'empile dans l'historique.
   * Deux changements de même `tag` à moins d'une seconde (frappe dans un champ, flèches)
   * ne font qu'une seule étape d'annulation.
   */
  const change = useCallback((next, tag = null) => {
    const cur = stateRef.current;
    const now = Date.now();
    const coalesce = tag && lastTag.current.tag === tag && now - lastTag.current.at < 1000;
    if (!coalesce) {
      undoStack.current.push({ items: cur.items, layout: cur.layout });
      if (undoStack.current.length > HISTORY_MAX) undoStack.current.shift();
    }
    redoStack.current = [];
    lastTag.current = { tag, at: now };
    if (next.items) setItems(next.items);
    if (next.layout) setLayout({ ...cur.layout, ...next.layout });
    forceHistory((v) => v + 1);
    markDirty();
  }, [markDirty]);

  const restore = (from, to) => {
    const snapshot = from.current.pop();
    if (!snapshot) return;
    const cur = stateRef.current;
    to.current.push({ items: cur.items, layout: cur.layout });
    lastTag.current = { tag: null, at: 0 };
    setItems(snapshot.items);
    // Seuls le fond et le boîtier reviennent en arrière; le nom, les réglages et le statut restent
    setLayout({
      ...cur.layout,
      plate_width_mm: snapshot.layout.plate_width_mm,
      plate_height_mm: snapshot.layout.plate_height_mm,
      enclosure_code: snapshot.layout.enclosure_code,
      orientation: snapshot.layout.orientation,
    });
    setSelectedIds((ids) => ids.filter((id) => snapshot.items.some((i) => i.id === id)));
    forceHistory((v) => v + 1);
    markDirty();
  };
  const undo = () => restore(undoStack, redoStack);
  const redo = () => restore(redoStack, undoStack);

  // ----- Dérivés -----
  const plate = useMemo(
    () => ({ w: n(layout?.plate_width_mm, 600), h: n(layout?.plate_height_mm, 600) }),
    [layout?.plate_width_mm, layout?.plate_height_mm]
  );
  const pendingIds = useMemo(() => {
    const plateBox = { x: 0, y: 0, w: plate.w, h: plate.h };
    return items.filter((i) => !overlaps(itemBox(i), plateBox)).map((i) => i.id);
  }, [items, plate]);
  const placed = useMemo(() => {
    const pending = new Set(pendingIds);
    return items.filter((i) => !pending.has(i.id));
  }, [items, pendingIds]);

  const report = useMemo(() => findConflicts(placed, plate), [placed, plate]);
  const result = useMemo(() => {
    if (!layout) return null;
    const need = requiredPlate(placed, n(layout.margin_mm, 15), n(layout.spare_percent));
    const depth = requiredDepth(placed, n(layout.door_rear_depth_mm));
    const heat = heatLoad(placed);
    const enclosures = library.filter((s) => s.kind === 'enclosure');
    const suggestions = need
      ? suggestEnclosures(enclosures, need, depth, { w: n(layout.avail_width_mm), h: n(layout.avail_height_mm), d: n(layout.avail_depth_mm) })
      : { fits: [], rejected: [], incomplete: enclosures.filter((e) => e.status === 'missing') };
    return { need, depth, heat, suggestions, enclosureCount: enclosures.length };
  }, [placed, layout, library]);

  // ----- Actions sur les pièces -----
  /**
   * Change la taille du fond. Les pièces « à placer » (à droite ou sous le fond) suivent
   * le bord pour ne pas se retrouver sur le fond par accident.
   */
  const setPlate = useCallback((w, h, extraLayout = {}, nextItems = null) => {
    const cur = stateRef.current;
    const dw = w - n(cur.layout.plate_width_mm, 600);
    const dh = h - n(cur.layout.plate_height_mm, 600);
    const oldW = n(cur.layout.plate_width_mm, 600);
    const moved = (nextItems || cur.items).map((i) => {
      if (!pendingIdsRef.current.has(i.id)) return i;
      if (i.x >= oldW) return { ...i, x: Math.round((i.x + dw) * 10) / 10 };
      return { ...i, y: Math.round((i.y + dh) * 10) / 10 };
    });
    change({ items: moved, layout: { plate_width_mm: w, plate_height_mm: h, ...extraLayout } }, 'plate');
  }, [change]);
  const pendingIdsRef = useRef(new Set());
  pendingIdsRef.current = new Set(pendingIds);

  const updateItems = useCallback((ids, patch, tag) => {
    const set = new Set(ids);
    change({ items: stateRef.current.items.map((i) => (set.has(i.id) ? { ...i, ...(typeof patch === 'function' ? patch(i) : patch) } : i)) }, tag);
  }, [change]);

  const moveItems = useCallback((ids, dx, dy, { railSnap = true, tag = null } = {}) => {
    if (!dx && !dy) return;
    const set = new Set(ids);
    let next = stateRef.current.items.map((i) => (set.has(i.id)
      ? { ...i, x: Math.round((i.x + dx) * 10) / 10, y: Math.round((i.y + dy) * 10) / 10 } : i));
    if (railSnap) {
      next = next.map((i) => {
        if (!set.has(i.id)) return i;
        const s = snapToRail(i, next);
        return s ? { ...i, x: s.x, y: s.y } : i;
      });
    }
    change({ items: next }, tag);
  }, [change]);

  const addItem = useCallback((item) => {
    change({ items: [...stateRef.current.items, item] });
    setSelectedIds([item.id]);
  }, [change]);

  const dropPoint = () => {
    const c = canvasRef.current?.viewCenter() || { x: 30, y: 30 };
    const step = n(stateRef.current.layout?.snap_mm, 5);
    return { x: snap(c.x, step), y: snap(c.y, step) };
  };

  const addFromSpec = useCallback((spec, x, y, quantity) => {
    const p = x == null ? dropPoint() : { x, y };
    const item = itemFromSpec(spec, { description: spec.description, quantity });
    const step = n(stateRef.current.layout?.snap_mm, 5);
    const placedItem = { ...item, x: snap(p.x - (x == null ? item.w / 2 : 0), step), y: snap(p.y - (x == null ? item.h / 2 : 0), step) };
    const s = snapToRail(placedItem, stateRef.current.items);
    addItem(s ? { ...placedItem, x: s.x, y: s.y } : placedItem);
  }, [addItem]);

  /** Ajoute `count` exemplaires d'une fiche dans la zone « à placer » (à droite du fond). */
  const addManyFromSpec = useCallback((spec, count, quantity) => {
    const cur = stateRef.current;
    const plateW = n(cur.layout.plate_width_mm, 600);
    const startY = cur.items
      .filter((i) => pendingIdsRef.current.has(i.id) && i.x >= plateW)
      .reduce((max, i) => Math.max(max, itemBox(i).y + itemBox(i).h + 20), 0);
    const added = [];
    let x = plateW + 40;
    for (let k = 0; k < Math.max(1, count); k++) {
      const item = itemFromSpec(spec, { description: spec.description, quantity });
      added.push({ ...item, x, y: startY });
      x += item.w + 15;
    }
    change({ items: [...cur.items, ...added] });
    setSelectedIds(added.map((a) => a.id));
    setTimeout(() => canvasRef.current?.fit(), 50);
  }, [change]);

  const addBasic = useCallback((type) => {
    const p = dropPoint();
    if (type === 'rail') addItem(newRail(p.x - 150, p.y));
    else if (type === 'duct-h') addItem(newDuct(p.x - 150, p.y, false));
    else if (type === 'duct-v') addItem(newDuct(p.x, p.y - 150, true));
    else addItem(newFreePiece(p.x, p.y));
  }, [addItem]);

  const removeSelected = useCallback(() => {
    const ids = new Set(selectedIdsRef.current);
    if (ids.size === 0) return;
    if (ids.size > 1 && !window.confirm(`Supprimer les ${ids.size} éléments sélectionnés ?`)) return;
    change({ items: stateRef.current.items.filter((i) => !ids.has(i.id)) });
    setSelectedIds([]);
  }, [change]);

  const duplicateSelected = useCallback(() => {
    const ids = new Set(selectedIdsRef.current);
    const copies = stateRef.current.items.filter((i) => ids.has(i.id))
      .map((i) => ({ ...i, id: newId(i.kind[0]), x: i.x + 20, y: i.y + 20 }));
    if (copies.length === 0) return;
    change({ items: [...stateRef.current.items, ...copies] });
    setSelectedIds(copies.map((c) => c.id));
  }, [change]);

  const rotateSelected = useCallback(() => {
    updateItems(selectedIdsRef.current, (i) => ({ rot: i.rot === 90 ? 0 : 90 }));
  }, [updateItems]);

  const selectedIdsRef = useRef([]);
  selectedIdsRef.current = selectedIds;

  const align = (mode) => change({ items: alignItems(items, new Set(selectedIds), mode) });
  const distribute = (axis) => change({ items: distributeItems(items, new Set(selectedIds), axis) });

  const fitPlateToItems = () => {
    const res = fitPlate(placed, n(layout.margin_mm, 15));
    if (!res) return;
    const byId = new Map(res.items.map((i) => [i.id, i]));
    setPlate(res.plate.w, res.plate.h, {}, items.map((i) => byId.get(i.id) || i));
    setTimeout(() => canvasRef.current?.fit(), 50);
  };

  const chooseEnclosure = (fit) => {
    setPlate(fit.plate.w, fit.plate.h, { enclosure_code: fit.enclosure.product_code, orientation: fit.orientation });
    setTimeout(() => canvasRef.current?.fit(), 50);
  };

  const setSetting = (patch, tag) => {
    setLayout((l) => ({ ...l, ...patch }));
    lastTag.current = { tag: tag || null, at: Date.now() };
    markDirty();
  };

  // ----- Clavier -----
  useEffect(() => {
    const onKey = (e) => {
      if (isTyping(e.target)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (ctrl && key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if (ctrl && key === 'a') { e.preventDefault(); setSelectedIds(stateRef.current.items.map((i) => i.id)); return; }
      if (ctrl && key === 'd') { e.preventDefault(); duplicateSelected(); return; }
      if (e.key === 'Escape') { setSelectedIds([]); return; }
      const ids = selectedIdsRef.current;
      if (ids.length === 0) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); return; }
      if (key === 'r' && !ctrl) { e.preventDefault(); rotateSelected(); return; }
      const step = e.shiftKey ? 10 : 1;
      const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (arrows[e.key]) {
        e.preventDefault();
        moveItems(ids, arrows[e.key][0], arrows[e.key][1], { railSnap: false, tag: 'arrows' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveItems, removeSelected, duplicateSelected, rotateSelected]);

  // ----- Rendu -----
  if (loadError) {
    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertTriangle className="w-10 h-10 text-red-600" />
        <p className="text-gray-800 dark:text-gray-100">{loadError}</p>
        <Link href="/panneaux" className="min-h-[44px] px-4 inline-flex items-center rounded-lg bg-teal-600 text-white text-sm font-medium">Retour aux dispositions</Link>
      </div>
    );
  }
  if (!layout) {
    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  const conflictCount = report.messages.length;
  const best = result?.suggestions.fits[0];
  const iconBtn = 'min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" style={{ height: '100dvh' }}>
      {/* Barre compacte */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <Link
          href="/panneaux" className={iconBtn} title="Retour aux dispositions"
          onClick={(e) => { if (saveState !== 'saved' && !window.confirm('Des changements ne sont pas encore enregistrés. Quitter quand même ?')) e.preventDefault(); }}
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <input
          type="text" value={layout.name || ''} onChange={(e) => setSetting({ name: e.target.value }, 'name')}
          aria-label="Nom de la disposition" autoCorrect="on" autoCapitalize="sentences" spellCheck
          className="flex-1 min-w-0 max-w-md min-h-[44px] px-3 rounded-lg border border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-teal-500 bg-transparent font-semibold text-sm"
        />
        <div className="hidden lg:block text-xs text-gray-500 dark:text-gray-400 truncate">
          {[layout.project_code, layout.client_name, layout.submission_number && `Soum. ${layout.submission_number}`].filter(Boolean).join(' · ')}
        </div>
        <div className="flex-1" />
        <button type="button" className={iconBtn} onClick={undo} disabled={undoStack.current.length === 0} title="Annuler (Ctrl+Z)"><Undo2 className="w-5 h-5" /></button>
        <button type="button" className={iconBtn} onClick={redo} disabled={redoStack.current.length === 0} title="Rétablir (Ctrl+Y)"><Redo2 className="w-5 h-5" /></button>
        <button type="button" className={iconBtn} onClick={() => canvasRef.current?.fit()} title="Ajuster la vue"><Maximize className="w-5 h-5" /></button>
        <button
          type="button" onClick={() => setMultiMode((m) => !m)} aria-pressed={multiMode}
          title="Sélection multiple au doigt: chaque tap ajoute ou retire une pièce (à la souris: Maj-clic ou rectangle)"
          className={`${iconBtn} ${multiMode ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700 dark:hover:bg-blue-700' : ''}`}
        >
          <MousePointerClick className="w-5 h-5" />
        </button>
        <UnitToggle unit={unit} onChange={setUnit} />
        <div className="w-36 text-xs flex items-center gap-1.5" aria-live="polite">
          {saveState === 'saved' && <><Check className="w-4 h-4 text-green-600" /><span className="text-green-700 dark:text-green-400">Enregistré</span></>}
          {saveState === 'dirty' && <span className="text-gray-500 dark:text-gray-400">Modifié…</span>}
          {saveState === 'saving' && <><Loader2 className="w-4 h-4 animate-spin text-gray-500" /><span className="text-gray-500 dark:text-gray-400">Enregistrement…</span></>}
          {(saveState === 'error' || saveState === 'conflict') && (
            <button type="button" onClick={saveState === 'error' ? doSave : undefined} title={saveError} className="text-red-700 dark:text-red-400 inline-flex items-center gap-1 text-left">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {saveState === 'error' ? 'Non enregistré — réessayer' : 'Modifiée ailleurs'}
            </button>
          )}
        </div>
        <button type="button" className={iconBtn} onClick={() => setPanelOpen((o) => !o)} title={panelOpen ? 'Replier le panneau' : 'Ouvrir le panneau'}>
          {panelOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
        </button>
      </div>

      {saveState === 'conflict' && (
        <div className="px-3 py-2 text-sm bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-b border-red-200 dark:border-red-800 flex items-center gap-3 flex-shrink-0">
          <span className="flex-1">{saveError} Vos derniers changements ici ne sont pas enregistrés.</span>
          <button type="button" onClick={() => window.location.reload()} className="min-h-[44px] px-3 rounded-lg bg-red-700 text-white text-sm font-medium">Recharger</button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        {/* Plan + ligne d'alertes */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0">
            <PanelCanvas
              ref={canvasRef}
              items={items} plate={plate} report={report}
              selectedIds={selectedIds} pendingIds={pendingIds}
              unit={unit} snapMm={n(layout.snap_mm, 5)} multiMode={multiMode}
              enclosureLabel={layout.enclosure_code ? `boîtier ${layout.enclosure_code}` : ''}
              onSelect={setSelectedIds}
              onMove={(ids, dx, dy) => moveItems(ids, dx, dy)}
              onDropSpec={(code, x, y) => { const spec = library.find((s) => s.product_code === code); if (spec) addFromSpec(spec, x, y); }}
            />
          </div>
          <div
            className={`flex-shrink-0 px-3 py-1.5 text-xs border-t overflow-x-auto whitespace-nowrap ${
              conflictCount ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
            }`}
          >
            {conflictCount ? (
              <span style={{ color: '#c8371e' }} className="font-medium">
                {conflictCount} conflit{conflictCount > 1 ? 's' : ''}: {report.messages.slice(0, 6).join(' · ')}{conflictCount > 6 ? ' …' : ''}
              </span>
            ) : (
              <span className="text-green-700 dark:text-green-400">Aucun conflit.</span>
            )}
            {pendingIds.length > 0 && <span className="ml-3 text-gray-600 dark:text-gray-300">{pendingIds.length} à placer</span>}
          </div>
        </div>

        {/* Panneau de droite */}
        {panelOpen && (
          <div className="flex-shrink-0 w-full md:w-[360px] xl:w-[400px] h-[45%] md:h-auto border-t md:border-t-0 md:border-l border-gray-200 dark:border-gray-700 flex flex-col min-h-0">
            {/* Résultat toujours visible */}
            <div className="flex-shrink-0 px-3 py-2 bg-teal-50 dark:bg-teal-950/40 border-b border-teal-200 dark:border-teal-900 text-xs grid grid-cols-3 gap-2">
              <div>
                <div className="text-teal-800 dark:text-teal-300">Fond requis</div>
                <div className="font-semibold text-sm">{result?.need ? `${formatLength(result.need.w, unit).replace(/ (mm|po)$/, '')} × ${formatLength(result.need.h, unit)}` : '—'}</div>
              </div>
              <div className="min-w-0">
                <div className="text-teal-800 dark:text-teal-300">Boîtier suggéré</div>
                <div className="font-semibold text-sm truncate" title={best?.enclosure.description || ''}>{best ? best.enclosure.product_code : (result?.need ? 'Aucun' : '—')}</div>
              </div>
              <div>
                <div className="text-teal-800 dark:text-teal-300">Conflits</div>
                <div className="font-semibold text-sm" style={conflictCount ? { color: '#c8371e' } : undefined}>{conflictCount}</div>
              </div>
            </div>
            <EditorSidePanel
              layout={layout} items={items} plate={plate} library={library} unit={unit} userId={userId}
              selectedIds={selectedIds} pendingIds={pendingIds} result={result} report={report}
              onSelect={(ids) => { setSelectedIds(ids); }}
              onUpdateItems={updateItems}
              onAddFromSpec={addFromSpec}
              onAddManyFromSpec={addManyFromSpec}
              onAddBasic={addBasic}
              onRemove={removeSelected}
              onDuplicate={duplicateSelected}
              onRotate={rotateSelected}
              onAlign={align}
              onDistribute={distribute}
              onSetPlate={(w, h) => setPlate(w, h)}
              onSetting={setSetting}
              onFitPlate={fitPlateToItems}
              onChooseEnclosure={chooseEnclosure}
              onLibraryChanged={loadLibrary}
            />
          </div>
        )}
      </div>
    </div>
  );
}
