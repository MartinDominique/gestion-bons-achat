/**
 * @file components/statistics/SalesReport.js
 * @description Composant rapport de ventes (tableau + bandeau résumé)
 *              - Tableau listant chaque BT, BL, Soumission avec revenus/coûts/marge
 *              - Bandeau résumé des totaux de la sélection filtrée
 *              - Vue responsive: tableau desktop, cartes mobile
 *              - Pagination côté serveur
 *              - Numéros de documents cliquables (SplitView)
 *              - Colonne « Documents »: factures liées (tap → PDF de la facture envoyée),
 *                BA et soumission liés (panneau SplitView); pastilles Estimé / Acomba / Varia
 *              - Revenus ventilés (M.O. / transport / matériaux / forfait) et coûts ventilés
 *                (matériaux / M.O.) en infobulle + sous-ligne; résumé: facturé vs estimé,
 *                soumissions à part (valeur), avertissement produits sans fiche
 * @version 2.0.0
 * @date 2026-11-08
 * @changelog
 *   2.0.0 - Refonte avec /api/statistics v2 (la facture fait foi): pastille « Estimé » quand le
 *           revenu vient du document (non facturé), « Acomba », « Varia »; colonne Documents
 *           (Facture n° → PDF, BA, Soumission); ventilation revenus/coûts; résumé facturé/estimé,
 *           coût M.O. (ou avis « non configuré »), soumissions hors totaux, produits sans fiche
 *   1.2.0 - Pastille « Varia » à côté du N° d'un BT/BL fermé par déduction (aucune facture),
 *           tableau desktop + cartes mobile
 *   1.1.0 - Ajout ReferenceLink sur N° documents (Phase E — Numéros cliquables)
 *   1.0.0 - Version initiale - Phase 1 MVP
 */

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Receipt, Loader2, AlertTriangle } from 'lucide-react';
import { ReferenceLink } from '../SplitView';
import { DEDUCTION_LABEL } from '../../lib/constants/deduction';

const INVOICE_STATUS_LABELS = { draft: 'Brouillon', sent: 'Envoyée', partial: 'Part. payée', paid: 'Payée' };

/**
 * Ouvre le PDF d'une facture (URL signée fraîche; généré à la volée s'il n'existe pas encore).
 * La fenêtre est ouverte AVANT l'appel réseau pour ne pas être bloquée sur tablette.
 */
async function openInvoicePdf(inv, setBusy) {
  const win = window.open('', '_blank');
  try {
    setBusy(true);
    let url = null;
    const res = await fetch(`/api/invoices/${inv.id}/pdf-url`, { cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.success && json.has_pdf) {
      url = json.pdf_url;
    } else {
      // PDF jamais généré (facture non envoyée): génération sans toucher au statut
      const gen = await fetch(`/api/invoices/${inv.id}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf_only: true }),
      });
      const gjson = await gen.json().catch(() => ({}));
      if (!gen.ok || !gjson.success || !gjson.pdf_url) throw new Error(gjson.error || `HTTP ${gen.status}`);
      url = gjson.pdf_url;
    }
    if (win) win.location.href = url; else window.open(url, '_blank');
  } catch (e) {
    if (win) win.close();
    alert(`Impossible d'ouvrir la facture ${inv.invoice_number}: ${e.message}`);
  } finally {
    setBusy(false);
  }
}

/** Pastille cliquable « Fact. 23080 » (ou « Crédit 23081 ») → PDF de la facture */
function InvoiceBadge({ inv }) {
  const [busy, setBusy] = useState(false);
  const status = INVOICE_STATUS_LABELS[inv.status] || inv.status;
  const isDraft = inv.status === 'draft';
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); openInvoicePdf(inv, setBusy); }}
      disabled={busy}
      title={`${inv.is_credit ? 'Note de crédit' : 'Facture'} ${inv.invoice_number} — ${status} — ${formatCurrency(inv.subtotal)} avant taxes\nTap: ouvrir le PDF`}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${
        isDraft
          ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60'
          : inv.is_credit
            ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 hover:bg-rose-200 dark:hover:bg-rose-900/60'
            : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60'
      } disabled:opacity-60`}
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Receipt className="w-3 h-3" />}
      {inv.is_credit ? 'Crédit' : 'Fact.'} {inv.invoice_number}
      {isDraft && <span className="font-normal">(br.)</span>}
    </button>
  );
}

/** Pastille de provenance du revenu: Estimé (non facturé) / Acomba */
function SourceBadge({ doc }) {
  if (doc.type === 'Soum.') return null;
  if (doc.source === 'external') {
    return (
      <span className="inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" title="Facturé dans Acomba — revenu estimé depuis le document (aucune facture dans l'app)">
        Acomba
      </span>
    );
  }
  if (doc.source === 'document') {
    return (
      <span className="inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300" title="Non facturé — revenu estimé depuis le document (heures × taux, déplacements, matériaux)">
        Estimé
      </span>
    );
  }
  return null;
}

/** Liens vers les documents liés: factures (PDF), BA, soumission */
function LinkedDocuments({ doc }) {
  const invoices = doc.invoices || [];
  const po = doc.linkedPo;
  if (invoices.length === 0 && !po) return <span className="text-gray-300 dark:text-gray-600">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {invoices.map((inv) => <InvoiceBadge key={inv.id} inv={inv} />)}
      {po?.po_number && (
        <ReferenceLink type="purchase-order" label={`BA ${po.po_number}`} data={{ editingPO: { id: po.id, po_number: po.po_number } }} variant="blue" />
      )}
      {po?.submission_no && (
        <ReferenceLink type="soumission" label={`Soum. ${po.submission_no}`} data={{ submissionNumber: po.submission_no }} variant="purple" />
      )}
    </span>
  );
}

/** Texte de ventilation du revenu (infobulle + sous-ligne) */
function revenueBreakdownText(doc) {
  const b = doc.revenueBreakdown;
  if (!b || doc.type === 'Soum.') return '';
  const parts = [];
  if (b.labor) parts.push(`M.O. ${formatCurrency(b.labor)}`);
  if (b.transport) parts.push(`Dépl. ${formatCurrency(b.transport)}`);
  if (b.materials) parts.push(`Mat. ${formatCurrency(b.materials)}`);
  if (b.forfait) parts.push(`Forfait/autre ${formatCurrency(b.forfait)}`);
  return parts.join(' · ');
}

function costBreakdownText(doc) {
  const c = doc.costBreakdown;
  if (!c || doc.type === 'Soum.') return '';
  const parts = [`Mat. ${formatCurrency(c.materials)}`];
  if (c.labor) parts.push(`M.O. ${formatCurrency(c.labor)} (${c.hours} h)`);
  if (doc.unknownProducts > 0) parts.push(`${doc.unknownProducts} article${doc.unknownProducts > 1 ? 's' : ''} sans fiche (coûtant inconnu)`);
  return parts.join(' · ');
}

/** Pastille « Varia »: BT/BL fermé par déduction (aucune facture créée) */
function DeductionBadge({ doc }) {
  if (!doc?.isDeduction) return null;
  return (
    <span
      className="inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300"
      title="Fermé par déduction (aucune facture)"
    >
      {DEDUCTION_LABEL}
    </span>
  );
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
  }).format(amount || 0);
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('fr-CA', {
    timeZone: 'America/Toronto',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getTypeBadgeColor(type) {
  switch (type) {
    case 'BT':
      return 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300';
    case 'BL':
      return 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300';
    case 'Soum.':
      return 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300';
    default:
      return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300';
  }
}

function getStatusLabel(status) {
  const labels = {
    draft: 'Brouillon',
    signed: 'Signé',
    pending_send: 'En attente',
    completed: 'Complété',
    sent: 'Envoyé',
    ready_for_signature: 'Prêt signature',
    accepted: 'Acceptée',
    refused: 'Refusée',
  };
  return labels[status] || status;
}

function getDocRefProps(doc) {
  switch (doc.type) {
    case 'BT':
      return { type: 'work-order', variant: 'green', data: { btNumber: doc.documentNumber, workOrderId: doc.id } };
    case 'BL':
      return { type: 'delivery-note', variant: 'orange', data: { blNumber: doc.documentNumber, deliveryNoteId: doc.id } };
    case 'Soum.':
      return { type: 'soumission', variant: 'purple', data: { submissionNumber: doc.documentNumber } };
    default:
      return null;
  }
}

function getMarginColor(marginPercent) {
  if (marginPercent >= 30) return 'text-green-600 dark:text-green-400';
  if (marginPercent >= 15) return 'text-yellow-600 dark:text-yellow-400';
  if (marginPercent >= 0) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

export default function SalesReport({ documents, summary, pagination, onPageChange, loading }) {
  if (!documents && !loading) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        Cliquez sur Rechercher pour afficher les résultats
      </div>
    );
  }

  return (
    <div>
      {/* Bandeau résumé — ventes = BT + BL; soumissions à part */}
      {summary && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Documents de vente</div>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {summary.salesCount ?? (summary.btCount + summary.blCount)}
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400 ml-1">
                  ({summary.btCount} BT, {summary.blCount} BL)
                </span>
              </div>
              {(summary.invoicedCount != null) && (
                <div className="text-[11px] text-gray-500 dark:text-gray-400">
                  {summary.invoicedCount} facturé{summary.invoicedCount > 1 ? 's' : ''} · {summary.estimatedCount} estimé{summary.estimatedCount > 1 ? 's' : ''}
                </div>
              )}
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Revenus (avant taxes)</div>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {formatCurrency(summary.totalRevenue)}
              </div>
              {summary.revenueBreakdown && (
                <div className="text-[11px] text-gray-500 dark:text-gray-400" title="Ventilation: M.O. / déplacements / matériaux / forfait">
                  Facturé {formatCurrency(summary.invoicedRevenue)} · Estimé {formatCurrency(summary.estimatedRevenue)}
                </div>
              )}
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Coûts</div>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {formatCurrency(summary.totalCost)}
              </div>
              {summary.costBreakdown && (
                <div className="text-[11px] text-gray-500 dark:text-gray-400">
                  Mat. {formatCurrency(summary.costBreakdown.materials)}
                  {summary.laborCostIncluded
                    ? <> · M.O. {formatCurrency(summary.costBreakdown.labor)}</>
                    : <span className="text-amber-600 dark:text-amber-400" title="Saisir le coût horaire interne dans Paramètres → Facturation pour inclure le coût de la main d'oeuvre"> · M.O. non configurée</span>}
                </div>
              )}
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Marge</div>
              <div className={`text-lg font-bold ${getMarginColor(summary.marginPercent)}`}>
                {formatCurrency(summary.totalMargin)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Marge moyenne</div>
              <div className={`text-lg font-bold ${getMarginColor(summary.marginPercent)}`}>
                {summary.marginPercent.toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Soumissions (valeur)</div>
              <div className="text-lg font-bold text-purple-700 dark:text-purple-300">
                {formatCurrency(summary.soumValue || 0)}
              </div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">
                {summary.soumCount} soum. — hors totaux
              </div>
            </div>
          </div>
          {summary.revenueBreakdown && (summary.salesCount ?? 0) > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-600 dark:text-gray-400">
              <span>Ventilation des revenus:</span>
              <span>M.O. <strong>{formatCurrency(summary.revenueBreakdown.labor)}</strong></span>
              <span>Déplacements <strong>{formatCurrency(summary.revenueBreakdown.transport)}</strong></span>
              <span>Matériaux <strong>{formatCurrency(summary.revenueBreakdown.materials)}</strong></span>
              <span>Forfait / autre <strong>{formatCurrency(summary.revenueBreakdown.forfait)}</strong></span>
              {summary.costBreakdown?.hours > 0 && <span>Heures <strong>{summary.costBreakdown.hours} h</strong></span>}
            </div>
          )}
          {summary.unknownProductsCount > 0 && (
            <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>
                {summary.unknownProductsCount} ligne{summary.unknownProductsCount > 1 ? 's' : ''} de matériaux sans fiche produit (code introuvable dans l'inventaire):
                coûtant compté à 0 $, les marges de ces documents sont surestimées.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Tableau - Desktop */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Type</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">N° Document</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Date</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Client</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">Description</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Revenus</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Coûts</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Marge $</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Marge %</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Documents</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {loading ? (
              <tr>
                <td colSpan="11" className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  Chargement...
                </td>
              </tr>
            ) : documents && documents.length > 0 ? (
              documents.map((doc, index) => (
                <tr key={`${doc.type}-${doc.id}-${index}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getTypeBadgeColor(doc.type)}`}>
                      {doc.type}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      {(() => {
                        const ref = getDocRefProps(doc);
                        return ref ? (
                          <ReferenceLink type={ref.type} label={doc.documentNumber} data={ref.data} variant={ref.variant} />
                        ) : (
                          <span className="font-mono text-xs text-gray-900 dark:text-gray-100">{doc.documentNumber}</span>
                        );
                      })()}
                      <DeductionBadge doc={doc} />
                      <SourceBadge doc={doc} />
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">{formatDate(doc.date)}</td>
                  <td className="px-3 py-2 text-gray-900 dark:text-gray-100 max-w-[150px] truncate">{doc.clientName}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400 max-w-[200px] truncate hidden lg:table-cell">
                    {doc.description}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${doc.estimated ? 'text-gray-700 dark:text-gray-300 italic' : 'text-gray-900 dark:text-gray-100'}`} title={revenueBreakdownText(doc) || undefined}>
                    {formatCurrency(doc.revenue)}
                    {revenueBreakdownText(doc) && (
                      <div className="text-[10px] font-sans not-italic text-gray-400 dark:text-gray-500 whitespace-nowrap">{revenueBreakdownText(doc)}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-gray-600 dark:text-gray-400" title={costBreakdownText(doc) || undefined}>
                    <span className="inline-flex items-center gap-1">
                      {doc.unknownProducts > 0 && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                      {formatCurrency(doc.cost)}
                    </span>
                  </td>
                  <td className={`px-3 py-2 text-right font-mono font-medium ${getMarginColor(doc.marginPercent)}`}>
                    {formatCurrency(doc.margin)}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono font-medium ${getMarginColor(doc.marginPercent)}`}>
                    {doc.marginPercent.toFixed(1)}%
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <LinkedDocuments doc={doc} />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{getStatusLabel(doc.status)}</span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="11" className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                  Aucun document trouvé pour les filtres sélectionnés
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Vue Cartes - Mobile */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
            Chargement...
          </div>
        ) : documents && documents.length > 0 ? (
          documents.map((doc, index) => (
            <div key={`${doc.type}-${doc.id}-${index}`} className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getTypeBadgeColor(doc.type)}`}>
                    {doc.type}
                  </span>
                  {(() => {
                    const ref = getDocRefProps(doc);
                    return ref ? (
                      <ReferenceLink type={ref.type} label={doc.documentNumber} data={ref.data} variant={ref.variant} />
                    ) : (
                      <span className="font-mono text-xs text-gray-900 dark:text-gray-100">{doc.documentNumber}</span>
                    );
                  })()}
                  <DeductionBadge doc={doc} />
                  <SourceBadge doc={doc} />
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(doc.date)}</span>
              </div>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">{doc.clientName}</div>
              {doc.description && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 line-clamp-1">{doc.description}</div>
              )}
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Revenus</span>
                  <div className="font-mono font-medium text-gray-900 dark:text-gray-100">{formatCurrency(doc.revenue)}</div>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Coûts</span>
                  <div className="font-mono text-gray-600 dark:text-gray-400">{formatCurrency(doc.cost)}</div>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Marge</span>
                  <div className={`font-mono font-medium ${getMarginColor(doc.marginPercent)}`}>{formatCurrency(doc.margin)}</div>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">%</span>
                  <div className={`font-mono font-medium ${getMarginColor(doc.marginPercent)}`}>{doc.marginPercent.toFixed(1)}%</div>
                </div>
              </div>
              {(revenueBreakdownText(doc) || costBreakdownText(doc)) && (
                <div className="mt-2 text-[10px] text-gray-500 dark:text-gray-400 space-y-0.5">
                  {revenueBreakdownText(doc) && <div>Revenus: {revenueBreakdownText(doc)}</div>}
                  {costBreakdownText(doc) && <div>Coûts: {costBreakdownText(doc)}</div>}
                </div>
              )}
              {((doc.invoices && doc.invoices.length > 0) || doc.linkedPo) && (
                <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2 text-xs">
                  <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">Docs:</span>
                  <LinkedDocuments doc={doc} />
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            Aucun document trouvé
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Page {pagination.page + 1} / {pagination.totalPages} ({pagination.total} résultats)
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page === 0}
              className="flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Préc.
            </button>
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages - 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              Suiv.
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
