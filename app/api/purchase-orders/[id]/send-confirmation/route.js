/**
 * @file app/api/purchase-orders/[id]/send-confirmation/route.js
 * @description API endpoint pour générer et envoyer un BCC (Bon de Confirmation de Commande)
 *              - Génère un PDF avec en-tête standardisé (pdf-common.js)
 *              - Envoie par email au client via Resend
 *              - Envoi direct au client (sans CC bureau)
 * @version 1.4.0
 * @date 2026-02-18
 * @changelog
 *   1.4.0 - Email client affiche destinataires réels, titre sur une ligne, Réf.: au lieu de Ref. BA:, retrait CC bureau
 *   1.3.0 - Sauvegarde détail articles (code, description, qté, délai) dans bcc_history
 *   1.2.0 - Ajout colonne "En Main" (stock) dans le PDF BCC
 *   1.1.0 - Ajout suivi BCC: sauvegarde historique (bcc_history, bcc_sent_count) + PDF dans files
 *   1.0.0 - Version initiale - Génération PDF BCC + envoi email
 */

import { Resend } from 'resend';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';

const resend = new Resend(process.env.RESEND_API_KEY);

// Charger le logo au démarrage
let LOGO_BASE64 = null;
try {
  const logoPath = path.join(process.cwd(), 'public', 'logo.png');
  const logoBuffer = fs.readFileSync(logoPath);
  LOGO_BASE64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
} catch (error) {
  console.warn('Logo non trouve pour BCC:', error.message);
}

// Constantes PDF (reprises de pdf-common.js pour usage côté serveur)
const COMPANY = {
  name: 'Services TMT Inc.',
  address: '3195, 42e Rue Nord',
  city: 'Saint-Georges, QC G5Z 0V9',
  phone: '(418) 225-3875',
  email: 'info.servicestmt@gmail.com',
};

const PAGE = {
  width: 215.9,
  height: 279.4,
  margin: { left: 15, right: 15, top: 15, bottom: 15 },
};

const COLORS = {
  black: [0, 0, 0],
  gray: [100, 100, 100],
  headerBg: [240, 240, 240],
};

const FONT = {
  title: 16,
  subtitle: 10,
  companyName: 12,
  companyInfo: 9,
  sectionTitle: 10,
  body: 9,
  tableHeader: 8,
  tableBody: 8,
  footer: 8,
};

/**
 * Formater un montant en devise
 */
function formatCurrency(amount) {
  return '$' + (parseFloat(amount) || 0).toFixed(2);
}

/**
 * Formater une date en format québécois
 */
function formatDate(dateInput) {
  if (!dateInput) return 'N/A';
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [year, month, day] = dateInput.split('-');
    const monthNames = ['jan.', 'fev.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'aout', 'sept.', 'oct.', 'nov.', 'dec.'];
    return `${parseInt(day)} ${monthNames[parseInt(month) - 1]} ${year}`;
  }
  const date = new Date(dateInput);
  return date.toLocaleDateString('fr-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Dessine l'en-tête standardisé du PDF
 */
function drawHeader(doc, options) {
  const { title, fields = [] } = options;
  const rightX = PAGE.width - PAGE.margin.right;

  // Logo
  if (LOGO_BASE64) {
    try {
      doc.addImage(LOGO_BASE64, 'PNG', PAGE.margin.left, PAGE.margin.top, 40, 18);
    } catch (e) {
      console.error('Erreur logo PDF:', e.message);
    }
  }

  // Côté gauche : coordonnées
  const infoX = PAGE.margin.left + 45;
  let yInfo = PAGE.margin.top + 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT.companyName);
  doc.setTextColor(...COLORS.black);
  doc.text(COMPANY.name, infoX, yInfo);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(FONT.companyInfo);
  yInfo += 6;
  doc.text(COMPANY.address, infoX, yInfo);
  yInfo += 4.5;
  doc.text(COMPANY.city, infoX, yInfo);
  yInfo += 4.5;
  doc.text('Tel: ' + COMPANY.phone, infoX, yInfo);
  yInfo += 4.5;
  doc.text('Email: ' + COMPANY.email, infoX, yInfo);

  // Côté droit : titre + champs
  let yRight = PAGE.margin.top + 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT.title);
  doc.text(title, rightX, yRight, { align: 'right' });

  yRight += 8;
  doc.setFontSize(FONT.subtitle);

  for (const field of fields) {
    doc.setFont('helvetica', field.bold !== false ? 'bold' : 'normal');
    const text = field.label ? `${field.label} ${field.value}` : field.value;
    doc.text(text, rightX, yRight, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    yRight += 5;
  }

  // Ligne de séparation
  const lineY = Math.max(yInfo + 5, yRight + 2);
  doc.setLineWidth(0.5);
  doc.setDrawColor(...COLORS.black);
  doc.line(PAGE.margin.left, lineY, PAGE.width - PAGE.margin.right, lineY);

  return lineY + 7;
}

/**
 * Dessine le footer sur toutes les pages
 */
function drawFooter(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  const rightX = PAGE.width - PAGE.margin.right;
  const footerY = PAGE.height - 10;

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(FONT.footer);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.gray);

    const footerText = `Pour toute question: ${COMPANY.phone} \u2022 ${COMPANY.name} \u2022 ${COMPANY.email}`;
    doc.text(footerText, PAGE.width / 2, footerY, { align: 'center' });
    doc.text(`Page ${i} / ${pageCount}`, rightX, footerY, { align: 'right' });
    doc.setTextColor(...COLORS.black);
  }
}

/**
 * Génère le PDF BCC
 */
function generateBCCPDF(data) {
  const { purchase_order, client, bcc_items, totals, notes, recipient_emails } = data;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
  });

  // En-tête
  const today = new Date().toISOString().split('T')[0];
  let y = drawHeader(doc, {
    title: 'CONFIRMATION DE COMMANDE',
    fields: [
      { label: 'Réf.:', value: purchase_order.po_number || 'N/A' },
      { label: 'Date:', value: formatDate(today) },
    ],
  });

  // Informations client
  if (client) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FONT.sectionTitle);
    doc.text('CLIENT', PAGE.margin.left, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(FONT.body);
    if (client.name) {
      doc.setFont('helvetica', 'bold');
      doc.text(client.name, PAGE.margin.left, y);
      doc.setFont('helvetica', 'normal');
      y += 5;
    }
    if (client.address) {
      doc.text(client.address, PAGE.margin.left, y);
      y += 5;
    }
    if (client.phone) {
      doc.text('Tel: ' + client.phone, PAGE.margin.left, y);
      y += 5;
    }
    if (recipient_emails && recipient_emails.length > 0) {
      doc.text('Email: ' + recipient_emails.join(', '), PAGE.margin.left, y);
      y += 5;
    } else if (client.email) {
      doc.text('Email: ' + client.email, PAGE.margin.left, y);
      y += 5;
    }

    // Ligne de séparation
    doc.setLineWidth(0.3);
    doc.line(PAGE.margin.left, y + 2, PAGE.width - PAGE.margin.right, y + 2);
    y += 7;
  }

  // Description du BA
  if (purchase_order.description) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FONT.sectionTitle);
    doc.text('OBJET', PAGE.margin.left, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(FONT.body);
    const descLines = doc.splitTextToSize(purchase_order.description, PAGE.width - PAGE.margin.left - PAGE.margin.right);
    doc.text(descLines, PAGE.margin.left, y);
    y += descLines.length * 4.5 + 5;
  }

  // Tableau des articles
  const tableColumns = [
    { header: 'Code', dataKey: 'code' },
    { header: 'Description', dataKey: 'description' },
    { header: 'Qte Cmd', dataKey: 'qty_ordered' },
    { header: 'Prix Unit.', dataKey: 'unit_price' },
    { header: 'Prix Ligne', dataKey: 'line_price' },
    { header: 'En Main', dataKey: 'qty_in_stock' },
    { header: 'B/O', dataKey: 'qty_backorder' },
    { header: 'Livree', dataKey: 'qty_delivered' },
    { header: 'Delai', dataKey: 'delivery_estimate' },
  ];

  const tableBody = bcc_items.map(item => ({
    code: item.code || '',
    description: item.description || '',
    qty_ordered: item.qty_ordered || 0,
    unit_price: formatCurrency(item.unit_price),
    line_price: formatCurrency(item.line_price),
    qty_in_stock: item.qty_in_stock || 0,
    qty_backorder: item.qty_backorder || 0,
    qty_delivered: item.qty_delivered || 0,
    delivery_estimate: item.delivery_estimate || '-',
  }));

  doc.autoTable({
    startY: y,
    columns: tableColumns,
    body: tableBody,
    theme: 'grid',
    styles: {
      fontSize: FONT.tableBody,
      cellPadding: { top: 2, right: 2, bottom: 2, left: 2 },
      lineColor: COLORS.black,
      lineWidth: 0.2,
      textColor: COLORS.black,
      font: 'helvetica',
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: COLORS.headerBg,
      textColor: COLORS.black,
      fontStyle: 'bold',
      halign: 'center',
      fontSize: FONT.tableHeader,
    },
    columnStyles: {
      code: { cellWidth: 22, halign: 'left' },
      description: { cellWidth: 'auto', halign: 'left' },
      qty_ordered: { cellWidth: 16, halign: 'center' },
      unit_price: { cellWidth: 22, halign: 'right' },
      line_price: { cellWidth: 22, halign: 'right' },
      qty_in_stock: { cellWidth: 16, halign: 'center' },
      qty_backorder: { cellWidth: 14, halign: 'center' },
      qty_delivered: { cellWidth: 16, halign: 'center' },
      delivery_estimate: { cellWidth: 24, halign: 'center' },
    },
    margin: { left: PAGE.margin.left, right: PAGE.margin.right },
    showHead: 'everyPage',
    didParseCell: function (data) {
      // Mettre en évidence le stock en main
      if (data.column.dataKey === 'qty_in_stock' && data.section === 'body') {
        const val = parseFloat(data.cell.raw);
        if (val > 0) {
          data.cell.styles.textColor = [0, 128, 0];
          data.cell.styles.fontStyle = 'bold';
        }
      }
      // Mettre en évidence les backorders
      if (data.column.dataKey === 'qty_backorder' && data.section === 'body') {
        const val = parseFloat(data.cell.raw);
        if (val > 0) {
          data.cell.styles.textColor = [200, 100, 0];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  y = doc.lastAutoTable.finalY + 8;

  // Section totaux
  const maxY = PAGE.height - PAGE.margin.bottom - 15;
  if (y + 40 > maxY) {
    doc.addPage();
    y = PAGE.margin.top + 10;
  }

  const rightX = PAGE.width - PAGE.margin.right;
  const labelX = rightX - 65;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(FONT.body);
  doc.setTextColor(...COLORS.black);

  doc.text('Sous-total:', labelX, y);
  doc.text(formatCurrency(totals.subtotal), rightX, y, { align: 'right' });
  y += 6;

  doc.text('TPS (5%):', labelX, y);
  doc.text(formatCurrency(totals.tps), rightX, y, { align: 'right' });
  y += 6;

  doc.text('TVQ (9.975%):', labelX, y);
  doc.text(formatCurrency(totals.tvq), rightX, y, { align: 'right' });
  y += 6;

  doc.setLineWidth(0.5);
  doc.line(labelX, y, rightX, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL:', labelX, y);
  doc.text(formatCurrency(totals.total), rightX, y, { align: 'right' });
  y += 12;

  // Notes
  if (notes) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(FONT.body);

    if (y + 20 > maxY) {
      doc.addPage();
      y = PAGE.margin.top + 10;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FONT.sectionTitle);
    doc.text('NOTES', PAGE.margin.left, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(FONT.body);
    const noteLines = doc.splitTextToSize(notes, PAGE.width - PAGE.margin.left - PAGE.margin.right);
    doc.text(noteLines, PAGE.margin.left, y);
    y += noteLines.length * 4.5 + 5;
  }

  // Texte légal
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.gray);

  if (y + 15 > maxY) {
    doc.addPage();
    y = PAGE.margin.top + 10;
  }

  doc.text(
    'Toute marchandise demeure la propriete de Services TMT Inc. jusqu\'au paiement complet.',
    PAGE.margin.left, y
  );
  doc.text(
    'Les delais de livraison sont fournis a titre indicatif et peuvent varier.',
    PAGE.margin.left, y + 4
  );

  // Footer
  drawFooter(doc);

  return doc;
}

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      return Response.json(
        { success: false, error: 'RESEND_API_KEY manquante' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { purchase_order, client, bcc_items, totals, recipient_emails, notes } = body;

    // Validation
    if (!recipient_emails || recipient_emails.length === 0) {
      return Response.json(
        { success: false, error: 'Au moins un destinataire est requis' },
        { status: 400 }
      );
    }

    if (!bcc_items || bcc_items.length === 0) {
      return Response.json(
        { success: false, error: 'Au moins un article est requis' },
        { status: 400 }
      );
    }

    // Générer le PDF
    console.log(`Generation PDF BCC pour BA #${purchase_order.po_number}...`);
    const doc = generateBCCPDF({ purchase_order, client, bcc_items, totals, notes, recipient_emails });

    // Convertir en base64
    const pdfOutput = doc.output('arraybuffer');
    const pdfBase64 = Buffer.from(pdfOutput).toString('base64');

    // Construire l'email
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@servicestmt.ca';
    const clientName = client?.name || purchase_order.client_name || 'Client';
    const poNumber = purchase_order.po_number || 'N/A';

    const emailData = {
      from: fromEmail,
      to: recipient_emails,
      subject: `Confirmation de commande - BA #${poNumber} - ${COMPANY.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #059669 0%, #0d9488 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 22px;">Confirmation de Commande</h1>
            <p style="margin: 8px 0 0 0; opacity: 0.9;">BA #${poNumber}</p>
          </div>

          <div style="background: white; padding: 20px; border: 1px solid #e0e0e0; border-top: none;">
            <p>Bonjour,</p>
            <p>Vous trouverez ci-joint la confirmation de commande pour votre bon d'achat <strong>#${poNumber}</strong>.</p>

            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
              <tr>
                <td style="padding: 6px 0; border-bottom: 1px solid #eee;"><strong>Client:</strong></td>
                <td style="padding: 6px 0; border-bottom: 1px solid #eee;">${clientName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; border-bottom: 1px solid #eee;"><strong>Articles:</strong></td>
                <td style="padding: 6px 0; border-bottom: 1px solid #eee;">${bcc_items.length} article(s)</td>
              </tr>
              <tr>
                <td style="padding: 6px 0;"><strong>Total:</strong></td>
                <td style="padding: 6px 0; font-weight: bold; color: #059669; font-size: 16px;">
                  ${formatCurrency(totals.total)}
                </td>
              </tr>
            </table>

            ${notes ? `
            <div style="background: #f0fdf4; border-left: 4px solid #059669; padding: 12px; margin: 15px 0;">
              <p style="margin: 0; font-size: 14px; color: #333;">${notes}</p>
            </div>
            ` : ''}

            <p style="color: #666; font-size: 13px; margin-top: 15px;">
              Le document PDF detaille est joint a cet email.
            </p>
          </div>

          <div style="background: #f8f9fa; padding: 12px; text-align: center; border-radius: 0 0 8px 8px; border: 1px solid #e0e0e0; border-top: none;">
            <p style="margin: 0; color: #666; font-size: 11px;">
              ${COMPANY.name} | ${COMPANY.phone} | ${COMPANY.email}
            </p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `BCC-${poNumber}.pdf`,
          content: pdfBase64,
          type: 'application/pdf',
          disposition: 'attachment',
        },
      ],
    };

    // Envoyer l'email
    console.log(`Envoi BCC a ${recipient_emails.join(', ')}...`);
    const { data, error } = await resend.emails.send(emailData);

    if (error) {
      console.error('Erreur Resend BCC:', error);
      return Response.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    console.log(`BCC envoye avec succes pour BA #${poNumber}, messageId: ${data.id}`);

    // Sauvegarder le suivi BCC dans la base de données
    const sentAt = new Date().toISOString();
    try {
      // 1. Charger les données actuelles du BA
      const { data: currentPO } = await supabaseAdmin
        .from('purchase_orders')
        .select('files, bcc_sent_count, bcc_history')
        .eq('id', id)
        .single();

      // 2. Ajouter le PDF BCC dans le tableau files
      const currentFiles = currentPO?.files || [];
      const bccFileEntry = {
        id: 'bcc-' + Date.now(),
        name: `BCC-${poNumber}.pdf`,
        type: 'application/pdf',
        is_bcc: true,
        bcc_date: sentAt,
        bcc_recipients: recipient_emails,
        bcc_items_count: bcc_items.length,
        bcc_total: totals.total,
        size: Math.round(pdfBase64.length * 0.75), // Taille approximative du PDF
        uploadDate: sentAt,
        data: `data:application/pdf;base64,${pdfBase64}`
      };
      const updatedFiles = [...currentFiles, bccFileEntry];

      // 3. Ajouter l'entrée dans bcc_history
      const currentHistory = currentPO?.bcc_history || [];
      const bccHistoryEntry = {
        sent_at: sentAt,
        recipients: recipient_emails,
        items_count: bcc_items.length,
        items: bcc_items.map(item => ({
          code: item.code || '',
          description: item.description || '',
          qty_ordered: item.qty_ordered || 0,
          delivery_estimate: item.delivery_estimate || '',
        })),
        total: totals.total,
        notes: notes || '',
        message_id: data.id
      };
      const updatedHistory = [...currentHistory, bccHistoryEntry];

      // 4. Mettre à jour le BA
      const { error: updateError } = await supabaseAdmin
        .from('purchase_orders')
        .update({
          files: updatedFiles,
          bcc_sent_count: (currentPO?.bcc_sent_count || 0) + 1,
          bcc_history: updatedHistory,
          updated_at: sentAt
        })
        .eq('id', id);

      if (updateError) {
        console.error('Erreur sauvegarde suivi BCC (non-bloquant):', updateError.message);
        // Non-bloquant: l'email a déjà été envoyé avec succès
      } else {
        console.log(`Suivi BCC sauvegarde: ${updatedHistory.length} envoi(s) total pour BA #${poNumber}`);
      }
    } catch (trackingError) {
      console.error('Erreur suivi BCC (non-bloquant):', trackingError.message);
    }

    return Response.json({
      success: true,
      messageId: data.id,
      sent_at: sentAt,
    });

  } catch (error) {
    console.error('Exception API send-confirmation:', error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
