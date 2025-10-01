// ============================================
// SERVICE EMAIL + PDF AMELIORE - DESIGN TMT
// Fichier: lib/services/email-service.js
// ============================================

const { Resend } = require('resend');
const { jsPDF } = require('jspdf');

// Configuration
const resend = new Resend(process.env.RESEND_API_KEY);
const COMPANY_NAME = process.env.COMPANY_NAME || 'Services TMT Inc.';
const COMPANY_EMAIL = process.env.COMPANY_EMAIL || 'info.servicestmt@gmail.com';
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@servicestmt.com';
const COMPANY_ADDRESS = process.env.COMPANY_ADDRESS || '3195, 42e Rue Nord';
const COMPANY_CITY = process.env.COMPANY_CITY || 'Saint-Georges, QC G5Z 0V9';
const COMPANY_PHONE = process.env.COMPANY_PHONE || '(418) 225-3875';

// ============================================
// SERVICE DE GENERATION PDF AMELIORE - DESIGN TMT
// ============================================

class WorkOrderPDFService {
  
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
    try {
      doc.addImage('https://gestion-bons-achat.vercel.app/logo.png', 'PNG', 20, 15, 40, 25);
    } catch (error) {
      console.error('Erreur chargement logo:', error);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Services TMT', 20, 25);
    }
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(COMPANY_NAME, 20, 45);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(COMPANY_ADDRESS, 20, 52);
    doc.text(COMPANY_CITY, 20, 57);
    doc.text('Tel: ' + COMPANY_PHONE, 20, 62);
    doc.text(COMPANY_EMAIL, 20, 67);
    
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('BON DE TRAVAIL', 190, 25, { align: 'right' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('No: ' + workOrder.bt_number, 190, 35, { align: 'right' });
    doc.text('Date: ' + this.formatQuebecDateTime(workOrder.work_date), 190, 42, { align: 'right' });
    
    doc.setLineWidth(2);
    doc.line(20, 75, 190, 75);
  }

  addClientInfo(doc, workOrder, y) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('INFORMATIONS CLIENT', 20, y);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    doc.text('Nom: ' + workOrder.client.name, 20, y + 10);
    doc.text('Adresse: ' + (workOrder.client.address || 'N/A'), 20, y + 18);
    if (workOrder.client.phone) {
      doc.text('Telephone: ' + workOrder.client.phone, 20, y + 26);
    }
    
    if (workOrder.client.email) {
      doc.text('Email: ' + workOrder.client.email, 110, y + 10);
    }
    if (workOrder.client.city) {
      doc.text('Ville: ' + workOrder.client.city, 110, y + 18);
    }
    if (workOrder.client.contact_person) {
      doc.text('Contact: ' + workOrder.client.contact_person, 110, y + 26);
    }
    if (workOrder.linked_po_id) {
      doc.text('BA Client: ' + workOrder.linked_po_id, 110, y + 34);
    }
    
    return y + 35;
  }

  addWorkDetails(doc, workOrder, y) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('DETAILS DU TRAVAIL', 20, y);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    doc.text('Heures: ' + (workOrder.total_hours || 0) + 'h', 20, y + 10);
    
    if (workOrder.work_description) {
      doc.text('Description des travaux:', 20, y + 22);
      const description = doc.splitTextToSize(workOrder.work_description, 170);
      doc.text(description, 20, y + 30);
      y += 30 + (description.length * 5);
    }
    
    if (workOrder.additional_notes) {
      doc.text('Notes additionnelles:', 20, y + 12);
      const notes = doc.splitTextToSize(workOrder.additional_notes, 170);
      doc.text(notes, 20, y + 20);
      y += 20 + (notes.length * 5);
    }
    
    return y + 15;
  }

  addMaterials(doc, workOrder, y) {
    if (!workOrder.materials || workOrder.materials.length === 0) {
      return y;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('MATERIAUX UTILISES', 20, y);
    
    const shouldShowPrices = workOrder.show_prices || 
                            (workOrder.materials && workOrder.materials.some(m => m.showPrice === true));
    
    console.log('shouldShowPrices detecte:', shouldShowPrices);
    
    const tableY = y + 10;
    const rowHeight = 8;
    const colWidths = [20, 70, 20, 20, 25, 25];
    const headers = ['Code', 'Description', 'Qte', 'Unite', 'Prix Unit.', 'Total'];
    const totalWidth = colWidths.reduce((sum, width) => sum + width, 0);
    
    doc.setFillColor(255, 165, 0);
    doc.rect(20, tableY, totalWidth, rowHeight, 'F');
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    
    let currentX = 20;
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], currentX + 3, tableY + 5);
      currentX += colWidths[i];
    }
    
    doc.setLineWidth(0.5);
    doc.rect(20, tableY, totalWidth, rowHeight);
    
    doc.setFont('helvetica', 'normal');
    let currentRowY = tableY + rowHeight;
    let materialsTotal = 0;
    
    for (let index = 0; index < workOrder.materials.length; index++) {
      const material = workOrder.materials[index];
      
      if (currentRowY > 250) {
        doc.addPage();
        currentRowY = 20;
      }
      
      if (index % 2 === 1) {
        doc.setFillColor(250, 250, 250);
        doc.rect(20, currentRowY, totalWidth, rowHeight, 'F');
      }
      
      const productCode = material.product?.product_id || material.product_id || '';
      const productName = material.product?.description || material.description || 'Materiau sans nom';
      const quantity = material.quantity.toString();
      const unit = material.unit || material.product?.unit || 'pcs';
      
      const unitPrice = material.product?.selling_price || material.unit_price || 0;
      const lineTotal = quantity * unitPrice;
      materialsTotal += lineTotal;
      
      currentX = 20;
      
      doc.text(productCode, currentX + 3, currentRowY + 5);
      currentX += colWidths[0];
      
      const descLines = doc.splitTextToSize(productName, colWidths[1] - 6);
      doc.text(descLines[0] || '', currentX + 3, currentRowY + 5);
      currentX += colWidths[1];
      
      doc.text(quantity, currentX + colWidths[2]/2, currentRowY + 5, { align: 'center' });
      currentX += colWidths[2];
      
      doc.text(unit, currentX + colWidths[3]/2, currentRowY + 5, { align: 'center' });
      currentX += colWidths[3];
      
      if (shouldShowPrices) {
        doc.text(unitPrice.toFixed(2) + ' $', currentX + colWidths[4] - 3, currentRowY + 5, { align: 'right' });
      }
      currentX += colWidths[4];
      
      if (shouldShowPrices) {
        doc.text(lineTotal.toFixed(2) + ' $', currentX + colWidths[5] - 3, currentRowY + 5, { align: 'right' });
      }
      
      doc.rect(20, currentRowY, totalWidth, rowHeight);
      currentRowY += rowHeight;
      
      if (material.notes) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.text('Note: ' + material.notes, 25, currentRowY - 2);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
      }
    }
    
    if (shouldShowPrices) {
      doc.setFillColor(240, 240, 240);
      doc.rect(20, currentRowY, totalWidth, rowHeight, 'F');
      doc.setFont('helvetica', 'bold');
      doc.text('TOTAL:', 20 + totalWidth - colWidths[5] - colWidths[4] - 3, currentRowY + 5, { align: 'right' });
      doc.text(materialsTotal.toFixed(2) + ' $ CAD', 20 + totalWidth - 3, currentRowY + 5, { align: 'right' });
      doc.rect(20, currentRowY, totalWidth, rowHeight);
      currentRowY += rowHeight;
    }
    
    return currentRowY + 10;
  }

  addSignature(doc, workOrder, y) {
    if (workOrder.signature_data) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('SIGNATURE CLIENT', 20, y);
      
      try {
        doc.setLineWidth(1);
        doc.rect(20, y + 5, 60, 20);
        doc.addImage(workOrder.signature_data, 'PNG', 22, y + 7, 56, 16);
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        if (workOrder.client_signature_name) {
          doc.text('Nom: ' + workOrder.client_signature_name, 20, y + 32);
        }
        if (workOrder.signature_timestamp) {
          const signDate = this.formatQuebecDateTime(workOrder.signature_timestamp, true);
          doc.text('Date: ' + signDate, 20, y + 39);
        }
        
        return y + 50;
      } catch (error) {
        console.error('Erreur ajout signature:', error);
        doc.setFontSize(10);
        doc.text('Signature numerique capturee', 20, y + 10);
        return y + 20;
      }
    }
    
    return y;
  }

  addFooter(doc) {
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Page 1', 190, pageHeight - 10, { align: 'right' });
  }

  generatePDF(workOrder) {
    try {
      console.log('Creation PDF avec design TMT ameliore...');
      const doc = new jsPDF();
      
      this.addHeader(doc, workOrder);
      let currentY = 85;
      
      currentY = this.addClientInfo(doc, workOrder, currentY);
      currentY = this.addWorkDetails(doc, workOrder, currentY);
      currentY = this.addMaterials(doc, workOrder, currentY);
      currentY = this.addSignature(doc, workOrder, currentY);
      
      this.addFooter(doc);
      
      console.log('PDF genere avec succes - Design TMT');
      
      return Buffer.from(doc.output('arraybuffer'));
    } catch (error) {
      console.error('Erreur generation PDF:', error);
      throw new Error('Erreur generation PDF: ' + error.message);
    }
  }
}

class WorkOrderEmailService {
  constructor() {
    this.pdfService = new WorkOrderPDFService();
  }

  getEmailTemplate(workOrder) {
    let html = '<!DOCTYPE html><html><head><meta charset="utf-8">';
    html += '<style>body { font-family: Arial, sans-serif; }</style>';
    html += '</head><body>';
    html += '<h2>' + COMPANY_NAME + '</h2>';
    html += '<h2>Bon de Travail ' + workOrder.bt_number + '</h2>';
    html += '<p>Bonjour ' + workOrder.client.name + ',</p>';
    html += '<p>Veuillez trouver en piece jointe le bon de travail complete.</p>';
    html += '<p>Merci de votre confiance.</p>';
    html += '<p>' + COMPANY_NAME + '<br>' + COMPANY_ADDRESS + '<br>' + COMPANY_CITY + '</p>';
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
        from: COMPANY_NAME + ' <' + RESEND_FROM_EMAIL + '>',
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
  WorkOrderPDFService,
  WorkOrderEmailService
};
