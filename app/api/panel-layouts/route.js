/**
 * @file app/api/panel-layouts/route.js
 * @description API du « Panneau virtuel » — dispositions (table panel_layouts).
 *              - GET  → liste des dispositions (sans les pièces), la plus récente d'abord
 *              - POST { name, project_code, client_name, ... } → nouvelle disposition vide
 *              - POST { duplicate_from: id, name? }            → copie d'une disposition
 *                (brouillon, version 1; le lien soumission/BT n'est pas copié)
 *              - POST { from_submission: id }                  → disposition créée depuis une soumission:
 *                les pièces « sur le fond » sont déposées dans la zone « à placer », à droite d'un
 *                fond vide; le reste est classé dans import_report (hors fond, dimensions
 *                manquantes, ignorées)
 *              - GET ?mode=submissions&search=                 → soumissions à proposer (N°, client, description)
 *              Passe par supabaseAdmin (même modèle que panel_specs).
 * @version 1.0.0
 * @date 2026-11-25
 * @changelog
 *   1.0.0 - Version initiale (Panneau virtuel PR 2)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { LAYOUT_LIST_COLS, sanitizeLayoutFields, sanitizeItems, buildItemsFromLines } from '../../../lib/services/panel-layouts';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const fail = (message, status = 400, details) =>
  NextResponse.json({ success: false, error: message, ...(details ? { details } : {}) }, { status });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get('mode') === 'submissions') {
      const search = (searchParams.get('search') || '').trim().replace(/[%,()]/g, ' ');
      let query = supabaseAdmin
        .from('submissions')
        .select('id, submission_number, client_name, description, status, created_at')
        .order('created_at', { ascending: false })
        .limit(40);
      if (search) {
        query = query.or(`submission_number.ilike.%${search}%,client_name.ilike.%${search}%,description.ilike.%${search}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ success: true, data: data || [] });
    }

    const rows = [];
    for (let page = 0; ; page++) {
      const { data, error } = await supabaseAdmin
        .from('panel_layouts')
        .select(LAYOUT_LIST_COLS)
        .order('updated_at', { ascending: false })
        .order('id', { ascending: true })
        .range(page * 1000, page * 1000 + 999);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error('Erreur GET panel-layouts:', error);
    return fail('Erreur lors du chargement des dispositions', 500, error?.message);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const userId = body?.user_id && UUID_RE.test(String(body.user_id)) ? body.user_id : null;
    let row;

    if (body?.from_submission != null) {
      const subId = parseInt(body.from_submission, 10);
      if (!subId) return fail('Soumission invalide');
      const { data: sub, error: subErr } = await supabaseAdmin
        .from('submissions').select('id, submission_number, client_name, description, items').eq('id', subId).maybeSingle();
      if (subErr) throw subErr;
      if (!sub) return fail('Soumission introuvable', 404);
      const lines = (Array.isArray(sub.items) ? sub.items : []).map((it) => ({
        code: it?.product_id ? String(it.product_id).trim() : '',
        description: it?.description || '',
        quantity: it?.quantity,
      }));
      const plateWidth = 600;
      const { items, report } = await buildItemsFromLines(lines, plateWidth);
      row = {
        name: (body.name && String(body.name).trim()) || `${sub.submission_number || 'Soumission'} — ${sub.description || sub.client_name || ''}`.slice(0, 120),
        project_code: body.project_code ? String(body.project_code).trim().slice(0, 120) : null,
        client_name: sub.client_name || null,
        submission_id: sub.id,
        submission_number: sub.submission_number || null,
        plate_width_mm: plateWidth,
        plate_height_mm: 600,
        items: sanitizeItems(items),
        import_report: { ...report, source: 'submission', number: sub.submission_number, lines: lines.length, imported_at: new Date().toISOString() },
        user_id: userId,
      };
    } else if (body?.duplicate_from) {
      if (!UUID_RE.test(String(body.duplicate_from))) return fail('Disposition à dupliquer invalide');
      const { data: src, error: srcErr } = await supabaseAdmin
        .from('panel_layouts').select('*').eq('id', body.duplicate_from).maybeSingle();
      if (srcErr) throw srcErr;
      if (!src) return fail('Disposition à dupliquer introuvable', 404);
      const { id, created_at, updated_at, version, status, submission_id, submission_number,
        work_order_id, work_order_number, user_id, ...copy } = src;
      row = { ...copy, name: (body.name && String(body.name).trim()) || `${src.name} (copie)`, user_id: userId };
    } else {
      let fields;
      try {
        fields = sanitizeLayoutFields(body || {});
      } catch (e) {
        return fail(e.message);
      }
      if (!fields.name) return fail('Le nom de la disposition est requis');
      row = { ...fields, user_id: userId };
    }

    const { data, error } = await supabaseAdmin.from('panel_layouts').insert(row).select('*').single();
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Erreur POST panel-layouts:', error);
    return fail('Erreur lors de la création de la disposition', 500, error?.message);
  }
}
