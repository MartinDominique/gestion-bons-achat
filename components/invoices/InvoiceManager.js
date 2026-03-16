/**
 * @file components/invoices/InvoiceManager.js
 * @description Composant principal du module Facturation
 *              - Onglet "À facturer": BT/BL signés sans facture
 *              - Onglet "Factures": Liste des factures créées
 *              - Actions: créer, voir, renvoyer, marquer payée
 *              - Rapport Acomba: export PDF + CSV mensuel ventilé
 *              - Numéros de référence cliquables (SplitView)
 * @version 1.6.0
 * @date 2026-03-16
 * @changelog
 *   1.6.0 - Ajout bouton "Imprimer" sur factures (génère PDF + marque envoyée, sans email)
 *   1.5.0 - Fix: handleCreateInvoice utilise endpoint individuel pour récupérer matériaux + client complet (transport_fee, hourly_rate)
 *   1.4.0 - Ajout ReferenceLink sur N° BT/BL (Phase E — Numéros cliquables)
 *   1.3.0 - Ajout Rapport Acomba (PDF + CSV) + sélecteur de mois (Phase C)
 *   1.2.0 - Ajout "Marquer facturé (Acomba)" individuel + bulk
 *   1.1.0 - Ajout bouton Télécharger PDF (Supabase Storage)
 *   1.0.0 - Version initiale (Phase B Facturation MVP)
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Receipt, FileText, Truck, DollarSign, RefreshCw, CheckCircle, Send, Eye, Clock, AlertCircle, Download, Archive, FileSpreadsheet, Printer } from 'lucide-react';
import InvoiceEditor from './InvoiceEditor';
import { generateAcombaReportPDF, generateAcombaReportCSV } from './AcombaReportExport';
import { ReferenceLink } from '../SplitView';

export default function InvoiceManager() {
  const [activeTab, setActiveTab] = useState('to_invoice');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // "À facturer" data
  const [uninvoicedBT, setUninvoicedBT] = useState([]);
  const [uninvoicedBL, setUninvoicedBL] = useState([]);

  // "Factures" data
  const [invoices, setInvoices] = useState([]);
  const [invoiceFilter, setInvoiceFilter] = useState('all');
  const [invoicePagination, setInvoicePagination] = useState(null);

  // Invoice editor
  const [showEditor, setShowEditor] = useState(false);
  const [editorSource, setEditorSource] = useState(null);
  const [editingInvoice, setEditingInvoice] = useState(null);

  // Actions loading state
  const [actionLoading, setActionLoading] = useState({});

  // Settings
  const [settings, setSettings] = useState(null);

  // Rapport Acomba
  const [reportMonth, setReportMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [reportLoading, setReportLoading] = useState(false);

  // Auto-hide messages
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Load settings
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(result => {
        if (result.success) setSettings(result.data);
      })
      .catch(err => console.error('Erreur chargement settings:', err));
  }, []);

  // Load data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (activeTab === 'to_invoice') {
        // Charger les BT et BL signés/complétés sans facture
        const [btRes, blRes] = await Promise.all([
          fetch('/api/work-orders?limit=10000'),
          fetch('/api/delivery-notes?limit=10000'),
        ]);

        if (btRes.ok) {
          const data = await btRes.json();
          const items = data.data || data || [];
          // Filtrer: signés/complétés/envoyés ET pas encore facturés
          const uninvoiced = items.filter(wo =>
            ['signed', 'completed', 'sent'].includes(wo.status) && !wo.invoice_id
          );
          setUninvoicedBT(uninvoiced);
        }

        if (blRes.ok) {
          const data = await blRes.json();
          const items = data.data || data || [];
          const uninvoiced = items.filter(bl =>
            ['signed', 'sent'].includes(bl.status) && !bl.invoice_id
          );
          setUninvoicedBL(uninvoiced);
        }
      } else {
        // Charger les factures
        const params = new URLSearchParams();
        params.set('limit', '100');
        if (invoiceFilter !== 'all') {
          params.set('status', invoiceFilter);
        }

        const res = await fetch(`/api/invoices?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setInvoices(data.data || []);
            setInvoicePagination(data.pagination);
          }
        }
      }
    } catch (err) {
      console.error('Erreur fetch:', err);
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  }, [activeTab, invoiceFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Créer facture — ouvrir l'éditeur avec les données pré-remplies
  const handleCreateInvoice = async (item, type) => {
    try {
      // Récupérer le document source complet via l'endpoint individuel
      // (inclut materials + client complet avec transport_fee, hourly_rate_regular, etc.)
      const endpoint = type === 'bt'
        ? `/api/work-orders/${item.id}`
        : `/api/delivery-notes/${item.id}`;

      const res = await fetch(endpoint);
      let sourceData = item;

      if (res.ok) {
        const result = await res.json();
        if (result.success && result.data) {
          sourceData = result.data;
        }
      }

      setEditorSource({
        type,
        data: sourceData,
        settings,
      });
      setEditingInvoice(null);
      setShowEditor(true);
    } catch (err) {
      setError('Erreur chargement des détails');
    }
  };

  // Voir une facture existante
  const handleViewInvoice = async (invoice) => {
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setEditingInvoice(data.data);
          setEditorSource(null);
          setShowEditor(true);
        }
      }
    } catch (err) {
      setError('Erreur chargement facture');
    }
  };

  // Fermer l'éditeur
  const handleEditorClose = (saved) => {
    setShowEditor(false);
    setEditorSource(null);
    setEditingInvoice(null);
    if (saved) {
      fetchData();
      setSuccess('Facture sauvegardée avec succès');
    }
  };

  // Marquer un item comme facturé externement (Acomba)
  const handleMarkExternal = async (item) => {
    if (!confirm(`Marquer ${item._number} comme déjà facturé (Acomba)?\n\nCe document sera retiré de la liste "À facturer".`)) return;

    setActionLoading(prev => ({ ...prev, [`ext-${item._type}-${item.id}`]: true }));
    try {
      const res = await fetch('/api/invoices/mark-external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ type: item._type, id: item.id }] }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(`${item._number} marqué comme facturé (Acomba)`);
        fetchData();
      } else {
        setError(data.error || 'Erreur');
      }
    } catch (err) {
      setError('Erreur connexion');
    } finally {
      setActionLoading(prev => {
        const n = { ...prev };
        delete n[`ext-${item._type}-${item.id}`];
        return n;
      });
    }
  };

  // Marquer TOUS les items comme facturés externement (Acomba)
  const handleMarkAllExternal = async () => {
    const count = toInvoiceItems.length;
    if (!confirm(`Marquer les ${count} documents comme déjà facturés (Acomba)?\n\nTous les BT/BL de la liste "À facturer" seront marqués comme facturés.`)) return;

    setActionLoading(prev => ({ ...prev, 'bulk-external': true }));
    try {
      const items = toInvoiceItems.map(item => ({ type: item._type, id: item.id }));
      const res = await fetch('/api/invoices/mark-external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(data.message);
        fetchData();
      } else {
        setError(data.error || 'Erreur');
      }
    } catch (err) {
      setError('Erreur connexion');
    } finally {
      setActionLoading(prev => {
        const n = { ...prev };
        delete n['bulk-external'];
        return n;
      });
    }
  };

  // Marquer comme payée
  const handleMarkPaid = async (invoice) => {
    if (!confirm(`Marquer la facture ${invoice.invoice_number} comme payée?`)) return;

    setActionLoading(prev => ({ ...prev, [`paid-${invoice.id}`]: true }));
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paid' }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(`Facture ${invoice.invoice_number} marquée comme payée`);
        fetchData();
      } else {
        setError(data.error || 'Erreur');
      }
    } catch (err) {
      setError('Erreur connexion');
    } finally {
      setActionLoading(prev => {
        const n = { ...prev };
        delete n[`paid-${invoice.id}`];
        return n;
      });
    }
  };

  // Imprimer (générer PDF sans email, marquer envoyée)
  const handlePrintInvoice = async (invoice) => {
    setActionLoading(prev => ({ ...prev, [`print-${invoice.id}`]: true }));
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ print_only: true }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.pdf_url) {
          window.open(data.pdf_url, '_blank');
        }
        setSuccess(data.message || 'PDF généré');
        fetchData();
      } else {
        setError(data.error || 'Erreur génération PDF');
      }
    } catch (err) {
      setError('Erreur connexion');
    } finally {
      setActionLoading(prev => {
        const n = { ...prev };
        delete n[`print-${invoice.id}`];
        return n;
      });
    }
  };

  // Renvoyer par email
  const handleResend = async (invoice) => {
    if (!confirm(`Renvoyer la facture ${invoice.invoice_number} par email?`)) return;

    setActionLoading(prev => ({ ...prev, [`send-${invoice.id}`]: true }));
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(data.message || 'Facture envoyée');
        fetchData();
      } else {
        setError(data.error || 'Erreur envoi');
      }
    } catch (err) {
      setError('Erreur connexion');
    } finally {
      setActionLoading(prev => {
        const n = { ...prev };
        delete n[`send-${invoice.id}`];
        return n;
      });
    }
  };

  // Supprimer (brouillon seulement)
  const handleDelete = async (invoice) => {
    if (!confirm(`Supprimer la facture ${invoice.invoice_number}?\n\nCette action est irréversible.`)) return;

    setActionLoading(prev => ({ ...prev, [`del-${invoice.id}`]: true }));
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setSuccess(data.message || 'Facture supprimée');
        fetchData();
      } else {
        setError(data.error || 'Erreur suppression');
      }
    } catch (err) {
      setError('Erreur connexion');
    } finally {
      setActionLoading(prev => {
        const n = { ...prev };
        delete n[`del-${invoice.id}`];
        return n;
      });
    }
  };

  // Générer rapport Acomba (PDF ou CSV)
  const handleAcombaReport = async (format) => {
    setReportLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/report?month=${reportMonth}`);
      const result = await res.json();

      if (!result.success) {
        setError(result.error || 'Erreur chargement rapport');
        return;
      }

      const reportData = result.data;

      if (reportData.count === 0) {
        setError('Aucune facture pour ce mois');
        return;
      }

      if (format === 'pdf') {
        await generateAcombaReportPDF(reportData);
        setSuccess(`Rapport Acomba PDF téléchargé (${reportData.count} factures)`);
      } else {
        generateAcombaReportCSV(reportData);
        setSuccess(`Rapport Acomba CSV téléchargé (${reportData.count} factures)`);
      }
    } catch (err) {
      console.error('Erreur rapport Acomba:', err);
      setError('Erreur génération du rapport');
    } finally {
      setReportLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const [year, month, day] = dateStr.split('-');
    const months = ['', 'jan.', 'fév.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    return `${parseInt(day)} ${months[parseInt(month)]} ${year}`;
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(amount || 0);
  };

  const getStatusBadge = (status) => {
    const badges = {
      draft: { label: 'Brouillon', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' },
      sent: { label: 'Envoyée', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
      paid: { label: 'Payée', color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
    };
    const badge = badges[status] || badges.draft;
    return (
      <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${badge.color}`}>
        {badge.label}
      </span>
    );
  };

  // Helper: déterminer le type SplitView à partir du source_type ou du préfixe du numéro
  const getRefLinkProps = (sourceNumber, sourceType) => {
    if (sourceType === 'work_order' || (sourceNumber && sourceNumber.startsWith('BT-'))) {
      return { type: 'work-order', variant: 'green', data: { btNumber: sourceNumber } };
    }
    if (sourceType === 'delivery_note' || (sourceNumber && sourceNumber.startsWith('BL-'))) {
      return { type: 'delivery-note', variant: 'orange', data: { blNumber: sourceNumber } };
    }
    return null;
  };

  // Combiner et trier les items à facturer
  const toInvoiceItems = [
    ...uninvoicedBT.map(bt => ({
      ...bt,
      _type: 'bt',
      _number: bt.bt_number,
      _date: bt.work_date,
      _clientName: bt.client?.name || 'Client inconnu',
    })),
    ...uninvoicedBL.map(bl => ({
      ...bl,
      _type: 'bl',
      _number: bl.bl_number,
      _date: bl.delivery_date,
      _clientName: bl.client?.name || bl.client_name || 'Client inconnu',
    })),
  ].sort((a, b) => (b._date || '').localeCompare(a._date || ''));

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-blue-50 to-indigo-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <div className="container mx-auto px-4 py-8">

        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 dark:from-emerald-700 dark:via-emerald-600 dark:to-teal-600 rounded-2xl shadow-xl dark:shadow-gray-950/50 p-4 sm:p-5 mb-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <div className="flex items-center gap-3">
              <Receipt className="w-7 h-7 text-white" />
              <h1 className="text-2xl sm:text-3xl font-bold text-white">Facturation</h1>
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="bg-white text-emerald-600 px-4 py-2 rounded-lg hover:bg-emerald-50 transition-all duration-200 flex items-center font-semibold shadow-lg text-sm whitespace-nowrap disabled:opacity-50"
            >
              <RefreshCw className={`mr-1 w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </button>
          </div>

          {/* Résumé */}
          <div className="flex items-center gap-4 mt-3 text-sm text-white/90 flex-wrap">
            <span className="font-semibold text-white">
              {toInvoiceItems.length} à facturer
            </span>
            <span className="text-white/40">|</span>
            <span>{invoices.filter(i => i.status === 'sent').length} en attente</span>
            <span className="text-white/40">|</span>
            <span>{invoices.filter(i => i.status === 'paid').length} payées</span>
          </div>
        </div>

        {/* Messages */}
        {success && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 mb-4 text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            {success}
          </div>
        )}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4 text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Onglets */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab('to_invoice')}
            className={`px-4 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
              activeTab === 'to_invoice'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <Clock className="w-4 h-4" />
            À facturer
            {toInvoiceItems.length > 0 && (
              <span className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                activeTab === 'to_invoice'
                  ? 'bg-white/20 text-white'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
              }`}>
                {toInvoiceItems.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('invoices')}
            className={`px-4 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
              activeTab === 'invoices'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <Receipt className="w-4 h-4" />
            Factures
          </button>
        </div>

        {/* Contenu */}
        <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-xl shadow-lg dark:shadow-gray-950/50 border border-white/50 dark:border-gray-700/50 overflow-hidden">

          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mx-auto"></div>
              <p className="mt-3 text-gray-600 dark:text-gray-400">Chargement...</p>
            </div>
          ) : activeTab === 'to_invoice' ? (
            /* ===== ONGLET "À FACTURER" ===== */
            toInvoiceItems.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <p className="text-gray-600 dark:text-gray-400 text-lg">Tout est facturé!</p>
                <p className="text-gray-500 dark:text-gray-500 text-sm mt-1">
                  Aucun BT ou BL en attente de facturation.
                </p>
              </div>
            ) : (
              <>
                {/* Barre d'action bulk */}
                <div className="p-3 border-b dark:border-gray-700 bg-amber-50 dark:bg-amber-900/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    <Archive className="inline w-4 h-4 mr-1" />
                    Des BT/BL déjà facturés avec Acomba?
                  </p>
                  <button
                    onClick={handleMarkAllExternal}
                    disabled={actionLoading['bulk-external']}
                    className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                  >
                    {actionLoading['bulk-external'] ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Archive className="w-4 h-4" />
                    )}
                    Tout marquer facturé (Acomba)
                  </button>
                </div>

                {/* Mobile */}
                <div className="lg:hidden">
                  {toInvoiceItems.map(item => (
                    <div
                      key={`${item._type}-${item.id}`}
                      className="p-3 border-b dark:border-b-gray-700 last:border-b-0"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="flex items-center gap-1">
                          {item._type === 'bt' ? <FileText className="inline w-3.5 h-3.5 text-teal-600" /> : <Truck className="inline w-3.5 h-3.5 text-orange-600" />}
                          <ReferenceLink
                            type={item._type === 'bt' ? 'work-order' : 'delivery-note'}
                            label={item._number}
                            data={item._type === 'bt' ? { btNumber: item._number } : { blNumber: item._number }}
                            variant={item._type === 'bt' ? 'green' : 'orange'}
                          />
                        </span>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleMarkExternal(item)}
                            disabled={actionLoading[`ext-${item._type}-${item.id}`]}
                            className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors flex items-center gap-1 disabled:opacity-50"
                            title="Déjà facturé (Acomba)"
                          >
                            <Archive className="w-3.5 h-3.5" />
                            Acomba
                          </button>
                          <button
                            onClick={() => handleCreateInvoice(item, item._type)}
                            className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors flex items-center gap-1"
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                            Facturer
                          </button>
                        </div>
                      </div>
                      <div className="text-sm text-gray-700 dark:text-gray-300 font-medium">{item._clientName}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{formatDate(item._date)}</div>
                    </div>
                  ))}
                </div>

                {/* Desktop */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gradient-to-r from-gray-50 to-emerald-50 dark:from-gray-800 dark:to-gray-800">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">Type</th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">N°</th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">Date</th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">Client</th>
                        <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {toInvoiceItems.map((item, index) => (
                        <tr key={`${item._type}-${item.id}`}
                          className={`hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-colors ${
                            index % 2 === 0 ? 'bg-white/50 dark:bg-gray-800/50' : 'bg-gray-50/50 dark:bg-gray-900/30'
                          }`}
                        >
                          <td className="px-6 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold ${
                              item._type === 'bt'
                                ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300'
                                : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                            }`}>
                              {item._type === 'bt' ? <FileText className="w-3 h-3" /> : <Truck className="w-3 h-3" />}
                              {item._type.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-6 py-3">
                            <ReferenceLink
                              type={item._type === 'bt' ? 'work-order' : 'delivery-note'}
                              label={item._number}
                              data={item._type === 'bt' ? { btNumber: item._number } : { blNumber: item._number }}
                              variant={item._type === 'bt' ? 'green' : 'orange'}
                            />
                          </td>
                          <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {formatDate(item._date)}
                          </td>
                          <td className="px-6 py-3 text-sm text-gray-900 dark:text-gray-100 font-medium">
                            {item._clientName}
                          </td>
                          <td className="px-6 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleMarkExternal(item)}
                                disabled={actionLoading[`ext-${item._type}-${item.id}`]}
                                className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-3 py-2 rounded-lg text-sm font-medium hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
                                title="Déjà facturé dans Acomba"
                              >
                                <Archive className="w-4 h-4" />
                                Acomba
                              </button>
                              <button
                                onClick={() => handleCreateInvoice(item, item._type)}
                                className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors inline-flex items-center gap-1.5"
                              >
                                <DollarSign className="w-4 h-4" />
                                Créer facture
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )
          ) : (
            /* ===== ONGLET "FACTURES" ===== */
            <>
              {/* Filtres + Rapport Acomba */}
              <div className="p-4 border-b dark:border-gray-700 space-y-3">
                {/* Ligne 1: Filtres statut */}
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">Statut:</span>
                  {[
                    { value: 'all', label: 'Toutes' },
                    { value: 'draft', label: 'Brouillons' },
                    { value: 'sent', label: 'Envoyées' },
                    { value: 'paid', label: 'Payées' },
                  ].map(f => (
                    <button
                      key={f.value}
                      onClick={() => setInvoiceFilter(f.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        invoiceFilter === f.value
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Ligne 2: Rapport Acomba */}
                <div className="flex flex-wrap gap-2 items-center pt-2 border-t dark:border-gray-700">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-1">Rapport:</span>
                  <input
                    type="month"
                    value={reportMonth}
                    onChange={(e) => setReportMonth(e.target.value)}
                    className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                  <button
                    onClick={() => handleAcombaReport('pdf')}
                    disabled={reportLoading}
                    className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-indigo-700 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {reportLoading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Printer className="w-3.5 h-3.5" />
                    )}
                    Rapport Acomba
                  </button>
                  <button
                    onClick={() => handleAcombaReport('csv')}
                    disabled={reportLoading}
                    className="bg-teal-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-teal-700 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {reportLoading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                    )}
                    Export CSV
                  </button>
                </div>
              </div>

              {invoices.length === 0 ? (
                <div className="p-8 text-center">
                  <Receipt className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-600 dark:text-gray-400">Aucune facture trouvée</p>
                </div>
              ) : (
                <>
                  {/* Mobile */}
                  <div className="lg:hidden">
                    {invoices.map(invoice => (
                      <div
                        key={invoice.id}
                        className="p-3 border-b dark:border-b-gray-700 last:border-b-0"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">
                            {invoice.invoice_number}
                          </span>
                          {getStatusBadge(invoice.status)}
                        </div>
                        <div className="text-sm text-gray-700 dark:text-gray-300 font-medium">{invoice.client_name}</div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(invoice.invoice_date)}</span>
                          <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{formatCurrency(invoice.total)}</span>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => handleViewInvoice(invoice)}
                            className="flex-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 py-1.5 rounded text-xs font-medium hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors flex items-center justify-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" /> Voir
                          </button>
                          {invoice.pdf_url && (
                            <a
                              href={invoice.pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 py-1.5 rounded text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-1"
                            >
                              <Download className="w-3.5 h-3.5" /> PDF
                            </a>
                          )}
                          {invoice.status !== 'paid' && (
                            <>
                              <button
                                onClick={() => handlePrintInvoice(invoice)}
                                disabled={actionLoading[`print-${invoice.id}`]}
                                className="flex-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 py-1.5 rounded text-xs font-medium hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                {actionLoading[`print-${invoice.id}`] ? '...' : 'Imprimer'}
                              </button>
                              <button
                                onClick={() => handleResend(invoice)}
                                disabled={actionLoading[`send-${invoice.id}`]}
                                className="flex-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 py-1.5 rounded text-xs font-medium hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
                              >
                                <Send className="w-3.5 h-3.5" />
                                {invoice.status === 'draft' ? 'Envoyer' : 'Renvoyer'}
                              </button>
                              <button
                                onClick={() => handleMarkPaid(invoice)}
                                disabled={actionLoading[`paid-${invoice.id}`]}
                                className="flex-1 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 py-1.5 rounded text-xs font-medium hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
                              >
                                <CheckCircle className="w-3.5 h-3.5" /> Payée
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop */}
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gradient-to-r from-gray-50 to-emerald-50 dark:from-gray-800 dark:to-gray-800">
                        <tr>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">N° Facture</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">Date</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">Client</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">Réf.</th>
                          <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">Total</th>
                          <th className="px-6 py-4 text-center text-sm font-semibold text-gray-700 dark:text-gray-300">Statut</th>
                          <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {invoices.map((invoice, index) => (
                          <tr key={invoice.id}
                            className={`hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-colors ${
                              index % 2 === 0 ? 'bg-white/50 dark:bg-gray-800/50' : 'bg-gray-50/50 dark:bg-gray-900/30'
                            }`}
                          >
                            <td className="px-6 py-3 font-mono text-sm font-bold text-gray-900 dark:text-gray-100">
                              {invoice.invoice_number}
                            </td>
                            <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-400">
                              {formatDate(invoice.invoice_date)}
                            </td>
                            <td className="px-6 py-3 text-sm text-gray-900 dark:text-gray-100 font-medium">
                              {invoice.client_name}
                            </td>
                            <td className="px-6 py-3">
                              {(() => {
                                const ref = getRefLinkProps(invoice.source_number, invoice.source_type);
                                return ref ? (
                                  <ReferenceLink
                                    type={ref.type}
                                    label={invoice.source_number}
                                    data={ref.data}
                                    variant={ref.variant}
                                  />
                                ) : (
                                  <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">{invoice.source_number}</span>
                                );
                              })()}
                            </td>
                            <td className="px-6 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                              {formatCurrency(invoice.total)}
                            </td>
                            <td className="px-6 py-3 text-center">
                              {getStatusBadge(invoice.status)}
                            </td>
                            <td className="px-6 py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleViewInvoice(invoice)}
                                  className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 p-2 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                                  title="Voir"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                {invoice.pdf_url && (
                                  <a
                                    href={invoice.pdf_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                    title="Télécharger PDF"
                                  >
                                    <Download className="w-4 h-4" />
                                  </a>
                                )}
                                {invoice.status !== 'paid' && (
                                  <>
                                    <button
                                      onClick={() => handlePrintInvoice(invoice)}
                                      disabled={actionLoading[`print-${invoice.id}`]}
                                      className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 p-2 rounded-lg hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors disabled:opacity-50"
                                      title="Imprimer (sans email)"
                                    >
                                      <Printer className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleResend(invoice)}
                                      disabled={actionLoading[`send-${invoice.id}`]}
                                      className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 p-2 rounded-lg hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
                                      title={invoice.status === 'draft' ? 'Envoyer' : 'Renvoyer'}
                                    >
                                      <Send className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleMarkPaid(invoice)}
                                      disabled={actionLoading[`paid-${invoice.id}`]}
                                      className="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 p-2 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors disabled:opacity-50"
                                      title="Marquer payée"
                                    >
                                      <CheckCircle className="w-4 h-4" />
                                    </button>
                                  </>
                                )}
                                {invoice.status === 'draft' && (
                                  <button
                                    onClick={() => handleDelete(invoice)}
                                    disabled={actionLoading[`del-${invoice.id}`]}
                                    className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-2 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
                                    title="Supprimer"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal InvoiceEditor */}
      {showEditor && (
        <InvoiceEditor
          source={editorSource}
          invoice={editingInvoice}
          settings={settings}
          onClose={handleEditorClose}
        />
      )}
    </div>
  );
}
