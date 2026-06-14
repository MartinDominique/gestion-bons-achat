/**
 * @file app/api/statements/[clientId]/send-email/route.js
 * @description Génère et envoie l'état de compte d'un client (PDF) par courriel.
 *              - Construit le relevé (factures impayées, paiements, intérêts, aging)
 *              - Génère le PDF via jsPDF + pdf-common.js
 *              - Upload dans Supabase Storage (bucket 'invoices', préfixe statements/)
 *              - print_only: retourne l'URL du PDF sans envoyer de courriel (aperçu)
 *              - Sinon envoie via Resend aux adresses sélectionnées (cascade email_billing)
 * @version 1.1.0
 * @date 2026-06-14
 * @changelog
 *   1.1.0 - Message de confirmation explicite incluant la copie au bureau (CC COMPANY_EMAIL)
 *   1.0.0 - Version initiale (module État de compte client)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { computeInterest, daysOverdue, agingBucket } from '../../../../../lib/services/invoice-payments';

const { Resend } = require('resend');
const { jsPDF } = require('jspdf');
require('jspdf-autotable');
const fs = require('fs');
const path = require('path');
const pdfCommon = require('../../../../../lib/services/pdf-common');

const resend = new Resend(process.env.RESEND_API_KEY);
const EPSILON = 0.005;

// Charger le logo (serveur)
let LOGO_BASE64 = null;
try {
  const logoPath = path.join(process.cwd(), 'public', 'logo.png');
  const logoBuffer = fs.readFileSync(logoPath);
  LOGO_BASE64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
} catch (error) {
  console.warn('Logo non trouvé:', error.message);
}

const MONTHS_FR = ['', 'jan.', 'fév.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
function formatDateFr(dateStr) {
  if (!dateStr) return '-';
  const [y, m, d] = dateStr.split('-');
  return `${parseInt(d)} ${MONTHS_FR[parseInt(m)]} ${y}`;
}

/**
 * Construit les données du relevé pour un client (factures impayées + intérêts + aging).
 */
async function buildStatement(clientId) {
  const { data: client } = await supabaseAdmin
    .from('clients')
    .select('id, name, company, address, email, email_billing, email_admin, email_2, email_3, contact_name, payment_terms')
    .eq('id', parseInt(clientId))
    .single();

  if (!client) return null;

  const { data: settings } = await supabaseAdmin
    .from('settings')
    .select('late_interest_annual_rate, statement_footer_note, invoice_tps_number, invoice_tvq_number')
    .eq('id', 1)
    .single();
  const interestRate = Number(settings?.late_interest_annual_rate) || 0;

  const { data: invoices } = await supabaseAdmin
    .from('invoices')
    .select('id, invoice_number, source_number, invoice_date, due_date, total, amount_paid, status')
    .eq('client_id', parseInt(clientId))
    .in('status', ['sent', 'partial', 'paid'])
    .order('invoice_date', { ascending: true });

  const openInvoices = (invoices || []).filter(
    inv => (Number(inv.total) || 0) - (Number(inv.amount_paid) || 0) > EPSILON
  );

  const now = new Date();
  const aging = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
  let totalBalance = 0;
  let totalInterest = 0;

  const lines = openInvoices.map(inv => {
    const total = Number(inv.total) || 0;
    const balance = Math.round((total - (Number(inv.amount_paid) || 0)) * 100) / 100;
    const od = daysOverdue(inv.due_date, now);
    const interest = computeInterest(balance, inv.due_date, interestRate, now);
    aging[agingBucket(inv.due_date, now)] += balance;
    totalBalance += balance;
    totalInterest += interest;
    return {
      invoice_number: inv.invoice_number,
      source_number: inv.source_number,
      invoice_date: inv.invoice_date,
      due_date: inv.due_date,
      total,
      amount_paid: Number(inv.amount_paid) || 0,
      balance,
      days_overdue: od,
      interest,
    };
  });

  Object.keys(aging).forEach(k => { aging[k] = Math.round(aging[k] * 100) / 100; });
  totalBalance = Math.round(totalBalance * 100) / 100;
  totalInterest = Math.round(totalInterest * 100) / 100;

  return {
    client,
    settings,
    interestRate,
    lines,
    aging,
    totals: {
      balance: totalBalance,
      interest: totalInterest,
      total_with_interest: Math.round((totalBalance + totalInterest) * 100) / 100,
    },
    statementDate: now.toISOString().split('T')[0],
  };
}

/**
 * Génère le PDF de l'état de compte.
 */
function generateStatementPDF(statement) {
  const { client, lines, aging, totals, interestRate, statementDate, settings } = statement;
  const doc = new jsPDF({ format: 'letter', unit: 'mm' });

  let y = pdfCommon.drawHeader(doc, LOGO_BASE64, {
    title: 'ÉTAT DE COMPTE',
    fields: [
      { label: 'Date du relevé:', value: pdfCommon.formatDate(statementDate) },
      { label: 'Factures dues:', value: String(lines.length) },
    ],
  });

  // ---- RELEVÉ POUR ----
  y = pdfCommon.drawTwoColumns(doc, y, {
    left: {
      title: 'RELEVÉ POUR',
      lines: [
        client.name || '',
        client.company && client.company !== client.name ? client.company : null,
        client.address || '',
      ].filter(Boolean),
    },
    separator: true,
  });

  // ---- TABLEAU DES FACTURES ----
  const columns = [
    { header: 'FACTURE', dataKey: 'number' },
    { header: 'RÉF.', dataKey: 'ref' },
    { header: 'DATE', dataKey: 'date' },
    { header: 'ÉCHÉANCE', dataKey: 'due' },
    { header: 'RETARD', dataKey: 'overdue' },
    { header: 'TOTAL', dataKey: 'total' },
    { header: 'PAYÉ', dataKey: 'paid' },
    { header: 'SOLDE', dataKey: 'balance' },
  ];

  const body = lines.map(l => ({
    number: l.invoice_number,
    ref: l.source_number || '',
    date: pdfCommon.formatDate(l.invoice_date),
    due: pdfCommon.formatDate(l.due_date),
    overdue: l.days_overdue > 0 ? `${l.days_overdue} j` : '-',
    total: pdfCommon.formatCurrency(l.total),
    paid: pdfCommon.formatCurrency(l.amount_paid),
    balance: pdfCommon.formatCurrency(l.balance),
  }));

  body.push({
    number: '',
    ref: '',
    date: '',
    due: '',
    overdue: 'TOTAL',
    total: '',
    paid: '',
    balance: pdfCommon.formatCurrency(totals.balance),
  });

  doc.autoTable({
    startY: y,
    columns,
    body,
    theme: 'grid',
    tableWidth: pdfCommon.CONTENT_WIDTH,
    styles: {
      fontSize: 8,
      cellPadding: { top: 1.8, right: 2, bottom: 1.8, left: 2 },
      lineColor: pdfCommon.COLORS.black,
      lineWidth: 0.2,
      textColor: pdfCommon.COLORS.black,
      font: 'helvetica',
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: pdfCommon.COLORS.headerBg,
      textColor: pdfCommon.COLORS.black,
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 8,
    },
    columnStyles: {
      number: { cellWidth: 22, halign: 'center', font: 'courier' },
      ref: { cellWidth: 24, halign: 'center', font: 'courier' },
      date: { cellWidth: 24, halign: 'center' },
      due: { cellWidth: 24, halign: 'center' },
      overdue: { cellWidth: 18, halign: 'center' },
      total: { cellWidth: 'auto', halign: 'right', font: 'courier' },
      paid: { cellWidth: 'auto', halign: 'right', font: 'courier' },
      balance: { cellWidth: 'auto', halign: 'right', font: 'courier' },
    },
    margin: { left: pdfCommon.PAGE.margin.left, right: pdfCommon.PAGE.margin.right },
    showHead: 'everyPage',
    didParseCell: function (data) {
      if (data.section === 'body' && data.row.index === lines.length) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [230, 230, 230];
      }
    },
  });

  y = doc.lastAutoTable.finalY + 8;

  // ---- VIEILLISSEMENT (AGING) ----
  y = pdfCommon.checkPageBreak(doc, y, 30);
  const agingCols = [
    { header: 'COURANT', dataKey: 'current' },
    { header: '1-30 JOURS', dataKey: 'd1_30' },
    { header: '31-60 JOURS', dataKey: 'd31_60' },
    { header: '61-90 JOURS', dataKey: 'd61_90' },
    { header: '90+ JOURS', dataKey: 'd90_plus' },
  ];
  doc.autoTable({
    startY: y,
    columns: agingCols,
    body: [{
      current: pdfCommon.formatCurrency(aging.current),
      d1_30: pdfCommon.formatCurrency(aging.d1_30),
      d31_60: pdfCommon.formatCurrency(aging.d31_60),
      d61_90: pdfCommon.formatCurrency(aging.d61_90),
      d90_plus: pdfCommon.formatCurrency(aging.d90_plus),
    }],
    theme: 'grid',
    tableWidth: pdfCommon.CONTENT_WIDTH,
    styles: {
      fontSize: 8, halign: 'right', font: 'courier',
      cellPadding: { top: 2, right: 2, bottom: 2, left: 2 },
      lineColor: pdfCommon.COLORS.black, lineWidth: 0.2, textColor: pdfCommon.COLORS.black,
    },
    headStyles: {
      fillColor: pdfCommon.COLORS.headerBg, textColor: pdfCommon.COLORS.black,
      fontStyle: 'bold', halign: 'center', fontSize: 8, font: 'helvetica',
    },
    margin: { left: pdfCommon.PAGE.margin.left, right: pdfCommon.PAGE.margin.right },
  });

  y = doc.lastAutoTable.finalY + 8;

  // ---- TOTAUX ----
  y = pdfCommon.checkPageBreak(doc, y, 40);
  const rightX = pdfCommon.PAGE.width - pdfCommon.PAGE.margin.right;
  const labelX = rightX - 70;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(pdfCommon.FONT.body);
  doc.setTextColor(0, 0, 0);

  doc.text('Solde dû:', labelX, y);
  doc.text(pdfCommon.formatCurrency(totals.balance), rightX, y, { align: 'right' });
  y += 6;

  if (totals.interest > 0) {
    doc.text(`Intérêts de retard (${interestRate}%/an):`, labelX, y);
    doc.text(pdfCommon.formatCurrency(totals.interest), rightX, y, { align: 'right' });
    y += 6;
  }

  doc.setLineWidth(0.5);
  doc.line(labelX, y, rightX, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL À PAYER:', labelX, y);
  doc.text(pdfCommon.formatCurrency(totals.total_with_interest), rightX, y, { align: 'right' });
  y += 12;

  // ---- NOTE DE PIED ----
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(pdfCommon.FONT.body);

  if (totals.interest > 0 || interestRate > 0) {
    y = pdfCommon.checkPageBreak(doc, y, 12);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    const intLine = doc.splitTextToSize(
      `Des intérêts de ${interestRate}% par année sont applicables sur tout solde en souffrance après l'échéance.`,
      pdfCommon.CONTENT_WIDTH
    );
    doc.text(intLine, pdfCommon.PAGE.margin.left, y);
    y += intLine.length * 4 + 3;
    doc.setTextColor(0, 0, 0);
  }

  if (settings && settings.statement_footer_note) {
    y = pdfCommon.checkPageBreak(doc, y, 12);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    const footerLines = doc.splitTextToSize(settings.statement_footer_note, pdfCommon.CONTENT_WIDTH);
    doc.text(footerLines, pdfCommon.PAGE.margin.left, y);
    doc.setTextColor(0, 0, 0);
  }

  pdfCommon.drawFooter(doc);

  return doc.output('arraybuffer');
}

/**
 * POST /api/statements/[clientId]/send-email
 * Body: { emails?: string[], print_only?: boolean }
 */
export async function POST(request, { params }) {
  try {
    const { clientId } = params;
    const body = await request.json();
    const { emails: customEmails, print_only } = body;

    const statement = await buildStatement(clientId);
    if (!statement) {
      return NextResponse.json({ success: false, error: 'Client non trouvé' }, { status: 404 });
    }

    if (statement.lines.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Aucune facture impayée pour ce client' },
        { status: 400 }
      );
    }

    // Déterminer les destinataires (sauf en aperçu)
    let emailAddresses = [];
    if (!print_only) {
      if (customEmails && customEmails.length > 0) {
        emailAddresses = customEmails.filter(Boolean);
      } else {
        const c = statement.client;
        if (c.email_billing) emailAddresses.push(c.email_billing);
        else if (c.email_admin) emailAddresses.push(c.email_admin);
        else if (c.email) emailAddresses.push(c.email);
        else if (c.email_2) emailAddresses.push(c.email_2);
      }
      if (emailAddresses.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Aucune adresse email disponible. Utilisez "Aperçu" pour générer le PDF sans envoi.' },
          { status: 400 }
        );
      }
    }

    // Générer le PDF
    const pdfBuffer = generateStatementPDF(statement);
    const pdfBufferNode = Buffer.from(pdfBuffer);

    // Upload dans Storage (bucket invoices, préfixe statements/)
    let pdfUrl = null;
    try {
      const [year, month] = statement.statementDate.split('-');
      const safeName = (statement.client.name || `client-${clientId}`).replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 40);
      const storagePath = `statements/${year}/${month}/etat-compte-${safeName}-${statement.statementDate}.pdf`;

      const { error: uploadError } = await supabaseAdmin
        .storage.from('invoices')
        .upload(storagePath, pdfBufferNode, { contentType: 'application/pdf', upsert: true });

      if (uploadError) {
        console.error('Erreur upload PDF relevé:', uploadError.message);
      } else {
        const { data: urlData } = await supabaseAdmin
          .storage.from('invoices')
          .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10);
        pdfUrl = urlData?.signedUrl || null;
      }
    } catch (storageErr) {
      console.error('Erreur Storage relevé (non bloquante):', storageErr.message);
    }

    // Envoyer le courriel (sauf aperçu)
    if (!print_only) {
      const companyName = pdfCommon.COMPANY.name;
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@servicestmt.com';
      const t = statement.totals;

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px;">
            <h2 style="color: #333; margin-bottom: 20px;">État de compte</h2>
            <p>Bonjour,</p>
            <p>Veuillez trouver ci-joint votre état de compte au <strong>${formatDateFr(statement.statementDate)}</strong>.</p>
            <p>Nombre de factures impayées: <strong>${statement.lines.length}</strong><br>
               Solde dû: <strong>${Number(t.balance).toFixed(2)} $</strong>${
                 t.interest > 0
                   ? `<br>Intérêts de retard: <strong>${Number(t.interest).toFixed(2)} $</strong><br>Total à payer: <strong>${Number(t.total_with_interest).toFixed(2)} $</strong>`
                   : ''
               }</p>
            <p>N'hésitez pas à nous contacter pour toute question.</p>
            <p style="color: #999; font-size: 13px; font-style: italic; margin: 20px 0 0;">
              Ne pas répondre à ce courriel.<br>
              Pour nous contacter, utilisez le lien ci-dessous.
            </p>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
            <p style="color: #666; font-size: 13px;">
              ${companyName}<br>
              ${pdfCommon.COMPANY.address}, ${pdfCommon.COMPANY.city}<br>
              Tél: ${pdfCommon.COMPANY.phone}<br>
              <a href="mailto:${pdfCommon.COMPANY.email}" style="color: #2563eb;">${pdfCommon.COMPANY.email}</a>
            </p>
          </div>
        </body>
        </html>
      `;

      const emailConfig = {
        from: `${companyName} <${fromEmail}>`,
        to: emailAddresses,
        subject: `État de compte ${statement.client.name} — ${companyName}`,
        html: htmlContent,
        attachments: [{
          filename: `Etat_de_compte_${statement.statementDate}.pdf`,
          content: pdfBufferNode,
          contentType: 'application/pdf',
        }],
      };

      if (process.env.COMPANY_EMAIL) {
        emailConfig.cc = [process.env.COMPANY_EMAIL];
      }

      const result = await resend.emails.send(emailConfig);
      if (result.error) {
        console.error('Erreur envoi email relevé:', result.error);
        return NextResponse.json(
          { success: false, error: `Erreur envoi email: ${result.error.message}` },
          { status: 500 }
        );
      }
    }

    if (print_only) {
      return NextResponse.json({
        success: true,
        message: `État de compte prêt pour ${statement.client.name}`,
        pdf_url: pdfUrl,
        print_only: true,
      });
    }

    const ccNote = process.env.COMPANY_EMAIL ? ` (copie au bureau: ${process.env.COMPANY_EMAIL})` : '';
    return NextResponse.json({
      success: true,
      message: `État de compte envoyé à ${emailAddresses.join(', ')}${ccNote}`,
      sentTo: emailAddresses,
      cc: process.env.COMPANY_EMAIL || null,
      pdf_url: pdfUrl,
    });
  } catch (error) {
    console.error('Erreur API statements send-email:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur serveur', details: error.message },
      { status: 500 }
    );
  }
}
