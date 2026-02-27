/**
 * @file components/statistics/FinancialPDFExport.js
 * @description Génération PDF des rapports financiers (Statistiques Phase 2)
 *              - 3 modes: Par mois, Par client, En attente
 *              - Utilise pdf-common.js pour l'en-tête/footer standardisé
 *              - Bandeau résumé + tableau détaillé
 * @version 1.0.0
 * @date 2026-02-27
 * @changelog
 *   1.0.0 - Version initiale (Phase D — Statistiques Phase 2)
 */

import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import {
  drawHeader, drawFooter, drawSectionTitle,
  loadLogoBase64Client, formatCurrency as pdfFormatCurrency,
  PAGE, COLORS, FONT
} from '../../lib/services/pdf-common';

let _cachedLogoBase64 = null;
async function getLogoBase64() {
  if (_cachedLogoBase64) return _cachedLogoBase64;
  try {
    _cachedLogoBase64 = await loadLogoBase64Client();
  } catch (e) {
    console.warn('Logo non chargé:', e.message);
  }
  return _cachedLogoBase64;
}

function formatDatePDF(dateStr) {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('fr-CA', {
    timeZone: 'America/Toronto',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Génère et télécharge un PDF du rapport financier
 * @param {Object} params
 * @param {Object} params.data - Données financières (summary, byMonth, byClient, outstanding)
 * @param {Object} params.filters - Filtres actifs
 * @param {Array} params.clients - Liste des clients
 */
export async function generateFinancialPDF({ data, filters, clients = [] }) {
  const doc = new jsPDF({ format: 'letter', unit: 'mm' });
  const logoBase64 = await getLogoBase64();

  const { summary, byMonth, byClient, outstanding } = data;

  // ============ EN-TÊTE ============
  const periodText = `${filters.dateFrom || '...'} au ${filters.dateTo || '...'}`;
  const clientName = filters.clientId
    ? (clients.find(c => String(c.id) === String(filters.clientId))?.name || '')
    : 'Tous';

  const viewLabels = { byMonth: 'Par mois', byClient: 'Par client', outstanding: 'En attente' };

  let yPos = drawHeader(doc, logoBase64, {
    title: 'RAPPORT FINANCIER',
    fields: [
      { label: 'Période:', value: periodText },
      { label: 'Client:', value: clientName },
      { label: 'Factures:', value: String(summary?.totalInvoices || 0) },
      { label: 'Vue:', value: viewLabels[filters.view] || '' },
    ],
  });

  // ============ RÉSUMÉ ============
  if (summary) {
    yPos = drawSectionTitle(doc, 'RÉSUMÉ', yPos);
    doc.setFontSize(FONT.body);
    doc.setFont('helvetica', 'normal');

    const lines = [
      `Total facturé: ${pdfFormatCurrency(summary.totalAmount)}    Payé: ${pdfFormatCurrency(summary.totalPaid)}    En attente: ${pdfFormatCurrency(summary.totalOutstanding)}`,
      `Matériaux: ${pdfFormatCurrency(summary.totalMaterials)}    M.O.: ${pdfFormatCurrency(summary.totalLabor)}    Transport: ${pdfFormatCurrency(summary.totalTransport)}    Moy./fact.: ${pdfFormatCurrency(summary.avgInvoice)}`,
    ];
    lines.forEach(line => {
      doc.text(line, PAGE.margin.left, yPos);
      yPos += 5;
    });
    yPos += 3;
  }

  // ============ VUE PAR MOIS ============
  if (filters.view === 'byMonth' && byMonth && byMonth.length > 0) {
    yPos = drawSectionTitle(doc, 'REVENUS PAR MOIS', yPos);

    const columns = [
      { header: 'Mois', dataKey: 'label' },
      { header: 'Fact.', dataKey: 'count' },
      { header: 'Matériaux', dataKey: 'materials' },
      { header: 'M.O.', dataKey: 'labor' },
      { header: 'Transp.', dataKey: 'transport' },
      { header: 'Sous-total', dataKey: 'subtotal' },
      { header: 'TPS', dataKey: 'tps' },
      { header: 'TVQ', dataKey: 'tvq' },
      { header: 'Total', dataKey: 'total' },
      { header: 'Payé', dataKey: 'paid' },
      { header: 'Att.', dataKey: 'outstanding' },
    ];

    const body = byMonth.map(m => ({
      label: m.label,
      count: String(m.count),
      materials: pdfFormatCurrency(m.materials),
      labor: pdfFormatCurrency(m.labor),
      transport: pdfFormatCurrency(m.transport),
      subtotal: pdfFormatCurrency(m.subtotal),
      tps: pdfFormatCurrency(m.tps),
      tvq: pdfFormatCurrency(m.tvq),
      total: pdfFormatCurrency(m.total),
      paid: String(m.paidCount),
      outstanding: String(m.outstandingCount),
    }));

    doc.autoTable({
      startY: yPos,
      columns,
      body,
      theme: 'grid',
      styles: {
        fontSize: 6.5,
        cellPadding: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 },
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
        fontSize: 6.5,
      },
      columnStyles: {
        label: { cellWidth: 22 },
        count: { cellWidth: 10, halign: 'center' },
        materials: { cellWidth: 18, halign: 'right', font: 'courier' },
        labor: { cellWidth: 18, halign: 'right', font: 'courier' },
        transport: { cellWidth: 16, halign: 'right', font: 'courier' },
        subtotal: { cellWidth: 20, halign: 'right', font: 'courier' },
        tps: { cellWidth: 16, halign: 'right', font: 'courier' },
        tvq: { cellWidth: 16, halign: 'right', font: 'courier' },
        total: { cellWidth: 20, halign: 'right', font: 'courier' },
        paid: { cellWidth: 10, halign: 'center' },
        outstanding: { cellWidth: 10, halign: 'center' },
      },
      margin: { left: PAGE.margin.left, right: PAGE.margin.right },
      showHead: 'everyPage',
    });

    yPos = doc.lastAutoTable.finalY + 5;
  }

  // ============ VUE PAR CLIENT ============
  if (filters.view === 'byClient' && byClient && byClient.length > 0) {
    yPos = drawSectionTitle(doc, 'REVENUS PAR CLIENT', yPos);

    const columns = [
      { header: 'Client', dataKey: 'client' },
      { header: 'Fact.', dataKey: 'count' },
      { header: 'Matériaux', dataKey: 'materials' },
      { header: 'M.O.', dataKey: 'labor' },
      { header: 'Transp.', dataKey: 'transport' },
      { header: 'Total', dataKey: 'total' },
      { header: 'Payé', dataKey: 'paid' },
      { header: 'En att.', dataKey: 'outstanding' },
      { header: '%', dataKey: 'percent' },
    ];

    const body = byClient.map(c => ({
      client: (c.clientName || '').substring(0, 25),
      count: String(c.count),
      materials: pdfFormatCurrency(c.materials),
      labor: pdfFormatCurrency(c.labor),
      transport: pdfFormatCurrency(c.transport),
      total: pdfFormatCurrency(c.total),
      paid: pdfFormatCurrency(c.paidAmount),
      outstanding: c.outstandingAmount > 0 ? pdfFormatCurrency(c.outstandingAmount) : '-',
      percent: c.percentOfTotal.toFixed(1) + '%',
    }));

    doc.autoTable({
      startY: yPos,
      columns,
      body,
      theme: 'grid',
      styles: {
        fontSize: 7,
        cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 },
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
        fontSize: 7,
      },
      columnStyles: {
        client: { cellWidth: 30 },
        count: { cellWidth: 12, halign: 'center' },
        materials: { cellWidth: 20, halign: 'right', font: 'courier' },
        labor: { cellWidth: 20, halign: 'right', font: 'courier' },
        transport: { cellWidth: 18, halign: 'right', font: 'courier' },
        total: { cellWidth: 22, halign: 'right', font: 'courier' },
        paid: { cellWidth: 22, halign: 'right', font: 'courier' },
        outstanding: { cellWidth: 22, halign: 'right', font: 'courier' },
        percent: { cellWidth: 14, halign: 'right', font: 'courier' },
      },
      margin: { left: PAGE.margin.left, right: PAGE.margin.right },
      showHead: 'everyPage',
    });

    yPos = doc.lastAutoTable.finalY + 5;
  }

  // ============ VUE EN ATTENTE ============
  if (filters.view === 'outstanding' && outstanding && outstanding.length > 0) {
    yPos = drawSectionTitle(doc, 'FACTURES EN ATTENTE DE PAIEMENT', yPos);

    const columns = [
      { header: 'N° Facture', dataKey: 'number' },
      { header: 'Date', dataKey: 'date' },
      { header: 'Client', dataKey: 'client' },
      { header: 'Réf.', dataKey: 'reference' },
      { header: 'Total', dataKey: 'total' },
      { header: 'Conditions', dataKey: 'terms' },
      { header: 'Échéance', dataKey: 'dueDate' },
      { header: 'Retard', dataKey: 'overdue' },
    ];

    const body = outstanding.map(inv => ({
      number: inv.invoiceNumber,
      date: formatDatePDF(inv.invoiceDate),
      client: (inv.clientName || '').substring(0, 25),
      reference: inv.sourceNumber || '',
      total: pdfFormatCurrency(inv.total),
      terms: inv.paymentTerms || '-',
      dueDate: inv.dueDate ? formatDatePDF(inv.dueDate) : '-',
      overdue: inv.isOverdue ? `${Math.abs(inv.daysUntilDue)}j retard` : (inv.daysUntilDue !== null ? `${inv.daysUntilDue}j` : '-'),
    }));

    doc.autoTable({
      startY: yPos,
      columns,
      body,
      theme: 'grid',
      styles: {
        fontSize: 7,
        cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 },
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
        fontSize: 7,
      },
      columnStyles: {
        number: { cellWidth: 18, halign: 'center', font: 'courier' },
        date: { cellWidth: 22, halign: 'center' },
        client: { cellWidth: 30 },
        reference: { cellWidth: 22, halign: 'center', font: 'courier' },
        total: { cellWidth: 22, halign: 'right', font: 'courier' },
        terms: { cellWidth: 28 },
        dueDate: { cellWidth: 22, halign: 'center' },
        overdue: { cellWidth: 20, halign: 'center' },
      },
      margin: { left: PAGE.margin.left, right: PAGE.margin.right },
      showHead: 'everyPage',
      didParseCell: function (cellData) {
        // Colorer en rouge les factures en retard
        if (cellData.section === 'body' && cellData.column.dataKey === 'overdue') {
          const inv = outstanding[cellData.row.index];
          if (inv && inv.isOverdue) {
            cellData.cell.styles.textColor = [200, 0, 0];
            cellData.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });

    yPos = doc.lastAutoTable.finalY + 5;
  }

  // ============ TOTAUX EN BAS ============
  if (summary) {
    const maxY = PAGE.height - PAGE.margin.bottom - 30;
    if (yPos + 20 > maxY) {
      doc.addPage();
      yPos = PAGE.margin.top + 5;
    }

    const rightX = PAGE.width - PAGE.margin.right;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);

    doc.text('TOTAL FACTURÉ:', rightX - 65, yPos);
    doc.text(pdfFormatCurrency(summary.totalAmount), rightX, yPos, { align: 'right' });
    yPos += 5;

    doc.text('TOTAL PAYÉ:', rightX - 65, yPos);
    doc.setTextColor(0, 128, 0);
    doc.text(pdfFormatCurrency(summary.totalPaid), rightX, yPos, { align: 'right' });
    doc.setTextColor(...COLORS.black);
    yPos += 5;

    doc.setLineWidth(0.5);
    doc.line(rightX - 65, yPos, rightX, yPos);
    yPos += 5;

    doc.setFontSize(11);
    doc.text('EN ATTENTE:', rightX - 65, yPos);
    doc.setTextColor(200, 120, 0);
    doc.text(pdfFormatCurrency(summary.totalOutstanding), rightX, yPos, { align: 'right' });
    doc.setTextColor(...COLORS.black);
  }

  // ============ FOOTER ============
  drawFooter(doc);

  // ============ TÉLÉCHARGEMENT ============
  const viewSuffix = { byMonth: 'ParMois', byClient: 'ParClient', outstanding: 'EnAttente' };
  const fileName = `Rapport-Financier_${viewSuffix[filters.view] || ''}_${filters.dateFrom || 'debut'}_${filters.dateTo || 'fin'}.pdf`;
  doc.save(fileName);

  return fileName;
}
