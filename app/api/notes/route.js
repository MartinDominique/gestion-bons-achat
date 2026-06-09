/**
 * @file app/api/notes/route.js
 * @description API CRUD pour le système de Notes.
 *              - GET: Liste les notes (filtres: completed, note_type, recherche)
 *              - POST: Crée une nouvelle note (globale ou liée à un projet)
 * @version 1.0.0
 * @date 2026-06-09
 * @changelog
 *   1.0.0 - Version initiale (Système de Notes MVP)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PROJECT_TYPES = ['work_order', 'delivery_note', 'purchase_order', 'submission'];

/**
 * GET /api/notes
 * Query params:
 *   - completed: 'false' (défaut, notes actives) | 'true' | 'all'
 *   - note_type: 'global' | 'project' (optionnel)
 *   - search: texte recherché dans titre/description (optionnel)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const completed = searchParams.get('completed') || 'false';
    const noteType = searchParams.get('note_type');
    const search = (searchParams.get('search') || '').trim();

    let query = supabaseAdmin.from('notes').select('*');

    if (completed === 'false') query = query.eq('completed', false);
    else if (completed === 'true') query = query.eq('completed', true);
    // 'all' → pas de filtre

    if (noteType && ['global', 'project'].includes(noteType)) {
      query = query.eq('note_type', noteType);
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Tri DB: échéances d'abord (nulls en dernier), puis création.
    // Le tri fin (sans date par création) est finalisé côté client via sortNotes().
    query = query
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('Erreur lecture notes:', error);
      return NextResponse.json(
        { success: false, error: 'Erreur lors de la lecture des notes' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err) {
    console.error('Erreur GET /api/notes:', err);
    return NextResponse.json(
      { success: false, error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/notes
 * Body: { title, description, note_type, project_type, project_id, project_number, due_date, user_id }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      title,
      description = null,
      note_type = 'global',
      project_type = null,
      project_id = null,
      project_number = null,
      due_date = null,
      user_id = null,
    } = body;

    // Validation: titre requis, min 3 caractères
    if (!title || title.trim().length < 3) {
      return NextResponse.json(
        { success: false, error: 'Le titre est requis (minimum 3 caractères)' },
        { status: 400 }
      );
    }

    if (!['global', 'project'].includes(note_type)) {
      return NextResponse.json(
        { success: false, error: 'note_type invalide' },
        { status: 400 }
      );
    }

    // Validation du lien projet
    let cleanProjectType = null;
    let cleanProjectId = null;
    let cleanProjectNumber = null;

    if (note_type === 'project') {
      if (!PROJECT_TYPES.includes(project_type) || !project_id) {
        return NextResponse.json(
          { success: false, error: 'Une note de projet doit référencer un document valide' },
          { status: 400 }
        );
      }
      cleanProjectType = project_type;
      cleanProjectId = project_id;
      cleanProjectNumber = project_number || null;
    }

    const { data, error } = await supabaseAdmin
      .from('notes')
      .insert({
        title: title.trim(),
        description: description ? String(description).trim() : null,
        note_type,
        project_type: cleanProjectType,
        project_id: cleanProjectId,
        project_number: cleanProjectNumber,
        due_date: due_date || null,
        user_id: user_id || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Erreur création note:', error);
      return NextResponse.json(
        { success: false, error: 'Erreur lors de la création de la note' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('Erreur POST /api/notes:', err);
    return NextResponse.json(
      { success: false, error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
