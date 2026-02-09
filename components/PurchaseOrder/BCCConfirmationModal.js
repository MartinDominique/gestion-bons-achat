/**
 * @file components/PurchaseOrder/BCCConfirmationModal.js
 * @description Modal de confirmation de commande client (BCC)
 *              - Affiche les articles du BA avec quantités commandées, B/O, livrées
 *              - Permet d'ajouter un délai de livraison par article
 *              - Sélection des destinataires email (contacts client)
 *              - Génère un PDF BCC et l'envoie par email via l'API
 * @version 1.0.0
 * @date 2026-02-09
 * @changelog
 *   1.0.0 - Version initiale - Création du modal BCC
 */

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Send, Loader2, Mail, Package, AlertCircle, FileText, Plus, Trash2 } from 'lucide-react';

const BCCConfirmationModal = ({ isOpen, onClose, purchaseOrder, items: baItems, supplierPurchases }) => {
  // États du formulaire BCC
  const [bccItems, setBccItems] = useState([]);
  const [recipientEmails, setRecipientEmails] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Données du client
  const [clientData, setClientData] = useState(null);

  // Charger les données au montage
  useEffect(() => {
    if (isOpen && purchaseOrder) {
      loadBCCData();
    }
  }, [isOpen, purchaseOrder]);

  /**
   * Charge toutes les données nécessaires pour le BCC:
   * - Articles du BA (baItems)
   * - Articles des AF liés (supplierPurchases)
   * - Quantités livrées (delivery_slips + delivery_slip_items)
   * - Contacts client
   */
  const loadBCCData = async () => {
    try {
      setIsLoading(true);
      setError('');

      // 1. Charger le client pour les contacts email
      let client = null;

      // Essayer par client_id d'abord, puis par client_name
      if (purchaseOrder.client_id) {
        const { data } = await supabase
          .from('clients')
          .select('*')
          .eq('id', purchaseOrder.client_id)
          .single();
        client = data;
      }

      if (!client && purchaseOrder.client_name) {
        const { data } = await supabase
          .from('clients')
          .select('*')
          .eq('name', purchaseOrder.client_name)
          .single();
        client = data;
      }

      if (client) {
        setClientData(client);
        // Pré-remplir les emails disponibles - ne pas pré-sélectionner
        // L'utilisateur choisira les destinataires
      }

      // Aussi récupérer l'email directement du BA si disponible
      if (purchaseOrder.client_email && !client?.email?.includes(purchaseOrder.client_email)) {
        // L'email du formulaire BA est différent, on le garde comme option
      }

      // 2. Charger les livraisons pour connaître les quantités déjà livrées
      let deliveredQuantities = {};
      if (purchaseOrder.id) {
        const { data: slips } = await supabase
          .from('delivery_slips')
          .select('id')
          .eq('purchase_order_id', purchaseOrder.id);

        if (slips && slips.length > 0) {
          const slipIds = slips.map(s => s.id);
          const { data: slipItems } = await supabase
            .from('delivery_slip_items')
            .select('product_id, quantity')
            .in('delivery_slip_id', slipIds);

          if (slipItems) {
            slipItems.forEach(si => {
              const key = si.product_id;
              deliveredQuantities[key] = (deliveredQuantities[key] || 0) + parseFloat(si.quantity || 0);
            });
          }
        }
      }

      // 3. Calculer les quantités en backorder depuis les AF
      let afQuantities = {}; // { product_id: { ordered: X, received: Y } }
      if (supplierPurchases && supplierPurchases.length > 0) {
        supplierPurchases.forEach(sp => {
          if (sp.items && Array.isArray(sp.items)) {
            sp.items.forEach(afItem => {
              const code = afItem.product_id || afItem.code || afItem.sku || '';
              if (!code) return;
              if (!afQuantities[code]) {
                afQuantities[code] = { ordered: 0, received: 0 };
              }
              afQuantities[code].ordered += parseFloat(afItem.quantity || afItem.qty || 0);
              afQuantities[code].received += parseFloat(afItem.received_quantity || afItem.received_qty || 0);
            });
          }
        });
      }

      // 4. Construire les items BCC à partir des articles du BA
      const bccData = (baItems || []).map(item => {
        const code = item.product_id || '';
        const qtyCmd = parseFloat(item.quantity || 0);
        const unitPrice = parseFloat(item.selling_price || 0);
        const qtyDelivered = deliveredQuantities[code] || 0;
        const afInfo = afQuantities[code] || { ordered: 0, received: 0 };
        const qtyBackorder = Math.max(0, afInfo.ordered - afInfo.received);

        return {
          code: code,
          description: item.description || '',
          qty_ordered: qtyCmd,
          unit: item.unit || 'unité',
          unit_price: unitPrice,
          line_price: qtyCmd * unitPrice,
          qty_backorder: qtyBackorder,
          qty_delivered: qtyDelivered,
          delivery_estimate: '',
          notes: '',
          include: true,
        };
      });

      setBccItems(bccData);
    } catch (err) {
      console.error('Erreur chargement données BCC:', err);
      setError('Erreur lors du chargement des données: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Calculer les totaux
  const totals = useMemo(() => {
    const includedItems = bccItems.filter(item => item.include);
    const subtotal = includedItems.reduce((sum, item) => sum + item.line_price, 0);
    const tps = subtotal * 0.05;
    const tvq = subtotal * 0.09975;
    const total = subtotal + tps + tvq;
    return { subtotal, tps, tvq, total };
  }, [bccItems]);

  // Mettre à jour un item BCC
  const updateBccItem = (index, field, value) => {
    setBccItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      // Recalculer line_price si qty ou price changent
      if (field === 'qty_ordered' || field === 'unit_price') {
        const qty = field === 'qty_ordered' ? parseFloat(value) || 0 : updated[index].qty_ordered;
        const price = field === 'unit_price' ? parseFloat(value) || 0 : updated[index].unit_price;
        updated[index].line_price = qty * price;
      }
      return updated;
    });
  };

  // Gestion des emails
  const addEmail = () => {
    const email = newEmail.trim().toLowerCase();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !recipientEmails.includes(email)) {
      setRecipientEmails(prev => [...prev, email]);
      setNewEmail('');
    }
  };

  const removeEmail = (email) => {
    setRecipientEmails(prev => prev.filter(e => e !== email));
  };

  const toggleClientEmail = (email) => {
    if (recipientEmails.includes(email)) {
      removeEmail(email);
    } else {
      setRecipientEmails(prev => [...prev, email]);
    }
  };

  // Envoyer le BCC
  const sendBCC = async () => {
    if (recipientEmails.length === 0) {
      setError('Veuillez ajouter au moins un destinataire.');
      return;
    }

    const includedItems = bccItems.filter(item => item.include);
    if (includedItems.length === 0) {
      setError('Veuillez inclure au moins un article dans la confirmation.');
      return;
    }

    try {
      setIsSending(true);
      setError('');
      setSendResult(null);

      const response = await fetch(`/api/purchase-orders/${purchaseOrder.id}/send-confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchase_order: {
            id: purchaseOrder.id,
            po_number: purchaseOrder.po_number,
            client_name: purchaseOrder.client_name || clientData?.name || '',
            client_id: purchaseOrder.client_id,
            date: purchaseOrder.date,
            description: purchaseOrder.description || '',
          },
          client: clientData ? {
            name: clientData.name,
            address: clientData.address || '',
            phone: clientData.phone || '',
            email: clientData.email || '',
          } : null,
          bcc_items: includedItems.map(item => ({
            code: item.code,
            description: item.description,
            qty_ordered: item.qty_ordered,
            unit: item.unit,
            unit_price: item.unit_price,
            line_price: item.line_price,
            qty_backorder: item.qty_backorder,
            qty_delivered: item.qty_delivered,
            delivery_estimate: item.delivery_estimate,
            notes: item.notes,
          })),
          totals: totals,
          recipient_emails: recipientEmails,
          notes: notes,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Erreur lors de l\'envoi');
      }

      setSendResult({
        success: true,
        message: `Confirmation envoyee a ${recipientEmails.join(', ')}`,
        messageId: result.messageId,
      });

    } catch (err) {
      console.error('Erreur envoi BCC:', err);
      setError('Erreur lors de l\'envoi: ' + err.message);
    } finally {
      setIsSending(false);
    }
  };

  // Formater montant
  const fmt = (amount) => '$' + (parseFloat(amount) || 0).toFixed(2);

  // Emails disponibles du client (tous les contacts)
  const availableEmails = useMemo(() => {
    const emails = [];
    const seen = new Set();

    const addEmail = (email, label) => {
      if (email && !seen.has(email.toLowerCase())) {
        seen.add(email.toLowerCase());
        emails.push({ email, label });
      }
    };

    // Emails du dossier client
    if (clientData) {
      addEmail(clientData.email, clientData.contact_name || 'Contact principal');
      addEmail(clientData.email_2, clientData.contact_name_2 || 'Contact 2');
      addEmail(clientData.email_admin, clientData.contact_name_admin || 'Admin/Facturation');
    }

    // Email du formulaire BA (si different)
    if (purchaseOrder?.client_email) {
      addEmail(purchaseOrder.client_email, 'Email BA');
    }

    return emails;
  }, [clientData, purchaseOrder]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-4 rounded-t-xl flex-shrink-0">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Confirmation de Commande (BCC)
              </h2>
              <p className="text-white/80 text-sm mt-1">
                BA #{purchaseOrder?.po_number} - {purchaseOrder?.client_name}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Contenu scrollable */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 min-h-0">
          {/* Message d'erreur */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm">{error}</p>
                <button onClick={() => setError('')} className="text-xs underline mt-1">Fermer</button>
              </div>
            </div>
          )}

          {/* Message de succès */}
          {sendResult?.success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
              <p className="font-medium">Confirmation envoyee avec succes!</p>
              <p className="text-sm mt-1">{sendResult.message}</p>
              <button
                onClick={onClose}
                className="mt-3 bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700"
              >
                Fermer
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              <span className="ml-3 text-gray-600">Chargement des donnees...</span>
            </div>
          ) : !sendResult?.success && (
            <>
              {/* Section Articles */}
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Package className="w-5 h-5 text-emerald-600" />
                  Articles de la commande
                </h3>

                {/* Table desktop */}
                <div className="hidden sm:block overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-600 w-8">
                          <input
                            type="checkbox"
                            checked={bccItems.every(i => i.include)}
                            onChange={(e) => {
                              setBccItems(prev => prev.map(item => ({ ...item, include: e.target.checked })));
                            }}
                            className="rounded"
                          />
                        </th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-600">Code</th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-600">Description</th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-600">Qte Cmd</th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-600">Prix Unit.</th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-600">Prix Ligne</th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-600">B/O</th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-600">Livree</th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-gray-600">Delai</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {bccItems.map((item, index) => (
                        <tr key={index} className={`${item.include ? 'bg-white' : 'bg-gray-50 opacity-60'}`}>
                          <td className="px-2 py-2">
                            <input
                              type="checkbox"
                              checked={item.include}
                              onChange={(e) => updateBccItem(index, 'include', e.target.checked)}
                              className="rounded"
                            />
                          </td>
                          <td className="px-2 py-2 text-xs font-mono font-medium text-gray-900">
                            {item.code}
                          </td>
                          <td className="px-2 py-2 text-xs text-gray-700 max-w-[200px] truncate" title={item.description}>
                            {item.description}
                          </td>
                          <td className="px-2 py-2 text-center text-xs font-medium">
                            {item.qty_ordered}
                          </td>
                          <td className="px-2 py-2 text-center text-xs">
                            {fmt(item.unit_price)}
                          </td>
                          <td className="px-2 py-2 text-center text-xs font-medium text-green-700">
                            {fmt(item.line_price)}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {item.qty_backorder > 0 ? (
                              <span className="bg-orange-100 text-orange-800 text-xs px-1.5 py-0.5 rounded-full font-medium">
                                {item.qty_backorder}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">0</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {item.qty_delivered > 0 ? (
                              <span className="bg-green-100 text-green-800 text-xs px-1.5 py-0.5 rounded-full font-medium">
                                {item.qty_delivered}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">0</span>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="text"
                              value={item.delivery_estimate}
                              onChange={(e) => updateBccItem(index, 'delivery_estimate', e.target.value)}
                              placeholder="Ex: 2-3 sem."
                              className="w-24 px-2 py-1 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                              disabled={!item.include}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Cards mobile */}
                <div className="sm:hidden space-y-3">
                  {bccItems.map((item, index) => (
                    <div
                      key={index}
                      className={`border rounded-lg p-3 ${item.include ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={item.include}
                          onChange={(e) => updateBccItem(index, 'include', e.target.checked)}
                          className="rounded mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start">
                            <div className="font-mono text-xs font-bold text-gray-900">{item.code}</div>
                            <div className="text-xs font-bold text-green-700">{fmt(item.line_price)}</div>
                          </div>
                          <div className="text-xs text-gray-600 truncate mt-0.5">{item.description}</div>

                          <div className="flex flex-wrap gap-2 mt-2 text-xs">
                            <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                              Cmd: {item.qty_ordered}
                            </span>
                            <span className="bg-gray-50 text-gray-600 px-1.5 py-0.5 rounded">
                              {fmt(item.unit_price)}/u
                            </span>
                            {item.qty_backorder > 0 && (
                              <span className="bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded font-medium">
                                B/O: {item.qty_backorder}
                              </span>
                            )}
                            {item.qty_delivered > 0 && (
                              <span className="bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-medium">
                                Livree: {item.qty_delivered}
                              </span>
                            )}
                          </div>

                          <input
                            type="text"
                            value={item.delivery_estimate}
                            onChange={(e) => updateBccItem(index, 'delivery_estimate', e.target.value)}
                            placeholder="Delai livraison (ex: 2-3 sem.)"
                            className="mt-2 w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-emerald-500"
                            disabled={!item.include}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {bccItems.length === 0 && (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    Aucun article dans ce bon d'achat.
                  </div>
                )}
              </div>

              {/* Section Totaux */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="max-w-xs ml-auto space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Sous-total:</span>
                    <span className="font-medium">{fmt(totals.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">TPS (5%):</span>
                    <span>{fmt(totals.tps)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">TVQ (9.975%):</span>
                    <span>{fmt(totals.tvq)}</span>
                  </div>
                  <div className="border-t border-gray-300 pt-1 mt-1 flex justify-between">
                    <span className="font-bold text-gray-900">Total:</span>
                    <span className="font-bold text-emerald-700 text-base">{fmt(totals.total)}</span>
                  </div>
                </div>
              </div>

              {/* Section Destinataires */}
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Mail className="w-5 h-5 text-emerald-600" />
                  Destinataires
                </h3>

                {/* Contacts du dossier client */}
                {availableEmails.length > 0 && (
                  <div className="mb-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-xs font-medium text-blue-700 mb-2">Emails du dossier client (cliquer pour selectionner):</p>
                    <div className="flex flex-wrap gap-2">
                      {availableEmails.map(({ email, label }) => (
                        <button
                          key={email}
                          onClick={() => toggleClientEmail(email)}
                          className={`text-xs px-3 py-2 rounded-lg border-2 transition-all min-h-[44px] ${
                            recipientEmails.includes(email)
                              ? 'bg-emerald-100 border-emerald-400 text-emerald-800 shadow-sm font-medium'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300 hover:bg-emerald-50'
                          }`}
                        >
                          <span className="block font-medium">{recipientEmails.includes(email) ? '✓ ' : ''}{label}</span>
                          <span className="block text-[10px] opacity-75">{email}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {availableEmails.length === 0 && (
                  <div className="mb-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-xs text-yellow-700">Aucun email dans le dossier client. Ajoutez un email manuellement ci-dessous.</p>
                  </div>
                )}

                {/* Ajouter un email manuellement */}
                <div className="mt-2">
                  <p className="text-xs text-gray-500 mb-1">Ajouter un autre email:</p>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addEmail()}
                      placeholder="Entrer un email non dans le dossier..."
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 min-h-[44px]"
                      inputMode="email"
                    />
                    <button
                      onClick={addEmail}
                      disabled={!newEmail.trim()}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-gray-300 transition-colors min-h-[44px] text-sm"
                    >
                      Ajouter
                    </button>
                  </div>
                </div>

                {/* Liste emails sélectionnés */}
                {recipientEmails.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {recipientEmails.map(email => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 text-xs px-2 py-1 rounded-full"
                      >
                        {email}
                        <button
                          onClick={() => removeEmail(email)}
                          className="text-emerald-600 hover:text-red-600 ml-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {recipientEmails.length === 0 && (
                  <p className="text-xs text-orange-600 mt-2 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Au moins un destinataire est requis
                  </p>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes / Message (optionnel)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Message additionnel pour le client..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer avec bouton envoyer */}
        {!sendResult?.success && (
          <div className="border-t border-gray-200 p-4 flex-shrink-0 bg-gray-50 rounded-b-xl">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
              <p className="text-xs text-gray-500">
                Le PDF sera genere et envoye par email au(x) destinataire(s) selectionne(s), avec copie au bureau.
              </p>
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  onClick={onClose}
                  className="flex-1 sm:flex-none px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 text-sm transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={sendBCC}
                  disabled={isSending || recipientEmails.length === 0 || bccItems.filter(i => i.include).length === 0}
                  className="flex-1 sm:flex-none px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-medium transition-colors min-h-[44px]"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Envoi en cours...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Envoyer la confirmation
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BCCConfirmationModal;
