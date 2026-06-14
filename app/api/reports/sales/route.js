/**
 * @file app/api/reports/sales/route.js
 * @description API rapport de ventes pour le comptable.
 *              - GET: factures émises (sent/partial/paid, brouillons exclus) d'une période
 *                (mensuelle, annuelle ou personnalisée) avec ventilation + totaux agrégés.
 *              - Sert l'aperçu/téléchargement (client) et l'envoi par courriel (serveur).
 * @version 1.0.0
 * @date 2026-06-14
 * @changelog
 *   1.0.0 - Version initiale (rapports comptables ventes/paiements)
 */

import { NextResponse } from 'next/server';
import { buildSalesReport } from '../../../../lib/services/report-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/reports/sales?month=YYYY-MM | year=YYYY | date_from=&date_to=
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await buildSalesReport(searchParams);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    console.error('Erreur API reports/sales:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur serveur', details: error.message },
      { status: 500 }
    );
  }
}
