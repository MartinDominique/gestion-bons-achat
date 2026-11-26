/**
 * @file app/api/panel-specs/route.js
 * @description API du « Panneau virtuel » — fiches techniques (table panel_specs).
 *              - GET ?code=CODE            → { spec } (avec URL signées des photos) ou spec: null
 *              - GET ?mode=status          → { statuses: { CODE: 'ok'|'missing'|'inactive' } }
 *                                            pour les pastilles et le filtre de l'Inventaire
 *                                            (1 requête par écran)
 *              - GET ?mode=products&filter=yes|missing
 *                                          → fiches produit (products + non_inventory_items)
 *                                            dont la case « Panneau virtuel » est cochée
 *                                            (missing = dimensions manquantes seulement)
 *              - PUT { product_code, ...champs } → crée ou met à jour la fiche (upsert par code).
 *                                            Seuls les champs envoyés sont modifiés; décocher
 *                                            la case = { active: false }, rien n'est effacé.
 *              Passe par supabaseAdmin (même modèle que product_associations).
 * @version 1.1.0
 * @date 2026-11-25
 * @changelog
 *   1.1.0 - GET ?mode=library: fiches actives enrichies de la fiche produit (description, coûtant,
 *           vendant, stock) pour la bibliothèque et les suggestions de boîtiers de l'éditeur
 *   1.0.0 - Version initiale (Panneau virtuel PR 1)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { cleanCode, fetchAllSpecs, withPhotoUrls } from '../../../lib/services/panel-specs';
import { panelStatus, sanitizeSpecPayload } from '../../../lib/panel/specs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const fail = (message, status = 400, details) =>
  NextResponse.json({ success: false, error: message, ...(details ? { details } : {}) }, { status });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function productsByCodes(codes) {
  const rows = [];
  for (let i = 0; i < codes.length; i += 200) {
    const chunk = codes.slice(i, i + 200);
    const [p, n] = await Promise.all([
      supabaseAdmin.from('products').select('*').in('product_id', chunk),
      supabaseAdmin.from('non_inventory_items').select('*').in('product_id', chunk),
    ]);
    if (p.error) throw p.error;
    if (n.error) throw n.error;
    rows.push(
      ...(p.data || []).map((r) => ({ ...r, _source: 'products' })),
      ...(n.data || []).map((r) => ({ ...r, _source: 'non_inventory' })),
    );
  }
  return rows.sort((a, b) => String(a.product_id).localeCompare(String(b.product_id)));
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || '';

    if (mode === 'status' || mode === 'products') {
      const specs = await fetchAllSpecs();
      const statuses = {};
      specs.forEach((s) => { statuses[s.product_code] = panelStatus(s); });

      if (mode === 'status') {
        return NextResponse.json({ success: true, statuses });
      }

      const filter = searchParams.get('filter') === 'missing' ? 'missing' : 'yes';
      const codes = Object.keys(statuses).filter((c) =>
        filter === 'missing' ? statuses[c] === 'missing' : statuses[c] === 'ok' || statuses[c] === 'missing'
      );
      const data = await productsByCodes(codes);
      return NextResponse.json({ success: true, data, total: data.length, statuses });
    }

    if (mode === 'library') {
      const specs = (await fetchAllSpecs()).filter((s) => s.active);
      const products = await productsByCodes(specs.map((s) => s.product_code));
      const byCode = {};
      products.forEach((p) => { if (!byCode[p.product_id]) byCode[p.product_id] = p; });
      const data = specs.map((s) => {
        const p = byCode[s.product_code];
        return {
          ...s,
          status: panelStatus(s),
          description: p?.description || '',
          cost_price: p?.cost_price != null ? parseFloat(p.cost_price) : null,
          selling_price: p?.selling_price != null ? parseFloat(p.selling_price) : null,
          stock_qty: p?.stock_qty != null ? parseFloat(p.stock_qty) : null,
          product_found: !!p,
          _source: p?._source || null,
        };
      });
      return NextResponse.json({ success: true, data });
    }

    const code = cleanCode(searchParams.get('code'));
    if (!code) return fail('Paramètre « code » requis');

    const { data, error } = await supabaseAdmin
      .from('panel_specs').select('*').eq('product_code', code).maybeSingle();
    if (error) throw error;

    return NextResponse.json({ success: true, spec: data ? await withPhotoUrls(data) : null });
  } catch (error) {
    console.error('Erreur GET panel-specs:', error);
    return fail('Erreur lors de la lecture de la fiche Panneau virtuel', 500, error?.message);
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const code = cleanCode(body?.product_code);
    if (!code) return fail('Code produit requis');

    let fields;
    try {
      fields = sanitizeSpecPayload(body || {});
    } catch (e) {
      return fail(e.message);
    }
    if (body?.updated_by && UUID_RE.test(String(body.updated_by))) {
      fields.updated_by = body.updated_by;
    }

    // Le produit doit exister (inventaire ou non-inventaire)
    const [p, n] = await Promise.all([
      supabaseAdmin.from('products').select('product_id').eq('product_id', code).limit(1),
      supabaseAdmin.from('non_inventory_items').select('product_id').eq('product_id', code).limit(1),
    ]);
    if (p.error) throw p.error;
    if (n.error) throw n.error;
    if ((p.data || []).length === 0 && (n.data || []).length === 0) {
      return fail(`Produit introuvable: ${code}`, 404);
    }

    const { data: existing, error: readErr } = await supabaseAdmin
      .from('panel_specs').select('id').eq('product_code', code).maybeSingle();
    if (readErr) throw readErr;

    const query = existing
      ? supabaseAdmin.from('panel_specs').update(fields).eq('id', existing.id)
      : supabaseAdmin.from('panel_specs').insert({ ...fields, product_code: code });
    const { data: saved, error: saveErr } = await query.select('*').single();
    if (saveErr) throw saveErr;

    return NextResponse.json({
      success: true,
      spec: await withPhotoUrls(saved),
      status: panelStatus(saved),
    });
  } catch (error) {
    console.error('Erreur PUT panel-specs:', error);
    return fail('Erreur lors de l\'enregistrement de la fiche Panneau virtuel', 500, error?.message);
  }
}
