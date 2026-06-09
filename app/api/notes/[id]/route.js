/**
 * @file app/api/notes/[id]/route.js
 * @description API pour une note individuelle.
 *              - GET: Récupère une note
 *              - PUT: Met à jour une note (édition + toggle complété)
 *              - DELETE: Supprime définitivement une note
 * @version 1.1.0
 * @date 2026-06-09
 * @changelog
 *   1.1.0 - Support du client associé à une note (client_id, client_name)
 *   1.0.0 - Version initiale (Système de Notes MVP)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PROJECT_TYPES = ['work_order', 'delivery_note', 'purchase_order', 'submission'];

/**
 * GET /api/notes/[id]
 */
export async function GET(request, { params }) {
  try {
    const { id } = params;
    const { data, error } = await supabaseAdmin
      .from('notes')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: 'Note introuvable' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('Erreur GET /api/notes/[id]:', err);
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * PUT /api/notes/[id]
 * Body partiel: { title, description, note_type, project_type, project_id,
 *                 project_number, due_date, completed }
 * Si `completed` change, completed_at est géré automatiquement.
 */
export async function PUT(request, { params }) {
  try {
    const { id } = params;
    const body = await request.json();

    const updates = { updated_at: new Date().toISOString() };

    if (body.title !== undefined) {
      if (!body.title || body.title.trim().length < 3) {
        return NextResponse.json(
          { success: false, error: 'Le titre est requis (minimum 3 caractères)' },
          { status: 400 }
        );
      }
      updates.title = body.title.trim();
    }

    if (body.description !== undefined) {
      updates.description = body.description ? String(body.description).trim() : null;
    }

    if (body.due_date !== undefined) {
      updates.due_date = body.due_date || null;
    }

    // Gestion du lien projet
    if (body.note_type !== undefined) {
      if (!['global', 'project'].includes(body.note_type)) {
        return NextResponse.json({ success: false, error: 'note_type invalide' }, { status: 400 });
      }
      updates.note_type = body.note_type;

      if (body.note_type === 'global') {
        updates.project_type = null;
        updates.project_id = null;
        updates.project_number = null;
      } else {
        const ptype = body.project_type;
        if (!PROJECT_TYPES.includes(ptype) || !body.project_id) {
          return NextResponse.json(
            { success: false, error: 'Une note de projet doit référencer un document valide' },
            { status: 400 }
          );
        }
        updates.project_type = ptype;
        updates.project_id = body.project_id;
        updates.project_number = body.project_number || null;
      }
    }

    // Client associé (optionnel, indépendant du lien projet)
    if (body.client_id !== undefined) {
      updates.client_id = body.client_id || null;
    }
    if (body.client_name !== undefined) {
      updates.client_name = body.client_name ? String(body.client_name).trim() : null;
    }

    // Toggle complété
    if (body.completed !== undefined) {
      updates.completed = !!body.completed;
      updates.completed_at = body.completed ? new Date().toISOString() : null;
    }

    const { data, error } = await supabaseAdmin
      .from('notes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Erreur mise à jour note:', error);
      return NextResponse.json(
        { success: false, error: 'Erreur lors de la mise à jour de la note' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('Erreur PUT /api/notes/[id]:', err);
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * DELETE /api/notes/[id]
 */
export async function DELETE(request, { params }) {
  try {
    const { id } = params;
    const { error } = await supabaseAdmin.from('notes').delete().eq('id', id);

    if (error) {
      console.error('Erreur suppression note:', error);
      return NextResponse.json(
        { success: false, error: 'Erreur lors de la suppression de la note' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erreur DELETE /api/notes/[id]:', err);
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}
