/**
 * @file components/invoices/AccountingReports.js
 * @description Onglet "Rapports compta" — rapports de ventes et de paiements pour le comptable.
 *              - Période: Mois / Année / Personnalisé (du-au)
 *              - Rapport de ventes (factures émises) + Rapport de paiements (encaissements)
 *              - Aperçu/téléchargement PDF (client) + Envoi au comptable (CC bureau)
 * @version 1.0.0
 * @date 2026-06-14
 * @changelog
 *   1.0.0 - Version initiale (rapports comptables ventes/paiements)
 */

'use client';

import { useState } from 'react';
import { BarChart3, Wallet, Download, Send, RefreshCw, AlertCircle, CheckCircle, Mail } from 'lucide-react';
import { loadLogoBase64Client } from '../../lib/services/pdf-common';
import { buildSalesReportDoc, buildPaymentsReportDoc } from '../../lib/services/report-pdf';

export default function AccountingReports({ settings }) {
  const now = new Date();
  const [mode, setMode] = useState('month'); // month | year | custom
  const [monthVal, setMonthVal] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [yearVal, setYearVal] = useState(String(now.getFullYear()));
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [loadingKey, setLoadingKey] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const accountantEmail = settings?.accountant_email || '';

  // Construit la query string de période selon le mode
  const buildPeriodQuery = () => {
    if (mode === 'month') {
      if (!monthVal) return { error: 'Sélectionnez un mois' };
      return { qs: `month=${monthVal}` };
    }
    if (mode === 'year') {
      if (!/^\d{4}$/.test(yearVal)) return { error: 'Année invalide (YYYY)' };
      return { qs: `year=${yearVal}` };
    }
    if (!dateFrom || !dateTo) return { error: 'Sélectionnez les dates de début et de fin' };
    if (dateFrom > dateTo) return { error: 'La date de début doit précéder la date de fin' };
    return { qs: `date_from=${dateFrom}&date_to=${dateTo}` };
  };

  // Télécharge le PDF côté client
  const handleDownload = async (kind) => {
    const { qs, error: perr } = buildPeriodQuery();
    if (perr) { setError(perr); return; }

    const key = `dl-${kind}`;
    setLoadingKey(key);
    setError(null);
    setSuccess(null);
    try {
      const endpoint = kind === 'sales' ? 'sales' : 'payments';
      const res = await fetch(`/api/reports/${endpoint}?${qs}`);
      const result = await res.json();
      if (!result.success) {
        setError(result.error || 'Erreur chargement du rapport');
        return;
      }
      const data = result.data;
      const count = data.count;
      if (count === 0) {
        setError(kind === 'sales' ? 'Aucune facture pour cette période' : 'Aucun paiement pour cette période');
        return;
      }

      const logo = await loadLogoBase64Client().catch(() => null);
      const doc = kind === 'sales'
        ? buildSalesReportDoc(data, logo)
        : buildPaymentsReportDoc(data, logo);
      const prefix = kind === 'sales' ? 'Rapport-ventes' : 'Rapport-paiements';
      doc.save(`${prefix}_${data.period.slug}.pdf`);
      setSuccess(`${kind === 'sales' ? 'Rapport de ventes' : 'Rapport de paiements'} téléchargé (${count})`);
    } catch (err) {
      console.error('Erreur téléchargement rapport:', err);
      setError('Erreur génération du PDF');
    } finally {
      setLoadingKey(null);
    }
  };

  // Envoie le rapport au comptable
  const handleSend = async (kind) => {
    const { qs, error: perr } = buildPeriodQuery();
    if (perr) { setError(perr); return; }

    if (!accountantEmail) {
      setError('Aucun courriel de comptable configuré. Ajoutez-le dans Paramètres > Facturation.');
      return;
    }
    const label = kind === 'sales' ? 'rapport de ventes' : 'rapport de paiements';
    if (!confirm(`Envoyer le ${label} à ${accountantEmail} ?\n\nUne copie sera envoyée au bureau.`)) return;

    const key = `send-${kind}`;
    setLoadingKey(key);
    setError(null);
    setSuccess(null);
    try {
      const endpoint = kind === 'sales' ? 'sales' : 'payments';
      const res = await fetch(`/api/reports/${endpoint}/send-email?${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const result = await res.json();
      if (result.success) {
        setSuccess(result.message || 'Rapport envoyé');
      } else {
        setError(result.error || 'Erreur envoi');
      }
    } catch (err) {
      console.error('Erreur envoi rapport:', err);
      setError('Erreur de connexion');
    } finally {
      setLoadingKey(null);
    }
  };

  const ModeButton = ({ value, label }) => (
    <button
      onClick={() => setMode(value)}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
        mode === value
          ? 'bg-emerald-600 text-white shadow-sm'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
      }`}
    >
      {label}
    </button>
  );

  const inputCls = 'px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500';

  const ReportCard = ({ kind, title, description, Icon, accent }) => (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${accent}`}>
          <Icon className="w-5 h-5" />
        </div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{description}</p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => handleDownload(kind)}
          disabled={!!loadingKey}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {loadingKey === `dl-${kind}` ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Aperçu PDF
        </button>
        <button
          onClick={() => handleSend(kind)}
          disabled={!!loadingKey}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {loadingKey === `send-${kind}` ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Envoyer au comptable
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Messages */}
      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0" /> {success}
        </div>
      )}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Destinataire comptable */}
      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
        <Mail className="w-4 h-4" />
        {accountantEmail ? (
          <span>Comptable : <strong className="text-gray-800 dark:text-gray-200">{accountantEmail}</strong> — copie au bureau</span>
        ) : (
          <span className="text-amber-600 dark:text-amber-400">
            Aucun courriel de comptable configuré (Paramètres &gt; Facturation). L&apos;envoi sera désactivé.
          </span>
        )}
      </div>

      {/* Sélecteur de période */}
      <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-1">Période :</span>
          <ModeButton value="month" label="Mois" />
          <ModeButton value="year" label="Année" />
          <ModeButton value="custom" label="Personnalisé" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mode === 'month' && (
            <input type="month" value={monthVal} onChange={(e) => setMonthVal(e.target.value)} className={inputCls} />
          )}
          {mode === 'year' && (
            <input
              type="number" value={yearVal} min="2000" max="2100" step="1"
              onChange={(e) => setYearVal(e.target.value)} onFocus={(e) => e.target.select()}
              inputMode="numeric" className={`${inputCls} w-28`}
            />
          )}
          {mode === 'custom' && (
            <>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Du</span>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">au</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} />
            </>
          )}
        </div>
      </div>

      {/* Cartes rapports */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ReportCard
          kind="sales"
          title="Rapport de ventes"
          description="Factures émises de la période — ventilation matériel / main d'œuvre / déplacement, TPS, TVQ et total, avec totaux en bas."
          Icon={BarChart3}
          accent="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300"
        />
        <ReportCard
          kind="payments"
          title="Rapport de paiements"
          description="Journal des encaissements — un paiement par ligne (date, mode, facture, montant, escompte) + sous-totaux par mode de paiement."
          Icon={Wallet}
          accent="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300"
        />
      </div>
    </div>
  );
}
