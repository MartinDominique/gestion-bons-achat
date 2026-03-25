/**
 * @file app/api/invoices/[id]/route.js
 * @description API individuelle pour une facture
 *              - GET: Récupérer une facture complète par ID
 *              - PUT: Mettre à jour une facture (lignes, totaux, statut)
 *              - DELETE: Supprimer une facture (brouillon seulement)
 * @version 1.0.0
 * @date 2026-02-27
 * @changelog
 *   1.0.0 - Version initiale (Phase B Facturation MVP)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

/**
 * GET /api/invoices/[id]
 * Récupère une facture complète avec les données client
 */
export async function GET(request, { params }) {
  try {
    const { id } = params;

    const { data, error } = await supabaseAdmin
      .from('invoices')
      .select(`
        *,
        client:clients(id, name, company, address, email, email_admin, email_billing, phone, payment_terms, hourly_rate_regular, transport_fee)
      `)
      .eq('id', parseInt(id))
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, error: 'Facture non trouvée' },
          { status: 404 }
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true, data });

  } catch (error) {
    console.error('Erreur API invoices GET [id]:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur serveur', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/invoices/[id]
 * Met à jour une facture existante
 */
export async function PUT(request, { params }) {
  try {
    const { id } = params;
    const body = await request.json();

    const allowedFields = [
      'invoice_date', 'due_date', 'payment_terms',
      'line_items', 'subtotal', 'tps_rate', 'tvq_rate',
      'tps_amount', 'tvq_amount', 'total',
      'total_materials', 'total_labor', 'total_transport',
      'status', 'is_prix_jobe', 'notes',
      'sent_at', 'paid_at',
    ];

    const updates = { updated_at: new Date().toISOString() };
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    // Si on marque comme payée, ajouter le timestamp
    if (body.status === 'paid' && !body.paid_at) {
      updates.paid_at = new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin
      .from('invoices')
      .update(updates)
      .eq('id', parseInt(id))
      .select()
      .single();

    if (error) {
      console.error('Erreur mise à jour facture:', error);
      return NextResponse.json(
        { success: false, error: 'Erreur mise à jour facture', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
      message: `Facture ${data.invoice_number} mise à jour`,
    });

  } catch (error) {
    console.error('Erreur API invoices PUT:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur serveur', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/invoices/[id]
 * Supprime une facture (brouillon seulement) et retire le lien du BT/BL
 */
export async function DELETE(request, { params }) {
  try {
    const { id } = params;

    // Récupérer la facture pour vérifier le statut et libérer le BT/BL
    const { data: invoice, error: fetchError } = await supabaseAdmin
      .from('invoices')
      .select('id, invoice_number, status, source_type, source_id')
      .eq('id', parseInt(id))
      .single();

    if (fetchError) {
      return NextResponse.json(
        { success: false, error: 'Facture non trouvée' },
        { status: 404 }
      );
    }

    if (invoice.status !== 'draft') {
      return NextResponse.json(
        { success: false, error: 'Seules les factures en brouillon peuvent être supprimées' },
        { status: 400 }
      );
    }

    // Retirer le lien invoice_id du BT ou BL source
    const sourceTable = invoice.source_type === 'work_order' ? 'work_orders' : 'delivery_notes';
    await supabaseAdmin
      .from(sourceTable)
      .update({ invoice_id: null })
      .eq('id', invoice.source_id);

    // Supprimer la facture
    const { error: deleteError } = await supabaseAdmin
      .from('invoices')
      .delete()
      .eq('id', parseInt(id));

    if (deleteError) {
      console.error('Erreur suppression facture:', deleteError);
      return NextResponse.json(
        { success: false, error: 'Erreur suppression facture', details: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Facture ${invoice.invoice_number} supprimée avec succès`,
    });

  } catch (error) {
    console.error('Erreur API invoices DELETE:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur serveur', details: error.message },
      { status: 500 }
    );
  }
}
