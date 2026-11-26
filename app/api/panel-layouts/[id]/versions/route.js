/**
 * @file app/api/panel-layouts/[id]/versions/route.js
 * @description Panneau virtuel — historique de versions d'une disposition.
 *              - GET                 → liste des versions (sans le contenu), la plus récente d'abord
 *              - GET ?version_id=ID  → une version AVEC son contenu (pour la restaurer dans l'éditeur)
 *              - POST { label? }     → enregistre la disposition telle qu'elle est en base comme
 *                                      nouvelle version (« Enregistrer une version »)
 *              Les versions « approuvé » sont créées automatiquement par le PUT de la disposition.
 *              La restauration se fait dans l'éditeur (elle reste annulable, puis sauvegardée).
 * @version 1.0.0
 * @date 2026-11-26
 * @changelog
 *   1.0.0 - Version initiale (Panneau virtuel PR 4)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { snapshotLayout } from '../../../../../lib/services/panel-layouts';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const fail = (message, status = 400, details) =>
  NextResponse.json({ success: false, error: message, ...(details ? { details } : {}) }, { status });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request, { params }) {
  try {
    if (!UUID_RE.test(params.id)) return fail('Disposition introuvable', 404);
    const versionId = new URL(request.url).searchParams.get('version_id');

    if (versionId) {
      if (!UUID_RE.test(versionId)) return fail('Version introuvable', 404);
      const { data, error } = await supabaseAdmin
        .from('panel_layout_versions').select('*').eq('id', versionId).eq('layout_id', params.id).maybeSingle();
      if (error) throw error;
      if (!data) return fail('Version introuvable', 404);
      return NextResponse.json({ success: true, data });
    }

    const { data, error } = await supabaseAdmin
      .from('panel_layout_versions')
      .select('id, layout_version, reason, label, created_at')
      .eq('layout_id', params.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('Erreur GET panel-layouts/[id]/versions:', error);
    return fail('Erreur lors du chargement des versions', 500, error?.message);
  }
}

export async function POST(request, { params }) {
  try {
    if (!UUID_RE.test(params.id)) return fail('Disposition introuvable', 404);
    const body = await request.json().catch(() => ({}));
    const { data: row, error } = await supabaseAdmin
      .from('panel_layouts').select('*').eq('id', params.id).maybeSingle();
    if (error) throw error;
    if (!row) return fail('Disposition introuvable', 404);
    const userId = body?.user_id && UUID_RE.test(String(body.user_id)) ? body.user_id : null;
    const version = await snapshotLayout(row, { reason: 'manual', label: body?.label, userId });
    return NextResponse.json({ success: true, data: version });
  } catch (error) {
    console.error('Erreur POST panel-layouts/[id]/versions:', error);
    return fail('Erreur lors de l\'enregistrement de la version', 500, error?.message);
  }
}
