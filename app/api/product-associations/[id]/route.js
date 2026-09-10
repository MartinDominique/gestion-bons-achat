/**
 * @file app/api/product-associations/[id]/route.js
 * @description Un lien « item associé » individuel.
 *              - PUT { default_quantity?, notes? } → modifie la quantité par défaut / note
 *              - DELETE → retire le lien (les produits ne sont jamais touchés)
 * @version 1.0.0
 * @date 2026-09-10
 * @changelog
 *   1.0.0 - Version initiale (Items associés MVP)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function PUT(request, { params }) {
  try {
    const { id } = params;
    const body = await request.json();
    const updates = { updated_at: new Date().toISOString() };

    if (body.default_quantity !== undefined) {
      const q = parseFloat(body.default_quantity);
      if (!(q > 0)) {
        return NextResponse.json(
          { success: false, error: 'La quantité par défaut doit être supérieure à 0.' },
          { status: 400 }
        );
      }
      updates.default_quantity = q;
    }
    if (body.notes !== undefined) {
      updates.notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;
    }

    const { data, error } = await supabaseAdmin
      .from('product_associations')
      .update(updates)
      .eq('id', id)
      .select('id, parent_code, child_code, default_quantity, notes, created_at, updated_at')
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Erreur PUT product-associations/[id]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = params;
    const { error } = await supabaseAdmin
      .from('product_associations')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur DELETE product-associations/[id]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
