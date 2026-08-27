/**
 * @file app/api/exchange-rate/route.js
 * @description Taux de change USD -> CAD pour la saisie des coûtants en devise américaine.
 *              Passe par le serveur (et non le navigateur) pour éviter les blocages CORS
 *              et pour mettre le dernier taux en cache dans `settings`.
 *
 *              Ordre des sources:
 *              1. Banque du Canada (API Valet) — taux officiel, publié chaque jour
 *                 ouvrable vers 16h30 HE. C'est la référence reconnue par l'ARC et
 *                 Revenu Québec.
 *              2. exchangerate-api.com — repli si la Banque du Canada est injoignable.
 *              3. Dernier taux enregistré dans `settings` — l'app reste utilisable
 *                 hors ligne, avec la date du taux affichée à l'utilisateur.
 *              4. Taux de repli codé en dur, en tout dernier recours.
 * @version 1.0.0
 * @date 2026-08-27
 * @changelog
 *   1.0.0 - Version initiale (achats en USD)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { FALLBACK_USD_CAD_RATE, DEFAULT_FX_FEE_PERCENT } from '../../../lib/utils/currency';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BOC_URL = 'https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1';
const FALLBACK_URL = 'https://api.exchangerate-api.com/v4/latest/USD';
const FETCH_TIMEOUT_MS = 6000;

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Banque du Canada — { observations: [{ d: '2026-08-26', FXUSDCAD: { v: '1.3720' } }] } */
async function fetchBankOfCanada() {
  const data = await fetchJson(BOC_URL);
  const observation = data?.observations?.[data.observations.length - 1];
  const rate = parseFloat(observation?.FXUSDCAD?.v);
  if (!isFinite(rate) || rate <= 0) throw new Error('Taux Banque du Canada illisible');
  return { rate, date: observation?.d || null, source: 'Banque du Canada' };
}

async function fetchExchangeRateApi() {
  const data = await fetchJson(FALLBACK_URL);
  const rate = parseFloat(data?.rates?.CAD);
  if (!isFinite(rate) || rate <= 0) throw new Error('Taux CAD non trouvé');
  return { rate, date: data?.date || null, source: 'exchangerate-api.com' };
}

/**
 * GET /api/exchange-rate
 * Retourne { success, rate, rate_date, source, fee_percent, cached, stale }
 */
export async function GET() {
  // Frais bancaires + dernier taux connu (les colonnes peuvent ne pas exister
  // tant que la migration n'a pas été passée: on ne bloque jamais là-dessus).
  let settings = null;
  try {
    const { data } = await supabaseAdmin
      .from('settings')
      .select('usd_fx_fee_percent, usd_cad_rate, usd_cad_rate_date, usd_cad_rate_source')
      .eq('id', 1)
      .maybeSingle();
    settings = data;
  } catch (error) {
    console.error('Lecture settings (taux de change):', error.message);
  }

  const feePercent =
    settings?.usd_fx_fee_percent !== undefined && settings?.usd_fx_fee_percent !== null
      ? parseFloat(settings.usd_fx_fee_percent)
      : DEFAULT_FX_FEE_PERCENT;

  const attempts = [fetchBankOfCanada, fetchExchangeRateApi];
  const failures = [];

  for (const attempt of attempts) {
    try {
      const live = await attempt();

      // Mettre le taux en cache pour les prochains appels (best-effort)
      // Best-effort: si la migration n'a pas encore été passée, les colonnes
      // n'existent pas — le taux reste utilisable, il n'est simplement pas mis en cache.
      try {
        const { error: cacheError } = await supabaseAdmin
          .from('settings')
          .update({
            usd_cad_rate: live.rate,
            usd_cad_rate_date: live.date,
            usd_cad_rate_source: live.source,
            updated_at: new Date().toISOString(),
          })
          .eq('id', 1);
        if (cacheError) {
          console.error('Mise en cache du taux impossible:', cacheError.message);
        }
      } catch (cacheError) {
        console.error('Mise en cache du taux impossible:', cacheError.message);
      }

      return NextResponse.json({
        success: true,
        rate: live.rate,
        rate_date: live.date,
        source: live.source,
        fee_percent: feePercent,
        cached: false,
        stale: false,
      });
    } catch (error) {
      failures.push(error.message);
    }
  }

  // Aucune source jointe: dernier taux connu
  const cachedRate = parseFloat(settings?.usd_cad_rate);
  if (isFinite(cachedRate) && cachedRate > 0) {
    return NextResponse.json({
      success: true,
      rate: cachedRate,
      rate_date: settings.usd_cad_rate_date || null,
      source: settings.usd_cad_rate_source || 'Dernier taux enregistré',
      fee_percent: feePercent,
      cached: true,
      stale: true,
      warning: `Sources injoignables (${failures.join(' / ')}) — dernier taux enregistré utilisé.`,
    });
  }

  return NextResponse.json({
    success: true,
    rate: FALLBACK_USD_CAD_RATE,
    rate_date: null,
    source: 'Taux de repli',
    fee_percent: feePercent,
    cached: true,
    stale: true,
    warning: `Aucun taux disponible (${failures.join(' / ')}) — taux de repli ${FALLBACK_USD_CAD_RATE}. Saisissez le taux manuellement.`,
  });
}
