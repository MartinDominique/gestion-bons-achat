/**
 * @file components/inventory/QuickStockAdjustModal.js
 * @description Ajustement rapide du STOCK et des PRIX d'UN produit, sans quitter le formulaire
 *              en cours (ouvert depuis les fenêtres « Quantité » et « Modifier matériau » d'un BT/BL)
 *              - Stock: même effet que Achat → Réception directe → mode Ajustement:
 *                met à jour stock_qty et enregistre un mouvement d'inventaire
 *                (reference_type 'direct_receipt'). Ajustement (+/−) ou quantité comptée.
 *              - Prix: coûtant (CAD ou USD) + vendant + marge, boutons 27 / 30 / 35 %.
 *                Écrit la fiche (products, sinon non_inventory_items) via buildPriceShiftUpdates
 *                → l'ancien prix est décalé dans « Hist. Prix » avec sa date.
 *                Un changement de prix seul ne crée AUCUN mouvement d'inventaire
 *                (un mouvement = une quantité qui entre ou qui sort).
 *              - Le vendant est aussi reporté sur la ligne du BT/BL ouvert (via onAdjusted),
 *                sinon la facture reprendrait l'ancien prix copié sur la ligne.
 *              - Case « Mettre à jour la fiche inventaire » (cochée par défaut): décochée =
 *                prix spécial pour ce document seulement, la fiche ne bouge pas.
 *              - Avis: liste des autres BT/BL brouillons qui contiennent ce produit
 *                (leur prix n'est jamais modifié).
 *              - Produit non-inventaire: section Prix seulement.
 * @version 2.0.0
 * @date 2026-11-27
 * @changelog
 *   2.0.0 - Section « Prix » (coûtant CAD/USD, vendant, marge, 27/30/35 %), historique des prix,
 *           report du vendant sur la ligne du BT/BL, avis « aussi dans d'autres brouillons »,
 *           produits non-inventaire acceptés (prix seulement). Stock et prix sont indépendants:
 *           seul ce qui a changé est enregistré.
 *   1.0.0 - Version initiale
 */
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Package, X, Check, Loader2, AlertCircle, AlertTriangle, DollarSign } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { buildPriceShiftUpdates } from '../../lib/utils/priceShift';
import { CURRENCY_CAD, CURRENCY_USD, safeCurrencyUpdates } from '../../lib/utils/currency';
import CostPriceField, { useExchangeRate } from '../currency/CostPriceField';

const MARGIN_PRESETS = [27, 30, 35];
const DEFAULT_MIN_MARGIN = 10;
const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
const formatMoney = (n) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(n || 0);

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
      .select('*')
      .eq('product_id', code)
      .limit(1);
    if (error) throw new Error(error.message);
    if (data && data.length > 0) return { table, row: data[0] };
  }
  return null;
}

/**
 * @param {Object}   props.product          { product_id, description, unit }
 * @param {string}   props.sourceLabel      N° du BT/BL ouvert (ou « un BT » / « un BL »)
 * @param {Object}   props.currentDocument  { type: 'BT'|'BL', id } — exclu de l'avis « aussi dans »
 * @param {number}   props.linePrice        Vendant actuellement sur la ligne du document (si déjà ajoutée)
 * @param {Function} props.onAdjusted       ({ code, stockChanged, previousStock, newStock, movementSaved,
 *                                             prices: { cost_price, selling_price, sheetUpdated, applyToDocument } | null })
 */
export default function QuickStockAdjustModal({
  product,
  sourceLabel,
  currentDocument,
  linePrice,
  onClose,
  onAdjusted,
}) {
  const code = product?.product_id || '';
  const exchange = useExchangeRate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [currentStock, setCurrentStock] = useState(0);
  const [deltaInput, setDeltaInput] = useState('');
  const [countedInput, setCountedInput] = useState('');
  const [notes, setNotes] = useState('');

  // ----- Prix -----
  const [table, setTable] = useState('products');
  const [initial, setInitial] = useState({ cost: 0, selling: 0, currency: CURRENCY_CAD, usd: '' });
  const [costInput, setCostInput] = useState('');
  const [currency, setCurrency] = useState(CURRENCY_CAD);
  const [usdAmount, setUsdAmount] = useState('');
  const [sellingInput, setSellingInput] = useState('');
  const [marginInput, setMarginInput] = useState('');
  const [updateSheet, setUpdateSheet] = useState(true);
  const [alignLine, setAlignLine] = useState(false);
  const [minMargin, setMinMargin] = useState(DEFAULT_MIN_MARGIN);
  const [otherDrafts, setOtherDrafts] = useState([]);

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
          const row = found.row;
          setTable(found.table);
          setCurrentStock(parseFloat(row.stock_qty) || 0);
          const isUsd = row.purchase_currency === CURRENCY_USD && row.cost_price_usd != null;
          const init = {
            cost: round2(row.cost_price),
            selling: round2(row.selling_price),
            currency: isUsd ? CURRENCY_USD : CURRENCY_CAD,
            usd: isUsd ? String(row.cost_price_usd) : '',
          };
          setInitial(init);
          setCostInput(init.cost.toFixed(2));
          setSellingInput(init.selling.toFixed(2));
          setCurrency(init.currency);
          setUsdAmount(init.usd);
        }
      } catch (err) {
        if (!cancelled) setError('Lecture du stock impossible: ' + err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  // Seuil de marge minimale (Paramètres) — sert seulement à colorer l'avertissement
  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((result) => {
        const v = parseFloat(result?.data?.min_margin_percent);
        if (!cancelled && Number.isFinite(v)) setMinMargin(v);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Autres BT/BL brouillons (non signés) qui contiennent ce produit: avis seulement
  useEffect(() => {
    let cancelled = false;
    const key = String(code).trim().toUpperCase();
    if (!key) return undefined;
    fetch('/api/inventory/reservations')
      .then((r) => (r.ok ? r.json() : null))
      .then((result) => {
        if (cancelled || !result?.success || !result.details) return;
        const seen = new Set();
        const list = [];
        Object.entries(result.details).forEach(([pid, entries]) => {
          if (String(pid).trim().toUpperCase() !== key) return;
          (entries || []).forEach((d) => {
            const isCurrent =
              (currentDocument?.id != null &&
                d.type === currentDocument.type &&
                String(d.id) === String(currentDocument.id)) ||
              (sourceLabel && d.number === sourceLabel);
            const k = `${d.type}-${d.id}`;
            if (isCurrent || seen.has(k)) return;
            seen.add(k);
            list.push({ key: k, number: d.number, client: d.client });
          });
        });
        setOtherDrafts(list);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [code, currentDocument?.id, currentDocument?.type, sourceLabel]);

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

  // ----- Prix: valeurs dérivées -----
  const isInventory = table === 'products';
  const newCost = round2(costInput);
  const newSelling = round2(sellingInput);
  const sellingValid = sellingInput !== '' && Number.isFinite(parseFloat(sellingInput)) && parseFloat(sellingInput) >= 0;
  const costChanged =
    updateSheet &&
    (newCost !== initial.cost ||
      currency !== initial.currency ||
      (currency === CURRENCY_USD && round2(usdAmount) !== round2(initial.usd)));
  const sellingChanged = sellingValid && newSelling !== initial.selling;
  const hasLine = linePrice != null && Number.isFinite(parseFloat(linePrice));
  const lineDiffers = hasLine && round2(linePrice) !== newSelling;
  const pricesDirty = costChanged || sellingChanged || (alignLine && lineDiffers);
  // Coûtant de référence pour la marge: celui saisi si la fiche est mise à jour, sinon celui de la fiche
  const marginCost = updateSheet ? newCost : initial.cost;
  const marginPercent = marginCost > 0 ? ((newSelling - marginCost) / marginCost) * 100 : null;
  const zeroSelling = sellingValid && newSelling === 0;
  const lowMargin = zeroSelling || (marginPercent !== null && marginPercent < minMargin);

  const changeSelling = (value) => {
    const raw = cleanInput(value).replace('-', '');
    if (!NUMBER_PATTERN.test(raw)) return;
    setSellingInput(raw);
    setMarginInput('');
  };

  // Vendant = coûtant × (1 + %) — même calcul que dans Soumissions
  const applyMargin = (percent) => {
    const pct = parseFloat(percent);
    if (!(marginCost > 0) || !Number.isFinite(pct) || pct < 0) return;
    setSellingInput((marginCost * (1 + pct / 100)).toFixed(2));
  };

  const handleCostChange = (next) => {
    setCurrency(next.currency);
    setUsdAmount(next.usdAmount ?? '');
    setCostInput(next.cad === '' || next.cad == null ? '' : String(next.cad));
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

      if (pricesDirty && !sellingValid) throw new Error('Entrez un prix vendant valide.');

      const row = found.row;
      const updates = {};

      // --- Stock ---
      const stockNow = parseFloat(row.stock_qty) || 0;
      const wantsStock = found.table === 'products' && delta !== 0;
      const target = wantsStock ? Math.max(0, stockNow + delta) : stockNow;
      const applied = target - stockNow;
      if (wantsStock && applied === 0 && !pricesDirty) {
        setCurrentStock(stockNow);
        throw new Error(`Le stock est déjà à ${formatQty(stockNow)}: rien à retirer.`);
      }
      if (applied !== 0) updates.stock_qty = target;

      // --- Prix (fiche): décalage de l'historique + date, comme Inventaire / AF / Soumissions ---
      const writeSheet = updateSheet && (costChanged || sellingChanged);
      if (writeSheet) {
        const newPrices = {};
        if (costChanged) newPrices.cost_price = newCost;
        if (sellingChanged) newPrices.selling_price = newSelling;
        Object.assign(updates, buildPriceShiftUpdates(row, newPrices));
        if (costChanged) {
          // Devise d'achat: garde (ou efface) l'origine USD, pour que « Recalculer USD »
          // ne défasse pas la correction. N'écrit rien si la migration n'est pas passée.
          Object.assign(
            updates,
            await safeCurrencyUpdates(supabase, {
              currency,
              usdAmount,
              marketRate: exchange.rate,
              feePercent: exchange.feePercent,
            })
          );
        }
      }

      const applyToDocument = sellingChanged || (alignLine && lineDiffers);
      if (Object.keys(updates).length === 0 && !applyToDocument) {
        throw new Error('Aucun changement à enregistrer.');
      }

      // .select() confirme qu'une ligne a réellement été modifiée
      if (Object.keys(updates).length > 0) {
        const { data: updated, error: updateError } = await supabase
          .from(found.table)
          .update(updates)
          .eq('product_id', code)
          .select('product_id');
        if (updateError || !updated || updated.length === 0) {
          throw new Error(updateError ? updateError.message : 'aucune ligne modifiée');
        }
      }

      // --- Mouvement d'inventaire: seulement si une quantité a bougé ---
      let movementError = null;
      if (applied !== 0) {
        const unitCost = parseFloat(updates.cost_price ?? row.cost_price) || 0;
        const refNumber = `RD-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
        const note = `Ajustement inventaire${sourceLabel ? ` (depuis ${sourceLabel.replace(/^ce /, 'un ')})` : ''}${notes.trim() ? ` - ${notes.trim()}` : ''}`;
        const res = await supabase
          .from('inventory_movements')
          .insert({
            product_id: code,
            product_description: row.description || product?.description || '',
            product_group: row.product_group || '',
            unit: row.unit || product?.unit || '',
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
        movementError = res.error || null;
      }

      onAdjusted?.({
        code,
        stockChanged: applied !== 0,
        previousStock: stockNow,
        newStock: target,
        movementSaved: !movementError,
        prices: writeSheet || applyToDocument
          ? {
              cost_price: writeSheet && costChanged ? newCost : parseFloat(row.cost_price) || 0,
              selling_price: newSelling,
              sheetUpdated: writeSheet,
              applyToDocument,
            }
          : null,
      });
      if (movementError) {
        alert(
          `Stock ajusté (${formatQty(stockNow)} → ${formatQty(target)}), mais le mouvement n'a pas pu être inscrit dans l'historique: ${movementError.message}`
        );
      }
      onClose();
    } catch (err) {
      setError('Non enregistré: ' + err.message);
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
        aria-label="Ajustement du stock et des prix"
      >
        {/* En-tête (même couleur que le mode Ajustement de la Réception directe) */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white p-4 rounded-t-lg flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Package size={20} /> {isInventory ? 'Ajuster stock / prix' : 'Ajuster les prix'}
            </h3>
            <p className="text-sm text-orange-50">
              {isInventory ? 'Stock en main, coûtant et vendant' : 'Coûtant et vendant (produit non-inventaire)'}
            </p>
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
              <Loader2 className="animate-spin" size={20} /> Lecture de la fiche…
            </div>
          ) : (
            <>
              {isInventory && (
              <section className="space-y-4">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Package size={16} /> Stock
              </h4>
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
                  Note de l&apos;ajustement de stock (optionnel)
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
              </section>
              )}

              {/* ===== Prix ===== */}
              <section className={`space-y-3 ${isInventory ? 'pt-4 border-t dark:border-gray-700' : ''}`}>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <DollarSign size={16} /> Prix
                </h4>

                <CostPriceField
                  label="Coûtant"
                  currency={currency}
                  usdAmount={usdAmount}
                  cadValue={costInput}
                  onChange={handleCostChange}
                  exchange={exchange}
                  disabled={saving || !updateSheet}
                />
                {!updateSheet && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Le coûtant ne se change que sur la fiche: cochez « Mettre à jour la fiche inventaire ».
                  </p>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Vendant ($ CAD)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={sellingInput}
                    onChange={(e) => changeSelling(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    disabled={saving}
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className={`${inputClass} ${
                      lowMargin
                        ? 'border-red-500 text-red-700 dark:text-red-400'
                        : 'border-green-400 dark:border-green-700 text-gray-900 dark:text-gray-100'
                    }`}
                  />
                  <p className={`text-sm mt-1 font-medium flex items-center gap-1 ${
                    lowMargin ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    {lowMargin && <AlertTriangle size={14} className="flex-shrink-0" />}
                    {zeroSelling
                      ? 'Prix vendant à 0 $ — à vérifier'
                      : marginPercent === null
                        ? 'Marge: coûtant à 0 $, impossible à calculer'
                        : `Marge: ${formatMoney(newSelling - marginCost)} (${marginPercent.toFixed(1)} %)${
                            lowMargin ? ` — sous le seuil de ${minMargin} %` : ''
                          }`}
                  </p>
                </div>

                {/* Vendant par % de marge sur le coûtant */}
                <div className="flex items-center gap-2 flex-wrap">
                  {MARGIN_PRESETS.map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => { setMarginInput(''); applyMargin(pct); }}
                      disabled={saving || !(marginCost > 0)}
                      className="min-h-[44px] px-3 rounded-lg bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 font-semibold hover:bg-green-200 dark:hover:bg-green-900/60 disabled:opacity-50"
                    >
                      {pct} %
                    </button>
                  ))}
                  <input
                    type="text"
                    inputMode="decimal"
                    value={marginInput}
                    onChange={(e) => {
                      const raw = cleanInput(e.target.value).replace('-', '');
                      if (!NUMBER_PATTERN.test(raw)) return;
                      setMarginInput(raw);
                      applyMargin(raw);
                    }}
                    onFocus={(e) => e.target.select()}
                    disabled={saving || !(marginCost > 0)}
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    placeholder="Autre %"
                    aria-label="Autre pourcentage de marge"
                    className="w-24 min-h-[44px] px-2 border border-gray-300 dark:border-gray-600 rounded-lg text-center bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50"
                  />
                </div>

                {/* Fiche inventaire ou ce document seulement */}
                <label className="flex items-start gap-3 min-h-[44px] p-2 rounded-lg bg-gray-50 dark:bg-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={updateSheet}
                    onChange={(e) => setUpdateSheet(e.target.checked)}
                    disabled={saving}
                    className="mt-1 h-5 w-5 flex-shrink-0"
                  />
                  <span className="text-sm text-gray-800 dark:text-gray-200">
                    <span className="font-medium">Mettre à jour la fiche inventaire</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                      {updateSheet
                        ? 'Ancien prix conservé dans « Hist. Prix ».'
                        : `Vendant spécial pour ${sourceLabel || 'ce document'} seulement: la fiche ne change pas.`}
                    </span>
                  </span>
                </label>

                {/* La ligne du document n'est pas au prix affiché */}
                {hasLine && lineDiffers && !sellingChanged && (
                  <label className="flex items-start gap-3 min-h-[44px] p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={alignLine}
                      onChange={(e) => setAlignLine(e.target.checked)}
                      disabled={saving}
                      className="mt-1 h-5 w-5 flex-shrink-0"
                    />
                    <span className="text-sm text-amber-900 dark:text-amber-200">
                      Sur {sourceLabel || 'ce document'}, la ligne est à <strong>{formatMoney(round2(linePrice))}</strong>.
                      <span className="block font-medium">Mettre la ligne à {formatMoney(newSelling)}</span>
                    </span>
                  </label>
                )}
                {sellingChanged && (
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Le vendant de {sourceLabel || 'ce document'} passera à {formatMoney(newSelling)}.
                  </p>
                )}

                {otherDrafts.length > 0 && (
                  <div className={`p-3 rounded-lg border text-sm ${
                    pricesDirty
                      ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200'
                      : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                  }`}>
                    <p className="font-medium">
                      Ce produit est aussi dans {otherDrafts.length} autre{otherDrafts.length > 1 ? 's' : ''} brouillon{otherDrafts.length > 1 ? 's' : ''}:
                    </p>
                    <p className="mt-1">
                      {otherDrafts.map((d) => `${d.number}${d.client && d.client !== '—' ? ` (${d.client})` : ''}`).join(', ')}
                    </p>
                    <p className="text-xs mt-1">Leur prix n&apos;est pas modifié: à vérifier dans chacun.</p>
                  </div>
                )}
              </section>
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
            disabled={saving || loading || (!(isInventory && effectiveDelta !== 0) && !pricesDirty)}
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
