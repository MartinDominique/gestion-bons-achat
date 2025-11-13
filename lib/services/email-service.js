// ============================================
// SERVICE EMAIL + PDF - FORMAT SIMPLE NOIR/BLANC AVEC LOGO
// Fichier: lib/services/email-service.js
// ============================================

const { Resend } = require('resend');
const { jsPDF } = require('jspdf');
const fs = require('fs');
const path = require('path');

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

  addHeader(doc, workOrder, showPrixJobeLabel = false) {
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
    
    // ✅ NOUVEAU - Mention Prix Jobé
    if (showPrixJobeLabel) {
      yPos += 8;
      doc.setFontSize(11);
      doc.setTextColor(200, 100, 0); // Orange
      doc.text('⚠ PRIX JOBÉ', 195, yPos, { align: 'right' });
      doc.setTextColor(0, 0, 0); // Reset to black
    }
    
    yPos += 8;
    doc.setFontSize(10);
    doc.text(workOrder.bt_number || 'N/A', 195, yPos, { align: 'right'});
    
    yPos += 6;
    doc.text('DATE: ' + this.formatQuebecDateTime(workOrder.work_date), 195, yPos, { align: 'right' });
    
    yPos += 6;
    // ✅ FIX : Afficher le BA Client avec fallback
    const baNumber = (workOrder.linked_po && workOrder.linked_po.po_number) 
      ? workOrder.linked_po.po_number 
      : (workOrder.linked_po_id || '');
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
        
        const line = `${entry.date}: ${entry.start_time}-${entry.end_time}${pauseStr} = ${totalStr}`;
        
        doc.text(line, 110, yRight);
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
    // ✅ Si hideForClient = true, on skip complètement cette section
    if (hideForClient) {
      return yStart;
    }
    
    if (!workOrder.materials || workOrder.materials.length === 0) {
      return yStart;
    }
    
    // Vérifier s'il y a au moins un matériau avec show_price=true
    const hasAnyPrices = workOrder.materials.some(m => m.show_price === true);
    const shouldShowPrices = hasAnyPrices;
    
    // Titre section
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('MATÉRIAUX', 15, yStart);
    
    yStart += 7;
    
    // Définir colonnes selon si on affiche les prix
    let colWidths;
    let headers;
    
    if (shouldShowPrices) {
      colWidths = [50, 80, 12, 12, 18, 18]; // CODE, DESC, QTÉ, UNITÉ, PRIX, TOTAL
      headers = ['CODE', 'DESCRIPTION', 'QTÉ', 'UNITÉ', 'PRIX', 'TOTAL'];
    } else {
      colWidths = [50, 80, 25, 25]; // CODE, DESC, QTÉ, UNITÉ
      headers = ['CODE', 'DESCRIPTION', 'QTÉ', 'UNITÉ'];
    }
    
    const totalWidth = colWidths.reduce((sum, w) => sum + w, 0);
    const headerHeight = 8;
    
    // Header du tableau
    doc.setFillColor(240, 240, 240);
    doc.rect(15, yStart, totalWidth, headerHeight, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    
    let currentX = 15;
    headers.forEach((header, i) => {
      if (i === 1) {
        // Description alignée à gauche
        doc.text(header, currentX + 2, yStart + 5);
      } else {
        // Autres colonnes centrées
        doc.text(header, currentX + colWidths[i]/2, yStart + 5, { align: 'center' });
      }
      currentX += colWidths[i];
    });
    
    // Ligne sous header
    let currentY = yStart + headerHeight;
    doc.setLineWidth(0.3);
    doc.line(15, currentY, 15 + totalWidth, currentY);
    
    // Contenu du tableau
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    
    let grandTotal = 0;
    
    for (const material of workOrder.materials) {
      // Vérifier débordement de page
      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
        
        // Re-header sur nouvelle page
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('MATÉRIAUX (suite)', 15, currentY);
        currentY += 7;
        
        doc.setFillColor(240, 240, 240);
        doc.rect(15, currentY, totalWidth, headerHeight, 'F');
        
        doc.setFontSize(8);
        let headerX = 15;
        headers.forEach((h, i) => {
          if (i === 1) {
            doc.text(h, headerX + 2, currentY + 5);
          } else {
            doc.text(h, headerX + colWidths[i]/2, currentY + 5, { align: 'center' });
          }
          headerX += colWidths[i];
        });
        
        currentY += headerHeight;
        doc.setLineWidth(0.3);
        doc.line(15, currentY, 15 + totalWidth, currentY);
        doc.setFont('helvetica', 'normal');
      }
      
      const quantity = material.quantity || 0;
      const unit = material.unit || 'UN';
      
      // Code produit
      const productCode = material.code || material.product?.product_id || '';
      
      // Description
      let productDesc = material.description || material.product?.description || 'Article';
      const hasNotes = material.notes && material.notes.trim();

      // ✅ CALCUL HAUTEUR DYNAMIQUE
      const descLines = doc.splitTextToSize(productDesc, colWidths[1] - 4);
      let notesLines = [];
      if (hasNotes) {
        doc.setFontSize(7);
        notesLines = doc.splitTextToSize(`Note: ${material.notes}`, colWidths[1] - 4);
        doc.setFontSize(8);
      }
      
      // Hauteur = nombre de lignes * 4 + padding
      const rowHeight = Math.max(8, (descLines.length * 4) + (notesLines.length * 3.5) + 4);
      
      // Remplir la ligne
      let currentX = 15;
      doc.setFont('helvetica', 'normal');
      
      // CODE
      const codeLines = doc.splitTextToSize(productCode, colWidths[0] - 4);
      doc.text(codeLines[0] || '', currentX + 2, currentY + 4);
      currentX += colWidths[0];
      
      // DESCRIPTION
      doc.text(descLines, currentX + 2, currentY + 4);
      
      // Notes en dessous si présentes
      if (hasNotes) {
        const notesY = currentY + 4 + (descLines.length * 4);
        doc.setFontSize(7);
        
        doc.text(notesLines, currentX + 2, notesY);
        doc.setFontSize(8);
      }
      
      currentX += colWidths[1];
      
      // QTÉ
      doc.text(quantity.toString(), currentX + colWidths[2]/2, currentY + 4, { align: 'center' });
      currentX += colWidths[2];
      
      // UNITÉ
      doc.text(unit, currentX + colWidths[3]/2, currentY + 4, { align: 'center' });
      currentX += colWidths[3];
      
      // PRIX et TOTAL si affichés
      if (shouldShowPrices) {
        // ✅ NOUVEAU : Vérifier si CE matériau spécifique doit afficher son prix
        if (material.show_price === true) {
          const unitPrice = material.product?.selling_price || material.unit_price || 0;
          const lineTotal = quantity * unitPrice;
          grandTotal += lineTotal;
          
          doc.text(unitPrice.toFixed(2), currentX + colWidths[4] - 3, currentY + 4, { align: 'right' });
          currentX += colWidths[4];
          
          doc.text(lineTotal.toFixed(2), currentX + colWidths[5] - 3, currentY + 4, { align: 'right' });
        } else {
          // Laisser les cellules vides si show_price=false
          currentX += colWidths[4]; // Sauter colonne PRIX
          currentX += colWidths[5]; // Sauter colonne TOTAL
        }
      }
      
      // ✅ IMPORTANT: Incrémenter Y APRÈS chaque matériau (dans la boucle!)
      currentY += rowHeight;
    }
    
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
    doc.setTextColor(0, 0, 0);
    const legalText = doc.splitTextToSize('Toute marchandise demeure la propriété de Services TMT Inc. jusqu\'au paiement complet.', 85);
    doc.text(legalText, 110, yStart + 8);
    
    // Info signature en dessous
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    
    if (workOrder.client_signature_name || workOrder.signature_timestamp) {
      let signText = 'Signataire';
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

  generatePDF(workOrder, options = {}) {
    try {
      const { isClientVersion = false, hideDetailsForClient = false } = options;
      
      console.log('Génération PDF format simple noir/blanc...');
      const doc = new jsPDF();
      
      // Header avec label Prix Jobé seulement sur version bureau
      let currentY = this.addHeader(doc, workOrder, !isClientVersion && hideDetailsForClient);
      currentY = this.addClientAndWorkSections(doc, workOrder, currentY, isClientVersion && hideDetailsForClient);
      currentY = this.addMaterialsTable(doc, workOrder, currentY, isClientVersion && hideDetailsForClient);
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
      const COMPANY_EMAIL = process.env.COMPANY_EMAIL;
      const isPrixJobe = workOrder.is_prix_jobe === true;
      
      // Préparer les emails clients
      let emailAddresses = [];
      if (options.clientEmail) {
        emailAddresses = Array.isArray(options.clientEmail) ? options.clientEmail : [options.clientEmail];
      } else if (workOrder.recipient_emails && workOrder.recipient_emails.length > 0) {
        emailAddresses = workOrder.recipient_emails;
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

module.exports = {
  ImprovedWorkOrderPDFService,
  WorkOrderEmailService,
  WorkOrderPDFService: ImprovedWorkOrderPDFService,
  LAYOUT_CONFIG: {},
  COMPANY_CONFIG
};
