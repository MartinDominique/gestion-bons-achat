/**
 * @file components/invoices/InvoiceReferencePanel.js
 * @description Panneau latéral en lecture seule pour consulter, pendant la révision
 *              d'une facture, le BA client (purchase_orders + client_po_items) ou la
 *              soumission (submissions) liée au BT/BL source.
 *              - But: vérifier les prix de vente déjà donnés au client.
 *              - Met l'accent sur le prix de vente unitaire et le total par article.
 *              - Lecture seule, responsive, dark mode.
 *              - Utilisé en côte-à-côte (desktop) ou en superposition (tablette/mobile)
 *                à l'intérieur de la modale InvoiceEditor.
 * @version 1.0.0
 * @date 2026-06-04
 * @changelog
 *   1.0.0 - Version initiale (consultation BA / Soumission depuis l'éditeur de facture)
 */

'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { X, FileText, ShoppingCart, Calendar, User, DollarSign, AlertCircle } from 'lucide-react';

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(amount || 0);
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('fr-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
};

/**
 * @param {object} props
 * @param {'ba'|'soumission'} props.type - Type de référence à afficher
 * @param {number|string} [props.baId] - id du BA (purchase_orders)
 * @param {string} [props.baNumber] - N° du BA (po_number)
 * @param {string} [props.submissionNumber] - N° de soumission (submission_number)
 * @param {function} props.onClose - Fermeture du panneau
 */
export default function InvoiceReferencePanel({ type, baId, baNumber, submissionNumber, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [header, setHeader] = useState(null); // { number, clientName, status, description, date, total }
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const loadBA = async () => {
      // En-tête du BA
      let po = null;
      if (baId) {
        const { data } = await supabase
          .from('purchase_orders')
          .select('*')
          .eq('id', baId)
          .maybeSingle();
        po = data;
      }
      if (!po && baNumber) {
        const { data } = await supabase
          .from('purchase_orders')
          .select('*')
          .eq('po_number', baNumber)
          .maybeSingle();
        po = data;
      }
      if (cancelled) return;
      if (!po) {
        setError('Bon d\'achat client introuvable.');
        return;
      }

      // Articles du BA
      const { data: poItems } = await supabase
        .from('client_po_items')
        .select('product_id, description, quantity, unit, selling_price')
        .eq('purchase_order_id', po.id);

      if (cancelled) return;

      setHeader({
        number: po.po_number,
        clientName: po.client_name,
        status: po.status,
        description: po.description || (po.submission_no ? `Soumission liée: ${po.submission_no}` : ''),
        date: po.po_date || po.date || po.created_at,
        total: po.total_amount ?? po.amount ?? null,
      });
      setItems((poItems || []).map((it) => ({
        code: it.product_id,
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice: it.selling_price,
      })));
    };

    const loadSoumission = async () => {
      const { data: soum } = await supabase
        .from('submissions')
        .select('*')
        .eq('submission_number', submissionNumber)
        .maybeSingle();

      if (cancelled) return;
      if (!soum) {
        setError('Soumission introuvable.');
        return;
      }

      const rawItems = soum.items || [];
      setHeader({
        number: soum.submission_number,
        clientName: soum.client_name,
        status: soum.status,
        description: soum.description || '',
        date: soum.created_at,
        total: soum.amount ?? null,
      });
      setItems(rawItems.map((it) => ({
        code: it.product_id || it.code,
        description: it.description || it.name,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice: it.selling_price ?? it.price ?? it.unit_price ?? 0,
      })));
    };

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        if (type === 'ba') {
          await loadBA();
        } else {
          await loadSoumission();
        }
      } catch (err) {
        if (!cancelled) setError('Erreur de chargement: ' + (err.message || 'inconnue'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [type, baId, baNumber, submissionNumber]);

  const isBA = type === 'ba';
  const accent = isBA
    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
    : 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800';
  const accentText = isBA ? 'text-blue-700 dark:text-blue-300' : 'text-purple-700 dark:text-purple-300';
  const Icon = isBA ? ShoppingCart : FileText;
  const title = isBA ? `Bon d'achat client` : `Soumission`;

  const statusLabel = {
    in_progress: 'En cours', partial: 'Partiel', completed: 'Complété',
    draft: 'Brouillon', sent: 'Envoyée', accepted: 'Acceptée', rejected: 'Refusée',
  }[header?.status] || header?.status || '';

  return (
    <div className="flex flex-col h-full max-h-full">
      {/* Header du panneau */}
      <div className={`flex items-center justify-between p-3 border-b ${accent} flex-shrink-0`}>
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`w-5 h-5 flex-shrink-0 ${accentText}`} />
          <div className="min-w-0">
            <h3 className={`text-sm font-bold ${accentText} truncate`}>{title}</h3>
            {header?.number && (
              <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{header.number}</p>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-white/60 dark:hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
          aria-label="Fermer la consultation"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Corps */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading && (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {!loading && !error && header && (
          <>
            {/* Infos générales */}
            <div className="space-y-1.5 text-sm">
              {header.clientName && (
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="truncate">{header.clientName}</span>
                </div>
              )}
              {statusLabel && (
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${accent} ${accentText}`}>
                    {statusLabel}
                  </span>
                </div>
              )}
              {header.date && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 text-xs">
                  <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  {formatDate(header.date)}
                </div>
              )}
              {header.description && (
                <p className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{header.description}</p>
              )}
            </div>

            {/* Tableau articles avec prix de vente */}
            {items.length > 0 ? (
              <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2 border-b dark:border-gray-700 flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                    Articles ({items.length})
                  </h4>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Prix de vente</span>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {items.map((it, idx) => {
                    const qty = Number(it.quantity) || 0;
                    const price = Number(it.unitPrice) || 0;
                    return (
                      <div key={idx} className="px-3 py-2">
                        <div className="flex justify-between gap-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words flex-1">
                            {it.description || it.code || 'Article'}
                          </span>
                          <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 flex-shrink-0">
                            {formatCurrency(qty * price)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center mt-0.5">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {it.code ? `${it.code} • ` : ''}{qty} {it.unit || 'UN'}
                          </span>
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                            {formatCurrency(price)} / {it.unit || 'UN'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">Aucun article détaillé disponible.</p>
            )}

            {/* Total */}
            {header.total != null && (
              <div className="flex items-center justify-between border-t dark:border-gray-700 pt-2 text-sm">
                <span className="flex items-center gap-1.5 font-medium text-gray-700 dark:text-gray-300">
                  <DollarSign className="w-4 h-4 text-emerald-500" /> Montant
                </span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(header.total)}</span>
              </div>
            )}

            <p className="text-[11px] text-gray-400 dark:text-gray-500 italic pt-1">
              Consultation en lecture seule — référence des prix donnés au client.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
