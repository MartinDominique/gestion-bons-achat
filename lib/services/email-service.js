// ============================================
// SERVICE EMAIL + PDF - FORMAT SIMPLE NOIR/BLANC
// Fichier: lib/services/email-service.js
// ============================================

const { Resend } = require('resend');
const { jsPDF } = require('jspdf');
const fs = require('fs');
const path = require('path');

// Configuration
const resend = new Resend(process.env.RESEND_API_KEY);

const COMPANY_CONFIG = {
  name: 'Services TMT Inc.',
  address: '3195 42e Rue Nord',
  city: 'Saint-Georges, QC, G5Z 0V9',
  phone: '(418) 225-3875',
  email: 'info.servicestmt@gmail.com',
  resendFrom: process.env.RESEND_FROM_EMAIL || 'noreply@servicestmt.com'
};

// Charger le logo en base64 au démarrage (une seule fois)
let LOGO_BASE64 = null;
try {
  const logoPath = path.join(process.cwd(), 'public', 'logo.png');
  const logoBuffer = fs.readFileSync(logoPath);
  LOGO_BASE64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
  console.log('✅ Logo chargé avec succès');
} catch (error) {
  console.warn('⚠️ Logo non trouvé:', error.message);
}

class ImprovedWorkOrderPDFService {
  
  formatQuebecDateTime(dateString, includeTime = false) {
    const date = new Date(dateString);
    const options = {
      timeZone: 'America/Toronto',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    };
    
    if (includeTime) {
      options.hour = '2-digit';
      options.minute = '2-digit';
      options.hour12 = false;
    }
    
    return date.toLocaleString('fr-CA', options);
  }

  addHeader(doc, workOrder) {
    // Logo à gauche
    if (LOGO_BASE64) {
      try {
        doc.addImage(LOGO_BASE64, 'PNG', 15, 15, 30, 20);
      } catch (error) {
        console.error('Erreur affichage logo:', error);
      }
    }
    
    let yPos = 15;
    
    // BON DE TRAVAIL en haut à droite
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('BON DE TRAVAIL', 195, yPos, { align: 'right' });
    
    yPos += 8;
    doc.setFontSize(10);
    const btNumber = workOrder.bt_number.startsWith('BT:') ? workOrder.bt_number : 'BT: ' + workOrder.bt_number;
    doc.text(btNumber, 195, yPos, { align: 'right' });
    
    yPos += 6;
    doc.text('DATE: ' + this.formatQuebecDateTime(workOrder.work_date), 195, yPos, { align: 'right' });
    
    yPos += 6;
    const baNumber = (workOrder.linked_po && workOrder.linked_po.po_number) ? workOrder.linked_po.po_number : '';
    doc.text('BA Client: ' + baNumber, 195, yPos, { align: 'right' });
    
    // Info entreprise alignée à gauche (à côté du logo)
    let yInfo = 15;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(COMPANY_CONFIG.name, 50, yInfo);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    yInfo += 6;
    doc.text(COMPANY_CONFIG.address, 50, yInfo);
    yInfo += 5;
    doc.text(COMPANY_CONFIG.city, 50, yInfo);
    yInfo += 5;
    doc.text(COMPANY_CONFIG.phone, 50, yInfo);
    yInfo += 5;
    doc.text(COMPANY_CONFIG.email, 50, yInfo);
    
    // Ligne de séparation horizontale après le header
    doc.setLineWidth(0.3);
    doc.line(15, 45, 195, 45);
    
    return 52;
  }

  addClientAndWorkSections(doc, workOrder, yStart) {
    // INFORMATIONS CLIENT (gauche)
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('INFORMATIONS CLIENT', 15, yStart);
    
    // HEURES TRAVAILLÉES (droite)
    doc.text('HEURES TRAVAILLÉES', 110, yStart);
    
    let yLeft = yStart + 7;
    let yRight = yStart + 7;
    
    // Contenu client
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    
    if (workOrder.client.name) {
      doc.text(workOrder.client.name, 15, yLeft);
      yLeft += 5;
    }
    
    if (workOrder.client.address) {
      doc.text(workOrder.client.address, 15, yLeft);
      yLeft += 5;
    }
    
    if (workOrder.client.phone) {
      doc.text(workOrder.client.phone, 15, yLeft);
      yLeft += 5;
    }
    
    // Heures travaillées
    if (workOrder.start_time && workOrder.end_time) {
      doc.text(workOrder.start_time + ' - ' + workOrder.end_time, 110, yRight);
      yRight += 5;
    }
    
    // Ligne de séparation
    const maxY = Math.max(yLeft, yRight) + 5;
    doc.setLineWidth(0.3);
    doc.line(15, maxY, 195, maxY);
    
    // DESCRIPTION DES TRAVAUX
    let yDesc = maxY + 7;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('DESCRIPTION DES TRAVAUX', 15, yDesc);
    
    yDesc += 7;
    if (workOrder.work_description) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const descLines = doc.splitTextToSize(workOrder.work_description, 175);
      doc.text(descLines, 15, yDesc);
      yDesc += (descLines.length * 5) + 5;
    } else {
      yDesc += 5;
    }
    
    // Ligne de séparation
    doc.setLineWidth(0.3);
    doc.line(15, yDesc, 195, yDesc);
    
    return yDesc + 7;
  }

  addMaterialsTable(doc, workOrder, yStart) {
    if (!workOrder.materials || workOrder.materials.length === 0) {
      return yStart;
    }
    
    // Titre section
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('MATÉRIAUX UTILISÉS', 15, yStart);
    
    yStart += 7;
    
    // Afficher les prix par défaut, sauf si explicitement désactivé
    const shouldShowPrices = workOrder.show_prices !== false;
    
    const colWidths = shouldShowPrices ? 
                     [30, 80, 20, 20, 20, 25] : 
                     [35, 100, 25, 25];
    
    const headers = shouldShowPrices ? 
                   ['CODE', 'DESCRIPTION', 'QTÉ', 'UNITÉ', 'PRIX', 'TOTAL'] :
                   ['CODE', 'DESCRIPTION', 'QTÉ', 'UNITÉ'];
    
    const totalWidth = colWidths.reduce((sum, width) => sum + width, 0);
    const rowHeight = 7;
    
    // Header du tableau
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    
    let currentX = 15;
    for (let i = 0; i < headers.length; i++) {
      if (shouldShowPrices && (headers[i] === 'QTÉ' || headers[i] === 'UNITÉ')) {
        // Centrer QTÉ et UNITÉ
        doc.text(headers[i], currentX + colWidths[i]/2, yStart + 5, { align: 'center' });
      } else if (shouldShowPrices && (headers[i] === 'PRIX' || headers[i] === 'TOTAL')) {
        // Aligner PRIX et TOTAL à droite
        doc.text(headers[i], currentX + colWidths[i] - 3, yStart + 5, { align: 'right' });
      } else {
        // Aligner à gauche pour CODE et DESCRIPTION
        doc.text(headers[i], currentX + 2, yStart + 5);
      }
      currentX += colWidths[i];
    }
    
    // Ligne sous les headers
    doc.setLineWidth(0.3);
    doc.line(15, yStart + 6, 15 + totalWidth, yStart + 6);
    
    let currentY = yStart + 6;
    let grandTotal = 0;
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    
    for (let index = 0; index < workOrder.materials.length; index++) {
      const material = workOrder.materials[index];
      currentY += rowHeight;
      
      const productCode = material.product?.product_id || material.product_id || '';
      const productDesc = material.product?.description || material.description || 'Matériau';
      const quantity = material.quantity.toString();
      const unit = material.unit || material.product?.unit || 'UN';
      
      currentX = 15;
      
      // CODE
      doc.text(productCode, currentX + 2, currentY + 4);
      currentX += colWidths[0];
      
      // DESCRIPTION
      const descLines = doc.splitTextToSize(productDesc, colWidths[1] - 4);
      doc.text(descLines[0] || '', currentX + 2, currentY + 4);
      currentX += colWidths[1];
      
      // QTÉ
      doc.text(quantity, currentX + colWidths[2]/2, currentY + 4, { align: 'center' });
      currentX += colWidths[2];
      
      // UNITÉ
      doc.text(unit, currentX + colWidths[3]/2, currentY + 4, { align: 'center' });
      currentX += colWidths[3];
      
      // PRIX et TOTAL si affichés
      if (shouldShowPrices) {
        const unitPrice = material.product?.selling_price || material.unit_price || 0;
        const lineTotal = quantity * unitPrice;
        grandTotal += lineTotal;
        
        doc.text(unitPrice.toFixed(2), currentX + colWidths[4] - 3, currentY + 4, { align: 'right' });
        currentX += colWidths[4];
        
        doc.text(lineTotal.toFixed(2), currentX + colWidths[5] - 3, currentY + 4, { align: 'right' });
      }
    }
    
    currentY += rowHeight;
    
    // Ligne de TOTAL si des prix sont affichés
    if (shouldShowPrices && grandTotal > 0) {
      // Ligne de séparation
      doc.setLineWidth(0.3);
      doc.line(15, currentY, 15 + totalWidth, currentY);
      
      currentY += 7;
      
      // Afficher le total
      doc.setFont('helvetica', 'bold');
      
      let totalX = 15;
      for (let i = 0; i < colWidths.length - 1; i++) {
        totalX += colWidths[i];
      }
      
      doc.text(grandTotal.toFixed(2), totalX + colWidths[colWidths.length - 1] - 3, currentY, { align: 'right' });
      
      currentY += 5;
    } else {
      // Si pas de prix, ligne finale sous le dernier item
      doc.setLineWidth(0.3);
      doc.line(15, currentY, 15 + totalWidth, currentY);
      currentY += 5;
    }
    
    return currentY + 5;
  }

  addSignatureSection(doc, workOrder, yStart) {
    // Titre
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('SIGNATURE', 15, yStart);
    
    yStart += 7;
    
    // Boîte signature simple avec bordure noire
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(15, yStart, 85, 25);
    
    if (workOrder.signature_data) {
      try {
        doc.addImage(workOrder.signature_data, 'PNG', 17, yStart + 2, 81, 21);
      } catch (error) {
        console.error('Erreur signature:', error);
      }
    }
    
    // Texte légal à droite de la signature
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(80, 80, 80);
    const legalText = doc.splitTextToSize('Toute marchandise demeure la propriété de Services TMT Inc. jusqu\'au paiement complet.', 85);
    doc.text(legalText, 110, yStart + 8);
    
    // Info signature en dessous
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    
    if (workOrder.client_signature_name || workOrder.signature_timestamp) {
      let signText = 'Client';
      if (workOrder.client_signature_name) {
        signText += ': ' + workOrder.client_signature_name;
      }
      if (workOrder.signature_timestamp) {
        const signDate = this.formatQuebecDateTime(workOrder.signature_timestamp, true);
        signText += ' Date: ' + signDate;
      }
      doc.text(signText, 15, yStart + 30);
    } else {
      doc.text('Client', 15, yStart + 30);
    }
  }

  generatePDF(workOrder) {
    try {
      console.log('Génération PDF format simple noir/blanc...');
      const doc = new jsPDF();
      
      let currentY = this.addHeader(doc, workOrder);
      currentY = this.addClientAndWorkSections(doc, workOrder, currentY);
      currentY = this.addMaterialsTable(doc, workOrder, currentY);
      this.addSignatureSection(doc, workOrder, currentY);
      
      // Footer
      const pageHeight = doc.internal.pageSize.height;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      
      const dateOnly = this.formatQuebecDateTime(new Date().toISOString()).split(',')[0];
      doc.text('Généré le ' + dateOnly, 15, pageHeight - 10);
      doc.text('Page 1', 195, pageHeight - 10, { align: 'right' });
      
      console.log('PDF généré avec succès - Format simple');
      
      return Buffer.from(doc.output('arraybuffer'));
    } catch (error) {
      console.error('Erreur génération PDF:', error);
      throw new Error('Erreur génération PDF: ' + error.message);
    }
  }
}

class WorkOrderEmailService {
  constructor() {
    this.pdfService = new ImprovedWorkOrderPDFService();
  }

  getEmailTemplate(workOrder) {
    let html = '<!DOCTYPE html><html><head><meta charset="utf-8">';
    html += '<style>body { font-family: Arial, sans-serif; }</style>';
    html += '</head><body>';
    html += '<h2>' + COMPANY_CONFIG.name + '</h2>';
    html += '<h2>Bon de Travail ' + workOrder.bt_number + '</h2>';
    html += '<p>Bonjour ' + workOrder.client.name + ',</p>';
    html += '<p>Veuillez trouver en pièce jointe le bon de travail complété.</p>';
    html += '<p>Merci de votre confiance.</p>';
    html += '<p>' + COMPANY_CONFIG.name + '<br>' + COMPANY_CONFIG.address + '<br>' + COMPANY_CONFIG.city + '</p>';
    html += '</body></html>';
    
    return html;
  }

  async sendWorkOrderEmail(workOrder, options = {}) {
    try {
      const clientEmail = options.clientEmail || workOrder.client.email;
      
      if (!clientEmail) {
        throw new Error('Aucune adresse email disponible pour le client');
      }

      const pdfBuffer = this.pdfService.generatePDF(workOrder);
      const htmlContent = options.customMessage || this.getEmailTemplate(workOrder);
      const pdfFilename = workOrder.bt_number + '.pdf';
      
      const emailConfig = {
        from: COMPANY_CONFIG.name + ' <' + COMPANY_CONFIG.resendFrom + '>',
        to: [clientEmail],
        subject: 'Bon de Travail ' + workOrder.bt_number + ' - ' + workOrder.client.name,
        html: htmlContent,
        attachments: [
          {
            filename: pdfFilename,
            content: pdfBuffer,
            contentType: 'application/pdf'
          }
        ]
      };

      if (options.ccEmails && options.ccEmails.length > 0) {
        emailConfig.cc = options.ccEmails;
      }

      const result = await resend.emails.send(emailConfig);

      if (result.error) {
        throw new Error(result.error.message);
      }

      return {
        success: true,
        messageId: result.data?.id
      };

    } catch (error) {
      console.error('Erreur envoi email BT:', error);
      return {
        success: false,
        error: error.message || 'Erreur inconnue'
      };
    }
  }
}

module.exports = {
  ImprovedWorkOrderPDFService,
  WorkOrderEmailService,
  WorkOrderPDFService: ImprovedWorkOrderPDFService,
  LAYOUT_CONFIG: {},
  COMPANY_CONFIG
};
