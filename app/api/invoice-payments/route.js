/**
 * @file app/api/invoice-payments/route.js
 * @description API des paiements de factures (état de compte client)
 *              - GET: liste les paiements (filtre invoice_id ou client_id)
 *              - POST: enregistre un paiement (partiel/complet) + recalcule le statut
 *                de la facture (amount_paid, paid/partial/sent)
 * @version 1.3.0
 * @date 2026-09-14
 * @changelog
 *   1.3.0 - Anti-double paiement: le montant ne peut pas dépasser le solde RESTANT de la
 *           facture (calculé depuis les lignes de paiement, fiable même si un recalcul
 *           précédent a échoué); refus explicite « déjà réglée ». Le paiement n'est plus
 *           laissé en base « à moitié enregistré »: si le recalcul du statut échoue après
 *           l'insertion (2 tentatives), la ligne insérée est retirée et l'erreur renvoyée
 *           dit clairement que rien n'a été enregistré. Détail DB dans `details`.
 *   1.2.0 - Note de crédit (facture à total négatif): montant négatif accepté
 *           (remboursement au client ou application du crédit), refusé sur une
 *           facture ordinaire
 *   1.1.0 - Modes de paiement validés via la liste partagée (ajout d'Interac)
 *   1.0.0 - Version initiale (module État de compte client)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { PAYMENT_METHOD_VALUES } from '../../../lib/constants/paymentMethods';
import { recomputeInvoiceStatus, loadInvoiceBalance } from '../../../lib/services/invoice-payments';

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

    if (!PAYMENT_METHOD_VALUES.includes(method)) {
      return NextResponse.json(
        { success: false, error: 'Méthode de paiement invalide' },
        { status: 400 }
      );
    }

    // Récupérer la facture + son solde restant réel (lignes de paiement + crédit
    // historique) pour client_id et validation du montant
    let loaded;
    try {
      loaded = await loadInvoiceBalance(supabaseAdmin, invoice_id);
    } catch (readErr) {
      console.error('Lecture facture pour paiement:', readErr);
      return NextResponse.json(
        { success: false, error: 'Lecture de la facture impossible — aucun paiement enregistré, réessayez', details: readErr.message },
        { status: 500 }
      );
    }

    if (!loaded) {
      return NextResponse.json(
        { success: false, error: 'Facture non trouvée' },
        { status: 404 }
      );
    }

    const { invoice, balance: remaining, isCredit: isCreditNote } = loaded;

    // Sens du montant: une facture ordinaire s'encaisse (montant positif); une note de
    // crédit (total négatif) se règle par un montant négatif (remboursement au client
    // ou application du crédit sur une autre facture).
    const signed = amountNum + discountNum;

    if (Math.abs(signed) < 0.005) {
      return NextResponse.json(
        { success: false, error: 'Le montant du paiement ne peut pas être 0' },
        { status: 400 }
      );
    }
    if (!isCreditNote && signed < 0) {
      return NextResponse.json(
        { success: false, error: 'Le montant du paiement doit être supérieur à 0' },
        { status: 400 }
      );
    }
    if (isCreditNote && signed > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `La facture ${invoice.invoice_number} est une note de crédit: le montant doit être négatif (remboursement ou application du crédit)`,
        },
        { status: 400 }
      );
    }

    // Garde-fou anti-double enregistrement: une facture déjà réglée refuse tout nouveau
    // paiement, et un paiement ne peut pas dépasser le solde restant (tolérance 1 cent
    // d'arrondi). Un client qui paie trop se traite par une note de crédit, pas par un
    // surpaiement invisible.
    const fmt = (n) => `${(Number(n) || 0).toFixed(2).replace('.', ',')} $`;
    if (Math.abs(remaining) <= 0.005) {
      return NextResponse.json(
        {
          success: false,
          error: `La facture ${invoice.invoice_number} est déjà réglée (solde 0,00 $) — paiement refusé pour éviter un double enregistrement. Rechargez l'état de compte.`,
        },
        { status: 409 }
      );
    }
    if (!isCreditNote && signed > remaining + 0.01) {
      return NextResponse.json(
        {
          success: false,
          error: `Le paiement (${fmt(signed)}) dépasse le solde restant de la facture ${invoice.invoice_number} (${fmt(remaining)}). Déjà crédité: ${fmt(loaded.credited)}.`,
        },
        { status: 400 }
      );
    }
    if (isCreditNote && signed < remaining - 0.01) {
      return NextResponse.json(
        {
          success: false,
          error: `Le règlement (${fmt(signed)}) dépasse le crédit restant de la note ${invoice.invoice_number} (${fmt(remaining)}).`,
        },
        { status: 400 }
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

    // Recalculer amount_paid + statut de la facture (2 tentatives: un raté passager de
    // Supabase ne doit pas laisser un paiement enregistré sans que la facture le sache)
    let result = null;
    let recomputeErr = null;
    for (let attempt = 1; attempt <= 2 && !result; attempt++) {
      try {
        result = await recomputeInvoiceStatus(supabaseAdmin, invoice_id);
      } catch (err) {
        recomputeErr = err;
        console.error(`Recalcul statut facture (tentative ${attempt}):`, err);
      }
    }

    if (!result) {
      // Compensation: retirer la ligne insérée pour que l'erreur renvoyée soit vraie
      // (« rien n'a été enregistré ») et que l'utilisateur puisse réessayer sans doublon.
      const { error: rollbackErr } = await supabaseAdmin
        .from('invoice_payments')
        .delete()
        .eq('id', payment.id);

      if (rollbackErr) {
        console.error('Annulation du paiement impossible après échec du recalcul:', rollbackErr);
        return NextResponse.json(
          {
            success: false,
            error: `Le paiement sur la facture ${invoice.invoice_number} a été enregistré, mais le statut de la facture n'a pas pu être mis à jour. NE PAS le ressaisir: rechargez l'état de compte.`,
            details: recomputeErr?.message,
            payment_recorded: true,
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: `Erreur lors de la mise à jour de la facture ${invoice.invoice_number} — aucun paiement enregistré, réessayez.`,
          details: recomputeErr?.message,
          payment_recorded: false,
        },
        { status: 500 }
      );
    }

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
