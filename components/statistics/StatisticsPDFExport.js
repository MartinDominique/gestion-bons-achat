/**
 * @file components/statistics/StatisticsPDFExport.js
 * @description Génération PDF des rapports de ventes/statistiques
 *              - Utilise pdf-common.js pour l'en-tête/footer standardisé
 *              - Tableau des documents avec revenus/coûts/marges
 *              - Bandeau résumé des totaux
 * @version 1.0.0
 * @date 2026-02-24
 * @changelog
 *   1.0.0 - Version initiale - Phase 1 MVP
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
 * Génère et télécharge un PDF du rapport de ventes
 * @param {Object} params
 * @param {Array} params.documents - Documents à inclure dans le rapport
 * @param {Object} params.summary - Résumé des totaux
 * @param {Object} params.filters - Filtres actifs (pour affichage)
 * @param {Array} params.clients - Liste des clients (pour résolution nom)
 */
export async function generateStatisticsPDF({ documents, summary, filters, clients = [] }) {
  const doc = new jsPDF({ format: 'letter', unit: 'mm' });
  const logoBase64 = await getLogoBase64();

  // ============ EN-TÊTE ============
  const periodText = `${filters.dateFrom || '...'} au ${filters.dateTo || '...'}`;
  const clientName = filters.clientId
    ? (clients.find(c => String(c.id) === String(filters.clientId))?.name || '')
    : 'Tous';

  let yPos = drawHeader(doc, logoBase64, {
    title: 'RAPPORT DE VENTES',
    fields: [
      { label: 'Période:', value: periodText },
      { label: 'Client:', value: clientName },
      { label: 'Documents:', value: String(summary?.documentCount || 0) },
    ],
  });

  // ============ FILTRES ACTIFS ============
  const activeFilters = [];
  if (filters.types && filters.types.length < 3) {
    activeFilters.push('Types: ' + filters.types.map(t => t === 'bt' ? 'BT' : t === 'bl' ? 'BL' : 'Soum.').join(', '));
  }
  if (filters.documentNumber) activeFilters.push('N° Doc: ' + filters.documentNumber);
  if (filters.search) activeFilters.push('Description: ' + filters.search);
  if (filters.productId) activeFilters.push('Produit: ' + filters.productId);

  if (activeFilters.length > 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.gray);
    doc.text('Filtres: ' + activeFilters.join(' | '), PAGE.margin.left, yPos);
    doc.setTextColor(...COLORS.black);
    doc.setFont('helvetica', 'normal');
    yPos += 6;
  }

  // ============ BANDEAU RÉSUMÉ ============
  if (summary) {
    yPos = drawSectionTitle(doc, 'RÉSUMÉ', yPos);

    doc.setFontSize(FONT.body);
    doc.setFont('helvetica', 'normal');

    const summaryLines = [
      `Documents: ${summary.documentCount} (${summary.btCount} BT, ${summary.blCount} BL, ${summary.soumCount} Soum.)`,
      `Revenus: ${pdfFormatCurrency(summary.totalRevenue)}    Coûts: ${pdfFormatCurrency(summary.totalCost)}    Marge: ${pdfFormatCurrency(summary.totalMargin)} (${summary.marginPercent.toFixed(1)}%)`,
    ];

    summaryLines.forEach(line => {
      doc.text(line, PAGE.margin.left, yPos);
      yPos += 5;
    });

    yPos += 3;
  }

  // ============ TABLEAU DES DOCUMENTS ============
  if (documents && documents.length > 0) {
    const columns = [
      { header: 'Type', dataKey: 'type' },
      { header: 'N° Document', dataKey: 'docNum' },
      { header: 'Date', dataKey: 'date' },
      { header: 'Client', dataKey: 'client' },
      { header: 'Revenus', dataKey: 'revenue' },
      { header: 'Coûts', dataKey: 'cost' },
      { header: 'Marge $', dataKey: 'margin' },
      { header: 'Marge %', dataKey: 'marginPct' },
      { header: 'Statut', dataKey: 'status' },
    ];

    const statusLabels = {
      draft: 'Brouillon',
      signed: 'Signé',
      pending_send: 'En attente',
      completed: 'Complété',
      sent: 'Envoyé',
      ready_for_signature: 'Prêt sign.',
      accepted: 'Acceptée',
      refused: 'Refusée',
    };

    const body = documents.map(d => ({
      type: d.type,
      docNum: d.documentNumber,
      date: formatDatePDF(d.date),
      client: (d.clientName || '').substring(0, 25),
      revenue: pdfFormatCurrency(d.revenue),
      cost: pdfFormatCurrency(d.cost),
      margin: pdfFormatCurrency(d.margin),
      marginPct: d.marginPercent.toFixed(1) + '%',
      status: statusLabels[d.status] || d.status,
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
        type: { cellWidth: 12, halign: 'center' },
        docNum: { cellWidth: 28, halign: 'left', font: 'courier' },
        date: { cellWidth: 22, halign: 'center' },
        client: { cellWidth: 30 },
        revenue: { cellWidth: 22, halign: 'right', font: 'courier' },
        cost: { cellWidth: 22, halign: 'right', font: 'courier' },
        margin: { cellWidth: 22, halign: 'right', font: 'courier' },
        marginPct: { cellWidth: 16, halign: 'right', font: 'courier' },
        status: { cellWidth: 18, halign: 'center' },
      },
      margin: { left: PAGE.margin.left, right: PAGE.margin.right },
      showHead: 'everyPage',
      didParseCell: function (data) {
        // Colorer la marge en rouge si négative
        if (data.section === 'body' && (data.column.dataKey === 'margin' || data.column.dataKey === 'marginPct')) {
          const doc = documents[data.row.index];
          if (doc && doc.marginPercent < 0) {
            data.cell.styles.textColor = [200, 0, 0];
          } else if (doc && doc.marginPercent >= 30) {
            data.cell.styles.textColor = [0, 128, 0];
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

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    const rightX = PAGE.width - PAGE.margin.right;

    doc.text('TOTAL REVENUS:', rightX - 65, yPos);
    doc.text(pdfFormatCurrency(summary.totalRevenue), rightX, yPos, { align: 'right' });
    yPos += 5;

    doc.text('TOTAL COÛTS:', rightX - 65, yPos);
    doc.text(pdfFormatCurrency(summary.totalCost), rightX, yPos, { align: 'right' });
    yPos += 5;

    doc.setLineWidth(0.5);
    doc.line(rightX - 65, yPos, rightX, yPos);
    yPos += 5;

    doc.setFontSize(11);
    doc.text('MARGE TOTALE:', rightX - 65, yPos);
    doc.text(`${pdfFormatCurrency(summary.totalMargin)} (${summary.marginPercent.toFixed(1)}%)`, rightX, yPos, { align: 'right' });
  }

  // ============ FOOTER ============
  drawFooter(doc);

  // ============ TÉLÉCHARGEMENT ============
  const fileName = `Rapport-Ventes_${filters.dateFrom || 'debut'}_${filters.dateTo || 'fin'}.pdf`;
  doc.save(fileName);

  return fileName;
}
