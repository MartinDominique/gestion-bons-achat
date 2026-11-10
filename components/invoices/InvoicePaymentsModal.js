/**
 * @file components/invoices/InvoicePaymentsModal.js
 * @description Fenêtre « Paiements » d'une facture (onglet Factures du module Facturation).
 *              Répond au besoin: voir les données de paiement d'une facture PAYÉE, qui ne
 *              figure plus dans l'état de compte (relevé « open item »).
 *              - En-tête: N° facture, client, total / crédité / solde, statut
 *              - Par paiement: date, montant, mode (Chèque, Virement, Interac…), N° de
 *                chèque/virement (référence), escompte, note
 *              - « Ce paiement règle aussi »: les autres factures réglées par le même
 *                paiement (saisie multi-factures de l'état de compte), avec le total du
 *                paiement global
 *              - Suppression d'un paiement (confirmation) → statut de la facture recalculé
 *              - Lien vers l'état de compte du client; portail z-[80]; touch targets 44 px
 * @version 1.0.0
 * @date 2026-11-10
 * @changelog
 *   1.0.0 - Version initiale (détail des paiements par facture)
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Wallet, CheckCircle, Trash2, Loader2, AlertCircle, Receipt, StickyNote, Hash } from 'lucide-react';
import { paymentMethodLabel } from '../../lib/constants/paymentMethods';

const MONTHS = ['', 'jan.', 'fév.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export function fmtPaymentDate(dateStr) {
  if (!dateStr) return '-';
  const [y, m, d] = String(dateStr).slice(0, 10).split('-');
  if (!y || !m || !d) return dateStr;
  return `${parseInt(d, 10)} ${MONTHS[parseInt(m, 10)] || m} ${y}`;
}

const fmtCurrency = (n) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(Number(n) || 0);

/**
 * Résumé court d'un paiement pour la liste des factures:
 *   « 5 fév. 2026 · Chèque #1234 »
 */
export function paymentSummary(p) {
  if (!p) return '';
  const parts = [fmtPaymentDate(p.payment_date), paymentMethodLabel(p.method)];
  const ref = (p.reference || '').trim();
  if (ref) parts.push(`#${ref}`);
  return parts.filter(Boolean).join(' · ');
}

/**
 * Props:
 *  - open, onClose()
 *  - invoice: { id, invoice_number, client_id, client_name } (ligne de la liste)
 *  - onOpenStatement(clientId): ouvre l'état de compte du client (optionnel)
 *  - onChanged(): appelé après la suppression d'un paiement (recharger la liste)
 */
export default function InvoicePaymentsModal({ open, invoice, onClose, onOpenStatement, onChanged }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const invoiceId = invoice?.id;

  const load = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/payments`);
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setData(json.data);
      } else {
        setError(json?.error || 'Erreur de chargement des paiements');
      }
    } catch (e) {
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    if (open) {
      setData(null);
      load();
    }
  }, [open, load]);

  // Échap pour fermer
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const deletePayment = async (p) => {
    const others = p.siblings?.length
      ? `\n\nAttention: seul le paiement de CETTE facture est supprimé. Les ${p.siblings.length} autre(s) facture(s) réglée(s) par le même paiement ne sont pas touchées.`
      : '';
    const ok = window.confirm(
      `Supprimer le paiement du ${fmtPaymentDate(p.payment_date)} (${fmtCurrency(p.amount + p.discount_applied)}) sur la facture ${data?.invoice?.invoice_number || ''} ?\n\nLa facture redeviendra due pour ce montant.${others}`
    );
    if (!ok) return;
    setBusyId(p.id);
    setError(null);
    try {
      const res = await fetch(`/api/invoice-payments/${p.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.error || 'Suppression impossible');
      } else {
        await load();
        onChanged?.();
      }
    } catch (e) {
      setError('Erreur de connexion au serveur');
    } finally {
      setBusyId(null);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  const inv = data?.invoice;
  const payments = data?.payments || [];
  const statusLabel = { draft: 'Brouillon', sent: 'Envoyée', partial: 'Partielle', paid: 'Payée' };
  const statusCls = {
    paid: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    partial: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[80] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { e.stopPropagation(); onClose?.(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Paiements de la facture"
    >
      <div
        className="bg-white dark:bg-gray-900 w-full sm:max-w-xl max-h-[92vh] sm:max-h-[85vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b dark:border-gray-700">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              Paiements — Facture <span className="font-mono">{inv?.invoice_number || invoice?.invoice_number}</span>
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
              {inv?.client_name || invoice?.client_name}
              {inv?.source_number && <span className="text-gray-400 dark:text-gray-500"> · {inv.source_number}</span>}
            </p>
          </div>
          <button
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-200 flex-shrink-0"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="p-8 text-center">
              <Loader2 className="w-7 h-7 animate-spin text-emerald-600 mx-auto" />
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Chargement des paiements…</p>
            </div>
          )}

          {error && !loading && (
            <div className="m-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {inv && !loading && (
            <>
              {/* Sommaire */}
              <div className="px-4 pt-4">
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                    <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Total facture</div>
                    <div className="text-base font-bold text-gray-900 dark:text-gray-100">{fmtCurrency(inv.total)}</div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">du {fmtPaymentDate(inv.invoice_date)}</div>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                    <div className="text-[11px] uppercase tracking-wide text-green-700 dark:text-green-400">Crédité</div>
                    <div className="text-base font-bold text-green-700 dark:text-green-300">{fmtCurrency(inv.credited)}</div>
                    <div className="text-[11px] text-green-700/80 dark:text-green-400/80">encaissé + escompte</div>
                  </div>
                  <div className={`rounded-lg p-3 ${Math.abs(inv.balance) < 0.005 ? 'bg-gray-50 dark:bg-gray-800' : 'bg-amber-50 dark:bg-amber-900/20'}`}>
                    <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Solde</div>
                    <div className={`text-base font-bold ${Math.abs(inv.balance) < 0.005 ? 'text-gray-700 dark:text-gray-200' : 'text-amber-700 dark:text-amber-300'}`}>
                      {fmtCurrency(inv.balance)}
                    </div>
                    <span className={`inline-flex mt-0.5 px-2 py-0.5 text-[11px] font-semibold rounded-full ${statusCls[inv.status] || statusCls.draft}`}>
                      {statusLabel[inv.status] || inv.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Liste des paiements */}
              <div className="p-4 space-y-3">
                {payments.length === 0 ? (
                  <div className="text-center py-6">
                    <Receipt className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                    {inv.legacy_paid ? (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Facture marquée <strong>payée</strong> avant la mise en place du suivi des paiements
                        (juin 2026): aucun détail (date, mode, N°) n'a été enregistré.
                      </p>
                    ) : (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Aucun paiement enregistré sur cette facture.
                        {Math.abs(inv.balance) > 0.005 && ' Les paiements se saisissent dans l\'état de compte du client.'}
                      </p>
                    )}
                  </div>
                ) : (
                  payments.map(p => {
                    const credited = p.amount + p.discount_applied;
                    return (
                      <div key={p.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 p-3">
                        <div className="flex items-start gap-3">
                          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                              <div className="font-semibold text-gray-900 dark:text-gray-100">
                                {fmtPaymentDate(p.payment_date)}
                              </div>
                              <div className="font-bold text-gray-900 dark:text-gray-100">
                                {fmtCurrency(p.amount)}
                                {p.discount_applied > 0 && (
                                  <span className="ml-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                                    + escompte {fmtCurrency(p.discount_applied)} = {fmtCurrency(credited)}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-700 dark:text-gray-300">
                              <span className="inline-flex items-center gap-1">
                                <Wallet className="w-3.5 h-3.5 text-gray-400" />
                                {paymentMethodLabel(p.method) || '—'}
                              </span>
                              <span className="inline-flex items-center gap-1 font-mono">
                                <Hash className="w-3.5 h-3.5 text-gray-400" />
                                {(p.reference || '').trim() || <span className="font-sans text-gray-400 dark:text-gray-500">aucun N°</span>}
                              </span>
                            </div>

                            {p.notes && (
                              <div className="mt-1.5 flex items-start gap-1 text-sm text-gray-600 dark:text-gray-400 italic">
                                <StickyNote className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                                <span className="whitespace-pre-wrap break-words">{p.notes}</span>
                              </div>
                            )}

                            {/* Factures réglées par le même paiement */}
                            {p.siblings && p.siblings.length > 0 && (
                              <div className="mt-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 p-2 text-xs">
                                <div className="font-medium text-emerald-800 dark:text-emerald-300">
                                  Paiement global de {fmtCurrency(p.group_amount)}
                                  {p.group_discount > 0 && ` (+ escompte ${fmtCurrency(p.group_discount)})`}
                                  {' '}réparti sur {p.group_invoice_count} factures :
                                </div>
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-600 text-white font-mono">
                                    {inv.invoice_number}
                                    <span className="font-sans">{fmtCurrency(credited)}</span>
                                  </span>
                                  {p.siblings.map(s => (
                                    <span
                                      key={s.payment_id}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white dark:bg-gray-800 border border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 font-mono"
                                      title={s.invoice_total != null ? `Total de la facture: ${fmtCurrency(s.invoice_total)}` : undefined}
                                    >
                                      {s.invoice_number}
                                      <span className="font-sans">{fmtCurrency(s.amount + s.discount_applied)}</span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          <button
                            onClick={() => deletePayment(p)}
                            disabled={busyId === p.id}
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50 flex-shrink-0"
                            title="Supprimer ce paiement"
                            aria-label="Supprimer ce paiement"
                          >
                            {busyId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>

        {/* Pied */}
        <div className="px-4 py-3 border-t dark:border-gray-700 flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
          {onOpenStatement && (inv?.client_id || invoice?.client_id) ? (
            <button
              onClick={() => { onOpenStatement(inv?.client_id || invoice?.client_id); onClose?.(); }}
              className="min-h-[44px] px-4 rounded-lg text-sm font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
            >
              État de compte du client
            </button>
          ) : <span />}
          <button
            onClick={onClose}
            className="min-h-[44px] px-5 rounded-lg text-sm font-semibold bg-gray-800 text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
