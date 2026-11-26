/**
 * @file app/api/panel-layouts/[id]/send-enclosure/route.js
 * @description Panneau virtuel — « Envoyer le boîtier à la soumission ».
 *              Ajoute le boîtier retenu comme ligne de la soumission liée à la disposition,
 *              s'il n'y est pas déjà.
 *              - GET  → aperçu, rien n'est modifié: soumission, boîtier (description, vendant,
 *                       coûtant), `already_present`, total actuel et total après ajout
 *              - POST → ajoute la ligne (quantité 1) au format des articles d'une soumission
 *                       (fiche produit complète + quantity + comment) et recalcule
 *                       `amount` (vendant) et `cost_total` (coûtant). Refuse (409) si le
 *                       boîtier est déjà dans la soumission
 *              La confirmation est demandée à l'écran avant le POST.
 * @version 1.0.0
 * @date 2026-11-26
 * @changelog
 *   1.0.0 - Version initiale (Panneau virtuel PR 4)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const fail = (message, status = 400, details) =>
  NextResponse.json({ success: false, error: message, ...(details ? { details } : {}) }, { status });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const round2 = (n) => Math.round(n * 100) / 100;

async function load(id) {
  const { data: layout, error } = await supabaseAdmin
    .from('panel_layouts').select('id, name, enclosure_code, submission_id, submission_number').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!layout) return { problem: fail('Disposition introuvable', 404) };
  if (!layout.enclosure_code) return { problem: fail('Aucun boîtier retenu dans cette disposition') };
  if (!layout.submission_id) return { problem: fail('Cette disposition n\'est liée à aucune soumission') };

  const { data: submission, error: subErr } = await supabaseAdmin
    .from('submissions').select('id, submission_number, client_name, description, status, items, amount, cost_total')
    .eq('id', layout.submission_id).maybeSingle();
  if (subErr) throw subErr;
  if (!submission) return { problem: fail('La soumission liée n\'existe plus', 404) };

  // Fiche produit du boîtier: inventaire d'abord, puis non-inventaire
  const code = layout.enclosure_code;
  let source = 'products';
  let { data: product, error: pErr } = await supabaseAdmin
    .from('products').select('*').eq('product_id', code).maybeSingle();
  if (pErr) throw pErr;
  if (!product) {
    const { data: rows, error: nErr } = await supabaseAdmin
      .from('non_inventory_items').select('*').eq('product_id', code).limit(1);
    if (nErr) throw nErr;
    product = (rows || [])[0] || null;
    source = 'non_inventory';
  }
  if (!product) return { problem: fail(`Le boîtier ${code} n'existe plus dans l'inventaire`, 404) };

  const items = Array.isArray(submission.items) ? submission.items : [];
  const alreadyPresent = items.some((it) => it && String(it.product_id || '').trim() === code);
  const line = { ...product, is_non_inventory: source === 'non_inventory', quantity: 1, comment: '' };
  const nextItems = [...items, line];
  const totals = (list) => ({
    amount: round2(list.reduce((s, it) => s + num(it?.selling_price) * num(it?.quantity), 0)),
    cost_total: round2(list.reduce((s, it) => s + num(it?.cost_price) * num(it?.quantity), 0)),
  });
  return { layout, submission, product, source, items, alreadyPresent, line, nextItems, totals };
}

export async function GET(request, { params }) {
  try {
    if (!UUID_RE.test(params.id)) return fail('Disposition introuvable', 404);
    const ctx = await load(params.id);
    if (ctx.problem) return ctx.problem;
    return NextResponse.json({
      success: true,
      data: {
        submission: {
          id: ctx.submission.id, number: ctx.submission.submission_number, client_name: ctx.submission.client_name,
          description: ctx.submission.description, status: ctx.submission.status, lines: ctx.items.length,
        },
        enclosure: {
          code: ctx.product.product_id, description: ctx.product.description || '',
          selling_price: num(ctx.product.selling_price), cost_price: num(ctx.product.cost_price),
          stock_qty: num(ctx.product.stock_qty),
        },
        already_present: ctx.alreadyPresent,
        amount_before: ctx.totals(ctx.items).amount,
        amount_after: ctx.totals(ctx.nextItems).amount,
      },
    });
  } catch (error) {
    console.error('Erreur GET send-enclosure:', error);
    return fail('Erreur lors de la vérification de la soumission', 500, error?.message);
  }
}

export async function POST(request, { params }) {
  try {
    if (!UUID_RE.test(params.id)) return fail('Disposition introuvable', 404);
    const ctx = await load(params.id);
    if (ctx.problem) return ctx.problem;
    if (ctx.alreadyPresent) {
      return fail(`Le boîtier ${ctx.product.product_id} est déjà dans la soumission ${ctx.submission.submission_number || ''}.`, 409);
    }
    const totals = ctx.totals(ctx.nextItems);
    const { data, error } = await supabaseAdmin
      .from('submissions')
      .update({ items: ctx.nextItems, amount: totals.amount, cost_total: totals.cost_total, updated_at: new Date().toISOString() })
      .eq('id', ctx.submission.id)
      .select('id, submission_number, amount');
    if (error) throw error;
    if (!data || data.length === 0) return fail('La soumission n\'a pas été modifiée (aucune ligne mise à jour).', 500);
    return NextResponse.json({
      success: true,
      data: { submission_number: data[0].submission_number, amount: totals.amount, code: ctx.product.product_id },
    });
  } catch (error) {
    console.error('Erreur POST send-enclosure:', error);
    return fail('Erreur lors de l\'ajout du boîtier à la soumission', 500, error?.message);
  }
}
