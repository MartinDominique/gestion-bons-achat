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
 * @version 1.2.0
 * @date 2026-11-26
 * @changelog
 *   1.2.0 - Menu « Document »: PDF (plans lettre ou 11 × 17), approuver / brouillon, versions (restaurer),
 *           envoyer le boîtier à la soumission; une disposition approuvée qu'on modifie redevient brouillon (PR 4)
 *   1.1.0 - Vue « Porte » (bascule Fond | Porte): pièces de porte placées à l'échelle devant le fond en
 *           filigrane, alerte de profondeur; orientation du boîtier (debout / couché gauche / couché droit)
 *           et côté de la charnière; la profondeur requise tient compte des pièces de porte (PR 3)
 *   1.0.0 - Version initiale (Panneau virtuel PR 2)
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Undo2, Redo2, Maximize, Loader2, Check, AlertTriangle, PanelRightClose, PanelRightOpen, MousePointerClick } from 'lucide-react';
import PanelCanvas from './PanelCanvas';
import EditorSidePanel from './EditorSidePanel';
import EditorDocumentMenu from './EditorDocumentMenu';
import { supabase } from '../../../lib/supabase';
import { usePanelUnit, UnitToggle } from '../usePanelUnit';
import {
  findConflicts, requiredPlate, requiredDepth, heatLoad, suggestEnclosures, fitPlate, snapToRail,
  alignItems, distributeItems, itemBox, overlaps, snap,
  doorGeometry, findDoorConflicts, doorRearDepth, enclosureAsInstalled, isLaidDown,
} from '../../../lib/panel/layout';
import { itemFromSpec, doorItemFromSpec, newRail, newDuct, newFreePiece, newDoorPiece, newId } from '../../../lib/panel/items';
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
  const [view, setView] = useState('plate'); // 'plate' (fond de panneau) | 'door' (porte)
  const [panelOpen, setPanelOpen] = useState(true);
  const [saveState, setSaveState] = useState('saved'); // 'saved' | 'dirty' | 'saving' | 'error' | 'conflict'
  const [saveError, setSaveError] = useState('');
  const [userId, setUserId] = useState(null);
  const [, forceHistory] = useState(0);
  const [notice, setNotice] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);

  const canvasRef = useRef(null);
  const stateRef = useRef({ layout: null, items: [] });
  stateRef.current = { layout, items };
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const lastTag = useRef({ tag: null, at: 0 });
  const versionRef = useRef(1);
  const dirtyCount = useRef(0);
  const savedCount = useRef(0);
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
    if (saving.current || blocked.current) return false;
    const { layout: l, items: its } = stateRef.current;
    if (!l) return false;
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
        return false;
      }
      if (!res.ok || !json.success) throw new Error([json.error, json.details].filter(Boolean).join(' — ') || 'Erreur');
      versionRef.current = json.data.version;
      savedCount.current = snapshot;
      setLayout((cur) => (cur ? { ...cur, version: json.data.version } : cur));
      setSaveError('');
      if (json.warning) setNotice(json.warning);
      if (dirtyCount.current === snapshot) setSaveState('saved');
      else { setSaveState('dirty'); timer.current = setTimeout(doSave, SAVE_DELAY); }
      return true;
    } catch (e) {
      setSaveError(e.message);
      setSaveState('error');
      return false;
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

  /** Attend que tout soit enregistré (versions, envoi à la soumission). false = échec. */
  const ensureSaved = useCallback(async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      clearTimeout(timer.current);
      for (let k = 0; k < 60 && saving.current; k++) await new Promise((r) => setTimeout(r, 150));
      if (dirtyCount.current === savedCount.current) return true;
      // Laisse React publier le dernier état avant de l'envoyer
      await new Promise((r) => setTimeout(r, 30));
      if (!(await doSave()) && !saving.current) return false;
    }
    return dirtyCount.current === savedCount.current;
  }, [doSave]);

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
    // Une disposition approuvée qu'on modifie redevient un brouillon (la version approuvée reste dans l'historique)
    const reopened = cur.layout?.status === 'approved' && !(next.layout && next.layout.status);
    if (reopened) setNotice('Disposition modifiée: elle repasse en brouillon. La version approuvée reste dans « Document → Versions ».');
    if (next.items) setItems(next.items);
    if (next.layout || reopened) setLayout({ ...cur.layout, ...(next.layout || {}), ...(reopened ? { status: 'draft' } : {}) });
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
  const plateItemsAll = useMemo(() => items.filter((i) => i.zone !== 'door'), [items]);
  const doorItemsAll = useMemo(() => items.filter((i) => i.zone === 'door'), [items]);

  // Boîtier retenu, tel qu'installé (debout ou couché), et porte correspondante
  const enclosure = useMemo(
    () => library.find((s) => s.kind === 'enclosure' && s.product_code === layout?.enclosure_code) || null,
    [library, layout?.enclosure_code]
  );
  const installed = useMemo(
    () => (enclosure ? enclosureAsInstalled(enclosure, layout?.orientation) : null),
    [enclosure, layout?.orientation]
  );
  const door = useMemo(() => doorGeometry(plate, installed?.ext), [plate, installed]);
  const usableDepth = enclosure && n(enclosure.usable_depth_mm) > 0 ? n(enclosure.usable_depth_mm) : null;

  const platePendingIds = useMemo(() => {
    const plateBox = { x: 0, y: 0, w: plate.w, h: plate.h };
    return plateItemsAll.filter((i) => !overlaps(itemBox(i), plateBox)).map((i) => i.id);
  }, [plateItemsAll, plate]);
  const doorPendingIds = useMemo(() => {
    const doorBox = { x: 0, y: 0, w: door.w, h: door.h };
    return doorItemsAll.filter((i) => !overlaps(itemBox(i), doorBox)).map((i) => i.id);
  }, [doorItemsAll, door]);
  const pendingIds = useMemo(() => [...platePendingIds, ...doorPendingIds], [platePendingIds, doorPendingIds]);

  const placed = useMemo(() => {
    const pending = new Set(platePendingIds);
    return plateItemsAll.filter((i) => !pending.has(i.id));
  }, [plateItemsAll, platePendingIds]);
  const doorPlaced = useMemo(() => {
    const pending = new Set(doorPendingIds);
    return doorItemsAll.filter((i) => !pending.has(i.id));
  }, [doorItemsAll, doorPendingIds]);

  const report = useMemo(() => findConflicts(placed, plate), [placed, plate]);
  const doorReport = useMemo(() => findDoorConflicts(doorPlaced, placed, door, usableDepth), [doorPlaced, placed, door, usableDepth]);
  const result = useMemo(() => {
    if (!layout) return null;
    const need = requiredPlate(placed, n(layout.margin_mm, 15), n(layout.spare_percent));
    const doorRear = Math.max(n(layout.door_rear_depth_mm), doorRearDepth(doorPlaced));
    const depth = requiredDepth(placed, doorRear);
    const heat = heatLoad(placed);
    const enclosures = library.filter((s) => s.kind === 'enclosure');
    const suggestions = need
      ? suggestEnclosures(enclosures, need, depth, { w: n(layout.avail_width_mm), h: n(layout.avail_height_mm), d: n(layout.avail_depth_mm) })
      : { fits: [], rejected: [], incomplete: enclosures.filter((e) => e.status === 'missing') };
    return { need, depth, doorRear, heat, suggestions, enclosureCount: enclosures.length };
  }, [placed, doorPlaced, layout, library]);

  const viewRef = useRef(view);
  viewRef.current = view;
  const doorRef = useRef(door);
  doorRef.current = door;
  const libraryRef = useRef(library);
  libraryRef.current = library;

  // ----- Actions sur les pièces -----
  /**
   * Change la taille du fond (et, au besoin, le boîtier / l'orientation).
   * - Les pièces « à placer » à droite ou sous le fond suivent le bord, pour ne pas se
   *   retrouver sur le fond par accident.
   * - La porte change avec le boîtier: les pièces de porte déjà placées restent devant les
   *   mêmes pièces du fond; celles « à placer » suivent le bord droit de la porte.
   */
  const setPlate = useCallback((w, h, extraLayout = {}, nextItems = null) => {
    const cur = stateRef.current;
    const oldW = n(cur.layout.plate_width_mm, 600);
    const dw = w - oldW;
    const dh = h - n(cur.layout.plate_height_mm, 600);
    const nextLayout = { ...cur.layout, ...extraLayout };
    const nextEnclosure = libraryRef.current.find((s) => s.kind === 'enclosure' && s.product_code === nextLayout.enclosure_code);
    const oldDoor = doorRef.current;
    const newDoor = doorGeometry({ w, h }, nextEnclosure ? enclosureAsInstalled(nextEnclosure, nextLayout.orientation).ext : null);
    const r1 = (v) => Math.round(v * 10) / 10;
    const moved = (nextItems || cur.items).map((i) => {
      const pending = pendingIdsRef.current.has(i.id);
      if (i.zone === 'door') {
        if (!pending) return { ...i, x: r1(i.x + newDoor.plateX - oldDoor.plateX), y: r1(i.y + newDoor.plateY - oldDoor.plateY) };
        return i.x >= oldDoor.w ? { ...i, x: r1(i.x + newDoor.w - oldDoor.w) } : i;
      }
      if (!pending) return i;
      if (i.x >= oldW) return { ...i, x: r1(i.x + dw) };
      return { ...i, y: r1(i.y + dh) };
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
    const step0 = n(stateRef.current.layout?.snap_mm, 5);
    if (spec.mounting === 'door') {
      // Pièce de porte: va sur la porte (au centre de la vue si on y est déjà, sinon au centre de la porte)
      const item = doorItemFromSpec(spec, { description: spec.description });
      const onDoor = viewRef.current === 'door';
      const c = x != null && onDoor ? { x: x + item.w / 2, y: y + item.h / 2 }
        : onDoor ? dropPoint() : { x: doorRef.current.w / 2, y: doorRef.current.h / 2 };
      addItem({ ...item, x: snap(c.x - item.w / 2, step0), y: snap(c.y - item.h / 2, step0) });
      setView('door');
      return;
    }
    if (viewRef.current === 'door') setView('plate');
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
    const isDoor = spec.mounting === 'door';
    const plateW = isDoor ? doorRef.current.w : n(cur.layout.plate_width_mm, 600);
    const startY = cur.items
      .filter((i) => (i.zone === 'door') === isDoor && pendingIdsRef.current.has(i.id) && i.x >= plateW)
      .reduce((max, i) => Math.max(max, itemBox(i).y + itemBox(i).h + 20), 0);
    const added = [];
    let x = plateW + 40;
    setView(isDoor ? 'door' : 'plate');
    for (let k = 0; k < Math.max(1, count); k++) {
      const item = isDoor
        ? doorItemFromSpec(spec, { description: spec.description })
        : itemFromSpec(spec, { description: spec.description, quantity });
      added.push({ ...item, x, y: startY });
      x += item.w + 15;
    }
    change({ items: [...cur.items, ...added] });
    setSelectedIds(added.map((a) => a.id));
    setTimeout(() => canvasRef.current?.fit(), 150);
  }, [change]);

  const addBasic = useCallback((type) => {
    const p = dropPoint();
    if (type === 'rail') addItem(newRail(p.x - 150, p.y));
    else if (type === 'duct-h') addItem(newDuct(p.x - 150, p.y, false));
    else if (type === 'duct-v') addItem(newDuct(p.x, p.y - 150, true));
    else if (type === 'door-free') addItem(newDoorPiece(p.x, p.y));
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
    // Boîtier couché: on garde le côté déjà choisi (gauche / droit), sinon côté gauche par défaut
    const orientation = fit.orientation === 'landscape'
      ? (layout.orientation === 'side_right' ? 'side_right' : 'side_left') : 'portrait';
    setPlate(fit.plate.w, fit.plate.h, { enclosure_code: fit.enclosure.product_code, orientation });
    setTimeout(() => canvasRef.current?.fit(), 50);
  };

  /** Debout ↔ couché: la largeur et la hauteur du fond permutent (les pièces restent droites). */
  const setOrientation = (orientation) => {
    if (orientation === layout.orientation) return;
    if (isLaidDown(orientation) !== isLaidDown(layout.orientation)) {
      setPlate(plate.h, plate.w, { orientation });
      setTimeout(() => canvasRef.current?.fit(), 50);
    } else {
      change({ layout: { orientation } });
    }
  };

  const clearEnclosure = () => change({ layout: { enclosure_code: null } });

  const toggleStatus = () => {
    const approved = layout.status === 'approved';
    if (!approved && (report.messages.length + doorReport.messages.length > 0)
      && !window.confirm(`Il reste ${report.messages.length + doorReport.messages.length} conflit(s). Approuver quand même ?`)) return;
    setNotice(approved ? '' : 'Disposition approuvée: une copie est gardée dans « Document → Versions ».');
    setSetting({ status: approved ? 'draft' : 'approved' }, 'status');
  };

  /** Restaure une version (historique). Reste annulable pour le fond, les pièces, le boîtier et l'orientation. */
  const restoreVersion = (snapshot) => {
    const keep = ['plate_width_mm', 'plate_height_mm', 'enclosure_code', 'orientation', 'hinge_side', 'margin_mm', 'spare_percent',
      'door_rear_depth_mm', 'avail_width_mm', 'avail_height_mm', 'avail_depth_mm', 'delta_t', 'snap_mm', 'notes'];
    const patch = {};
    keep.forEach((k) => { if (Object.prototype.hasOwnProperty.call(snapshot, k)) patch[k] = snapshot[k]; });
    setSelectedIds([]);
    change({ items: Array.isArray(snapshot.items) ? snapshot.items : [], layout: patch });
    setNotice('Version restaurée. Ctrl+Z pour revenir en arrière.');
    setTimeout(() => canvasRef.current?.fit(), 80);
  };

  const makePdf = async (planFormat) => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const { generatePanelLayoutPDF } = await import('../PanelLayoutPDF');
      await generatePanelLayoutPDF({
        layout: { ...layout, version: versionRef.current }, plateItems: placed, doorItems: doorPlaced,
        pendingCount: pendingIds.length, plate, door, result, report, doorReport, enclosure, installed, planFormat,
      });
    } catch (e) {
      console.error('PDF disposition:', e);
      window.alert(`Le PDF n'a pas pu être généré: ${e.message}`);
    } finally {
      setPdfBusy(false);
    }
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
      if (ctrl && key === 'a') {
        e.preventDefault();
        setSelectedIds(stateRef.current.items.filter((i) => (i.zone === 'door') === (viewRef.current === 'door')).map((i) => i.id));
        return;
      }
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

  const inDoor = view === 'door';
  const activeReport = inDoor ? doorReport : report;
  const activePending = inDoor ? doorPendingIds : platePendingIds;
  const conflictCount = report.messages.length + doorReport.messages.length;
  const activeCount = activeReport.messages.length;
  const otherCount = conflictCount - activeCount;
  const switchView = (v) => { if (v !== view) { setSelectedIds([]); setView(v); } };
  const best = result?.suggestions.fits[0];
  const retainedFits = !result?.need || result.suggestions.fits.some((f) => f.enclosure.product_code === layout.enclosure_code);
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
        <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden" role="group" aria-label="Vue">
          {[['plate', 'Fond'], ['door', `Porte${doorItemsAll.length ? ` (${doorItemsAll.length})` : ''}`]].map(([v, l]) => (
            <button
              key={v} type="button" onClick={() => switchView(v)} aria-pressed={view === v}
              className={`px-3 min-h-[44px] text-sm font-medium ${view === v ? 'bg-teal-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              {l}
            </button>
          ))}
        </div>
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
        <EditorDocumentMenu
          layout={layout} layoutId={layoutId} userId={userId} pdfBusy={pdfBusy}
          canSendEnclosure={!!layout.submission_id && !!layout.enclosure_code}
          onPdf={makePdf} onToggleStatus={toggleStatus} onRestore={restoreVersion} ensureSaved={ensureSaved}
        />
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

      {notice && (
        <div className="px-3 py-1.5 text-sm bg-teal-50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200 border-b border-teal-200 dark:border-teal-900 flex items-center gap-3 flex-shrink-0">
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice('')} className="min-h-[32px] px-2 underline text-sm">Fermer</button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        {/* Plan + ligne d'alertes */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0">
            <PanelCanvas
              key={view}
              ref={canvasRef}
              items={inDoor ? doorItemsAll : plateItemsAll}
              plate={inDoor ? { w: door.w, h: door.h } : plate}
              report={activeReport}
              selectedIds={selectedIds} pendingIds={activePending}
              unit={unit} snapMm={n(layout.snap_mm, 5)} multiMode={multiMode}
              frameName={inDoor ? (door.estimated ? 'Porte estimée (aucun boîtier retenu)' : 'Porte') : 'Fond'}
              ghost={inDoor ? { items: placed, x: door.plateX, y: door.plateY, w: plate.w, h: plate.h } : null}
              enclosureLabel={layout.enclosure_code ? `boîtier ${layout.enclosure_code}${isLaidDown(layout.orientation) ? ' (couché)' : ''}` : ''}
              onSelect={setSelectedIds}
              onMove={(ids, dx, dy) => moveItems(ids, dx, dy)}
              onDropSpec={(code, x, y) => { const spec = library.find((s) => s.product_code === code); if (spec) addFromSpec(spec, x, y); }}
            />
          </div>
          <div
            className={`flex-shrink-0 px-3 py-1.5 text-xs border-t overflow-x-auto whitespace-nowrap ${
              activeCount ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
            }`}
          >
            {activeCount ? (
              <span style={{ color: '#c8371e' }} className="font-medium">
                {activeCount} conflit{activeCount > 1 ? 's' : ''}: {activeReport.messages.slice(0, 6).join(' · ')}{activeCount > 6 ? ' …' : ''}
              </span>
            ) : (
              <span className="text-green-700 dark:text-green-400">Aucun conflit {inDoor ? 'sur la porte' : 'sur le fond'}.</span>
            )}
            {otherCount > 0 && (
              <button type="button" onClick={() => switchView(inDoor ? 'plate' : 'door')} className="ml-3 underline font-medium" style={{ color: '#c8371e' }}>
                {otherCount} conflit{otherCount > 1 ? 's' : ''} {inDoor ? 'sur le fond' : 'sur la porte'}
              </button>
            )}
            {activePending.length > 0 && <span className="ml-3 text-gray-600 dark:text-gray-300">{activePending.length} à placer</span>}
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
                <div className="text-teal-800 dark:text-teal-300">{layout.enclosure_code ? 'Boîtier retenu' : 'Boîtier suggéré'}</div>
                {layout.enclosure_code ? (
                  <div className="font-semibold text-sm truncate" style={retainedFits ? undefined : { color: '#c8371e' }} title={retainedFits ? '' : 'Le boîtier retenu ne convient plus (voir l\'onglet Boîtier)'}>
                    {layout.enclosure_code}{retainedFits ? '' : ' — ne convient plus'}
                  </div>
                ) : (
                  <div className="font-semibold text-sm truncate" title={best?.enclosure.description || ''}>{best ? best.enclosure.product_code : (result?.need ? 'Aucun' : '—')}</div>
                )}
              </div>
              <div>
                <div className="text-teal-800 dark:text-teal-300">Conflits</div>
                <div className="font-semibold text-sm" style={conflictCount ? { color: '#c8371e' } : undefined}>{conflictCount}</div>
              </div>
            </div>
            <EditorSidePanel
              layout={layout} items={items} plate={plate} library={library} unit={unit} userId={userId}
              selectedIds={selectedIds} pendingIds={pendingIds} result={result} report={report}
              view={view} door={door} doorReport={doorReport} doorPendingIds={doorPendingIds}
              enclosure={enclosure} installed={installed} usableDepth={usableDepth}
              onSetView={switchView} onSetOrientation={setOrientation} onClearEnclosure={clearEnclosure}
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
