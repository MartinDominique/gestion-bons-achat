/**
 * @file app/api/reports/payments/send-email/route.js
 * @description Génère le rapport de paiements (PDF) et l'envoie au comptable (CC bureau).
 *              - print_only: retourne l'URL du PDF sans envoyer de courriel (aperçu)
 *              - Sinon envoie au courriel du comptable (Paramètres) ou à une liste fournie
 * @version 1.0.0
 * @date 2026-06-14
 * @changelog
 *   1.0.0 - Version initiale (rapports comptables ventes/paiements)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { buildPaymentsReport } from '../../../../../lib/services/report-data';

const { buildPaymentsReportDoc, METHOD_LABELS } = require('../../../../../lib/services/report-pdf');
const { getServerLogo, sendReportEmail, resolveAccountantRecipients } = require('../../../../../lib/services/report-email');

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request) {
  try {
    const { searchParams } = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const { emails: customEmails, print_only } = body;

    const result = await buildPaymentsReport(searchParams);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
    const data = result.data;

    if (data.count === 0) {
      return NextResponse.json(
        { success: false, error: 'Aucun paiement pour cette période' },
        { status: 400 }
      );
    }

    let recipients = [];
    if (!print_only) {
      const r = await resolveAccountantRecipients(customEmails, supabaseAdmin);
      if (!r.ok) {
        return NextResponse.json({ success: false, error: r.error }, { status: 400 });
      }
      recipients = r.recipients;
    }

    const doc = buildPaymentsReportDoc(data, getServerLogo());
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

    const [year, month] = (data.period.startDate || '').split('-');
    const filename = `Rapport-paiements_${data.period.slug}.pdf`;
    const storagePath = `reports/${year}/${month}/rapport-paiements-${data.period.slug}.pdf`;

    if (print_only) {
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
        console.error('Erreur Storage aperçu paiements:', e.message);
      }
      return NextResponse.json({
        success: true,
        message: `Rapport de paiements prêt (${data.count} paiements)`,
        pdf_url: pdfUrl,
        print_only: true,
      });
    }

    const t = data.totals;
    const bm = t.by_method || {};
    const methodRows = ['cheque', 'virement', 'comptant', 'autre']
      .filter(k => (bm[k] || 0) !== 0)
      .map(k => [METHOD_LABELS[k], `${(bm[k] || 0).toFixed(2)} $`]);

    const sent = await sendReportEmail({
      pdfBuffer,
      filename,
      storagePath,
      recipients,
      subject: `Rapport de paiements — ${data.period.label} — ${data.count} paiement(s)`,
      title: 'Rapport de paiements',
      intro: `Voici le rapport de paiements (encaissements) pour la période <strong>${data.period.label}</strong>.`,
      summaryRows: [
        ['Nombre de paiements', String(data.count)],
        ...methodRows,
        ['Total encaissé', `${t.amount.toFixed(2)} $`],
        ['Escompte accordé', `${t.discount.toFixed(2)} $`],
      ],
    }, supabaseAdmin);

    const ccNote = sent.cc ? ` (copie au bureau: ${sent.cc})` : '';
    return NextResponse.json({
      success: true,
      message: `Rapport de paiements envoyé à ${sent.sentTo.join(', ')}${ccNote}`,
      sentTo: sent.sentTo,
      cc: sent.cc,
      pdf_url: sent.pdfUrl,
    });
  } catch (error) {
    console.error('Erreur API reports/payments/send-email:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    );
  }
}
