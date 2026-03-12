/**
 * @file app/api/settings/route.js
 * @description API endpoint pour les paramètres globaux de l'application.
 *              - GET: Récupère les paramètres (taux horaires, taxes, facturation)
 *              - PUT: Met à jour les paramètres
 *              - Table singleton (id=1 toujours)
 * @version 1.1.0
 * @date 2026-03-12
 * @changelog
 *   1.1.0 - Ajout champ invoice_ownership_note (message propriété marchandises)
 *   1.0.0 - Version initiale (Phase A Fondations)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/settings
 * Récupère les paramètres globaux (singleton id=1)
 */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('settings')
      .select('*')
      .eq('id', 1)
      .single();

    if (error) {
      // Si la table n'existe pas encore, retourner les défauts
      if (error.code === 'PGRST116' || error.code === '42P01') {
        return NextResponse.json({
          success: true,
          data: {
            id: 1,
            default_hourly_rate: 0,
            hourly_rate_increase_pct: 0,
            hourly_rate_increase_date: null,
            tps_rate: 5.0,
            tvq_rate: 9.975,
            invoice_tps_number: '',
            invoice_tvq_number: '',
            default_payment_terms: 'Net 30 jours',
            invoice_footer_note: '',
            invoice_ownership_note: '',
            invoice_next_number: 1,
          }
        });
      }
      throw error;
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('GET /api/settings error:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur lors de la lecture des paramètres' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings
 * Met à jour les paramètres globaux
 */
export async function PUT(request) {
  try {
    const body = await request.json();

    // Nettoyer les champs — ne garder que les colonnes autorisées
    const allowedFields = [
      'default_hourly_rate',
      'hourly_rate_increase_pct',
      'hourly_rate_increase_date',
      'tps_rate',
      'tvq_rate',
      'invoice_tps_number',
      'invoice_tvq_number',
      'default_payment_terms',
      'invoice_footer_note',
      'invoice_ownership_note',
      'invoice_next_number',
    ];

    const updates = { updated_at: new Date().toISOString() };
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    // Validations de base
    if (updates.default_hourly_rate !== undefined && updates.default_hourly_rate < 0) {
      return NextResponse.json(
        { success: false, error: 'Le taux horaire ne peut pas être négatif' },
        { status: 400 }
      );
    }
    if (updates.tps_rate !== undefined && (updates.tps_rate < 0 || updates.tps_rate > 100)) {
      return NextResponse.json(
        { success: false, error: 'Le taux TPS doit être entre 0 et 100' },
        { status: 400 }
      );
    }
    if (updates.tvq_rate !== undefined && (updates.tvq_rate < 0 || updates.tvq_rate > 100)) {
      return NextResponse.json(
        { success: false, error: 'Le taux TVQ doit être entre 0 et 100' },
        { status: 400 }
      );
    }
    if (updates.invoice_next_number !== undefined && updates.invoice_next_number < 1) {
      return NextResponse.json(
        { success: false, error: 'Le numéro de facture doit être au moins 1' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('settings')
      .update(updates)
      .eq('id', 1)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('PUT /api/settings error:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur lors de la mise à jour des paramètres' },
      { status: 500 }
    );
  }
}
