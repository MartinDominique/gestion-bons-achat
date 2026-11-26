/**
 * @file components/panel/PanelLayoutPDF.js
 * @description Panneau virtuel — PDF d'une disposition (jsPDF, style des autres PDF de l'app
 *              via lib/services/pdf-common.js). Généré dans le navigateur.
 *              - Page 1 (lettre, portrait): en-tête standard, résumé (fond, fond requis, boîtier
 *                retenu, profondeur, chaleur, installation), alertes restantes, tableau des pièces
 *                du fond (repère, N°, description, L × H × P, source), pièces de porte, listes
 *                hors fond (paroi, terrain, accessoire)
 *              - Page(s) suivante(s) en PAYSAGE, format lettre ou 11 × 17: plan du fond À L'ÉCHELLE
 *                (échelle « ronde » indiquée, ex. 1:4), cotes du fond, repères numérotés qui
 *                renvoient au tableau; puis plan de la porte s'il y a des pièces de porte
 *              Dessin vectoriel (net à l'impression). Tout le texte est en noir; seul le pied
 *              de page est en gris. Les pièces « à placer » (hors du fond) ne sont pas dessinées.
 * @version 1.0.0
 * @date 2026-11-26
 * @changelog
 *   1.0.0 - Version initiale (Panneau virtuel PR 4)
 */
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { drawHeader, drawSectionTitle, loadLogoBase64Client, PAGE, COMPANY } from '../../lib/services/pdf-common';
import { itemBox, clearanceBox, hasClearance, isPiece, bodyWidthOf, hingeEdge, doorOpeningText, isLaidDown } from '../../lib/panel/layout';
import { MM_PER_INCH, PANEL_SOURCES, labelOf } from '../../lib/panel/specs';

const BLACK = [0, 0, 0];
const CONFLICT = [200, 55, 30];
const SCALES = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50];
const TABLOID = [279.4, 431.8]; // 11 × 17 po

const nf = (v, d = 1) => Number(v).toLocaleString('fr-CA', { maximumFractionDigits: d });
const mm = (v) => `${nf(v)} mm`;
const inch = (v) => `${nf(v / MM_PER_INCH, 2)} po`;
const both = (v) => `${mm(v)} (${inch(v)})`;
const dims = (w, h) => `${nf(w)} × ${nf(h)} mm (${nf(w / MM_PER_INCH, 2)} × ${nf(h / MM_PER_INCH, 2)} po)`;
const today = () => new Date().toLocaleDateString('fr-CA', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Toronto' });

let cachedLogo = null;
async function getLogo() {
  if (cachedLogo) return cachedLogo;
  try { cachedLogo = await loadLogoBase64Client(); } catch (e) { cachedLogo = null; }
  return cachedLogo;
}

function footerAllPages(doc) {
  const count = doc.internal.getNumberOfPages();
  for (let i = 1; i <= count; i++) {
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Pour toute question: ${COMPANY.phone} • ${COMPANY.name} • ${COMPANY.email}`, w / 2, h - 8, { align: 'center' });
    doc.text(`Page ${i} / ${count}`, w - 12, h - 8, { align: 'right' });
    doc.setTextColor(...BLACK);
  }
}

function keyValues(doc, y, rows) {
  const x = PAGE.margin.left;
  const valueX = x + 48;
  const maxW = PAGE.width - PAGE.margin.right - valueX;
  doc.setFontSize(9);
  doc.setTextColor(...BLACK);
  rows.forEach(([label, value]) => {
    if (value == null || value === '') return;
    const lines = doc.splitTextToSize(String(value), maxW);
    if (y + lines.length * 4.4 > PAGE.height - 18) { doc.addPage('letter', 'portrait'); y = PAGE.margin.top + 4; }
    doc.setFont('helvetica', 'bold');
    doc.text(label, x, y);
    doc.setFont('helvetica', 'normal');
    doc.text(lines, valueX, y);
    y += lines.length * 4.4 + 0.8;
  });
  return y;
}

function table(doc, y, head, body, columnStyles) {
  doc.autoTable({
    startY: y,
    head: [head],
    body,
    margin: { left: PAGE.margin.left, right: PAGE.margin.right, bottom: 18 },
    styles: { font: 'helvetica', fontSize: 8, textColor: BLACK, cellPadding: 1.4, lineColor: [150, 150, 150], lineWidth: 0.1, overflow: 'linebreak' },
    headStyles: { fillColor: [235, 235, 235], textColor: BLACK, fontStyle: 'bold' },
    columnStyles,
    theme: 'grid',
  });
  return doc.lastAutoTable.finalY + 6;
}

function section(doc, title, y, needed = 24) {
  if (y + needed > PAGE.height - 18) { doc.addPage('letter', 'portrait'); y = PAGE.margin.top + 4; }
  return drawSectionTitle(doc, title, y);
}

/**
 * Dessine un plan à l'échelle sur une page paysage.
 * frame = { w, h } en mm réels; items = pièces à dessiner (repère du cadre);
 * ghost = { items, x, y, w, h } (fond derrière la porte) ou null.
 */
function drawPlanPage(doc, { format, title, subtitle, frame, frameName, items, ghost, report, numbers, showClearances }) {
  doc.addPage(format, 'landscape');
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const M = 12;
  const top = M + 14;
  const availW = pw - 2 * M - 16;
  const availH = ph - top - 30;
  const N = SCALES.find((s) => frame.w / s <= availW && frame.h / s <= availH) || SCALES[SCALES.length - 1];
  const k = 1 / N; // mm papier par mm réel
  const ox = M + 16 + (availW - frame.w * k) / 2;
  const oy = top + 8 + (availH - frame.h * k) / 2;
  const X = (v) => ox + v * k;
  const Y = (v) => oy + v * k;

  // Titre
  doc.setTextColor(...BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(title, M, M + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(subtitle, M, M + 10.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`Échelle 1:${nf(N)}`, pw - M, M + 5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Imprimer à 100 % (« taille réelle ») pour conserver l\'échelle', pw - M, M + 10, { align: 'right' });

  // Cadre (fond ou porte)
  doc.setLineDashPattern([], 0);
  doc.setDrawColor(...BLACK);
  doc.setFillColor(244, 245, 247);
  doc.setLineWidth(0.4);
  doc.rect(X(0), Y(0), frame.w * k, frame.h * k, 'FD');

  // Fond derrière la porte
  if (ghost) {
    doc.setLineWidth(0.2);
    doc.setDrawColor(90, 90, 90);
    doc.setFillColor(252, 252, 252);
    doc.setLineDashPattern([1.5, 1], 0);
    doc.rect(X(ghost.x), Y(ghost.y), ghost.w * k, ghost.h * k, 'FD');
    doc.setLineDashPattern([], 0);
    ghost.items.forEach((g) => {
      const b = itemBox(g);
      doc.setFillColor(g.kind === 'duct' || g.kind === 'rail' ? 232 : 205);
      doc.rect(X(ghost.x + b.x), Y(ghost.y + b.y), b.w * k, b.h * k, 'F');
    });
    doc.setFontSize(6.5);
    doc.setTextColor(...BLACK);
    doc.text('Fond de panneau (derrière la porte)', X(ghost.x) + 1, Y(ghost.y) + 3);
  }

  const order = { duct: 0, rail: 1, free: 2, component: 2 };
  const sorted = [...items].sort((a, b) => order[a.kind] - order[b.kind]);

  // Dégagements
  if (showClearances) {
    doc.setLineWidth(0.15);
    doc.setDrawColor(110, 110, 110);
    doc.setLineDashPattern([1.2, 0.9], 0);
    sorted.filter((i) => isPiece(i) && hasClearance(i)).forEach((i) => {
      const c = clearanceBox(i);
      doc.rect(X(c.x), Y(c.y), c.w * k, c.h * k, 'S');
    });
    doc.setLineDashPattern([], 0);
  }

  sorted.forEach((i) => {
    const b = itemBox(i);
    const x = X(b.x); const y = Y(b.y); const w = b.w * k; const h = b.h * k;
    const bad = report.bad.has(i.id);
    const power = i.cat === 'power';
    doc.setLineWidth(bad ? 0.6 : 0.25);
    doc.setDrawColor(...(bad ? CONFLICT : BLACK));
    if (i.kind === 'duct') doc.setFillColor(222, 224, 228);
    else if (i.kind === 'rail') doc.setFillColor(185, 188, 194);
    else if (power) doc.setFillColor(62, 68, 80);
    else doc.setFillColor(255, 255, 255);

    if (i.shape === 'round') doc.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 'FD');
    else doc.rect(x, y, w, h, 'FD');

    if (i.kind === 'duct') {
      // Hachures légères
      doc.setLineWidth(0.1);
      doc.setDrawColor(150, 150, 150);
      const stepH = 2.2;
      for (let t = stepH; t < w + h; t += stepH) {
        const x1 = Math.min(t, w); const y1 = Math.max(0, t - w);
        const x2 = Math.max(0, t - h); const y2 = Math.min(t, h);
        doc.line(x + x1, y + y1, x + x2, y + y2);
      }
    }

    // Repère + nom
    const n = numbers.get(i.id);
    const name = i.kind === 'rail' || i.kind === 'duct' ? i.label : `${n}  ${i.product_id || i.label}${i.repeated ? ` (${i.qty})` : ''}`;
    const short = n != null ? String(n) : '';
    doc.setTextColor(...(power && isPiece(i) ? [255, 255, 255] : BLACK));
    doc.setFont('helvetica', isPiece(i) ? 'bold' : 'normal');
    const tryText = (txt, size, vertical) => {
      doc.setFontSize(size);
      const tw = doc.getTextWidth(txt);
      const th = size * 0.36;
      if (!vertical && tw <= w - 1 && th <= h - 0.6) { doc.text(txt, x + w / 2, y + h / 2 + th / 2.6, { align: 'center' }); return true; }
      if (vertical && tw <= h - 1 && th <= w - 0.6) { doc.text(txt, x + w / 2 + th / 2.6, y + h / 2 + tw / 2, { angle: 90 }); return true; }
      return false;
    };
    if (!(tryText(name, 7, false) || tryText(name, 5.5, false) || tryText(name, 6, true) || (short && (tryText(short, 6, false) || tryText(short, 4.5, false))))) {
      if (short) {
        // Trop petit: repère juste au-dessus de la pièce
        doc.setTextColor(...BLACK);
        doc.setFontSize(4.5);
        doc.text(short, x + w / 2, y - 0.5, { align: 'center' });
      }
    }
  });
  doc.setTextColor(...BLACK);
  doc.setDrawColor(...BLACK);

  // Cotes du cadre
  doc.setLineWidth(0.2);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const dy = Y(0) - 5;
  doc.line(X(0), dy, X(frame.w), dy);
  doc.line(X(0), dy - 1.5, X(0), dy + 1.5);
  doc.line(X(frame.w), dy - 1.5, X(frame.w), dy + 1.5);
  doc.text(`${frameName} — largeur ${both(frame.w)}`, X(frame.w / 2), dy - 1.2, { align: 'center' });
  const dx = X(0) - 5;
  doc.line(dx, Y(0), dx, Y(frame.h));
  doc.line(dx - 1.5, Y(0), dx + 1.5, Y(0));
  doc.line(dx - 1.5, Y(frame.h), dx + 1.5, Y(frame.h));
  const hText = `hauteur ${both(frame.h)}`;
  doc.text(hText, dx - 1.2, Y(frame.h / 2) + doc.getTextWidth(hText) / 2, { angle: 90 });

  // Légende
  doc.setFontSize(7.5);
  doc.text(
    `Foncé = puissance · Blanc = contrôle · Gris hachuré = goulotte · Gris = rail DIN${showClearances ? ' · Pointillé = dégagement' : ''} · Contour rouge = conflit · Le haut de la page est le haut réel, tel qu'installé.`,
    M, ph - 14
  );
}

/**
 * Génère et télécharge le PDF.
 * @param {Object} p
 * @param {Object} p.layout - ligne panel_layouts (sans items)
 * @param {Array} p.plateItems - pièces, rails et goulottes PLACÉS sur le fond
 * @param {Array} p.doorItems - pièces PLACÉES sur la porte
 * @param {number} p.pendingCount - pièces « à placer » (non dessinées)
 * @param {'letter'|'tabloid'} p.planFormat - format des pages de plan
 */
export async function generatePanelLayoutPDF({
  layout, plateItems, doorItems, pendingCount = 0, plate, door, result, report, doorReport, enclosure, installed, planFormat = 'letter',
}) {
  const doc = new jsPDF({ format: 'letter', unit: 'mm' });
  const logo = await getLogo();

  // ---------- Page 1: en-tête + résumé ----------
  let y = drawHeader(doc, logo, {
    title: 'DISPOSITION DE PANNEAU',
    fields: [
      layout.project_code ? { label: 'Projet:', value: layout.project_code, bold: true } : null,
      layout.client_name ? { label: 'Client:', value: layout.client_name } : null,
      layout.submission_number ? { label: 'Soumission:', value: layout.submission_number } : null,
      { label: 'Date:', value: today() },
      { label: 'Statut:', value: `${layout.status === 'approved' ? 'Approuvé' : 'Brouillon'} (v${layout.version || 1})` },
    ].filter(Boolean),
  });

  doc.setTextColor(...BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  const nameLines = doc.splitTextToSize(layout.name || 'Disposition', PAGE.width - PAGE.margin.left - PAGE.margin.right);
  doc.text(nameLines, PAGE.margin.left, y);
  y += nameLines.length * 5.5 + 2;

  const edge = hingeEdge(layout.orientation, layout.hinge_side === 'right' ? 'right' : 'left');
  y = section(doc, 'RÉSUMÉ', y);
  y = keyValues(doc, y, [
    ['Fond de panneau (L × H):', dims(plate.w, plate.h)],
    ['Fond requis:', result?.need ? `${dims(result.need.w, result.need.h)} — marge ${mm(Number(layout.margin_mm) || 0)}, réserve ${nf(Number(layout.spare_percent) || 0)} %` : 'aucune pièce placée'],
    ['Boîtier retenu:', enclosure ? `${enclosure.product_code} — ${enclosure.description || ''}` : 'aucun'],
    ['Boîtier tel qu\'installé:', installed ? `ext. ${nf(installed.ext.w)} × ${nf(installed.ext.h)} × ${nf(installed.ext.d)} mm (L × H × P), fond ${nf(installed.plate.w)} × ${nf(installed.plate.h)} mm` : null],
    ['Installation:', `${isLaidDown(layout.orientation) ? (layout.orientation === 'side_right' ? 'Couché sur le côté droit' : 'Couché sur le côté gauche') : 'Debout (normale)'}. ${doorOpeningText(edge)}.`],
    ['Profondeur requise:', result ? `${both(result.depth)} = pièce la plus profonde + 25 mm + arrière de la porte (${mm(result.doorRear)})` : null],
    ['Profondeur utile du boîtier:', enclosure && Number(enclosure.usable_depth_mm) > 0 ? both(Number(enclosure.usable_depth_mm)) : null],
    ['Chaleur à évacuer:', result ? `${result.heat.incomplete ? 'au moins ' : ''}${nf(result.heat.watts, 0)} W${result.heat.incomplete ? ` (${result.heat.missing} pièce(s) sans valeur de pertes)` : ''}` : null],
    ['Espace disponible:', (layout.avail_width_mm || layout.avail_height_mm || layout.avail_depth_mm)
      ? `L ${layout.avail_width_mm ? mm(Number(layout.avail_width_mm)) : '—'} × H ${layout.avail_height_mm ? mm(Number(layout.avail_height_mm)) : '—'} × P ${layout.avail_depth_mm ? mm(Number(layout.avail_depth_mm)) : '—'}` : null],
    ['Notes:', layout.notes || null],
  ]);
  y += 3;

  // ---------- Alertes ----------
  const alerts = [
    ...report.messages.map((m) => `Fond: ${m}`),
    ...doorReport.messages.map((m) => `Porte: ${m}`),
    ...(pendingCount > 0 ? [`${pendingCount} pièce(s) pas encore placée(s): absentes du plan et du calcul du boîtier`] : []),
    ...(enclosure && result?.need && !result.suggestions.fits.some((f) => f.enclosure.product_code === enclosure.product_code)
      ? [`Le boîtier retenu (${enclosure.product_code}) ne convient plus au fond requis, à la profondeur ou à l'espace disponible`] : []),
  ];
  y = section(doc, alerts.length ? `ALERTES RESTANTES (${alerts.length})` : 'ALERTES RESTANTES', y, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (alerts.length === 0) {
    doc.text('Aucune alerte.', PAGE.margin.left, y);
    y += 6;
  } else {
    alerts.forEach((a) => {
      const lines = doc.splitTextToSize(`• ${a}`, PAGE.width - PAGE.margin.left - PAGE.margin.right);
      if (y + lines.length * 4.2 > PAGE.height - 18) { doc.addPage('letter', 'portrait'); y = PAGE.margin.top + 4; }
      doc.text(lines, PAGE.margin.left, y);
      y += lines.length * 4.2 + 0.6;
    });
    y += 3;
  }

  // ---------- Tableau des pièces du fond ----------
  const pieces = plateItems.filter(isPiece).sort((a, b) => (Math.round(a.y / 40) - Math.round(b.y / 40)) || a.x - b.x);
  const numbers = new Map(pieces.map((p, k) => [p.id, k + 1]));
  const rails = plateItems.filter((i) => i.kind === 'rail');
  const ducts = plateItems.filter((i) => i.kind === 'duct');
  const len = (i) => { const b = itemBox(i); return Math.max(b.w, b.h); };

  y = section(doc, `PIÈCES SUR LE FOND (${pieces.length})`, y);
  if (pieces.length > 0) {
    y = table(doc, y, ['Rep.', 'N° de pièce', 'Description', 'L × H × P (mm)', 'Source'], pieces.map((p) => [
      numbers.get(p.id),
      p.product_id || '—',
      `${p.description || p.label || ''}${p.repeated ? ` (${p.qty} × ${nf(p.unit_w)} mm)` : ''}${p.product_id && p.label && p.label !== p.product_id && p.description ? ` — ${p.label}` : ''}`,
      `${nf(bodyWidthOf(p))} × ${nf(p.h)} × ${p.d != null ? nf(p.d) : '—'}`,
      p.kind === 'free' ? 'Gabarit' : (labelOf(PANEL_SOURCES, p.source) || '—'),
    ]), { 0: { cellWidth: 11, halign: 'center' }, 1: { cellWidth: 34 }, 3: { cellWidth: 36 }, 4: { cellWidth: 18 } });
  } else {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text('Aucune pièce placée sur le fond.', PAGE.margin.left, y); y += 6;
  }
  if (rails.length || ducts.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    const parts = [];
    if (rails.length) parts.push(`Rails DIN: ${rails.length} (${rails.map((r) => mm(len(r))).join(', ')})`);
    if (ducts.length) parts.push(`Goulottes: ${ducts.length} (${ducts.map((d) => `${nf(len(d))} × ${nf(Math.min(itemBox(d).w, itemBox(d).h))} mm`).join(', ')})`);
    const lines = doc.splitTextToSize(parts.join(' · '), PAGE.width - PAGE.margin.left - PAGE.margin.right);
    if (y + lines.length * 4.2 > PAGE.height - 18) { doc.addPage('letter', 'portrait'); y = PAGE.margin.top + 4; }
    doc.text(lines, PAGE.margin.left, y);
    y += lines.length * 4.2 + 4;
  }

  // ---------- Porte ----------
  const doorNumbers = new Map(doorItems.map((p, k) => [p.id, k + 1]));
  if (doorItems.length > 0) {
    y = section(doc, `PIÈCES DE PORTE (${doorItems.length})`, y);
    y = table(doc, y, ['Rep.', 'N° de pièce', 'Description', 'L × H (mm)', 'Arrière (mm)'], doorItems.map((p) => [
      `P${doorNumbers.get(p.id)}`,
      p.product_id || '—',
      p.description || p.label || '',
      p.shape === 'round' ? `Ø ${nf(p.w)}` : `${nf(p.w)} × ${nf(p.h)}`,
      p.rear != null ? nf(p.rear) : 'à préciser',
    ]), { 0: { cellWidth: 11, halign: 'center' }, 1: { cellWidth: 34 }, 3: { cellWidth: 30 }, 4: { cellWidth: 24 } });
  }

  // ---------- Hors fond (rapport d'import) ----------
  const off = (layout.import_report?.off_plate || []).filter((m) => m.mounting !== 'door');
  if (off.length > 0) {
    y = section(doc, `HORS FOND (${off.length})`, y);
    y = table(doc, y, ['Emplacement', 'N° de pièce', 'Description', 'Qté'], off.map((m) => [
      m.mounting_label || '', m.code || '', m.description || '', nf(m.quantity, 2),
    ]), { 0: { cellWidth: 28 }, 1: { cellWidth: 34 }, 3: { cellWidth: 14, halign: 'right' } });
  }

  // ---------- Plans à l'échelle ----------
  const format = planFormat === 'tabloid' ? TABLOID : 'letter';
  const head = [layout.project_code, layout.name].filter(Boolean).join(' — ');
  drawPlanPage(doc, {
    format,
    title: `PLAN DU FOND DE PANNEAU${layout.project_code ? ` — ${layout.project_code}` : ''}`,
    subtitle: `${head} · fond ${dims(plate.w, plate.h)}${enclosure ? ` · boîtier ${enclosure.product_code}` : ''}`,
    frame: plate, frameName: 'Fond', items: plateItems, ghost: null, report, numbers, showClearances: true,
  });
  if (doorItems.length > 0) {
    const doorNum = new Map(doorItems.map((p) => [p.id, `P${doorNumbers.get(p.id)}`]));
    drawPlanPage(doc, {
      format,
      title: `PLAN DE LA PORTE${layout.project_code ? ` — ${layout.project_code}` : ''}`,
      subtitle: `${head} · porte ${dims(door.w, door.h)}${door.estimated ? ' (estimée: aucun boîtier retenu)' : ''} · vue de face`,
      frame: { w: door.w, h: door.h }, frameName: 'Porte', items: doorItems,
      ghost: { items: plateItems, x: door.plateX, y: door.plateY, w: plate.w, h: plate.h },
      report: doorReport, numbers: doorNum, showClearances: false,
    });
  }

  footerAllPages(doc);

  const slug = (layout.project_code || layout.name || 'disposition').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'disposition';
  doc.save(`Panneau-${slug}.pdf`);
}
