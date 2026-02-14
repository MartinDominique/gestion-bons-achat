/**
 * @file components/delivery-notes/DeliveryNoteForm.js
 * @description Formulaire de création/édition d'un Bon de Livraison (BL)
 *              - Sélection client identique au BT (select natif + boutons modifier/ajouter)
 *              - Emails destinataires sous la section client
 *              - Prix Jobé avant matériaux
 *              - Date de livraison + description (MAJUSCULES)
 *              - BA client manuel (MAJUSCULES)
 *              - Matériaux (réutilise MaterialSelector)
 *              Mobile-first: 95% usage tablette/mobile
 * @version 2.0.0
 * @date 2026-02-14
 * @changelog
 *   2.0.0 - Refonte sélection client (copie BT), uppercase BA/description,
 *           réorganisation sections, boutons modifier/ajouter client
 *   1.1.0 - Fix props ClientSelect (selectedClient + onClientSelect)
 *   1.0.0 - Version initiale
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Package, Calendar, FileText, User, Mail,
  Save, Eye, X, Plus, Truck, PenTool
} from 'lucide-react';
import ClientModal from '../ClientModal';
import MaterialSelector from '../work-orders/MaterialSelector';
import toast from 'react-hot-toast';

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

  // Clients
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientId, setClientId] = useState('');
  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);

  // BA lié
  const [linkedPoId, setLinkedPoId] = useState('');
  const [linkedPoMode, setLinkedPoMode] = useState('list'); // 'list' or 'manual'
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [isManualPo, setIsManualPo] = useState(false);

  // Livraison
  const [deliveryDate, setDeliveryDate] = useState(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const localDate = new Date(now.getTime() - offset);
    return localDate.toISOString().split('T')[0];
  });
  const [deliveryDescription, setDeliveryDescription] = useState('');

  // Matériaux
  const [materials, setMaterials] = useState([]);

  // Options
  const [isPrixJobe, setIsPrixJobe] = useState(false);

  // Emails
  const [selectedEmails, setSelectedEmails] = useState({
    email: true,
    email_2: false,
    email_admin: true
  });

  // UI
  const [savedId, setSavedId] = useState(null);

  // =============================================
  // LOAD CLIENTS (identique au BT)
  // =============================================

  const loadClients = async () => {
    try {
      const response = await fetch('/api/clients');
      if (response.ok) {
        const data = await response.json();
        setClients(data);

        if (isEdit && deliveryNote?.client_id) {
          const client = data.find(c => c.id === deliveryNote.client_id);
          if (client) setSelectedClient(client);
        }
      }
    } catch (error) {
      console.error('Erreur chargement clients:', error);
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  // =============================================
  // INITIALIZE FROM EXISTING DATA (EDIT MODE)
  // =============================================

  useEffect(() => {
    if (isEdit && deliveryNote) {
      setClientId(deliveryNote.client_id?.toString() || '');
      setSelectedClient(deliveryNote.client || null);
      setLinkedPoId(deliveryNote.linked_po_id || '');
      setDeliveryDate(deliveryNote.delivery_date || new Date().toISOString().split('T')[0]);
      setDeliveryDescription(deliveryNote.delivery_description || '');
      setIsPrixJobe(deliveryNote.is_prix_jobe || false);
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
  // HANDLE CLIENT SELECT (identique au BT)
  // =============================================

  const handleClientSelect = (cId) => {
    const client = clients.find(c => c.id === parseInt(cId));
    setSelectedClient(client || null);
    setClientId(cId);
    setLinkedPoId('');
    setIsManualPo(false);

    // Pré-remplir les emails
    if (client) {
      setSelectedEmails({
        email: !!client.email,
        email_2: false,
        email_admin: !!client.email_admin
      });
    } else {
      setSelectedEmails({ email: true, email_2: false, email_admin: true });
    }

    onFormChange?.();
  };

  // =============================================
  // CLIENT MODAL HANDLERS
  // =============================================

  const handleNewClient = () => {
    setEditingClient(null);
    setShowClientModal(true);
  };

  const handleEditClient = () => {
    if (!selectedClient) {
      toast.error('Veuillez sélectionner un client à modifier');
      return;
    }
    setEditingClient(selectedClient);
    setShowClientModal(true);
  };

  const handleClientSaved = async (savedClient) => {
    setClients(prevClients => {
      const exists = prevClients.find(c => c.id === savedClient.id);
      if (exists) {
        return prevClients.map(c => c.id === savedClient.id ? savedClient : c);
      }
      return [...prevClients, savedClient].sort((a, b) => a.name.localeCompare(b.name));
    });

    setTimeout(() => {
      setSelectedClient(savedClient);
      setClientId(String(savedClient.id));
    }, 50);

    toast.success(`Client ${savedClient.name} ${editingClient ? 'modifié' : 'créé'} avec succès!`);

    setTimeout(() => loadClients(), 1000);
  };

  // =============================================
  // HANDLE EMAIL TOGGLE
  // =============================================

  const handleEmailSelection = (emailField) => {
    setSelectedEmails(prev => ({
      ...prev,
      [emailField]: !prev[emailField]
    }));
    onFormChange?.();
  };

  const getSelectedEmailAddresses = () => {
    if (!selectedClient) return [];
    const emails = [];
    if (selectedEmails.email && selectedClient.email) emails.push(selectedClient.email);
    if (selectedEmails.email_2 && selectedClient.email_2) emails.push(selectedClient.email_2);
    if (selectedEmails.email_admin && selectedClient.email_admin) emails.push(selectedClient.email_admin);
    return emails;
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
      recipient_emails: getSelectedEmailAddresses(),
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
  // RENDER
  // =============================================

  return (
    <div className="space-y-4">
      {/* ==========================================
          SECTION 1: CLIENT + EMAILS (copie du BT)
          ========================================== */}
      <div className="bg-blue-50 rounded-xl shadow-lg p-4 sm:p-6 border border-gray-200 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <User className="inline mr-2" size={16} />
            Client *
          </label>

          <div className="flex gap-2">
            <select
              className={`flex-1 min-w-0 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                isEdit ? 'bg-gray-100 cursor-not-allowed border-gray-300' : 'border-gray-300'
              }`}
              style={{ maxWidth: 'calc(100vw - 240px)' }}
              value={clientId}
              onChange={(e) => handleClientSelect(e.target.value)}
              disabled={isEdit}
            >
              <option value="">Sélectionner un client</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>
                  {client.name.length > 40 ? client.name.substring(0, 40) + '...' : client.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                loadClients();
                toast.success('Liste des clients actualisée');
              }}
              className="flex-shrink-0 w-12 h-12 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center justify-center"
              title="Actualiser la liste des clients"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
            </button>

            <button
              type="button"
              onClick={handleEditClient}
              disabled={!selectedClient}
              className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center ${
                selectedClient
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
              title={selectedClient ? 'Modifier le client sélectionné' : 'Sélectionnez un client d\'abord'}
            >
              <PenTool size={20} />
            </button>

            <button
              type="button"
              onClick={handleNewClient}
              className="flex-shrink-0 w-12 h-12 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center"
              title="Créer un nouveau client"
            >
              <Plus size={20} />
            </button>
          </div>

          {selectedClient && (
            <div className="mt-2 p-2 bg-white rounded text-sm text-blue-800">
              {selectedClient.address && <div>{selectedClient.address}</div>}
              {selectedClient.email && <div>{selectedClient.email}</div>}
            </div>
          )}
        </div>

        {/* Emails destinataires (sous le client) */}
        {selectedClient && (selectedClient.email || selectedClient.email_2 || selectedClient.email_admin) && (
          <div className="bg-white border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-3 flex items-center">
              <Mail className="mr-2" size={16} />
              Emails pour envoi du bon de livraison
            </h3>
            <div className="space-y-2">
              {selectedClient.email && (
                <label className="flex items-center space-x-3 cursor-pointer hover:bg-blue-50 p-2 rounded transition"
                  style={{ minHeight: '44px' }}>
                  <input
                    type="checkbox"
                    checked={selectedEmails.email}
                    onChange={() => handleEmailSelection('email')}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-900">Principal</span>
                    <span className="text-sm text-gray-600 ml-2">{selectedClient.email}</span>
                  </div>
                </label>
              )}

              {selectedClient.email_2 && (
                <label className="flex items-center space-x-3 cursor-pointer hover:bg-blue-50 p-2 rounded transition"
                  style={{ minHeight: '44px' }}>
                  <input
                    type="checkbox"
                    checked={selectedEmails.email_2}
                    onChange={() => handleEmailSelection('email_2')}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-900">Secondaire</span>
                    <span className="text-sm text-gray-600 ml-2">{selectedClient.email_2}</span>
                  </div>
                </label>
              )}

              {selectedClient.email_admin && (
                <label className="flex items-center space-x-3 cursor-pointer hover:bg-blue-50 p-2 rounded transition"
                  style={{ minHeight: '44px' }}>
                  <input
                    type="checkbox"
                    checked={selectedEmails.email_admin}
                    onChange={() => handleEmailSelection('email_admin')}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-900">Administration</span>
                    <span className="text-sm text-gray-600 ml-2">{selectedClient.email_admin}</span>
                  </div>
                </label>
              )}
            </div>

            <div className="mt-3 pt-3 border-t border-blue-200">
              <p className="text-xs text-blue-700">
                {Object.values(selectedEmails).filter(Boolean).length} email(s) sélectionné(s) pour l&apos;envoi
              </p>
            </div>
          </div>
        )}

        {/* Prix Jobé (sous les emails, dans la section client) */}
        {selectedClient && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isPrixJobe}
                onChange={(e) => { setIsPrixJobe(e.target.checked); onFormChange?.(); }}
                className="mt-1 w-5 h-5 text-amber-600 rounded focus:ring-2 focus:ring-amber-500"
              />
              <div className="flex-1">
                <div className="font-semibold text-amber-900 flex items-center gap-2">
                  Prix Jobé
                </div>
                <p className="text-sm text-amber-700 mt-1">
                  Le client recevra un BL simplifié (sans prix des matériels).
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  Le bureau recevra les 2 versions: simplifiée + complète
                </p>
              </div>
            </label>
          </div>
        )}
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
                onChange={(e) => { setLinkedPoId(e.target.value.toUpperCase()); onFormChange?.(); }}
                placeholder="Entrer le # BA ou Job client"
                className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-base uppercase"
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
            onChange={(e) => { setDeliveryDescription(e.target.value.toUpperCase()); onFormChange?.(); }}
            placeholder="DESCRIPTION DU MATÉRIEL LIVRÉ..."
            rows={3}
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-base resize-none uppercase"
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
          SECTION 4: BOUTONS D'ACTION
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

      {/* ==========================================
          CLIENT MODAL (identique au BT)
          ========================================== */}
      {showClientModal && (
        <ClientModal
          open={showClientModal}
          onClose={() => setShowClientModal(false)}
          onSaved={handleClientSaved}
          client={editingClient}
        />
      )}
    </div>
  );
}
