/**
 * @file components/panel/PanelSpecPanel.js
 * @description Panneau virtuel — formulaire de la fiche technique d'un produit
 *              (onglet « Panneau virtuel » de la fiche Inventaire; réutilisable
 *              plus tard dans le panneau latéral de l'éditeur de disposition).
 *              - Type « Composant »: dimensions, montage, dégagements, orientation
 *                obligatoire, groupe d'empilage, pièce répétée, pertes (W), catégorie,
 *                profondeur arrière (porte), source, lien fiche, notes
 *              - Type « Boîtier »: extérieur, fond de panneau (backplate), profondeur
 *                utile, marge, indice, matériau, orientations permises. Les dimensions
 *                extérieures sont proposées depuis la description (« 300X400X210mm »)
 *              - Aperçu à l'échelle mis à jour pendant la saisie
 *              - 2 photos: face + 3 faces (caméra sur téléphone/tablette, réduites
 *                à 1600 px avant l'envoi)
 *              - Mesures stockées en mm; saisie/affichage en mm ou en pouces
 *                (bascule mémorisée, voir usePanelUnit)
 * @version 1.2.0
 * @date 2026-11-25
 * @changelog
 *   1.2.0 - Forme « Ronde » (boutons, voyants, arrêts d'urgence): un seul champ Diamètre, aperçu rond
 *   1.1.0 - Choix du type reformulé (« Ce produit est… une pièce à placer / un boîtier ») + explication et
 *           confirmation: « Boîtier » était compris comme « attribuer un boîtier à la pièce ».
 *           LengthInput / NumberInput exportés (réutilisés par l'éditeur de disposition)
 *   1.0.0 - Version initiale (Panneau virtuel PR 1)
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Save, Camera, Upload, Trash2, AlertTriangle, CheckCircle2, ExternalLink, ArrowLeftRight } from 'lucide-react';
import PanelSpecPreview from './PanelSpecPreview';
import { usePanelUnit, UnitToggle } from './usePanelUnit';
import {
  PANEL_KINDS, PANEL_MOUNTINGS, PANEL_SOURCES, PANEL_CATEGORIES, ON_BACKPLATE_MOUNTINGS,
  emptySpec, toMm, fromMm, formatLength, missingDimensions, parseDimensionsFromDescription, parseNumber,
} from '../../lib/panel/specs';

const INPUT =
  'w-full px-3 py-2 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg text-sm ' +
  'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500';
const LABEL = 'block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1';
const SECTION = 'text-sm font-semibold text-gray-900 dark:text-gray-100 mt-5 mb-2';

const CODE_ATTRS = { autoCorrect: 'off', autoCapitalize: 'off', spellCheck: false };
const TEXT_ATTRS = { autoCorrect: 'on', autoCapitalize: 'sentences', spellCheck: true };

const display = (v) =>
  v == null ? '' : String(v).replace('.', ',');

/** Champ de longueur: valeur en mm côté parent, texte dans l'unité affichée. */
export function LengthInput({ label, valueMm, unit, onChangeMm, hint }) {
  const [text, setText] = useState(display(fromMm(valueMm, unit)));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(display(fromMm(valueMm, unit)));
  }, [valueMm, unit]);

  return (
    <div>
      <label className={LABEL}>{label} <span className="text-gray-400">({unit === 'in' ? 'po' : 'mm'})</span></label>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onFocus={(e) => { focused.current = true; e.target.select(); }}
        onBlur={() => { focused.current = false; setText(display(fromMm(valueMm, unit))); }}
        onChange={(e) => { setText(e.target.value); onChangeMm(toMm(e.target.value, unit)); }}
        className={INPUT}
        {...CODE_ATTRS}
      />
      {hint && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

/** Champ numérique simple (W, quantité). */
export function NumberInput({ label, value, onChange, inputMode = 'decimal', suffix }) {
  const [text, setText] = useState(display(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(display(value)); }, [value]);
  return (
    <div>
      <label className={LABEL}>{label}{suffix && <span className="text-gray-400"> ({suffix})</span>}</label>
      <input
        type="text"
        inputMode={inputMode}
        value={text}
        onFocus={(e) => { focused.current = true; e.target.select(); }}
        onBlur={() => { focused.current = false; setText(display(value)); }}
        onChange={(e) => { setText(e.target.value); onChange(parseNumber(e.target.value)); }}
        className={INPUT}
        {...CODE_ATTRS}
      />
    </div>
  );
}

function Check({ label, checked, onChange, hint }) {
  return (
    <label className="flex items-start gap-3 min-h-[44px] py-2 cursor-pointer">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
      />
      <span className="text-sm text-gray-800 dark:text-gray-200">
        {label}
        {hint && <span className="block text-[11px] text-gray-500 dark:text-gray-400">{hint}</span>}
      </span>
    </label>
  );
}

/** Réduit une image à 1600 px max (JPEG) avant l'envoi: photo de cellulaire de 8 Mo → ~300 Ko. */
async function shrinkImage(file, maxSide = 1600) {
  try {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * ratio);
    canvas.height = Math.round(bitmap.height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob || file;
  } catch (e) {
    return file; // format non décodable par le navigateur: le serveur validera
  }
}

function PhotoSlot({ title, hint, url, busy, onPick, onRemove }) {
  const cameraRef = useRef(null);
  const fileRef = useRef(null);
  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) onPick(f);
  };
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</div>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">{hint}</p>
      <div className="h-32 bg-gray-100 dark:bg-gray-800 rounded flex items-center justify-center overflow-hidden mb-2">
        {busy ? (
          <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
        ) : url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={title} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-xs text-gray-500 dark:text-gray-400">Aucune photo</span>
        )}
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} />
      <div className="flex gap-2">
        <button
          type="button" disabled={busy} onClick={() => cameraRef.current?.click()}
          className="flex-1 min-h-[44px] px-2 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 inline-flex items-center justify-center gap-1"
        >
          <Camera className="w-4 h-4" /> Caméra
        </button>
        <button
          type="button" disabled={busy} onClick={() => fileRef.current?.click()}
          className="flex-1 min-h-[44px] px-2 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 inline-flex items-center justify-center gap-1"
        >
          <Upload className="w-4 h-4" /> Fichier
        </button>
        {url && (
          <button
            type="button" disabled={busy} onClick={onRemove} title="Retirer la photo"
            className="min-h-[44px] min-w-[44px] rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50 inline-flex items-center justify-center"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function PanelSpecPanel({ productCode, productDescription = '', userId = null, onSaved, onDirtyChange }) {
  const [unit, setUnit] = usePanelUnit();
  const [spec, setSpec] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(null); // 'front' | 'iso' | null

  const markDirty = useCallback((value) => {
    setDirty(value);
    if (onDirtyChange) onDirtyChange(value);
  }, [onDirtyChange]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/panel-specs?code=${encodeURIComponent(productCode)}`);
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Erreur de lecture');
        if (!cancelled) setSpec(json.spec || emptySpec(productCode));
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [productCode]);

  // Avertir avant de quitter la page avec des changements non enregistrés
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = useCallback((patch) => {
    setSpec((prev) => ({ ...prev, ...patch }));
    setSavedAt(null);
    markDirty(true);
  }, [markDirty]);

  const save = async () => {
    if (!spec || saving) return;
    setSaving(true);
    setError('');
    try {
      const { photo_front_path, photo_iso_path, photo_front_url, photo_iso_url, id, created_at, updated_at, ...fields } = spec;
      const res = await fetch('/api/panel-specs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...fields,
          mounting: fields.kind === 'enclosure' ? null : fields.mounting,
          shape: fields.shape === 'round' && !fields.is_repeated ? 'round' : 'rect',
          product_code: productCode,
          active: true,
          updated_by: userId,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error([json.error, json.details].filter(Boolean).join(' — ') || 'Erreur');
      setSpec(json.spec);
      setSavedAt(Date.now());
      markDirty(false);
      if (onSaved) onSaved(json.spec, json.status);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const applyPhotoResult = (saved) => {
    setSpec((prev) => ({
      ...prev,
      id: saved.id,
      photo_front_path: saved.photo_front_path,
      photo_iso_path: saved.photo_iso_path,
      photo_front_url: saved.photo_front_url,
      photo_iso_url: saved.photo_iso_url,
    }));
  };

  const uploadPhoto = async (slot, file) => {
    setPhotoBusy(slot);
    setError('');
    try {
      const blob = await shrinkImage(file);
      const form = new FormData();
      form.append('code', productCode);
      form.append('slot', slot);
      form.append('file', blob, `${slot}.jpg`);
      const res = await fetch('/api/panel-specs/photo', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error([json.error, json.details].filter(Boolean).join(' — ') || 'Erreur');
      applyPhotoResult(json.spec);
    } catch (e) {
      setError(`Photo: ${e.message}`);
    } finally {
      setPhotoBusy(null);
    }
  };

  const removePhoto = async (slot) => {
    if (!window.confirm('Retirer cette photo ?')) return;
    setPhotoBusy(slot);
    setError('');
    try {
      const res = await fetch(
        `/api/panel-specs/photo?code=${encodeURIComponent(productCode)}&slot=${slot}`, { method: 'DELETE' }
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Erreur');
      applyPhotoResult(json.spec);
    } catch (e) {
      setError(`Photo: ${e.message}`);
    } finally {
      setPhotoBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
      </div>
    );
  }
  if (!spec) {
    return <div className="p-4 text-sm text-red-700 dark:text-red-300">{error || 'Fiche introuvable'}</div>;
  }

  const isEnclosure = spec.kind === 'enclosure';
  const isEnclosureKind = isEnclosure;
  const isRound = spec.shape === 'round' && !spec.is_repeated;
  const looksLikeEnclosure = /bo[iî]tier|enclosure|cabinet|armoire/i.test(productDescription || '');
  const changeKind = (kind) => {
    if (kind === spec.kind) return;
    if (kind === 'enclosure' && !looksLikeEnclosure
      && !window.confirm('« Boîtier » veut dire que CE PRODUIT est un boîtier (une armoire), pas qu\'il va dans un boîtier.\n\nLa description ne ressemble pas à un boîtier. Continuer quand même ?')) return;
    set({ kind, mounting: kind === 'component' ? (spec.mounting || 'din') : spec.mounting });
  };
  const onBackplate = ON_BACKPLATE_MOUNTINGS.includes(spec.mounting);
  const missing = missingDimensions(spec);
  const parsed = isEnclosure ? parseDimensionsFromDescription(productDescription) : null;
  const showParsed = parsed && !spec.width_mm && !spec.height_mm && !spec.depth_mm;
  const u = unit === 'in' ? 'po' : 'mm';

  return (
    <div>
      {/* Type de produit + unité */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={LABEL}>Ce produit est…</div>
          <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
            {PANEL_KINDS.map((k) => (
              <button
                key={k.value} type="button" aria-pressed={spec.kind === k.value}
                onClick={() => changeKind(k.value)}
                className={`px-4 min-h-[44px] text-sm font-medium ${
                  spec.kind === k.value
                    ? 'bg-teal-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {k.value === 'component' ? 'une pièce à placer' : 'un boîtier'}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
            {isEnclosureKind
              ? 'À utiliser seulement si ce produit EST un boîtier (Rittal, Hoffman, Hammond…). Il sera proposé dans les dispositions.'
              : 'Le boîtier d\'un projet se choisit dans la disposition, une fois les pièces placées — jamais ici.'}
          </p>
        </div>
        <UnitToggle unit={unit} onChange={setUnit} />
      </div>

      {/* Aperçu à l'échelle */}
      <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
        <PanelSpecPreview spec={spec} unit={unit} />
      </div>

      {missing.length > 0 ? (
        <div className="mt-2 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>Dimensions manquantes: {missing.join(', ')}</span>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2 text-xs text-green-800 dark:text-green-300">
          <CheckCircle2 className="w-4 h-4" /> Fiche complète pour le Panneau virtuel
        </div>
      )}

      {isEnclosure ? (
        <>
          {showParsed && (
            <div className="mt-3 text-xs bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 text-blue-900 dark:text-blue-200">
              <div>
                Dimensions trouvées dans la description: L {formatLength(parsed.width_mm, unit)} × H {formatLength(parsed.height_mm, unit)} × P {formatLength(parsed.depth_mm, unit)}.
                {' '}À vérifier: l&apos;ordre varie selon le fabricant.
              </div>
              <button
                type="button"
                onClick={() => set({ width_mm: parsed.width_mm, height_mm: parsed.height_mm, depth_mm: parsed.depth_mm })}
                className="mt-2 min-h-[44px] px-3 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
              >
                Utiliser ces dimensions
              </button>
            </div>
          )}

          <h4 className={SECTION}>Dimensions extérieures</h4>
          <div className="grid grid-cols-3 gap-3">
            <LengthInput label="Hauteur" valueMm={spec.height_mm} unit={unit} onChangeMm={(v) => set({ height_mm: v })} />
            <LengthInput label="Largeur" valueMm={spec.width_mm} unit={unit} onChangeMm={(v) => set({ width_mm: v })} />
            <LengthInput label="Profondeur" valueMm={spec.depth_mm} unit={unit} onChangeMm={(v) => set({ depth_mm: v })} />
          </div>
          <button
            type="button"
            onClick={() => set({ width_mm: spec.height_mm, height_mm: spec.width_mm })}
            className="mt-2 min-h-[44px] px-3 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 inline-flex items-center gap-1"
          >
            <ArrowLeftRight className="w-4 h-4" /> Inverser hauteur et largeur
          </button>

          <h4 className={SECTION}>Fond de panneau (backplate)</h4>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 -mt-1 mb-2">
            Dimensions utiles réelles de la plaque, toujours plus petite que le boîtier. C&apos;est elle qui sert à placer les composantes.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <LengthInput label="Hauteur du fond" valueMm={spec.backplate_height_mm} unit={unit} onChangeMm={(v) => set({ backplate_height_mm: v })} />
            <LengthInput label="Largeur du fond" valueMm={spec.backplate_width_mm} unit={unit} onChangeMm={(v) => set({ backplate_width_mm: v })} />
            <LengthInput
              label="Profondeur utile" valueMm={spec.usable_depth_mm} unit={unit}
              onChangeMm={(v) => set({ usable_depth_mm: v })} hint="Du fond de panneau à la porte"
            />
            <LengthInput
              label="Marge non utilisable" valueMm={spec.unusable_margin_mm} unit={unit}
              onChangeMm={(v) => set({ unusable_margin_mm: v })} hint="Optionnel (bords, charnières)"
            />
          </div>

          <h4 className={SECTION}>Indice et orientation</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Indice (NEMA / IP)</label>
              <input type="text" value={spec.rating || ''} onChange={(e) => set({ rating: e.target.value })} className={INPUT} {...CODE_ATTRS} />
            </div>
            <div>
              <label className={LABEL}>Matériau</label>
              <input type="text" value={spec.material || ''} onChange={(e) => set({ material: e.target.value })} className={INPUT} {...TEXT_ATTRS} />
            </div>
          </div>
          <div className="mt-1 grid sm:grid-cols-2 gap-x-3">
            <Check label="Normale (portrait)" checked={spec.allow_portrait} onChange={(v) => set({ allow_portrait: v })} />
            <Check label="Paysage / couché sur le côté" checked={spec.allow_landscape} onChange={(v) => set({ allow_landscape: v })} />
          </div>
        </>
      ) : (
        <>
          <h4 className={SECTION}>Montage</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Montage</label>
              <select value={spec.mounting || ''} onChange={(e) => set({ mounting: e.target.value || null })} className={INPUT}>
                {PANEL_MOUNTINGS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Catégorie visuelle</label>
              <select value={spec.visual_category} onChange={(e) => set({ visual_category: e.target.value })} className={INPUT}>
                {PANEL_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
          {!onBackplate && (
            <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
              Cette pièce ne va pas sur le fond de panneau: les dimensions sont optionnelles.
            </p>
          )}

          <h4 className={SECTION}>Dimensions</h4>
          <Check
            label="Pièce répétée (borniers, disjoncteurs…)" checked={spec.is_repeated}
            onChange={(v) => set({ is_repeated: v })}
            hint="Largeur = quantité × largeur par unité"
          />
          {!spec.is_repeated && (
            <div className="mb-3">
              <span className={LABEL}>Forme vue de face</span>
              <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                {[['rect', 'Rectangulaire'], ['round', 'Ronde (bouton, voyant)']].map(([v, l]) => (
                  <button
                    key={v} type="button" aria-pressed={(spec.shape === 'round' ? 'round' : 'rect') === v}
                    onClick={() => set(v === 'round' ? { shape: 'round', height_mm: spec.width_mm ?? spec.height_mm } : { shape: 'rect' })}
                    className={`px-4 min-h-[44px] text-sm font-medium ${
                      (spec.shape === 'round' ? 'round' : 'rect') === v
                        ? 'bg-teal-600 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            {spec.is_repeated ? (
              <LengthInput label="Largeur par unité" valueMm={spec.unit_width_mm} unit={unit} onChangeMm={(v) => set({ unit_width_mm: v })} />
            ) : isRound ? (
              <LengthInput label="Diamètre" valueMm={spec.width_mm} unit={unit} onChangeMm={(v) => set({ width_mm: v, height_mm: v })} />
            ) : (
              <LengthInput label="Largeur" valueMm={spec.width_mm} unit={unit} onChangeMm={(v) => set({ width_mm: v })} />
            )}
            {!isRound && <LengthInput label="Hauteur" valueMm={spec.height_mm} unit={unit} onChangeMm={(v) => set({ height_mm: v })} />}
            <LengthInput
              label="Profondeur" valueMm={spec.depth_mm} unit={unit}
              onChangeMm={(v) => set({ depth_mm: v })} hint="Ce qui dépasse du fond"
            />
            {spec.is_repeated && (
              <NumberInput
                label="Quantité par défaut" value={spec.default_quantity} inputMode="numeric"
                onChange={(v) => set({ default_quantity: v == null ? null : Math.round(v) })}
              />
            )}
            {spec.mounting === 'door' && (
              <LengthInput
                label="Profondeur arrière" valueMm={spec.rear_depth_mm} unit={unit}
                onChangeMm={(v) => set({ rear_depth_mm: v })} hint="Ce qui rentre dans le boîtier"
              />
            )}
          </div>

          <h4 className={SECTION}>Dégagements <span className="font-normal text-gray-500">({u}, selon le manuel du fabricant)</span></h4>
          <div className="grid grid-cols-4 gap-3">
            <LengthInput label="Haut" valueMm={spec.clearance_top_mm} unit={unit} onChangeMm={(v) => set({ clearance_top_mm: v ?? 0 })} />
            <LengthInput label="Bas" valueMm={spec.clearance_bottom_mm} unit={unit} onChangeMm={(v) => set({ clearance_bottom_mm: v ?? 0 })} />
            <LengthInput label="Gauche" valueMm={spec.clearance_left_mm} unit={unit} onChangeMm={(v) => set({ clearance_left_mm: v ?? 0 })} />
            <LengthInput label="Droite" valueMm={spec.clearance_right_mm} unit={unit} onChangeMm={(v) => set({ clearance_right_mm: v ?? 0 })} />
          </div>
          <Check
            label="Doit rester vertical une fois installé" checked={spec.must_stay_vertical}
            onChange={(v) => set({ must_stay_vertical: v })}
            hint="Ex. VFD, alimentations: la chaleur monte"
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Groupe d&apos;empilage</label>
              <input
                type="text" value={spec.stack_group || ''} onChange={(e) => set({ stack_group: e.target.value })}
                placeholder="ex. P1000" className={INPUT} {...CODE_ATTRS}
              />
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Les pièces du même groupe peuvent se coller</p>
            </div>
            <NumberInput label="Pertes" suffix="W" value={spec.heat_loss_w} onChange={(v) => set({ heat_loss_w: v })} />
          </div>
        </>
      )}

      <h4 className={SECTION}>Référence</h4>
      <div className="grid grid-cols-2 gap-3">
        {!isEnclosure && (
          <div>
            <label className={LABEL}>Source des mesures</label>
            <select value={spec.source} onChange={(e) => set({ source: e.target.value })} className={INPUT}>
              {PANEL_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label} — {s.hint}</option>)}
            </select>
          </div>
        )}
        <div className={isEnclosure ? 'col-span-2' : ''}>
          <label className={LABEL}>
            Lien fiche technique
            {spec.datasheet_url && /^https?:\/\//i.test(spec.datasheet_url) && (
              <a href={spec.datasheet_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-teal-700 dark:text-teal-400 inline-flex items-center gap-0.5">
                ouvrir <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </label>
          <input
            type="url" inputMode="url" value={spec.datasheet_url || ''} onChange={(e) => set({ datasheet_url: e.target.value })}
            placeholder="https://" className={INPUT} {...CODE_ATTRS}
          />
        </div>
      </div>
      <div className="mt-3">
        <label className={LABEL}>Notes</label>
        <textarea
          defaultValue={spec.notes || ''} onChange={(e) => set({ notes: e.target.value })}
          rows={2} className={INPUT} {...TEXT_ATTRS}
        />
      </div>

      <h4 className={SECTION}>Photos</h4>
      {spec.id ? (
        <div className="grid grid-cols-2 gap-3">
          <PhotoSlot
            title="Photo de face" hint="Vue de devant: le visuel sur le fond de panneau"
            url={spec.photo_front_url} busy={photoBusy === 'front'}
            onPick={(f) => uploadPhoto('front', f)} onRemove={() => removePhoto('front')}
          />
          <PhotoSlot
            title="Photo 3 faces" hint="Vue en angle: pour la sélection visuelle"
            url={spec.photo_iso_url} busy={photoBusy === 'iso'}
            onPick={(f) => uploadPhoto('iso', f)} onRemove={() => removePhoto('iso')}
          />
        </div>
      ) : (
        <p className="text-xs text-gray-500 dark:text-gray-400">Enregistrez la fiche une première fois pour ajouter des photos.</p>
      )}

      {/* Barre d'enregistrement (collée au bas de la zone défilante) */}
      <div className="sticky -bottom-5 -mx-5 -mb-5 px-5 py-3 mt-5 z-10 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex items-center gap-3">
        <div className="flex-1 text-xs min-w-0">
          {error ? (
            <span className="text-red-700 dark:text-red-300">{error}</span>
          ) : savedAt ? (
            <span className="text-green-700 dark:text-green-400 inline-flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Enregistré</span>
          ) : dirty ? (
            <span className="text-amber-700 dark:text-amber-400">Modifications non enregistrées</span>
          ) : null}
        </div>
        <button
          type="button" onClick={save} disabled={saving || !dirty}
          className="min-h-[44px] px-5 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50 inline-flex items-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Enregistrement…' : 'Enregistrer la fiche'}
        </button>
      </div>
    </div>
  );
}
