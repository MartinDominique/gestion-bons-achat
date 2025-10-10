// ============================================
// SERVICE EMAIL + PDF AMELIORE - DESIGN TMT COMPLET
// Fichier: lib/services/email-service.js
// ============================================

const { Resend } = require('resend');
const { jsPDF } = require('jspdf');

// Configuration
const resend = new Resend(process.env.RESEND_API_KEY);

const COMPANY_CONFIG = {
  name: process.env.COMPANY_NAME || 'Services TMT Inc.',
  address: process.env.COMPANY_ADDRESS || '3195, 42e Rue Nord',
  city: process.env.COMPANY_CITY || 'Saint-Georges, QC G5Z 0V9',
  phone: process.env.COMPANY_PHONE || '(418) 225-3875',
  email: process.env.COMPANY_EMAIL || 'info.servicestmt@gmail.com',
  website: 'www.servicestmt.ca',
  resendFrom: process.env.RESEND_FROM_EMAIL || 'noreply@servicestmt.com'
};

// Configuration layout personnalisé
const LAYOUT_CONFIG = {
  header: {
    logo: { x: 20, y: 15, width: 40, height: 25 },
    company: { x: 70, y: 20, width: 80 }
  },
  btSection: {
    title: { x: 190, y: 25 },
    number: { x: 190, y: 35 },
    date: { x: 190, y: 42 },
    ba: { x: 190, y: 49 }
  },
  clientInfo: {
    x: 20, y: 85, width: 85, height: 40
  },
  workDetails: {
    x: 110, y: 85, width: 80, height: 40
  },
  description: {
    x: 20, y: 135, width: 170, height: 60
  },
  materials: {
    x: 20, y: 205, width: 170
  },
  signatures: {
    x: 20, y: 270, width: 170, height: 20
  }
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

  addCustomHeader(doc, workOrder) {
    const { header } = LAYOUT_CONFIG;
    
    try {
      doc.addImage('https://gestion-bons-achat.vercel.app/logo.png', 'PNG', 
                   header.logo.x, header.logo.y, header.logo.width, header.logo.height);
    } catch (error) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 140, 0);
      doc.text('TMT', header.logo.x, header.logo.y + 15);
    }
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(COMPANY_CONFIG.name, header.company.x, header.company.y);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(COMPANY_CONFIG.address, header.company.x, header.company.y + 7);
    doc.text(COMPANY_CONFIG.city, header.company.x, header.company.y + 14);
    doc.text('Tél: ' + COMPANY_CONFIG.phone, header.company.x, header.company.y + 21);
    doc.text(COMPANY_CONFIG.email, header.company.x, header.company.y + 28);
    doc.text(COMPANY_CONFIG.website, header.company.x, header.company.y + 35);
  }

  addBTSection(doc, workOrder) {
    const { btSection } = LAYOUT_CONFIG;
    
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 140, 0);
    doc.text('BON DE TRAVAIL', btSection.title.x, btSection.title.y, { align: 'right' });
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('No: ' + workOrder.bt_number, btSection.number.x, btSection.number.y, { align: 'right' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Date: ' + this.formatQuebecDateTime(workOrder.work_date), btSection.date.x, btSection.date.y, { align: 'right' });
    
    if (workOrder.linked_po && workOrder.linked_po.po_number) {
      doc.text('BA Client: ' + workOrder.linked_po.po_number, btSection.ba.x, btSection.ba.y, { align: 'right' });
    }
    
    doc.setLineWidth(2);
    doc.setDrawColor(255, 140, 0);
    doc.line(20, 75, 190, 75);
  }

  addClientSection(doc, workOrder) {
    const { clientInfo } = LAYOUT_CONFIG;
    
    // Fond orange pour le titre
    doc.setFillColor(255, 140, 0);
    doc.rect(clientInfo.x, clientInfo.y, clientInfo.width, 8, 'F');
    
    doc.setLineWidth(1);
    doc.setDrawColor(150, 150, 150);
    doc.rect(clientInfo.x, clientInfo.y, clientInfo.width, clientInfo.height);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('INFORMATIONS CLIENT', clientInfo.x + 5, clientInfo.y + 6);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    
    let yPos = clientInfo.y + 18;
    
    doc.text('Nom:', clientInfo.x + 5, yPos);
    doc.setFont('helvetica', 'bold');
    doc.text(workOrder.client.name || 'N/A', clientInfo.x + 20, yPos);
    doc.setFont('helvetica', 'normal');
    yPos += 6;
    
    if (workOrder.client.address) {
      doc.text('Adresse:', clientInfo.x + 5, yPos);
      doc.text(workOrder.client.address, clientInfo.x + 25, yPos);
      yPos += 6;
    }
    
    if (workOrder.client.phone) {
      doc.text('Téléphone:', clientInfo.x + 5, yPos);
      doc.text(workOrder.client.phone, clientInfo.x + 30, yPos);
      yPos += 6;
    }
    
    if (workOrder.client.email) {
      doc.text('Email:', clientInfo.x + 5, yPos);
      doc.text(workOrder.client.email, clientInfo.x + 20, yPos);
    }
  }

  addWorkDetailsSection(doc, workOrder) {
    const { workDetails } = LAYOUT_CONFIG;
    
    // Fond orange pour le titre
    doc.setFillColor(255, 140, 0);
    doc.rect(workDetails.x, workDetails.y, workDetails.width, 8, 'F');
    
    doc.setLineWidth(1);
    doc.setDrawColor(150, 150, 150);
    doc.rect(workDetails.x, workDetails.y, workDetails.width, workDetails.height);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('HEURES TRAVAILLÉES', workDetails.x + 5, workDetails.y + 6);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    
    let yPos = workDetails.y + 18;
    
    doc.text('Heures travaillées:', workDetails.x + 5, yPos);
    doc.setFont('helvetica', 'bold');
    doc.text((workOrder.total_hours || 0) + 'h', workDetails.x + 50, yPos);
    doc.setFont('helvetica', 'normal');
    yPos += 8;
    
    if (workOrder.start_time && workOrder.end_time) {
      doc.text('Période:', workDetails.x + 5, yPos);
      doc.text(workOrder.start_time + ' - ' + workOrder.end_time, workDetails.x + 25, yPos);
      yPos += 6;
    }
    
    if (workOrder.break_time && workOrder.break_time > 0) {
      doc.text('Pause:', workDetails.x + 5, yPos);
      doc.text(workOrder.break_time + ' min', workDetails.x + 20, yPos);
    }
  }

  addDescriptionSection(doc, workOrder) {
    const { description } = LAYOUT_CONFIG;
    
    // Fond orange pour le titre
    doc.setFillColor(255, 140, 0);
    doc.rect(description.x, description.y, description.width, 8, 'F');
    
    doc.setLineWidth(1);
    doc.setDrawColor(150, 150, 150);
    doc.rect(description.x, description.y, description.width, description.height);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('DESCRIPTION DES TRAVAUX', description.x + 5, description.y + 6);
    
    if (workOrder.work_description) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      
      const descriptionText = doc.splitTextToSize(workOrder.work_description, description.width - 10);
      doc.text(descriptionText, description.x + 5, description.y + 18);
    }
    
    if (workOrder.additional_notes) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 100, 100);
      
      const notesY = description.y + description.height - 15;
      doc.text('Notes:', description.x + 5, notesY);
      const notesText = doc.splitTextToSize(workOrder.additional_notes, description.width - 20);
      doc.text(notesText, description.x + 25, notesY);
    }
  }

  addMaterialsTable(doc, workOrder) {
    if (!workOrder.materials || workOrder.materials.length === 0) {
      return;
    }

    const { materials } = LAYOUT_CONFIG;
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 140, 0);
    doc.text('MATÉRIAUX UTILISÉS', materials.x, materials.y);
    
    const tableY = materials.y + 10;
    const rowHeight = 8;
    const shouldShowPrices = workOrder.show_prices || 
                            (workOrder.materials && workOrder.materials.some(m => m.show_price === true));
    
    const colWidths = shouldShowPrices ? 
                     [25, 70, 20, 20, 25, 25] : 
                     [30, 90, 25, 25];
    
    const headers = shouldShowPrices ? 
                   ['Code', 'Description', 'Qté', 'Unité', 'Prix Unit.', 'Total'] :
                   ['Code', 'Description', 'Qté', 'Unité'];
    
    const totalWidth = colWidths.reduce((sum, width) => sum + width, 0);
    
    doc.setFillColor(255, 140, 0);
    doc.rect(materials.x, tableY, totalWidth, rowHeight, 'F');
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    
    let currentX = materials.x;
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], currentX + 3, tableY + 5);
      currentX += colWidths[i];
    }
    
    doc.setLineWidth(0.5);
    doc.setDrawColor(200, 200, 200);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    
    let currentRowY = tableY + rowHeight;
    
    for (let index = 0; index < workOrder.materials.length; index++) {
      const material = workOrder.materials[index];
      
      if (index % 2 === 1) {
        doc.setFillColor(245, 245, 245);
        doc.rect(materials.x, currentRowY, totalWidth, rowHeight, 'F');
      }
      
      const productCode = material.product?.product_id || material.product_id || '';
      const productName = material.product?.description || material.description || 'Matériau';
      const quantity = material.quantity.toString();
      const unit = material.unit || material.product?.unit || 'pcs';
      
      currentX = materials.x;
      
      doc.text(productCode, currentX + 3, currentRowY + 5);
      currentX += colWidths[0];
      
      const descLines = doc.splitTextToSize(productName, colWidths[1] - 6);
      doc.text(descLines[0] || '', currentX + 3, currentRowY + 5);
      currentX += colWidths[1];
      
      doc.text(quantity, currentX + colWidths[2]/2, currentRowY + 5, { align: 'center' });
      currentX += colWidths[2];
      
      doc.text(unit, currentX + colWidths[3]/2, currentRowY + 5, { align: 'center' });
      currentX += colWidths[3];
      
      if (shouldShowPrices && material.show_price) {
        const unitPrice = material.product?.selling_price || material.unit_price || 0;
        const lineTotal = quantity * unitPrice;
        
        doc.text(unitPrice.toFixed(2) + ' $', currentX + colWidths[4] - 3, currentRowY + 5, { align: 'right' });
        currentX += colWidths[4];
        
        doc.text(lineTotal.toFixed(2) + ' $', currentX + colWidths[5] - 3, currentRowY + 5, { align: 'right' });
      }
      
      doc.rect(materials.x, currentRowY, totalWidth, rowHeight);
      currentRowY += rowHeight;
      
      if (material.notes) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.text('Note: ' + material.notes, materials.x + 5, currentRowY - 2);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
      }
    }
    
    // Plus de grand total - seulement totaux par ligne
  }

  addSignatureSection(doc, workOrder) {
    const { signatures } = LAYOUT_CONFIG;
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 140, 0);
    doc.text('SIGNATURES', signatures.x, signatures.y);
    
    if (workOrder.signature_data) {
      try {
        doc.setLineWidth(1);
        doc.setDrawColor(150, 150, 150);
        doc.rect(signatures.x, signatures.y + 5, 60, 15);
        doc.addImage(workOrder.signature_data, 'PNG', signatures.x + 2, signatures.y + 7, 56, 11);
        
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        
        if (workOrder.client_signature_name) {
          doc.text('Client: ' + workOrder.client_signature_name, signatures.x, signatures.y + 25);
        }
        if (workOrder.signature_timestamp) {
          const signDate = this.formatQuebecDateTime(workOrder.signature_timestamp, true);
          doc.text('Date: ' + signDate, signatures.x + 40, signatures.y + 25);
        }
      } catch (error) {
        console.error('Erreur signature:', error);
        doc.setFontSize(10);
        doc.text('Signature numérique validée', signatures.x, signatures.y + 15);
      }
    } else {
      doc.setLineWidth(0.5);
      doc.setDrawColor(150, 150, 150);
      doc.line(signatures.x, signatures.y + 15, signatures.x + 60, signatures.y + 15);
      doc.line(signatures.x + 110, signatures.y + 15, signatures.x + 170, signatures.y + 15);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('Signature Client', signatures.x, signatures.y + 20);
      doc.text('Signature Technicien', signatures.x + 110, signatures.y + 20);
    }
    
    // Texte légal en bas
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 100, 100);
    const legalText = 'Toute marchandise demeure la propriété de Services TMT Inc. jusqu\'au paiement complet.';
    doc.text(legalText, signatures.x + 85, signatures.y + 25, { align: 'right' });
  }

  generatePDF(workOrder) {
    try {
      console.log('Génération PDF avec layout personnalisé TMT...');
      const doc = new jsPDF();
      
      this.addCustomHeader(doc, workOrder);
      this.addBTSection(doc, workOrder);
      this.addClientSection(doc, workOrder);
      this.addWorkDetailsSection(doc, workOrder);
      this.addDescriptionSection(doc, workOrder);
      this.addMaterialsTable(doc, workOrder);
      this.addSignatureSection(doc, workOrder);
      
      const pageHeight = doc.internal.pageSize.height;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150, 150, 150);
      doc.text('Page 1', 190, pageHeight - 10, { align: 'right' });
      doc.text('Généré le ' + this.formatQuebecDateTime(new Date().toISOString(), true), 20, pageHeight - 10);
      
      console.log('PDF généré avec succès - Layout personnalisé TMT');
      
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
  LAYOUT_CONFIG,
  COMPANY_CONFIG
};
