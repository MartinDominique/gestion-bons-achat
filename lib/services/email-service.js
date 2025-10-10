// ============================================
// SERVICE EMAIL + PDF - MODÈLE EXCEL TMT
// Fichier: lib/services/email-service.js
// ============================================

const { Resend } = require('resend');
const { jsPDF } = require('jspdf');

// Configuration
const resend = new Resend(process.env.RESEND_API_KEY);

const COMPANY_CONFIG = {
  name: process.env.COMPANY_NAME || 'Services TMT Inc.',
  address: process.env.COMPANY_ADDRESS || '3195, 42e Rue Nord',
  city: process.env.COMPANY_CITY || 'Saint-Georges (QC)',
  postalCode: process.env.COMPANY_POSTAL || 'G5Z 0V9',
  phone: process.env.COMPANY_PHONE || '418 225-3875',
  email: process.env.COMPANY_EMAIL || 'servicestmt@gmail.com',
  resendFrom: process.env.RESEND_FROM_EMAIL || 'noreply@servicestmt.com'
};

const COLORS = {
  orange: [255, 140, 0],
  white: [255, 255, 255],
  black: [0, 0, 0],
  gray: [128, 128, 128],
  lightGray: [240, 240, 240]
};

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
    try {
      doc.addImage('https://gestion-bons-achat.vercel.app/logo.png', 'PNG', 15, 15, 35, 22);
    } catch (error) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLORS.orange);
      doc.text('TMT', 15, 30);
    }
    
    // Infos entreprise au centre
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.black);
    doc.text(COMPANY_CONFIG.address, 105, 20, { align: 'center' });
    doc.text(COMPANY_CONFIG.city + ' (' + COMPANY_CONFIG.postalCode + ')', 105, 26, { align: 'center' });
    doc.text('418 225-3875', 105, 32, { align: 'center' });
    doc.text(COMPANY_CONFIG.email, 105, 38, { align: 'center' });
    
    // BON DE TRAVAIL à droite
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.orange);
    doc.text('BON DE TRAVAIL', 195, 22, { align: 'right' });
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.black);
    doc.text('BT-' + workOrder.bt_number, 195, 30, { align: 'right' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('DATE: ' + this.formatQuebecDateTime(workOrder.work_date), 195, 36, { align: 'right' });
    
    if (workOrder.linked_po && workOrder.linked_po.po_number) {
      doc.text('BA CLIENT: ' + workOrder.linked_po.po_number, 195, 42, { align: 'right' });
    }
    
    // Ligne orange épaisse
    doc.setLineWidth(3);
    doc.setDrawColor(...COLORS.orange);
    doc.line(15, 50, 195, 50);
  }

  addClientAndHoursSection(doc, workOrder) {
    const yStart = 60;
    const boxHeight = 35;
    
    // SECTION INFORMATIONS CLIENT (gauche)
    // Fond orange plein
    doc.setFillColor(...COLORS.orange);
    doc.rect(15, yStart, 85, 8, 'F');
    
    // Texte titre en blanc
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.white);
    doc.text('INFORMATIONS CLIENT', 18, yStart + 5.5);
    
    // Bordure section
    doc.setDrawColor(...COLORS.gray);
    doc.setLineWidth(0.5);
    doc.rect(15, yStart, 85, boxHeight);
    
    // Contenu client
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.black);
    
    let yPos = yStart + 15;
    doc.text(workOrder.client.name || 'N/A', 18, yPos);
    yPos += 6;
    
    if (workOrder.client.address) {
      doc.text(workOrder.client.address, 18, yPos);
      yPos += 6;
    }
    
    if (workOrder.client.phone) {
      doc.text(workOrder.client.phone, 18, yPos);
      yPos += 6;
    }
    
    // SECTION HEURES TRAVAILLÉES (droite)
    const xRight = 110;
    
    // Fond orange plein
    doc.setFillColor(...COLORS.orange);
    doc.rect(xRight, yStart, 85, 8, 'F');
    
    // Texte titre en blanc
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.white);
    doc.text('HEURES TRAVAILLÉES', xRight + 3, yStart + 5.5);
    
    // Bordure section
    doc.setDrawColor(...COLORS.gray);
    doc.setLineWidth(0.5);
    doc.rect(xRight, yStart, 85, boxHeight);
    
    // Contenu heures
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.black);
    
    yPos = yStart + 15;
    if (workOrder.start_time && workOrder.end_time) {
      doc.text(workOrder.start_time + ' - ' + workOrder.end_time, xRight + 3, yPos);
      yPos += 6;
    }
    
    if (workOrder.total_hours) {
      doc.text('Total: ' + workOrder.total_hours + 'h', xRight + 3, yPos);
    }
    
    return yStart + boxHeight + 10;
  }

  addDescriptionSection(doc, workOrder, yStart) {
    const boxHeight = 45;
    
    // Fond orange plein pour le titre
    doc.setFillColor(...COLORS.orange);
    doc.rect(15, yStart, 180, 8, 'F');
    
    // Texte titre en blanc
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.white);
    doc.text('DESCRIPTION DES TRAVAUX', 18, yStart + 5.5);
    
    // Bordure section
    doc.setDrawColor(...COLORS.gray);
    doc.setLineWidth(0.5);
    doc.rect(15, yStart, 180, boxHeight);
    
    // Contenu description
    if (workOrder.work_description) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.black);
      
      const descLines = doc.splitTextToSize(workOrder.work_description, 170);
      doc.text(descLines, 18, yStart + 15);
    }
    
    return yStart + boxHeight + 10;
  }

  addMaterialsTable(doc, workOrder, yStart) {
    if (!workOrder.materials || workOrder.materials.length === 0) {
      return yStart;
    }
    
    // Titre section
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.orange);
    doc.text('MATÉRIAUX UTILISÉS', 15, yStart);
    
    yStart += 8;
    
    const shouldShowPrices = workOrder.show_prices || 
                            (workOrder.materials && workOrder.materials.some(m => m.show_price === true));
    
    const colWidths = shouldShowPrices ? 
                     [30, 70, 20, 20, 25, 30] : 
                     [35, 95, 25, 25];
    
    const headers = shouldShowPrices ? 
                   ['CODE', 'DESCRIPTION', 'QTÉ', 'UNITÉ', 'PRIX', 'TOTAL'] :
                   ['CODE', 'DESCRIPTION', 'QTÉ', 'UNITÉ'];
    
    const totalWidth = colWidths.reduce((sum, width) => sum + width, 0);
    const rowHeight = 8;
    
    // Header du tableau (fond orange)
    doc.setFillColor(...COLORS.orange);
    doc.rect(15, yStart, totalWidth, rowHeight, 'F');
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.white);
    
    let currentX = 15;
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], currentX + 3, yStart + 5.5);
      currentX += colWidths[i];
    }
    
    // Lignes du tableau
    doc.setDrawColor(...COLORS.gray);
    doc.setLineWidth(0.3);
    doc.setTextColor(...COLORS.black);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    
    let currentY = yStart + rowHeight;
    
    for (let index = 0; index < workOrder.materials.length; index++) {
      const material = workOrder.materials[index];
      
      // Fond alterné
      if (index % 2 === 1) {
        doc.setFillColor(...COLORS.lightGray);
        doc.rect(15, currentY, totalWidth, rowHeight, 'F');
      }
      
      const productCode = material.product?.product_id || material.product_id || '';
      const productDesc = material.product?.description || material.description || 'Matériau';
      const quantity = material.quantity.toString();
      const unit = material.unit || material.product?.unit || 'UN';
      
      currentX = 15;
      
      // CODE
      doc.text(productCode, currentX + 2, currentY + 5.5);
      currentX += colWidths[0];
      
      // DESCRIPTION
      const descLines = doc.splitTextToSize(productDesc, colWidths[1] - 4);
      doc.text(descLines[0] || '', currentX + 2, currentY + 5.5);
      currentX += colWidths[1];
      
      // QTÉ
      doc.text(quantity, currentX + colWidths[2]/2, currentY + 5.5, { align: 'center' });
      currentX += colWidths[2];
      
      // UNITÉ
      doc.text(unit, currentX + colWidths[3]/2, currentY + 5.5, { align: 'center' });
      currentX += colWidths[3];
      
      // PRIX et TOTAL si affichés
      if (shouldShowPrices && material.show_price) {
        const unitPrice = material.product?.selling_price || material.unit_price || 0;
        const lineTotal = quantity * unitPrice;
        
        doc.text(unitPrice.toFixed(2) + ' $', currentX + colWidths[4] - 3, currentY + 5.5, { align: 'right' });
        currentX += colWidths[4];
        
        doc.text(lineTotal.toFixed(2) + ' $', currentX + colWidths[5] - 3, currentY + 5.5, { align: 'right' });
      }
      
      // Bordures
      doc.rect(15, currentY, totalWidth, rowHeight);
      currentY += rowHeight;
      
      // Notes si présentes
      if (material.notes) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(...COLORS.gray);
        doc.text('Note: ' + material.notes, 17, currentY - 2);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLORS.black);
      }
    }
    
    return currentY + 10;
  }

  addSignatureSection(doc, workOrder, yStart) {
    // Titre
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.orange);
    doc.text('SIGNATURE', 15, yStart);
    
    yStart += 8;
    
    // Boîte signature
    doc.setDrawColor(...COLORS.gray);
    doc.setLineWidth(0.5);
    doc.rect(15, yStart, 80, 25);
    
    if (workOrder.signature_data) {
      try {
        doc.addImage(workOrder.signature_data, 'PNG', 17, yStart + 2, 76, 21);
      } catch (error) {
        console.error('Erreur signature:', error);
      }
    }
    
    // Info signature
    if (workOrder.client_signature_name || workOrder.signature_timestamp) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.black);
      
      let signText = '';
      if (workOrder.client_signature_name) {
        signText += 'Client: ' + workOrder.client_signature_name;
      }
      if (workOrder.signature_timestamp) {
        const signDate = this.formatQuebecDateTime(workOrder.signature_timestamp, true);
        signText += '  Date: ' + signDate;
      }
      
      doc.text(signText, 15, yStart + 30);
    }
    
    // Texte légal à droite
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...COLORS.gray);
    const legalText = doc.splitTextToSize('Toute marchandise demeure la propriété de Services TMT Inc. jusqu\'au paiement complet.', 90);
    doc.text(legalText, 105, yStart + 10);
  }

  generatePDF(workOrder) {
    try {
      console.log('Génération PDF modèle Excel TMT...');
      const doc = new jsPDF();
      
      this.addHeader(doc, workOrder);
      let currentY = this.addClientAndHoursSection(doc, workOrder);
      currentY = this.addDescriptionSection(doc, workOrder, currentY);
      currentY = this.addMaterialsTable(doc, workOrder, currentY);
      this.addSignatureSection(doc, workOrder, currentY);
      
      // Footer
      const pageHeight = doc.internal.pageSize.height;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.gray);
      doc.text('Généré le ' + this.formatQuebecDateTime(new Date().toISOString(), true), 15, pageHeight - 10);
      doc.text('Page 1', 195, pageHeight - 10, { align: 'right' });
      
      console.log('PDF généré avec succès - Modèle Excel TMT');
      
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
