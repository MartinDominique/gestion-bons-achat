/**
 * @file app/api/statements/[clientId]/route.js
 * @description API état de compte détaillé d'un client
 *              - GET: client + factures ouvertes (solde > 0) avec paiements appliqués,
 *                jours de retard, intérêts, tranches de vieillissement (aging) et totaux.
 *              - Paramètre ?as_of=YYYY-MM-DD: relevé à une date passée (ex. fin juillet).
 *                Les factures émises après cette date et les paiements reçus après
 *                cette date sont exclus.
 * @version 1.2.0
 * @date 2026-08-20
 * @changelog
 *   1.2.0 - Date du relevé (?as_of) + calcul déplacé dans lib/services/statement-data.js
 *   1.1.0 - Retourne le mode de paiement habituel du client (preferred_payment_method)
 *   1.0.0 - Version initiale (module État de compte client)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { buildStatement } from '../../../../lib/services/statement-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/statements/[clientId]?as_of=YYYY-MM-DD
 * État de compte complet d'un client (factures impayées + paiements) à la date demandée.
 */
export async function GET(request, { params }) {
  try {
    const { clientId } = params;
    const asOf = new URL(request.url).searchParams.get('as_of');

    const statement = await buildStatement(supabaseAdmin, clientId, { asOf });

    if (!statement) {
      return NextResponse.json(
        { success: false, error: 'Client non trouvé' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        client: statement.client,
        invoices: statement.invoices,
        aging: statement.aging,
        totals: statement.totals,
        interest_rate: statement.interestRate,
        statement_footer_note: statement.settings?.statement_footer_note || null,
        statement_date: statement.statementDate,
        is_today: statement.is_today,
      },
    });
  } catch (error) {
    console.error('GET /api/statements/[clientId] error:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur serveur', details: error.message },
      { status: 500 }
    );
  }
}
