/**
 * @file lib/services/pdf-common.js
 * @description Module partagé de génération PDF standardisé pour tous les formulaires
 *              - En-tête uniforme : logo + coordonnées (gauche), titre + numéro + date (droite)
 *              - Footer uniforme : contact entreprise + pagination
 *              - Table de matériaux compacte (style AF, référence)
 *              - Section signature réutilisable
 *              - Section totaux (sous-total, TPS, TVQ, total)
 *              - Constantes partagées (couleurs, marges, polices)
 * @version 1.1.0
 * @date 2026-02-09
 * @changelog
 *   1.1.0 - Ajout option margin dans drawMaterialsTable pour en-tête répétable
 *   1.0.0 - Version initiale - Standardisation PDF (BT, AF, Soumission, BL)
 */

// ============================================
// CONSTANTES
// ============================================

const COMPANY = {
  name: 'Services TMT Inc.',
  address: '3195, 42e Rue Nord',
  city: 'Saint-Georges, QC G5Z 0V9',
  phone: '(418) 225-3875',
  email: 'info.servicestmt@gmail.com',
};

// Page Letter (8.5 x 11 pouces) en mm
const PAGE = {
  format: 'letter',
  width: 215.9,
  height: 279.4,
  margin: {
    left: 15,
    right: 15,
    top: 15,
    bottom: 15,
  },
};

// Largeur utile du contenu
const CONTENT_WIDTH = PAGE.width - PAGE.margin.left - PAGE.margin.right; // ~185.9mm

// Logo: 315x142px, ratio 2.218:1 → 40x18mm conserve les proportions
const LOGO = {
  x: PAGE.margin.left,
  y: PAGE.margin.top,
  width: 40,
  height: 18,
};

// Couleurs - tout le texte en noir (demande Martin)
const COLORS = {
  black: [0, 0, 0],
  gray: [100, 100, 100],
  headerBg: [240, 240, 240],
  white: [255, 255, 255],
};

// Tailles de police standardisées
const FONT = {
  title: 16,
  subtitle: 10,
  companyName: 12,
  companyInfo: 9,
  sectionTitle: 10,
  body: 9,
  tableHeader: 8,
  tableBody: 8,
  tableNotes: 7,
  footer: 8,
};

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

/**
 * Vérifie si on a assez d'espace sur la page, sinon ajoute une page
 * @param {jsPDF} doc
 * @param {number} currentY - Position Y actuelle
 * @param {number} needed - Espace nécessaire en mm
 * @returns {number} Position Y (reset si nouvelle page)
 */
function checkPageBreak(doc, currentY, needed) {
  const maxY = PAGE.height - PAGE.margin.bottom - 15; // 15mm pour footer
  if (currentY + needed > maxY) {
    doc.addPage();
    return PAGE.margin.top + 5;
  }
  return currentY;
}

/**
 * Dessine une ligne de séparation horizontale
 * @param {jsPDF} doc
 * @param {number} y - Position Y
 * @param {number} [thickness=0.5] - Épaisseur
 */
function drawSeparatorLine(doc, y, thickness = 0.5) {
  doc.setLineWidth(thickness);
  doc.setDrawColor(...COLORS.black);
  doc.line(PAGE.margin.left, y, PAGE.width - PAGE.margin.right, y);
}

/**
 * Dessine un titre de section (ex: MATÉRIAUX, SIGNATURE, etc.)
 * @param {jsPDF} doc
 * @param {string} title
 * @param {number} yStart
 * @returns {number} Position Y après le titre
 */
function drawSectionTitle(doc, title, yStart) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT.sectionTitle);
  doc.setTextColor(...COLORS.black);
  doc.text(title, PAGE.margin.left, yStart);
  return yStart + 7;
}

/**
 * Formate une date en format Québec (YYYY-MM-DD)
 * @param {string|Date} dateInput
 * @returns {string}
 */
function formatDate(dateInput) {
  if (!dateInput) return 'N/A';

  // Si c'est déjà une date simple YYYY-MM-DD
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return dateInput;
  }

  const date = new Date(dateInput);
  return date.toLocaleDateString('fr-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * Formate un montant en devise canadienne
 * @param {number} amount
 * @param {number} [decimals=2]
 * @returns {string}
 */
function formatCurrency(amount, decimals = 2) {
  return '$' + (parseFloat(amount) || 0).toFixed(decimals);
}

// ============================================
// EN-TÊTE STANDARDISÉ
// ============================================

/**
 * Dessine l'en-tête standardisé sur le document
 *
 * Layout:
 * [LOGO]  Services TMT Inc.              BON DE TRAVAIL
 *         3195, 42e Rue Nord             BT-2026-023
 *         Saint-Georges, QC G5Z 0V9      Date: 2026-01-28
 *         Tél: (418) 225-3875            BA Client: BC-5499
 *         Email: info.servicestmt@gmail.com
 * ─────────────────────────────────────────────────────────
 *
 * @param {jsPDF} doc - Instance jsPDF
 * @param {string|null} logoBase64 - Logo en data URI base64
 * @param {Object} options
 * @param {string} options.title - Titre du document (ex: 'BON DE TRAVAIL')
 * @param {Array<{label?: string, value: string, bold?: boolean}>} options.fields - Champs à droite
 * @param {string} [options.warningLabel] - Label d'avertissement optionnel (ex: '⚠ PRIX JOBÉ')
 * @returns {number} Position Y après l'en-tête
 */
function drawHeader(doc, logoBase64, options) {
  const { title, fields = [], warningLabel } = options;
  const rightX = PAGE.width - PAGE.margin.right;

  // Logo
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', LOGO.x, LOGO.y, LOGO.width, LOGO.height);
    } catch (e) {
      console.error('Erreur affichage logo:', e.message);
    }
  }

  // === Côté gauche : coordonnées entreprise ===
  const infoX = LOGO.x + LOGO.width + 5;
  let yInfo = PAGE.margin.top + 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT.companyName);
  doc.setTextColor(...COLORS.black);
  doc.text(COMPANY.name, infoX, yInfo);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(FONT.companyInfo);
  yInfo += 6;
  doc.text(COMPANY.address, infoX, yInfo);
  yInfo += 4.5;
  doc.text(COMPANY.city, infoX, yInfo);
  yInfo += 4.5;
  doc.text('Tél: ' + COMPANY.phone, infoX, yInfo);
  yInfo += 4.5;
  doc.text('Email: ' + COMPANY.email, infoX, yInfo);

  // === Côté droit : titre + champs ===
  let yRight = PAGE.margin.top + 4;

  // Titre principal
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT.title);
  doc.text(title, rightX, yRight, { align: 'right' });

  // Label d'avertissement optionnel
  if (warningLabel) {
    yRight += 7;
    doc.setFontSize(10);
    doc.setTextColor(200, 100, 0);
    doc.text(warningLabel, rightX, yRight, { align: 'right' });
    doc.setTextColor(...COLORS.black);
  }

  // Champs (numéro, date, références)
  yRight += 8;
  doc.setFontSize(FONT.subtitle);

  for (const field of fields) {
    if (field.bold !== false) {
      doc.setFont('helvetica', 'bold');
    } else {
      doc.setFont('helvetica', 'normal');
    }
    const text = field.label ? `${field.label} ${field.value}` : field.value;
    doc.text(text, rightX, yRight, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    yRight += 5;
  }

  // Ligne de séparation
  const lineY = Math.max(yInfo + 5, yRight + 2);
  drawSeparatorLine(doc, lineY);

  return lineY + 7;
}

// ============================================
// FOOTER STANDARDISÉ
// ============================================

/**
 * Dessine le footer sur TOUTES les pages du document
 * Doit être appelé en dernier, après tout le contenu
 *
 * Footer: "Pour toute question: (418) 225-3875 • Services TMT Inc. • info.servicestmt@gmail.com    Page X / Y"
 *
 * @param {jsPDF} doc - Instance jsPDF
 */
function drawFooter(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  const rightX = PAGE.width - PAGE.margin.right;
  const footerY = PAGE.height - 10;

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(FONT.footer);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.gray);

    // Centre : contact
    const footerText = `Pour toute question: ${COMPANY.phone} \u2022 ${COMPANY.name} \u2022 ${COMPANY.email}`;
    doc.text(footerText, PAGE.width / 2, footerY, { align: 'center' });

    // Droite : pagination
    doc.text(`Page ${i} / ${pageCount}`, rightX, footerY, { align: 'right' });

    // Reset couleur
    doc.setTextColor(...COLORS.black);
  }
}

// ============================================
// TABLE DE MATÉRIAUX (style compact AF)
// ============================================

/**
 * Dessine une table de matériaux/articles compacte avec autoTable
 *
 * @param {jsPDF} doc - Instance jsPDF (avec plugin autoTable chargé)
 * @param {number} yStart - Position Y de départ
 * @param {Object} options
 * @param {string} [options.title] - Titre de section (ex: 'MATÉRIAUX'). null = pas de titre
 * @param {Array<{header: string, dataKey: string}>} options.columns - Définition des colonnes
 * @param {Array<Object>} options.body - Données (tableau d'objets avec clés matchant dataKey)
 * @param {Object} [options.columnStyles] - Styles par colonne {dataKey: {cellWidth, halign}}
 * @param {Function} [options.didParseCell] - Hook autoTable pour personnaliser les cellules
 * @returns {number} Position Y après la table
 */
function drawMaterialsTable(doc, yStart, options) {
  const {
    title = 'MATÉRIAUX',
    columns,
    body,
    columnStyles = {},
    didParseCell,
    margin,
  } = options;

  if (!body || body.length === 0) {
    return yStart;
  }

  // Titre de section
  let startY = yStart;
  if (title) {
    startY = drawSectionTitle(doc, title, yStart);
  }

  // Configuration autoTable - style compact AF
  const tableConfig = {
    startY: startY,
    columns: columns,
    body: body,
    theme: 'grid',
    styles: {
      fontSize: FONT.tableBody,
      cellPadding: { top: 2, right: 3, bottom: 2, left: 3 },
      lineColor: COLORS.black,
      lineWidth: 0.2,
      textColor: COLORS.black,
      font: 'helvetica',
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: COLORS.headerBg,
      textColor: COLORS.black,
      fontStyle: 'bold',
      halign: 'center',
      fontSize: FONT.tableHeader,
    },
    columnStyles: columnStyles,
    margin: margin || { left: PAGE.margin.left, right: PAGE.margin.right },
    showHead: 'everyPage',
    tableWidth: 'auto',
  };

  if (didParseCell) {
    tableConfig.didParseCell = didParseCell;
  }

  doc.autoTable(tableConfig);

  return doc.lastAutoTable.finalY + 5;
}

// ============================================
// SECTION TOTAUX
// ============================================

/**
 * Dessine la section des totaux (sous-total, taxes, total)
 * Aligné à droite, style professionnel
 *
 * @param {jsPDF} doc
 * @param {number} yStart - Position Y de départ
 * @param {Object} totals
 * @param {number} [totals.subtotal] - Sous-total
 * @param {number} [totals.tps] - TPS (5%)
 * @param {number} [totals.tvq] - TVQ (9.975%)
 * @param {number} [totals.shipping] - Frais de livraison
 * @param {number} [totals.total] - Total final
 * @returns {number} Position Y après les totaux
 */
function drawTotals(doc, yStart, totals) {
  const rightX = PAGE.width - PAGE.margin.right;
  const labelX = rightX - 65;
  let y = checkPageBreak(doc, yStart, 40);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(FONT.body);
  doc.setTextColor(...COLORS.black);

  // Sous-total
  if (totals.subtotal !== undefined) {
    doc.text('Sous-total:', labelX, y);
    doc.text(formatCurrency(totals.subtotal), rightX, y, { align: 'right' });
    y += 6;
  }

  // TPS
  if (totals.tps !== undefined && totals.tps > 0) {
    doc.text('TPS (5%):', labelX, y);
    doc.text(formatCurrency(totals.tps), rightX, y, { align: 'right' });
    y += 6;
  }

  // TVQ
  if (totals.tvq !== undefined && totals.tvq > 0) {
    doc.text('TVQ (9.975%):', labelX, y);
    doc.text(formatCurrency(totals.tvq), rightX, y, { align: 'right' });
    y += 6;
  }

  // Livraison
  if (totals.shipping !== undefined && totals.shipping > 0) {
    doc.text('Livraison:', labelX, y);
    doc.text(formatCurrency(totals.shipping), rightX, y, { align: 'right' });
    y += 6;
  }

  // Ligne séparatrice avant le total
  doc.setLineWidth(0.5);
  doc.line(labelX, y, rightX, y);
  y += 6;

  // TOTAL
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL:', labelX, y);
  doc.text(formatCurrency(totals.total), rightX, y, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(FONT.body);

  return y + 10;
}

// ============================================
// SECTION SIGNATURE
// ============================================

/**
 * Dessine la section signature
 *
 * @param {jsPDF} doc
 * @param {number} yStart - Position Y de départ
 * @param {Object} options
 * @param {string} [options.signatureData] - Image signature en base64
 * @param {string} [options.signatureName] - Nom du signataire
 * @param {string} [options.signatureTimestamp] - Date/heure de signature
 * @param {string} [options.legalText] - Texte légal
 * @returns {number} Position Y après la signature
 */
function drawSignatureSection(doc, yStart, options = {}) {
  const {
    signatureData,
    signatureName,
    signatureTimestamp,
    legalText = 'Toute marchandise demeure la propriété de Services TMT Inc. jusqu\'au paiement complet.',
  } = options;

  let y = checkPageBreak(doc, yStart, 50);

  // Titre
  y = drawSectionTitle(doc, 'SIGNATURE', y);

  // Boîte signature
  doc.setDrawColor(...COLORS.black);
  doc.setLineWidth(0.3);
  doc.rect(PAGE.margin.left, y, 85, 25);

  // Image signature si disponible
  if (signatureData) {
    try {
      doc.addImage(signatureData, 'PNG', PAGE.margin.left + 2, y + 2, 81, 21);
    } catch (e) {
      console.error('Erreur signature:', e.message);
    }
  }

  // Texte légal à droite
  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...COLORS.black);
  const legalLines = doc.splitTextToSize(legalText, 85);
  doc.text(legalLines, 110, y + 8);

  // Info signataire en dessous
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  if (signatureName || signatureTimestamp) {
    let signText = 'Signataire';
    if (signatureName) {
      signText += ': ' + signatureName;
    }
    if (signatureTimestamp) {
      signText += ' Date: ' + formatDate(signatureTimestamp);
    }
    doc.text(signText, PAGE.margin.left, y + 30);
  } else {
    doc.text('Client', PAGE.margin.left, y + 30);
  }

  return y + 35;
}

// ============================================
// SECTION DEUX COLONNES
// ============================================

/**
 * Dessine une section en deux colonnes (ex: Client | Heures, Fournisseur | Livrer à)
 *
 * @param {jsPDF} doc
 * @param {number} yStart
 * @param {Object} options
 * @param {Object} options.left - Contenu colonne gauche {title: string, lines: string[]}
 * @param {Object} options.right - Contenu colonne droite {title: string, lines: string[]}
 * @param {boolean} [options.separator=true] - Ajouter ligne séparatrice après
 * @returns {number} Position Y après la section
 */
function drawTwoColumns(doc, yStart, options) {
  const { left, right, separator = true } = options;
  const midX = PAGE.margin.left + CONTENT_WIDTH / 2 + 5;

  let yLeft = yStart;
  let yRight = yStart;

  // Titre gauche
  if (left && left.title) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FONT.sectionTitle);
    doc.text(left.title, PAGE.margin.left, yLeft);
    yLeft += 7;
  }

  // Titre droite
  if (right && right.title) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(FONT.sectionTitle);
    doc.text(right.title, midX, yRight);
    yRight += 7;
  }

  // Contenu gauche
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(FONT.body);
  if (left && left.lines) {
    for (const line of left.lines) {
      if (line.bold) {
        doc.setFont('helvetica', 'bold');
        doc.text(line.text || line, PAGE.margin.left, yLeft);
        doc.setFont('helvetica', 'normal');
      } else {
        doc.text(typeof line === 'string' ? line : line.text, PAGE.margin.left, yLeft);
      }
      yLeft += 5;
    }
  }

  // Contenu droite
  if (right && right.lines) {
    for (const line of right.lines) {
      if (line.bold) {
        doc.setFont('helvetica', 'bold');
        doc.text(line.text || line, midX, yRight);
        doc.setFont('helvetica', 'normal');
      } else {
        doc.text(typeof line === 'string' ? line : line.text, midX, yRight);
      }
      yRight += 5;
    }
  }

  const endY = Math.max(yLeft, yRight) + 3;

  if (separator) {
    drawSeparatorLine(doc, endY);
    return endY + 7;
  }

  return endY;
}

// ============================================
// CONDITIONS GÉNÉRALES (pour Soumission)
// ============================================

/**
 * Dessine les conditions générales
 * @param {jsPDF} doc
 * @param {number} yStart
 * @param {Array<string>} conditions - Liste des conditions
 * @returns {number} Position Y après
 */
function drawConditions(doc, yStart, conditions) {
  let y = checkPageBreak(doc, yStart, 25);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT.body);
  doc.text('CONDITIONS GÉNÉRALES:', PAGE.margin.left, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  for (const condition of conditions) {
    doc.text('\u2022 ' + condition, PAGE.margin.left, y);
    y += 4;
  }

  return y + 3;
}

// ============================================
// CHARGEMENT LOGO (côté client / navigateur)
// ============================================

/**
 * Charge le logo en base64 depuis /logo.png (côté navigateur uniquement)
 * @returns {Promise<string>} Logo en data URI base64
 */
async function loadLogoBase64Client() {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Impossible de charger le logo'));
    img.src = '/logo.png';
  });
}

// ============================================
// ICÔNE PICKUP (pour frais de déplacement BT)
// ============================================

/**
 * Dessine une petite icône de pickup truck noir et blanc
 * Utilisé inline dans les lignes de temps des BT
 * @param {jsPDF} doc
 * @param {number} x - Position X
 * @param {number} y - Position Y (baseline du texte)
 * @returns {number} Largeur utilisée en mm
 */
function drawPickupIcon(doc, x, y) {
  const baseY = y - 1.8;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.15);

  // Benne (rectangle long, partie arrière)
  doc.setFillColor(0, 0, 0);
  doc.rect(x, baseY + 0.6, 2.5, 1.2, 'FD');

  // Cabine (rectangle plus haut, partie avant)
  doc.rect(x + 2.5, baseY, 1.3, 1.8, 'FD');

  // Pare-brise (petit rectangle blanc sur la cabine)
  doc.setFillColor(255, 255, 255);
  doc.rect(x + 2.65, baseY + 0.15, 1, 0.7, 'F');

  // Roues
  doc.setFillColor(0, 0, 0);
  doc.circle(x + 0.7, baseY + 2.1, 0.35, 'F');
  doc.circle(x + 3.1, baseY + 2.1, 0.35, 'F');

  // Reset
  doc.setFillColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);

  return 4.5; // largeur totale en mm
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Constantes
  COMPANY,
  PAGE,
  CONTENT_WIDTH,
  LOGO,
  COLORS,
  FONT,

  // Fonctions de dessin
  drawHeader,
  drawFooter,
  drawMaterialsTable,
  drawTotals,
  drawSignatureSection,
  drawTwoColumns,
  drawConditions,
  drawSectionTitle,
  drawSeparatorLine,
  drawPickupIcon,

  // Utilitaires
  checkPageBreak,
  formatDate,
  formatCurrency,
  loadLogoBase64Client,
};
