/**
 * @file components/inventory/QuickStockAdjustModal.js
 * @description Ajustement rapide du stock d'UN produit, sans quitter le formulaire en cours
 *              (ouvert depuis les fenêtres « Quantité » et « Modifier matériau » d'un BT/BL)
 *              - Même effet que Achat → Réception directe → mode Ajustement:
 *                met à jour stock_qty (products, sinon non_inventory_items) et enregistre
 *                un mouvement d'inventaire (reference_type 'direct_receipt')
 *              - Deux façons de saisir, liées entre elles: ajustement (+/−) ou quantité comptée
 *              - Bouton « +/− » dédié (le signe moins est absent de plusieurs claviers tactiles)
 *              - Les prix ne sont jamais modifiés ici
 * @version 1.0.0
 * @date 2026-11-19
 * @changelog
 *   1.0.0 - Version initiale
 */
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Package, X, Check, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const NUMBER_PATTERN = /^-?\d*\.?\d*$/;
const cleanInput = (value) => String(value ?? '').replace(',', '.').trim();
const toNumber = (raw) => {
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
};
const formatQty = (n) =>
  new Intl.NumberFormat('fr-CA', { maximumFractionDigits: 4 }).format(n || 0);

// Localise la fiche: products d'abord, puis non_inventory_items.
async function findProduct(code) {
  for (const table of ['products', 'non_inventory_items']) {
    const { data, error } = await supabase
      .from(table)
      .select('product_id, description, unit, product_group, stock_qty, cost_price')
      .eq('product_id', code)
      .limit(1);
    if (error) throw new Error(error.message);
    if (data && data.length > 0) return { table, row: data[0] };
  }
  return null;
}

export default function QuickStockAdjustModal({ product, sourceLabel, onClose, onAdjusted }) {
  const code = product?.product_id || '';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [currentStock, setCurrentStock] = useState(0);
  const [deltaInput, setDeltaInput] = useState('');
  const [countedInput, setCountedInput] = useState('');
  const [notes, setNotes] = useState('');

  // Stock à jour à l'ouverture (celui du formulaire peut dater de quelques minutes)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const found = await findProduct(code);
        if (cancelled) return;
        if (!found) {
          setError(`Produit ${code} introuvable dans l'inventaire.`);
        } else {
          setCurrentStock(parseFloat(found.row.stock_qty) || 0);
        }
      } catch (err) {
        if (!cancelled) setError('Lecture du stock impossible: ' + err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  // Échap = fermer (sauf pendant l'enregistrement)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  const delta = toNumber(deltaInput);
  const newStock = Math.max(0, currentStock + delta); // le stock ne descend jamais sous 0
  const effectiveDelta = newStock - currentStock;
  const clamped = delta !== 0 && effectiveDelta !== delta;

  const changeDelta = (value) => {
    const raw = cleanInput(value);
    if (!NUMBER_PATTERN.test(raw)) return;
    setDeltaInput(raw);
    const n = parseFloat(raw);
    setCountedInput(Number.isFinite(n) ? String(Math.max(0, currentStock + n)) : '');
  };

  const changeCounted = (value) => {
    const raw = cleanInput(value).replace('-', '');
    if (!NUMBER_PATTERN.test(raw)) return;
    setCountedInput(raw);
    const n = parseFloat(raw);
    setDeltaInput(Number.isFinite(n) ? String(Math.round((n - currentStock) * 10000) / 10000) : '');
  };

  const toggleSign = () => {
    if (delta === 0) {
      setDeltaInput(deltaInput.startsWith('-') ? '' : '-');
      return;
    }
    changeDelta(String(-delta));
  };

  const handleSave = async () => {
    if (saving) return;
    try {
      setSaving(true);
      setError('');

      // Relire le stock juste avant d'écrire (un autre appareil a pu le changer)
      const found = await findProduct(code);
      if (!found) throw new Error(`Produit ${code} introuvable dans l'inventaire.`);

      const stockNow = parseFloat(found.row.stock_qty) || 0;
      const target = Math.max(0, stockNow + delta);
      const applied = target - stockNow;
      if (applied === 0) {
        setCurrentStock(stockNow);
        throw new Error(
          delta === 0
            ? 'Entrez un ajustement différent de 0.'
            : `Le stock est déjà à ${formatQty(stockNow)}: rien à retirer.`
        );
      }

      // .select() confirme qu'une ligne a réellement été modifiée
      const { data: updated, error: updateError } = await supabase
        .from(found.table)
        .update({ stock_qty: target })
        .eq('product_id', code)
        .select('product_id');
      if (updateError || !updated || updated.length === 0) {
        throw new Error(updateError ? updateError.message : 'aucune ligne modifiée');
      }

      const unitCost = parseFloat(found.row.cost_price) || 0;
      const refNumber = `RD-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
      const note = `Ajustement inventaire${sourceLabel ? ` (depuis ${sourceLabel})` : ''}${notes.trim() ? ` - ${notes.trim()}` : ''}`;
      const { error: movementError } = await supabase
        .from('inventory_movements')
        .insert({
          product_id: code,
          product_description: found.row.description || product?.description || '',
          product_group: found.row.product_group || '',
          unit: found.row.unit || product?.unit || '',
          movement_type: applied > 0 ? 'IN' : 'OUT',
          quantity: Math.abs(applied),
          unit_cost: unitCost,
          total_cost: Math.abs(applied) * unitCost,
          reference_type: 'direct_receipt',
          reference_id: null,
          reference_number: refNumber,
          notes: note,
          created_at: new Date().toISOString(),
        });

      onAdjusted?.({
        code,
        previousStock: stockNow,
        newStock: target,
        movementSaved: !movementError,
      });
      if (movementError) {
        alert(
          `Stock ajusté (${formatQty(stockNow)} → ${formatQty(target)}), mais le mouvement n'a pas pu être inscrit dans l'historique: ${movementError.message}`
        );
      }
      onClose();
    } catch (err) {
      setError('Ajustement non enregistré: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (typeof document === 'undefined') return null;

  const unit = product?.unit || '';
  const inputClass =
    'w-full min-h-[48px] px-3 border-2 rounded-lg text-center text-xl font-bold bg-white dark:bg-gray-800';

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 flex items-start sm:items-center justify-center p-4 z-[85] overflow-y-auto"
      onClick={() => { if (!saving) onClose(); }}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-lg w-full max-w-md my-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Ajustement d'inventaire"
      >
        {/* En-tête (même couleur que le mode Ajustement de la Réception directe) */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white p-4 rounded-t-lg flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Package size={20} /> Ajustement d&apos;inventaire
            </h3>
            <p className="text-sm text-orange-50">Correction du stock en main</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-white/20 disabled:opacity-50"
            aria-label="Fermer"
          >
            <X size={22} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Produit */}
          <div className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-3">
            <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300 px-2 py-1 rounded text-sm font-mono font-semibold">
              {code}
            </span>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-2">
              {product?.description}
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-gray-600 dark:text-gray-300">
              <Loader2 className="animate-spin" size={20} /> Lecture du stock…
            </div>
          ) : (
            <>
              {/* Avant → après */}
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded-lg border dark:border-gray-700 p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">En main</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {formatQty(currentStock)} <span className="text-sm font-normal">{unit}</span>
                  </p>
                </div>
                <div className={`rounded-lg border-2 p-3 ${
                  effectiveDelta > 0
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                    : effectiveDelta < 0
                      ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                      : 'border-gray-200 dark:border-gray-700'
                }`}>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Nouveau stock</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {formatQty(newStock)} <span className="text-sm font-normal">{unit}</span>
                  </p>
                </div>
              </div>

              {/* Ajustement (+/−) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Ajustement (+/−)
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={toggleSign}
                    className={`min-w-[64px] min-h-[48px] rounded-lg text-xl font-bold text-white ${
                      deltaInput.startsWith('-') ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
                    }`}
                    title="Changer le signe: ajouter (+) ou retirer (−)"
                  >
                    {deltaInput.startsWith('-') ? '−' : '+'}
                  </button>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={deltaInput}
                    onChange={(e) => changeDelta(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    placeholder="0"
                    className={`${inputClass} ${
                      delta < 0
                        ? 'border-red-400 text-red-700 dark:text-red-400'
                        : 'border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100'
                    }`}
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Le bouton vert/rouge change le signe: + ajoute au stock, − en retire.
                </p>
              </div>

              {/* Quantité comptée */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Ou quantité réelle comptée
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={countedInput}
                  onChange={(e) => changeCounted(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder={formatQty(currentStock)}
                  className={`${inputClass} border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100`}
                />
              </div>

              {clamped && (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Le stock ne peut pas descendre sous 0: le retrait sera de {formatQty(Math.abs(effectiveDelta))} {unit}.
                </p>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notes (optionnel)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  autoCorrect="on"
                  autoCapitalize="sentences"
                  spellCheck={true}
                  placeholder="Ex: Erreur de décompte"
                  className="w-full min-h-[44px] px-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
              </div>
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 text-sm text-red-800 dark:text-red-200">
              <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="p-4 border-t dark:border-gray-700 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 min-h-[48px] rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 font-medium hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading || effectiveDelta === 0}
            className="flex-1 min-h-[48px] rounded-lg bg-orange-600 text-white font-semibold hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
