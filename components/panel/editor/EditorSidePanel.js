/**
 * @file components/panel/editor/EditorSidePanel.js
 * @description Panneau virtuel — panneau de droite de l'éditeur (défilement interne).
 *              Onglets:
 *              - « Pièce »: la sélection (nom, mesures, dégagements pour CETTE disposition,
 *                position, rotation, quantité si répétée, note; « Fiche du produit » ouvre
 *                le formulaire de l'Inventaire sans quitter l'éditeur). Sans sélection:
 *                taille du fond, aimantation et boutons + Rail / + Goulotte / + Pièce libre.
 *                Plusieurs pièces: aligner, répartir, dupliquer, supprimer
 *              - « Bibliothèque »: fiches actives (recherche, filtres montage / catégorie),
 *                « + » ou glisser sur le plan; pastille Approx. / Gabarit
 *              - « À placer (n) »: pièces pas encore sur le fond + rapport de l'import
 *                (dimensions manquantes → compléter la fiche puis ajouter; hors fond; ignorées)
 *              - « Boîtier »: réglages, fond requis, profondeur, chaleur, ventilation
 *                (estimation, formule affichée), boîtiers suggérés et « Choisir ce boîtier »
 * @version 1.0.0
 * @date 2026-11-25
 * @changelog
 *   1.0.0 - Version initiale (Panneau virtuel PR 2)
 */
import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Copy, RotateCw, Search, X, FileText, AlertTriangle, Download } from 'lucide-react';
import PanelSpecPanel, { LengthInput, NumberInput } from '../PanelSpecPanel';
import { bodyWidthOf, isPiece, ventilation, describeDeficits } from '../../../lib/panel/layout';
import { isSpecPlaceable } from '../../../lib/panel/items';
import { formatLength, PANEL_MOUNTINGS, PANEL_CATEGORIES, PANEL_SOURCES, labelOf, ON_BACKPLATE_MOUNTINGS } from '../../../lib/panel/specs';

const INPUT =
  'w-full px-3 py-2 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg text-sm ' +
  'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500';
const LABEL = 'block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1';
const BTN =
  'min-h-[44px] px-3 inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 ' +
  'text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40';
const H = 'text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mt-4 mb-2';
const money = (v) => (v == null ? '—' : Number(v).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' }));
const SOURCE_DOT = { approx: 'bg-amber-500', template: 'bg-gray-400' };

function Tab({ id, active, onClick, children }) {
  return (
    <button
      type="button" onClick={() => onClick(id)}
      className={`flex-1 min-h-[44px] px-1 text-xs font-medium border-b-2 ${
        active ? 'border-teal-600 text-teal-700 dark:text-teal-300' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
      }`}
    >
      {children}
    </button>
  );
}

// ---------- Onglet Pièce ----------
function PieceTab(p) {
  const { items, selectedIds, unit, layout, plate } = p;
  const selection = items.filter((i) => selectedIds.includes(i.id));

  if (selection.length === 0) {
    return (
      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Touchez une pièce pour la modifier. Glissez-la pour la déplacer; flèches = 1 mm, Maj + flèches = 10 mm.
        </p>
        <div className={H}>Ajouter</div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={BTN} onClick={() => p.onAddBasic('rail')}><Plus className="w-4 h-4" /> Rail DIN</button>
          <button type="button" className={BTN} onClick={() => p.onAddBasic('free')}><Plus className="w-4 h-4" /> Pièce libre</button>
          <button type="button" className={BTN} onClick={() => p.onAddBasic('duct-h')}><Plus className="w-4 h-4" /> Goulotte horiz.</button>
          <button type="button" className={BTN} onClick={() => p.onAddBasic('duct-v')}><Plus className="w-4 h-4" /> Goulotte vert.</button>
        </div>
        <div className={H}>Fond de panneau</div>
        <div className="grid grid-cols-2 gap-2">
          <LengthInput label="Largeur" valueMm={plate.w} unit={unit} onChangeMm={(v) => v > 0 && p.onSetPlate(v, plate.h)} />
          <LengthInput label="Hauteur" valueMm={plate.h} unit={unit} onChangeMm={(v) => v > 0 && p.onSetPlate(plate.w, v)} />
          <LengthInput label="Aimantation" valueMm={Number(layout.snap_mm)} unit={unit} onChangeMm={(v) => p.onSetting({ snap_mm: v ?? 0 }, 'snap')} hint="0 = libre" />
        </div>
        <button type="button" className={`${BTN} w-full mt-2`} onClick={p.onFitPlate}>Ajuster le fond aux pièces</button>
      </div>
    );
  }

  if (selection.length > 1) {
    return (
      <div>
        <p className="text-sm font-medium">{selection.length} éléments sélectionnés</p>
        <div className={H}>Aligner</div>
        <div className="grid grid-cols-3 gap-2">
          {[['left', 'Gauche'], ['center-x', 'Centre ↔'], ['right', 'Droite'], ['top', 'Haut'], ['center-y', 'Centre ↕'], ['bottom', 'Bas']].map(([m, l]) => (
            <button key={m} type="button" className={BTN} onClick={() => p.onAlign(m)}>{l}</button>
          ))}
        </div>
        <div className={H}>Répartir (3 pièces et plus)</div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={BTN} disabled={selection.length < 3} onClick={() => p.onDistribute('x')}>Horizontalement</button>
          <button type="button" className={BTN} disabled={selection.length < 3} onClick={() => p.onDistribute('y')}>Verticalement</button>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button type="button" className={BTN} onClick={p.onDuplicate}><Copy className="w-4 h-4" /> Dupliquer</button>
          <button type="button" className={`${BTN} text-red-700 dark:text-red-400 border-red-300 dark:border-red-700`} onClick={p.onRemove}><Trash2 className="w-4 h-4" /> Supprimer</button>
        </div>
      </div>
    );
  }

  const i = selection[0];
  const piece = isPiece(i);
  const set = (patch, field) => p.onUpdateItems([i.id], patch, `${i.id}:${field}`);
  const c = i.c || [0, 0, 0, 0];
  const setC = (k, v) => { const next = [...c]; next[k] = v ?? 0; set({ c: next }, `c${k}`); };
  const linear = i.kind === 'rail' || i.kind === 'duct';
  const spec = i.product_id ? p.library.find((s) => s.product_code === i.product_id) : null;

  return (
    <div>
      {i.product_id && (
        <div className="mb-2">
          <div className="font-mono font-semibold">{i.product_id}</div>
          {i.description && <div className="text-xs text-gray-600 dark:text-gray-300">{i.description}</div>}
          <div className="text-[11px] text-gray-500 dark:text-gray-400">
            Source: {labelOf(PANEL_SOURCES, i.source) || '—'}{p.pendingIds.includes(i.id) ? ' · à placer (hors du fond)' : ''}
          </div>
          <button type="button" className={`${BTN} mt-2 w-full`} onClick={() => p.onOpenSpec(i.product_id, i.description)}>
            <FileText className="w-4 h-4" /> Fiche du produit
          </button>
          {spec && isSpecPlaceable(spec) && (
            <button
              type="button" className={`${BTN} mt-2 w-full`} title="Remplace les mesures et dégagements de cette pièce par ceux de la fiche"
              onClick={() => set({
                w: Number(spec.width_mm) || i.w, h: Number(spec.height_mm), d: Number(spec.depth_mm),
                unit_w: spec.is_repeated ? Number(spec.unit_width_mm) : null, repeated: !!spec.is_repeated,
                qty: spec.is_repeated ? (i.qty || spec.default_quantity || 1) : null,
                c: [spec.clearance_top_mm, spec.clearance_bottom_mm, spec.clearance_left_mm, spec.clearance_right_mm].map((v) => Number(v) || 0),
                vertical: !!spec.must_stay_vertical, group: spec.stack_group || null, mounting: spec.mounting,
                watts: spec.heat_loss_w == null ? null : Number(spec.heat_loss_w), cat: spec.visual_category, source: spec.source,
              }, 'fromspec')}
            >
              <Download className="w-4 h-4" /> Reprendre les mesures de la fiche
            </button>
          )}
        </div>
      )}

      <label className={LABEL}>Nom sur le plan</label>
      <input
        type="text" value={i.label || ''} onChange={(e) => set({ label: e.target.value }, 'label')}
        className={INPUT} autoCorrect="on" autoCapitalize="sentences" spellCheck
      />

      <div className="grid grid-cols-3 gap-2 mt-3">
        {i.repeated ? (
          <>
            <NumberInput label="Quantité" inputMode="numeric" value={i.qty} onChange={(v) => set({ qty: Math.max(1, Math.round(v || 1)) }, 'qty')} />
            <LengthInput label="Par unité" valueMm={i.unit_w} unit={unit} onChangeMm={(v) => v > 0 && set({ unit_w: v }, 'unit_w')} />
          </>
        ) : (
          <LengthInput label={linear ? 'Longueur' : 'Largeur'} valueMm={i.w} unit={unit} onChangeMm={(v) => v > 0 && set({ w: v }, 'w')} />
        )}
        <LengthInput label={linear ? 'Largeur' : 'Hauteur'} valueMm={i.h} unit={unit} onChangeMm={(v) => v > 0 && set({ h: v }, 'h')} />
        {piece && <LengthInput label="Profondeur" valueMm={i.d} unit={unit} onChangeMm={(v) => set({ d: v }, 'd')} />}
      </div>
      {i.repeated && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Largeur totale: {formatLength(bodyWidthOf(i), unit)}</p>}

      <div className="grid grid-cols-2 gap-2 mt-3">
        <LengthInput label="X (du bord gauche)" valueMm={i.x} unit={unit} onChangeMm={(v) => v != null && set({ x: v }, 'x')} />
        <LengthInput label="Y (du haut)" valueMm={i.y} unit={unit} onChangeMm={(v) => v != null && set({ y: v }, 'y')} />
      </div>

      {piece && (
        <>
          <div className={H}>Dégagements (cette disposition seulement)</div>
          <div className="grid grid-cols-4 gap-2">
            <LengthInput label="Haut" valueMm={c[0]} unit={unit} onChangeMm={(v) => setC(0, v)} />
            <LengthInput label="Bas" valueMm={c[1]} unit={unit} onChangeMm={(v) => setC(1, v)} />
            <LengthInput label="Gauche" valueMm={c[2]} unit={unit} onChangeMm={(v) => setC(2, v)} />
            <LengthInput label="Droite" valueMm={c[3]} unit={unit} onChangeMm={(v) => setC(3, v)} />
          </div>
          {i.product_id && (
            <button type="button" className={`${BTN} w-full mt-2`} disabled={p.savingSpec} onClick={() => p.onSaveClearances(i)}>
              Enregistrer ces dégagements dans la fiche produit
            </button>
          )}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div>
              <label className={LABEL}>Montage</label>
              <select value={i.mounting || 'din'} onChange={(e) => set({ mounting: e.target.value }, 'mounting')} className={INPUT}>
                {PANEL_MOUNTINGS.filter((m) => ON_BACKPLATE_MOUNTINGS.includes(m.value)).map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Catégorie</label>
              <select value={i.cat || 'control'} onChange={(e) => set({ cat: e.target.value }, 'cat')} className={INPUT}>
                {PANEL_CATEGORIES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <NumberInput label="Pertes" suffix="W" value={i.watts} onChange={(v) => set({ watts: v }, 'watts')} />
            <div>
              <label className={LABEL}>Groupe d&apos;empilage</label>
              <input type="text" value={i.group || ''} onChange={(e) => set({ group: e.target.value || null }, 'group')} className={INPUT} autoCorrect="off" autoCapitalize="off" spellCheck={false} />
            </div>
          </div>
          <label className="flex items-center gap-3 min-h-[44px] mt-1 cursor-pointer text-sm">
            <input type="checkbox" checked={!!i.vertical} onChange={(e) => set({ vertical: e.target.checked }, 'vertical')} className="w-5 h-5 rounded text-teal-600" />
            Doit rester vertical
          </label>
          <label className={LABEL}>Note</label>
          <textarea key={i.id} defaultValue={i.note || ''} onChange={(e) => set({ note: e.target.value }, 'note')} rows={2} className={INPUT} autoCorrect="on" autoCapitalize="sentences" spellCheck />
        </>
      )}

      <div className="grid grid-cols-3 gap-2 mt-4">
        <button type="button" className={BTN} onClick={p.onRotate} title="Pivoter de 90° (R)"><RotateCw className="w-4 h-4" /> 90°</button>
        <button type="button" className={BTN} onClick={p.onDuplicate} title="Dupliquer (Ctrl+D)"><Copy className="w-4 h-4" /></button>
        <button type="button" className={`${BTN} text-red-700 dark:text-red-400 border-red-300 dark:border-red-700`} onClick={p.onRemove} title="Supprimer (Suppr)"><Trash2 className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

// ---------- Onglet Bibliothèque ----------
function LibraryTab({ library, unit, onAddFromSpec, onOpenSpec }) {
  const [q, setQ] = useState('');
  const [mount, setMount] = useState('');
  const [cat, setCat] = useState('');
  const list = useMemo(() => {
    const term = q.trim().toLowerCase().replace(/[\s\-_.]/g, '');
    return library
      .filter((s) => s.kind === 'component' && ON_BACKPLATE_MOUNTINGS.includes(s.mounting))
      .filter((s) => !mount || s.mounting === mount)
      .filter((s) => !cat || s.visual_category === cat)
      .filter((s) => !term || `${s.product_code} ${s.description || ''}`.toLowerCase().replace(/[\s\-_.]/g, '').includes(term));
  }, [library, q, mount, cat]);

  return (
    <div>
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code ou description"
          className={`${INPUT} pl-9`} autoCorrect="off" autoCapitalize="off" spellCheck={false}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <select value={mount} onChange={(e) => setMount(e.target.value)} className={INPUT} aria-label="Montage">
          <option value="">Tous les montages</option>
          <option value="din">Rail DIN</option>
          <option value="backplate">Fond (vissé)</option>
        </select>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={INPUT} aria-label="Catégorie">
          <option value="">Toutes catégories</option>
          {PANEL_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">
        {list.length} pièce{list.length > 1 ? 's' : ''} — « + » ou glisser sur le plan. Seuls les produits cochés « Panneau virtuel » dans l&apos;Inventaire apparaissent ici.
      </p>
      <ul className="mt-2 divide-y divide-gray-200 dark:divide-gray-700">
        {list.map((s) => {
          const ok = isSpecPlaceable(s);
          return (
            <li
              key={s.product_code} className="py-2 flex items-center gap-2"
              draggable={ok}
              onDragStart={(e) => { e.dataTransfer.setData('text/panel-code', s.product_code); e.dataTransfer.effectAllowed = 'copy'; }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-sm font-semibold truncate">{s.product_code}</span>
                  {SOURCE_DOT[s.source] && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-gray-600 dark:text-gray-300">
                      <span className={`w-2 h-2 rounded-full ${SOURCE_DOT[s.source]}`} />{labelOf(PANEL_SOURCES, s.source)}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-300 truncate">{s.description || '—'}</div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400">
                  {ok
                    ? `${s.is_repeated ? `${formatLength(Number(s.unit_width_mm), unit)}/unité` : formatLength(Number(s.width_mm), unit)} × ${formatLength(Number(s.height_mm), unit)} × ${formatLength(Number(s.depth_mm), unit)} · ${labelOf(PANEL_MOUNTINGS, s.mounting)}`
                    : <span className="text-amber-700 dark:text-amber-400">Dimensions manquantes</span>}
                </div>
              </div>
              {ok ? (
                <button type="button" className={`${BTN} min-w-[44px] px-0`} onClick={() => onAddFromSpec(s)} title="Ajouter au plan"><Plus className="w-5 h-5" /></button>
              ) : (
                <button type="button" className={BTN} onClick={() => onOpenSpec(s.product_code, s.description)}>Compléter</button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------- Onglet À placer ----------
function PendingTab({ items, pendingIds, layout, library, onSelect, onAddManyFromSpec, onOpenSpec, unit }) {
  const [showIgnored, setShowIgnored] = useState(false);
  const pending = items.filter((i) => pendingIds.includes(i.id));
  const rep = layout.import_report;
  const present = new Set(items.map((i) => i.product_id).filter(Boolean));
  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Les pièces hors du fond (zone à droite du plan) attendent d&apos;être placées: elles ne comptent ni dans les conflits ni dans le calcul du boîtier. Glissez-les sur le fond.
      </p>
      <div className={H}>À placer ({pending.length})</div>
      {pending.length === 0 && <p className="text-sm text-green-700 dark:text-green-400">Tout est placé.</p>}
      <ul className="divide-y divide-gray-200 dark:divide-gray-700">
        {pending.map((i) => (
          <li key={i.id}>
            <button type="button" onClick={() => onSelect([i.id])} className="w-full text-left py-2 min-h-[44px] hover:bg-gray-50 dark:hover:bg-gray-800">
              <span className="font-mono text-sm font-semibold">{i.product_id || i.label}</span>
              <span className="block text-xs text-gray-600 dark:text-gray-300 truncate">{i.description || i.label}</span>
              <span className="block text-[11px] text-gray-500 dark:text-gray-400">{formatLength(bodyWidthOf(i), unit)} × {formatLength(i.h, unit)}</span>
            </button>
          </li>
        ))}
      </ul>

      {rep && (
        <>
          <div className={H}>Import {rep.number ? `— soumission ${rep.number}` : ''}</div>
          <p className="text-xs text-gray-600 dark:text-gray-300">
            {rep.lines} ligne{rep.lines > 1 ? 's' : ''}: {rep.placed} pièce{rep.placed > 1 ? 's' : ''} à placer, {rep.off_plate?.length || 0} hors fond,{' '}
            {rep.missing?.length || 0} avec dimensions manquantes, {rep.ignored?.length || 0} ignorée{(rep.ignored?.length || 0) > 1 ? 's' : ''}.
          </p>

          {(rep.missing?.length || 0) > 0 && (
            <>
              <div className={`${H} text-amber-700 dark:text-amber-400`}>Dimensions manquantes</div>
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {rep.missing.map((m, k) => {
                  const spec = library.find((s) => s.product_code === m.code);
                  const ready = spec && isSpecPlaceable(spec);
                  const done = present.has(m.code);
                  return (
                    <li key={`${m.code}-${k}`} className="py-2 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-sm font-semibold">{m.code}</span> <span className="text-xs text-gray-500">× {m.quantity}</span>
                        <span className="block text-xs text-gray-600 dark:text-gray-300 truncate">{m.description}</span>
                      </div>
                      {done ? (
                        <span className="text-xs text-green-700 dark:text-green-400">Ajoutée</span>
                      ) : ready ? (
                        <button
                          type="button" className={BTN}
                          onClick={() => onAddManyFromSpec(
                            { ...spec, description: m.description }, spec.is_repeated ? 1 : Math.min(m.quantity, 60), m.quantity
                          )}
                        >
                          <Plus className="w-4 h-4" /> Ajouter
                        </button>
                      ) : (
                        <button type="button" className={BTN} onClick={() => onOpenSpec(m.code, m.description)}>Compléter</button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {(rep.off_plate?.length || 0) > 0 && (
            <>
              <div className={H}>Hors fond (porte, paroi, terrain, accessoire)</div>
              <ul className="text-xs space-y-1">
                {rep.off_plate.map((m, k) => (
                  <li key={`${m.code}-${k}`} className="flex gap-2">
                    <span className="w-20 flex-shrink-0 text-gray-500 dark:text-gray-400">{m.mounting_label}</span>
                    <span className="min-w-0"><span className="font-mono font-semibold">{m.code}</span> × {m.quantity} — {m.description}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {(rep.ignored?.length || 0) > 0 && (
            <div className="mt-3">
              <button type="button" className="text-xs underline text-gray-600 dark:text-gray-300 min-h-[44px]" onClick={() => setShowIgnored((v) => !v)}>
                {rep.ignored.length} ligne{rep.ignored.length > 1 ? 's' : ''} ignorée{rep.ignored.length > 1 ? 's' : ''} (case « Panneau virtuel » non cochée) — {showIgnored ? 'masquer' : 'voir'}
              </button>
              {showIgnored && (
                <ul className="text-xs space-y-1 text-gray-600 dark:text-gray-300">
                  {rep.ignored.map((m, k) => <li key={`${m.code}-${k}`}><span className="font-mono">{m.code || '(sans code)'}</span> × {m.quantity} — {m.description}</li>)}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------- Onglet Boîtier & résultat ----------
function ResultTab({ layout, result, unit, onSetting, onFitPlate, onChooseEnclosure, onOpenSpec }) {
  if (!result) return null;
  const { need, depth, heat, suggestions } = result;
  const vent = ventilation(heat.watts, Number(layout.delta_t) || 0);
  const both = (mm) => `${formatLength(mm, 'mm')} (${formatLength(mm, 'in')})`;
  const nearest = suggestions.rejected[0];
  return (
    <div>
      <div className={H} style={{ marginTop: 0 }}>Résultat</div>
      {!need ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">Placez au moins une pièce sur le fond pour calculer le boîtier.</p>
      ) : (
        <dl className="text-sm space-y-1.5">
          <div><dt className="text-xs text-gray-500 dark:text-gray-400">Fond requis (L × H)</dt><dd className="font-semibold">{formatLength(need.w, 'mm')} × {formatLength(need.h, 'mm')} <span className="font-normal text-gray-500">({formatLength(need.w, 'in')} × {formatLength(need.h, 'in')})</span></dd></div>
          <div><dt className="text-xs text-gray-500 dark:text-gray-400">Profondeur intérieure requise</dt><dd className="font-semibold">{both(depth)}</dd><dd className="text-[11px] text-gray-500 dark:text-gray-400">pièce la plus profonde + 25 mm + arrière de la porte</dd></div>
          <div><dt className="text-xs text-gray-500 dark:text-gray-400">Chaleur à évacuer</dt><dd className="font-semibold">{heat.incomplete ? '≥ ' : ''}{Math.round(heat.watts).toLocaleString('fr-CA')} W</dd>{heat.incomplete && <dd className="text-[11px] text-gray-500 dark:text-gray-400">{heat.missing} pièce{heat.missing > 1 ? 's' : ''} sans valeur de pertes</dd>}</div>
        </dl>
      )}

      <div className={H}>Réglages</div>
      <div className="grid grid-cols-3 gap-2">
        <LengthInput label="Marge au bord" valueMm={Number(layout.margin_mm)} unit={unit} onChangeMm={(v) => onSetting({ margin_mm: v ?? 0 }, 'margin')} />
        <NumberInput label="Réserve" suffix="%" value={Number(layout.spare_percent)} onChange={(v) => onSetting({ spare_percent: v ?? 0 }, 'spare')} />
        <LengthInput label="Arrière porte" valueMm={Number(layout.door_rear_depth_mm)} unit={unit} onChangeMm={(v) => onSetting({ door_rear_depth_mm: v ?? 0 }, 'door')} hint="ex. HMI" />
      </div>
      <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mt-3 mb-1">Espace disponible sur la machine (optionnel)</div>
      <div className="grid grid-cols-3 gap-2">
        <LengthInput label="Largeur" valueMm={layout.avail_width_mm == null ? null : Number(layout.avail_width_mm)} unit={unit} onChangeMm={(v) => onSetting({ avail_width_mm: v }, 'aw')} />
        <LengthInput label="Hauteur" valueMm={layout.avail_height_mm == null ? null : Number(layout.avail_height_mm)} unit={unit} onChangeMm={(v) => onSetting({ avail_height_mm: v }, 'ah')} />
        <LengthInput label="Profondeur" valueMm={layout.avail_depth_mm == null ? null : Number(layout.avail_depth_mm)} unit={unit} onChangeMm={(v) => onSetting({ avail_depth_mm: v }, 'ad')} />
      </div>
      <button type="button" className={`${BTN} w-full mt-3`} onClick={onFitPlate}>Ajuster le fond aux pièces</button>

      <div className={H}>Boîtiers suggérés</div>
      {result.enclosureCount === 0 && (
        <p className="text-sm text-gray-600 dark:text-gray-300">Aucun boîtier dans la bibliothèque. Dans l&apos;Inventaire, cochez « Panneau virtuel » sur vos boîtiers et choisissez « un boîtier ».</p>
      )}
      {need && suggestions.fits.length === 0 && result.enclosureCount > 0 && (
        <div className="text-sm rounded-lg border px-3 py-2" style={{ borderColor: '#c8371e', color: '#c8371e' }}>
          <div className="font-semibold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Aucun boîtier ne convient.</div>
          {nearest && (
            <div className="mt-1 text-xs">
              Le plus proche, <span className="font-mono font-semibold">{nearest.enclosure.product_code}</span>{nearest.orientation === 'landscape' ? ' (couché)' : ''}: {describeDeficits(nearest).join('; ')}.
            </div>
          )}
        </div>
      )}
      <ul className="space-y-2">
        {suggestions.fits.slice(0, 8).map((f, k) => {
          const e = f.enclosure;
          const chosen = layout.enclosure_code === e.product_code;
          return (
            <li key={e.product_code} className={`rounded-lg border px-3 py-2 ${chosen ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/40' : 'border-gray-200 dark:border-gray-700'}`}>
              <div className="flex items-baseline gap-2">
                <span className="font-mono font-semibold text-sm">{e.product_code}</span>
                {k === 0 && <span className="text-[10px] uppercase font-semibold text-teal-700 dark:text-teal-300">le plus petit</span>}
                {f.orientation === 'landscape' && <span className="text-[10px] uppercase font-semibold text-amber-700 dark:text-amber-400">couché</span>}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-300 truncate">{e.description || '—'}</div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">
                Fond {formatLength(f.plate.w, unit)} × {formatLength(f.plate.h, unit)} · ext. {formatLength(f.ext.w, unit)} × {formatLength(f.ext.h, unit)} × {formatLength(f.ext.d, unit)}
              </div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">Coûtant {money(e.cost_price)} · en main {e.stock_qty ?? '—'}</div>
              <button type="button" className={`${BTN} w-full mt-2 ${chosen ? 'bg-teal-600 border-teal-600 text-white hover:bg-teal-700 dark:hover:bg-teal-700' : ''}`} onClick={() => onChooseEnclosure(f)}>
                {chosen ? 'Boîtier retenu — réappliquer' : 'Choisir ce boîtier'}
              </button>
            </li>
          );
        })}
      </ul>
      {suggestions.incomplete.length > 0 && (
        <div className="mt-3 text-xs text-amber-800 dark:text-amber-300">
          {suggestions.incomplete.length} boîtier{suggestions.incomplete.length > 1 ? 's' : ''} non évalué{suggestions.incomplete.length > 1 ? 's' : ''} (fond de panneau ou profondeur utile à saisir):
          <div className="flex flex-wrap gap-1.5 mt-1">
            {suggestions.incomplete.map((e) => (
              <button key={e.product_code} type="button" onClick={() => onOpenSpec(e.product_code, e.description)} className="font-mono underline min-h-[32px] px-1">{e.product_code}</button>
            ))}
          </div>
        </div>
      )}

      <div className={H}>Ventilation (estimation)</div>
      <div className="grid grid-cols-3 gap-2 items-end">
        <NumberInput label="ΔT cible" suffix="°C" value={layout.delta_t == null ? null : Number(layout.delta_t)} onChange={(v) => onSetting({ delta_t: v }, 'dt')} />
        <div className="col-span-2 text-sm pb-2">
          {vent ? <span className="font-semibold">{heat.incomplete ? '≥ ' : ''}{vent.m3h} m³/h ({vent.cfm} pi³/min)</span> : <span className="text-gray-500 dark:text-gray-400">Entrez l&apos;écart toléré</span>}
        </div>
      </div>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
        Formule: débit (m³/h) = 3,1 × pertes (W) ÷ ΔT (°C), où ΔT est l&apos;écart toléré entre l&apos;intérieur du boîtier et l&apos;air ambiant. Estimation seulement: à valider avec le fabricant du ventilateur.
      </p>
    </div>
  );
}

export default function EditorSidePanel(props) {
  const { selectedIds, pendingIds, onLibraryChanged, userId } = props;
  const [tab, setTab] = useState('piece');
  const [specModal, setSpecModal] = useState(null); // { code, description }
  const [specDirty, setSpecDirty] = useState(false);
  const [savingSpec, setSavingSpec] = useState(false);
  const [notice, setNotice] = useState('');

  // Sélectionner une pièce sur le plan ramène l'onglet « Pièce »
  const lastSel = React.useRef('');
  const selKey = selectedIds.join(',');
  if (selKey !== lastSel.current) {
    lastSel.current = selKey;
    if (selectedIds.length > 0 && tab !== 'piece') setTab('piece');
  }

  const openSpec = (code, description) => setSpecModal({ code, description: description || '' });
  const closeSpec = () => {
    if (specDirty && !window.confirm('La fiche a des modifications non enregistrées. Fermer sans enregistrer ?')) return;
    setSpecDirty(false);
    setSpecModal(null);
    onLibraryChanged();
  };

  const saveClearances = async (item) => {
    if (!window.confirm(`Enregistrer ces dégagements dans la fiche de ${item.product_id} ? Ils serviront à toutes les prochaines dispositions.`)) return;
    setSavingSpec(true);
    setNotice('');
    try {
      const c = item.c || [0, 0, 0, 0];
      const res = await fetch('/api/panel-specs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_code: item.product_id, updated_by: userId,
          clearance_top_mm: c[0], clearance_bottom_mm: c[1], clearance_left_mm: c[2], clearance_right_mm: c[3],
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Erreur');
      setNotice('Dégagements enregistrés dans la fiche.');
      onLibraryChanged();
    } catch (e) {
      setNotice(`Non enregistré: ${e.message}`);
    } finally {
      setSavingSpec(false);
    }
  };

  return (
    <>
      <div className="flex flex-shrink-0 border-b border-gray-200 dark:border-gray-700">
        <Tab id="piece" active={tab === 'piece'} onClick={setTab}>Pièce</Tab>
        <Tab id="library" active={tab === 'library'} onClick={setTab}>Bibliothèque</Tab>
        <Tab id="pending" active={tab === 'pending'} onClick={setTab}>À placer ({pendingIds.length})</Tab>
        <Tab id="result" active={tab === 'result'} onClick={setTab}>Boîtier</Tab>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {notice && tab === 'piece' && <p className="mb-2 text-xs text-teal-800 dark:text-teal-300">{notice}</p>}
        {tab === 'piece' && <PieceTab {...props} onOpenSpec={openSpec} onSaveClearances={saveClearances} savingSpec={savingSpec} />}
        {tab === 'library' && <LibraryTab library={props.library} unit={props.unit} onAddFromSpec={props.onAddFromSpec} onOpenSpec={openSpec} />}
        {tab === 'pending' && <PendingTab {...props} onOpenSpec={openSpec} />}
        {tab === 'result' && <ResultTab {...props} onOpenSpec={openSpec} />}
      </div>

      {/* Fiche du produit, sans quitter l'éditeur */}
      {specModal && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex justify-end" onClick={closeSpec}>
          <div className="w-full max-w-xl h-full bg-white dark:bg-gray-900 shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="flex-1 min-w-0">
                <div className="font-mono font-semibold">{specModal.code}</div>
                <div className="text-xs text-gray-600 dark:text-gray-300 truncate">{specModal.description}</div>
              </div>
              <button type="button" onClick={closeSpec} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Fermer"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-5">
              <PanelSpecPanel
                key={specModal.code} productCode={specModal.code} productDescription={specModal.description}
                userId={userId} onDirtyChange={setSpecDirty} onSaved={() => onLibraryChanged()}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
