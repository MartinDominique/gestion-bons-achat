/**
 * @file components/invoices/InvoiceEditor.js
 * @description Éditeur de facture avec lignes éditables et calculs automatiques
 *              - Pré-remplit les lignes depuis un BT ou BL source
 *              - Lignes: main d'oeuvre, transport, matériaux, forfait, autre
 *              - Calculs TPS/TVQ en temps réel
 *              - Affiche coûtant unitaire et quantité en main pour les matériaux
 *              - Code produit cliquable ouvrant le vrai modal d'inventaire (éditable)
 *              - Actions: sauvegarder, envoyer, annuler
 * @version 2.3.0
 * @date 2026-03-16
 * @changelog
 *   2.3.0 - Ajout bouton "Imprimer" (génère PDF + marque envoyée, sans email)
 *           Affichage description BT/BL dans l'éditeur de facture
 *           Description BT/BL incluse dans le PDF facture
 *   2.2.0 - Actualisation auto du prix vendant sur les lignes facture après modification
 *           du produit dans le modal inventaire (coûtant, vendant, qté en main)
 *   2.1.0 - Modal produit remplacé par le vrai modal d'inventaire (éditable, 3 onglets)
 *           Fix affichage coûtant/qté en main sur lignes matériaux
 *   2.0.0 - Ajout coûtant unitaire + qté en main sur lignes matériaux,
 *           code produit cliquable ouvrant modal fiche produit (lecture seule)
 *   1.1.0 - Facture envoyée (sent) verrouillée en lecture seule
 *   1.0.1 - Ajout attributs autoCorrect/autoCapitalize/spellCheck sur tous les champs texte
 *   1.0.0 - Version initiale (Phase B Facturation MVP)
 */

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Plus, Trash2, Save, Send, DollarSign, FileText, AlertCircle, Lock, Package, History, Edit, ArrowDownCircle, ArrowUpCircle, Printer } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { buildPriceShiftUpdates } from '../../lib/utils/priceShift';

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
      const pid = mat.product_id || mat.code || null;
      lines.push({
        id: `mat-${pid || mat.id || Math.random()}`,
        type: 'material',
        description: mat.description || mat.product?.description || 'Article',
        detail: mat.product_code || mat.code || mat.product_id || '',
        quantity: qty,
        unit_price: price,
        total: Math.round(qty * price * 100) / 100,
        product_id: pid,
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
      const pid = mat.product_id || null;
      lines.push({
        id: `mat-${pid || mat.id || Math.random()}`,
        type: 'material',
        description: mat.description || 'Article',
        detail: mat.product_code || mat.product_id || '',
        quantity: qty,
        unit_price: price,
        total: Math.round(qty * price * 100) / 100,
        product_id: pid,
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
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [sourceDescription, setSourceDescription] = useState('');

  // Product data map: product_id → { cost_price, stock_qty, ... }
  const [productDataMap, setProductDataMap] = useState({});

  // Product modal (vrai modal inventaire éditable)
  const [editingProduct, setEditingProduct] = useState(null);
  const [productEditForm, setProductEditForm] = useState({ description: '', supplier: '', cost_price: '', selling_price: '', stock_qty: '' });
  const [productSaving, setProductSaving] = useState(false);
  const [productModalTab, setProductModalTab] = useState('edit');
  const [productMarginPercent, setProductMarginPercent] = useState('');
  const [productHistoryMovements, setProductHistoryMovements] = useState([]);
  const [productHistoryLoading, setProductHistoryLoading] = useState(false);

  // Tax rates from settings
  const tpsRate = settings?.tps_rate || 5.0;
  const tvqRate = settings?.tvq_rate || 9.975;

  // Facture envoyée = verrouillée en lecture seule
  const isLocked = invoice?.status === 'sent' || invoice?.status === 'paid';

  // Initialize from source or existing invoice
  useEffect(() => {
    if (invoice) {
      setLineItems(invoice.line_items || []);
      setInvoiceDate(invoice.invoice_date || new Date().toISOString().split('T')[0]);
      setPaymentTerms(invoice.payment_terms || 'Net 30 jours');
      setNotes(invoice.notes || '');
      setIsPrixJobe(invoice.is_prix_jobe || false);
      // Charger la description du BT/BL source si disponible
      if (invoice.source_type && invoice.source_id) {
        const endpoint = invoice.source_type === 'work_order'
          ? `/api/work-orders/${invoice.source_id}`
          : `/api/delivery-notes/${invoice.source_id}`;
        fetch(endpoint)
          .then(r => r.json())
          .then(result => {
            if (result.success && result.data) {
              const desc = result.data.work_description || result.data.delivery_description || '';
              setSourceDescription(desc);
            }
          })
          .catch(() => {});
      }
    } else if (sourceData) {
      const btOrBl = sourceData;
      const isPJ = btOrBl.is_prix_jobe || false;
      setIsPrixJobe(isPJ);

      // Récupérer la description du BT/BL
      const desc = btOrBl.work_description || btOrBl.delivery_description || '';
      setSourceDescription(desc);

      if (isPJ) {
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
        const lines = source.type === 'bt'
          ? generateBTLines(btOrBl, settings)
          : generateBLLines(btOrBl);
        setLineItems(lines);
      }

      const clientTerms = btOrBl.client?.payment_terms;
      setPaymentTerms(clientTerms || settings?.default_payment_terms || 'Net 30 jours');
      setNotes(settings?.invoice_footer_note || '');
    }
  }, [invoice, sourceData, source?.type, settings]);

  // Fetch product data (cost_price, stock_qty) for material lines
  useEffect(() => {
    if (lineItems.length === 0) return;

    // Collect all product_ids from material lines
    const allIds = [];
    lineItems.forEach(l => {
      if (l.type !== 'material') return;
      const pid = l.product_id || l.detail;
      if (pid && !allIds.includes(pid)) allIds.push(pid);
    });

    if (allIds.length === 0) return;

    const fetchProductData = async () => {
      try {
        const { data: products } = await supabase
          .from('products')
          .select('product_id, description, cost_price, selling_price, stock_qty, supplier, cost_price_1st, selling_price_1st, cost_price_2nd, selling_price_2nd, cost_price_3rd, selling_price_3rd')
          .in('product_id', allIds);

        const { data: nonInvProducts } = await supabase
          .from('non_inventory_items')
          .select('product_id, description, cost_price, selling_price, stock_qty, supplier, cost_price_1st, selling_price_1st, cost_price_2nd, selling_price_2nd, cost_price_3rd, selling_price_3rd')
          .in('product_id', allIds);

        const map = {};
        if (products) {
          products.forEach(p => { map[p.product_id] = { ...p, _source: 'products' }; });
        }
        if (nonInvProducts) {
          nonInvProducts.forEach(p => {
            if (!map[p.product_id]) map[p.product_id] = { ...p, _source: 'non_inventory_items' };
          });
        }
        setProductDataMap(map);
      } catch (err) {
        console.error('Erreur chargement données produits:', err);
      }
    };

    fetchProductData();
  }, [lineItems]);

  // Open product modal (same as InventoryManager)
  const handleOpenProductModal = useCallback(async (productId) => {
    if (!productId) return;

    // Try to find from cache first, otherwise fetch
    let product = productDataMap[productId];

    if (!product) {
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('product_id', productId)
        .single();

      if (data) {
        product = { ...data, _source: 'products' };
      } else {
        const { data: nonInv } = await supabase
          .from('non_inventory_items')
          .select('*')
          .eq('product_id', productId)
          .single();
        if (nonInv) {
          product = { ...nonInv, _source: 'non_inventory_items' };
        }
      }
    }

    if (!product) return;

    setEditingProduct(product);
    setProductEditForm({
      description: product.description || '',
      supplier: product.supplier || '',
      cost_price: product.cost_price?.toString() || '',
      selling_price: product.selling_price?.toString() || '',
      stock_qty: product.stock_qty?.toString() || '',
    });
    setProductModalTab('edit');
    setProductMarginPercent('');

    // Load movement history
    setProductHistoryLoading(true);
    setProductHistoryMovements([]);
    try {
      const { data: movements } = await supabase
        .from('inventory_movements')
        .select('*')
        .eq('product_id', productId)
        .order('created_at', { ascending: false })
        .limit(100);
      setProductHistoryMovements(movements || []);
    } catch (err) {
      console.error('Erreur chargement historique:', err);
    } finally {
      setProductHistoryLoading(false);
    }
  }, [productDataMap]);

  // Save product changes (same logic as InventoryManager)
  const saveProductChanges = async () => {
    if (!editingProduct) return;

    try {
      setProductSaving(true);
      const tableName = editingProduct._source === 'products' ? 'products' : 'non_inventory_items';

      const updates = {
        description: productEditForm.description.trim().toUpperCase(),
        supplier: productEditForm.supplier.trim() || null,
        cost_price: parseFloat(productEditForm.cost_price) || 0,
        selling_price: parseFloat(productEditForm.selling_price) || 0,
        stock_qty: parseInt(productEditForm.stock_qty) || 0,
      };

      // Price shift
      const priceShiftUpdates = buildPriceShiftUpdates(editingProduct, {
        cost_price: updates.cost_price,
        selling_price: updates.selling_price,
      });
      Object.assign(updates, priceShiftUpdates);

      const { data, error: saveError } = await supabase
        .from(tableName)
        .update(updates)
        .eq('product_id', editingProduct.product_id)
        .select();

      if (saveError) throw saveError;

      // Update local product data map + mettre à jour le prix vendant sur les lignes de facture
      if (data && data.length > 0) {
        const updatedProduct = { ...data[0], _source: editingProduct._source };
        setProductDataMap(prev => ({ ...prev, [editingProduct.product_id]: updatedProduct }));

        // Actualiser unit_price sur toutes les lignes matériaux qui utilisent ce produit
        const newSellingPrice = parseFloat(updatedProduct.selling_price) || 0;
        setLineItems(prev => prev.map(line => {
          if (line.type !== 'material') return line;
          const pid = line.product_id || line.detail;
          if (pid !== editingProduct.product_id) return line;
          const qty = parseFloat(line.quantity) || 0;
          return {
            ...line,
            unit_price: newSellingPrice,
            total: Math.round(qty * newSellingPrice * 100) / 100,
          };
        }));
      }

      setEditingProduct(null);
    } catch (err) {
      console.error('Erreur sauvegarde produit:', err);
    } finally {
      setProductSaving(false);
    }
  };

  const closeProductModal = () => {
    setEditingProduct(null);
    setProductEditForm({ description: '', supplier: '', cost_price: '', selling_price: '', stock_qty: '' });
    setProductModalTab('edit');
    setProductMarginPercent('');
  };

  // Calculs automatiques
  const totals = useMemo(() => {
    const subtotal = lineItems.reduce((sum, line) => sum + (parseFloat(line.total) || 0), 0);
    const tps = Math.round(subtotal * (tpsRate / 100) * 100) / 100;
    const tvq = Math.round(subtotal * (tvqRate / 100) * 100) / 100;
    const total = Math.round((subtotal + tps + tvq) * 100) / 100;

    const totalLabor = lineItems.filter(l => l.type === 'labor').reduce((sum, l) => sum + (parseFloat(l.total) || 0), 0);
    const totalTransport = lineItems.filter(l => l.type === 'transport').reduce((sum, l) => sum + (parseFloat(l.total) || 0), 0);
    const totalMaterials = lineItems.filter(l => l.type === 'material').reduce((sum, l) => sum + (parseFloat(l.total) || 0), 0);

    return { subtotal, tps, tvq, total, totalLabor, totalTransport, totalMaterials };
  }, [lineItems, tpsRate, tvqRate]);

  const updateLine = useCallback((index, field, value) => {
    setLineItems(prev => {
      const updated = [...prev];
      const line = { ...updated[index] };
      line[field] = value;
      if (field === 'quantity' || field === 'unit_price') {
        const qty = parseFloat(field === 'quantity' ? value : line.quantity) || 0;
        const price = parseFloat(field === 'unit_price' ? value : line.unit_price) || 0;
        line.total = Math.round(qty * price * 100) / 100;
      }
      updated[index] = line;
      return updated;
    });
  }, []);

  const removeLine = useCallback((index) => {
    setLineItems(prev => prev.filter((_, i) => i !== index));
  }, []);

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

  // Sauvegarder facture (retirer product_id des line_items avant sauvegarde)
  const handleSave = async (andSend = false) => {
    if (andSend) { setSending(true); } else { setSaving(true); }
    setError(null);

    const cleanedLineItems = lineItems.map(({ product_id, ...rest }) => rest);

    try {
      let invoiceId = invoice?.id;

      if (isEditing) {
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
          setSaving(false); setSending(false);
          return;
        }
      } else {
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
          setSaving(false); setSending(false);
          return;
        }
        invoiceId = data.data.id;
      }

      if (andSend && invoiceId) {
        const sendRes = await fetch(`/api/invoices/${invoiceId}/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const sendData = await sendRes.json();
        if (!sendData.success) {
          setError(`Facture sauvegardée, mais erreur envoi: ${sendData.error}`);
          setSaving(false); setSending(false);
          return;
        }
        setSuccess(sendData.message || 'Facture envoyée');
      }

      setTimeout(() => onClose(true), 500);

    } catch (err) {
      console.error('Erreur sauvegarde:', err);
      setError('Erreur de connexion au serveur');
    } finally {
      setSaving(false);
      setSending(false);
    }
  };

  // Imprimer: sauvegarder + générer PDF sans email + ouvrir PDF
  const handlePrint = async () => {
    setPrinting(true);
    setError(null);

    const cleanedLineItems = lineItems.map(({ product_id, ...rest }) => rest);

    try {
      let invoiceId = invoice?.id;

      // Sauvegarder d'abord
      if (isEditing) {
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
          setPrinting(false);
          return;
        }
      } else {
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
          setPrinting(false);
          return;
        }
        invoiceId = data.data.id;
      }

      // Appeler send-email en mode print_only
      const sendRes = await fetch(`/api/invoices/${invoiceId}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ print_only: true }),
      });
      const sendData = await sendRes.json();
      if (!sendData.success) {
        setError(`Facture sauvegardée, mais erreur génération PDF: ${sendData.error}`);
        setPrinting(false);
        return;
      }

      // Ouvrir le PDF pour impression
      if (sendData.pdf_url) {
        window.open(sendData.pdf_url, '_blank');
      }

      setSuccess(sendData.message || 'Facture prête pour impression');
      setTimeout(() => onClose(true), 1000);

    } catch (err) {
      console.error('Erreur impression:', err);
      setError('Erreur de connexion au serveur');
    } finally {
      setPrinting(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(amount || 0);
  };

  const formatMovementDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('fr-CA', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const getMarginColor = (costPrice, sellingPrice) => {
    const cost = parseFloat(costPrice) || 0;
    const selling = parseFloat(sellingPrice) || 0;
    if (cost === 0) return 'text-gray-400';
    const margin = ((selling - cost) / cost) * 100;
    if (margin < 10) return 'text-red-600 dark:text-red-400';
    if (margin < 25) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-green-600 dark:text-green-400';
  };

  const getMarginPercentage = (costPrice, sellingPrice) => {
    const cost = parseFloat(costPrice) || 0;
    const selling = parseFloat(sellingPrice) || 0;
    if (cost === 0) return '-%';
    return `${(((selling - cost) / cost) * 100).toFixed(1)}%`;
  };

  // Helper: get product info for a material line
  const getProductInfo = (line) => {
    const pid = line.product_id || line.detail;
    return pid ? productDataMap[pid] : null;
  };

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

          {isLocked && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
              <Lock className="w-4 h-4 flex-shrink-0" />
              Cette facture a été envoyée et ne peut plus être modifiée.
            </div>
          )}

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

            {lineItems.length === 0 ? (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                Aucune ligne. Cliquez &quot;+ Ajouter ligne&quot; pour commencer.
              </div>
            ) : (
              lineItems.map((line, index) => {
                const productInfo = line.type === 'material' ? getProductInfo(line) : null;
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
                        <span className={`font-medium ${getMarginColor(productInfo.cost_price, line.unit_price)}`}>
                          {getMarginPercentage(productInfo.cost_price, line.unit_price)}
                        </span>
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
                          <span className={`font-medium ${getMarginColor(productInfo.cost_price, line.unit_price)}`}>
                            Marge: {getMarginPercentage(productInfo.cost_price, line.unit_price)}
                          </span>
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

            <div className="mt-3 pt-3 border-t dark:border-gray-600 flex gap-4 text-xs text-gray-500 dark:text-gray-400 justify-end flex-wrap">
              <span>M.O.: {formatCurrency(totals.totalLabor)}</span>
              <span>Transport: {formatCurrency(totals.totalTransport)}</span>
              <span>Matériaux: {formatCurrency(totals.totalMaterials)}</span>
            </div>
          </div>

          {/* Description BT/BL */}
          {sourceDescription && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description ({sourceType === 'bt' ? 'BT' : 'BL'})
              </label>
              <div className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {sourceDescription}
              </div>
            </div>
          )}

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
                disabled={saving || sending || printing}
                className="px-4 py-2.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
              <button
                onClick={handlePrint}
                disabled={saving || sending || printing}
                className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
                title="Générer le PDF et marquer comme envoyée (sans email)"
              >
                <Printer className="w-4 h-4" />
                {printing ? 'Impression...' : 'Imprimer'}
              </button>
              <button
                onClick={() => handleSave(true)}
                disabled={saving || sending || printing}
                className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {sending ? 'Envoi...' : 'Sauvegarder & Envoyer'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ====== Modal produit — Vrai modal inventaire (éditable, 3 onglets) ====== */}
      {editingProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white dark:bg-gray-900 rounded-lg w-full max-w-2xl max-h-[95vh] flex flex-col shadow-xl">
            {/* Header */}
            <div className="bg-blue-50 dark:bg-blue-950 px-6 py-4 border-b dark:border-gray-700">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-200">
                    {editingProduct.product_id}
                  </h3>
                  <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                    {editingProduct.description}
                  </p>
                </div>
                <button onClick={closeProductModal} className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900 rounded">
                  <X className="w-5 h-5 text-blue-800 dark:text-blue-300" />
                </button>
              </div>
            </div>

            {/* Onglets */}
            <div className="flex border-b dark:border-gray-700">
              <button
                onClick={() => setProductModalTab('edit')}
                className={`flex-1 py-2.5 px-3 text-sm font-medium border-b-2 transition-colors ${
                  productModalTab === 'edit'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Edit className="w-4 h-4 inline mr-1" />
                Modifier
              </button>
              <button
                onClick={() => setProductModalTab('history')}
                className={`flex-1 py-2.5 px-3 text-sm font-medium border-b-2 transition-colors ${
                  productModalTab === 'history'
                    ? 'border-gray-700 dark:border-gray-300 text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-800'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <History className="w-4 h-4 inline mr-1" />
                Mouvements
              </button>
              <button
                onClick={() => setProductModalTab('prices')}
                className={`flex-1 py-2.5 px-3 text-sm font-medium border-b-2 transition-colors ${
                  productModalTab === 'prices'
                    ? 'border-green-500 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <DollarSign className="w-4 h-4 inline mr-1" />
                Hist. Prix
              </button>
            </div>

            {/* Contenu scrollable */}
            <div className="flex-1 overflow-y-auto p-5">

              {/* === ONGLET MODIFIER === */}
              {productModalTab === 'edit' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                    <input
                      type="text"
                      value={productEditForm.description}
                      onChange={(e) => setProductEditForm({...productEditForm, description: e.target.value})}
                      onBlur={() => setProductEditForm(prev => ({...prev, description: prev.description.toUpperCase()}))}
                      style={{ textTransform: 'uppercase' }}
                      autoCorrect="on"
                      autoCapitalize="sentences"
                      spellCheck={true}
                      className="w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3"
                      placeholder="Description du produit"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dernier fournisseur</label>
                    <input
                      type="text"
                      value={productEditForm.supplier}
                      onChange={(e) => setProductEditForm({...productEditForm, supplier: e.target.value})}
                      onBlur={() => setProductEditForm(prev => ({...prev, supplier: (prev.supplier || '').toUpperCase()}))}
                      style={{ textTransform: 'uppercase' }}
                      autoCorrect="on"
                      autoCapitalize="sentences"
                      spellCheck={true}
                      className="w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3"
                      placeholder="Mis à jour automatiquement lors d'un AF"
                    />
                  </div>

                  {/* Prix coûtant + vendant côte à côte */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prix coûtant</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        value={productEditForm.cost_price}
                        onChange={(e) => setProductEditForm({...productEditForm, cost_price: e.target.value})}
                        onFocus={(e) => e.target.select()}
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        className="w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prix vendant *</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        value={productEditForm.selling_price}
                        onChange={(e) => setProductEditForm({...productEditForm, selling_price: e.target.value})}
                        onFocus={(e) => e.target.select()}
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        className="w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3"
                        placeholder="0.00"
                        required
                      />
                    </div>
                  </div>

                  {/* Calcul automatique de marge */}
                  {productEditForm.cost_price && parseFloat(productEditForm.cost_price) > 0 && (
                    <div className="bg-green-50 dark:bg-green-950 p-3 rounded-lg">
                      <label className="block text-sm font-medium text-green-800 dark:text-green-300 mb-2">Calcul automatique par marge %</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          inputMode="numeric"
                          value={productMarginPercent}
                          onChange={(e) => setProductMarginPercent(e.target.value)}
                          onFocus={(e) => e.target.select()}
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          className="flex-1 rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 shadow-sm focus:border-green-500 focus:ring-green-500 p-2"
                          placeholder="Ex: 25"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const cost = parseFloat(productEditForm.cost_price) || 0;
                            const margin = parseFloat(productMarginPercent) || 0;
                            if (cost > 0 && margin > 0) {
                              const newSellingPrice = cost * (1 + margin / 100);
                              setProductEditForm({...productEditForm, selling_price: newSellingPrice.toFixed(2)});
                            }
                          }}
                          disabled={!productMarginPercent || parseFloat(productMarginPercent) <= 0}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                          OK
                        </button>
                      </div>
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">Entrez le % de marge désiré et cliquez OK</p>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Quantité en stock</label>
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={productEditForm.stock_qty}
                      onChange={(e) => setProductEditForm({...productEditForm, stock_qty: e.target.value})}
                      onFocus={(e) => e.target.select()}
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      className="w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3"
                      placeholder="0"
                    />
                  </div>

                  {/* Aperçu marge */}
                  {productEditForm.cost_price && productEditForm.selling_price && (
                    <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Aperçu marge:</div>
                      <div className={`text-lg font-medium ${getMarginColor(productEditForm.cost_price, productEditForm.selling_price)}`}>
                        {getMarginPercentage(productEditForm.cost_price, productEditForm.selling_price)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* === ONGLET HISTORIQUE MOUVEMENTS === */}
              {productModalTab === 'history' && (
                <div>
                  {productHistoryLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600"></div>
                      <span className="ml-3 text-gray-600 dark:text-gray-400">Chargement...</span>
                    </div>
                  ) : productHistoryMovements.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                      <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>Aucun mouvement enregistré pour ce produit</p>
                    </div>
                  ) : (
                    <>
                      {/* Résumé IN/OUT */}
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3 text-center">
                          <ArrowDownCircle className="w-5 h-5 mx-auto mb-1 text-green-600 dark:text-green-400" />
                          <div className="text-lg font-bold text-green-700 dark:text-green-300">
                            {productHistoryMovements.filter(m => m.movement_type === 'IN').reduce((sum, m) => sum + (parseFloat(m.quantity) || 0), 0).toFixed(2)}
                          </div>
                          <div className="text-xs text-green-600 dark:text-green-400">Total entré (IN)</div>
                        </div>
                        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3 text-center">
                          <ArrowUpCircle className="w-5 h-5 mx-auto mb-1 text-red-600 dark:text-red-400" />
                          <div className="text-lg font-bold text-red-700 dark:text-red-300">
                            {productHistoryMovements.filter(m => m.movement_type === 'OUT').reduce((sum, m) => sum + (parseFloat(m.quantity) || 0), 0).toFixed(2)}
                          </div>
                          <div className="text-xs text-red-600 dark:text-red-400">Total sorti (OUT)</div>
                        </div>
                      </div>

                      {/* Liste des mouvements */}
                      <div className="space-y-2">
                        {productHistoryMovements.map((movement, idx) => {
                          const isIn = movement.movement_type === 'IN';
                          return (
                            <div
                              key={movement.id || idx}
                              className={`border rounded-lg p-3 ${
                                isIn ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'
                              }`}
                            >
                              <div className="flex justify-between items-start">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                                      isIn ? 'bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200' : 'bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200'
                                    }`}>
                                      {isIn ? '+ IN' : '- OUT'}
                                    </span>
                                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                      {parseFloat(movement.quantity).toFixed(2)} {movement.unit}
                                    </span>
                                  </div>
                                  <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                                    {movement.notes || movement.reference_number || '-'}
                                  </p>
                                  {movement.reference_type && (
                                    <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase">
                                      {movement.reference_type === 'supplier_purchase' && 'Achat fournisseur'}
                                      {movement.reference_type === 'work_order' && 'Bon de travail'}
                                      {movement.reference_type === 'delivery_note' && 'Bon de livraison'}
                                      {movement.reference_type === 'delivery_slip' && 'Bon de livraison'}
                                      {movement.reference_type === 'direct_receipt' && 'Réception directe'}
                                      {movement.reference_type === 'adjustment' && 'Ajustement'}
                                      {!['supplier_purchase', 'work_order', 'delivery_note', 'delivery_slip', 'direct_receipt', 'adjustment'].includes(movement.reference_type) && movement.reference_type}
                                    </span>
                                  )}
                                </div>
                                <div className="text-right ml-3 shrink-0">
                                  <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                    {formatMovementDate(movement.created_at)}
                                  </div>
                                  {movement.unit_cost > 0 && (
                                    <div className="text-[10px] text-gray-400 dark:text-gray-500">
                                      {formatCurrency(movement.unit_cost)}/{movement.unit}
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
              )}

              {/* === ONGLET HISTORIQUE PRIX === */}
              {productModalTab === 'prices' && (
                <div className="space-y-4">
                  {/* Prix actuel */}
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <div className="text-xs font-medium text-blue-500 dark:text-blue-400 uppercase tracking-wide mb-2">Prix actuel</div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Coûtant</div>
                        <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(editingProduct.cost_price)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Vendant</div>
                        <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(editingProduct.selling_price)}</div>
                      </div>
                    </div>
                    <div className={`text-sm font-medium mt-1 ${getMarginColor(editingProduct.cost_price, editingProduct.selling_price)}`}>
                      Marge: {getMarginPercentage(editingProduct.cost_price, editingProduct.selling_price)}
                    </div>
                  </div>

                  {/* Historique des prix */}
                  {(editingProduct.cost_price_1st != null || editingProduct.selling_price_1st != null) ? (
                    <div className="space-y-3">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Historique (du plus récent au plus ancien)</div>

                      {(editingProduct.cost_price_1st != null || editingProduct.selling_price_1st != null) && (
                        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                          <div className="text-xs font-medium text-gray-400 mb-1">Prix précédent (n-1)</div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-xs text-gray-400">Coûtant</div>
                              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                {editingProduct.cost_price_1st != null ? formatCurrency(editingProduct.cost_price_1st) : '-'}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-400">Vendant</div>
                              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                {editingProduct.selling_price_1st != null ? formatCurrency(editingProduct.selling_price_1st) : '-'}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {(editingProduct.cost_price_2nd != null || editingProduct.selling_price_2nd != null) && (
                        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                          <div className="text-xs font-medium text-gray-400 mb-1">Avant-dernier (n-2)</div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-xs text-gray-400">Coûtant</div>
                              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                {editingProduct.cost_price_2nd != null ? formatCurrency(editingProduct.cost_price_2nd) : '-'}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-400">Vendant</div>
                              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                {editingProduct.selling_price_2nd != null ? formatCurrency(editingProduct.selling_price_2nd) : '-'}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {(editingProduct.cost_price_3rd != null || editingProduct.selling_price_3rd != null) && (
                        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                          <div className="text-xs font-medium text-gray-400 mb-1">Plus ancien (n-3)</div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-xs text-gray-400">Coûtant</div>
                              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                {editingProduct.cost_price_3rd != null ? formatCurrency(editingProduct.cost_price_3rd) : '-'}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-400">Vendant</div>
                              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                {editingProduct.selling_price_3rd != null ? formatCurrency(editingProduct.selling_price_3rd) : '-'}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>Aucun historique de prix enregistré</p>
                      <p className="text-xs mt-1">L&apos;historique se remplira au prochain changement de prix</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer avec boutons */}
            <div className="bg-gray-50 dark:bg-gray-800 px-6 py-4 flex gap-3 border-t dark:border-gray-700">
              <button
                onClick={closeProductModal}
                disabled={productSaving}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300 disabled:opacity-50"
              >
                {productModalTab === 'edit' ? 'Annuler' : 'Fermer'}
              </button>
              {productModalTab === 'edit' && (
                <button
                  onClick={saveProductChanges}
                  disabled={productSaving || !productEditForm.selling_price}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {productSaving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Sauvegarde...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Sauvegarder
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
