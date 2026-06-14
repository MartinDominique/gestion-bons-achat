/**
 * @file app/api/reports/sales/send-email/route.js
 * @description Génère le rapport de ventes (PDF) et l'envoie au comptable (CC bureau).
 *              - print_only: retourne l'URL du PDF sans envoyer de courriel (aperçu)
 *              - Sinon envoie au courriel du comptable (Paramètres) ou à une liste fournie
 * @version 1.0.0
 * @date 2026-06-14
 * @changelog
 *   1.0.0 - Version initiale (rapports comptables ventes/paiements)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { buildSalesReport } from '../../../../../lib/services/report-data';

const { buildSalesReportDoc } = require('../../../../../lib/services/report-pdf');
const { getServerLogo, sendReportEmail, resolveAccountantRecipients } = require('../../../../../lib/services/report-email');

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request) {
  try {
    const { searchParams } = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const { emails: customEmails, print_only } = body;

    const result = await buildSalesReport(searchParams);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
    const data = result.data;

    if (data.count === 0) {
      return NextResponse.json(
        { success: false, error: 'Aucune facture pour cette période' },
        { status: 400 }
      );
    }

    // Destinataires (sauf en aperçu)
    let recipients = [];
    if (!print_only) {
      const r = await resolveAccountantRecipients(customEmails, supabaseAdmin);
      if (!r.ok) {
        return NextResponse.json({ success: false, error: r.error }, { status: 400 });
      }
      recipients = r.recipients;
    }

    // Générer le PDF
    const doc = buildSalesReportDoc(data, getServerLogo());
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

    const [year, month] = (data.period.startDate || '').split('-');
    const filename = `Rapport-ventes_${data.period.slug}.pdf`;
    const storagePath = `reports/${year}/${month}/rapport-ventes-${data.period.slug}.pdf`;

    if (print_only) {
      // Upload seul pour fournir une URL d'aperçu
      let pdfUrl = null;
      try {
        const { error: upErr } = await supabaseAdmin
          .storage.from('invoices')
          .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true });
        if (!upErr) {
          const { data: urlData } = await supabaseAdmin
            .storage.from('invoices')
            .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10);
          pdfUrl = urlData?.signedUrl || null;
        }
      } catch (e) {
        console.error('Erreur Storage aperçu ventes:', e.message);
      }
      return NextResponse.json({
        success: true,
        message: `Rapport de ventes prêt (${data.count} factures)`,
        pdf_url: pdfUrl,
        print_only: true,
      });
    }

    const t = data.totals;
    const sent = await sendReportEmail({
      pdfBuffer,
      filename,
      storagePath,
      recipients,
      subject: `Rapport de ventes — ${data.period.label} — ${data.count} facture(s)`,
      title: 'Rapport de ventes',
      intro: `Voici le rapport de ventes pour la période <strong>${data.period.label}</strong>.`,
      summaryRows: [
        ['Nombre de factures', String(data.count)],
        ['Vente matériel', `${t.total_materials.toFixed(2)} $`],
        ['Vente main d’œuvre', `${t.total_labor.toFixed(2)} $`],
        ['Vente déplacement', `${t.total_transport.toFixed(2)} $`],
        ['Sous-total', `${t.subtotal.toFixed(2)} $`],
        ['TPS', `${t.tps_amount.toFixed(2)} $`],
        ['TVQ', `${t.tvq_amount.toFixed(2)} $`],
        ['Total', `${t.total.toFixed(2)} $`],
      ],
    }, supabaseAdmin);

    const ccNote = sent.cc ? ` (copie au bureau: ${sent.cc})` : '';
    return NextResponse.json({
      success: true,
      message: `Rapport de ventes envoyé à ${sent.sentTo.join(', ')}${ccNote}`,
      sentTo: sent.sentTo,
      cc: sent.cc,
      pdf_url: sent.pdfUrl,
    });
  } catch (error) {
    console.error('Erreur API reports/sales/send-email:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
