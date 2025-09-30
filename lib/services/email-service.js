// ============================================
// SERVICE EMAIL + PDF - JSPDF CORRIGÉ POUR VERCEL
// Fichier: lib/services/email-service.js
// ============================================

const { Resend } = require('resend');

// Import jsPDF compatible serverless
let jsPDF;
try {
  if (typeof window === 'undefined') {
    // Côté serveur - essayer différentes méthodes d'import
    const jsPDFModule = require('jspdf');
    jsPDF = jsPDFModule.jsPDF || jsPDFModule.default || jsPDFModule;
  }
} catch (error) {
  console.error('Erreur import jsPDF:', error);
}

// Configuration
const resend = new Resend(process.env.RESEND_API_KEY);
const COMPANY_NAME = process.env.COMPANY_NAME || 'Services TMT Inc.';
const COMPANY_EMAIL = process.env.COMPANY_EMAIL || 'info.servicestmt@gmail.com';
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@servicestmt.com';
const COMPANY_ADDRESS = process.env.COMPANY_ADDRESS || '3195, 42e Rue Nord';
const COMPANY_CITY = process.env.COMPANY_CITY || 'Saint-Georges, QC G5Z 0V9';
const COMPANY_PHONE = process.env.COMPANY_PHONE || '(418) 225-3875';

// ============================================
// SERVICE DE GÉNÉRATION PDF
// ============================================

class WorkOrderPDFService {
  constructor() {
    if (!jsPDF) {
      throw new Error('jsPDF non disponible dans cet environnement');
    }
  }

  addHeader(doc, workOrder) {
    // En-tête entreprise
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(COMPANY_NAME, 20, 25);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(COMPANY_ADDRESS, 20, 32);
    doc.text(COMPANY_CITY, 20, 37);
    doc.text(`Tél: ${COMPANY_PHONE}`, 20, 42);
    doc.text(`Email: ${COMPANY_EMAIL}`, 20, 47);
    
    // Titre BT
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(`BON DE TRAVAIL ${workOrder.bt_number}`, 120, 25);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Date: ${new Date(workOrder.work_date).toLocaleDateString('fr-CA')}`, 120, 35);
    doc.text(`Statut: ${this.getStatusLabel(workOrder.status)}`, 120, 42);
    
    // Ligne de séparation
    doc.setLineWidth(0.5);
    doc.line(20, 55, 190, 55);
  }

  addClientInfo(doc, workOrder, y) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('INFORMATIONS CLIENT', 20, y);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Nom: ${workOrder.client.name}`, 20, y + 8);
    doc.text(`Adresse: ${workOrder.client.address || 'N/A'}`, 20, y + 15);
    
    if (workOrder.client.phone) {
      doc.text(`Téléphone: ${workOrder.client.phone}`, 20, y + 22);
    }
    if (workOrder.client.email) {
      doc.text(`Email: ${workOrder.client.email}`, 20, y + 29);
    }
    
    return y + 40;
  }

  addWorkDetails(doc, workOrder, y) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('DÉTAILS DU TRAVAIL', 20, y);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    // Horaires
    const startTime = workOrder.start_time ? workOrder.start_time.substring(0, 5) : '-';
    const endTime = workOrder.end_time ? workOrder.end_time.substring(0, 5) : '-';
    doc.text(`Heures: ${startTime} à ${endTime}`, 20, y + 8);
    doc.text(`Pause: ${workOrder.break_time || 0}h`, 100, y + 8);
    doc.text(`Total: ${workOrder.total_hours || 0}h`, 140, y + 8);
    
    // Description
    if (workOrder.work_description) {
      doc.text('Description des travaux:', 20, y + 18);
      const description = doc.splitTextToSize(workOrder.work_description, 170);
      doc.text(description, 20, y + 26);
      y += 26 + (description.length * 5);
    }
    
    // Notes additionnelles
    if (workOrder.additional_notes) {
      doc.text('Notes additionnelles:', 20, y + 10);
      const notes = doc.splitTextToSize(workOrder.additional_notes, 170);
      doc.text(notes, 20, y + 18);
      y += 18 + (notes.length * 5);
    }
    
    return y + 15;
  }

  addMaterials(doc, workOrder, y) {
    if (!workOrder.materials || workOrder.materials.length === 0) {
      return y;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('MATÉRIAUX UTILISÉS', 20, y);
    
    // En-têtes tableau
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Description', 20, y + 10);
    doc.text('Qté', 140, y + 10);
    doc.text('Unité', 160, y + 10);
    
    // Ligne séparation
    doc.setLineWidth(0.3);
    doc.line(20, y + 12, 190, y + 12);
    
    // Matériaux
    doc.setFont('helvetica', 'normal');
    let currentY = y + 20;
    
    workOrder.materials.forEach((material) => {
      if (currentY > 250) { // Nouvelle page si nécessaire
        doc.addPage();
        currentY = 20;
      }
      
      const productName = material.product?.name || 'Matériau sans nom';
      const productNameLines = doc.splitTextToSize(productName, 115);
      doc.text(productNameLines, 20, currentY);
      doc.text(material.quantity.toString(), 140, currentY);
      doc.text(material.unit || material.product?.unit || 'pcs', 160, currentY);
      
      if (material.notes) {
        doc.setFontSize(8);
        doc.text(`Note: ${material.notes}`, 25, currentY + 5);
        doc.setFontSize(9);
        currentY += 5;
      }
      
      currentY += productNameLines.length * 4 + 5;
    });
    
    return currentY + 10;
  }

  addSignature(doc, workOrder, y) {
    if (workOrder.signature_data) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('SIGNATURE CLIENT', 20, y);
      
      try {
        // Ajouter l'image signature
        doc.addImage(workOrder.signature_data, 'PNG', 20, y + 5, 100, 40);
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        if (workOrder.client_signature_name) {
          doc.text(`Nom: ${workOrder.client_signature_name}`, 20, y + 50);
        }
        if (workOrder.signature_timestamp) {
          const signDate = new Date(workOrder.signature_timestamp).toLocaleString('fr-CA');
          doc.text(`Date: ${signDate}`, 20, y + 57);
        }
        
        return y + 65;
      } catch (error) {
        console.error('Erreur ajout signature:', error);
        doc.setFontSize(10);
        doc.text('Signature numérique capturée', 20, y + 10);
        return y + 20;
      }
    }
    
    return y;
  }

  addFooter(doc) {
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Généré le ${new Date().toLocaleString('fr-CA')}`, 20, pageHeight - 10);
    doc.text('Page 1', 170, pageHeight - 10);
  }

  getStatusLabel(status) {
    const labels = {
      draft: 'Brouillon',
      ready_for_signature: 'Prêt pour signature',
      signed: 'Signé',
      pending_send: 'En attente d\'envoi',
      sent: 'Envoyé',
      archived: 'Archivé'
    };
    return labels[status] || status;
  }

  generatePDF(workOrder) {
    try {
      // Vérifier que jsPDF est disponible
      if (!jsPDF) {
        throw new Error('jsPDF n\'est pas disponible');
      }

      console.log('Création PDF avec jsPDF...');
      const doc = new jsPDF();
      
      // Construction du PDF
      this.addHeader(doc, workOrder);
      let currentY = 65;
      
      currentY = this.addClientInfo(doc, workOrder, currentY);
      currentY = this.addWorkDetails(doc, workOrder, currentY);
      currentY = this.addMaterials(doc, workOrder, currentY);
      currentY = this.addSignature(doc, workOrder, currentY);
      
      this.addFooter(doc);
      
      // Retourner le buffer
      return Buffer.from(doc.output('arraybuffer'));
    } catch (error) {
      console.error('Erreur génération PDF:', error);
      throw new Error(`Erreur génération PDF: ${error.message}`);
    }
  }
}

// ============================================
// SERVICE D'ENVOI EMAIL
// ============================================

class WorkOrderEmailService {
  constructor() {
    this.pdfService = new WorkOrderPDFService();
  }

  getEmailTemplate(workOrder) {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .header { background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .content { padding: 0 20px; }
        .signature { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
        .footer { font-size: 12px; color: #666; margin-top: 30px; }
    </style>
</head>
<body>
    <div class="header">
        <h2>Bon de Travail ${workOrder.bt_number}</h2>
        <p><strong>Date:</strong> ${new Date(workOrder.work_date).toLocaleDateString('fr-CA')}</p>
    </div>
    
    <div class="content">
        <p>Bonjour ${workOrder.client.name},</p>
        
        <p>Veuillez trouver en pièce jointe le bon de travail complété pour les services rendus.</p>
        
        <p><strong>Résumé des travaux :</strong></p>
        <ul>
            <li><strong>Date d'intervention :</strong> ${new Date(workOrder.work_date).toLocaleDateString('fr-CA')}</li>
            <li><strong>Durée :</strong> ${workOrder.total_hours || 0} heures</li>
            ${workOrder.work_description ? `<li><strong>Description :</strong> ${workOrder.work_description}</li>` : ''}
            ${workOrder.materials && workOrder.materials.length > 0 ? `<li><strong>Matériaux utilisés :</strong> ${workOrder.materials.length} article(s)</li>` : ''}
        </ul>
        
        <p>Si vous avez des questions concernant ce bon de travail, n'hésitez pas à nous contacter.</p>
        
        <p>Merci de votre confiance.</p>
    </div>
    
    <div class="signature">
        <p>Cordialement,</p>
        <p><strong>${COMPANY_NAME}</strong><br>
        ${COMPANY_ADDRESS}<br>
        ${COMPANY_CITY}<br>
        Tél: ${COMPANY_PHONE}<br>
        Email: ${COMPANY_EMAIL}</p>
    </div>
    
    <div class="footer">
        <p><em>Ce document a été généré automatiquement le ${new Date().toLocaleString('fr-CA')}</em></p>
    </div>
</body>
</html>
    `;
  }

  async sendWorkOrderEmail(workOrder, options = {}) {
    try {
      // Email du client
      const clientEmail = options.clientEmail || workOrder.client.email;
      
      if (!clientEmail) {
        throw new Error('Aucune adresse email disponible pour le client');
      }

      console.log('Génération PDF pour envoi email...');
      
      // Générer le PDF
      const pdfBuffer = this.pdfService.generatePDF(workOrder);
      
      console.log('PDF généré, préparation email...');
      
      // Préparer les emails CC
      const ccEmails = [];
      
      // Ajouter email bureau si demandé
      if (options.sendToBureau !== false && COMPANY_EMAIL) {
        ccEmails.push(COMPANY_EMAIL);
      }
      
      // Ajouter emails CC supplémentaires
      if (options.ccEmails && options.ccEmails.length > 0) {
        ccEmails.push(...options.ccEmails);
      }

      // Template email
      const htmlContent = options.customMessage || this.getEmailTemplate(workOrder);
      
      // Configuration envoi
      const emailConfig = {
        from: `${COMPANY_NAME} <${RESEND_FROM_EMAIL}>`,
        to: [clientEmail],
        subject: `Bon de Travail ${workOrder.bt_number} - ${workOrder.client.name}`,
        html: htmlContent,
        attachments: [
          {
            filename: `BT_${workOrder.bt_number}_${workOrder.client.name.replace(/\s+/g, '_')}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf'
          }
        ]
      };

      // Ajouter CC seulement s'il y en a
      if (ccEmails.length > 0) {
        emailConfig.cc = ccEmails;
      }

      // Ajouter Reply-To
      if (COMPANY_EMAIL && COMPANY_EMAIL !== RESEND_FROM_EMAIL) {
        emailConfig.reply_to = COMPANY_EMAIL;
      }

      console.log('Envoi email avec Resend...');

      // Envoi avec Resend
      const result = await resend.emails.send(emailConfig);

      if (result.error) {
        throw new Error(result.error.message);
      }

      console.log('Email envoyé avec succès:', result.data?.id);

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

// ============================================
// EXPORTS
// ============================================

module.exports = {
  WorkOrderPDFService,
  WorkOrderEmailService
};
