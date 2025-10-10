// ============================================
// SERVICE EMAIL + PDF – STYLE GOOGLE SHEETS (TMT)
// Version avec: Logo, Couleurs, Signature, et respect STRICT du numéro BT fourni
// ============================================

const { Resend } = require('resend');
const { jsPDF } = require('jspdf');

// ————————————————————————————
// Config société (surchargée via variables d'env au besoin)
// ————————————————————————————
const COMPANY_CONFIG = {
  name: process.env.COMPANY_NAME || 'Services TMT Inc.',
  address: process.env.COMPANY_ADDRESS || '3195, 42e Rue Nord',
  city: process.env.COMPANY_CITY || 'Saint-Georges, QC, G5Z 0V9',
  phone: process.env.COMPANY_PHONE || '(418) 225-3875',
  email: process.env.COMPANY_EMAIL || 'info.servicestmt@gmail.com',
  resendFrom: process.env.RESEND_FROM_EMAIL || 'noreply@servicestmt.com',
  // Option logo: dataURL base64 ("data:image/png;base64,....") ou JPEG. Si null → pas de logo.
  logoDataUrl: process.env.COMPANY_LOGO_DATAURL || null,
  // Couleur d’accent (Google Sheets Green approx.)
  brandColor: { r: 15, g: 157, b: 88 },
};

const resend = new Resend(process.env.RESEND_API_KEY);

// ————————————————————————————
// Helpers
// ————————————————————————————
function formatDateCA(dateString) {
  // Affiche "YYYY-MM-DD" si possible, sinon renvoie tel quel
  if (!dateString) return '';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return String(dateString);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function money(n) {
  return (n ?? '') === '' || Number.isNaN(Number(n)) ? '' : Number(n).toFixed(2);
}

function shouldShowPrices(workOrder) {
  if (workOrder?.show_prices) return true;
  if (!Array.isArray(workOrder?.materials)) return false;
  return workOrder.materials.some(m => m?.unit_price != null || m?.product?.selling_price != null);
}

// ————————————————————————————
// PDF Service – Calqué sur l’export Google Sheets + couleurs + logo
// ————————————————————————————
class GoogleSheetsStyleWorkOrderPDFService {
  generatePDF(workOrder) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });

    // NE JAMAIS modifier le numéro BT: on affiche tel quel
    const btNumber = String(workOrder?.bt_number ?? '').trim();

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const left = 15;
    const right = pageWidth - 15;
    const centerX = pageWidth / 2;

    // Bandeau d’en-tête (couleur)
    const { r, g, b } = COMPANY_CONFIG.brandColor;
    doc.setFillColor(r, g, b);
    doc.rect(0, 0, pageWidth, 18, 'F');

    // Logo (si fourni)
    let headerY = 6;
    if (COMPANY_CONFIG.logoDataUrl) {
      try {
        doc.addImage(COMPANY_CONFIG.logoDataUrl, 'PNG', left, headerY - 2, 28, 12, undefined, 'FAST');
      } catch (_) {
        // si PNG échoue, on tente JPEG
        try { doc.addImage(COMPANY_CONFIG.logoDataUrl, 'JPEG', left, headerY - 2, 28, 12, undefined, 'FAST'); } catch (__) { /* pas de logo */ }
      }
    }

    // Titre centré
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text('BON DE TRAVAIL', centerX, 11, { align: 'center' });

    // Bloc coordonnées (gauche sous bandeau)
    let y = 24;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(COMPANY_CONFIG.name, left, y); y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(COMPANY_CONFIG.address, left, y); y += 5;
    doc.text(COMPANY_CONFIG.city, left, y); y += 5;
    doc.text(COMPANY_CONFIG.phone, left, y); y += 5;
    doc.text(COMPANY_CONFIG.email, left, y); y += 6;

    // Bloc info à droite (BT, DATE, BA CLIENT) – aligné à droite
    const infoX = right;
    let infoY = 24;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`BT: ${btNumber}`, infoX, infoY, { align: 'right' }); infoY += 6;
    doc.setFont('helvetica', 'normal');
    doc.text(`DATE: ${formatDateCA(workOrder?.work_date)}`, infoX, infoY, { align: 'right' }); infoY += 6;
    const ba = workOrder?.linked_po?.po_number || workOrder?.ba_client || '';
    if (ba) { doc.text(`BA CLIENT: ${ba}`, infoX, infoY, { align: 'right' }); infoY += 6; }

    // Trait séparateur
    doc.setDrawColor(180);
    doc.setLineWidth(0.4);
    doc.line(left, y, right, y);

    // Titres sections avec badges couleur
    y += 8;
    const section = (label) => {
      const h = 8;
      doc.setFillColor(r, g, b);
      doc.rect(left, y - 6, 80, h, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text(label, left + 2, y, { baseline: 'bottom' });
      doc.setTextColor(0, 0, 0);
    };

    // INFORMATIONS CLIENT
    section('INFORMATIONS CLIENT');
    const clientStartY = y + 2;

    // HEURES TRAVAILLÉES (à droite)
    doc.setFillColor(r, g, b);
    doc.rect(centerX + 10, y - 6, right - (centerX + 10), 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text('HEURES TRAVAILLÉES', centerX + 12, y, { baseline: 'bottom' });
    doc.setTextColor(0, 0, 0);

    // Contenu client
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const client = workOrder?.client || {};
    const clines = [client.name, client.address, client.phone].filter(Boolean);
    clines.forEach((line, i) => doc.text(line, left, clientStartY + 6 + i * 5));

    // Heures travaillées
    const period = (workOrder?.start_time && workOrder?.end_time)
      ? `${workOrder.start_time} - ${workOrder.end_time}`
      : (workOrder?.worked_period || '');
    if (period) {
      doc.text(period, centerX + 12, clientStartY + 6);
    }

    // DESCRIPTION DES TRAVAUX
    y = Math.max(clientStartY + 6 + (clines.length * 5), clientStartY + 12) + 4;
    section('DESCRIPTION DES TRAVAUX');
    y += 6;
    const desc = (workOrder?.work_description || '').trim();
    if (desc) {
      const lines = doc.splitTextToSize(desc, right - left);
      doc.text(lines, left, y);
      y += lines.length * 5 + 2;
    }

    // MATÉRIAUX UTILISÉS
    y += 6;
    section('MATÉRIAUX UTILISÉS');
    y += 4;

    const showPrices = shouldShowPrices(workOrder);
    const columns = showPrices
      ? [ { key:'code', w: 22, h:8, label:'CODE' },
          { key:'desc', w: 95, h:8, label:'DESCRIPTION' },
          { key:'qty',  w: 16, h:8, label:'QTÉ' },
          { key:'unit', w: 16, h:8, label:'UNITÉ' },
          { key:'price',w: 20, h:8, label:'PRIX' },
          { key:'total',w: 20, h:8, label:'TOTAL' }, ]
      : [ { key:'code', w: 25, h:8, label:'CODE' },
          { key:'desc', w: 120,h:8, label:'DESCRIPTION' },
          { key:'qty',  w: 20, h:8, label:'QTÉ' },
          { key:'unit', w: 20, h:8, label:'UNITÉ' }, ];

    // En-tête tableau (fond couleur)
    let x = left;
    doc.setFillColor(240);
    doc.setDrawColor(200);
    doc.setLineWidth(0.2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    columns.forEach(col => {
      doc.setFillColor(233, 243, 236); // vert pâle
      doc.rect(x, y, col.w, col.h, 'F');
      doc.setDrawColor(200);
      doc.rect(x, y, col.w, col.h);
      doc.setTextColor(0, 0, 0);
      doc.text(col.label, x + 2, y + 5);
      x += col.w;
    });
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);

    let total = 0;
    const list = Array.isArray(workOrder?.materials) ? workOrder.materials : [];
    list.forEach((m) => {
      x = left;
      const code = m?.product?.product_id || m?.product_id || '';
      const desc = m?.product?.description || m?.description || '';
      const qty  = m?.quantity ?? '';
      const unit = m?.unit || m?.product?.unit || '';
      const unitPrice = (m?.unit_price != null) ? Number(m.unit_price) :
                        (m?.product?.selling_price != null ? Number(m.product.selling_price) : NaN);
      const lineTotal = showPrices && !Number.isNaN(unitPrice) && qty !== '' ? Number(qty) * unitPrice : NaN;
      if (!Number.isNaN(lineTotal)) total += lineTotal;

      const rowH = 8;
      const drawCell = (w, text, alignRight=false) => {
        doc.rect(x, y, w, rowH);
        if (alignRight) {
          doc.text(String(text ?? ''), x + w - 2, y + 5, { align: 'right' });
        } else {
          // Pour description: tronquer une ligne
          const content = (w > 40) ? (doc.splitTextToSize(String(text ?? ''), w - 4)[0] || '') : String(text ?? '');
          doc.text(content, x + 2, y + 5);
        }
        x += w;
      };

      drawCell(columns[0].w, code);
      drawCell(columns[1].w, desc);
      drawCell(columns[2].w, qty, true);
      drawCell(columns[3].w, unit, true);
      if (showPrices) {
        drawCell(columns[4].w, money(unitPrice), true);
        drawCell(columns[5].w, Number.isNaN(lineTotal) ? '' : money(lineTotal), true);
      }

      y += rowH;
    });

    // Ligne total
    if (showPrices) {
      const spanW = columns[0].w + columns[1].w + columns[2].w + columns[3].w + columns[4].w;
      x = left;
      doc.rect(x, y, spanW, 8); x += spanW;
      doc.setFont('helvetica', 'bold');
      doc.rect(x, y, columns[5].w, 8);
      doc.text(money(total), x + columns[5].w - 2, y + 5, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      y += 10;
    } else {
      y += 6;
    }

    // SIGNATURES
    // Bloc titre
    doc.setFillColor(r, g, b);
    doc.rect(left, y - 6, 60, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text('SIGNATURE', left + 2, y, { baseline: 'bottom' });
    doc.setTextColor(0, 0, 0);

    // Deux lignes de signature: Client et Technicien
    y += 10;
    const lineW = 80;
    // Client
    doc.line(left, y, left + lineW, y);
    doc.setFontSize(9);
    doc.text('Client', left, y + 5);
    // Technicien
    doc.line(left + 100, y, left + 100 + lineW, y);
    doc.text('Technicien', left + 100, y + 5);

    // Pied de page
    const bottomY = pageHeight - 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Généré le ${formatDateCA(new Date())}`, left, bottomY);
    doc.text('Page 1', right, bottomY, { align: 'right' });

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
      '<style>body{font-family:Arial,sans-serif;line-height:1.5}</style>' +
      '</head><body>' +
      `<h2>${COMPANY_CONFIG.name}</h2>` +
      `<h3>Bon de Travail ${workOrder?.bt_number ?? ''}</h3>` +
      (clientName ? `<p>Bonjour ${clientName},</p>` : '') +
      '<p>Veuillez trouver en pièce jointe le bon de travail.</p>' +
      `<p>${COMPANY_CONFIG.name}<br>${COMPANY_CONFIG.address}<br>${COMPANY_CONFIG.city}<br>${COMPANY_CONFIG.phone}</p>` +
      '</body></html>'
    );
  }

  async sendWorkOrderEmail(workOrder, options = {}) {
    const clientEmail = options.clientEmail || workOrder?.client?.email;
    if (!clientEmail) {
      return { success: false, error: 'Aucune adresse email disponible pour le client' };
    }

    // Nom de fichier: respecter EXACTEMENT le numéro fourni (aucun suffixe "_2")
    const btNumber = String(workOrder?.bt_number ?? '').trim();
    const pdfFilename = `BON DE TRAVAIL - ${btNumber}.pdf`;

    const pdfBuffer = this.pdfService.generatePDF(workOrder);
    const htmlContent = options.customMessage || this.getEmailTemplate(workOrder);

    try {
      const result = await resend.emails.send({
        from: `${COMPANY_CONFIG.name} <${COMPANY_CONFIG.resendFrom}>`,
        to: [clientEmail],
        subject: `Bon de Travail ${btNumber}`,
        html: htmlContent,
        attachments: [
          { filename: pdfFilename, content: pdfBuffer, contentType: 'application/pdf' },
        ],
      });

      if (result?.error) throw new Error(result.error.message);
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
