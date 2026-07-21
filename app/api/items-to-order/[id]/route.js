/**
 * @file app/api/items-to-order/[id]/route.js
 * @description API pour un item individuel de la liste « À Commander ».
 *              - GET: Récupère un item
 *              - PUT: Met à jour (quantité, fournisseur suggéré, coûtant, unité,
 *                     description, notes, statut manuel)
 *              - DELETE: Retire définitivement l'item de la liste
 * @version 1.0.0
 * @date 2026-07-21
 * @changelog
 *   1.0.0 - Version initiale (Liste À Commander MVP)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/items-to-order/[id]
 */
export async function GET(request, { params }) {
  try {
    const { id } = params;
    const { data, error } = await supabaseAdmin
      .from('items_to_order')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: 'Item introuvable' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('Erreur GET /api/items-to-order/[id]:', err);
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * PUT /api/items-to-order/[id]
 * Body partiel: { quantity, suggested_supplier, cost_price, unit, description, notes, status }
 */
export async function PUT(request, { params }) {
  try {
    const { id } = params;
    const body = await request.json();

    const updates = { updated_at: new Date().toISOString() };

    if (body.quantity !== undefined) {
      updates.quantity = Math.max(0, parseFloat(body.quantity) || 0);
    }
    if (body.suggested_supplier !== undefined) {
      updates.suggested_supplier = body.suggested_supplier
        ? String(body.suggested_supplier).trim()
        : null;
    }
    if (body.cost_price !== undefined) {
      updates.cost_price =
        body.cost_price === null || body.cost_price === ''
          ? null
          : parseFloat(body.cost_price);
    }
    if (body.unit !== undefined) {
      updates.unit = body.unit ? String(body.unit).trim() : 'UN';
    }
    if (body.description !== undefined) {
      if (!body.description || !String(body.description).trim()) {
        return NextResponse.json(
          { success: false, error: 'La description est requise' },
          { status: 400 }
        );
      }
      updates.description = String(body.description).trim();
    }
    if (body.notes !== undefined) {
      updates.notes = body.notes ? String(body.notes).trim() : null;
    }

    // Changement de statut manuel (ex: remettre 'pending' après annulation d'un AF)
    if (body.status !== undefined) {
      if (!['pending', 'ordered'].includes(body.status)) {
        return NextResponse.json(
          { success: false, error: 'Statut invalide' },
          { status: 400 }
        );
      }
      updates.status = body.status;
      if (body.status === 'pending') {
        updates.ordered_at = null;
        updates.supplier_purchase_id = null;
        updates.supplier_purchase_number = null;
      } else if (body.status === 'ordered') {
        updates.ordered_at = new Date().toISOString();
      }
    }

    const { data, error } = await supabaseAdmin
      .from('items_to_order')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Erreur mise à jour item à commander:', error);
      return NextResponse.json(
        { success: false, error: 'Erreur lors de la mise à jour' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('Erreur PUT /api/items-to-order/[id]:', err);
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * DELETE /api/items-to-order/[id]
 */
export async function DELETE(request, { params }) {
  try {
    const { id } = params;
    const { error } = await supabaseAdmin.from('items_to_order').delete().eq('id', id);

    if (error) {
      console.error('Erreur suppression item à commander:', error);
      return NextResponse.json(
        { success: false, error: 'Erreur lors de la suppression' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erreur DELETE /api/items-to-order/[id]:', err);
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}
