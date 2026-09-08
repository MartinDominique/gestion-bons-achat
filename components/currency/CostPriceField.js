/**
 * @file components/currency/CostPriceField.js
 * @description Champ « Prix coûtant » partagé, avec bascule CAD / USD.
 *              Un article acheté en dollars américains se saisit en USD; le champ
 *              convertit immédiatement en CAD (taux du marché + frais bancaires)
 *              et c'est TOUJOURS le montant CAD qui est enregistré dans cost_price.
 *              Le reste de l'application (soumissions, AF, BT/BL, factures,
 *              rapports) continue donc de travailler uniquement en CAD.
 *
 *              Exporte aussi useExchangeRate(), le hook qui va chercher le taux
 *              via /api/exchange-rate (Banque du Canada, avec replis).
 * @version 1.1.0
 * @date 2026-09-08
 * @changelog
 *   1.1.0 - Export de CurrencyToggle (bascule CAD | USD à deux segments) pour que les
 *           tableaux de lignes (AF, Réception directe) montrent clairement la devise
 *           active — un bouton « USD » seul ne disait pas que le coûtant était en CAD.
 *   1.0.0 - Version initiale (achats en USD)
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  CURRENCY_CAD,
  CURRENCY_USD,
  DEFAULT_FX_FEE_PERCENT,
  FALLBACK_USD_CAD_RATE,
  convertCadToUsd,
  convertUsdToCad,
  effectiveUsdToCadRate,
  formatRate,
  formatRateDate,
} from '../../lib/utils/currency';

/**
 * Récupère le taux USD -> CAD courant et les frais bancaires configurés.
 * Le taux peut être remplacé manuellement (relevé bancaire en main).
 */
export function useExchangeRate() {
  const [rate, setRate] = useState(FALLBACK_USD_CAD_RATE);
  const [feePercent, setFeePercent] = useState(DEFAULT_FX_FEE_PERCENT);
  const [rateDate, setRateDate] = useState(null);
  const [source, setSource] = useState(null);
  const [warning, setWarning] = useState('');
  const [loading, setLoading] = useState(false);
  const [manual, setManual] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/exchange-rate');
      const result = await res.json();
      if (result?.success && result.rate) {
        setRate(parseFloat(result.rate));
        setRateDate(result.rate_date || null);
        setSource(result.source || null);
        setWarning(result.warning || '');
        setManual(false);
        if (result.fee_percent !== undefined && result.fee_percent !== null) {
          setFeePercent(parseFloat(result.fee_percent));
        }
      } else {
        setWarning('Taux indisponible — saisissez-le manuellement.');
      }
    } catch (error) {
      console.error('Taux de change indisponible:', error);
      setWarning('Taux indisponible — saisissez-le manuellement.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const overrideRate = useCallback((value) => {
    const parsed = parseFloat(value);
    if (isFinite(parsed) && parsed > 0) {
      setRate(parsed);
      setManual(true);
      setSource('Taux saisi manuellement');
      setRateDate(null);
    }
  }, []);

  return {
    rate,
    feePercent,
    rateDate,
    source,
    warning,
    loading,
    manual,
    refresh,
    overrideRate,
    setFeePercent,
  };
}

const INPUT_BASE =
  'w-full rounded-lg border shadow-sm p-3 dark:bg-gray-800 dark:text-gray-100 min-h-[44px]';

/**
 * @param {Object} props
 * @param {string} props.label            Libellé du champ (défaut « Prix coûtant ($) »)
 * @param {'CAD'|'USD'} props.currency    Devise d'achat courante
 * @param {string|number} props.usdAmount Montant USD saisi
 * @param {string|number} props.cadValue  Coûtant CAD (valeur enregistrée)
 * @param {Function} props.onChange       ({currency, usdAmount, cad, rate, feePercent}) => void
 * @param {Object} props.exchange         Résultat de useExchangeRate()
 * @param {boolean} props.disabled
 * @param {Function} props.onEnter        Appelé sur Entrée (sauvegarde rapide)
 */
export default function CostPriceField({
  label = 'Prix coûtant ($)',
  currency = CURRENCY_CAD,
  usdAmount = '',
  cadValue = '',
  onChange,
  exchange,
  disabled = false,
  onEnter,
}) {
  const [showRateEditor, setShowRateEditor] = useState(false);
  const [rateDraft, setRateDraft] = useState('');

  const { rate, feePercent, rateDate, source, warning, loading, manual, refresh, overrideRate } =
    exchange;

  const isUsd = currency === CURRENCY_USD;
  const convertedCad = isUsd ? convertUsdToCad(usdAmount, rate, feePercent) : null;

  const emit = (patch) => {
    const next = {
      currency,
      usdAmount,
      cad: parseFloat(cadValue) || 0,
      rate,
      feePercent,
      ...patch,
    };
    onChange?.(next);
  };

  const switchCurrency = (nextCurrency) => {
    if (nextCurrency === currency) return;

    if (nextCurrency === CURRENCY_USD) {
      // Ne jamais perdre un coûtant déjà saisi: on le repasse en USD à l'envers
      // (montant CAD / taux effectif) plutôt que de repartir de zéro.
      let nextUsd = usdAmount;
      if (!nextUsd && parseFloat(cadValue) > 0) {
        const reversed = convertCadToUsd(cadValue, rate, feePercent);
        if (reversed !== null) nextUsd = reversed.toFixed(2);
      }
      emit({
        currency: CURRENCY_USD,
        usdAmount: nextUsd,
        cad: convertUsdToCad(nextUsd, rate, feePercent) ?? parseFloat(cadValue) ?? 0,
      });
    } else {
      // Retour en CAD: on garde le montant CAD déjà calculé
      emit({ currency: CURRENCY_CAD, usdAmount: '' });
    }
  };

  const handleUsdChange = (value) => {
    emit({ usdAmount: value, cad: convertUsdToCad(value, rate, feePercent) ?? 0 });
  };

  const applyRate = () => {
    const parsed = parseFloat(rateDraft);
    if (!isFinite(parsed) || parsed <= 0) return;
    overrideRate(parsed);
    setShowRateEditor(false);
    emit({ rate: parsed, cad: convertUsdToCad(usdAmount, parsed, feePercent) ?? 0 });
  };

  const handleRefresh = async () => {
    await refresh();
  };

  const keyDown = (e) => {
    if (e.key === 'Enter' && onEnter) {
      e.preventDefault();
      onEnter();
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
        {/* Bascule CAD / USD */}
        <CurrencyToggle value={currency} onChange={switchCurrency} disabled={disabled} />
      </div>

      {!isUsd && (
        <input
          type="number"
          step="0.01"
          min="0"
          value={cadValue}
          disabled={disabled}
          onChange={(e) => emit({ cad: e.target.value })}
          onFocus={(e) => e.target.select()}
          onKeyDown={keyDown}
          className={`${INPUT_BASE} border-orange-300 dark:border-orange-700 focus:border-orange-500 focus:ring-orange-500`}
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      )}

      {isUsd && (
        <div className="space-y-2">
          <div className="relative">
            <input
              type="number"
              step="0.01"
              min="0"
              value={usdAmount}
              disabled={disabled}
              onChange={(e) => handleUsdChange(e.target.value)}
              onFocus={(e) => e.target.select()}
              onKeyDown={keyDown}
              placeholder="Coûtant en dollars américains"
              className={`${INPUT_BASE} pr-16 border-blue-300 dark:border-blue-700 focus:border-blue-500 focus:ring-blue-500`}
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-blue-700 dark:text-blue-300">
              USD
            </span>
          </div>

          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 space-y-1">
            <div className="text-sm text-blue-900 dark:text-blue-200">
              {usdAmount ? parseFloat(usdAmount || 0).toFixed(2) : '0.00'} USD &times;{' '}
              {formatRate(rate)} + {parseFloat(feePercent || 0).toFixed(1)} % de frais ={' '}
              <strong className="text-green-700 dark:text-green-400">
                {(convertedCad ?? 0).toFixed(2)} $ CAD
              </strong>
            </div>
            <div className="text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2 flex-wrap">
              <span>
                Taux effectif {formatRate(effectiveUsdToCadRate(rate, feePercent))}
                {source ? ` — ${source}` : ''}
                {rateDate ? ` (${formatRateDate(rateDate)})` : ''}
              </span>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading || disabled}
                className="inline-flex items-center gap-1 underline hover:no-underline disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                Actualiser
              </button>
              <button
                type="button"
                onClick={() => {
                  setRateDraft(rate ? rate.toString() : '');
                  setShowRateEditor((v) => !v);
                }}
                disabled={disabled}
                className="underline hover:no-underline disabled:opacity-50"
              >
                Saisir le taux
              </button>
            </div>

            {manual && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Taux saisi manuellement — il ne sera pas actualisé automatiquement.
              </p>
            )}
            {warning && (
              <p className="text-xs text-amber-700 dark:text-amber-400">{warning}</p>
            )}

            {showRateEditor && (
              <div className="flex gap-2 pt-1">
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={rateDraft}
                  onChange={(e) => setRateDraft(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applyRate();
                    }
                  }}
                  placeholder="1.3720"
                  className="flex-1 rounded border border-blue-300 dark:border-blue-700 p-2 text-sm dark:bg-gray-800 dark:text-gray-100 min-h-[44px]"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={applyRate}
                  className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 min-h-[44px]"
                >
                  Appliquer
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const TOGGLE_SIZES = {
  xs: 'px-1.5 py-0.5 text-[10px]',
  sm: 'px-2 py-1 text-[11px]',
  md: 'px-3 py-1.5 text-xs',
};

const TOGGLE_TITLES = {
  [CURRENCY_CAD]: {
    active: 'Coûtant saisi en dollars canadiens',
    inactive: 'Revenir à une saisie en dollars canadiens',
  },
  [CURRENCY_USD]: {
    active: 'Coûtant saisi en dollars américains (converti en CAD)',
    inactive: 'Saisir ce coûtant en dollars américains',
  },
};

/**
 * Bascule « CAD | USD » à deux segments: la devise active est toujours visible
 * (CAD sur fond foncé, USD sur fond bleu) et l'autre reste cliquable.
 * À utiliser partout où un coûtant peut se saisir dans l'une ou l'autre devise,
 * plutôt qu'un bouton « USD » seul qui ne dit pas dans quelle devise on est.
 */
export function CurrencyToggle({
  value = CURRENCY_CAD,
  onChange,
  disabled = false,
  size = 'md',
  className = '',
}) {
  const pad = TOGGLE_SIZES[size] || TOGGLE_SIZES.md;
  return (
    <div
      role="group"
      aria-label="Devise du coûtant"
      className={`inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden ${className}`}
    >
      {[CURRENCY_CAD, CURRENCY_USD].map((code) => {
        const active = value === code;
        return (
          <button
            key={code}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => {
              if (!active) onChange?.(code);
            }}
            title={TOGGLE_TITLES[code][active ? 'active' : 'inactive']}
            className={`${pad} font-semibold transition-colors ${
              active
                ? code === CURRENCY_USD
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-white dark:bg-gray-600'
                : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            } disabled:opacity-50`}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Petite pastille « USD » à afficher à côté d'un article acheté en devise américaine.
 */
export function UsdBadge({ currency, costPriceUsd, className = '' }) {
  if (currency !== CURRENCY_USD) return null;
  const usd = parseFloat(costPriceUsd);
  return (
    <span
      title={
        isFinite(usd)
          ? `Acheté en USD (${usd.toFixed(2)} USD) — coûtant converti en CAD`
          : 'Article acheté en dollars américains — coûtant converti en CAD'
      }
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 ${className}`}
    >
      USD
    </span>
  );
}
