/**
 * @file components/invoices/AcombaReportExport.js
 * @description Génération du rapport mensuel Acomba (PDF + CSV)
 *              - PDF: Tableau ventilé avec en-tête/footer standardisé
 *              - CSV: Export tabulaire pour import ou consultation
 *              - Colonnes: N° Facture, Date, Client, Référence, Vente mat.,
 *                Vente temps, Vente dépl., Sous-total, TPS, TVQ, Total
 *              - Ligne TOTAUX en bas du rapport
 * @version 1.0.1
 * @date 2026-03-11
 * @changelog
 *   1.0.1 - Fix largeurs colonnes PDF dépassant la zone imprimable (colonnes coupées à droite)
 *   1.0.0 - Version initiale (Phase C — Rapport Acomba)
 */

import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import {
  drawHeader, drawFooter, drawSeparatorLine,
  loadLogoBase64Client, formatCurrency as pdfFormatCurrency,
  PAGE, CONTENT_WIDTH, COLORS, FONT
} from '../../lib/services/pdf-common';

// ============================================
// CACHE LOGO
// ============================================

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

// ============================================
// UTILITAIRES
// ============================================

const MONTHS_FR = [
  '', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
];

function formatMonthLabel(month) {
  if (!month) return '';
  const [year, mon] = month.split('-');
  return `${MONTHS_FR[parseInt(mon)]} ${year}`;
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${year}-${month}-${day}`;
}

function formatCurrencyReport(amount) {
  const val = parseFloat(amount) || 0;
  return val.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
}

// ============================================
// GÉNÉRATION PDF
// ============================================

/**
 * Génère et télécharge le PDF du rapport Acomba mensuel
 * @param {Object} reportData - Données du rapport
 * @param {string} reportData.month - Mois au format YYYY-MM
 * @param {Array} reportData.invoices - Liste des factures
 * @param {Object} reportData.totals - Totaux agrégés
 * @param {number} reportData.count - Nombre de factures
 */
export async function generateAcombaReportPDF(reportData) {
  const { month, invoices, totals, count } = reportData;
  const doc = new jsPDF({ format: 'letter', unit: 'mm' });
  const logoBase64 = await getLogoBase64();

  // ---- EN-TÊTE ----
  const monthLabel = formatMonthLabel(month);

  let yPos = drawHeader(doc, logoBase64, {
    title: 'RAPPORT ACOMBA',
    fields: [
      { label: 'Période:', value: monthLabel },
      { label: 'Factures:', value: String(count) },
      { label: 'Total:', value: pdfFormatCurrency(totals.total) },
    ],
  });

  // ---- TABLEAU ----
  const columns = [
    { header: 'N° Fact.', dataKey: 'number' },
    { header: 'Date', dataKey: 'date' },
    { header: 'Client', dataKey: 'client' },
    { header: 'Réf.', dataKey: 'reference' },
    { header: 'Vente mat.', dataKey: 'materials' },
    { header: 'Vente temps', dataKey: 'labor' },
    { header: 'Vente dépl.', dataKey: 'transport' },
    { header: 'Sous-total', dataKey: 'subtotal' },
    { header: 'TPS', dataKey: 'tps' },
    { header: 'TVQ', dataKey: 'tvq' },
    { header: 'Total', dataKey: 'total' },
  ];

  const body = invoices.map(inv => ({
    number: inv.invoice_number,
    date: formatDateShort(inv.invoice_date),
    client: (inv.client_name || '').substring(0, 18),
    reference: inv.source_number || '',
    materials: pdfFormatCurrency(inv.total_materials),
    labor: pdfFormatCurrency(inv.total_labor),
    transport: pdfFormatCurrency(inv.total_transport),
    subtotal: pdfFormatCurrency(inv.subtotal),
    tps: pdfFormatCurrency(inv.tps_amount),
    tvq: pdfFormatCurrency(inv.tvq_amount),
    total: pdfFormatCurrency(inv.total),
  }));

  // Ligne TOTAUX
  body.push({
    number: '',
    date: '',
    client: '',
    reference: 'TOTAUX',
    materials: pdfFormatCurrency(totals.total_materials),
    labor: pdfFormatCurrency(totals.total_labor),
    transport: pdfFormatCurrency(totals.total_transport),
    subtotal: pdfFormatCurrency(totals.subtotal),
    tps: pdfFormatCurrency(totals.tps_amount),
    tvq: pdfFormatCurrency(totals.tvq_amount),
    total: pdfFormatCurrency(totals.total),
  });

  doc.autoTable({
    startY: yPos,
    columns,
    body,
    theme: 'grid',
    tableWidth: CONTENT_WIDTH,
    styles: {
      fontSize: 6,
      cellPadding: { top: 1.5, right: 1, bottom: 1.5, left: 1 },
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
      fontSize: 6,
    },
    columnStyles: {
      number: { cellWidth: 14, halign: 'center', font: 'courier' },
      date: { cellWidth: 16, halign: 'center' },
      client: { cellWidth: 24 },
      reference: { cellWidth: 17, halign: 'center', font: 'courier' },
      materials: { cellWidth: 16, halign: 'right', font: 'courier' },
      labor: { cellWidth: 16, halign: 'right', font: 'courier' },
      transport: { cellWidth: 16, halign: 'right', font: 'courier' },
      subtotal: { cellWidth: 17, halign: 'right', font: 'courier' },
      tps: { cellWidth: 13, halign: 'right', font: 'courier' },
      tvq: { cellWidth: 13, halign: 'right', font: 'courier' },
      total: { cellWidth: 17, halign: 'right', font: 'courier' },
    },
    margin: { left: PAGE.margin.left, right: PAGE.margin.right },
    showHead: 'everyPage',
    didParseCell: function (data) {
      // Mettre la ligne TOTAUX en gras
      if (data.section === 'body' && data.row.index === invoices.length) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [230, 230, 230];
      }
    },
    didDrawPage: function (data) {
      // Répéter l'en-tête sur chaque page après la première
      if (data.pageNumber > 1) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...COLORS.black);
        doc.text(`RAPPORT ACOMBA — ${monthLabel} (suite)`, PAGE.margin.left, PAGE.margin.top + 5);
      }
    },
  });

  // ---- FOOTER ----
  drawFooter(doc);

  // ---- TÉLÉCHARGEMENT ----
  const fileName = `Rapport-Acomba_${month}.pdf`;
  doc.save(fileName);
  return fileName;
}

// ============================================
// GÉNÉRATION CSV
// ============================================

/**
 * Génère et télécharge un CSV du rapport Acomba mensuel
 * @param {Object} reportData - Données du rapport
 */
export function generateAcombaReportCSV(reportData) {
  const { month, invoices, totals } = reportData;

  // En-têtes CSV
  const headers = [
    'N° Facture',
    'Date',
    'Client',
    'Référence',
    'Vente matériaux',
    'Vente temps',
    'Vente déplacements',
    'Sous-total',
    'TPS',
    'TVQ',
    'Total',
    'Statut',
  ];

  // Lignes de données
  const rows = invoices.map(inv => [
    inv.invoice_number,
    inv.invoice_date,
    `"${(inv.client_name || '').replace(/"/g, '""')}"`,
    inv.source_number || '',
    (parseFloat(inv.total_materials) || 0).toFixed(2),
    (parseFloat(inv.total_labor) || 0).toFixed(2),
    (parseFloat(inv.total_transport) || 0).toFixed(2),
    (parseFloat(inv.subtotal) || 0).toFixed(2),
    (parseFloat(inv.tps_amount) || 0).toFixed(2),
    (parseFloat(inv.tvq_amount) || 0).toFixed(2),
    (parseFloat(inv.total) || 0).toFixed(2),
    inv.status === 'paid' ? 'Payée' : inv.status === 'sent' ? 'Envoyée' : 'Brouillon',
  ]);

  // Ligne TOTAUX
  rows.push([
    '',
    '',
    '',
    'TOTAUX',
    totals.total_materials.toFixed(2),
    totals.total_labor.toFixed(2),
    totals.total_transport.toFixed(2),
    totals.subtotal.toFixed(2),
    totals.tps_amount.toFixed(2),
    totals.tvq_amount.toFixed(2),
    totals.total.toFixed(2),
    '',
  ]);

  // Assembler le CSV (séparateur point-virgule pour Excel français)
  const csvContent = [
    headers.join(';'),
    ...rows.map(row => row.join(';')),
  ].join('\n');

  // BOM UTF-8 pour Excel
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `Rapport-Acomba_${month}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return link.download;
}
