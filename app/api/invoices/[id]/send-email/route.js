/**
 * @file app/api/invoices/[id]/send-email/route.js
 * @description Envoi d'une facture par email au client avec PDF en pièce jointe
 *              - Génère le PDF facture via jsPDF + pdf-common.js
 *              - Upload le PDF dans Supabase Storage (bucket invoices)
 *              - Sauvegarde pdf_url dans la table invoices
 *              - Envoie par Resend au client (cascade email)
 *              - Met à jour le statut de la facture à 'sent'
 * @version 1.1.0
 * @date 2026-02-27
 * @changelog
 *   1.1.0 - Ajout upload PDF vers Supabase Storage + pdf_url
 *   1.0.0 - Version initiale (Phase B Facturation MVP)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';

const { Resend } = require('resend');
const { jsPDF } = require('jspdf');
require('jspdf-autotable');
const fs = require('fs');
const path = require('path');
const pdfCommon = require('../../../../../lib/services/pdf-common');

const resend = new Resend(process.env.RESEND_API_KEY);

// Charger le logo
let LOGO_BASE64 = null;
try {
  const logoPath = path.join(process.cwd(), 'public', 'logo.png');
  const logoBuffer = fs.readFileSync(logoPath);
  LOGO_BASE64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
} catch (error) {
  console.warn('Logo non trouvé:', error.message);
}

/**
 * Génère le PDF d'une facture
 */
function generateInvoicePDF(invoice, settings) {
  const doc = new jsPDF({ format: 'letter' });

  // ---- EN-TÊTE ----
  const headerFields = [
    { value: `N° ${invoice.invoice_number}` },
    { label: 'Date:', value: pdfCommon.formatDate(invoice.invoice_date) },
    { label: 'Référence:', value: invoice.source_number || '' },
  ];

  if (invoice.payment_terms) {
    headerFields.push({ label: 'Termes:', value: invoice.payment_terms, bold: false });
  }

  let y = pdfCommon.drawHeader(doc, LOGO_BASE64, {
    title: 'FACTURE',
    warningLabel: invoice.is_prix_jobe ? 'PRIX FORFAITAIRE' : null,
    fields: headerFields,
  });

  // ---- FACTURER À ----
  y = pdfCommon.drawTwoColumns(doc, y, {
    left: {
      title: 'FACTURER À',
      lines: [
        invoice.client_name || '',
        invoice.client_address || '',
      ].filter(Boolean),
    },
    right: {
      title: 'DÉTAILS',
      lines: [
        { text: `Facture: ${invoice.invoice_number}`, bold: true },
        `Date: ${pdfCommon.formatDate(invoice.invoice_date)}`,
        invoice.due_date ? `Échéance: ${pdfCommon.formatDate(invoice.due_date)}` : null,
        invoice.payment_terms ? `Termes: ${invoice.payment_terms}` : null,
      ].filter(Boolean),
    },
    separator: true,
  });

  // ---- NUMÉROS TPS/TVQ ----
  if (settings && (settings.invoice_tps_number || settings.invoice_tvq_number)) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    if (settings.invoice_tps_number) {
      doc.text(`TPS: ${settings.invoice_tps_number}`, pdfCommon.PAGE.margin.left, y);
      y += 4;
    }
    if (settings.invoice_tvq_number) {
      doc.text(`TVQ: ${settings.invoice_tvq_number}`, pdfCommon.PAGE.margin.left, y);
      y += 4;
    }
    doc.setTextColor(0, 0, 0);
    y += 3;
  }

  // ---- TABLE DES ARTICLES ----
  const lineItems = invoice.line_items || [];

  if (lineItems.length > 0) {
    const columns = [
      { header: 'DESCRIPTION', dataKey: 'description' },
      { header: 'DÉTAIL', dataKey: 'detail' },
      { header: 'QTÉ', dataKey: 'quantity' },
      { header: 'PRIX UNIT.', dataKey: 'unit_price' },
      { header: 'TOTAL', dataKey: 'total' },
    ];

    const body = lineItems.map(line => ({
      description: line.description || '',
      detail: line.detail || '',
      quantity: line.quantity != null ? String(line.quantity) : '',
      unit_price: line.unit_price != null ? pdfCommon.formatCurrency(line.unit_price) : '',
      total: line.total != null ? pdfCommon.formatCurrency(line.total) : '',
    }));

    const columnStyles = {
      description: { cellWidth: 'auto' },
      detail: { cellWidth: 35, halign: 'left' },
      quantity: { cellWidth: 18, halign: 'center' },
      unit_price: { cellWidth: 25, halign: 'right' },
      total: { cellWidth: 28, halign: 'right' },
    };

    y = pdfCommon.drawMaterialsTable(doc, y, {
      title: null,
      columns,
      body,
      columnStyles,
    });
  }

  // ---- TOTAUX ----
  const tpsLabel = `TPS (${invoice.tps_rate || 5}%)`;
  const tvqLabel = `TVQ (${invoice.tvq_rate || 9.975}%)`;

  y = pdfCommon.checkPageBreak(doc, y, 45);

  const rightX = pdfCommon.PAGE.width - pdfCommon.PAGE.margin.right;
  const labelX = rightX - 65;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(pdfCommon.FONT.body);
  doc.setTextColor(0, 0, 0);

  // Sous-total
  doc.text('Sous-total:', labelX, y);
  doc.text(pdfCommon.formatCurrency(invoice.subtotal), rightX, y, { align: 'right' });
  y += 6;

  // TPS
  doc.text(tpsLabel + ':', labelX, y);
  doc.text(pdfCommon.formatCurrency(invoice.tps_amount), rightX, y, { align: 'right' });
  y += 6;

  // TVQ
  doc.text(tvqLabel + ':', labelX, y);
  doc.text(pdfCommon.formatCurrency(invoice.tvq_amount), rightX, y, { align: 'right' });
  y += 6;

  // Ligne séparatrice
  doc.setLineWidth(0.5);
  doc.line(labelX, y, rightX, y);
  y += 6;

  // TOTAL
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL:', labelX, y);
  doc.text(pdfCommon.formatCurrency(invoice.total), rightX, y, { align: 'right' });
  y += 12;

  // ---- NOTE DE PIED ----
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(pdfCommon.FONT.body);

  if (invoice.notes) {
    y = pdfCommon.checkPageBreak(doc, y, 20);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    const noteLines = doc.splitTextToSize(invoice.notes, pdfCommon.CONTENT_WIDTH);
    doc.text(noteLines, pdfCommon.PAGE.margin.left, y);
    y += noteLines.length * 4 + 5;
  }

  // Note de pied de facture (settings)
  if (settings && settings.invoice_footer_note) {
    y = pdfCommon.checkPageBreak(doc, y, 15);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    const footerLines = doc.splitTextToSize(settings.invoice_footer_note, pdfCommon.CONTENT_WIDTH);
    doc.text(footerLines, pdfCommon.PAGE.margin.left, y);
    doc.setTextColor(0, 0, 0);
  }

  // ---- FOOTER (toutes les pages) ----
  pdfCommon.drawFooter(doc);

  return doc.output('arraybuffer');
}

/**
 * POST /api/invoices/[id]/send-email
 * Envoie la facture par email au client
 */
export async function POST(request, { params }) {
  try {
    const { id } = params;
    const body = await request.json();
    const { emails: customEmails } = body;

    // 1. Récupérer la facture
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select(`
        *,
        client:clients(id, name, email, email_admin, email_billing, email_2)
      `)
      .eq('id', parseInt(id))
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { success: false, error: 'Facture non trouvée' },
        { status: 404 }
      );
    }

    // 2. Récupérer les settings pour TPS/TVQ numbers et footer
    const { data: settings } = await supabaseAdmin
      .from('settings')
      .select('*')
      .eq('id', 1)
      .single();

    // 3. Déterminer les adresses email (cascade)
    let emailAddresses = [];

    if (customEmails && customEmails.length > 0) {
      emailAddresses = customEmails;
    } else {
      const client = invoice.client;
      if (client) {
        if (client.email_billing) emailAddresses.push(client.email_billing);
        else if (client.email_admin) emailAddresses.push(client.email_admin);
        else if (client.email) emailAddresses.push(client.email);
        else if (client.email_2) emailAddresses.push(client.email_2);
      }
    }

    if (emailAddresses.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Aucune adresse email disponible pour ce client. La facture est sauvegardée en brouillon.' },
        { status: 400 }
      );
    }

    // 4. Générer le PDF
    const pdfBuffer = generateInvoicePDF(invoice, settings);
    const pdfBufferNode = Buffer.from(pdfBuffer);

    // 5. Upload PDF dans Supabase Storage (bucket 'invoices')
    let pdfUrl = null;
    try {
      const invoiceDate = invoice.invoice_date || new Date().toISOString().split('T')[0];
      const [year, month] = invoiceDate.split('-');
      const storagePath = `${year}/${month}/facture-${invoice.invoice_number}.pdf`;

      const { data: uploadData, error: uploadError } = await supabaseAdmin
        .storage
        .from('invoices')
        .upload(storagePath, pdfBufferNode, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadError) {
        // Log mais ne pas bloquer l'envoi email
        console.error('Erreur upload PDF Storage:', uploadError.message);
      } else {
        // Générer l'URL signée (valide 10 ans = accès permanent via l'app)
        const { data: urlData } = await supabaseAdmin
          .storage
          .from('invoices')
          .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10);

        pdfUrl = urlData?.signedUrl || null;
        console.log('PDF uploadé:', storagePath);
      }
    } catch (storageErr) {
      console.error('Erreur Storage (non bloquante):', storageErr.message);
    }

    // 6. Envoyer l'email
    const companyName = pdfCommon.COMPANY.name;
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@servicestmt.com';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px;">
          <h2 style="color: #333; margin-bottom: 20px;">Facture ${invoice.invoice_number}</h2>
          <p>Bonjour,</p>
          <p>Veuillez trouver ci-joint la facture <strong>${invoice.invoice_number}</strong>
             d'un montant de <strong>${Number(invoice.total).toFixed(2)} $</strong>
             en référence au document <strong>${invoice.source_number}</strong>.</p>
          ${invoice.payment_terms ? `<p><strong>Conditions:</strong> ${invoice.payment_terms}</p>` : ''}
          ${invoice.due_date ? `<p><strong>Échéance:</strong> ${invoice.due_date}</p>` : ''}
          <p>N'hésitez pas à nous contacter pour toute question.</p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
          <p style="color: #666; font-size: 13px;">
            ${companyName}<br>
            ${pdfCommon.COMPANY.address}, ${pdfCommon.COMPANY.city}<br>
            Tél: ${pdfCommon.COMPANY.phone}<br>
            ${pdfCommon.COMPANY.email}
          </p>
        </div>
      </body>
      </html>
    `;

    const emailConfig = {
      from: `${companyName} <${fromEmail}>`,
      to: emailAddresses,
      subject: `Facture ${invoice.invoice_number} — ${companyName}`,
      html: htmlContent,
      attachments: [{
        filename: `Facture_${invoice.invoice_number}.pdf`,
        content: pdfBufferNode,
        contentType: 'application/pdf',
      }],
    };

    // CC au bureau
    if (process.env.COMPANY_EMAIL) {
      emailConfig.cc = [process.env.COMPANY_EMAIL];
    }

    const result = await resend.emails.send(emailConfig);

    if (result.error) {
      console.error('Erreur envoi email Resend:', result.error);
      return NextResponse.json(
        { success: false, error: `Erreur envoi email: ${result.error.message}` },
        { status: 500 }
      );
    }

    // 7. Mettre à jour le statut de la facture + pdf_url
    const updateData = {
      status: 'sent',
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (pdfUrl) {
      updateData.pdf_url = pdfUrl;
    }

    await supabaseAdmin
      .from('invoices')
      .update(updateData)
      .eq('id', parseInt(id));

    return NextResponse.json({
      success: true,
      message: `Facture ${invoice.invoice_number} envoyée à ${emailAddresses.join(', ')}`,
      sentTo: emailAddresses,
      messageId: result.data?.id,
    });

  } catch (error) {
    console.error('Erreur API invoices send-email:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur serveur', details: error.message },
      { status: 500 }
    );
  }
}
