/**
 * @file app/api/statements/route.js
 * @description API liste des états de compte clients
 *              - GET: liste des clients avec leur solde dû (factures non payées),
 *                nb de factures ouvertes, montant en retard, intérêts estimés.
 *                Param ?all=true pour inclure les clients sans solde.
 *                Param ?search= pour filtrer par nom de client.
 *              - Les notes de crédit (factures à total négatif) réduisent le solde du
 *                client; un client dont le compte est créditeur reste listé.
 * @version 1.1.0
 * @date 2026-09-02
 * @changelog
 *   1.1.0 - Notes de crédit prises en compte: solde net (charges - crédits), champ
 *           credit_balance par client, clients au solde créditeur listés
 *   1.0.0 - Version initiale (module État de compte client)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { computeInterest, daysOverdue } from '../../../lib/services/invoice-payments';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const EPSILON = 0.005;

/**
 * GET /api/statements
 * Agrège les factures par client pour produire la liste des états de compte.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeAll = searchParams.get('all') === 'true';
    const search = (searchParams.get('search') || '').trim().toLowerCase();

    // Taux d'intérêt configurable
    const { data: settings } = await supabaseAdmin
      .from('settings')
      .select('late_interest_annual_rate')
      .eq('id', 1)
      .single();
    const interestRate = Number(settings?.late_interest_annual_rate) || 0;

    // Toutes les factures émises (hors brouillon)
    const { data: invoices, error } = await supabaseAdmin
      .from('invoices')
      .select('id, client_id, client_name, total, amount_paid, status, due_date, invoice_date')
      .in('status', ['sent', 'partial', 'paid']);

    if (error) throw error;

    const now = new Date();
    const byClient = new Map();

    for (const inv of invoices || []) {
      const total = Number(inv.total) || 0;
      const balance = total - (Number(inv.amount_paid) || 0);
      // Note de crédit (facture à total négatif): son solde créditeur reste ouvert
      // tant qu'il n'est pas remboursé/appliqué, et vient réduire le solde du client.
      const isCredit = total < -EPSILON;
      const isOpen = Math.abs(balance) > EPSILON;

      const key = inv.client_id ?? `name:${inv.client_name}`;
      if (!byClient.has(key)) {
        byClient.set(key, {
          client_id: inv.client_id || null,
          client_name: inv.client_name || 'Client inconnu',
          open_count: 0,
          credit_count: 0,
          total_invoices: 0,
          balance: 0,
          credit_balance: 0,
          overdue_balance: 0,
          interest: 0,
          oldest_due_date: null,
          max_days_overdue: 0,
        });
      }
      const agg = byClient.get(key);
      agg.total_invoices += 1;

      if (isOpen) {
        agg.balance += balance;
        if (isCredit) {
          // Ni retard ni intérêts sur un crédit
          agg.credit_count += 1;
          agg.credit_balance += Math.abs(balance);
        } else {
          agg.open_count += 1;
          const od = daysOverdue(inv.due_date, now);
          if (od > 0) {
            agg.overdue_balance += balance;
            agg.interest += computeInterest(balance, inv.due_date, interestRate, now);
            if (od > agg.max_days_overdue) agg.max_days_overdue = od;
            if (!agg.oldest_due_date || inv.due_date < agg.oldest_due_date) {
              agg.oldest_due_date = inv.due_date;
            }
          }
        }
      }
    }

    let list = Array.from(byClient.values()).map(c => {
      const balance = Math.round(c.balance * 100) / 100;
      // Compte soldé ou créditeur: aucun intérêt de retard à réclamer
      const interest = balance > EPSILON ? Math.round(c.interest * 100) / 100 : 0;
      return {
        ...c,
        balance,
        credit_balance: Math.round(c.credit_balance * 100) / 100,
        overdue_balance: Math.round(c.overdue_balance * 100) / 100,
        interest,
      };
    });

    if (!includeAll) {
      // Solde créditeur inclus: un crédit à appliquer doit rester visible
      list = list.filter(c => Math.abs(c.balance) > EPSILON || c.credit_balance > EPSILON);
    }

    if (search) {
      list = list.filter(c => (c.client_name || '').toLowerCase().includes(search));
    }

    // Tri: solde dû décroissant (les plus gros débiteurs d'abord)
    list.sort((a, b) => b.balance - a.balance);

    const totals = list.reduce(
      (acc, c) => {
        acc.balance += c.balance;
        acc.overdue_balance += c.overdue_balance;
        acc.interest += c.interest;
        return acc;
      },
      { balance: 0, overdue_balance: 0, interest: 0 }
    );

    return NextResponse.json({
      success: true,
      data: list,
      totals: {
        balance: Math.round(totals.balance * 100) / 100,
        overdue_balance: Math.round(totals.overdue_balance * 100) / 100,
        interest: Math.round(totals.interest * 100) / 100,
        client_count: list.length,
      },
      interest_rate: interestRate,
    });
  } catch (error) {
    console.error('GET /api/statements error:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur lors du chargement des états de compte', details: error.message },
      { status: 500 }
    );
  }
}
