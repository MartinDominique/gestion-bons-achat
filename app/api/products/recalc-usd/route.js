/**
 * @file app/api/products/recalc-usd/route.js
 * @description Recalcule le coûtant CAD de tous les articles achetés en USD,
 *              à partir du taux de change courant et des frais bancaires configurés.
 *              - GET  : aperçu (aucune écriture) — liste des articles et l'écart calculé
 *              - POST : applique les nouveaux coûtants, avec décalage de l'historique
 *                       des prix (buildPriceShiftUpdates) comme n'importe quel autre
 *                       changement de prix, donc « Hist. Prix » reste fidèle.
 *              Le prix VENDANT n'est jamais touché: c'est une décision commerciale,
 *              pas une conséquence du taux de change.
 * @version 1.0.0
 * @date 2026-08-27
 * @changelog
 *   1.0.0 - Version initiale (achats en USD)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { buildPriceShiftUpdates } from '../../../../lib/utils/priceShift';
import { convertUsdToCad, CURRENCY_USD, DEFAULT_FX_FEE_PERCENT } from '../../../../lib/utils/currency';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TABLES = ['products', 'non_inventory_items'];

async function loadUsdItems() {
  const items = [];
  for (const table of TABLES) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select('*')
      .eq('purchase_currency', CURRENCY_USD);

    // La colonne peut ne pas exister si la migration n'a pas été passée
    if (error) {
      const message = error.message || '';
      if (message.includes('purchase_currency')) {
        throw new Error(
          "La colonne purchase_currency n'existe pas encore — exécutez la migration " +
          '20260827_add_usd_purchase_currency.sql dans Supabase.'
        );
      }
      throw error;
    }
    (data || []).forEach((row) => items.push({ ...row, _table: table }));
  }
  return items;
}

function buildPreview(items, rate, feePercent) {
  return items.map((item) => {
    const usd = parseFloat(item.cost_price_usd);
    const oldCost = parseFloat(item.cost_price) || 0;
    const newCost = isFinite(usd) ? convertUsdToCad(usd, rate, feePercent) : null;
    return {
      table: item._table,
      product_id: item.product_id,
      description: item.description || '',
      cost_price_usd: isFinite(usd) ? usd : null,
      old_cost: oldCost,
      new_cost: newCost,
      delta: newCost !== null ? Math.round((newCost - oldCost) * 100) / 100 : null,
      skipped: newCost === null ? 'Coûtant USD manquant' : null,
    };
  });
}

async function resolveFeePercent(bodyFee) {
  if (bodyFee !== undefined && bodyFee !== null && isFinite(parseFloat(bodyFee))) {
    return parseFloat(bodyFee);
  }
  const { data } = await supabaseAdmin
    .from('settings')
    .select('usd_fx_fee_percent')
    .eq('id', 1)
    .maybeSingle();
  const fee = parseFloat(data?.usd_fx_fee_percent);
  return isFinite(fee) ? fee : DEFAULT_FX_FEE_PERCENT;
}

/** GET /api/products/recalc-usd?rate=1.3720[&fee=3.5] — aperçu sans écriture */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const rate = parseFloat(searchParams.get('rate'));
    if (!isFinite(rate) || rate <= 0) {
      return NextResponse.json(
        { success: false, error: 'Taux de change manquant ou invalide' },
        { status: 400 }
      );
    }

    const feePercent = await resolveFeePercent(searchParams.get('fee'));
    const items = await loadUsdItems();
    const preview = buildPreview(items, rate, feePercent);

    return NextResponse.json({
      success: true,
      rate,
      fee_percent: feePercent,
      total: preview.length,
      changed: preview.filter((p) => p.delta !== null && p.delta !== 0).length,
      items: preview,
    });
  } catch (error) {
    console.error('GET /api/products/recalc-usd:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/** POST /api/products/recalc-usd  body: { rate, fee_percent? } — applique */
export async function POST(request) {
  try {
    const body = await request.json();
    const rate = parseFloat(body?.rate);
    if (!isFinite(rate) || rate <= 0) {
      return NextResponse.json(
        { success: false, error: 'Taux de change manquant ou invalide' },
        { status: 400 }
      );
    }

    const feePercent = await resolveFeePercent(body?.fee_percent);
    const items = await loadUsdItems();

    const updated = [];
    const unchanged = [];
    const failed = [];
    const now = new Date().toISOString();

    for (const item of items) {
      const usd = parseFloat(item.cost_price_usd);
      if (!isFinite(usd)) {
        failed.push({ product_id: item.product_id, error: 'Coûtant USD manquant' });
        continue;
      }

      const newCost = convertUsdToCad(usd, rate, feePercent);
      const oldCost = parseFloat(item.cost_price) || 0;

      if (newCost === oldCost) {
        unchanged.push(item.product_id);
        continue;
      }

      // Même chemin que tout autre changement de prix: l'historique est décalé
      const updates = {
        ...buildPriceShiftUpdates(item, { cost_price: newCost }),
        fx_rate_used: rate,
        fx_fee_percent_used: feePercent,
        fx_converted_at: now,
      };

      const { data, error } = await supabaseAdmin
        .from(item._table)
        .update(updates)
        .eq('product_id', item.product_id)
        .select('product_id');

      if (error) {
        failed.push({ product_id: item.product_id, error: error.message });
        continue;
      }
      if (!data || data.length === 0) {
        failed.push({ product_id: item.product_id, error: 'Aucune ligne modifiée' });
        continue;
      }

      updated.push({
        product_id: item.product_id,
        old_cost: oldCost,
        new_cost: newCost,
        delta: Math.round((newCost - oldCost) * 100) / 100,
      });
    }

    return NextResponse.json({
      success: failed.length === 0,
      rate,
      fee_percent: feePercent,
      updated_count: updated.length,
      unchanged_count: unchanged.length,
      failed_count: failed.length,
      updated,
      failed,
    });
  } catch (error) {
    console.error('POST /api/products/recalc-usd:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
