/**
 * @file components/invoices/ClientStatementView.js
 * @description Vue détaillée de l'état de compte d'un client (modale plein écran)
 *              - Liste des factures impayées (solde, retard, intérêts, vieillissement)
 *              - Saisie d'un paiement (chèque/virement/comptant) couvrant une ou
 *                plusieurs factures, avec escompte 2% optionnel par facture
 *              - Historique des paiements appliqués (suppression possible)
 *              - Aperçu PDF + envoi du relevé par courriel (destinataires du dossier client)
 *              - Mobile-first: champs numériques auto-select, touch targets 44px
 * @version 1.0.0
 * @date 2026-06-14
 * @changelog
 *   1.0.0 - Version initiale (module État de compte client)
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X, RefreshCw, AlertCircle, CheckCircle, Trash2, Send, Eye,
  DollarSign, Clock, Mail, Plus,
} from 'lucide-react';

const METHODS = [
  { value: 'cheque', label: 'Chèque' },
  { value: 'virement', label: 'Virement' },
  { value: 'comptant', label: 'Comptant' },
  { value: 'autre', label: 'Autre' },
];

const BUCKET_LABELS = {
  current: 'Courant',
  d1_30: '1-30 jours',
  d31_60: '31-60 jours',
  d61_90: '61-90 jours',
  d90_plus: '90+ jours',
};

const todayStr = () => new Date().toISOString().split('T')[0];

const fmtCurrency = (amount) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(amount || 0);

const MONTHS_FR = ['', 'jan.', 'fév.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const fmtDate = (dateStr) => {
  if (!dateStr) return '-';
  const [y, m, d] = dateStr.split('-');
  return `${parseInt(d)} ${MONTHS_FR[parseInt(m)]} ${y}`;
};

const daysSince = (dateStr) => {
  if (!dateStr) return 0;
  const ref = new Date(todayStr() + 'T00:00:00');
  const d = new Date(dateStr + 'T00:00:00');
  return Math.floor((ref - d) / (1000 * 60 * 60 * 24));
};

export default function ClientStatementView({ clientId, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [busy, setBusy] = useState(false);

  // Paiement en cours de saisie (partagé entre les factures cochées)
  const [pay, setPay] = useState({
    payment_date: todayStr(),
    method: 'cheque',
    reference: '',
    notes: '',
  });
  // Allocations par facture: { [invoiceId]: { selected, amount, escompte } }
  const [alloc, setAlloc] = useState({});

  // Envoi du relevé
  const [showSend, setShowSend] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState([]);
  const [customEmail, setCustomEmail] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/statements/${clientId}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        // Réinitialiser les allocations
        const a = {};
        (json.data.invoices || []).forEach(inv => {
          a[inv.id] = { selected: false, amount: '', escompte: false };
        });
        setAlloc(a);
      } else {
        setError(json.error || 'Erreur de chargement');
      }
    } catch (err) {
      setError('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(null), 4000);
      return () => clearTimeout(t);
    }
  }, [success]);

  // Escompte 2% = 2% du sous-total (avant taxes) de la facture
  const discountFor = (inv) => Math.round((Number(inv.subtotal) || 0) * 0.02 * 100) / 100;

  const toggleSelect = (inv) => {
    setAlloc(prev => {
      const cur = prev[inv.id] || {};
      const selected = !cur.selected;
      return {
        ...prev,
        [inv.id]: {
          selected,
          escompte: cur.escompte || false,
          amount: selected && !cur.amount ? String(inv.balance.toFixed(2)) : cur.amount,
        },
      };
    });
  };

  const setAmount = (invId, value) => {
    setAlloc(prev => ({ ...prev, [invId]: { ...prev[invId], amount: value } }));
  };

  const toggleEscompte = (inv) => {
    setAlloc(prev => {
      const cur = prev[inv.id] || {};
      const escompte = !cur.escompte;
      const disc = discountFor(inv);
      // Si escompte activé: montant à payer = solde - escompte
      const amount = escompte
        ? String(Math.max(0, inv.balance - disc).toFixed(2))
        : String(inv.balance.toFixed(2));
      return { ...prev, [inv.id]: { ...cur, escompte, selected: true, amount } };
    });
  };

  const selectedInvoices = (data?.invoices || []).filter(inv => alloc[inv.id]?.selected);
  const paymentTotal = selectedInvoices.reduce(
    (s, inv) => s + (parseFloat(alloc[inv.id]?.amount) || 0), 0
  );

  const submitPayment = async () => {
    if (selectedInvoices.length === 0) {
      setError('Sélectionnez au moins une facture à payer');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      for (const inv of selectedInvoices) {
        const a = alloc[inv.id];
        const amount = parseFloat(a.amount) || 0;
        const discount = a.escompte ? discountFor(inv) : 0;
        if (amount <= 0 && discount <= 0) continue;
        const res = await fetch('/api/invoice-payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoice_id: inv.id,
            amount,
            discount_applied: discount,
            payment_date: pay.payment_date,
            method: pay.method,
            reference: pay.reference,
            notes: pay.notes,
          }),
        });
        const json = await res.json();
        if (!json.success) {
          setError(`Facture ${inv.invoice_number}: ${json.error || 'erreur'}`);
          setBusy(false);
          return;
        }
      }
      setSuccess('Paiement(s) enregistré(s)');
      setPay({ payment_date: todayStr(), method: 'cheque', reference: '', notes: '' });
      await load();
      onChanged?.();
    } catch (err) {
      setError('Erreur de connexion');
    } finally {
      setBusy(false);
    }
  };

  const deletePayment = async (paymentId, invoiceNumber) => {
    if (!confirm(`Supprimer ce paiement de la facture ${invoiceNumber}?\n\nCette action est irréversible.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/invoice-payments/${paymentId}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setSuccess('Paiement supprimé');
        await load();
        onChanged?.();
      } else {
        setError(json.error || 'Erreur suppression');
      }
    } catch (err) {
      setError('Erreur de connexion');
    } finally {
      setBusy(false);
    }
  };

  const previewStatement = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/statements/${clientId}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ print_only: true }),
      });
      const json = await res.json();
      if (json.success) {
        if (json.pdf_url) window.open(json.pdf_url, '_blank');
        else setError('PDF généré mais URL indisponible');
      } else {
        setError(json.error || 'Erreur génération PDF');
      }
    } catch (err) {
      setError('Erreur de connexion');
    } finally {
      setBusy(false);
    }
  };

  const sendStatement = async () => {
    const emails = [...selectedEmails];
    if (customEmail.trim()) emails.push(customEmail.trim());
    if (emails.length === 0) {
      setError('Sélectionnez au moins un destinataire');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/statements/${clientId}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(json.message || 'État de compte envoyé');
        setShowSend(false);
      } else {
        setError(json.error || 'Erreur envoi');
      }
    } catch (err) {
      setError('Erreur de connexion');
    } finally {
      setBusy(false);
    }
  };

  // Destinataires disponibles (courriels du dossier client)
  const availableEmails = (() => {
    const c = data?.client;
    if (!c) return [];
    const items = [
      { email: c.email_billing, label: 'Facturation' },
      { email: c.email, label: c.contact_name || 'Principal' },
      { email: c.email_2, label: c.contact_name_2 || 'Contact 2' },
      { email: c.email_3, label: c.contact_name_3 || 'Contact 3' },
      { email: c.email_admin, label: c.contact_name_admin || 'Administration' },
    ].filter(x => x.email);
    // Dédoublonner par adresse
    const seen = new Set();
    return items.filter(x => (seen.has(x.email) ? false : seen.add(x.email)));
  })();

  const openSend = () => {
    // Pré-cocher l'email de facturation (ou le premier disponible)
    const def = availableEmails.find(e => e.label === 'Facturation') || availableEmails[0];
    setSelectedEmails(def ? [def.email] : []);
    setCustomEmail('');
    setShowSend(true);
  };

  const toggleEmail = (email) => {
    setSelectedEmails(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]);
  };

  const totals = data?.totals || { balance: 0, interest: 0, total_with_interest: 0 };
  const aging = data?.aging || {};

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-stretch sm:items-center justify-center sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 w-full sm:max-w-5xl sm:rounded-2xl shadow-2xl flex flex-col max-h-screen sm:max-h-[95vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b dark:border-gray-700 bg-gradient-to-r from-emerald-600 to-teal-600 sm:rounded-t-2xl">
          <div className="flex items-center gap-3 min-w-0">
            <DollarSign className="w-6 h-6 text-white flex-shrink-0" />
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-white truncate">État de compte</h2>
              <p className="text-emerald-50 text-sm truncate">{data?.client?.name || '...'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-white hover:bg-white/20 transition-colors"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="px-4 sm:px-6">
          {success && (
            <div className="mt-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0" /> {success}
            </div>
          )}
          {error && (
            <div className="mt-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-5">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mx-auto"></div>
              <p className="mt-3 text-gray-600 dark:text-gray-400">Chargement...</p>
            </div>
          ) : !data || data.invoices.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <p className="text-gray-700 dark:text-gray-300 text-lg">Aucune facture impayée</p>
              <p className="text-gray-500 dark:text-gray-500 text-sm mt-1">Le compte de ce client est à jour.</p>
            </div>
          ) : (
            <>
              {/* Bandeau résumé */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Solde dû</div>
                  <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{fmtCurrency(totals.balance)}</div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Intérêts ({data.interest_rate}%/an)</div>
                  <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{fmtCurrency(totals.interest)}</div>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3">
                  <div className="text-xs text-emerald-700 dark:text-emerald-400">Total à payer</div>
                  <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{fmtCurrency(totals.total_with_interest)}</div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Factures dues</div>
                  <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{totals.open_count}</div>
                </div>
              </div>

              {/* Vieillissement */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Vieillissement des comptes</h3>
                <div className="grid grid-cols-5 gap-1 text-center">
                  {['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'].map(k => (
                    <div key={k} className={`rounded-lg p-2 border ${
                      k === 'd90_plus' && aging[k] > 0
                        ? 'border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-800'
                        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'
                    }`}>
                      <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">{BUCKET_LABELS[k]}</div>
                      <div className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-100">{fmtCurrency(aging[k])}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Saisie d'un paiement */}
              <div className="border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 sm:p-4 bg-emerald-50/40 dark:bg-emerald-900/10">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Enregistrer un paiement reçu
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Date</label>
                    <input
                      type="date"
                      value={pay.payment_date}
                      onChange={(e) => setPay(p => ({ ...p, payment_date: e.target.value }))}
                      className="w-full px-2 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Méthode</label>
                    <select
                      value={pay.method}
                      onChange={(e) => setPay(p => ({ ...p, method: e.target.value }))}
                      className="w-full px-2 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    >
                      {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">N° chèque / virement</label>
                    <input
                      type="text"
                      value={pay.reference}
                      onChange={(e) => setPay(p => ({ ...p, reference: e.target.value }))}
                      onFocus={(e) => e.target.select()}
                      placeholder="Ex: 1042"
                      autoCorrect="off" autoCapitalize="off" spellCheck={false}
                      className="w-full px-2 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Note (optionnel)</label>
                    <input
                      type="text"
                      value={pay.notes}
                      onChange={(e) => setPay(p => ({ ...p, notes: e.target.value }))}
                      onFocus={(e) => e.target.select()}
                      autoCorrect="on" autoCapitalize="sentences" spellCheck={true}
                      className="w-full px-2 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Cochez les factures réglées par ce paiement, ajustez le montant appliqué au besoin (paiement partiel possible).
                </p>
              </div>

              {/* Liste des factures impayées */}
              <div className="space-y-2">
                {data.invoices.map(inv => {
                  const a = alloc[inv.id] || {};
                  const disc = discountFor(inv);
                  const dSince = daysSince(inv.invoice_date);
                  return (
                    <div
                      key={inv.id}
                      className={`rounded-xl border p-3 transition-colors ${
                        a.selected
                          ? 'border-emerald-400 dark:border-emerald-600 bg-emerald-50/60 dark:bg-emerald-900/15'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={!!a.selected}
                          onChange={() => toggleSelect(inv)}
                          className="mt-1 w-5 h-5 rounded accent-emerald-600 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="font-mono font-bold text-gray-900 dark:text-gray-100">Facture {inv.invoice_number}</span>
                            {inv.source_number && (
                              <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{inv.source_number}</span>
                            )}
                            {inv.days_overdue > 0 ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                                <Clock className="w-3 h-3" /> {inv.days_overdue} j de retard
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">Échéance {fmtDate(inv.due_date)}</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-gray-600 dark:text-gray-400">
                            <span>Date: {fmtDate(inv.invoice_date)}</span>
                            <span>Total: {fmtCurrency(inv.total)}</span>
                            {inv.amount_paid > 0 && <span>Déjà payé: {fmtCurrency(inv.amount_paid)}</span>}
                            <span className="font-semibold text-gray-900 dark:text-gray-100">Solde: {fmtCurrency(inv.balance)}</span>
                            {inv.interest > 0 && <span className="text-amber-600 dark:text-amber-400">Intérêt: {fmtCurrency(inv.interest)}</span>}
                          </div>

                          {/* Paiements déjà appliqués */}
                          {inv.payments && inv.payments.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {inv.payments.map(p => (
                                <div key={p.id} className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                  <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" />
                                  <span>
                                    {fmtDate(p.payment_date)} — {fmtCurrency(p.amount)}
                                    {p.discount_applied > 0 && ` (+ escompte ${fmtCurrency(p.discount_applied)})`}
                                    {' '}· {METHODS.find(m => m.value === p.method)?.label || p.method}
                                    {p.reference && ` #${p.reference}`}
                                  </span>
                                  <button
                                    onClick={() => deletePayment(p.id, inv.invoice_number)}
                                    disabled={busy}
                                    className="ml-auto p-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
                                    title="Supprimer ce paiement"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Saisie montant si sélectionnée */}
                          {a.selected && (
                            <div className="mt-2 flex flex-wrap items-end gap-3">
                              <div>
                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Montant appliqué</label>
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={a.amount}
                                    onChange={(e) => setAmount(inv.id, e.target.value)}
                                    onFocus={(e) => e.target.select()}
                                    inputMode="decimal"
                                    className="w-32 pl-5 pr-2 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                                  />
                                </div>
                              </div>
                              <label className="flex items-center gap-2 cursor-pointer py-2">
                                <input
                                  type="checkbox"
                                  checked={!!a.escompte}
                                  onChange={() => toggleEscompte(inv)}
                                  className="w-4 h-4 rounded accent-emerald-600"
                                />
                                <span className="text-xs text-gray-700 dark:text-gray-300">
                                  Escompte 2% ({fmtCurrency(disc)})
                                  <span className="text-gray-400"> · {dSince} j depuis facturation</span>
                                </span>
                              </label>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer actions */}
        {!loading && data && data.invoices.length > 0 && (
          <div className="border-t dark:border-gray-700 px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-gray-50 dark:bg-gray-800/50 sm:rounded-b-2xl">
            {selectedInvoices.length > 0 && (
              <div className="text-sm text-gray-700 dark:text-gray-300 sm:mr-auto">
                {selectedInvoices.length} facture(s) · Paiement total: <strong>{fmtCurrency(paymentTotal)}</strong>
              </div>
            )}
            <button
              onClick={submitPayment}
              disabled={busy || selectedInvoices.length === 0}
              className="min-h-[44px] bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
              Enregistrer le paiement
            </button>
            <button
              onClick={previewStatement}
              disabled={busy}
              className="min-h-[44px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Eye className="w-4 h-4" /> Aperçu PDF
            </button>
            <button
              onClick={openSend}
              disabled={busy}
              className="min-h-[44px] bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Send className="w-4 h-4" /> Envoyer le relevé
            </button>
          </div>
        )}
      </div>

      {/* Sous-modale envoi */}
      {showSend && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => setShowSend(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Mail className="w-5 h-5" /> Envoyer l&apos;état de compte
              </h3>
              <button onClick={() => setShowSend(false)} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">Choisissez les destinataires:</p>
            <div className="space-y-2 mb-3">
              {availableEmails.length === 0 && (
                <p className="text-sm text-amber-600 dark:text-amber-400">Aucun courriel au dossier client. Saisissez une adresse ci-dessous.</p>
              )}
              {availableEmails.map(e => (
                <label key={e.email} className="flex items-center gap-3 p-2 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                  <input
                    type="checkbox"
                    checked={selectedEmails.includes(e.email)}
                    onChange={() => toggleEmail(e.email)}
                    className="w-5 h-5 rounded accent-indigo-600"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{e.email}</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">{e.label}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mb-4">
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Autre adresse (optionnel)</label>
              <input
                type="email"
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                onFocus={(e) => e.target.select()}
                placeholder="courriel@exemple.com"
                autoCorrect="off" autoCapitalize="off" spellCheck={false}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowSend(false)} className="min-h-[44px] px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600">
                Annuler
              </button>
              <button
                onClick={sendStatement}
                disabled={busy}
                className="min-h-[44px] px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 inline-flex items-center gap-2 disabled:opacity-50"
              >
                {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Envoyer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
