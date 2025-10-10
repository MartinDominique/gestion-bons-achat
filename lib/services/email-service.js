// ============================================
// SERVICE EMAIL + PDF – STYLE GOOGLE SHEETS (TMT)
// Remplace entièrement le rendu PDF pour matcher la mise en page
// du modèle "BON DE TRAVAIL.xlsx - Google Sheets.pdf" fourni.
// ============================================

const { Resend } = require('resend');
const { jsPDF } = require('jspdf');

// ————————————————————————————
// Config société (peut être surchargé par variables d'env)
// ————————————————————————————
const COMPANY_CONFIG = {
  name: process.env.COMPANY_NAME || 'Services TMT Inc.',
  address: process.env.COMPANY_ADDRESS || '3195, 42e Rue Nord',
  city: process.env.COMPANY_CITY || 'Saint-Georges (QC) G5Z0V9',
  phone: process.env.COMPANY_PHONE || '418 225-3875',
  email: process.env.COMPANY_EMAIL || 'servicestmt@gmail.com',
  resendFrom: process.env.RESEND_FROM_EMAIL || 'noreply@servicestmt.com',
};

const resend = new Resend(process.env.RESEND_API_KEY);

// ————————————————————————————
// Helpers
// ————————————————————————————
function formatDateCA(dateString) {
  // Affiche "YYYY-MM-DD" → "YYYY-MM-DD" (comme l’exemple Google Sheets: DATE: 2025-09-16)
  // Si dateString n'est pas ISO, on tente de normaliser.
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return String(dateString || '');
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mm(val) {
  // Travail en mm, jsPDF par défaut en pt. Ici on reste en unit par défaut (mm) créée par jsPDF() sans param → mm.
  return val;
}

// Détermine si on affiche prix et total (si au moins un prix présent OU flag global)
function shouldShowPrices(workOrder) {
  if (workOrder?.show_prices) return true;
  if (!Array.isArray(workOrder?.materials)) return false;
  return workOrder.materials.some(m => m?.unit_price != null || m?.product?.selling_price != null);
}

// ————————————————————————————
// Service PDF – Mise en page calquée sur Google Sheets
// ————————————————————————————
class GoogleSheetsStyleWorkOrderPDFService {
  generatePDF(workOrder) {
    const doc = new jsPDF();

    // Marges et repères
    const left = mm(15);
    const right = mm(195);
    const pageWidth = doc.internal.pageSize.getWidth();
    const centerX = pageWidth / 2;

    // — Titre centré « BON DE TRAVAIL »
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('BON DE TRAVAIL', centerX, mm(20), { align: 'center' });

    // — Sous‑bloc à droite : No BT, DATE, BA CLIENT (comme l’aperçu Sheets)
    const infoX = right; // texte aligné à droite
    let infoY = mm(28);

    // No BT
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`BT: ${workOrder.bt_number || ''}`.trim(), infoX, infoY, { align: 'right' });
    infoY += 7;

    // DATE
    doc.setFont('helvetica', 'normal');
    doc.text(`DATE: ${formatDateCA(workOrder.work_date || new Date())}`, infoX, infoY, { align: 'right' });
    infoY += 7;

    // BA CLIENT (optionnel)
    if (workOrder?.linked_po?.po_number || workOrder?.ba_client) {
      const ba = workOrder?.linked_po?.po_number || workOrder?.ba_client;
      doc.text(`BA CLIENT: ${ba}`, infoX, infoY, { align: 'right' });
    }

    // — En‑tête gauche : Coordonnées compagnie (comme dans BT-2025-010)
    let compY = mm(28);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(COMPANY_CONFIG.name, left, compY); compY += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(COMPANY_CONFIG.address, left, compY); compY += 5;
    doc.text(COMPANY_CONFIG.city, left, compY); compY += 5;
    doc.text(COMPANY_CONFIG.phone, left, compY); compY += 5;
    doc.text(COMPANY_CONFIG.email, left, compY); compY += 8;

    // Trait de séparation
    doc.setLineWidth(0.5);
    doc.line(left, mm(52), right, mm(52));

    // — Ligne de titres de sections "INFORMATIONS CLIENT   HEURES TRAVAILLÉES"
    let sectionY = mm(60);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('INFORMATIONS CLIENT', left, sectionY);
    doc.text('HEURES TRAVAILLÉES', centerX + 10, sectionY);

    // Contenu client (nom, adresse, téléphone) aligné sous "INFORMATIONS CLIENT"
    sectionY += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    const client = workOrder?.client || {};
    const clientName = client.name || '';
    const clientAddr = client.address || '';
    const clientPhone = client.phone || '';

    let y = sectionY;
    doc.text(clientName, left, y); y += 5;
    if (clientAddr) { doc.text(clientAddr, left, y); y += 5; }
    if (clientPhone) { doc.text(clientPhone, left, y); y += 7; }

    // Heures travaillées (à droite de la page – simple texte plage horaire si fourni)
    let hoursY = sectionY;
    const period = (workOrder.start_time && workOrder.end_time)
      ? `${workOrder.start_time} - ${workOrder.end_time}`
      : (workOrder.worked_period || '');

    if (period) {
      doc.text(period, centerX + 10, hoursY); hoursY += 5;
    }

    // — Bloc « DESCRIPTION DES TRAVAUX » (titre + paragraphe)
    sectionY = Math.max(y, hoursY) + 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('DESCRIPTION DES TRAVAUX', left, sectionY);
    sectionY += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const desc = (workOrder.work_description || '').trim();
    if (desc) {
      const lines = doc.splitTextToSize(desc, right - left);
      doc.text(lines, left, sectionY);
      sectionY += lines.length * 5 + 3;
    } else {
      sectionY += 2;
    }

    // — Tableau « MATÉRIAUX UTILISÉS »
    // En‑tête
    sectionY += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('MATÉRIAUX UTILISÉS', left, sectionY);
    sectionY += 6;

    const showPrices = shouldShowPrices(workOrder);

    // Largeurs colonnes (proches du Google Sheets: Code, Description, Qté, Unité, Prix, Total)
    const col = showPrices
      ? [20, 95, 15, 15, 20, 20] // somme = 185 → on utilisera left=15, total ~180-185
      : [25, 115, 20, 20];

    const headers = showPrices
      ? ['CODE', 'DESCRIPTION', 'QTÉ', 'UNITÉ', 'PRIX', 'TOTAL']
      : ['CODE', 'DESCRIPTION', 'QTÉ', 'UNITÉ'];

    // Dessin en‑tête
    let x = left;
    let rowY = sectionY;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    headers.forEach((h, i) => {
      const w = col[i];
      doc.rect(x, rowY, w, 8);
      doc.text(h, x + 2, rowY + 5);
      x += w;
    });
    rowY += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    let total = 0;
    const list = Array.isArray(workOrder.materials) ? workOrder.materials : [];

    list.forEach((m) => {
      x = left;
      const code = m?.product?.product_id || m?.product_id || '';
      const desc = m?.product?.description || m?.description || '';
      const qty  = (m?.quantity != null ? String(m.quantity) : '');
      const unit = m?.unit || m?.product?.unit || '';
      const unitPrice = Number(
        m?.unit_price != null ? m.unit_price : (m?.product?.selling_price != null ? m.product.selling_price : NaN)
      );
      const lineTotal = showPrices && !Number.isNaN(unitPrice) && qty ? Number(qty) * unitPrice : NaN;
      if (!Number.isNaN(lineTotal)) total += lineTotal;

      // cellule Code
      doc.rect(x, rowY, col[0], 8); doc.text(String(code), x + 2, rowY + 5); x += col[0];
      // cellule Description (multi‑ligne tronquée à 1 ligne comme modèle simple)
      doc.rect(x, rowY, col[1], 8);
      const d1 = doc.splitTextToSize(String(desc), col[1] - 4)[0] || '';
      doc.text(d1, x + 2, rowY + 5); x += col[1];
      // Qté
      doc.rect(x, rowY, col[2], 8); doc.text(String(qty), x + col[2] - 2, rowY + 5, { align: 'right' }); x += col[2];
      // Unité
      doc.rect(x, rowY, col[3], 8); doc.text(String(unit), x + col[3] - 2, rowY + 5, { align: 'right' }); x += col[3];

      if (showPrices) {
        // Prix
        doc.rect(x, rowY, col[4], 8);
        const upStr = !Number.isNaN(unitPrice) ? unitPrice.toFixed(2) : '';
        doc.text(upStr, x + col[4] - 2, rowY + 5, { align: 'right' });
        x += col[4];
        // Total
        doc.rect(x, rowY, col[5], 8);
        const ltStr = !Number.isNaN(lineTotal) ? lineTotal.toFixed(2) : '';
        doc.text(ltStr, x + col[5] - 2, rowY + 5, { align: 'right' });
      }

      rowY += 8;
    });

    // Ligne total si prix affichés
    if (showPrices) {
      x = left;
      const span = col[0] + col[1] + col[2] + col[3] + col[4];
      // cellule vide fusionnée
      doc.rect(x, rowY, span, 8); x += span;
      doc.rect(x, rowY, col[5], 8);
      doc.setFont('helvetica', 'bold');
      doc.text(total.toFixed(2), x + col[5] - 2, rowY + 5, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      rowY += 10;
    } else {
      rowY += 6;
    }

    // — Section SIGNATURE (simple ligne + libellé)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('SIGNATURE', left, rowY);
    rowY += 12;
    // Ligne signature client
    doc.setLineWidth(0.3);
    doc.line(left, rowY, left + 70, rowY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Client', left, rowY + 5);

    // — Mentions et pied de page (style proche du BT-2025-010)
    const bottomY = doc.internal.pageSize.getHeight() - 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Généré le ${formatDateCA(new Date())}`, left, bottomY);
    doc.text(`Page 1`, right, bottomY, { align: 'right' });

    return Buffer.from(doc.output('arraybuffer'));
  }
}

// ————————————————————————————
// Email service
// ————————————————————————————
class WorkOrderEmailService {
  constructor() {
    this.pdfService = new GoogleSheetsStyleWorkOrderPDFService();
  }

  getEmailTemplate(workOrder) {
    const clientName = workOrder?.client?.name || '';
    return (
      '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<style>body{font-family:Arial,sans-serif;line-height:1.4}</style>' +
      '</head><body>' +
      `<h2>${COMPANY_CONFIG.name}</h2>` +
      `<h3>Bon de Travail ${workOrder.bt_number || ''}</h3>` +
      `<p>Bonjour ${clientName},</p>` +
      '<p>Veuillez trouver en pièce jointe le bon de travail complété.</p>' +
      '<p>Merci de votre confiance.</p>' +
      `<p>${COMPANY_CONFIG.name}<br>${COMPANY_CONFIG.address}<br>${COMPANY_CONFIG.city}</p>` +
      '</body></html>'
    );
  }

  async sendWorkOrderEmail(workOrder, options = {}) {
    const clientEmail = options.clientEmail || workOrder?.client?.email;
    if (!clientEmail) {
      return { success: false, error: 'Aucune adresse email disponible pour le client' };
    }

    // — Nom de fichier SANS suffixe "_2" (force exactement le numéro de BT)
    // Ex.: "BON DE TRAVAIL - BT-2025-010.pdf" (lisible et propre)
    const pdfFilename = `BON DE TRAVAIL - ${workOrder.bt_number}.pdf`;

    const pdfBuffer = this.pdfService.generatePDF(workOrder);
    const htmlContent = options.customMessage || this.getEmailTemplate(workOrder);

    try {
      const result = await resend.emails.send({
        from: `${COMPANY_CONFIG.name} <${COMPANY_CONFIG.resendFrom}>`,
        to: [clientEmail],
        subject: `Bon de Travail ${workOrder.bt_number} - ${workOrder?.client?.name || ''}`.trim(),
        html: htmlContent,
        attachments: [
          { filename: pdfFilename, content: pdfBuffer, contentType: 'application/pdf' },
        ],
      });

      if (result?.error) {
        throw new Error(result.error.message);
      }

      return { success: true, messageId: result?.data?.id };
    } catch (err) {
      return { success: false, error: err?.message || 'Erreur inconnue' };
    }
  }
}

module.exports = {
  GoogleSheetsStyleWorkOrderPDFService,
  WorkOrderEmailService,
  COMPANY_CONFIG,
};
