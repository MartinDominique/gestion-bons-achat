/**
 * @file components/statistics/FinancialReport.js
 * @description Affichage des rapports financiers basés sur les factures
 *              - 3 vues: Par mois, Par client, En attente
 *              - Bandeau résumé global (facturé, payé, en attente)
 *              - Responsive: tableaux desktop, cartes mobile
 *              - Numéros de référence cliquables (SplitView)
 * @version 1.1.0
 * @date 2026-02-27
 * @changelog
 *   1.1.0 - Ajout ReferenceLink sur N° référence BT/BL (Phase E — Numéros cliquables)
 *   1.0.0 - Version initiale (Phase D — Statistiques Phase 2)
 */

import { AlertTriangle } from 'lucide-react';
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

function getSourceRefProps(sourceNumber) {
  if (!sourceNumber) return null;
  if (sourceNumber.startsWith('BT-')) {
    return { type: 'work-order', variant: 'green', data: { btNumber: sourceNumber } };
  }
  if (sourceNumber.startsWith('BL-')) {
    return { type: 'delivery-note', variant: 'orange', data: { blNumber: sourceNumber } };
  }
  return null;
}

// ============================================
// BANDEAU RÉSUMÉ
// ============================================

function SummaryBanner({ summary }) {
  if (!summary) return null;

  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Factures</div>
          <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {summary.totalInvoices}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Total facturé</div>
          <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {formatCurrency(summary.totalAmount)}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Payé</div>
          <div className="text-lg font-bold text-green-600 dark:text-green-400">
            {formatCurrency(summary.totalPaid)}
            <span className="text-xs font-normal ml-1">({summary.countPaid})</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">En attente</div>
          <div className="text-lg font-bold text-orange-600 dark:text-orange-400">
            {formatCurrency(summary.totalOutstanding)}
            <span className="text-xs font-normal ml-1">({summary.countSent})</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Brouillon</div>
          <div className="text-lg font-bold text-gray-500 dark:text-gray-400">
            {formatCurrency(summary.totalDraft)}
            <span className="text-xs font-normal ml-1">({summary.countDraft})</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Moy. / facture</div>
          <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {formatCurrency(summary.avgInvoice)}
          </div>
        </div>
      </div>

      {/* Ventilation matériaux / temps / transport */}
      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Matériaux</div>
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {formatCurrency(summary.totalMaterials)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Main d'œuvre</div>
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {formatCurrency(summary.totalLabor)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Transport</div>
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {formatCurrency(summary.totalTransport)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// VUE PAR MOIS
// ============================================

function ByMonthView({ byMonth }) {
  if (!byMonth || byMonth.length === 0) {
    return <div className="text-center py-8 text-gray-500 dark:text-gray-400">Aucune facture pour cette période</div>;
  }

  return (
    <div>
      {/* Desktop */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Mois</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">Fact.</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Matériaux</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">M.O.</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Transp.</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Sous-total</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">TPS</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">TVQ</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Total</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">Payé</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">En att.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {byMonth.map((m) => (
              <tr key={m.month} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{m.label}</td>
                <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400">{m.count}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-600 dark:text-gray-400">{formatCurrency(m.materials)}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-600 dark:text-gray-400">{formatCurrency(m.labor)}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-600 dark:text-gray-400">{formatCurrency(m.transport)}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-gray-100">{formatCurrency(m.subtotal)}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-500 dark:text-gray-400 hidden lg:table-cell">{formatCurrency(m.tps)}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-500 dark:text-gray-400 hidden lg:table-cell">{formatCurrency(m.tvq)}</td>
                <td className="px-3 py-2 text-right font-mono font-medium text-gray-900 dark:text-gray-100">{formatCurrency(m.total)}</td>
                <td className="px-3 py-2 text-center">
                  <span className="text-green-600 dark:text-green-400 font-medium">{m.paidCount}</span>
                </td>
                <td className="px-3 py-2 text-center">
                  {m.outstandingCount > 0 ? (
                    <span className="text-orange-600 dark:text-orange-400 font-medium">{m.outstandingCount}</span>
                  ) : (
                    <span className="text-gray-400">0</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="md:hidden space-y-3">
        {byMonth.map((m) => (
          <div key={m.month} className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-gray-900 dark:text-gray-100">{m.label}</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">{m.count} fact.</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs mb-2">
              <div>
                <span className="text-gray-500 dark:text-gray-400">Matériaux</span>
                <div className="font-mono text-gray-900 dark:text-gray-100">{formatCurrency(m.materials)}</div>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">M.O.</span>
                <div className="font-mono text-gray-900 dark:text-gray-100">{formatCurrency(m.labor)}</div>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Transp.</span>
                <div className="font-mono text-gray-900 dark:text-gray-100">{formatCurrency(m.transport)}</div>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
              <div className="font-mono font-bold text-gray-900 dark:text-gray-100">{formatCurrency(m.total)}</div>
              <div className="flex gap-3 text-xs">
                <span className="text-green-600 dark:text-green-400">{m.paidCount} payé</span>
                {m.outstandingCount > 0 && (
                  <span className="text-orange-600 dark:text-orange-400">{m.outstandingCount} en att.</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// VUE PAR CLIENT
// ============================================

function ByClientView({ byClient }) {
  if (!byClient || byClient.length === 0) {
    return <div className="text-center py-8 text-gray-500 dark:text-gray-400">Aucune facture pour cette période</div>;
  }

  return (
    <div>
      {/* Desktop */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Client</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">Fact.</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Matériaux</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">M.O.</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Transp.</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Total facturé</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Payé</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">En attente</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">% Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {byClient.map((c) => (
              <tr key={c.clientId || c.clientName} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 max-w-[200px] truncate">{c.clientName}</td>
                <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400">{c.count}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-600 dark:text-gray-400">{formatCurrency(c.materials)}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-600 dark:text-gray-400">{formatCurrency(c.labor)}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-600 dark:text-gray-400">{formatCurrency(c.transport)}</td>
                <td className="px-3 py-2 text-right font-mono font-medium text-gray-900 dark:text-gray-100">{formatCurrency(c.total)}</td>
                <td className="px-3 py-2 text-right font-mono text-green-600 dark:text-green-400">{formatCurrency(c.paidAmount)}</td>
                <td className="px-3 py-2 text-right font-mono text-orange-600 dark:text-orange-400">
                  {c.outstandingAmount > 0 ? formatCurrency(c.outstandingAmount) : '-'}
                </td>
                <td className="px-3 py-2 text-right font-mono text-gray-600 dark:text-gray-400">{c.percentOfTotal.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="md:hidden space-y-3">
        {byClient.map((c) => (
          <div key={c.clientId || c.clientName} className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-gray-900 dark:text-gray-100 truncate mr-2">{c.clientName}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">{c.count} fact. — {c.percentOfTotal.toFixed(1)}%</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs mb-2">
              <div>
                <span className="text-gray-500 dark:text-gray-400">Matériaux</span>
                <div className="font-mono text-gray-900 dark:text-gray-100">{formatCurrency(c.materials)}</div>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">M.O.</span>
                <div className="font-mono text-gray-900 dark:text-gray-100">{formatCurrency(c.labor)}</div>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Transp.</span>
                <div className="font-mono text-gray-900 dark:text-gray-100">{formatCurrency(c.transport)}</div>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
              <div className="font-mono font-bold text-gray-900 dark:text-gray-100">{formatCurrency(c.total)}</div>
              <div className="flex gap-3 text-xs">
                <span className="text-green-600 dark:text-green-400">{formatCurrency(c.paidAmount)} payé</span>
                {c.outstandingAmount > 0 && (
                  <span className="text-orange-600 dark:text-orange-400">{formatCurrency(c.outstandingAmount)} att.</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// VUE EN ATTENTE
// ============================================

function OutstandingView({ outstanding }) {
  if (!outstanding || outstanding.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        Aucune facture en attente de paiement
      </div>
    );
  }

  return (
    <div>
      {/* Desktop */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">N° Facture</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Date</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Client</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Réf.</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Total</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Conditions</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">Échéance</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">Jours</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {outstanding.map((inv) => (
              <tr key={inv.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${inv.isOverdue ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                <td className="px-3 py-2 font-mono text-xs font-medium text-gray-900 dark:text-gray-100">{inv.invoiceNumber}</td>
                <td className="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">{formatDate(inv.invoiceDate)}</td>
                <td className="px-3 py-2 text-gray-900 dark:text-gray-100 max-w-[150px] truncate">{inv.clientName}</td>
                <td className="px-3 py-2">
                  {(() => {
                    const ref = getSourceRefProps(inv.sourceNumber);
                    return ref ? (
                      <ReferenceLink type={ref.type} label={inv.sourceNumber} data={ref.data} variant={ref.variant} />
                    ) : (
                      <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{inv.sourceNumber}</span>
                    );
                  })()}
                </td>
                <td className="px-3 py-2 text-right font-mono font-medium text-gray-900 dark:text-gray-100">{formatCurrency(inv.total)}</td>
                <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">{inv.paymentTerms || '-'}</td>
                <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {inv.dueDate ? formatDate(inv.dueDate) : '-'}
                </td>
                <td className="px-3 py-2 text-center">
                  {inv.isOverdue ? (
                    <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium text-xs">
                      <AlertTriangle className="w-3 h-3" />
                      {Math.abs(inv.daysUntilDue)}j retard
                    </span>
                  ) : inv.daysUntilDue !== null ? (
                    <span className="text-xs text-gray-600 dark:text-gray-400">{inv.daysUntilDue}j</span>
                  ) : (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="md:hidden space-y-3">
        {outstanding.map((inv) => (
          <div
            key={inv.id}
            className={`rounded-lg border p-3 ${
              inv.isOverdue
                ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-xs font-medium text-gray-900 dark:text-gray-100">{inv.invoiceNumber}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(inv.invoiceDate)}</span>
            </div>
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">{inv.clientName}</div>
            <div className="flex items-center justify-between">
              <div className="font-mono font-bold text-gray-900 dark:text-gray-100">{formatCurrency(inv.total)}</div>
              <div className="text-xs">
                {inv.isOverdue ? (
                  <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
                    <AlertTriangle className="w-3 h-3" />
                    {Math.abs(inv.daysUntilDue)}j retard
                  </span>
                ) : inv.daysUntilDue !== null ? (
                  <span className="text-gray-600 dark:text-gray-400">{inv.daysUntilDue}j avant échéance</span>
                ) : (
                  <span className="text-gray-500 dark:text-gray-400">{inv.paymentTerms || ''}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// COMPOSANT PRINCIPAL
// ============================================

export default function FinancialReport({ data, loading, view }) {
  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
        Chargement...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        Cliquez sur Rechercher pour afficher les résultats
      </div>
    );
  }

  return (
    <div>
      <SummaryBanner summary={data.summary} />

      {view === 'byMonth' && <ByMonthView byMonth={data.byMonth} />}
      {view === 'byClient' && <ByClientView byClient={data.byClient} />}
      {view === 'outstanding' && <OutstandingView outstanding={data.outstanding} />}
    </div>
  );
}
