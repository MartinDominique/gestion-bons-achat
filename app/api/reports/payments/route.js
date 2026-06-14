/**
 * @file app/api/reports/payments/route.js
 * @description API rapport de paiements (journal des encaissements) pour le comptable.
 *              - GET: paiements reçus durant une période (mensuelle, annuelle ou
 *                personnalisée), une ligne par paiement, avec la facture appliquée.
 *              - Totaux: total encaissé, total escompte, sous-totaux par mode de paiement.
 * @version 1.0.0
 * @date 2026-06-14
 * @changelog
 *   1.0.0 - Version initiale (rapports comptables ventes/paiements)
 */

import { NextResponse } from 'next/server';
import { buildPaymentsReport } from '../../../../lib/services/report-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/reports/payments?month=YYYY-MM | year=YYYY | date_from=&date_to=
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await buildPaymentsReport(searchParams);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    console.error('Erreur API reports/payments:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur serveur', details: error.message },
      { status: 500 }
    );
  }
}
