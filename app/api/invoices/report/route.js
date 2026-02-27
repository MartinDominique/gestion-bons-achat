/**
 * @file app/api/invoices/report/route.js
 * @description API rapport mensuel Acomba pour saisie comptable
 *              - GET: Retourne toutes les factures d'un mois avec ventilation
 *              - Inclut les totaux agrégés (matériaux, temps, déplacements, TPS, TVQ)
 * @version 1.0.0
 * @date 2026-02-27
 * @changelog
 *   1.0.0 - Version initiale (Phase C — Rapport Acomba)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/invoices/report?month=YYYY-MM
 * Retourne toutes les factures d'un mois donné avec ventilation et totaux agrégés
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { success: false, error: 'Paramètre month requis au format YYYY-MM' },
        { status: 400 }
      );
    }

    // Calculer les bornes du mois
    const [year, mon] = month.split('-');
    const startDate = `${year}-${mon}-01`;
    const endDay = new Date(parseInt(year), parseInt(mon), 0).getDate();
    const endDate = `${year}-${mon}-${String(endDay).padStart(2, '0')}`;

    // Récupérer toutes les factures du mois (sans pagination)
    const { data: invoices, error } = await supabaseAdmin
      .from('invoices')
      .select(`
        id,
        invoice_number,
        client_id,
        client_name,
        source_type,
        source_number,
        invoice_date,
        subtotal,
        tps_rate,
        tvq_rate,
        tps_amount,
        tvq_amount,
        total,
        total_materials,
        total_labor,
        total_transport,
        status,
        is_prix_jobe,
        paid_at
      `)
      .gte('invoice_date', startDate)
      .lte('invoice_date', endDate)
      .order('invoice_date', { ascending: true })
      .order('invoice_number', { ascending: true });

    if (error) {
      console.error('Erreur récupération rapport:', error);
      return NextResponse.json(
        { success: false, error: 'Erreur récupération des factures', details: error.message },
        { status: 500 }
      );
    }

    const data = invoices || [];

    // Calculer les totaux agrégés
    const totals = data.reduce((acc, inv) => {
      acc.total_materials += parseFloat(inv.total_materials) || 0;
      acc.total_labor += parseFloat(inv.total_labor) || 0;
      acc.total_transport += parseFloat(inv.total_transport) || 0;
      acc.subtotal += parseFloat(inv.subtotal) || 0;
      acc.tps_amount += parseFloat(inv.tps_amount) || 0;
      acc.tvq_amount += parseFloat(inv.tvq_amount) || 0;
      acc.total += parseFloat(inv.total) || 0;
      return acc;
    }, {
      total_materials: 0,
      total_labor: 0,
      total_transport: 0,
      subtotal: 0,
      tps_amount: 0,
      tvq_amount: 0,
      total: 0,
    });

    // Arrondir à 2 décimales
    Object.keys(totals).forEach(key => {
      totals[key] = Math.round(totals[key] * 100) / 100;
    });

    return NextResponse.json({
      success: true,
      data: {
        month,
        invoices: data,
        count: data.length,
        totals,
      },
    });

  } catch (error) {
    console.error('Erreur API invoices report:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur serveur', details: error.message },
      { status: 500 }
    );
  }
}
