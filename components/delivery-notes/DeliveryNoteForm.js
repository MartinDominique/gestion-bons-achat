/**
 * @file components/delivery-notes/DeliveryNoteForm.js
 * @description Formulaire de création/édition d'un Bon de Livraison (BL)
 *              - Sélection client + BA lié
 *              - Date de livraison + description
 *              - Matériaux (réutilise MaterialSelector)
 *              - Prix Jobé toggle
 *              - Emails destinataires + actions
 *              Mobile-first: 95% usage tablette/mobile
 * @version 1.0.0
 * @date 2026-02-12
 * @changelog
 *   1.0.0 - Version initiale
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Package, Calendar, FileText, User, Mail,
  Save, Eye, ChevronDown, ChevronUp, X, Plus, Truck
} from 'lucide-react';
import ClientSelect from '../work-orders/ClientSelect';
import MaterialSelector from '../work-orders/MaterialSelector';

export default function DeliveryNoteForm({
  mode = 'create',
  deliveryNote = null,
  onSave,
  onCancel,
  onFormChange,
  saving = false
}) {
  const router = useRouter();
  const isEdit = mode === 'edit';

  // =============================================
  // STATE
  // =============================================

  // Client
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientId, setClientId] = useState('');

  // BA lié
  const [linkedPoId, setLinkedPoId] = useState('');
  const [linkedPoMode, setLinkedPoMode] = useState('list'); // 'list' or 'manual'
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [isManualPo, setIsManualPo] = useState(false);

  // Livraison
  const [deliveryDate, setDeliveryDate] = useState(() => {
    const now = new Date();
    return now.toISOString().split('T')[0];
  });
  const [deliveryDescription, setDeliveryDescription] = useState('');

  // Matériaux
  const [materials, setMaterials] = useState([]);

  // Options
  const [isPrixJobe, setIsPrixJobe] = useState(false);

  // Emails
  const [recipientEmails, setRecipientEmails] = useState([]);
  const [showEmailSection, setShowEmailSection] = useState(false);

  // UI
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [savedId, setSavedId] = useState(null);

  // =============================================
  // INITIALIZE FROM EXISTING DATA (EDIT MODE)
  // =============================================

  useEffect(() => {
    if (isEdit && deliveryNote) {
      setClientId(deliveryNote.client_id || '');
      setSelectedClient(deliveryNote.client || null);
      setLinkedPoId(deliveryNote.linked_po_id || '');
      setDeliveryDate(deliveryNote.delivery_date || new Date().toISOString().split('T')[0]);
      setDeliveryDescription(deliveryNote.delivery_description || '');
      setIsPrixJobe(deliveryNote.is_prix_jobe || false);
      setRecipientEmails(deliveryNote.recipient_emails || []);
      setSavedId(deliveryNote.id);

      // Charger les matériaux
      if (deliveryNote.materials && deliveryNote.materials.length > 0) {
        const formattedMaterials = deliveryNote.materials.map((m, idx) => ({
          id: m.id || `existing-${idx}`,
          product_id: m.product_id || m.product_code || '',
          code: m.code || m.product_id || '',
          description: m.description || m.product?.description || '',
          quantity: m.quantity || 1,
          unit: m.unit || 'UN',
          unit_price: m.unit_price || m.product?.selling_price || 0,
          showPrice: m.show_price || false,
          show_price: m.show_price || false,
          notes: m.notes || '',
          product: m.product || null,
        }));
        setMaterials(formattedMaterials);
      }

      // Si linked_po_id est un nombre, c'est un ID existant
      if (deliveryNote.linked_po_id) {
        setLinkedPoMode('list');
      }
    }
  }, [isEdit, deliveryNote]);

  // =============================================
  // LOAD PURCHASE ORDERS WHEN CLIENT CHANGES
  // =============================================

  useEffect(() => {
    if (clientId) {
      loadPurchaseOrders(clientId);
    } else {
      setPurchaseOrders([]);
    }
  }, [clientId]);

  const loadPurchaseOrders = async (cid) => {
    try {
      const response = await fetch(`/api/purchase-orders?client_id=${cid}`);
      if (response.ok) {
        const data = await response.json();
        const pos = data.data || data || [];
        setPurchaseOrders(Array.isArray(pos) ? pos : []);
      }
    } catch (err) {
      console.error('Erreur chargement POs:', err);
      setPurchaseOrders([]);
    }
  };

  // =============================================
  // HANDLE CLIENT CHANGE
  // =============================================

  const handleClientChange = (client) => {
    setSelectedClient(client);
    setClientId(client?.id || '');
    setLinkedPoId('');
    setIsManualPo(false);

    // Pré-remplir les emails
    if (client) {
      const emails = [];
      if (client.email) emails.push(client.email);
      if (client.email_2) emails.push(client.email_2);
      if (client.email_admin) emails.push(client.email_admin);
      setRecipientEmails(emails);
    } else {
      setRecipientEmails([]);
    }

    onFormChange?.();
  };

  // =============================================
  // HANDLE EMAIL TOGGLE
  // =============================================

  const toggleEmail = (email) => {
    setRecipientEmails(prev => {
      if (prev.includes(email)) {
        return prev.filter(e => e !== email);
      }
      return [...prev, email];
    });
    onFormChange?.();
  };

  // =============================================
  // BUILD PAYLOAD
  // =============================================

  const buildPayload = () => {
    return {
      client_id: clientId,
      client_name: selectedClient?.name || '',
      linked_po_id: linkedPoId || null,
      is_manual_po: isManualPo,
      delivery_date: deliveryDate,
      delivery_description: deliveryDescription,
      materials: materials.map(m => ({
        product_id: m.product_id || m.code || null,
        code: m.code || m.product_id || '',
        description: m.description || '',
        quantity: parseFloat(m.quantity) || 1,
        unit: m.unit || 'UN',
        unit_price: parseFloat(m.unit_price) || 0,
        showPrice: m.showPrice || m.show_price || false,
        show_price: m.showPrice || m.show_price || false,
        notes: m.notes || '',
      })),
      is_prix_jobe: isPrixJobe,
      recipient_emails: recipientEmails,
    };
  };

  // =============================================
  // SAVE ACTIONS
  // =============================================

  const handleSaveDraft = async () => {
    const payload = buildPayload();
    payload.status = 'draft';
    const result = await onSave(payload, 'draft');
    if (result?.id) {
      setSavedId(result.id);
    }
  };

  const handlePresentToClient = async () => {
    if (!clientId) {
      alert('Veuillez sélectionner un client avant de présenter pour signature.');
      return;
    }

    const payload = buildPayload();
    payload.status = 'ready_for_signature';

    const result = await onSave(payload, 'ready_for_signature');

    if (result) {
      const blId = result.id || savedId;
      if (blId) {
        setTimeout(() => {
          router.push(`/bons-travail/bl/${blId}/client`);
        }, 500);
      }
    }
  };

  // =============================================
  // AVAILABLE EMAILS
  // =============================================

  const getAvailableEmails = () => {
    if (!selectedClient) return [];
    const emails = [];
    if (selectedClient.email) {
      emails.push({ email: selectedClient.email, label: 'Email principal', key: 'email' });
    }
    if (selectedClient.email_2) {
      emails.push({ email: selectedClient.email_2, label: 'Email 2', key: 'email_2' });
    }
    if (selectedClient.email_admin) {
      emails.push({ email: selectedClient.email_admin, label: 'Email admin', key: 'email_admin' });
    }
    return emails;
  };

  // =============================================
  // RENDER
  // =============================================

  return (
    <div className="space-y-4">
      {/* ==========================================
          SECTION 1: CLIENT
          ========================================== */}
      <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 border border-gray-200">
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
          <User className="mr-2 text-teal-600" size={20} />
          Client
        </h2>

        <ClientSelect
          selectedClientId={clientId}
          onClientChange={handleClientChange}
        />
      </div>

      {/* ==========================================
          SECTION 2: DÉTAILS LIVRAISON
          ========================================== */}
      <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 border border-gray-200">
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
          <Truck className="mr-2 text-orange-500" size={20} />
          Détails de la livraison
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Date de livraison */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="inline mr-1" size={14} />
              Date de livraison
            </label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => { setDeliveryDate(e.target.value); onFormChange?.(); }}
              className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-base"
              style={{ minHeight: '44px' }}
            />
          </div>

          {/* BA lié */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <FileText className="inline mr-1" size={14} />
              BA Client (optionnel)
            </label>

            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => { setLinkedPoMode('list'); setIsManualPo(false); onFormChange?.(); }}
                className={`px-3 py-1 rounded text-xs font-medium ${
                  linkedPoMode === 'list'
                    ? 'bg-teal-100 text-teal-700 border border-teal-300'
                    : 'bg-gray-100 text-gray-600 border border-gray-200'
                }`}
                style={{ minHeight: '44px' }}
              >
                Liste
              </button>
              <button
                type="button"
                onClick={() => { setLinkedPoMode('manual'); setIsManualPo(true); onFormChange?.(); }}
                className={`px-3 py-1 rounded text-xs font-medium ${
                  linkedPoMode === 'manual'
                    ? 'bg-teal-100 text-teal-700 border border-teal-300'
                    : 'bg-gray-100 text-gray-600 border border-gray-200'
                }`}
                style={{ minHeight: '44px' }}
              >
                Manuel
              </button>
            </div>

            {linkedPoMode === 'list' ? (
              <select
                value={linkedPoId}
                onChange={(e) => { setLinkedPoId(e.target.value); onFormChange?.(); }}
                className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-base"
                style={{ minHeight: '44px' }}
              >
                <option value="">-- Aucun BA --</option>
                {purchaseOrders.map(po => (
                  <option key={po.id} value={po.id}>
                    {po.po_number} {po.description ? `- ${po.description.substring(0, 40)}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={linkedPoId}
                onChange={(e) => { setLinkedPoId(e.target.value); onFormChange?.(); }}
                placeholder="Entrer le # BA ou Job client"
                className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-base"
                style={{ minHeight: '44px' }}
              />
            )}
          </div>
        </div>

        {/* Description */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description de la livraison
          </label>
          <textarea
            value={deliveryDescription}
            onChange={(e) => { setDeliveryDescription(e.target.value); onFormChange?.(); }}
            placeholder="Description du matériel livré..."
            rows={3}
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-base resize-none"
          />
        </div>
      </div>

      {/* ==========================================
          SECTION 3: MATÉRIAUX
          ========================================== */}
      <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 border border-gray-200">
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
          <Package className="mr-2 text-blue-600" size={20} />
          Matériaux livrés
          {materials.length > 0 && (
            <span className="ml-2 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-sm">
              {materials.length}
            </span>
          )}
        </h2>

        <MaterialSelector
          materials={materials}
          onMaterialsChange={(newMaterials) => { setMaterials(newMaterials); onFormChange?.(); }}
        />
      </div>

      {/* ==========================================
          SECTION 4: OPTIONS AVANCÉES
          ========================================== */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full p-4 flex items-center justify-between text-gray-700 hover:bg-gray-50"
          style={{ minHeight: '44px' }}
        >
          <span className="font-medium">Options avancées</span>
          {showAdvanced ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>

        {showAdvanced && (
          <div className="p-4 pt-0 space-y-4">
            {/* Prix Jobé */}
            <div className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div>
                <span className="font-medium text-yellow-800">Prix Jobé</span>
                <p className="text-xs text-yellow-600">PDF simplifié pour le client</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPrixJobe}
                  onChange={(e) => { setIsPrixJobe(e.target.checked); onFormChange?.(); }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-yellow-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-500"></div>
              </label>
            </div>

            {/* Emails destinataires */}
            <div>
              <h3 className="font-medium text-gray-700 mb-2 flex items-center">
                <Mail className="mr-2" size={16} />
                Emails destinataires
              </h3>

              {getAvailableEmails().length > 0 ? (
                <div className="space-y-2">
                  {getAvailableEmails().map(({ email, label, key }) => (
                    <label
                      key={key}
                      className="flex items-center p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100"
                      style={{ minHeight: '44px' }}
                    >
                      <input
                        type="checkbox"
                        checked={recipientEmails.includes(email)}
                        onChange={() => toggleEmail(email)}
                        className="w-5 h-5 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                      />
                      <div className="ml-3">
                        <span className="text-sm font-medium text-gray-700">{label}</span>
                        <span className="text-xs text-gray-500 ml-2">{email}</span>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">
                  Sélectionnez un client pour voir les emails disponibles
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ==========================================
          SECTION 5: BOUTONS D'ACTION
          ========================================== */}
      <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 border border-gray-200">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Annuler */}
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
            style={{ minHeight: '44px' }}
          >
            <X className="inline mr-2" size={18} />
            Annuler
          </button>

          {/* Sauvegarder brouillon */}
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving || !clientId}
            className="flex-1 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ minHeight: '44px' }}
          >
            {saving ? (
              <span className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Sauvegarde...
              </span>
            ) : (
              <>
                <Save className="inline mr-2" size={18} />
                Sauvegarder brouillon
              </>
            )}
          </button>

          {/* Présenter au client */}
          <button
            type="button"
            onClick={handlePresentToClient}
            disabled={saving || !clientId || materials.length === 0}
            className="flex-1 px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ minHeight: '44px' }}
          >
            <Eye className="inline mr-2" size={18} />
            Présenter au client
          </button>
        </div>

        {/* Indicateurs */}
        {!clientId && (
          <p className="mt-2 text-sm text-orange-600">
            Sélectionnez un client pour activer les boutons
          </p>
        )}
        {clientId && materials.length === 0 && (
          <p className="mt-2 text-sm text-orange-600">
            Ajoutez au moins un matériau pour pouvoir présenter au client
          </p>
        )}
      </div>
    </div>
  );
}
