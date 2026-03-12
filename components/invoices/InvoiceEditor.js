/**
 * @file components/invoices/InvoiceEditor.js
 * @description Éditeur de facture avec lignes éditables et calculs automatiques
 *              - Pré-remplit les lignes depuis un BT ou BL source
 *              - Lignes: main d'oeuvre, transport, matériaux, forfait, autre
 *              - Calculs TPS/TVQ en temps réel
 *              - Affiche coûtant unitaire et quantité en main pour les matériaux
 *              - Code produit cliquable pour ouvrir la fiche produit (modal)
 *              - Actions: sauvegarder, envoyer, annuler
 * @version 2.0.0
 * @date 2026-03-12
 * @changelog
 *   2.0.0 - Ajout coûtant unitaire + qté en main sur lignes matériaux,
 *           code produit cliquable ouvrant modal fiche produit (lecture seule)
 *   1.1.0 - Facture envoyée (sent) verrouillée en lecture seule
 *   1.0.1 - Ajout attributs autoCorrect/autoCapitalize/spellCheck sur tous les champs texte
 *   1.0.0 - Version initiale (Phase B Facturation MVP)
 */

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Plus, Trash2, Save, Send, DollarSign, FileText, AlertCircle, Lock, Package, History, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';

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
        product_id: mat.product_id || mat.code || null,
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
        product_id: mat.product_id || null,
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

  // Product data map: product_id → { cost_price, stock_qty, description, supplier, ... }
  const [productDataMap, setProductDataMap] = useState({});
  const [productModalItem, setProductModalItem] = useState(null);
  const [productModalLoading, setProductModalLoading] = useState(false);
  const [productModalMovements, setProductModalMovements] = useState([]);
  const [productModalTab, setProductModalTab] = useState('info');

  // Tax rates from settings
  const tpsRate = settings?.tps_rate || 5.0;
  const tvqRate = settings?.tvq_rate || 9.975;

  // Facture envoyée = verrouillée en lecture seule
  const isLocked = invoice?.status === 'sent' || invoice?.status === 'paid';

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

  // Fetch product data (cost_price, stock_qty) for material lines
  useEffect(() => {
    if (lineItems.length === 0) return;

    const materialProductIds = lineItems
      .filter(l => l.type === 'material' && l.product_id)
      .map(l => l.product_id)
      .filter((id, idx, arr) => arr.indexOf(id) === idx); // unique

    if (materialProductIds.length === 0) return;

    // Also check detail field for existing invoices that may not have product_id
    const detailIds = lineItems
      .filter(l => l.type === 'material' && !l.product_id && l.detail)
      .map(l => l.detail)
      .filter((id, idx, arr) => arr.indexOf(id) === idx);

    const allIds = [...materialProductIds, ...detailIds];
    if (allIds.length === 0) return;

    const fetchProductData = async () => {
      try {
        // Query products table for all material product_ids
        const { data: products } = await supabase
          .from('products')
          .select('product_id, description, cost_price, selling_price, stock_qty, supplier')
          .in('product_id', allIds);

        // Also check non_inventory_items
        const { data: nonInvProducts } = await supabase
          .from('non_inventory_items')
          .select('product_id, description, cost_price, selling_price, stock_qty, supplier')
          .in('product_id', allIds);

        const map = {};
        if (products) {
          products.forEach(p => {
            map[p.product_id] = { ...p, source: 'inventory' };
          });
        }
        if (nonInvProducts) {
          nonInvProducts.forEach(p => {
            if (!map[p.product_id]) {
              map[p.product_id] = { ...p, source: 'non_inventory' };
            }
          });
        }
        setProductDataMap(map);
      } catch (err) {
        console.error('Erreur chargement données produits:', err);
      }
    };

    fetchProductData();
  }, [lineItems]);

  // Open product modal
  const handleOpenProductModal = useCallback(async (productId) => {
    if (!productId) return;

    const cached = productDataMap[productId];
    if (cached) {
      setProductModalItem(cached);
      setProductModalTab('info');
      setProductModalMovements([]);
      // Load movements
      loadProductMovements(productId);
    } else {
      // Fetch from DB
      setProductModalLoading(true);
      try {
        const { data: product } = await supabase
          .from('products')
          .select('*')
          .eq('product_id', productId)
          .single();

        if (product) {
          setProductModalItem({ ...product, source: 'inventory' });
        } else {
          const { data: nonInv } = await supabase
            .from('non_inventory_items')
            .select('*')
            .eq('product_id', productId)
            .single();
          if (nonInv) {
            setProductModalItem({ ...nonInv, source: 'non_inventory' });
          }
        }
        setProductModalTab('info');
        setProductModalMovements([]);
        loadProductMovements(productId);
      } catch (err) {
        console.error('Erreur chargement produit:', err);
      } finally {
        setProductModalLoading(false);
      }
    }
  }, [productDataMap]);

  // Load product movements
  const loadProductMovements = async (productId) => {
    try {
      const { data: movements } = await supabase
        .from('inventory_movements')
        .select('*')
        .eq('product_id', productId)
        .order('created_at', { ascending: false })
        .limit(20);
      setProductModalMovements(movements || []);
    } catch (err) {
      console.error('Erreur chargement mouvements:', err);
    }
  };

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

  // Sauvegarder (ne pas inclure product_id dans les données sauvegardées — usage interne seulement)
  const handleSave = async (andSend = false) => {
    if (andSend) {
      setSending(true);
    } else {
      setSaving(true);
    }
    setError(null);

    // Nettoyer les line_items avant sauvegarde (retirer product_id qui est interne)
    const cleanedLineItems = lineItems.map(({ product_id, ...rest }) => rest);

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
            line_items: cleanedLineItems,
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
            line_items: cleanedLineItems,
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

  // Helper: get product info for a material line
  const getProductInfo = (line) => {
    const pid = line.product_id || line.detail;
    return pid ? productDataMap[pid] : null;
  };

  // Helper: format margin
  const getMarginInfo = (costPrice, sellingPrice) => {
    const cost = parseFloat(costPrice) || 0;
    const sell = parseFloat(sellingPrice) || 0;
    if (cost <= 0) return null;
    const margin = ((sell - cost) / cost) * 100;
    return {
      percent: margin.toFixed(1),
      color: margin < 10 ? 'text-red-600 dark:text-red-400' : margin < 25 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400',
    };
  };

  // Movement type translation
  const getMovementLabel = (type) => {
    const labels = {
      work_order: 'Bon de travail',
      delivery_note: 'Bon de livraison',
      supplier_purchase: 'Achat fournisseur',
      direct_receipt: 'Réception directe',
      adjustment: 'Ajustement',
    };
    return labels[type] || type;
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

          {/* Bannière lecture seule */}
          {isLocked && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
              <Lock className="w-4 h-4 flex-shrink-0" />
              Cette facture a été envoyée et ne peut plus être modifiée.
            </div>
          )}

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
                disabled={isLocked}
                className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Conditions de paiement</label>
              <select
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                disabled={isLocked}
                className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <option value="Net 30 jours">Net 30 jours</option>
                <option value="2% 10 Net 30 jours">2% 10 Net 30 jours</option>
                <option value="Payable sur réception">Payable sur réception</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className={`flex items-center gap-2 ${isLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  checked={isPrixJobe}
                  onChange={(e) => setIsPrixJobe(e.target.checked)}
                  disabled={isLocked}
                  className={`w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-emerald-600 focus:ring-emerald-500 ${isLocked ? 'opacity-60' : ''}`}
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
                Aucune ligne. Cliquez &quot;+ Ajouter ligne&quot; pour commencer.
              </div>
            ) : (
              lineItems.map((line, index) => {
                const productInfo = line.type === 'material' ? getProductInfo(line) : null;
                const marginInfo = productInfo ? getMarginInfo(productInfo.cost_price, line.unit_price) : null;
                const productCode = line.product_id || line.detail;

                return (
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
                        readOnly={isLocked}
                        className={`flex-1 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200 text-sm ${isLocked ? 'opacity-60' : ''}`}
                        placeholder="Description"
                        autoCorrect="on"
                        autoCapitalize="sentences"
                        spellCheck={true}
                      />
                      {!isLocked && (
                        <button
                          onClick={() => removeLine(index)}
                          className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {/* Mobile: product code clickable */}
                    {line.type === 'material' && productCode && (
                      <button
                        onClick={() => handleOpenProductModal(productCode)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-mono flex items-center gap-1"
                      >
                        <Package className="w-3 h-3" />
                        {productCode}
                      </button>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400">Qté</label>
                        <input
                          type="number"
                          value={line.quantity}
                          onChange={(e) => updateLine(index, 'quantity', e.target.value)}
                          onFocus={(e) => e.target.select()}
                          readOnly={isLocked}
                          className={`w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200 text-sm text-center ${isLocked ? 'opacity-60' : ''}`}
                          inputMode="decimal"
                          step="0.01"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400">Prix</label>
                        <input
                          type="number"
                          value={line.unit_price}
                          onChange={(e) => updateLine(index, 'unit_price', e.target.value)}
                          onFocus={(e) => e.target.select()}
                          readOnly={isLocked}
                          className={`w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200 text-sm text-right ${isLocked ? 'opacity-60' : ''}`}
                          inputMode="decimal"
                          step="0.01"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400">Total</label>
                        <div className="px-2 py-1.5 text-sm font-semibold text-right text-gray-900 dark:text-gray-100">
                          {formatCurrency(line.total)}
                        </div>
                      </div>
                    </div>
                    {/* Mobile: cost price + stock info */}
                    {line.type === 'material' && productInfo && (
                      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded px-2 py-1.5">
                        <span>Coûtant: <span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(productInfo.cost_price)}</span></span>
                        <span>En main: <span className="font-medium text-gray-700 dark:text-gray-300">{parseFloat(productInfo.stock_qty) || 0}</span></span>
                        {marginInfo && (
                          <span className={`font-medium ${marginInfo.color}`}>Marge: {marginInfo.percent}%</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Desktop layout */}
                  <div className="hidden sm:block">
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-4">
                        <input
                          type="text"
                          value={line.description}
                          onChange={(e) => updateLine(index, 'description', e.target.value)}
                          readOnly={isLocked}
                          className={`w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200 text-sm ${isLocked ? 'opacity-60' : ''}`}
                          placeholder="Description"
                          autoCorrect="on"
                          autoCapitalize="sentences"
                          spellCheck={true}
                        />
                      </div>
                      <div className="col-span-2">
                        {line.type === 'material' && productCode ? (
                          <button
                            onClick={() => handleOpenProductModal(productCode)}
                            className="w-full px-2 py-1.5 border border-blue-300 dark:border-blue-600 rounded bg-blue-50 dark:bg-blue-900/20 text-sm text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors text-left truncate flex items-center gap-1 cursor-pointer"
                            title="Voir la fiche produit"
                          >
                            <Package className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate font-mono text-xs">{productCode}</span>
                          </button>
                        ) : (
                          <input
                            type="text"
                            value={line.detail || ''}
                            onChange={(e) => updateLine(index, 'detail', e.target.value)}
                            readOnly={isLocked}
                            className={`w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200 text-sm ${isLocked ? 'opacity-60' : ''}`}
                            placeholder="Détail"
                            autoCorrect="on"
                            autoCapitalize="sentences"
                            spellCheck={true}
                          />
                        )}
                      </div>
                      <div className="col-span-2 text-center">
                        <input
                          type="number"
                          value={line.quantity}
                          onChange={(e) => updateLine(index, 'quantity', e.target.value)}
                          onFocus={(e) => e.target.select()}
                          readOnly={isLocked}
                          className={`w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200 text-sm text-center ${isLocked ? 'opacity-60' : ''}`}
                          inputMode="decimal"
                          step="0.01"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                        />
                      </div>
                      <div className="col-span-2 text-right">
                        <input
                          type="number"
                          value={line.unit_price}
                          onChange={(e) => updateLine(index, 'unit_price', e.target.value)}
                          onFocus={(e) => e.target.select()}
                          readOnly={isLocked}
                          className={`w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-200 text-sm text-right ${isLocked ? 'opacity-60' : ''}`}
                          inputMode="decimal"
                          step="0.01"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                        />
                      </div>
                      <div className="col-span-1 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {formatCurrency(line.total)}
                      </div>
                      <div className="col-span-1 text-center">
                        {!isLocked && (
                          <button
                            onClick={() => removeLine(index)}
                            className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                            title="Supprimer la ligne"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Desktop: cost price + stock info row */}
                    {line.type === 'material' && productInfo && (
                      <div className="grid grid-cols-12 gap-2 mt-0.5">
                        <div className="col-span-4"></div>
                        <div className="col-span-8 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 pl-1">
                          <span>Coûtant: <span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(productInfo.cost_price)}</span></span>
                          <span>En main: <span className="font-medium text-gray-700 dark:text-gray-300">{parseFloat(productInfo.stock_qty) || 0}</span></span>
                          {marginInfo && (
                            <span className={`font-medium ${marginInfo.color}`}>Marge: {marginInfo.percent}%</span>
                          )}
                          {productInfo.supplier && (
                            <span>Fourn.: <span className="font-medium text-gray-700 dark:text-gray-300">{productInfo.supplier}</span></span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                );
              })
            )}

            {/* Bouton ajouter */}
            {!isLocked && (
              <div className="border-t dark:border-gray-700 px-3 py-2">
                <button
                  onClick={addLine}
                  className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" /> Ajouter ligne
                </button>
              </div>
            )}
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
              readOnly={isLocked}
              className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm ${isLocked ? 'opacity-60' : ''}`}
              placeholder="Notes optionnelles..."
              autoCorrect="on"
              autoCapitalize="sentences"
              spellCheck={true}
            />
          </div>
        </div>

        {/* Footer avec actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-b-xl">
          <button
            onClick={() => onClose(false)}
            className="px-4 py-2.5 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
          >
            {isLocked ? 'Fermer' : 'Annuler'}
          </button>
          {!isLocked && (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Modal fiche produit (lecture seule) */}
      {productModalItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]" onClick={() => setProductModalItem(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-lg w-full max-w-lg max-h-[80vh] flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="bg-blue-50 dark:bg-blue-950 px-5 py-3 border-b dark:border-gray-700 rounded-t-lg">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-base font-semibold text-blue-900 dark:text-blue-200 font-mono">
                    {productModalItem.product_id}
                  </h3>
                  <p className="text-sm text-blue-700 dark:text-blue-400 mt-0.5">
                    {productModalItem.description}
                  </p>
                </div>
                <button onClick={() => setProductModalItem(null)} className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900 rounded">
                  <X className="w-5 h-5 text-blue-800 dark:text-blue-300" />
                </button>
              </div>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b dark:border-gray-700">
              <button
                onClick={() => setProductModalTab('info')}
                className={`flex-1 py-2 px-3 text-sm font-medium border-b-2 transition-colors ${
                  productModalTab === 'info'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Package className="w-4 h-4 inline mr-1" />
                Fiche
              </button>
              <button
                onClick={() => setProductModalTab('movements')}
                className={`flex-1 py-2 px-3 text-sm font-medium border-b-2 transition-colors ${
                  productModalTab === 'movements'
                    ? 'border-gray-700 dark:border-gray-300 text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-800'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <History className="w-4 h-4 inline mr-1" />
                Mouvements
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-5">
              {productModalTab === 'info' && (
                <div className="space-y-4">
                  {/* Prix */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Prix coûtant</div>
                      <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {formatCurrency(productModalItem.cost_price)}
                      </div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Prix vendant</div>
                      <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {formatCurrency(productModalItem.selling_price)}
                      </div>
                    </div>
                  </div>

                  {/* Marge */}
                  {(() => {
                    const mi = getMarginInfo(productModalItem.cost_price, productModalItem.selling_price);
                    if (!mi) return null;
                    return (
                      <div className={`text-sm font-medium ${mi.color} bg-gray-50 dark:bg-gray-800 rounded-lg p-3`}>
                        Marge: {mi.percent}%
                      </div>
                    );
                  })()}

                  {/* Quantités */}
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Quantités</div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300">En main (stock)</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{parseFloat(productModalItem.stock_qty) || 0}</span>
                    </div>
                  </div>

                  {/* Fournisseur */}
                  {productModalItem.supplier && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Dernier fournisseur</div>
                      <div className="text-sm text-gray-900 dark:text-gray-100">{productModalItem.supplier}</div>
                    </div>
                  )}

                  {/* Source */}
                  <div className="text-xs text-gray-400 dark:text-gray-500">
                    Source: {productModalItem.source === 'inventory' ? 'Inventaire' : 'Non-inventaire'}
                  </div>
                </div>
              )}

              {productModalTab === 'movements' && (
                <div>
                  {productModalMovements.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">Aucun mouvement enregistré</p>
                  ) : (
                    <div className="space-y-2">
                      {productModalMovements.map((mv, idx) => (
                        <div key={mv.id || idx} className="flex items-center justify-between text-sm border-b dark:border-gray-700 pb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                mv.movement_type === 'IN'
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                              }`}>
                                {mv.movement_type}
                              </span>
                              <span className="text-gray-700 dark:text-gray-300">{getMovementLabel(mv.reference_type)}</span>
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              {mv.reference_number && <span>{mv.reference_number} — </span>}
                              {new Date(mv.created_at).toLocaleDateString('fr-CA')}
                            </div>
                          </div>
                          <div className={`font-medium ${
                            mv.movement_type === 'IN' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
                          }`}>
                            {mv.movement_type === 'IN' ? '+' : '-'}{mv.quantity}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t dark:border-gray-700 px-5 py-3 bg-gray-50 dark:bg-gray-800 rounded-b-lg">
              <button
                onClick={() => setProductModalItem(null)}
                className="w-full px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
