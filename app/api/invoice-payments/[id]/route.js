/**
 * @file app/api/invoice-payments/[id]/route.js
 * @description API d'un paiement individuel (état de compte client)
 *              - DELETE: supprime un paiement et recalcule le statut de la facture
 * @version 1.0.0
 * @date 2026-06-14
 * @changelog
 *   1.0.0 - Version initiale (module État de compte client)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { recomputeInvoiceStatus } from '../../../../lib/services/invoice-payments';

/**
 * DELETE /api/invoice-payments/[id]
 * Supprime un paiement et recalcule le statut de la facture liée.
 */
export async function DELETE(request, { params }) {
  try {
    const { id } = params;

    // Récupérer le paiement pour connaître la facture liée
    const { data: payment, error: fetchErr } = await supabaseAdmin
      .from('invoice_payments')
      .select('id, invoice_id')
      .eq('id', parseInt(id))
      .single();

    if (fetchErr || !payment) {
      return NextResponse.json(
        { success: false, error: 'Paiement non trouvé' },
        { status: 404 }
      );
    }

    const { error: delErr } = await supabaseAdmin
      .from('invoice_payments')
      .delete()
      .eq('id', parseInt(id));

    if (delErr) {
      console.error('Erreur suppression paiement:', delErr);
      return NextResponse.json(
        { success: false, error: 'Erreur suppression du paiement', details: delErr.message },
        { status: 500 }
      );
    }

    // Recalculer le statut de la facture
    const result = await recomputeInvoiceStatus(supabaseAdmin, payment.invoice_id);

    return NextResponse.json({
      success: true,
      invoice: result,
      message: 'Paiement supprimé',
    });
  } catch (error) {
    console.error('DELETE /api/invoice-payments/[id] error:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur serveur', details: error.message },
      { status: 500 }
    );
  }
}
