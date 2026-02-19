/**
 * @file lib/services/email-service.js
 * @description Service d'envoi email + génération PDF pour les Bons de Travail (BT)
 *              et les Bons de Livraison (BL)
 *              Utilise pdf-common.js pour l'en-tête, footer et table standardisés
 * @version 3.0.0
 * @date 2026-02-12
 * @changelog
 *   3.0.0 - Ajout support Bon de Livraison (BL): DeliveryNotePDFService + DeliveryNoteEmailService
 *   2.0.0 - Refactoring: utilisation de pdf-common.js pour standardisation PDF
 *   1.5.0 - Corrections code dupliqué, gestion erreurs, sync champs
 *   1.0.0 - Version initiale
 */

const { Resend } = require('resend');
const { jsPDF } = require('jspdf');
require('jspdf-autotable');
const fs = require('fs');
const path = require('path');
const pdfCommon = require('./pdf-common');

// === Helpers: arrondi au quart d'heure supérieur ===
function toQuarterHourUp(startHHMM, endHHMM, pauseMinutes = 0) {
  const parseHHMM = (t) => {
    const [h, m] = String(t || '').split(':').map((n) => parseInt(n, 10) || 0);
    return h * 60 + m;
  };
  
  const s = parseHHMM(startHHMM);
  const e = parseHHMM(endHHMM);
  let netMinutes = Math.max(0, e - s - (parseInt(pauseMinutes, 10) || 0));
  
  if (netMinutes < 60) {
    return 1.0;
  }
  
  const hours = Math.floor(netMinutes / 60);
  const minutes = netMinutes % 60;
  
  let roundedMinutes;
  
  if (minutes <= 6) {
    roundedMinutes = 0;
  } else if (minutes <= 21) {
    roundedMinutes = 15;
  } else if (minutes <= 36) {
    roundedMinutes = 30;
  } else if (minutes <= 51) {
    roundedMinutes = 45;
  } else {
    return hours + 1;
  }
  
  const totalMinutes = (hours * 60) + roundedMinutes;
  return Math.round((totalMinutes / 60) * 100) / 100;
};

// Corriger une décimale (ex. 1.8) vers quart d'heure ↑ (=> 1.75)
function coerceDecimalToQuarterHourUp(dec) {
  if (dec == null) return 0;
  const minutes = Math.ceil((Number(dec) || 0) * 60 / 15) * 15;
  return Math.round((minutes / 60) * 100) / 100;
}


// Configuration
const resend = new Resend(process.env.RESEND_API_KEY);

const COMPANY_CONFIG = {
  ...pdfCommon.COMPANY,
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
    // ⭐ FIX: Si c'est juste une date (YYYY-MM-DD), ne pas la convertir en UTC
    if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      // C'est une date simple sans heure - parser manuellement
      const [year, month, day] = dateString.split('-');
      return `${year}-${month}-${day}`;
    }

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

  addHeader(doc, workOrder, showPrixJobeLabel = false) {
    const baNumber = (workOrder.linked_po && workOrder.linked_po.po_number)
      ? workOrder.linked_po.po_number
      : (workOrder.linked_po_id || '');

    return pdfCommon.drawHeader(doc, LOGO_BASE64, {
      title: 'BON DE TRAVAIL',
      warningLabel: showPrixJobeLabel ? '⚠ PRIX JOBÉ' : null,
      fields: [
        { value: workOrder.bt_number || 'N/A' },
        { label: 'Date:', value: pdfCommon.formatDate(workOrder.work_date) },
        { label: 'BA Client:', value: baNumber },
      ],
    });
  }

  addClientAndWorkSections(doc, workOrder, yStart, hideForClient = false) {
    // INFORMATIONS CLIENT (gauche)
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('INFORMATIONS CLIENT', 15, yStart);
    
    // HEURES TRAVAILLÉES (droite) - seulement si pas hideForClient
    if (!hideForClient) {
      doc.text('HEURES TRAVAILLÉES', 110, yStart);
    }
    
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
    
    if (workOrder.client.email_admin) {
      doc.setFont('helvetica', 'bold');
      doc.text('Admin: ' + workOrder.client.email_admin, 15, yLeft);
      doc.setFont('helvetica', 'normal');
      yLeft += 5;
    }
    
    // ✅ Afficher les heures seulement si pas hideForClient
    if (!hideForClient && workOrder.time_entries && workOrder.time_entries.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      yRight += 5;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      
      workOrder.time_entries.forEach((entry, index) => {
        if (yRight > 260) {
          doc.addPage();
          yRight = 20;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.text('HEURES TRAVAILLÉES (suite)', 15, yRight);
          yRight += 5;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
        }

        const h = Math.floor(entry.total_hours || 0);
        const m = Math.round(((entry.total_hours || 0) - h) * 60);
        const totalStr = m > 0 ? `${h}h${m}min` : `${h}h`;
        const pauseStr = entry.pause_minutes > 0 ? ` (-${entry.pause_minutes}min)` : '';

        const retourStr = entry.include_travel && workOrder.client?.travel_minutes > 0
          ? ` (Ret: ${workOrder.client.travel_minutes}min)`
          : '';

        // Mention surcharge si applicable
        const surchargeLabels = {
          saturday: 'Samedi',
          sunday: 'Dimanche',
          evening: 'Soir',
          holiday: 'Jour férié'
        };
        let surchargeStr = '';
        if (entry.surcharge_type && surchargeLabels[entry.surcharge_type]) {
          const label = surchargeLabels[entry.surcharge_type];
          if (entry.actual_hours != null && entry.actual_hours !== entry.total_hours) {
            surchargeStr = ` [${label} - min. appliqué]`;
          } else {
            surchargeStr = ` [${label}]`;
          }
        }

        const line = `${entry.date}: ${entry.start_time}-${entry.end_time}${pauseStr}${retourStr} = ${totalStr}${surchargeStr}`;

        doc.text(line, 110, yRight);

        // Icône pickup pour frais de déplacement (remplace le texte trop long)
        if (entry.include_transport_fee) {
          const textWidth = doc.getTextWidth(line);
          pdfCommon.drawPickupIcon(doc, 110 + textWidth + 1.5, yRight);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
        }
        yRight += 4;
      });
      
      yRight += 2;
      if (yRight > 260) { 
        doc.addPage();
        yRight = 20;
      }
      
      const grandTotal = workOrder.time_entries.reduce((sum, e) => sum + (e.total_hours || 0), 0);
      const totalH = Math.floor(grandTotal);
      const totalM = Math.round((grandTotal - totalH) * 60);
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(`TOTAL: ${totalH}h${totalM > 0 ? ' ' + totalM + 'min' : ''}`, 110, yRight);
      yRight += 7;
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
      const lines = doc.splitTextToSize(workOrder.work_description, 180);
      doc.text(lines, 15, yDesc);
      yDesc += lines.length * 5 + 5;
    }
    
    return yDesc;
  }

  addMaterialsTable(doc, workOrder, yStart, hideForClient = false) {
    if (hideForClient) return yStart;
    if (!workOrder.materials || workOrder.materials.length === 0) return yStart;

    const hasAnyPrices = workOrder.materials.some(m => m.show_price === true);

    // Colonnes de base
    const columns = [
      { header: 'CODE', dataKey: 'code' },
      { header: 'DESCRIPTION', dataKey: 'description' },
      { header: 'QTÉ', dataKey: 'quantity' },
      { header: 'UNITÉ', dataKey: 'unit' },
    ];

    const columnStyles = {
      code: { cellWidth: 30, halign: 'left' },
      quantity: { cellWidth: 15, halign: 'center' },
      unit: { cellWidth: 15, halign: 'center' },
    };

    // Ajouter colonnes prix si nécessaire
    if (hasAnyPrices) {
      columns.push({ header: 'PRIX', dataKey: 'unitPrice' });
      columns.push({ header: 'TOTAL', dataKey: 'total' });
      columnStyles.unitPrice = { cellWidth: 22, halign: 'right' };
      columnStyles.total = { cellWidth: 25, halign: 'right' };
    }

    // Préparer les données
    let grandTotal = 0;
    const body = workOrder.materials.map(m => {
      const qty = m.quantity || 0;
      const unitPrice = m.product?.selling_price || m.unit_price || 0;
      const lineTotal = qty * unitPrice;
      if (m.show_price) grandTotal += lineTotal;

      const desc = m.description || m.product?.description || 'Article';
      const notes = (m.notes && m.notes.trim()) ? '\nNote: ' + m.notes : '';

      return {
        code: m.code || m.product?.product_id || '',
        description: desc + notes,
        quantity: qty.toString(),
        unit: m.unit || 'UN',
        unitPrice: (hasAnyPrices && m.show_price) ? pdfCommon.formatCurrency(unitPrice) : '',
        total: (hasAnyPrices && m.show_price) ? pdfCommon.formatCurrency(lineTotal) : '',
      };
    });

    let afterTableY = pdfCommon.drawMaterialsTable(doc, yStart, {
      title: 'MATÉRIAUX',
      columns,
      body,
      columnStyles,
    });

    // Grand total matériaux si des prix affichés
    if (hasAnyPrices && grandTotal > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      const rightX = pdfCommon.PAGE.width - pdfCommon.PAGE.margin.right;
      doc.text('Total matériaux: ' + pdfCommon.formatCurrency(grandTotal), rightX, afterTableY, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      afterTableY += 7;
    }

    return afterTableY;
  }

  addSignatureSection(doc, workOrder, yStart) {
    return pdfCommon.drawSignatureSection(doc, yStart, {
      signatureData: workOrder.signature_data,
      signatureName: workOrder.client_signature_name,
      signatureTimestamp: workOrder.signature_timestamp,
    });
  }

  generatePDF(workOrder, options = {}) {
    try {
      const { isClientVersion = false, hideDetailsForClient = false } = options;

      console.log('Génération PDF BT format standardisé...');
      const doc = new jsPDF({ format: 'letter' });

      // Header standardisé avec label Prix Jobé seulement sur version bureau
      let currentY = this.addHeader(doc, workOrder, !isClientVersion && hideDetailsForClient);
      currentY = this.addClientAndWorkSections(doc, workOrder, currentY, isClientVersion && hideDetailsForClient);
      currentY = this.addMaterialsTable(doc, workOrder, currentY, isClientVersion && hideDetailsForClient);
      this.addSignatureSection(doc, workOrder, currentY);

      // Footer standardisé sur toutes les pages
      pdfCommon.drawFooter(doc);

      console.log('PDF BT généré avec succès - Format standardisé');
      return Buffer.from(doc.output('arraybuffer'));
    } catch (error) {
      console.error('Erreur génération PDF BT:', error);
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
      const COMPANY_EMAIL = process.env.COMPANY_EMAIL;
      const isPrixJobe = workOrder.is_prix_jobe === true;
      
      // Préparer les emails clients
      let emailAddresses = [];
      if (options.clientEmail) {
        emailAddresses = Array.isArray(options.clientEmail) ? options.clientEmail : [options.clientEmail];
      } else if (workOrder.recipient_emails && workOrder.recipient_emails.length > 0) {
        emailAddresses = workOrder.recipient_emails.filter(e => !e.startsWith('__fields:'));
      } else if (workOrder.client && workOrder.client.email) {
        emailAddresses = [workOrder.client.email];
      }
      
      emailAddresses = emailAddresses.filter(email => email && email.trim() && email.includes('@'));
      
      if (emailAddresses.length === 0) {
        throw new Error('Aucune adresse email disponible pour le client');
      }

      const htmlContent = options.customMessage || this.getEmailTemplate(workOrder);
      
      // ✅ NOUVEAU - Si Prix Jobé: Envoyer 2 emails séparés
      if (isPrixJobe && COMPANY_EMAIL) {
        console.log('⚠️ Prix Jobé détecté - Envoi de 2 emails séparés');
        
        // ========================================
        // EMAIL 1: Client + Bureau en CC - PDF SIMPLIFIÉ
        // ========================================
        const pdfClientBuffer = this.pdfService.generatePDF(workOrder, {
          isClientVersion: true,
          hideDetailsForClient: true
        });
        
        const emailClientConfig = {
          from: COMPANY_CONFIG.name + ' <' + COMPANY_CONFIG.resendFrom + '>',
          to: emailAddresses,
          cc: [COMPANY_EMAIL],
          subject: 'Bon de Travail ' + workOrder.bt_number + ' - ' + workOrder.client.name,
          html: htmlContent,
          attachments: [
            {
              filename: workOrder.bt_number + '.pdf',
              content: pdfClientBuffer,
              contentType: 'application/pdf'
            }
          ]
        };
        
        // Ajouter CC additionnels si fournis
        if (options.ccEmails && options.ccEmails.length > 0) {
          emailClientConfig.cc = [...emailClientConfig.cc, ...options.ccEmails];
        }

        console.log('📧 Email 1 (Client + Bureau) - PDF simplifié');
        console.log('   To:', emailAddresses.join(', '));
        console.log('   CC:', emailClientConfig.cc.join(', '));

        const resultClient = await resend.emails.send(emailClientConfig);

        if (resultClient.error) {
          throw new Error('Email client: ' + resultClient.error.message);
        }

        // ========================================
        // EMAIL 2: Bureau SEULEMENT - PDF COMPLET
        // ========================================
        const pdfBureauBuffer = this.pdfService.generatePDF(workOrder, {
          isClientVersion: false,
          hideDetailsForClient: true
        });
        
        let htmlBureau = '<!DOCTYPE html><html><head><meta charset="utf-8">';
        htmlBureau += '<style>body { font-family: Arial, sans-serif; }</style>';
        htmlBureau += '</head><body>';
        htmlBureau += '<h2 style="color: #d97706;">⚠️ PRIX JOBÉ - Version Complète Bureau</h2>';
        htmlBureau += '<h3>Bon de Travail ' + workOrder.bt_number + '</h3>';
        htmlBureau += '<p><strong>Client:</strong> ' + workOrder.client.name + '</p>';
        htmlBureau += '<p><strong>Email Admin:</strong> ' + (workOrder.client.email_admin || 'Non défini') + '</p>';
        htmlBureau += '<p>Ce PDF contient les heures et matériaux complets.</p>';
        htmlBureau += '<p style="color: #dc2626;"><strong>Note:</strong> Le client a reçu une version simplifiée sans ces détails.</p>';
        htmlBureau += '<hr>';
        htmlBureau += '<p style="font-size: 0.9em; color: #6b7280;">Ce message est destiné uniquement au bureau de ' + COMPANY_CONFIG.name + '.</p>';
        htmlBureau += '</body></html>';
        
        const emailBureauConfig = {
          from: COMPANY_CONFIG.name + ' <' + COMPANY_CONFIG.resendFrom + '>',
          to: [COMPANY_EMAIL],
          subject: '⚠️ PRIX JOBÉ - BT ' + workOrder.bt_number + ' COMPLET (Bureau)',
          html: htmlBureau,
          attachments: [
            {
              filename: workOrder.bt_number + '_COMPLET.pdf',
              content: pdfBureauBuffer,
              contentType: 'application/pdf'
            }
          ]
        };

        console.log('📧 Email 2 (Bureau seulement) - PDF complet');
        console.log('   To:', COMPANY_EMAIL);

        const resultBureau = await resend.emails.send(emailBureauConfig);

        if (resultBureau.error) {
          console.error('⚠️ Erreur email bureau (non-bloquant):', resultBureau.error.message);
          // Ne pas bloquer si l'email bureau échoue
        }

        console.log('✅ 2 emails envoyés avec succès (Prix Jobé)');

        return {
          success: true,
          messageId: resultClient.data?.id,
          messageIdBureau: resultBureau.data?.id,
          sentTo: emailAddresses,
          isPrixJobe: true,
          pdfBase64: `data:application/pdf;base64,${pdfClientBuffer.toString('base64')}`
        };

      } else {
        // ========================================
        // EMAIL NORMAL: 1 seul email avec PDF standard
        // ========================================
        const pdfBuffer = this.pdfService.generatePDF(workOrder, {
          isClientVersion: true,
          hideDetailsForClient: false
        });
        
        const emailConfig = {
          from: COMPANY_CONFIG.name + ' <' + COMPANY_CONFIG.resendFrom + '>',
          to: emailAddresses,
          subject: 'Bon de Travail ' + workOrder.bt_number + ' - ' + workOrder.client.name,
          html: htmlContent,
          attachments: [
            {
              filename: workOrder.bt_number + '.pdf',
              content: pdfBuffer,
              contentType: 'application/pdf'
            }
          ]
        };

        // CC au bureau
        if (COMPANY_EMAIL) {
          emailConfig.cc = [COMPANY_EMAIL];
          if (options.ccEmails && options.ccEmails.length > 0) {
            emailConfig.cc = [...emailConfig.cc, ...options.ccEmails];
          }
        } else if (options.ccEmails && options.ccEmails.length > 0) {
          emailConfig.cc = options.ccEmails;
        }

        console.log('📧 Envoi email standard à:', emailAddresses.join(', '));

        const result = await resend.emails.send(emailConfig);

        if (result.error) {
          throw new Error(result.error.message);
        }

        return {
          success: true,
          messageId: result.data?.id,
          sentTo: emailAddresses,
          pdfBase64: `data:application/pdf;base64,${pdfBuffer.toString('base64')}`
        };
      }

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
// SERVICE PDF - BON DE LIVRAISON (BL)
// ============================================

class DeliveryNotePDFService {

  formatQuebecDateTime(dateString, includeTime = false) {
    if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return dateString;
    }

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

  addHeader(doc, deliveryNote, showPrixJobeLabel = false) {
    const baNumber = (deliveryNote.linked_po && deliveryNote.linked_po.po_number)
      ? deliveryNote.linked_po.po_number
      : (deliveryNote.linked_po_id || '');

    return pdfCommon.drawHeader(doc, LOGO_BASE64, {
      title: 'BON DE LIVRAISON',
      warningLabel: showPrixJobeLabel ? '⚠ PRIX JOBÉ' : null,
      fields: [
        { value: deliveryNote.bl_number || 'N/A' },
        { label: 'Date:', value: pdfCommon.formatDate(deliveryNote.delivery_date) },
        { label: 'BA Client:', value: baNumber },
      ],
    });
  }

  addClientSection(doc, deliveryNote, yStart) {
    // INFORMATIONS CLIENT
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('INFORMATIONS CLIENT', 15, yStart);

    let yLeft = yStart + 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    if (deliveryNote.client?.name) {
      doc.text(deliveryNote.client.name, 15, yLeft);
      yLeft += 5;
    }

    if (deliveryNote.client?.address) {
      doc.text(deliveryNote.client.address, 15, yLeft);
      yLeft += 5;
    }

    if (deliveryNote.client?.phone) {
      doc.text(deliveryNote.client.phone, 15, yLeft);
      yLeft += 5;
    }

    if (deliveryNote.client?.email_admin) {
      doc.setFont('helvetica', 'bold');
      doc.text('Admin: ' + deliveryNote.client.email_admin, 15, yLeft);
      doc.setFont('helvetica', 'normal');
      yLeft += 5;
    }

    // DESCRIPTION DE LA LIVRAISON (à droite)
    let yRight = yStart;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('DESCRIPTION LIVRAISON', 110, yRight);
    yRight += 7;

    if (deliveryNote.delivery_description) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const lines = doc.splitTextToSize(deliveryNote.delivery_description, 85);
      doc.text(lines, 110, yRight);
      yRight += lines.length * 5 + 5;
    }

    // Ligne de séparation
    const maxY = Math.max(yLeft, yRight) + 5;
    doc.setLineWidth(0.3);
    doc.line(15, maxY, 195, maxY);

    return maxY + 7;
  }

  addMaterialsTable(doc, deliveryNote, yStart, hideForClient = false) {
    if (hideForClient) return yStart;
    if (!deliveryNote.materials || deliveryNote.materials.length === 0) return yStart;

    const hasAnyPrices = deliveryNote.materials.some(m => m.show_price === true);

    const columns = [
      { header: 'CODE', dataKey: 'code' },
      { header: 'DESCRIPTION', dataKey: 'description' },
      { header: 'QTÉ', dataKey: 'quantity' },
      { header: 'UNITÉ', dataKey: 'unit' },
    ];

    const columnStyles = {
      code: { cellWidth: 30, halign: 'left' },
      quantity: { cellWidth: 15, halign: 'center' },
      unit: { cellWidth: 15, halign: 'center' },
    };

    if (hasAnyPrices) {
      columns.push({ header: 'PRIX', dataKey: 'unitPrice' });
      columns.push({ header: 'TOTAL', dataKey: 'total' });
      columnStyles.unitPrice = { cellWidth: 22, halign: 'right' };
      columnStyles.total = { cellWidth: 25, halign: 'right' };
    }

    let grandTotal = 0;
    const body = deliveryNote.materials.map(m => {
      const qty = m.quantity || 0;
      const unitPrice = m.product?.selling_price || m.unit_price || 0;
      const lineTotal = qty * unitPrice;
      if (m.show_price) grandTotal += lineTotal;

      const desc = m.description || m.product?.description || 'Article';
      const notes = (m.notes && m.notes.trim()) ? '\nNote: ' + m.notes : '';

      return {
        code: m.code || m.product_code || m.product?.product_id || '',
        description: desc + notes,
        quantity: qty.toString(),
        unit: m.unit || 'UN',
        unitPrice: (hasAnyPrices && m.show_price) ? pdfCommon.formatCurrency(unitPrice) : '',
        total: (hasAnyPrices && m.show_price) ? pdfCommon.formatCurrency(lineTotal) : '',
      };
    });

    let afterTableY = pdfCommon.drawMaterialsTable(doc, yStart, {
      title: 'MATÉRIAUX LIVRÉS',
      columns,
      body,
      columnStyles,
    });

    if (hasAnyPrices && grandTotal > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      const rightX = pdfCommon.PAGE.width - pdfCommon.PAGE.margin.right;
      doc.text('Total matériaux: ' + pdfCommon.formatCurrency(grandTotal), rightX, afterTableY, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      afterTableY += 7;
    }

    return afterTableY;
  }

  addSignatureSection(doc, deliveryNote, yStart) {
    return pdfCommon.drawSignatureSection(doc, yStart, {
      signatureData: deliveryNote.signature_data,
      signatureName: deliveryNote.client_signature_name,
      signatureTimestamp: deliveryNote.signature_timestamp,
    });
  }

  generatePDF(deliveryNote, options = {}) {
    try {
      const { isClientVersion = false, hideDetailsForClient = false } = options;

      console.log('Génération PDF BL format standardisé...');
      const doc = new jsPDF({ format: 'letter' });

      let currentY = this.addHeader(doc, deliveryNote, !isClientVersion && hideDetailsForClient);
      currentY = this.addClientSection(doc, deliveryNote, currentY);
      currentY = this.addMaterialsTable(doc, deliveryNote, currentY, isClientVersion && hideDetailsForClient);
      this.addSignatureSection(doc, deliveryNote, currentY);

      pdfCommon.drawFooter(doc);

      console.log('PDF BL généré avec succès');
      return Buffer.from(doc.output('arraybuffer'));
    } catch (error) {
      console.error('Erreur génération PDF BL:', error);
      throw new Error('Erreur génération PDF BL: ' + error.message);
    }
  }
}

// ============================================
// SERVICE EMAIL - BON DE LIVRAISON (BL)
// ============================================

class DeliveryNoteEmailService {
  constructor() {
    this.pdfService = new DeliveryNotePDFService();
  }

  getEmailTemplate(deliveryNote) {
    let html = '<!DOCTYPE html><html><head><meta charset="utf-8">';
    html += '<style>body { font-family: Arial, sans-serif; }</style>';
    html += '</head><body>';
    html += '<h2>' + COMPANY_CONFIG.name + '</h2>';
    html += '<h2>Bon de Livraison ' + deliveryNote.bl_number + '</h2>';
    html += '<p>Bonjour ' + (deliveryNote.client?.name || deliveryNote.client_name || '') + ',</p>';
    html += '<p>Veuillez trouver en pièce jointe le bon de livraison.</p>';
    html += '<p>Merci de votre confiance.</p>';
    html += '<p>' + COMPANY_CONFIG.name + '<br>' + COMPANY_CONFIG.address + '<br>' + COMPANY_CONFIG.city + '</p>';
    html += '</body></html>';

    return html;
  }

  async sendDeliveryNoteEmail(deliveryNote, options = {}) {
    try {
      const COMPANY_EMAIL = process.env.COMPANY_EMAIL;
      const isPrixJobe = deliveryNote.is_prix_jobe === true;

      // Préparer les emails
      let emailAddresses = [];
      if (options.clientEmail) {
        emailAddresses = Array.isArray(options.clientEmail) ? options.clientEmail : [options.clientEmail];
      } else if (deliveryNote.recipient_emails && deliveryNote.recipient_emails.length > 0) {
        // Filtrer metadata __fields: (utilisé pour restauration checkboxes côté form)
        emailAddresses = deliveryNote.recipient_emails.filter(e => !e.startsWith('__fields:'));
      } else if (deliveryNote.client && deliveryNote.client.email) {
        emailAddresses = [deliveryNote.client.email];
      }

      emailAddresses = emailAddresses.filter(email => email && email.trim() && email.includes('@'));

      if (emailAddresses.length === 0) {
        throw new Error('Aucune adresse email disponible pour le client');
      }

      const htmlContent = options.customMessage || this.getEmailTemplate(deliveryNote);

      if (isPrixJobe && COMPANY_EMAIL) {
        console.log('Prix Jobé BL - Envoi de 2 emails séparés');

        // EMAIL 1: Client - PDF simplifié
        const pdfClientBuffer = this.pdfService.generatePDF(deliveryNote, {
          isClientVersion: true,
          hideDetailsForClient: true
        });

        const emailClientConfig = {
          from: COMPANY_CONFIG.name + ' <' + COMPANY_CONFIG.resendFrom + '>',
          to: emailAddresses,
          cc: [COMPANY_EMAIL],
          subject: 'Bon de Livraison ' + deliveryNote.bl_number + ' - ' + (deliveryNote.client?.name || deliveryNote.client_name || ''),
          html: htmlContent,
          attachments: [{
            filename: deliveryNote.bl_number + '.pdf',
            content: pdfClientBuffer,
            contentType: 'application/pdf'
          }]
        };

        if (options.ccEmails && options.ccEmails.length > 0) {
          emailClientConfig.cc = [...emailClientConfig.cc, ...options.ccEmails];
        }

        const resultClient = await resend.emails.send(emailClientConfig);

        if (resultClient.error) {
          throw new Error('Email client: ' + resultClient.error.message);
        }

        // EMAIL 2: Bureau - PDF complet
        const pdfBureauBuffer = this.pdfService.generatePDF(deliveryNote, {
          isClientVersion: false,
          hideDetailsForClient: true
        });

        let htmlBureau = '<!DOCTYPE html><html><head><meta charset="utf-8">';
        htmlBureau += '<style>body { font-family: Arial, sans-serif; }</style>';
        htmlBureau += '</head><body>';
        htmlBureau += '<h2 style="color: #d97706;">⚠️ PRIX JOBÉ - Version Complète Bureau</h2>';
        htmlBureau += '<h3>Bon de Livraison ' + deliveryNote.bl_number + '</h3>';
        htmlBureau += '<p><strong>Client:</strong> ' + (deliveryNote.client?.name || deliveryNote.client_name || '') + '</p>';
        htmlBureau += '<p>Ce PDF contient les matériaux et prix complets.</p>';
        htmlBureau += '<p style="color: #dc2626;"><strong>Note:</strong> Le client a reçu une version simplifiée.</p>';
        htmlBureau += '</body></html>';

        const resultBureau = await resend.emails.send({
          from: COMPANY_CONFIG.name + ' <' + COMPANY_CONFIG.resendFrom + '>',
          to: [COMPANY_EMAIL],
          subject: '⚠️ PRIX JOBÉ - BL ' + deliveryNote.bl_number + ' COMPLET (Bureau)',
          html: htmlBureau,
          attachments: [{
            filename: deliveryNote.bl_number + '_COMPLET.pdf',
            content: pdfBureauBuffer,
            contentType: 'application/pdf'
          }]
        });

        if (resultBureau.error) {
          console.error('Erreur email bureau BL:', resultBureau.error.message);
        }

        return {
          success: true,
          messageId: resultClient.data?.id,
          sentTo: emailAddresses,
          isPrixJobe: true,
          pdfBase64: `data:application/pdf;base64,${pdfClientBuffer.toString('base64')}`
        };

      } else {
        // EMAIL NORMAL
        const pdfBuffer = this.pdfService.generatePDF(deliveryNote, {
          isClientVersion: true,
          hideDetailsForClient: false
        });

        const emailConfig = {
          from: COMPANY_CONFIG.name + ' <' + COMPANY_CONFIG.resendFrom + '>',
          to: emailAddresses,
          subject: 'Bon de Livraison ' + deliveryNote.bl_number + ' - ' + (deliveryNote.client?.name || deliveryNote.client_name || ''),
          html: htmlContent,
          attachments: [{
            filename: deliveryNote.bl_number + '.pdf',
            content: pdfBuffer,
            contentType: 'application/pdf'
          }]
        };

        if (COMPANY_EMAIL) {
          emailConfig.cc = [COMPANY_EMAIL];
          if (options.ccEmails && options.ccEmails.length > 0) {
            emailConfig.cc = [...emailConfig.cc, ...options.ccEmails];
          }
        } else if (options.ccEmails && options.ccEmails.length > 0) {
          emailConfig.cc = options.ccEmails;
        }

        const result = await resend.emails.send(emailConfig);

        if (result.error) {
          throw new Error(result.error.message);
        }

        return {
          success: true,
          messageId: result.data?.id,
          sentTo: emailAddresses,
          pdfBase64: `data:application/pdf;base64,${pdfBuffer.toString('base64')}`
        };
      }

    } catch (error) {
      console.error('Erreur envoi email BL:', error);
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
  DeliveryNotePDFService,
  DeliveryNoteEmailService,
  LAYOUT_CONFIG: {},
  COMPANY_CONFIG
};
