/**
 * @file app/api/statements/[clientId]/route.js
 * @description API état de compte détaillé d'un client
 *              - GET: client + factures ouvertes (solde > 0) avec paiements appliqués,
 *                jours de retard, intérêts, tranches de vieillissement (aging) et totaux.
 * @version 1.0.0
 * @date 2026-06-14
 * @changelog
 *   1.0.0 - Version initiale (module État de compte client)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { computeInterest, daysOverdue, agingBucket } from '../../../../lib/services/invoice-payments';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const EPSILON = 0.005;

/**
 * GET /api/statements/[clientId]
 * État de compte complet d'un client (factures impayées + paiements).
 */
export async function GET(request, { params }) {
  try {
    const { clientId } = params;

    // Client + coordonnées + courriels
    const { data: client, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('id, name, company, address, email, email_billing, email_admin, email_2, email_3, contact_name, contact_name_2, contact_name_3, contact_name_admin, phone, payment_terms')
      .eq('id', parseInt(clientId))
      .single();

    if (clientErr || !client) {
      return NextResponse.json(
        { success: false, error: 'Client non trouvé' },
        { status: 404 }
      );
    }

    // Paramètres (taux d'intérêt + note pied de relevé + numéros taxes)
    const { data: settings } = await supabaseAdmin
      .from('settings')
      .select('late_interest_annual_rate, statement_footer_note, invoice_tps_number, invoice_tvq_number')
      .eq('id', 1)
      .single();
    const interestRate = Number(settings?.late_interest_annual_rate) || 0;

    // Factures émises de ce client
    const { data: invoices, error: invErr } = await supabaseAdmin
      .from('invoices')
      .select('id, invoice_number, source_number, source_type, invoice_date, due_date, payment_terms, subtotal, total, amount_paid, status')
      .eq('client_id', parseInt(clientId))
      .in('status', ['sent', 'partial', 'paid'])
      .order('invoice_date', { ascending: true });

    if (invErr) throw invErr;

    // Ne garder que les factures avec solde dû
    const openInvoices = (invoices || []).filter(
      inv => (Number(inv.total) || 0) - (Number(inv.amount_paid) || 0) > EPSILON
    );

    // Paiements de ces factures
    const ids = openInvoices.map(i => i.id);
    let paymentsByInvoice = {};
    if (ids.length > 0) {
      const { data: payments } = await supabaseAdmin
        .from('invoice_payments')
        .select('*')
        .in('invoice_id', ids)
        .order('payment_date', { ascending: true });
      for (const p of payments || []) {
        if (!paymentsByInvoice[p.invoice_id]) paymentsByInvoice[p.invoice_id] = [];
        paymentsByInvoice[p.invoice_id].push(p);
      }
    }

    const now = new Date();
    const aging = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
    let totalBalance = 0;
    let totalInterest = 0;

    const lines = openInvoices.map(inv => {
      const total = Number(inv.total) || 0;
      const credited = Number(inv.amount_paid) || 0;
      const balance = Math.round((total - credited) * 100) / 100;
      const od = daysOverdue(inv.due_date, now);
      const interest = computeInterest(balance, inv.due_date, interestRate, now);
      const bucket = agingBucket(inv.due_date, now);

      aging[bucket] += balance;
      totalBalance += balance;
      totalInterest += interest;

      return {
        id: inv.id,
        invoice_number: inv.invoice_number,
        source_number: inv.source_number,
        source_type: inv.source_type,
        invoice_date: inv.invoice_date,
        due_date: inv.due_date,
        payment_terms: inv.payment_terms,
        subtotal: Number(inv.subtotal) || 0,
        total,
        amount_paid: credited,
        balance,
        days_overdue: od,
        interest,
        aging_bucket: bucket,
        status: inv.status,
        payments: paymentsByInvoice[inv.id] || [],
      };
    });

    Object.keys(aging).forEach(k => { aging[k] = Math.round(aging[k] * 100) / 100; });
    totalBalance = Math.round(totalBalance * 100) / 100;
    totalInterest = Math.round(totalInterest * 100) / 100;

    return NextResponse.json({
      success: true,
      data: {
        client,
        invoices: lines,
        aging,
        totals: {
          balance: totalBalance,
          interest: totalInterest,
          total_with_interest: Math.round((totalBalance + totalInterest) * 100) / 100,
          open_count: lines.length,
        },
        interest_rate: interestRate,
        statement_footer_note: settings?.statement_footer_note || null,
        statement_date: now.toISOString().split('T')[0],
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
