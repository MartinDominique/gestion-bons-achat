/**
 * @file app/api/notes/projects/route.js
 * @description Fournit la liste des documents liables à une note (BT/BL/BA/Soumission)
 *              pour le sélecteur du formulaire de note. Retourne { id, number, client_name }.
 *              Utilise supabaseAdmin (bypass RLS) comme les autres routes API.
 *
 *              Filtres appliqués (toujours, pour ne montrer que les documents pertinents):
 *                - BT (work_order)      : statut 'draft' (Brouillons seulement)
 *                - BL (delivery_note)   : statut 'draft' (Brouillons seulement)
 *                - BA (purchase_order)  : statut 'in_progress' (En cours seulement)
 *                - Soumission           : statut 'sent' ou 'accepted' (Envoyée / Acceptée)
 *
 *              Filtre client optionnel (client_id pour BT/BL, client_name pour BA/Soumission).
 * @version 2.0.0
 * @date 2026-06-09
 * @changelog
 *   2.0.0 - Filtres par statut (BT/BL brouillons, BA en cours, Soumissions envoyées/acceptées)
 *           + filtre par client (client_id / client_name)
 *   1.0.0 - Version initiale (Système de Notes MVP)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const LIMIT = 150;

/**
 * GET /api/notes/projects
 * Query params:
 *   - type: work_order | delivery_note | purchase_order | submission (requis)
 *   - search: filtre sur le numéro de document (optionnel)
 *   - client_id: filtre client pour BT/BL (optionnel)
 *   - client_name: filtre client pour BA/Soumission (optionnel)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const search = (searchParams.get('search') || '').trim();
    const clientId = searchParams.get('client_id');
    const clientName = (searchParams.get('client_name') || '').trim();

    let items = [];

    if (type === 'work_order') {
      let q = supabaseAdmin
        .from('work_orders')
        .select('id, bt_number, work_date, client:clients(name)')
        .eq('status', 'draft')
        .order('created_at', { ascending: false })
        .limit(LIMIT);
      if (search) q = q.ilike('bt_number', `%${search}%`);
      if (clientId) q = q.eq('client_id', clientId);
      const { data, error } = await q;
      if (error) throw error;
      items = (data || []).map((r) => ({
        id: r.id,
        number: r.bt_number,
        client_name: r.client?.name || '',
        date: r.work_date || null,
      }));
    } else if (type === 'delivery_note') {
      let q = supabaseAdmin
        .from('delivery_notes')
        .select('id, bl_number, client_name, delivery_date')
        .eq('status', 'draft')
        .order('created_at', { ascending: false })
        .limit(LIMIT);
      if (search) q = q.ilike('bl_number', `%${search}%`);
      if (clientId) q = q.eq('client_id', clientId);
      const { data, error } = await q;
      if (error) throw error;
      items = (data || []).map((r) => ({
        id: r.id,
        number: r.bl_number,
        client_name: r.client_name || '',
        date: r.delivery_date || null,
      }));
    } else if (type === 'purchase_order') {
      let q = supabaseAdmin
        .from('purchase_orders')
        .select('id, po_number, client_name, created_at')
        .eq('status', 'in_progress')
        .order('created_at', { ascending: false })
        .limit(LIMIT);
      if (search) q = q.ilike('po_number', `%${search}%`);
      if (clientName) q = q.eq('client_name', clientName);
      const { data, error } = await q;
      if (error) throw error;
      items = (data || []).map((r) => ({
        id: r.id,
        number: r.po_number,
        client_name: r.client_name || '',
        date: r.created_at || null,
      }));
    } else if (type === 'submission') {
      let q = supabaseAdmin
        .from('submissions')
        .select('id, submission_number, client_name, created_at')
        .in('status', ['sent', 'accepted'])
        .order('created_at', { ascending: false })
        .limit(LIMIT);
      if (search) q = q.ilike('submission_number', `%${search}%`);
      if (clientName) q = q.eq('client_name', clientName);
      const { data, error } = await q;
      if (error) throw error;
      items = (data || []).map((r) => ({
        id: r.id,
        number: r.submission_number,
        client_name: r.client_name || '',
        date: r.created_at || null,
      }));
    } else {
      return NextResponse.json(
        { success: false, error: 'type invalide' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data: items });
  } catch (err) {
    console.error('Erreur GET /api/notes/projects:', err);
    return NextResponse.json(
      { success: false, error: 'Erreur lors du chargement des documents' },
      { status: 500 }
    );
  }
}
