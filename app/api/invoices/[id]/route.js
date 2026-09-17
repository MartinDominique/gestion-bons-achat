/**
 * @file app/api/invoices/[id]/route.js
 * @description API individuelle pour une facture
 *              - GET: Récupérer une facture complète par ID
 *              - PUT: Mettre à jour une facture (lignes, totaux, statut)
 *              - DELETE: Supprimer une facture (brouillon seulement)
 * @version 1.3.0
 * @date 2026-09-17
 * @changelog
 *   1.3.0 - PUT: accepte jobe_detail_items (détail interne du forfait Prix Jobé). Si la
 *           colonne n'existe pas encore (migration 20260917 non passée), la facture est
 *           mise à jour sans le détail et la réponse porte un warning explicite
 *   1.2.0 - Ajout email_3 + additional_emails au SELECT client (tous les destinataires possibles)
 *   1.1.0 - Ajout email_2 au SELECT client (sélection des destinataires d'envoi facture)
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
        client:clients(id, name, company, address, email, email_admin, email_billing, email_2, email_3, additional_emails, phone, payment_terms, hourly_rate_regular, transport_fee)
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
      'jobe_detail_items',
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

    let { data, error } = await supabaseAdmin
      .from('invoices')
      .update(updates)
      .eq('id', parseInt(id))
      .select()
      .single();

    // Colonne jobe_detail_items absente (migration 20260917 non passée): PostgREST répond
    // PGRST204 ou Postgres 42703. On réessaie sans le détail pour ne pas bloquer la facture.
    let jobeColumnMissing = false;
    if (
      error && 'jobe_detail_items' in updates &&
      (error.code === 'PGRST204' || error.code === '42703') &&
      /jobe_detail_items/.test(error.message || '')
    ) {
      jobeColumnMissing = true;
      console.warn('Colonne invoices.jobe_detail_items absente — facture mise à jour sans le détail du forfait');
      const { jobe_detail_items: _omit, ...rest } = updates;
      ({ data, error } = await supabaseAdmin
        .from('invoices')
        .update(rest)
        .eq('id', parseInt(id))
        .select()
        .single());
    }

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
      warning: jobeColumnMissing
        ? `Facture ${data.invoice_number} mise à jour, MAIS le détail interne du forfait n'a pas pu être enregistré (colonne jobe_detail_items absente — exécuter la migration 20260917_add_invoice_jobe_detail.sql). Le prix forfaitaire est bien sauvegardé.`
        : null,
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
