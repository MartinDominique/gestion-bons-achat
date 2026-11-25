/**
 * @file components/inventory/ProductMergeModal.js
 * @description Fenêtre « Fusionner des doublons » (Inventaire).
 *              - Étape 1: trouver l'autre fiche (recherche tolérante pré-remplie avec le code)
 *              - Étape 2: choisir le N° de produit à garder + la description à garder,
 *                voir ce qui sera transféré (mouvements, BT/BL, BA, AF, soumissions…),
 *                le stock additionné et l'historique de prix fusionné
 *              - Confirmation explicite, puis POST /api/products/merge
 *              Portail (z-80), feuille en bas sur cellulaire, touch targets 44 px.
 * @version 1.1.0
 * @date 2026-11-19
 * @changelog
 *   1.1.0 - Prop `suggestions`: les fiches au code semblable sont proposées d'emblée (« Codes semblables »)
 *   1.0.0 - Version initiale
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Loader2, GitMerge, ArrowLeft, AlertCircle } from 'lucide-react';

const sourceLabel = (src) => (src === 'products' ? 'Inventaire' : 'Non-inventaire');

const sameItem = (a, b) => {
  if (!a || !b || a._source !== b._source) return false;
  if (a._source !== 'products' && a.id != null && b.id != null) return String(a.id) === String(b.id);
  return a.product_id === b.product_id;
};

const refOf = (item) => ({
  source: item._source === 'products' ? 'products' : 'non_inventory',
  code: item.product_id,
  id: item._source !== 'products' && item.id != null ? item.id : null,
});

const money = (amount) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(parseFloat(amount) || 0);

const COUNT_LABELS = [
  ['movements', 'mouvement(s) d\'inventaire'],
  ['work_order_lines', 'ligne(s) de BT'],
  ['delivery_note_lines', 'ligne(s) de BL'],
  ['purchase_order_lines', 'ligne(s) de BA client'],
  ['supplier_purchases', 'achat(s) fournisseur (AF)'],
  ['submissions', 'soumission(s)'],
  ['items_to_order', 'ligne(s) « À Commander »'],
  ['invoice_jobe_details', 'détail(s) de forfait (factures)'],
  ['associations', 'lien(s) « As »'],
  ['panel_specs', 'fiche Panneau virtuel'],
];

function ChoiceCard({ selected, onSelect, title, subtitle, disabled }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`w-full text-left min-h-[44px] px-3 py-2 rounded-lg border-2 transition-colors disabled:opacity-60 ${
        selected
          ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
      }`}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1 w-4 h-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
          selected ? 'border-indigo-600' : 'border-gray-400'
        }`}>
          {selected && <span className="w-2 h-2 rounded-full bg-indigo-600" />}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-gray-900 dark:text-gray-100 break-words">{title}</span>
          {subtitle && <span className="block text-xs text-gray-500 dark:text-gray-400">{subtitle}</span>}
        </span>
      </div>
    </button>
  );
}

export default function ProductMergeModal({ item, suggestions = [], onClose, onMerged }) {
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState(item?.product_id || '');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [other, setOther] = useState(null);

  // Choix de l'utilisateur: 'a' = fiche ouverte, 'b' = l'autre fiche
  const [keepCode, setKeepCode] = useState('a');
  const [keepDesc, setKeepDesc] = useState('a');
  const [addStock, setAddStock] = useState(true);

  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState('');
  const searchSeq = useRef(0);

  useEffect(() => { setMounted(true); }, []);

  const close = useCallback(() => { if (!merging) onClose(); }, [merging, onClose]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  // Recherche de l'autre fiche (debounce 300 ms, 2+ caractères)
  useEffect(() => {
    if (other) return undefined;
    const term = search.trim();
    if (term.length < 2) { setResults([]); return undefined; }
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/products/search?mode=search&search=${encodeURIComponent(term)}`, { cache: 'no-store' });
        const result = await res.json().catch(() => ({}));
        if (seq !== searchSeq.current) return;
        if (!res.ok || !result.success) throw new Error(result.error || 'Recherche impossible');
        setResults((result.data || []).filter((p) => !sameItem(p, item) && !suggestions.some((sug) => sameItem(sug, p))));
        setError('');
      } catch (err) {
        if (seq === searchSeq.current) setError(err.message || 'Recherche impossible');
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, other, item]);

  const kept = keepCode === 'a' ? item : other;
  const removed = keepCode === 'a' ? other : item;

  // Aperçu de ce qui sera transféré (dépend du N° de produit gardé)
  useEffect(() => {
    if (!other) { setPreview(null); return undefined; }
    let cancelled = false;
    const from = refOf(removed);
    const to = refOf(kept);
    const params = new URLSearchParams({ from_source: from.source, from_code: from.code, to_source: to.source, to_code: to.code });
    if (from.id != null) params.set('from_id', from.id);
    if (to.id != null) params.set('to_id', to.id);
    setPreviewLoading(true);
    setPreview(null);
    (async () => {
      try {
        const res = await fetch(`/api/products/merge?${params}`, { cache: 'no-store' });
        const result = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !result.success) {
          throw new Error([result.error, result.details].filter(Boolean).join(' — ') || 'Aperçu impossible');
        }
        setPreview(result.data);
        setError('');
      } catch (err) {
        if (!cancelled) setError(err.message || 'Aperçu impossible');
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [other, keepCode]);

  const chosenDescription = ((keepDesc === 'a' ? item : other)?.description || '').trim();

  const doMerge = async () => {
    if (!other || !preview || merging) return;
    const ok = window.confirm(
      `Fusionner ${removed.product_id} dans ${kept.product_id} ?\n\n` +
      `La fiche « ${removed.product_id} » (${sourceLabel(removed._source)}) sera supprimée. ` +
      'Cette action est définitive.'
    );
    if (!ok) return;
    setMerging(true);
    setError('');
    try {
      const res = await fetch('/api/products/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: refOf(removed),
          to: refOf(kept),
          add_stock: addStock,
          description: chosenDescription,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.success) {
        throw new Error([result.error, result.details].filter(Boolean).join(' — ') || 'Fusion refusée');
      }
      onMerged({ removed, kept, product: result.data.product, data: result.data });
    } catch (err) {
      console.error('Erreur fusion produits:', err);
      setError(err.message || 'Fusion refusée');
    } finally {
      setMerging(false);
    }
  };

  if (!mounted || !item) return null;

  const stockA = parseFloat(item.stock_qty) || 0;
  const stockB = parseFloat(other?.stock_qty) || 0;
  const keptStock = keepCode === 'a' ? stockA : stockB;
  const removedStock = keepCode === 'a' ? stockB : stockA;
  const counts = preview?.counts || {};
  const countLines = COUNT_LABELS.filter(([key]) => counts[key] > 0);
  const cardSubtitle = (p) =>
    `${sourceLabel(p._source)} · en main ${parseFloat(p.stock_qty) || 0} · coûtant ${money(p.cost_price)} · vendant ${money(p.selling_price)}`;

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-end sm:items-center justify-center z-[80] p-0 sm:p-4">
      <div className="bg-white dark:bg-gray-900 rounded-t-lg sm:rounded-lg w-full max-w-xl max-h-[92vh] flex flex-col">
        <div className="bg-indigo-600 text-white px-5 py-3 rounded-t-lg flex items-center justify-between">
          <div className="min-w-0">
            <div className="font-semibold flex items-center gap-2">
              <GitMerge className="w-5 h-5 shrink-0" />
              Fusionner des doublons
            </div>
            <div className="text-xs opacity-90 truncate">{item.product_id} — {item.description}</div>
          </div>
          <button
            onClick={close}
            disabled={merging}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-white/20 disabled:opacity-50"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-800 dark:text-red-200 rounded-lg p-3 flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* ===== Étape 1: trouver l'autre fiche ===== */}
          {!other && (
            <>
              <div className="font-medium text-gray-900 dark:text-gray-100">
                1. Avec quelle autre fiche fusionner ?
              </div>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  placeholder="Code ou description de l'autre fiche"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  autoFocus
                  className="w-full min-h-[44px] pl-9 pr-9 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg"
                />
                {searching && <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />}
              </div>
              {suggestions.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">Codes semblables</div>
                  {suggestions.map((p) => (
                    <button
                      key={`sug-${p._source}-${p.id ?? p.product_id}`}
                      type="button"
                      onClick={() => { setOther(p); setKeepCode('a'); setKeepDesc('a'); setError(''); }}
                      className="w-full text-left min-h-[44px] px-3 py-2 border-2 border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
                    >
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words">
                        {p.product_id} — {p.description}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{cardSubtitle(p)}</div>
                    </button>
                  ))}
                  <div className="text-xs text-gray-500 dark:text-gray-400 pt-1">Ou chercher une autre fiche:</div>
                </div>
              )}
              {search.trim().length >= 2 && !searching && results.length === 0 && suggestions.length === 0 && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Aucune autre fiche trouvée. Essayez une partie du code ou de la description.
                </div>
              )}
              <div className="space-y-1.5">
                {results.map((p) => (
                  <button
                    key={`${p._source}-${p.id ?? p.product_id}`}
                    type="button"
                    onClick={() => { setOther(p); setKeepCode('a'); setKeepDesc('a'); setError(''); }}
                    className="w-full text-left min-h-[44px] px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                  >
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words">
                      {p.product_id} — {p.description}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{cardSubtitle(p)}</div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ===== Étape 2: choix + aperçu ===== */}
          {other && (
            <>
              <button
                type="button"
                onClick={() => { setOther(null); setPreview(null); setError(''); }}
                disabled={merging}
                className="min-h-[44px] text-xs text-indigo-700 dark:text-indigo-300 flex items-center gap-1 disabled:opacity-50"
              >
                <ArrowLeft className="w-4 h-4" /> Choisir une autre fiche
              </button>

              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100 mb-1.5">N° de produit à garder</div>
                <div className="space-y-1.5">
                  <ChoiceCard selected={keepCode === 'a'} onSelect={() => setKeepCode('a')} disabled={merging}
                    title={item.product_id} subtitle={cardSubtitle(item)} />
                  <ChoiceCard selected={keepCode === 'b'} onSelect={() => setKeepCode('b')} disabled={merging}
                    title={other.product_id} subtitle={cardSubtitle(other)} />
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Le prix actuel, l'unité, le groupe et le fournisseur de la fiche gardée sont conservés.
                </div>
              </div>

              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100 mb-1.5">Description à garder</div>
                <div className="space-y-1.5">
                  <ChoiceCard selected={keepDesc === 'a'} onSelect={() => setKeepDesc('a')} disabled={merging}
                    title={item.description || '(sans description)'} subtitle={`de ${item.product_id}`} />
                  <ChoiceCard selected={keepDesc === 'b'} onSelect={() => setKeepDesc('b')} disabled={merging}
                    title={other.description || '(sans description)'} subtitle={`de ${other.product_id}`} />
                </div>
              </div>

              <div className="border dark:border-gray-700 rounded-lg p-3 space-y-2">
                <div className="font-medium text-gray-900 dark:text-gray-100">Résultat de la fusion</div>
                {previewLoading && (
                  <div className="flex items-center text-gray-600 dark:text-gray-400 text-xs">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" /> Vérification de ce qui sera transféré…
                  </div>
                )}
                {preview && (
                  <ul className="text-xs text-gray-700 dark:text-gray-300 space-y-1">
                    <li>
                      • Fiche finale: <b>{kept.product_id}</b> — {chosenDescription || '(sans description)'}
                    </li>
                    {preview.same_code ? (
                      <li>• Les deux fiches portent le même code: mouvements et documents y sont déjà rattachés.</li>
                    ) : countLines.length === 0 ? (
                      <li>• Aucun mouvement ni document rattaché à {removed.product_id}.</li>
                    ) : (
                      <li>
                        • Transférés de {removed.product_id} vers {kept.product_id}:{' '}
                        {countLines.map(([key, label]) => `${counts[key]} ${label}`).join(', ')}
                      </li>
                    )}
                    <li>• Historique de prix: fusionné (les 3 prix précédents les plus récents des deux fiches).</li>
                    <li>
                      • Quantité en main: {keptStock}
                      {addStock ? ` + ${removedStock} = ` : ' (inchangée) → '}
                      <b>{addStock ? keptStock + removedStock : keptStock}</b>
                    </li>
                    <li className="text-red-700 dark:text-red-400 font-medium">
                      • La fiche {removed.product_id} ({sourceLabel(removed._source)}) sera supprimée définitivement.
                    </li>
                  </ul>
                )}
                <label className="flex items-center gap-2 min-h-[44px] text-xs text-gray-800 dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={addStock}
                    onChange={(e) => setAddStock(e.target.checked)}
                    disabled={merging}
                    className="w-5 h-5"
                  />
                  Additionner les quantités en main des deux fiches
                </label>
              </div>
            </>
          )}
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 flex gap-3 border-t dark:border-gray-700 rounded-b-lg">
          <button
            onClick={close}
            disabled={merging}
            className="flex-1 min-h-[44px] px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300 disabled:opacity-50"
          >
            Annuler
          </button>
          {other && (
            <button
              onClick={doMerge}
              disabled={!preview || previewLoading || merging}
              className="flex-1 min-h-[44px] px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {merging ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitMerge className="w-4 h-4" />}
              {merging ? 'Fusion en cours…' : 'Fusionner'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
