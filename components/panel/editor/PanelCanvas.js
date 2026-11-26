/**
 * @file components/panel/editor/PanelCanvas.js
 * @description Panneau virtuel — le PLAN à l'échelle (SVG) de l'éditeur de disposition.
 *              SVG plutôt que canvas: 200 pièces = 200 rectangles (léger), hachures et
 *              pointillés natifs, zoom net à toute échelle, et chaque pièce reste un
 *              élément cliquable / survolable.
 *              - Fond de panneau gris pâle, grille de 25 mm, règles (mm ou po) sur les bords
 *              - Pièces « puissance » foncées, « contrôle » blanches, goulottes hachurées,
 *                rails métal; dégagements en pointillé; conflits en rouge brique (#c8371e)
 *              - Glisser-déposer (souris ET doigt) avec aimantation; sélection multiple
 *                (Maj-clic, rectangle à la souris, ou mode « Multi » au doigt)
 *              - Zoom: molette ou pincer; déplacement: glisser dans le vide au doigt,
 *                bouton du milieu / clic droit / Espace + glisser à la souris
 *              - Survol: N° de pièce, description, dimensions, source, note
 *              - Les pièces hors du fond (zone « à placer ») sont affichées en plus pâle
 *              Le composant ne modifie rien lui-même: il appelle onMove / onSelect / onDropSpec.
 * @version 1.1.0
 * @date 2026-11-26
 * @changelog
 *   1.1.0 - Vue « Porte »: cadre nommé (frameName), fond de panneau et ses pièces en filigrane derrière
 *           la porte (ghost); photo du produit dans l'infobulle de survol (chargée après 0,4 s, mise en cache)
 *   1.0.0 - Version initiale (Panneau virtuel PR 2)
 */
import React, { useRef, useState, useEffect, useLayoutEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { itemBox, clearanceBox, hasClearance, isPiece, bodyWidthOf, railUsage, snap, overlaps } from '../../../lib/panel/layout';
import { formatLength, labelOf, PANEL_SOURCES, MM_PER_INCH } from '../../../lib/panel/specs';

const CONFLICT = '#c8371e';
const SELECT = '#2563eb';
const RULER = 22;       // épaisseur des règles (px)
const MIN_SCALE = 0.05; // px par mm
const MAX_SCALE = 12;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Photos des fiches: une requête par code, gardée 45 min (l'URL signée vit 1 h)
const photoCache = new Map();
const PHOTO_TTL = 45 * 60 * 1000;

/** Photo (face, sinon 3 faces) d'un produit survolé; null tant qu'elle n'est pas chargée ou s'il n'y en a pas. */
function useHoverPhoto(code) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    setUrl(null);
    if (!code) return undefined;
    const cached = photoCache.get(code);
    if (cached && Date.now() - cached.at < PHOTO_TTL) { setUrl(cached.url); return undefined; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/panel-specs?code=${encodeURIComponent(code)}`);
        const json = await res.json();
        const found = res.ok && json.success && json.spec ? (json.spec.photo_front_url || json.spec.photo_iso_url || null) : null;
        photoCache.set(code, { url: found, at: Date.now() });
        if (!cancelled) setUrl(found);
      } catch (e) {
        /* pas de photo: l'infobulle reste en texte */
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [code]);
  return url;
}

function rulerStep(scale, unit) {
  // pas « rond » d'au moins ~60 px à l'écran
  const steps = unit === 'in'
    ? [0.25, 0.5, 1, 2, 4, 6, 12, 24, 48].map((v) => v * MM_PER_INCH)
    : [5, 10, 25, 50, 100, 200, 250, 500, 1000];
  return steps.find((s) => s * scale >= 60) || steps[steps.length - 1];
}

const PanelCanvas = forwardRef(function PanelCanvas({
  items, plate, report, selectedIds, pendingIds, unit, snapMm, multiMode,
  onSelect, onMove, onDropSpec, enclosureLabel, frameName = 'Fond', ghost = null,
}, ref) {
  const wrapRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ scale: 1, tx: 60, ty: 60 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [drag, setDrag] = useState(null);       // { ids, dx, dy } pendant un glisser
  const [marquee, setMarquee] = useState(null); // { x0, y0, x1, y1 } en mm
  const [hover, setHover] = useState(null);     // { id, x, y } (px dans le conteneur)
  const gesture = useRef(null);
  const pointers = useRef(new Map());
  const spaceHeld = useRef(false);
  const fitted = useRef(false);

  // ----- Taille du conteneur -----
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // ----- Ajuster la vue: fond + toutes les pièces (zone « à placer » comprise) -----
  const fit = useCallback(() => {
    let x0 = 0; let y0 = 0; let x1 = plate.w; let y1 = plate.h;
    items.forEach((i) => {
      const b = hasClearance(i) ? clearanceBox(i) : itemBox(i);
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
    });
    const pad = 24;
    const availW = Math.max(50, size.w - RULER - 2 * pad);
    const availH = Math.max(50, size.h - RULER - 2 * pad);
    const scale = clamp(Math.min(availW / (x1 - x0), availH / (y1 - y0)), MIN_SCALE, MAX_SCALE);
    setView({
      scale,
      tx: RULER + pad + (availW - (x1 - x0) * scale) / 2 - x0 * scale,
      ty: RULER + pad + (availH - (y1 - y0) * scale) / 2 - y0 * scale,
    });
  }, [items, plate.w, plate.h, size.w, size.h]);

  useImperativeHandle(ref, () => ({
    fit,
    /** Centre de la zone visible, en mm (pour déposer une nouvelle pièce) */
    viewCenter: () => {
      const v = viewRef.current;
      return { x: (size.w / 2 - v.tx) / v.scale, y: (size.h / 2 - v.ty) / v.scale };
    },
  }), [fit, size.w, size.h]);

  // Premier affichage: ajuster une fois que la taille réelle est connue
  useEffect(() => {
    if (fitted.current || size.w < 100 || size.h < 100) return;
    fitted.current = true;
    fit();
  }, [size.w, fit]);

  const toMm = useCallback((clientX, clientY) => {
    const rect = wrapRef.current.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - rect.left - v.tx) / v.scale, y: (clientY - rect.top - v.ty) / v.scale };
  }, []);

  const zoomAt = useCallback((clientX, clientY, factor) => {
    const rect = wrapRef.current.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    setView((v) => {
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const k = scale / v.scale;
      return { scale, tx: px - (px - v.tx) * k, ty: py - (py - v.ty) * k };
    });
  }, []);

  // ----- Molette (écouteur non passif pour pouvoir bloquer le défilement) -----
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // ----- Espace = main pour déplacer la vue -----
  useEffect(() => {
    const typing = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    const down = (e) => { if (e.code === 'Space' && !typing(e.target)) { spaceHeld.current = true; e.preventDefault(); } };
    const up = (e) => { if (e.code === 'Space') spaceHeld.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // ----- Pointeurs -----
  const onPointerDown = (e) => {
    setHover(null);
    wrapRef.current.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Deuxième doigt: pincer pour zoomer (annule le geste en cours)
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { type: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      setDrag(null); setMarquee(null);
      return;
    }

    const id = e.target.closest?.('[data-item]')?.getAttribute('data-item') || null;
    const wantsPan = e.button === 1 || e.button === 2 || spaceHeld.current;
    if (wantsPan || (!id && e.pointerType !== 'mouse')) {
      gesture.current = { type: 'pan', sx: e.clientX, sy: e.clientY, tx: view.tx, ty: view.ty, moved: false, tapEmpty: !id };
      return;
    }
    if (id) {
      const additive = e.shiftKey || multiMode;
      let ids = selectedIds;
      if (additive) {
        ids = selectedIds.includes(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id];
        onSelect(ids);
      } else if (!selectedIds.includes(id)) {
        ids = [id];
        onSelect(ids);
      }
      if (ids.includes(id)) {
        gesture.current = { type: 'drag', id, ids, sx: e.clientX, sy: e.clientY, moved: false };
      }
      return;
    }
    const p = toMm(e.clientX, e.clientY);
    gesture.current = { type: 'marquee', x0: p.x, y0: p.y, additive: e.shiftKey, moved: false };
  };

  const onPointerMove = (e) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;

    if (g.type === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (g.dist > 0) zoomAt(mid.x, mid.y, dist / g.dist);
      setView((v) => ({ ...v, tx: v.tx + (mid.x - g.mid.x), ty: v.ty + (mid.y - g.mid.y) }));
      g.dist = dist; g.mid = mid;
      return;
    }
    if (g.type === 'pan') {
      const dx = e.clientX - g.sx; const dy = e.clientY - g.sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) g.moved = true;
      setView((v) => ({ ...v, tx: g.tx + dx, ty: g.ty + dy }));
      return;
    }
    if (g.type === 'drag') {
      const rawX = (e.clientX - g.sx) / view.scale;
      const rawY = (e.clientY - g.sy) / view.scale;
      if (!g.moved && Math.abs(e.clientX - g.sx) + Math.abs(e.clientY - g.sy) < 4) return;
      g.moved = true;
      // L'aimantation s'applique à la pièce saisie; les autres gardent leur écart
      const lead = items.find((i) => i.id === g.id);
      const dx = lead ? snap(lead.x + rawX, snapMm) - lead.x : rawX;
      const dy = lead ? snap(lead.y + rawY, snapMm) - lead.y : rawY;
      setDrag({ ids: g.ids, dx, dy });
      return;
    }
    if (g.type === 'marquee') {
      const p = toMm(e.clientX, e.clientY);
      g.moved = true;
      setMarquee({ x0: Math.min(g.x0, p.x), y0: Math.min(g.y0, p.y), x1: Math.max(g.x0, p.x), y1: Math.max(g.y0, p.y) });
    }
  };

  const endPointer = (e) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (!g) return;
    if (g.type === 'pinch') {
      if (pointers.current.size < 2) gesture.current = null;
      return;
    }
    gesture.current = null;
    if (g.type === 'drag') {
      if (g.moved && drag) onMove(drag.ids, drag.dx, drag.dy);
      setDrag(null);
    } else if (g.type === 'marquee') {
      if (g.moved && marquee) {
        const box = { x: marquee.x0, y: marquee.y0, w: marquee.x1 - marquee.x0, h: marquee.y1 - marquee.y0 };
        const hit = items.filter((i) => overlaps(itemBox(i), box)).map((i) => i.id);
        onSelect(g.additive ? [...new Set([...selectedIds, ...hit])] : hit);
      } else if (!g.additive) {
        onSelect([]);
      }
      setMarquee(null);
    } else if (g.type === 'pan' && !g.moved && g.tapEmpty && !multiMode) {
      onSelect([]);
    }
  };

  // ----- Dépôt d'une pièce glissée depuis la bibliothèque (souris) -----
  const onDrop = (e) => {
    const code = e.dataTransfer.getData('text/panel-code');
    if (!code) return;
    e.preventDefault();
    const p = toMm(e.clientX, e.clientY);
    onDropSpec(code, p.x, p.y);
  };

  // ----- Rendu -----
  const { scale, tx, ty } = view;
  const px = (n) => n / scale; // n pixels écran exprimés en mm
  const selected = new Set(selectedIds);
  const pending = new Set(pendingIds);
  const dragging = drag ? new Set(drag.ids) : null;
  const offset = (i) => (dragging && dragging.has(i.id) ? { x: drag.dx, y: drag.dy } : { x: 0, y: 0 });

  // Ordre: goulottes, rails, puis pièces (les pièces sont posées sur les rails)
  const order = { duct: 0, rail: 1, free: 2, component: 2 };
  const sorted = [...items].sort((a, b) => order[a.kind] - order[b.kind]);

  const step = rulerStep(scale, unit);
  const ticks = (len, t) => {
    const out = [];
    const start = Math.floor((-t / scale) / step) * step;
    for (let v = start; v * scale + t < len; v += step) out.push(v);
    return out;
  };
  const tickLabel = (mm) => (unit === 'in' ? (mm / MM_PER_INCH).toLocaleString('fr-CA', { maximumFractionDigits: 2 }) : Math.round(mm).toLocaleString('fr-CA'));

  const hovered = hover ? items.find((i) => i.id === hover.id) : null;
  const hoverPhoto = useHoverPhoto(hovered && !drag ? hovered.product_id : null);

  return (
    <div
      ref={wrapRef}
      className="relative w-full h-full overflow-hidden bg-gray-300 dark:bg-gray-950 select-none"
      style={{ touchAction: 'none', cursor: drag ? 'grabbing' : 'default' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onContextMenu={(e) => e.preventDefault()}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('text/panel-code')) e.preventDefault(); }}
      onDrop={onDrop}
    >
      <svg width={size.w} height={size.h} className="block">
        <defs>
          <pattern id="pv-grid" width="25" height="25" patternUnits="userSpaceOnUse">
            <path d="M 25 0 L 0 0 0 25" fill="none" stroke="#b6bcc6" strokeWidth={px(0.6)} />
          </pattern>
          <pattern id="pv-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#d7dbe2" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#8b93a1" strokeWidth="1.6" />
          </pattern>
          <pattern id="pv-rail" width="12.5" height="12.5" patternUnits="userSpaceOnUse">
            <rect width="12.5" height="12.5" fill="#aeb4be" />
            <rect x="3.5" y="4.5" width="5.5" height="3.5" rx="1.5" fill="#7c838f" />
          </pattern>
        </defs>

        <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
          {/* Fond de panneau */}
          <rect x="0" y="0" width={plate.w} height={plate.h} fill={ghost ? '#dde1e8' : '#e8eaee'} />
          <rect x="0" y="0" width={plate.w} height={plate.h} fill="url(#pv-grid)" />
          <rect x="0" y="0" width={plate.w} height={plate.h} fill="none" stroke="#4b5563" strokeWidth={px(1.5)} />
          <text x="0" y={-px(6)} fontSize={px(11)} className="fill-gray-700 dark:fill-gray-300">
            {frameName} {formatLength(plate.w, unit)} × {formatLength(plate.h, unit)}{enclosureLabel ? ` — ${enclosureLabel}` : ''}
          </text>

          {/* Vue Porte: le fond de panneau et ses pièces, en filigrane derrière la porte */}
          {ghost && (
            <g pointerEvents="none">
              <rect
                x={ghost.x} y={ghost.y} width={ghost.w} height={ghost.h} fill="#eef0f3"
                stroke="#6b7280" strokeWidth={px(1)} strokeDasharray={`${px(6)} ${px(4)}`}
              />
              {ghost.items.map((g) => {
                const b = itemBox(g);
                return (
                  <rect
                    key={`g-${g.id}`} x={ghost.x + b.x} y={ghost.y + b.y} width={b.w} height={b.h}
                    fill={g.kind === 'duct' || g.kind === 'rail' ? '#c9ced6' : '#9aa1ad'} opacity={g.kind === 'duct' || g.kind === 'rail' ? 0.35 : 0.5}
                  />
                );
              })}
              <text x={ghost.x + px(4)} y={ghost.y + px(13)} fontSize={px(10)} fill="#4b5563">Fond de panneau (derrière la porte)</text>
            </g>
          )}

          {/* Dégagements (pointillé) */}
          {sorted.filter((i) => isPiece(i) && hasClearance(i)).map((i) => {
            const c = clearanceBox(i);
            const o = offset(i);
            const bad = report.badClearance.has(i.id);
            return (
              <rect
                key={`c-${i.id}`} x={c.x + o.x} y={c.y + o.y} width={c.w} height={c.h} pointerEvents="none"
                fill={bad ? CONFLICT : 'none'} fillOpacity={bad ? 0.08 : 0}
                stroke={bad ? CONFLICT : '#6b7280'} strokeWidth={px(1)} strokeDasharray={`${px(5)} ${px(4)}`}
                opacity={pending.has(i.id) ? 0.45 : 1}
              />
            );
          })}

          {/* Pièces, rails, goulottes */}
          {sorted.map((i) => {
            const b = itemBox(i);
            const o = offset(i);
            const bad = report.bad.has(i.id);
            const sel = selected.has(i.id);
            const power = i.cat === 'power';
            const wPx = b.w * scale; const hPx = b.h * scale;
            let fill = '#ffffff'; let textFill = '#111827'; let stroke = '#374151';
            if (i.kind === 'duct') { fill = 'url(#pv-hatch)'; stroke = '#6b7280'; }
            else if (i.kind === 'rail') { fill = 'url(#pv-rail)'; stroke = '#6b7280'; }
            else if (power) { fill = '#374151'; textFill = '#ffffff'; stroke = '#111827'; }
            if (bad) stroke = CONFLICT;
            const vertText = wPx < 46 && hPx > wPx;
            const usage = i.kind === 'rail' ? railUsage(i, items.filter((x) => !pending.has(x.id))) : null;
            let label = i.label;
            if (i.repeated) label = `${i.label} (${i.qty})`;
            const room = vertText ? hPx : wPx;
            const maxChars = Math.floor(room / 6.2);
            const shown = maxChars >= 3 && (vertText ? wPx : hPx) >= 11
              ? (label.length > maxChars ? `${label.slice(0, Math.max(1, maxChars - 1))}…` : label) : '';
            const cx = b.x + o.x + b.w / 2; const cy = b.y + o.y + b.h / 2;
            return (
              <g
                key={i.id} data-item={i.id}
                opacity={pending.has(i.id) ? 0.6 : 1}
                style={{ cursor: 'grab' }}
                onPointerEnter={(e) => {
                  if (e.pointerType !== 'mouse' || gesture.current) return;
                  const rect = wrapRef.current.getBoundingClientRect();
                  setHover({ id: i.id, x: e.clientX - rect.left, y: e.clientY - rect.top });
                }}
                onPointerMove={(e) => {
                  if (e.pointerType !== 'mouse' || gesture.current) return;
                  const rect = wrapRef.current.getBoundingClientRect();
                  setHover({ id: i.id, x: e.clientX - rect.left, y: e.clientY - rect.top });
                }}
                onPointerLeave={() => setHover((h) => (h && h.id === i.id ? null : h))}
              >
                <rect
                  x={b.x + o.x} y={b.y + o.y} width={b.w} height={b.h} rx={i.kind === 'rail' ? 0 : px(2)}
                  fill={fill} stroke={stroke} strokeWidth={px(bad ? 2.2 : 1.2)}
                />
                {bad && <rect x={b.x + o.x} y={b.y + o.y} width={b.w} height={b.h} fill={CONFLICT} fillOpacity="0.28" pointerEvents="none" />}
                {i.repeated && i.unit_w > 0 && i.unit_w * scale >= 3 && Array.from({ length: Math.max(0, (i.qty || 1) - 1) }, (_, k) => {
                  const pos = (k + 1) * i.unit_w;
                  return i.rot === 90
                    ? <line key={k} x1={b.x + o.x} x2={b.x + o.x + b.w} y1={b.y + o.y + pos} y2={b.y + o.y + pos} stroke="#9ca3af" strokeWidth={px(0.5)} pointerEvents="none" />
                    : <line key={k} x1={b.x + o.x + pos} x2={b.x + o.x + pos} y1={b.y + o.y} y2={b.y + o.y + b.h} stroke="#9ca3af" strokeWidth={px(0.5)} pointerEvents="none" />;
                })}
                {shown && (
                  <text
                    x={cx} y={cy} fontSize={px(11)} textAnchor="middle" dominantBaseline="central" pointerEvents="none"
                    fill={i.kind === 'duct' || i.kind === 'rail' ? '#1f2937' : textFill}
                    transform={vertText ? `rotate(-90 ${cx} ${cy})` : undefined}
                    style={i.kind === 'duct' || i.kind === 'rail' ? { paintOrder: 'stroke', stroke: '#e8eaee', strokeWidth: px(3) } : undefined}
                  >
                    {shown}
                  </text>
                )}
                {usage && !pending.has(i.id) && (
                  <text
                    x={b.w >= b.h ? b.x + o.x + b.w + px(4) : cx} y={b.w >= b.h ? cy : b.y + o.y + b.h + px(10)}
                    fontSize={px(10)} textAnchor={b.w >= b.h ? 'start' : 'middle'} dominantBaseline="central" pointerEvents="none"
                    fill={usage.ratio > 1 ? CONFLICT : '#1f2937'} fontWeight="600"
                    style={{ paintOrder: 'stroke', stroke: '#e8eaee', strokeWidth: px(3) }}
                  >
                    {Math.round(usage.ratio * 100)} %
                  </text>
                )}
                {sel && (
                  <rect
                    x={b.x + o.x - px(2)} y={b.y + o.y - px(2)} width={b.w + px(4)} height={b.h + px(4)}
                    fill="none" stroke={SELECT} strokeWidth={px(2)} pointerEvents="none"
                  />
                )}
              </g>
            );
          })}

          {marquee && (
            <rect
              x={marquee.x0} y={marquee.y0} width={marquee.x1 - marquee.x0} height={marquee.y1 - marquee.y0}
              fill={SELECT} fillOpacity="0.1" stroke={SELECT} strokeWidth={px(1)} strokeDasharray={`${px(4)} ${px(3)}`} pointerEvents="none"
            />
          )}
        </g>

        {/* Règles (espace écran) */}
        <g pointerEvents="none" className="fill-gray-100 dark:fill-gray-800">
          <rect x="0" y="0" width={size.w} height={RULER} />
          <rect x="0" y="0" width={RULER} height={size.h} />
        </g>
        <g pointerEvents="none" fontSize="10" className="fill-gray-700 dark:fill-gray-300 stroke-gray-500">
          {ticks(size.w, tx).map((v) => {
            const x = v * scale + tx;
            if (x < RULER) return null;
            return (
              <g key={`tx${v}`}>
                <line x1={x} x2={x} y1={RULER - 7} y2={RULER} strokeWidth="1" />
                <text x={x + 3} y={11} stroke="none">{tickLabel(v)}</text>
              </g>
            );
          })}
          {ticks(size.h, ty).map((v) => {
            const y = v * scale + ty;
            if (y < RULER) return null;
            return (
              <g key={`ty${v}`}>
                <line x1={RULER - 7} x2={RULER} y1={y} y2={y} strokeWidth="1" />
                <text x={14} y={y + 3} stroke="none" transform={`rotate(-90 14 ${y + 3})`} textAnchor="end">{tickLabel(v)}</text>
              </g>
            );
          })}
          <rect x="0" y="0" width={RULER} height={RULER} stroke="none" className="fill-gray-200 dark:fill-gray-700" />
          <text x={RULER / 2} y={14} textAnchor="middle" stroke="none" fontSize="9">{unit === 'in' ? 'po' : 'mm'}</text>
        </g>
      </svg>

      {/* Infobulle de survol: N° de pièce + description d'abord */}
      {hovered && !drag && (
        <div
          className="absolute z-10 pointer-events-none max-w-xs rounded-lg shadow-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs text-gray-800 dark:text-gray-100"
          style={{ left: Math.max(4, Math.min(hover.x + 14, size.w - 300)), top: Math.max(4, Math.min(hover.y + 14, size.h - (hoverPhoto ? 240 : 130))) }}
        >
          {hoverPhoto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hoverPhoto} alt="" className="mb-1.5 max-h-24 max-w-full rounded object-contain bg-gray-100 dark:bg-gray-700" />
          )}
          {hovered.product_id && <div className="font-mono font-semibold text-sm">{hovered.product_id}</div>}
          <div className="font-medium">{hovered.description || hovered.label}</div>
          {hovered.description && hovered.label !== hovered.product_id && <div className="text-gray-500 dark:text-gray-400">{hovered.label}</div>}
          <div className="mt-1 text-gray-600 dark:text-gray-300">
            {formatLength(bodyWidthOf(hovered), unit)} × {formatLength(hovered.h, unit)}
            {hovered.d != null && isPiece(hovered) && hovered.zone !== 'door' ? ` × ${formatLength(hovered.d, unit)}` : ''}
            {hovered.zone === 'door' ? ` · arrière ${hovered.rear != null ? formatLength(hovered.rear, unit) : 'à préciser'}` : ''}
            {hovered.repeated ? ` · ${hovered.qty} unités` : ''}
          </div>
          {hovered.kind === 'rail' && (
            <div className="text-gray-500 dark:text-gray-400">
              {Math.round(railUsage(hovered, items.filter((x) => !pending.has(x.id))).ratio * 100)} % de la longueur utilisée
            </div>
          )}
          {isPiece(hovered) && (
            <div className="text-gray-500 dark:text-gray-400">
              {hovered.kind === 'free' ? 'Pièce libre (gabarit)' : `Source: ${labelOf(PANEL_SOURCES, hovered.source) || '—'}`}
              {hovered.watts != null ? ` · ${Number(hovered.watts).toLocaleString('fr-CA')} W` : ''}
              {pending.has(hovered.id) ? ' · à placer' : ''}
            </div>
          )}
          {hovered.note && <div className="mt-1 italic text-gray-500 dark:text-gray-400">{hovered.note}</div>}
        </div>
      )}
    </div>
  );
});

export default PanelCanvas;
