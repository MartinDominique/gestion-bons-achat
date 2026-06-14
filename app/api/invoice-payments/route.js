/**
 * @file app/api/invoice-payments/route.js
 * @description API des paiements de factures (état de compte client)
 *              - GET: liste les paiements (filtre invoice_id ou client_id)
 *              - POST: enregistre un paiement (partiel/complet) + recalcule le statut
 *                de la facture (amount_paid, paid/partial/sent)
 * @version 1.0.0
 * @date 2026-06-14
 * @changelog
 *   1.0.0 - Version initiale (module État de compte client)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { recomputeInvoiceStatus } from '../../../lib/services/invoice-payments';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/invoice-payments?invoice_id=&client_id=
 * Liste les paiements pour une facture ou un client.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const invoiceId = searchParams.get('invoice_id');
    const clientId = searchParams.get('client_id');

    let query = supabaseAdmin
      .from('invoice_payments')
      .select('*')
      .order('payment_date', { ascending: false })
      .order('id', { ascending: false });

    if (invoiceId) query = query.eq('invoice_id', parseInt(invoiceId));
    if (clientId) query = query.eq('client_id', parseInt(clientId));

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('GET /api/invoice-payments error:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur lors de la lecture des paiements' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/invoice-payments
 * Enregistre un paiement et recalcule le statut de la facture.
 * Body: { invoice_id, amount, discount_applied, payment_date, method, reference, notes }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      invoice_id,
      amount = 0,
      discount_applied = 0,
      payment_date,
      method = 'cheque',
      reference,
      notes,
    } = body;

    if (!invoice_id) {
      return NextResponse.json(
        { success: false, error: 'invoice_id requis' },
        { status: 400 }
      );
    }

    const amountNum = parseFloat(amount) || 0;
    const discountNum = parseFloat(discount_applied) || 0;

    if (amountNum <= 0 && discountNum <= 0) {
      return NextResponse.json(
        { success: false, error: 'Le montant du paiement doit être supérieur à 0' },
        { status: 400 }
      );
    }

    if (!['cheque', 'virement', 'comptant', 'autre'].includes(method)) {
      return NextResponse.json(
        { success: false, error: 'Méthode de paiement invalide' },
        { status: 400 }
      );
    }

    // Récupérer la facture pour client_id et validation du solde
    const { data: invoice, error: invErr } = await supabaseAdmin
      .from('invoices')
      .select('id, client_id, total, amount_paid, invoice_number')
      .eq('id', parseInt(invoice_id))
      .single();

    if (invErr || !invoice) {
      return NextResponse.json(
        { success: false, error: 'Facture non trouvée' },
        { status: 404 }
      );
    }

    const paymentData = {
      invoice_id: parseInt(invoice_id),
      client_id: invoice.client_id,
      amount: Math.round(amountNum * 100) / 100,
      discount_applied: Math.round(discountNum * 100) / 100,
      payment_date: payment_date || new Date().toISOString().split('T')[0],
      method,
      reference: reference || null,
      notes: notes || null,
    };

    const { data: payment, error: payErr } = await supabaseAdmin
      .from('invoice_payments')
      .insert([paymentData])
      .select()
      .single();

    if (payErr) {
      console.error('Erreur insertion paiement:', payErr);
      return NextResponse.json(
        { success: false, error: 'Erreur enregistrement du paiement', details: payErr.message },
        { status: 500 }
      );
    }

    // Recalculer amount_paid + statut de la facture
    const result = await recomputeInvoiceStatus(supabaseAdmin, invoice_id);

    return NextResponse.json({
      success: true,
      data: payment,
      invoice: result,
      message: `Paiement enregistré sur la facture ${invoice.invoice_number}`,
    });
  } catch (error) {
    console.error('POST /api/invoice-payments error:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur serveur', details: error.message },
      { status: 500 }
    );
  }
}
