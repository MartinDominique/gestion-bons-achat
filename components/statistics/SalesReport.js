/**
 * @file components/statistics/SalesReport.js
 * @description Composant rapport de ventes (tableau + bandeau résumé)
 *              - Tableau listant chaque BT, BL, Soumission avec revenus/coûts/marge
 *              - Bandeau résumé des totaux de la sélection filtrée
 *              - Vue responsive: tableau desktop, cartes mobile
 *              - Pagination côté serveur
 *              - Numéros de documents cliquables (SplitView)
 * @version 1.1.0
 * @date 2026-02-27
 * @changelog
 *   1.1.0 - Ajout ReferenceLink sur N° documents (Phase E — Numéros cliquables)
 *   1.0.0 - Version initiale - Phase 1 MVP
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ReferenceLink } from '../SplitView';

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
      {/* Bandeau résumé */}
      {summary && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Documents</div>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {summary.documentCount}
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400 ml-1">
                  ({summary.btCount} BT, {summary.blCount} BL, {summary.soumCount} Soum.)
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Revenus</div>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {formatCurrency(summary.totalRevenue)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Coûts</div>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {formatCurrency(summary.totalCost)}
              </div>
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
          </div>
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
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {loading ? (
              <tr>
                <td colSpan="10" className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
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
                    {(() => {
                      const ref = getDocRefProps(doc);
                      return ref ? (
                        <ReferenceLink type={ref.type} label={doc.documentNumber} data={ref.data} variant={ref.variant} />
                      ) : (
                        <span className="font-mono text-xs text-gray-900 dark:text-gray-100">{doc.documentNumber}</span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">{formatDate(doc.date)}</td>
                  <td className="px-3 py-2 text-gray-900 dark:text-gray-100 max-w-[150px] truncate">{doc.clientName}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400 max-w-[200px] truncate hidden lg:table-cell">
                    {doc.description}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-gray-100">{formatCurrency(doc.revenue)}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-600 dark:text-gray-400">{formatCurrency(doc.cost)}</td>
                  <td className={`px-3 py-2 text-right font-mono font-medium ${getMarginColor(doc.marginPercent)}`}>
                    {formatCurrency(doc.margin)}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono font-medium ${getMarginColor(doc.marginPercent)}`}>
                    {doc.marginPercent.toFixed(1)}%
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{getStatusLabel(doc.status)}</span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="10" className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
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
