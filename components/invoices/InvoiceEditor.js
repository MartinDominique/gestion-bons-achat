/**
 * @file components/invoices/InvoiceEditor.js
 * @description Éditeur de facture avec lignes éditables et calculs automatiques
 *              - Pré-remplit les lignes depuis un BT ou BL source
 *              - Lignes: main d'oeuvre, transport, matériaux, forfait, autre
 *              - Calculs TPS/TVQ en temps réel
 *              - Actions: sauvegarder, envoyer, annuler
 * @version 1.0.0
 * @date 2026-02-27
 * @changelog
 *   1.0.0 - Version initiale (Phase B Facturation MVP)
 */

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Plus, Trash2, Save, Send, DollarSign, FileText, AlertCircle } from 'lucide-react';

/**
 * Calcule le taux horaire selon le type de surcharge
 */
function getRate(baseRate, surchargeType) {
  switch (surchargeType) {
    case 'holiday':
      return baseRate * 2.0;
    case 'sunday':
    case 'saturday':
    case 'evening':
      return baseRate * 1.5;
    default:
      return baseRate;
  }
}

/**
 * Label de surcharge
 */
function getSurchargeLabel(surchargeType) {
  const labels = {
    saturday: 'Samedi (1.5\u00d7)',
    sunday: 'Dimanche (1.5\u00d7)',
    evening: 'Soir (1.5\u00d7)',
    holiday: 'Jour férié (2\u00d7)',
  };
  return labels[surchargeType] || 'Régulier';
}

/**
 * Génère les lignes de facture depuis un BT source
 */
function generateBTLines(bt, settings) {
  const lines = [];
  const baseRate = bt.client?.hourly_rate_regular || settings?.default_hourly_rate || 0;
  const transportFee = bt.client?.transport_fee || 0;

  // Time entries → lignes main d'oeuvre
  if (bt.time_entries && bt.time_entries.length > 0) {
    bt.time_entries.forEach((entry, idx) => {
      const surchargeType = entry.surcharge_type || null;
      const rate = getRate(baseRate, surchargeType);
      const hours = entry.total_hours || 0;
      const lineTotal = Math.round(hours * rate * 100) / 100;

      const label = surchargeType
        ? `Main d'\u0153uvre \u2014 ${getSurchargeLabel(surchargeType)}`
        : 'Main d\'\u0153uvre \u2014 Régulier';

      lines.push({
        id: `labor-${entry.date}-${entry.start_time || idx}`,
        type: 'labor',
        description: label,
        detail: `${hours}h \u00d7 ${rate.toFixed(2)} $/h`,
        quantity: hours,
        unit_price: rate,
        total: lineTotal,
        session_date: entry.date,
      });

      // Transport si applicable
      if (entry.include_transport_fee && transportFee > 0) {
        lines.push({
          id: `transport-${entry.date}-${idx}`,
          type: 'transport',
          description: 'Frais de déplacement',
          detail: entry.date || '',
          quantity: 1,
          unit_price: transportFee,
          total: transportFee,
          session_date: entry.date,
        });
      } else if (entry.include_transport_fee && transportFee === 0) {
        // Transport sans montant — Dominique éditera manuellement
        lines.push({
          id: `transport-${entry.date}-${idx}`,
          type: 'transport',
          description: 'Frais de déplacement',
          detail: entry.date || '',
          quantity: 1,
          unit_price: 0,
          total: 0,
          session_date: entry.date,
        });
      }
    });
  }

  // Matériaux
  if (bt.materials && bt.materials.length > 0) {
    bt.materials.forEach((mat) => {
      const qty = mat.quantity || 0;
      const price = mat.unit_price || mat.product?.selling_price || 0;
      lines.push({
        id: `mat-${mat.product_id || mat.id || Math.random()}`,
        type: 'material',
        description: mat.description || mat.product?.description || 'Article',
        detail: mat.product_code || mat.code || mat.product_id || '',
        quantity: qty,
        unit_price: price,
        total: Math.round(qty * price * 100) / 100,
      });
    });
  }

  return lines;
}

/**
 * Génère les lignes de facture depuis un BL source
 */
function generateBLLines(bl) {
  const lines = [];

  if (bl.materials && bl.materials.length > 0) {
    bl.materials.forEach((mat) => {
      const qty = mat.quantity || 0;
      const price = mat.unit_price || 0;
      lines.push({
        id: `mat-${mat.product_id || mat.id || Math.random()}`,
        type: 'material',
        description: mat.description || 'Article',
        detail: mat.product_code || mat.product_id || '',
        quantity: qty,
        unit_price: price,
        total: Math.round(qty * price * 100) / 100,
      });
    });
  }

  return lines;
}

export default function InvoiceEditor({ source, invoice, settings, onClose }) {
  const isEditing = !!invoice;
  const sourceType = source?.type || (invoice?.source_type === 'work_order' ? 'bt' : 'bl');
  const sourceData = source?.data;

  // State
  const [lineItems, setLineItems] = useState([]);
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentTerms, setPaymentTerms] = useState('Net 30 jours');
  const [notes, setNotes] = useState('');
  const [isPrixJobe, setIsPrixJobe] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Tax rates from settings
  const tpsRate = settings?.tps_rate || 5.0;
  const tvqRate = settings?.tvq_rate || 9.975;

  // Initialize from source or existing invoice
  useEffect(() => {
    if (invoice) {
      // Editing existing invoice
      setLineItems(invoice.line_items || []);
      setInvoiceDate(invoice.invoice_date || new Date().toISOString().split('T')[0]);
      setPaymentTerms(invoice.payment_terms || 'Net 30 jours');
      setNotes(invoice.notes || '');
      setIsPrixJobe(invoice.is_prix_jobe || false);
    } else if (sourceData) {
      // Creating from BT or BL
      const btOrBl = sourceData;
      const isPJ = btOrBl.is_prix_jobe || false;
      setIsPrixJobe(isPJ);

      if (isPJ) {
        // Prix Jobe: une seule ligne forfaitaire
        setLineItems([{
          id: 'forfait-1',
          type: 'forfait',
          description: btOrBl.work_description || btOrBl.delivery_description || 'Travaux forfaitaires',
          detail: '',
          quantity: 1,
          unit_price: 0,
          total: 0,
        }]);
      } else {
        // Générer les lignes selon le type
        const lines = source.type === 'bt'
          ? generateBTLines(btOrBl, settings)
          : generateBLLines(btOrBl);
        setLineItems(lines);
      }

      // Déterminer les conditions de paiement (client override → settings default)
      const clientTerms = btOrBl.client?.payment_terms;
      setPaymentTerms(clientTerms || settings?.default_payment_terms || 'Net 30 jours');

      // Notes par défaut
      setNotes(settings?.invoice_footer_note || '');
    }
  }, [invoice, sourceData, source?.type, settings]);

  // Calculs automatiques
  const totals = useMemo(() => {
    const subtotal = lineItems.reduce((sum, line) => sum + (parseFloat(line.total) || 0), 0);
    const tps = Math.round(subtotal * (tpsRate / 100) * 100) / 100;
    const tvq = Math.round(subtotal * (tvqRate / 100) * 100) / 100;
    const total = Math.round((subtotal + tps + tvq) * 100) / 100;

    // Ventilation
    const totalLabor = lineItems
      .filter(l => l.type === 'labor')
      .reduce((sum, l) => sum + (parseFloat(l.total) || 0), 0);
    const totalTransport = lineItems
      .filter(l => l.type === 'transport')
      .reduce((sum, l) => sum + (parseFloat(l.total) || 0), 0);
    const totalMaterials = lineItems
      .filter(l => l.type === 'material')
      .reduce((sum, l) => sum + (parseFloat(l.total) || 0), 0);

    return { subtotal, tps, tvq, total, totalLabor, totalTransport, totalMaterials };
  }, [lineItems, tpsRate, tvqRate]);

  // Modifier une ligne
  const updateLine = useCallback((index, field, value) => {
    setLineItems(prev => {
      const updated = [...prev];
      const line = { ...updated[index] };
      line[field] = value;

      // Recalculer le total si quantité ou prix change
      if (field === 'quantity' || field === 'unit_price') {
        const qty = parseFloat(field === 'quantity' ? value : line.quantity) || 0;
        const price = parseFloat(field === 'unit_price' ? value : line.unit_price) || 0;
        line.total = Math.round(qty * price * 100) / 100;
      }

      updated[index] = line;
      return updated;
    });
  }, []);

  // Supprimer une ligne
  const removeLine = useCallback((index) => {
    setLineItems(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Ajouter une ligne manuelle
  const addLine = useCallback(() => {
    setLineItems(prev => [...prev, {
      id: `other-${Date.now()}`,
      type: 'other',
      description: '',
      detail: '',
      quantity: 1,
      unit_price: 0,
      total: 0,
    }]);
  }, []);

  // Sauvegarder
  const handleSave = async (andSend = false) => {
    if (andSend) {
      setSending(true);
    } else {
      setSaving(true);
    }
    setError(null);

    try {
      let invoiceId = invoice?.id;

      if (isEditing) {
        // Mise à jour
        const res = await fetch(`/api/invoices/${invoiceId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoice_date: invoiceDate,
            payment_terms: paymentTerms,
            line_items: lineItems,
            subtotal: totals.subtotal,
            tps_rate: tpsRate,
            tvq_rate: tvqRate,
            tps_amount: totals.tps,
            tvq_amount: totals.tvq,
            total: totals.total,
            total_materials: totals.totalMaterials,
            total_labor: totals.totalLabor,
            total_transport: totals.totalTransport,
            is_prix_jobe: isPrixJobe,
            notes,
          }),
        });
        const data = await res.json();
        if (!data.success) {
          setError(data.error || 'Erreur mise à jour');
          setSaving(false);
          setSending(false);
          return;
        }
      } else {
        // Création
        const btOrBl = sourceData;
        const res = await fetch('/api/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: btOrBl.client_id || btOrBl.client?.id,
            client_name: btOrBl.client?.name || btOrBl.client_name || '',
            client_address: btOrBl.client?.address || '',
            source_type: source.type === 'bt' ? 'work_order' : 'delivery_note',
            source_id: btOrBl.id,
            source_number: source.type === 'bt' ? btOrBl.bt_number : btOrBl.bl_number,
            invoice_date: invoiceDate,
            payment_terms: paymentTerms,
            line_items: lineItems,
            subtotal: totals.subtotal,
            tps_rate: tpsRate,
            tvq_rate: tvqRate,
            tps_amount: totals.tps,
            tvq_amount: totals.tvq,
            total: totals.total,
            total_materials: totals.totalMaterials,
            total_labor: totals.totalLabor,
            total_transport: totals.totalTransport,
            is_prix_jobe: isPrixJobe,
            notes,
          }),
        });
        const data = await res.json();
        if (!data.success) {
          setError(data.error || 'Erreur création');
          setSaving(false);
          setSending(false);
          return;
        }
        invoiceId = data.data.id;
      }

      // Envoyer par email si demandé
      if (andSend && invoiceId) {
        const sendRes = await fetch(`/api/invoices/${invoiceId}/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const sendData = await sendRes.json();
        if (!sendData.success) {
          // Facture sauvegardée mais envoi échoué
          setError(`Facture sauvegardée, mais erreur envoi: ${sendData.error}`);
          setSaving(false);
          setSending(false);
          return;
        }
        setSuccess(sendData.message || 'Facture envoyée');
      }

      // Fermer après un court délai pour montrer le succès
      setTimeout(() => onClose(true), 500);

    } catch (err) {
      console.error('Erreur sauvegarde:', err);
      setError('Erreur de connexion au serveur');
    } finally {
      setSaving(false);
      setSending(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(amount || 0);
  };

  // Source info
  const sourceNumber = invoice?.source_number || (sourceData && (source.type === 'bt' ? sourceData.bt_number : sourceData.bl_number)) || '';
  const clientName = invoice?.client_name || sourceData?.client?.name || sourceData?.client_name || '';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-4xl my-4 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 bg-emerald-50 dark:bg-emerald-900/20 rounded-t-xl">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              {isEditing ? `Facture ${invoice.invoice_number}` : 'Nouvelle facture'}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
              {sourceNumber} — {clientName}
            </p>
          </div>
          <button
            onClick={() => onClose(false)}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">

          {/* Messages */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm text-green-700 dark:text-green-400">
              {success}
            </div>
          )}

          {/* Infos facture */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date de facture</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Conditions de paiement</label>
              <select
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="Net 30 jours">Net 30 jours</option>
                <option value="2% 10 Net 30 jours">2% 10 Net 30 jours</option>
                <option value="Payable sur réception">Payable sur réception</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPrixJobe}
                  onChange={(e) => setIsPrixJobe(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Prix forfaitaire (Jobe)</span>
              </label>
            </div>
          </div>

          {/* Tableau des lignes */}
          <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
            {/* Header desktop */}
            <div className="hidden sm:grid grid-cols-12 gap-2 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
              <div className="col-span-4">Description</div>
              <div className="col-span-2">Détail</div>
              <div className="col-span-2 text-center">Quantité</div>
              <div className="col-span-2 text-right">Prix unit.</div>
              <div className="col-span-1 text-right">Total</div>
              <div className="col-span-1 text-center"></div>
            </div>

            {/* Lignes */}
            {lineItems.length === 0 ? (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                Aucune ligne. Cliquez "+ Ajouter ligne" pour commencer.
              </div>
            ) : (
              lineItems.map((line, index) => (
                <div
                  key={line.id || index}
                  className={`border-t dark:border-gray-700 px-3 py-2 ${
                    line.type === 'labor' ? 'bg-blue-50/50 dark:bg-blue-900/10' :
                    line.type === 'transport' ? 'bg-yellow-50/50 dark:bg-yellow-900/10' :
                    line.type === 'material' ? 'bg-white dark:bg-gray-900' :
                    line.type === 'forfait' ? 'bg-purple-50/50 dark:bg-purple-900/10' :
                    'bg-gray-50/50 dark:bg-gray-800/50'
                  }`}
                >
                  {/* Mobile layout */}
                  <div className="sm:hidden space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <input
                        type="text"
                        value={line.description}
                        onChange={(e) => updateLine(index, 'description', e.target.value)}
                        className="flex-1 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200 text-sm"
                        placeholder="Description"
                      />
                      <button
                        onClick={() => removeLine(index)}
                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400">Qté</label>
                        <input
                          type="number"
                          value={line.quantity}
                          onChange={(e) => updateLine(index, 'quantity', e.target.value)}
                          onFocus={(e) => e.target.select()}
                          className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200 text-sm text-center"
                          inputMode="decimal"
                          step="0.01"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400">Prix</label>
                        <input
                          type="number"
                          value={line.unit_price}
                          onChange={(e) => updateLine(index, 'unit_price', e.target.value)}
                          onFocus={(e) => e.target.select()}
                          className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200 text-sm text-right"
                          inputMode="decimal"
                          step="0.01"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400">Total</label>
                        <div className="px-2 py-1.5 text-sm font-semibold text-right text-gray-900 dark:text-gray-100">
                          {formatCurrency(line.total)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Desktop layout */}
                  <div className="hidden sm:grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4">
                      <input
                        type="text"
                        value={line.description}
                        onChange={(e) => updateLine(index, 'description', e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200 text-sm"
                        placeholder="Description"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="text"
                        value={line.detail || ''}
                        onChange={(e) => updateLine(index, 'detail', e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200 text-sm"
                        placeholder="Détail"
                      />
                    </div>
                    <div className="col-span-2 text-center">
                      <input
                        type="number"
                        value={line.quantity}
                        onChange={(e) => updateLine(index, 'quantity', e.target.value)}
                        onFocus={(e) => e.target.select()}
                        className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200 text-sm text-center"
                        inputMode="decimal"
                        step="0.01"
                      />
                    </div>
                    <div className="col-span-2 text-right">
                      <input
                        type="number"
                        value={line.unit_price}
                        onChange={(e) => updateLine(index, 'unit_price', e.target.value)}
                        onFocus={(e) => e.target.select()}
                        className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200 text-sm text-right"
                        inputMode="decimal"
                        step="0.01"
                      />
                    </div>
                    <div className="col-span-1 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {formatCurrency(line.total)}
                    </div>
                    <div className="col-span-1 text-center">
                      <button
                        onClick={() => removeLine(index)}
                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                        title="Supprimer la ligne"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}

            {/* Bouton ajouter */}
            <div className="border-t dark:border-gray-700 px-3 py-2">
              <button
                onClick={addLine}
                className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Ajouter ligne
              </button>
            </div>
          </div>

          {/* Totaux */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <div className="max-w-xs ml-auto space-y-2">
              <div className="flex justify-between text-sm text-gray-700 dark:text-gray-300">
                <span>Sous-total:</span>
                <span className="font-medium">{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                <span>TPS ({tpsRate}%):</span>
                <span>{formatCurrency(totals.tps)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                <span>TVQ ({tvqRate}%):</span>
                <span>{formatCurrency(totals.tvq)}</span>
              </div>
              <div className="border-t dark:border-gray-600 pt-2 flex justify-between text-base font-bold text-gray-900 dark:text-gray-100">
                <span>TOTAL:</span>
                <span>{formatCurrency(totals.total)}</span>
              </div>
            </div>

            {/* Ventilation */}
            <div className="mt-3 pt-3 border-t dark:border-gray-600 flex gap-4 text-xs text-gray-500 dark:text-gray-400 justify-end flex-wrap">
              <span>M.O.: {formatCurrency(totals.totalLabor)}</span>
              <span>Transport: {formatCurrency(totals.totalTransport)}</span>
              <span>Matériaux: {formatCurrency(totals.totalMaterials)}</span>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
              placeholder="Notes optionnelles..."
            />
          </div>
        </div>

        {/* Footer avec actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-b-xl">
          <button
            onClick={() => onClose(false)}
            className="px-4 py-2.5 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
          >
            Annuler
          </button>
          <button
            onClick={() => handleSave(false)}
            disabled={saving || sending}
            className="px-4 py-2.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving || sending}
            className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {sending ? 'Envoi...' : 'Sauvegarder & Envoyer'}
          </button>
        </div>
      </div>
    </div>
  );
}
