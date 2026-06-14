/**
 * @file lib/services/report-pdf.js
 * @description Générateurs PDF des rapports comptables (ventes + paiements).
 *              - Constructeurs purs: retournent un document jsPDF (pas de save/output)
 *                pour être réutilisés côté client (download) ET serveur (email).
 *              - En-tête/footer standardisés via pdf-common.js.
 *              - Rapport de ventes: 1 ligne / facture + ligne TOTAUX.
 *              - Rapport de paiements: 1 ligne / paiement + TOTAUX + sous-totaux par mode.
 * @version 1.1.0
 * @date 2026-06-14
 * @changelog
 *   1.1.0 - Rapport de ventes: ajout colonne « Forfait/Autre » (réconcilie le sous-total)
 *   1.0.0 - Version initiale (rapports comptables ventes/paiements)
 */

const { jsPDF } = require('jspdf');
require('jspdf-autotable');
const pdfCommon = require('./pdf-common');

const { CONTENT_WIDTH, COLORS, PAGE, FONT } = pdfCommon;

const METHOD_LABELS = {
  cheque: 'Chèque',
  virement: 'Virement',
  comptant: 'Comptant',
  autre: 'Autre',
};

function fmt(amount) {
  return pdfCommon.formatCurrency(amount);
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  // YYYY-MM-DD attendu — affiché tel quel (cohérent avec le rapport Acomba)
  return dateStr;
}

// ============================================
// RAPPORT DE VENTES
// ============================================

/**
 * Construit le document PDF du rapport de ventes.
 * @param {Object} data - { period:{label}, invoices:[], totals:{}, count }
 * @param {string|null} logoBase64
 * @returns {jsPDF}
 */
function buildSalesReportDoc(data, logoBase64) {
  const { period, invoices, totals, count } = data;
  const doc = new jsPDF({ format: 'letter', unit: 'mm' });
  const periodLabel = period?.label || '';

  let yPos = pdfCommon.drawHeader(doc, logoBase64, {
    title: 'RAPPORT DE VENTES',
    fields: [
      { label: 'Période:', value: periodLabel },
      { label: 'Factures:', value: String(count) },
      { label: 'Total:', value: fmt(totals.total) },
    ],
  });

  const columns = [
    { header: 'N° Fact.', dataKey: 'number' },
    { header: 'Date', dataKey: 'date' },
    { header: 'Client', dataKey: 'client' },
    { header: 'Réf.', dataKey: 'reference' },
    { header: 'Vente mat.', dataKey: 'materials' },
    { header: 'Vente M.O.', dataKey: 'labor' },
    { header: 'Vente dépl.', dataKey: 'transport' },
    { header: 'Forfait/ Autre', dataKey: 'forfait' },
    { header: 'Sous-total', dataKey: 'subtotal' },
    { header: 'TPS', dataKey: 'tps' },
    { header: 'TVQ', dataKey: 'tvq' },
    { header: 'Total', dataKey: 'total' },
  ];

  const body = invoices.map(inv => ({
    number: inv.invoice_number,
    date: formatDateShort(inv.invoice_date),
    client: (inv.client_name || '').substring(0, 16),
    reference: inv.source_number || '',
    materials: fmt(inv.total_materials),
    labor: fmt(inv.total_labor),
    transport: fmt(inv.total_transport),
    forfait: fmt(inv.total_forfait_other),
    subtotal: fmt(inv.subtotal),
    tps: fmt(inv.tps_amount),
    tvq: fmt(inv.tvq_amount),
    total: fmt(inv.total),
  }));

  body.push({
    number: '',
    date: '',
    client: '',
    reference: 'TOTAUX',
    materials: fmt(totals.total_materials),
    labor: fmt(totals.total_labor),
    transport: fmt(totals.total_transport),
    forfait: fmt(totals.total_forfait_other),
    subtotal: fmt(totals.subtotal),
    tps: fmt(totals.tps_amount),
    tvq: fmt(totals.tvq_amount),
    total: fmt(totals.total),
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
      number: { cellWidth: 13, halign: 'center', font: 'courier' },
      date: { cellWidth: 15, halign: 'center' },
      client: { cellWidth: 18 },
      reference: { cellWidth: 13, halign: 'center', font: 'courier' },
      materials: { cellWidth: 14, halign: 'right', font: 'courier' },
      labor: { cellWidth: 14, halign: 'right', font: 'courier' },
      transport: { cellWidth: 14, halign: 'right', font: 'courier' },
      forfait: { cellWidth: 15, halign: 'right', font: 'courier' },
      subtotal: { cellWidth: 15, halign: 'right', font: 'courier' },
      tps: { cellWidth: 12, halign: 'right', font: 'courier' },
      tvq: { cellWidth: 12, halign: 'right', font: 'courier' },
      total: { cellWidth: 15, halign: 'right', font: 'courier' },
    },
    margin: { left: PAGE.margin.left, right: PAGE.margin.right },
    showHead: 'everyPage',
    didParseCell: function (cell) {
      if (cell.section === 'body' && cell.row.index === invoices.length) {
        cell.cell.styles.fontStyle = 'bold';
        cell.cell.styles.fillColor = [230, 230, 230];
      }
    },
    didDrawPage: function (info) {
      if (info.pageNumber > 1) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...COLORS.black);
        doc.text(`RAPPORT DE VENTES — ${periodLabel} (suite)`, PAGE.margin.left, PAGE.margin.top + 5);
      }
    },
  });

  pdfCommon.drawFooter(doc);
  return doc;
}

// ============================================
// RAPPORT DE PAIEMENTS
// ============================================

/**
 * Construit le document PDF du rapport de paiements (journal des encaissements).
 * @param {Object} data - { period:{label}, payments:[], totals:{ amount, discount, by_method }, count }
 * @param {string|null} logoBase64
 * @returns {jsPDF}
 */
function buildPaymentsReportDoc(data, logoBase64) {
  const { period, payments, totals, count } = data;
  const doc = new jsPDF({ format: 'letter', unit: 'mm' });
  const periodLabel = period?.label || '';

  let yPos = pdfCommon.drawHeader(doc, logoBase64, {
    title: 'RAPPORT DE PAIEMENTS',
    fields: [
      { label: 'Période:', value: periodLabel },
      { label: 'Paiements:', value: String(count) },
      { label: 'Total encaissé:', value: fmt(totals.amount) },
    ],
  });

  const columns = [
    { header: 'Date', dataKey: 'date' },
    { header: 'Mode', dataKey: 'method' },
    { header: 'Référence', dataKey: 'reference' },
    { header: 'Client', dataKey: 'client' },
    { header: 'Facture', dataKey: 'invoice' },
    { header: 'Montant', dataKey: 'amount' },
    { header: 'Escompte', dataKey: 'discount' },
  ];

  const body = payments.map(p => ({
    date: formatDateShort(p.payment_date),
    method: METHOD_LABELS[p.method] || p.method || '',
    reference: p.reference || '',
    client: (p.client_name || '').substring(0, 26),
    invoice: p.invoice_number || '',
    amount: fmt(p.amount),
    discount: (parseFloat(p.discount_applied) || 0) > 0 ? fmt(p.discount_applied) : '',
  }));

  body.push({
    date: '',
    method: '',
    reference: '',
    client: '',
    invoice: 'TOTAUX',
    amount: fmt(totals.amount),
    discount: fmt(totals.discount),
  });

  doc.autoTable({
    startY: yPos,
    columns,
    body,
    theme: 'grid',
    tableWidth: CONTENT_WIDTH,
    styles: {
      fontSize: 8,
      cellPadding: { top: 1.8, right: 2, bottom: 1.8, left: 2 },
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
      fontSize: 8,
    },
    columnStyles: {
      date: { cellWidth: 22, halign: 'center' },
      method: { cellWidth: 22, halign: 'center' },
      reference: { cellWidth: 28, font: 'courier' },
      client: { cellWidth: 'auto' },
      invoice: { cellWidth: 26, halign: 'center', font: 'courier' },
      amount: { cellWidth: 26, halign: 'right', font: 'courier' },
      discount: { cellWidth: 24, halign: 'right', font: 'courier' },
    },
    margin: { left: PAGE.margin.left, right: PAGE.margin.right },
    showHead: 'everyPage',
    didParseCell: function (cell) {
      if (cell.section === 'body' && cell.row.index === payments.length) {
        cell.cell.styles.fontStyle = 'bold';
        cell.cell.styles.fillColor = [230, 230, 230];
      }
    },
    didDrawPage: function (info) {
      if (info.pageNumber > 1) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...COLORS.black);
        doc.text(`RAPPORT DE PAIEMENTS — ${periodLabel} (suite)`, PAGE.margin.left, PAGE.margin.top + 5);
      }
    },
  });

  let y = doc.lastAutoTable.finalY + 8;

  // ---- SOUS-TOTAUX PAR MODE DE PAIEMENT ----
  y = pdfCommon.checkPageBreak(doc, y, 30);
  y = pdfCommon.drawSectionTitle(doc, 'SOMMAIRE PAR MODE DE PAIEMENT', y);

  const bm = totals.by_method || {};
  const methodRows = ['cheque', 'virement', 'comptant', 'autre']
    .filter(k => (bm[k] || 0) !== 0)
    .map(k => ({ mode: METHOD_LABELS[k], amount: fmt(bm[k]) }));

  // Toujours afficher au moins le total
  methodRows.push({ mode: 'TOTAL ENCAISSÉ', amount: fmt(totals.amount) });

  doc.autoTable({
    startY: y,
    columns: [
      { header: 'Mode de paiement', dataKey: 'mode' },
      { header: 'Montant', dataKey: 'amount' },
    ],
    body: methodRows,
    theme: 'grid',
    tableWidth: 90,
    styles: {
      fontSize: 9,
      cellPadding: { top: 2, right: 3, bottom: 2, left: 3 },
      lineColor: COLORS.black,
      lineWidth: 0.2,
      textColor: COLORS.black,
      font: 'helvetica',
    },
    headStyles: {
      fillColor: COLORS.headerBg,
      textColor: COLORS.black,
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 9,
    },
    columnStyles: {
      mode: { cellWidth: 55 },
      amount: { cellWidth: 35, halign: 'right', font: 'courier' },
    },
    margin: { left: PAGE.margin.left, right: PAGE.margin.right },
    didParseCell: function (cell) {
      if (cell.section === 'body' && cell.row.index === methodRows.length - 1) {
        cell.cell.styles.fontStyle = 'bold';
        cell.cell.styles.fillColor = [230, 230, 230];
      }
    },
  });

  pdfCommon.drawFooter(doc);
  return doc;
}

module.exports = {
  buildSalesReportDoc,
  buildPaymentsReportDoc,
  METHOD_LABELS,
};
