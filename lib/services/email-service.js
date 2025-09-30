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
  
  // Fonction pour formater les dates en fuseau Quebec
  formatQuebecDateTime(dateString, includeTime = false) {
    const date = new Date(dateString);
    const options = {
      timeZone: 'America/Toronto', // Fuseau du Quebec
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
    // NOUVEAU DESIGN : Logo + Info compagnie a gauche, Document a droite
    
    // Logo a gauche (position fixe)
    try {
      doc.addImage('https://gestion-bons-achat.vercel.app/logo.png', 'PNG', 20, 15, 40, 25);
    } catch (error) {
      console.error('Erreur chargement logo:', error);
      // Fallback en cas d'erreur
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Services TMT', 20, 25);
    }
    
    // Informations entreprise a gauche (sous le logo)
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(COMPANY_NAME, 20, 45);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(COMPANY_ADDRESS, 20, 52);
    doc.text(COMPANY_CITY, 20, 57);
    doc.text('Tel: ' + COMPANY_PHONE, 20, 62);
    doc.text(COMPANY_EMAIL, 20, 67);
    
    // Information Document a droite (comme votre soumission)
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('BON DE TRAVAIL', 190, 25, { align: 'right' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('No: ' + workOrder.bt_number, 190, 35, { align: 'right' });
    doc.text('Date: ' + this.formatQuebecDateTime(workOrder.work_date), 190, 42, { align: 'right' });
    
    // Ligne de separation plus epaisse
    doc.setLineWidth(2);
    doc.line(20, 75, 190, 75);
  }

  addClientInfo(doc, workOrder, y) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('INFORMATIONS CLIENT', 20, y);
    
    // DESIGN COMPACT : 2 colonnes cote a cote
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    // Colonne 1 (gauche)
    doc.text('Nom: ' + workOrder.client.name, 20, y + 10);
    doc.text('Adresse: ' + (workOrder.client.address || 'N/A'), 20, y + 18);
    if (workOrder.client.phone) {
      doc.text('Telephone: ' + workOrder.client.phone, 20, y + 26);
    }
    
    // Colonne 2 (droite) - A partir de x=110
    if (workOrder.client.email) {
      doc.text('Email: ' + workOrder.client.email, 110, y + 10);
    }
    if (workOrder.client.city) {
      doc.text('Ville: ' + workOrder.client.city, 110, y + 18);
    }
    if (workOrder.client.contact_person) {
      doc.text('Contact: ' + workOrder.client.contact_person, 110, y + 26);
    }
    
    return y + 35; // Moins d'espace vertical
  }

  addWorkDetails(doc, workOrder, y) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('DETAILS DU TRAVAIL', 20, y);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    // AFFICHAGE HEURES SIMPLIFIE - Seulement le total
    doc.text('Heures: ' + (workOrder.total_hours || 0) + 'h', 20, y + 10);
    // PLUS DE PAUSE AFFICHEE - retire completement
    
    // Description
    if (workOrder.work_description) {
      doc.text('Description des travaux:', 20, y + 22);
      const description = doc.splitTextToSize(workOrder.work_description, 170);
      doc.text(description, 20, y + 30);
      y += 30 + (description.length * 5);
    }
    
    // Notes additionnelles
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
    
    // Tableau avec bordures - TOUJOURS 6 COLONNES (prix conditionnels)
    const tableY = y + 10;
    const rowHeight = 8;
    
    // Toujours 6 colonnes (structure fixe)
    const colWidths = [20, 70, 20, 20, 25, 25]; // Code, Description, Qte, Unite, Prix, Total
    const headers = ['Code', 'Description', 'Qte', 'Unite', 'Prix Unit.', 'Total'];
    
    const totalWidth = colWidths.reduce((sum, width) => sum + width, 0);
    
    // En-tetes avec fond ORANGE (comme votre design)
    doc.setFillColor(255, 165, 0); // Orange
    doc.rect(20, tableY, totalWidth, rowHeight, 'F');
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    
    let currentX = 20;
    headers.forEach((header, index) => {
      doc.text(header, currentX + 3, tableY + 5);
      currentX += colWidths[index];
    });
    
    // Bordures en-tetes
    doc.setLineWidth(0.5);
    doc.rect(20, tableY, totalWidth, rowHeight);
    
    // Lignes materiaux
    doc.setFont('helvetica', 'normal');
    let currentRowY = tableY + rowHeight;
    let materialsTotal = 0;
    
    workOrder.materials.forEach((material, index) => {
      if (currentRowY > 250) {
        doc.addPage();
        currentRowY = 20;
      }
      
      // Fond alternatif pour lisibilite
      if (index % 2 === 1) {
        doc.setFillColor(250, 250, 250);
        doc.rect(20, currentRowY, totalWidth, rowHeight, 'F');
      }
      
      const productCode = material.product?.product_id || material.product_id || '';
      const productName = material.product?.description || material.description || 'Materiau sans nom';
      const quantity = material.quantity.toString();
      const unit = material.unit || material.product?.unit || 'pcs';
      
      // Calculs pour prix
      const unitPrice = material.product?.selling_price || material.unit_price || 0;
      const lineTotal = quantity * unitPrice;
      materialsTotal += lineTotal;
      
      // Texte dans les cellules
      currentX = 20;
      
      // Code
      doc.text(productCode, currentX + 3, currentRowY + 5);
      currentX += colWidths[0];
      
      // Description
      const descLines = doc.splitTextToSize(productName, colWidths[1] - 6);
      doc.text(descLines[0] || '', currentX + 3, currentRowY + 5); // Premiere ligne seulement
      currentX += colWidths[1];
      
      // Quantite
      doc.text(quantity, currentX + colWidths[2]/2, currentRowY + 5, { align: 'center' });
      currentX += colWidths[2];
      
      // Unite
      doc.text(unit, currentX + colWidths[3]/2, currentRowY + 5, { align: 'center' });
      currentX += colWidths[3];
      
      // Prix unitaire - CONDITIONNEL selon show_prices
      if (workOrder.show_prices) {
        doc.text(unitPrice.toFixed(2) + ' $', currentX + colWidths[4] - 3, currentRowY + 5, { align: 'right' });
      }
      // Sinon colonne vide mais presente
      currentX += colWidths[4];
      
      // Total ligne - CONDITIONNEL selon show_prices  
      if (workOrder.show_prices) {
        doc.text(lineTotal.toFixed(2) + ' $', currentX + colWidths[5] - 3, currentRowY + 5, { align: 'right' });
      }
      // Sinon colonne vide mais presente
      
      // Bordures cellules
      doc.rect(20, currentRowY, totalWidth, rowHeight);
      
      currentRowY += rowHeight;
      
      // Notes materiau si presentes
      if (material.notes) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.text('Note: ' + material.notes, 25, currentRowY - 2);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
      }
    });
    
    // Total general - CONDITIONNEL selon show_prices
    if (workOrder.show_prices) {
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
        // SIGNATURE 3X MOINS GRANDE : 30x12 au lieu de 100x40
        doc.setLineWidth(1);
        doc.rect(20, y + 5, 60, 20); // Cadre plus petit
        
        // Ajouter l'image signature - dimensions reduites
        doc.addImage(workOrder.signature_data, 'PNG', 22, y + 7, 56, 16);
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        if (workOrder.client_signature_name) {
          doc.text('Nom: ' + workOrder.client_signature_name, 20, y + 32);
        }
        if (workOrder.signature_timestamp) {
          // DATE CORRIGEE EN FUSEAU QUEBEC SANS SECONDES
          const signDate = this.formatQuebecDateTime(workOrder.signature_timestamp, true);
          doc.text('Date: ' + signDate, 20, y + 39);
        }
        
        return y + 50; // Moins d'espace vertical
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
    // PLUS DE "Genere le..." - seulement le numero de page
    doc.text('Page 1', 190, pageHeight - 10, { align: 'right' });
  }

  generatePDF(workOrder) {
    console.log('workOrder.show_prices:', workOrder.show_prices);
    try {
      console.log('Creation PDF avec design TMT ameliore...');
      const doc = new jsPDF();
      
      // Construction du PDF
      this.addHeader(doc, workOrder);
      let currentY = 85; // Depart plus bas a cause du nouveau header
      
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

// ============================================
// SERVICE D'ENVOI EMAIL AMELIORE
// ============================================

class WorkOrderEmailService {
  constructor() {
    this.pdfService = new WorkOrderPDFService();
  }

  getEmailTemplate(workOrder) {
    // Template HTML simple sans backticks
    let htmlContent = '<!DOCTYPE html>';
    htmlContent += '<html><head><meta charset="utf-8">';
    htmlContent += '<style>';
    htmlContent += 'body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }';
    htmlContent += '.header { background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px; text-align: center; }';
    htmlContent += '.content { padding: 0 20px; }';
    htmlContent += '.signature { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; }';
    htmlContent += '.footer { font-size: 12px; color: #666; margin-top: 30px; text-align: center; }';
    htmlContent += '</style></head><body>';
    
    htmlContent += '<div class="header">';
    htmlContent += '<h2 style="color: #2c5aa0; margin: 0;">' + COMPANY_NAME + '</h2>';
    htmlContent += '<h2 style="margin: 10px 0;">Bon de Travail ' + workOrder.bt_number + '</h2>';
    htmlContent += '<p><strong>Date:</strong> ' + new Date(workOrder.work_date).toLocaleDateString('fr-CA') + '</p>';
    htmlContent += '</div>';
    
    htmlContent += '<div class="content">';
    htmlContent += '<p>Bonjour ' + workOrder.client.name + ',</p>';
    htmlContent += '<p>Veuillez trouver en piece jointe le bon de travail complete pour les services rendus.</p>';
    htmlContent += '<p><strong>Resume des travaux :</strong></p>';
    htmlContent += '<ul>';
    htmlContent += '<li><strong>Date d\'intervention :</strong> ' + new Date(workOrder.work_date).toLocaleDateString('fr-CA') + '</li>';
    htmlContent += '<li><strong>Duree :</strong> ' + (workOrder.total_hours || 0) + ' heures</li>';
    
    if (workOrder.work_description) {
      htmlContent += '<li><strong>Description :</strong> ' + workOrder.work_description + '</li>';
    }
    if (workOrder.materials && workOrder.materials.length > 0) {
      htmlContent += '<li><strong>Materiaux utilises :</strong> ' + workOrder.materials.length + ' article(s)</li>';
    }
    
    htmlContent += '</ul>';
    htmlContent += '<p>Si vous avez des questions concernant ce bon de travail, n\'hesitez pas a nous contacter.</p>';
    htmlContent += '<p>Merci de votre confiance.</p>';
    htmlContent += '</div>';
    
    htmlContent += '<div class="signature">';
    htmlContent += '<p><strong>' + COMPANY_NAME + '</strong><br>';
    htmlContent += COMPANY_ADDRESS + '<br>';
    htmlContent += COMPANY_CITY + '<br>';
    htmlContent += 'Tel: ' + COMPANY_PHONE + '<br>';
    htmlContent += 'Email: ' + COMPANY_EMAIL + '</p>';
    htmlContent += '</div>';
    
    htmlContent += '<div class="footer">';
    htmlContent += '<p><em>Document genere automatiquement</em></p>';
    htmlContent += '</div>';
    htmlContent += '</body></html>';
    
    return htmlContent;
  }

  async sendWorkOrderEmail(workOrder, options = {}) {
    try {
      const clientEmail = options.clientEmail || workOrder.client.email;
      
      if (!clientEmail) {
        throw new Error('Aucune adresse email disponible pour le client');
      }

      console.log('Generation PDF pour envoi email...');
      
      const pdfBuffer = this.pdfService.generatePDF(workOrder);
      
      console.log('PDF genere, preparation email...');
      
      const ccEmails = [];
      
      if (options.sendToBureau !== false && COMPANY_EMAIL) {
        ccEmails.push(COMPANY_EMAIL);
      }
      
      if (options.ccEmails && options.ccEmails.length > 0) {
        ccEmails.push(...options.ccEmails);
      }

      const htmlContent = options.customMessage || this.getEmailTemplate(workOrder);
      
      // NOM DE FICHIER CORRIGE - Format simple : BT-2025-015.pdf
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

      if (ccEmails.length > 0) {
        emailConfig.cc = ccEmails;
      }

      if (COMPANY_EMAIL && COMPANY_EMAIL !== RESEND_FROM_EMAIL) {
        emailConfig.reply_to = COMPANY_EMAIL;
      }

      console.log('Envoi email avec Resend, fichier:', pdfFilename);

      const result = await resend.emails.send(emailConfig);

      if (result.error) {
        throw new Error(result.error.message);
      }

      console.log('Email envoye avec succes:', result.data?.id);

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
