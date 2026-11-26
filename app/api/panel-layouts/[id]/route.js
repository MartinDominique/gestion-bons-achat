/**
 * @file app/api/panel-layouts/[id]/route.js
 * @description API du « Panneau virtuel » — une disposition.
 *              - GET    → la disposition complète (réglages + pièces)
 *              - PUT    → sauvegarde (automatique ou manuelle). Seuls les champs envoyés
 *                         changent; `version` augmente de 1 à chaque écriture. Si le corps
 *                         porte `version` et qu'elle ne correspond plus à celle en base
 *                         (disposition modifiée sur un autre appareil) → 409, rien n'est écrit
 *              - DELETE → supprime la disposition (confirmation faite à l'écran)
 * @version 1.1.0
 * @date 2026-11-26
 * @changelog
 *   1.1.0 - Passage à « approuvé »: une copie est gardée dans panel_layout_versions (historique)
 *   1.0.0 - Version initiale (Panneau virtuel PR 2)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { sanitizeLayoutFields, snapshotLayout } from '../../../../lib/services/panel-layouts';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const fail = (message, status = 400, details) =>
  NextResponse.json({ success: false, error: message, ...(details ? { details } : {}) }, { status });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request, { params }) {
  try {
    if (!UUID_RE.test(params.id)) return fail('Disposition introuvable', 404);
    const { data, error } = await supabaseAdmin
      .from('panel_layouts').select('*').eq('id', params.id).maybeSingle();
    if (error) throw error;
    if (!data) return fail('Disposition introuvable', 404);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Erreur GET panel-layouts/[id]:', error);
    return fail('Erreur lors du chargement de la disposition', 500, error?.message);
  }
}

export async function PUT(request, { params }) {
  try {
    if (!UUID_RE.test(params.id)) return fail('Disposition introuvable', 404);
    const body = await request.json();
    let fields;
    try {
      fields = sanitizeLayoutFields(body || {});
    } catch (e) {
      return fail(e.message);
    }

    const { data: current, error: readErr } = await supabaseAdmin
      .from('panel_layouts').select('id, version, status').eq('id', params.id).maybeSingle();
    if (readErr) throw readErr;
    if (!current) return fail('Disposition introuvable', 404);

    const sentVersion = Number.isInteger(body?.version) ? body.version : null;
    if (sentVersion !== null && sentVersion !== current.version) {
      return fail(
        'Cette disposition a été modifiée ailleurs (autre appareil ou autre onglet). Rechargez la page avant de continuer.',
        409
      );
    }

    // Verrou optimiste: l'écriture ne passe que si la version n'a pas bougé entre-temps
    const { data, error } = await supabaseAdmin
      .from('panel_layouts')
      .update({ ...fields, version: current.version + 1 })
      .eq('id', params.id)
      .eq('version', current.version)
      .select('id, version, updated_at, status');
    if (error) throw error;
    if (!data || data.length === 0) {
      return fail('Cette disposition vient d\'être modifiée ailleurs. Rechargez la page avant de continuer.', 409);
    }

    // Brouillon → approuvé: on garde une copie de la version approuvée
    let warning;
    if (fields.status === 'approved' && current.status !== 'approved') {
      try {
        const { data: full, error: fullErr } = await supabaseAdmin
          .from('panel_layouts').select('*').eq('id', params.id).single();
        if (fullErr) throw fullErr;
        await snapshotLayout(full, { reason: 'approved' });
      } catch (e) {
        console.error('Copie de la version approuvée:', e?.message || e);
        warning = 'Disposition approuvée, mais la copie dans l\'historique des versions a échoué.';
      }
    }
    return NextResponse.json({ success: true, data: data[0], ...(warning ? { warning } : {}) });
  } catch (error) {
    console.error('Erreur PUT panel-layouts/[id]:', error);
    return fail('Erreur lors de l\'enregistrement de la disposition', 500, error?.message);
  }
}

export async function DELETE(request, { params }) {
  try {
    if (!UUID_RE.test(params.id)) return fail('Disposition introuvable', 404);
    const { data, error } = await supabaseAdmin
      .from('panel_layouts').delete().eq('id', params.id).select('id');
    if (error) throw error;
    if (!data || data.length === 0) return fail('Disposition introuvable', 404);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur DELETE panel-layouts/[id]:', error);
    return fail('Erreur lors de la suppression de la disposition', 500, error?.message);
  }
}
