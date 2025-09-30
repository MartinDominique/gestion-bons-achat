// ============================================
// CONFIGURATION RESEND AVEC DOMAINE PERSONNALISÉ
// Modification du fichier: lib/services/email-service.js
// ============================================

const { Resend } = require('resend');

// Configuration avec domaine personnalisé
const resend = new Resend(process.env.RESEND_API_KEY);

// Variables d'environnement
const COMPANY_NAME = process.env.COMPANY_NAME || 'Services TMT Inc.';
const COMPANY_EMAIL = process.env.COMPANY_EMAIL || 'info.servicestmt@gmail.com'; // Pour CC
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@votredomaine.com'; // Domaine vérifié
const COMPANY_ADDRESS = process.env.COMPANY_ADDRESS || '3195, 42e Rue Nord';
const COMPANY_CITY = process.env.COMPANY_CITY || 'Saint-Georges, QC G5Z 0V9';
const COMPANY_PHONE = process.env.COMPANY_PHONE || '(418) 225-3875';

// ============================================
// SERVICE D'ENVOI EMAIL MODIFIÉ
// ============================================

class WorkOrderEmailService {
  constructor() {
    this.pdfService = new WorkOrderPDFService();
  }

  async sendWorkOrderEmail(workOrder, options = {}) {
    try {
      // Email du client
      const clientEmail = options.clientEmail || workOrder.client.email;
      
      if (!clientEmail) {
        throw new Error('Aucune adresse email disponible pour le client');
      }

      // Générer le PDF
      const pdfBuffer = this.pdfService.generatePDF(workOrder);
      
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
      
      // CONFIGURATION ENVOI AVEC DOMAINE PERSONNALISÉ
      const emailConfig = {
        from: `${COMPANY_NAME} <${RESEND_FROM_EMAIL}>`, // Utilise le domaine vérifié
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

      // Ajouter Reply-To pour que les réponses aillent à votre vraie adresse
      if (COMPANY_EMAIL && COMPANY_EMAIL !== RESEND_FROM_EMAIL) {
        emailConfig.reply_to = COMPANY_EMAIL;
      }

      console.log('📧 Configuration email:', {
        from: emailConfig.from,
        to: emailConfig.to,
        cc: emailConfig.cc,
        replyTo: emailConfig.reply_to
      });

      // Envoi avec Resend
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
}

module.exports = {
  WorkOrderEmailService
};
