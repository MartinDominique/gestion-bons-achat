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
 * @version 2.5.2
 * @date 2026-02-18
 * @changelog
 *   2.5.2 - Fix: réutilisation même onglet client via clientWindowRef (évite
 *           onglets multiples avec données périmées lors de re-présentation).
 *           Fix: restauration emails robuste (gère null/undefined recipient_emails)
 *   2.5.1 - Fix: restauration état checkboxes emails en mode édition depuis
 *           recipient_emails sauvegardés (ne plus afficher par défaut tous cochés)
 *   2.5.0 - Fix workflow signature: window.open() au lieu de router.push()
 *           pour page client (identique au BT). Ajout polling statut +
 *           focus listener pour auto-fermeture après signature.
 *   2.4.0 - Ajout bouton "Ajout de fournisseur" + modal import achats fournisseurs
 *           Import sélectif d'articles depuis achats fournisseurs liés au client
 *   2.3.0 - Ajout bouton "Ajout de soumission" + modal import soumissions
 *           Import sélectif d'articles depuis soumissions acceptées du client
 *   2.2.0 - Boutons bas identiques au haut (vert/bleu/rouge)
 *           Fix chargement BA: par client_name (comme BT) au lieu de client_id
 *           Ajout description + montant au dropdown BA
 *   2.1.0 - Ajout boutons Sauvegarder/Présenter/Annuler en haut du formulaire
 *           (disposition identique au BT: vert/bleu/rouge)
 *   2.0.0 - Refonte sélection client (copie BT), uppercase BA/description,
 *           réorganisation sections, boutons modifier/ajouter client
 *   1.1.0 - Fix props ClientSelect (selectedClient + onClientSelect)
 *   1.0.0 - Version initiale
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Package, Calendar, FileText, User, Mail,
  Save, Eye, X, Plus, Truck, PenTool, Check
} from 'lucide-react';
import ClientModal from '../ClientModal';
import MaterialSelector from '../work-orders/MaterialSelector';
import { supabase } from '../../lib/supabase';
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
  const [currentBLStatus, setCurrentBLStatus] = useState(null);
  // Ref pour réutiliser le même onglet client (éviter onglets multiples)
  const clientWindowRef = useRef(null);

  // Soumissions import
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);
  const [selectedSubmissionForImport, setSelectedSubmissionForImport] = useState(null);
  const [selectedSubmissionItems, setSelectedSubmissionItems] = useState([]);

  // Achats fournisseurs import
  const [showSupplierImportModal, setShowSupplierImportModal] = useState(false);
  const [clientSupplierPurchases, setClientSupplierPurchases] = useState([]);
  const [selectedPurchaseForImport, setSelectedPurchaseForImport] = useState(null);
  const [selectedItemsForImport, setSelectedItemsForImport] = useState([]);
  const [isLoadingSupplierPurchases, setIsLoadingSupplierPurchases] = useState(false);

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

      // Restaurer les emails sélectionnés depuis recipient_emails sauvegardés
      if (deliveryNote.client) {
        const savedEmails = Array.isArray(deliveryNote.recipient_emails) ? deliveryNote.recipient_emails : [];
        setSelectedEmails({
          email: !!(deliveryNote.client.email && savedEmails.includes(deliveryNote.client.email)),
          email_2: !!(deliveryNote.client.email_2 && savedEmails.includes(deliveryNote.client.email_2)),
          email_admin: !!(deliveryNote.client.email_admin && savedEmails.includes(deliveryNote.client.email_admin)),
        });
      }

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
    if (selectedClient?.name) {
      loadPurchaseOrders(selectedClient.name);
    } else {
      setPurchaseOrders([]);
    }
  }, [selectedClient]);

  const loadPurchaseOrders = async (clientName) => {
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('id, po_number, description, amount, date, created_at')
        .eq('client_name', clientName)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPurchaseOrders(data || []);
    } catch (err) {
      console.error('Erreur chargement POs:', err);
      setPurchaseOrders([]);
    }
  };

  // =============================================
  // SURVEILLANCE STATUT BL (identique au BT)
  // Polling toutes les 3 sec quand status = ready_for_signature
  // =============================================

  useEffect(() => {
    const blId = savedId || deliveryNote?.id;

    if (currentBLStatus === 'ready_for_signature' && blId) {
      let intervalId = null;

      const checkStatus = async () => {
        try {
          const response = await fetch(`/api/delivery-notes/${blId}?t=${Date.now()}`, {
            cache: 'no-store'
          });
          if (response.ok) {
            const responseData = await response.json();
            const currentStatus = responseData.data?.status || responseData.status;

            if (['signed', 'sent', 'pending_send'].includes(currentStatus)) {
              if (intervalId) clearInterval(intervalId);

              toast.success('Le client a signé le bon de livraison!', { duration: 2000 });

              setTimeout(() => {
                router.push('/bons-travail');
              }, 2000);
            }
          }
        } catch (error) {
          console.error('Erreur vérification statut BL:', error);
        }
      };

      checkStatus();
      intervalId = setInterval(checkStatus, 3000);

      return () => {
        if (intervalId) clearInterval(intervalId);
      };
    }
  }, [currentBLStatus, savedId, deliveryNote?.id, router]);

  // Focus listener: vérifier statut quand l'onglet reprend le focus
  useEffect(() => {
    const blId = savedId || deliveryNote?.id;

    if (blId) {
      const handleFocus = async () => {
        try {
          const response = await fetch(`/api/delivery-notes/${blId}?t=${Date.now()}`, {
            cache: 'no-store'
          });
          if (response.ok) {
            const responseData = await response.json();
            const updatedStatus = responseData.data?.status || responseData.status;

            if (updatedStatus && updatedStatus !== currentBLStatus) {
              setCurrentBLStatus(updatedStatus);

              if (['signed', 'sent', 'pending_send'].includes(updatedStatus)) {
                toast.success('Le bon de livraison a été traité avec succès!', { duration: 2000 });

                setTimeout(() => {
                  router.push('/bons-travail');
                }, 2000);
              }
            }
          }
        } catch (error) {
          console.error('Erreur rechargement statut BL:', error);
        }
      };

      window.addEventListener('focus', handleFocus);

      return () => {
        window.removeEventListener('focus', handleFocus);
      };
    }
  }, [savedId, deliveryNote?.id, currentBLStatus, router]);

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
  // FONCTIONS IMPORT SOUMISSIONS
  // =============================================

  const loadClientSubmissions = async () => {
    if (!selectedClient) {
      toast.error('Veuillez d\'abord sélectionner un client');
      return;
    }

    setIsLoadingSubmissions(true);
    try {
      const { data, error } = await supabase
        .from('submissions')
        .select('*')
        .eq('client_name', selectedClient.name)
        .eq('status', 'accepted')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        toast.error('Aucune soumission acceptée trouvée pour ce client');
        setIsLoadingSubmissions(false);
        return;
      }

      setSubmissions(data);
      setShowSubmissionModal(true);
    } catch (error) {
      console.error('Erreur chargement soumissions:', error);
      toast.error('Erreur lors du chargement des soumissions');
    } finally {
      setIsLoadingSubmissions(false);
    }
  };

  const selectSubmissionForImport = (submission) => {
    setSelectedSubmissionForImport(submission);
    setSelectedSubmissionItems([]);
  };

  const toggleSubmissionItemSelection = (itemIndex) => {
    setSelectedSubmissionItems(prev => {
      const newSelection = [...prev];
      const existingIndex = newSelection.indexOf(itemIndex);
      if (existingIndex > -1) {
        newSelection.splice(existingIndex, 1);
      } else {
        newSelection.push(itemIndex);
      }
      return newSelection;
    });
  };

  const toggleAllSubmissionItemsSelection = () => {
    if (!selectedSubmissionForImport?.items) return;
    if (selectedSubmissionItems.length === selectedSubmissionForImport.items.length) {
      setSelectedSubmissionItems([]);
    } else {
      setSelectedSubmissionItems(selectedSubmissionForImport.items.map((_, index) => index));
    }
  };

  const importSelectedSubmissionItems = () => {
    if (!selectedSubmissionForImport || selectedSubmissionItems.length === 0) {
      toast.error('Veuillez sélectionner au moins un article');
      return;
    }

    try {
      const itemsToImport = selectedSubmissionItems.map((itemIndex, arrayIndex) => {
        const item = selectedSubmissionForImport.items[itemIndex];
        const sourceCode = item.product_id || item.code || '';
        const description = item.name || item.description || 'Article importé depuis soumission';

        return {
          id: 'sub-' + Date.now() + '-' + arrayIndex,
          product_id: sourceCode || null,
          code: sourceCode,
          description: sourceCode ? `[${sourceCode}] ${description}` : description,
          product: {
            id: sourceCode || 'temp-prod-' + Date.now() + '-' + arrayIndex,
            product_id: sourceCode,
            description: description,
            selling_price: parseFloat(item.price || item.selling_price || item.unit_price || 0),
            unit: item.unit || 'UN',
          },
          quantity: parseFloat(item.quantity || 0),
          unit: item.unit || 'UN',
          unit_price: parseFloat(item.price || item.selling_price || item.unit_price || 0),
          showPrice: false,
          show_price: false,
          notes: `Importé de soumission #${selectedSubmissionForImport.submission_number}`,
          from_submission: true,
          submission_number: selectedSubmissionForImport.submission_number
        };
      });

      const updatedMaterials = [...materials, ...itemsToImport];
      setMaterials(updatedMaterials);
      onFormChange?.();

      setShowSubmissionModal(false);
      setSelectedSubmissionForImport(null);
      setSelectedSubmissionItems([]);

      toast.success(`${itemsToImport.length} matériaux importés de la soumission #${selectedSubmissionForImport.submission_number}`);
    } catch (error) {
      console.error('Erreur import articles soumission:', error);
      toast.error('Erreur lors de l\'import des articles');
    }
  };

  // =============================================
  // FONCTIONS IMPORT ACHATS FOURNISSEURS
  // =============================================

  const loadClientSupplierPurchases = async () => {
    if (!selectedClient) {
      toast.error('Veuillez d\'abord sélectionner un client');
      return;
    }

    setIsLoadingSupplierPurchases(true);
    try {
      // Rechercher tous les BAs de ce client pour trouver les achats fournisseurs liés
      const { data: clientPOs, error: clientPOsError } = await supabase
        .from('purchase_orders')
        .select('id, po_number')
        .eq('client_name', selectedClient.name);

      if (clientPOsError) {
        console.error('Erreur chargement BAs client:', clientPOsError);
        throw clientPOsError;
      }

      const clientPOIds = clientPOs?.map(po => po.id) || [];

      // Charger tous les achats fournisseurs liés à ce client
      const { data, error } = await supabase
        .from('supplier_purchases')
        .select('*')
        .or(
          clientPOIds.length > 0
            ? `linked_po_id.in.(${clientPOIds.join(',')}),supplier_name.ilike.%${selectedClient.name}%`
            : `supplier_name.ilike.%${selectedClient.name}%`
        )
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Filtrer pour ne garder que ceux avec des items
      const uniquePurchases = (data || []).filter((purchase, index, self) =>
        purchase.items &&
        purchase.items.length > 0 &&
        self.findIndex(p => p.id === purchase.id) === index
      );

      if (uniquePurchases.length === 0) {
        toast.error('Aucun achat fournisseur avec articles trouvé pour ce client');
        setIsLoadingSupplierPurchases(false);
        return;
      }

      setClientSupplierPurchases(uniquePurchases);
      setShowSupplierImportModal(true);
    } catch (error) {
      console.error('Erreur chargement achats fournisseurs:', error);
      toast.error('Erreur lors du chargement des achats fournisseurs');
    } finally {
      setIsLoadingSupplierPurchases(false);
    }
  };

  const selectPurchaseForImport = (purchase) => {
    setSelectedPurchaseForImport(purchase);
    setSelectedItemsForImport([]);
  };

  const toggleItemSelection = (itemIndex) => {
    setSelectedItemsForImport(prev => {
      const newSelection = [...prev];
      const existingIndex = newSelection.indexOf(itemIndex);
      if (existingIndex > -1) {
        newSelection.splice(existingIndex, 1);
      } else {
        newSelection.push(itemIndex);
      }
      return newSelection;
    });
  };

  const toggleAllItemsSelection = () => {
    if (!selectedPurchaseForImport?.items) return;
    if (selectedItemsForImport.length === selectedPurchaseForImport.items.length) {
      setSelectedItemsForImport([]);
    } else {
      setSelectedItemsForImport(selectedPurchaseForImport.items.map((_, index) => index));
    }
  };

  const importSelectedSupplierItems = () => {
    if (!selectedPurchaseForImport || selectedItemsForImport.length === 0) {
      toast.error('Veuillez sélectionner au moins un article');
      return;
    }

    try {
      const itemsToImport = selectedItemsForImport.map((itemIndex, arrayIndex) => {
        const supplierItem = selectedPurchaseForImport.items[itemIndex];
        const sourceCode = supplierItem.product_id || supplierItem.code || supplierItem.sku || '';
        const description = supplierItem.description || supplierItem.name || supplierItem.product_name || 'Article importé';

        return {
          id: 'supplier-' + Date.now() + '-' + arrayIndex,
          product_id: sourceCode || null,
          code: sourceCode,
          description: sourceCode ? `[${sourceCode}] ${description}` : description,
          product: {
            id: sourceCode || 'temp-prod-' + Date.now() + '-' + arrayIndex,
            product_id: sourceCode,
            description: description,
            selling_price: parseFloat(supplierItem.cost_price || supplierItem.price || supplierItem.unit_price || 0),
            unit: supplierItem.unit || supplierItem.unity || 'UN',
          },
          quantity: parseFloat(supplierItem.quantity || supplierItem.qty || 1),
          unit: supplierItem.unit || supplierItem.unity || 'UN',
          unit_price: parseFloat(supplierItem.cost_price || supplierItem.price || supplierItem.unit_price || 0),
          showPrice: false,
          show_price: false,
          notes: `Importé de AF #${selectedPurchaseForImport.purchase_number}`,
          from_supplier_purchase: true,
          supplier_purchase_number: selectedPurchaseForImport.purchase_number
        };
      });

      const updatedMaterials = [...materials, ...itemsToImport];
      setMaterials(updatedMaterials);
      onFormChange?.();

      setShowSupplierImportModal(false);
      setSelectedPurchaseForImport(null);
      setSelectedItemsForImport([]);

      toast.success(`${itemsToImport.length} matériaux importés de l'AF #${selectedPurchaseForImport.purchase_number}`);
    } catch (error) {
      console.error('Erreur import articles fournisseur:', error);
      toast.error('Erreur lors de l\'import des articles');
    }
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
        setSavedId(blId);
        setCurrentBLStatus('ready_for_signature');

        // Réutiliser le même onglet client (éviter multiples onglets avec données périmées)
        const clientUrl = `/bons-travail/bl/${blId}/client?t=${Date.now()}`;
        if (clientWindowRef.current && !clientWindowRef.current.closed) {
          clientWindowRef.current.location.href = clientUrl;
          clientWindowRef.current.focus();
        } else {
          clientWindowRef.current = window.open(clientUrl, '_blank');
        }
      }
    }
  };

  // =============================================
  // RENDER
  // =============================================

  return (
    <div className="bg-white rounded-lg shadow p-6 max-w-4xl mx-auto">

      {/* Header avec boutons - identique au BT */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h2 className="text-xl font-bold text-gray-900">
          {mode === 'create' ? 'Nouveau Bon de Livraison' : `Édition ${deliveryNote?.bl_number}`}
        </h2>

        {/* Boutons workflow - en haut (colonne sur mobile, ligne sur tablet/PC) */}
        <div className="flex flex-col sm:flex-row gap-2">
          {(deliveryNote?.status === 'signed' || deliveryNote?.status === 'sent' || deliveryNote?.status === 'pending_send') ? (
            <button
              type="button"
              onClick={onCancel}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center justify-center font-medium text-sm"
            >
              <Check className="mr-2" size={16} />
              Terminer
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={saving || !clientId}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center font-medium text-sm"
              >
                <Save className="mr-2" size={16} />
                {saving ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>

              <button
                type="button"
                onClick={handlePresentToClient}
                disabled={saving || !clientId || materials.length === 0}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center font-medium text-sm"
              >
                <FileText className="mr-2" size={16} />
                {saving ? 'Préparation...' : 'Présenter'}
              </button>

              <button
                type="button"
                onClick={onCancel}
                className="bg-white border border-red-300 text-red-600 px-4 py-2 rounded-lg hover:bg-red-50 font-medium text-sm"
              >
                Annuler
              </button>
            </>
          )}
        </div>
      </div>

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

        <div className="space-y-4">
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
              className="w-full sm:w-64 px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-base"
              style={{ minHeight: '44px' }}
            />
          </div>

          {/* BA lié (sous la date) */}
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
                    {po.po_number} - {po.description ? po.description.substring(0, 20) + '...' : 'Sans desc.'} - {new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(po.amount || 0)}
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

        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            onClick={loadClientSubmissions}
            disabled={!selectedClient || isLoadingSubmissions}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
            title={!selectedClient ? "Sélectionnez d'abord un client" : "Importer depuis une soumission"}
            style={{ minHeight: '44px' }}
          >
            <FileText size={16} />
            {isLoadingSubmissions ? 'Chargement...' : 'Ajout de soumission'}
          </button>
          <button
            type="button"
            onClick={loadClientSupplierPurchases}
            disabled={!selectedClient || isLoadingSupplierPurchases}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
            title={!selectedClient ? "Sélectionnez d'abord un client" : "Importer depuis un achat fournisseur"}
            style={{ minHeight: '44px' }}
          >
            <Package size={16} />
            {isLoadingSupplierPurchases ? 'Chargement...' : 'Ajout de fournisseur'}
          </button>
        </div>

        <MaterialSelector
          materials={materials}
          onMaterialsChange={(newMaterials) => { setMaterials(newMaterials); onFormChange?.(); }}
        />
      </div>

      {/* ==========================================
          SECTION 4: BOUTONS D'ACTION (identiques au haut)
          ========================================== */}
      <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 border border-gray-200">
        <div className="flex flex-col sm:flex-row gap-2">
          {(deliveryNote?.status === 'signed' || deliveryNote?.status === 'sent' || deliveryNote?.status === 'pending_send') ? (
            <button
              type="button"
              onClick={onCancel}
              className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 flex items-center justify-center font-medium"
              style={{ minHeight: '44px' }}
            >
              <Check className="mr-2" size={16} />
              Terminer
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={saving || !clientId}
                className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center font-medium"
                style={{ minHeight: '44px' }}
              >
                <Save className="mr-2" size={16} />
                {saving ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>

              <button
                type="button"
                onClick={handlePresentToClient}
                disabled={saving || !clientId || materials.length === 0}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center font-medium"
                style={{ minHeight: '44px' }}
              >
                <FileText className="mr-2" size={16} />
                {saving ? 'Préparation...' : 'Présenter au client'}
              </button>

              <button
                type="button"
                onClick={onCancel}
                className="bg-white border border-red-300 text-red-600 px-6 py-3 rounded-lg hover:bg-red-50 font-medium"
                style={{ minHeight: '44px' }}
              >
                Annuler
              </button>
            </>
          )}
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

      {/* ==========================================
          MODAL IMPORT SOUMISSIONS
          ========================================== */}
      {showSubmissionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <FileText className="text-blue-600" size={24} />
                Import depuis Soumissions
              </h2>
              <button
                onClick={() => {
                  setShowSubmissionModal(false);
                  setSelectedSubmissionForImport(null);
                  setSelectedSubmissionItems([]);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {!selectedSubmissionForImport ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 mb-4">
                    Sélectionnez une soumission pour voir ses articles
                  </p>
                  {submissions.map((submission) => (
                    <div
                      key={submission.id}
                      onClick={() => selectSubmissionForImport(submission)}
                      className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            Soumission #{submission.submission_number}
                          </h3>
                          <p className="text-sm text-gray-600 mt-1">
                            {new Date(submission.created_at).toLocaleDateString('fr-CA')}
                          </p>
                          {submission.description && (
                            <p className="text-sm text-gray-500 mt-1">{submission.description}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-500">
                            {submission.items?.length || 0} articles
                          </div>
                          <div className="text-lg font-bold text-gray-900 mt-1">
                            {new Intl.NumberFormat('fr-CA', {
                              style: 'currency',
                              currency: 'CAD'
                            }).format(submission.total || 0)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <button
                      onClick={() => {
                        setSelectedSubmissionForImport(null);
                        setSelectedSubmissionItems([]);
                      }}
                      className="text-blue-600 hover:text-blue-700 flex items-center gap-2"
                    >
                      &larr; Retour aux soumissions
                    </button>
                    <button
                      onClick={toggleAllSubmissionItemsSelection}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      {selectedSubmissionItems.length === selectedSubmissionForImport.items.length
                        ? 'Tout désélectionner'
                        : 'Tout sélectionner'}
                    </button>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-lg mb-4">
                    <h3 className="font-semibold text-gray-900">
                      Soumission #{selectedSubmissionForImport.submission_number}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {selectedSubmissionItems.length} / {selectedSubmissionForImport.items?.length || 0} articles sélectionnés
                    </p>
                  </div>

                  <div className="space-y-2">
                    {selectedSubmissionForImport.items?.map((item, index) => (
                      <label
                        key={index}
                        className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition ${
                          selectedSubmissionItems.includes(index)
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedSubmissionItems.includes(index)}
                          onChange={() => toggleSubmissionItemSelection(index)}
                          className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex-1">
                              <div className="font-medium text-gray-900">
                                {item.product_id || item.code ? `[${item.product_id || item.code}] ` : ''}
                                {item.name || item.description}
                              </div>
                              <div className="text-sm text-gray-600 mt-1">
                                Qté: {item.quantity} {item.unit || 'UN'}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold text-gray-900">
                                {new Intl.NumberFormat('fr-CA', {
                                  style: 'currency',
                                  currency: 'CAD'
                                }).format(item.price || item.selling_price || item.unit_price || 0)}
                              </div>
                              <div className="text-xs text-gray-500">par {item.unit || 'UN'}</div>
                            </div>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowSubmissionModal(false);
                  setSelectedSubmissionForImport(null);
                  setSelectedSubmissionItems([]);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                style={{ minHeight: '44px' }}
              >
                Annuler
              </button>
              {selectedSubmissionForImport && (
                <button
                  onClick={importSelectedSubmissionItems}
                  disabled={selectedSubmissionItems.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  style={{ minHeight: '44px' }}
                >
                  Importer {selectedSubmissionItems.length} article{selectedSubmissionItems.length > 1 ? 's' : ''}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL IMPORT ACHATS FOURNISSEURS
          ========================================== */}
      {showSupplierImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="bg-purple-600 text-white p-6 rounded-t-lg flex justify-between items-center">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Package size={24} />
                Import Achats Fournisseurs - {selectedClient?.name}
              </h2>
              <button
                onClick={() => {
                  setShowSupplierImportModal(false);
                  setSelectedPurchaseForImport(null);
                  setSelectedItemsForImport([]);
                }}
                className="text-white hover:bg-white/20 rounded-lg p-2"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {!selectedPurchaseForImport ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 mb-4">
                    Sélectionnez un achat fournisseur pour voir ses articles
                  </p>
                  {clientSupplierPurchases.map((purchase) => (
                    <div
                      key={purchase.id}
                      onClick={() => selectPurchaseForImport(purchase)}
                      className="p-4 border border-gray-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 cursor-pointer transition"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            AF #{purchase.purchase_number}
                          </h3>
                          <p className="text-sm text-gray-600 mt-1">
                            {purchase.supplier_name}
                          </p>
                          <p className="text-sm text-gray-500 mt-1">
                            {new Date(purchase.created_at).toLocaleDateString('fr-CA')}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-500">
                            {purchase.items?.length || 0} articles
                          </div>
                          <div className="text-lg font-bold text-gray-900 mt-1">
                            {new Intl.NumberFormat('fr-CA', {
                              style: 'currency',
                              currency: 'CAD'
                            }).format(purchase.total_amount || 0)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <button
                      onClick={() => {
                        setSelectedPurchaseForImport(null);
                        setSelectedItemsForImport([]);
                      }}
                      className="text-purple-600 hover:text-purple-700 flex items-center gap-2"
                    >
                      &larr; Retour aux achats fournisseurs
                    </button>
                    <button
                      onClick={toggleAllItemsSelection}
                      className="text-sm text-purple-600 hover:text-purple-700"
                    >
                      {selectedItemsForImport.length === selectedPurchaseForImport.items.length
                        ? 'Tout désélectionner'
                        : 'Tout sélectionner'}
                    </button>
                  </div>

                  <div className="bg-purple-50 p-4 rounded-lg mb-4">
                    <h3 className="font-semibold text-gray-900">
                      AF #{selectedPurchaseForImport.purchase_number} - {selectedPurchaseForImport.supplier_name}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {selectedItemsForImport.length} / {selectedPurchaseForImport.items?.length || 0} articles sélectionnés
                    </p>
                  </div>

                  <div className="space-y-2">
                    {selectedPurchaseForImport.items?.map((item, index) => {
                      const quantity = parseFloat(item.quantity || item.qty || 1);
                      const unitPrice = parseFloat(item.cost_price || item.price || item.unit_price || 0);

                      return (
                        <label
                          key={index}
                          className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition ${
                            selectedItemsForImport.includes(index)
                              ? 'border-purple-500 bg-purple-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedItemsForImport.includes(index)}
                            onChange={() => toggleItemSelection(index)}
                            className="mt-1 w-4 h-4 text-purple-600 rounded focus:ring-2 focus:ring-purple-500"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1">
                                <div className="font-medium text-gray-900">
                                  {item.product_id || item.code || item.sku ? `[${item.product_id || item.code || item.sku}] ` : ''}
                                  {item.description || item.name || item.product_name}
                                </div>
                                <div className="text-sm text-gray-600 mt-1">
                                  Qté: {quantity} {item.unit || item.unity || 'UN'}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-semibold text-gray-900">
                                  {new Intl.NumberFormat('fr-CA', {
                                    style: 'currency',
                                    currency: 'CAD'
                                  }).format(unitPrice)}
                                </div>
                                <div className="text-xs text-gray-500">par {item.unit || item.unity || 'UN'}</div>
                              </div>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowSupplierImportModal(false);
                  setSelectedPurchaseForImport(null);
                  setSelectedItemsForImport([]);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                style={{ minHeight: '44px' }}
              >
                Annuler
              </button>
              {selectedPurchaseForImport && (
                <button
                  onClick={importSelectedSupplierItems}
                  disabled={selectedItemsForImport.length === 0}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  style={{ minHeight: '44px' }}
                >
                  Importer {selectedItemsForImport.length} article{selectedItemsForImport.length > 1 ? 's' : ''}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
