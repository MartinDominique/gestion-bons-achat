/**
 * @file app/api/statistics/financial/route.js
 * @description API endpoint pour les statistiques financières basées sur les factures
 *              - GET: Données agrégées par mois, par client, factures en attente
 *              - Filtres: période, client, statut
 *              - Résumés: totaux facturés, payés, en attente, ventilation
 * @version 1.0.0
 * @date 2026-02-27
 * @changelog
 *   1.0.0 - Version initiale (Phase D — Statistiques Phase 2)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MONTHS_FR = [
  '', 'Jan.', 'Fév.', 'Mars', 'Avr.', 'Mai', 'Juin',
  'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'
];

/**
 * GET /api/statistics/financial
 * Paramètres:
 *   - dateFrom (YYYY-MM-DD) — défaut: 12 mois en arrière
 *   - dateTo (YYYY-MM-DD) — défaut: aujourd'hui
 *   - clientId (number) — filtrer par client
 *   - status (string) — 'all', 'draft', 'sent', 'paid'
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    // Dates par défaut: 12 derniers mois
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const dateFrom = searchParams.get('dateFrom') || defaultFrom.toISOString().split('T')[0];
    const dateTo = searchParams.get('dateTo') || now.toISOString().split('T')[0];
    const clientId = searchParams.get('clientId') || null;
    const status = searchParams.get('status') || 'all';

    // Requête de base
    let query = supabaseAdmin
      .from('invoices')
      .select(`
        id, invoice_number, client_id, client_name,
        source_type, source_number,
        invoice_date, due_date, payment_terms,
        subtotal, tps_amount, tvq_amount, total,
        total_materials, total_labor, total_transport,
        status, is_prix_jobe, sent_at, paid_at
      `)
      .gte('invoice_date', dateFrom)
      .lte('invoice_date', dateTo)
      .order('invoice_date', { ascending: true });

    if (clientId) {
      query = query.eq('client_id', parseInt(clientId));
    }
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: invoices, error } = await query;

    if (error) {
      console.error('Erreur récupération factures financières:', error);
      return NextResponse.json(
        { success: false, error: 'Erreur récupération des factures', details: error.message },
        { status: 500 }
      );
    }

    const data = invoices || [];

    // ============================================
    // 1. RÉSUMÉ GLOBAL
    // ============================================
    const summary = {
      totalInvoices: data.length,
      totalAmount: 0,
      totalPaid: 0,
      totalOutstanding: 0,
      totalDraft: 0,
      countPaid: 0,
      countSent: 0,
      countDraft: 0,
      totalMaterials: 0,
      totalLabor: 0,
      totalTransport: 0,
      avgInvoice: 0,
    };

    data.forEach(inv => {
      const total = parseFloat(inv.total) || 0;
      summary.totalAmount += total;
      summary.totalMaterials += parseFloat(inv.total_materials) || 0;
      summary.totalLabor += parseFloat(inv.total_labor) || 0;
      summary.totalTransport += parseFloat(inv.total_transport) || 0;

      if (inv.status === 'paid') {
        summary.totalPaid += total;
        summary.countPaid++;
      } else if (inv.status === 'sent') {
        summary.totalOutstanding += total;
        summary.countSent++;
      } else {
        summary.totalDraft += total;
        summary.countDraft++;
      }
    });

    // Arrondir
    summary.totalAmount = Math.round(summary.totalAmount * 100) / 100;
    summary.totalPaid = Math.round(summary.totalPaid * 100) / 100;
    summary.totalOutstanding = Math.round(summary.totalOutstanding * 100) / 100;
    summary.totalDraft = Math.round(summary.totalDraft * 100) / 100;
    summary.totalMaterials = Math.round(summary.totalMaterials * 100) / 100;
    summary.totalLabor = Math.round(summary.totalLabor * 100) / 100;
    summary.totalTransport = Math.round(summary.totalTransport * 100) / 100;
    summary.avgInvoice = data.length > 0
      ? Math.round((summary.totalAmount / data.length) * 100) / 100
      : 0;

    // ============================================
    // 2. VENTILATION PAR MOIS
    // ============================================
    const monthMap = {};

    data.forEach(inv => {
      const monthKey = inv.invoice_date ? inv.invoice_date.substring(0, 7) : 'unknown';
      if (!monthMap[monthKey]) {
        const [y, m] = monthKey.split('-');
        monthMap[monthKey] = {
          month: monthKey,
          label: `${MONTHS_FR[parseInt(m)] || m} ${y}`,
          count: 0,
          materials: 0,
          labor: 0,
          transport: 0,
          subtotal: 0,
          tps: 0,
          tvq: 0,
          total: 0,
          paidCount: 0,
          paidAmount: 0,
          outstandingCount: 0,
          outstandingAmount: 0,
        };
      }

      const entry = monthMap[monthKey];
      const total = parseFloat(inv.total) || 0;
      entry.count++;
      entry.materials += parseFloat(inv.total_materials) || 0;
      entry.labor += parseFloat(inv.total_labor) || 0;
      entry.transport += parseFloat(inv.total_transport) || 0;
      entry.subtotal += parseFloat(inv.subtotal) || 0;
      entry.tps += parseFloat(inv.tps_amount) || 0;
      entry.tvq += parseFloat(inv.tvq_amount) || 0;
      entry.total += total;

      if (inv.status === 'paid') {
        entry.paidCount++;
        entry.paidAmount += total;
      } else if (inv.status === 'sent') {
        entry.outstandingCount++;
        entry.outstandingAmount += total;
      }
    });

    // Arrondir et trier par mois
    const byMonth = Object.values(monthMap)
      .map(m => {
        Object.keys(m).forEach(k => {
          if (typeof m[k] === 'number' && k !== 'count' && k !== 'paidCount' && k !== 'outstandingCount') {
            m[k] = Math.round(m[k] * 100) / 100;
          }
        });
        return m;
      })
      .sort((a, b) => a.month.localeCompare(b.month));

    // ============================================
    // 3. VENTILATION PAR CLIENT
    // ============================================
    const clientMap = {};

    data.forEach(inv => {
      const key = inv.client_id || inv.client_name;
      if (!clientMap[key]) {
        clientMap[key] = {
          clientId: inv.client_id,
          clientName: inv.client_name || 'N/A',
          count: 0,
          total: 0,
          paidAmount: 0,
          outstandingAmount: 0,
          materials: 0,
          labor: 0,
          transport: 0,
        };
      }

      const entry = clientMap[key];
      const total = parseFloat(inv.total) || 0;
      entry.count++;
      entry.total += total;
      entry.materials += parseFloat(inv.total_materials) || 0;
      entry.labor += parseFloat(inv.total_labor) || 0;
      entry.transport += parseFloat(inv.total_transport) || 0;

      if (inv.status === 'paid') {
        entry.paidAmount += total;
      } else if (inv.status === 'sent') {
        entry.outstandingAmount += total;
      }
    });

    const byClient = Object.values(clientMap)
      .map(c => {
        Object.keys(c).forEach(k => {
          if (typeof c[k] === 'number' && k !== 'count' && k !== 'clientId') {
            c[k] = Math.round(c[k] * 100) / 100;
          }
        });
        c.percentOfTotal = summary.totalAmount > 0
          ? Math.round((c.total / summary.totalAmount) * 10000) / 100
          : 0;
        return c;
      })
      .sort((a, b) => b.total - a.total);

    // ============================================
    // 4. FACTURES EN ATTENTE (non payées)
    // ============================================
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const outstanding = data
      .filter(inv => inv.status === 'sent')
      .map(inv => {
        const invDate = new Date(inv.invoice_date + 'T00:00:00');
        const daysSince = Math.floor((today - invDate) / (1000 * 60 * 60 * 24));

        let daysUntilDue = null;
        if (inv.due_date) {
          const dueDate = new Date(inv.due_date + 'T00:00:00');
          daysUntilDue = Math.floor((dueDate - today) / (1000 * 60 * 60 * 24));
        }

        return {
          id: inv.id,
          invoiceNumber: inv.invoice_number,
          invoiceDate: inv.invoice_date,
          dueDate: inv.due_date,
          clientName: inv.client_name,
          clientId: inv.client_id,
          sourceNumber: inv.source_number,
          total: parseFloat(inv.total) || 0,
          daysSince,
          daysUntilDue,
          isOverdue: daysUntilDue !== null && daysUntilDue < 0,
          paymentTerms: inv.payment_terms,
        };
      })
      .sort((a, b) => b.daysSince - a.daysSince);

    return NextResponse.json({
      success: true,
      data: {
        summary,
        byMonth,
        byClient,
        outstanding,
      },
    });

  } catch (error) {
    console.error('Erreur API statistics/financial:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur serveur', details: error.message },
      { status: 500 }
    );
  }
}
