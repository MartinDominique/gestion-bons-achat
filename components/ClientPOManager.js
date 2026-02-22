/**
 * @file components/ClientPOManager.js
 * @description Gestionnaire des bons d'achat client (BA)
 *              - Création, édition, conversion depuis soumissions
 *              - Gestion des livraisons par BA
 *              - Interface desktop et mobile
 * @version 1.1.0
 * @date 2026-02-22
 * @changelog
 *   1.1.0 - Ajout classes dark mode Tailwind CSS
 *   1.0.0 - Version initiale
 */
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { MoreVertical, Eye, Edit, Trash2, FileText, Download, ChevronDown, X, Upload, Search, Plus, Minus, Truck, Package, CheckCircle, Calendar, DollarSign, Building2, FileUp, ShoppingCart } from 'lucide-react';

export default function ClientPOManager() {
  const [clientPOs, setClientPOs] = useState([]);
  const [clients, setClients] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);
  const [editingPO, setEditingPO] = useState(null);
  const [selectedPOForDelivery, setSelectedPOForDelivery] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sendingReport, setSendingReport] = useState(false);
  const [selectedPOId, setSelectedPOId] = useState(null);
  
  const [formData, setFormData] = useState({
    client_name: '',
    ba_number: '',
    submission_id: null,
    submission_number: '',
    description: '',
    total_amount: '',
    status: 'in_progress',
    delivery_address: {
      street: '',
      city: '',
      province: 'QC',
      postal_code: '',
      contact_name: '',
      phone: '',
      special_instructions: ''
    },
    items: []
  });

  // États pour le bon de livraison
  const [deliveryData, setDeliveryData] = useState({
    delivery_date: new Date().toISOString().split('T')[0],
    transport_number: '',
    transport_company: 'Purolator',
    delivery_contact: '',
    special_instructions: '',
    selected_items: []
  });

  // Générer numéro BA automatique
  const generateBANumber = async () => {
    const now = new Date();
    const yearMonth = `${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    
    try {
      const { data, error } = await supabase
        .from('client_purchase_orders')
        .select('ba_number')
        .like('ba_number', `BA-${yearMonth}-%`)
        .order('ba_number', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Erreur récupération numéro BA:', error);
        return `BA-${yearMonth}-001`;
      }

      if (data && data.length > 0) {
        const lastNumber = data[0].ba_number;
        const sequenceMatch = lastNumber.match(/-(\d{3})$/);
        if (sequenceMatch) {
          const nextSequence = (parseInt(sequenceMatch[1]) + 1).toString().padStart(3, '0');
          return `BA-${yearMonth}-${nextSequence}`;
        }
      }
      
      return `BA-${yearMonth}-001`;
    } catch (error) {
      console.error('Erreur génération numéro BA:', error);
      return `BA-${yearMonth}-001`;
    }
  };

  // Générer numéro BL automatique
  const generateBLNumber = async () => {
    const now = new Date();
    const yearMonth = `${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    
    try {
      const { data, error } = await supabase
        .from('delivery_slips')
        .select('delivery_number')
        .like('delivery_number', `BL-${yearMonth}-%`)
        .order('delivery_number', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Erreur récupération numéro BL:', error);
        return `BL-${yearMonth}-001`;
      }

      if (data && data.length > 0) {
        const lastNumber = data[0].delivery_number;
        const sequenceMatch = lastNumber.match(/-(\d{3})$/);
        if (sequenceMatch) {
          const nextSequence = (parseInt(sequenceMatch[1]) + 1).toString().padStart(3, '0');
          return `BL-${yearMonth}-${nextSequence}`;
        }
      }
      
      return `BL-${yearMonth}-001`;
    } catch (error) {
      console.error('Erreur génération numéro BL:', error);
      return `BL-${yearMonth}-001`;
    }
  };

  // Chargement des données
  useEffect(() => {
    fetchClientPOs();
    fetchClients();
    fetchSubmissions();
  }, []);

  const fetchClientPOs = async () => {
    try {
      const { data, error } = await supabase
        .from('client_purchase_orders')
        .select(`
          *,
          items:client_po_items(*),
          deliveries:delivery_slips(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setClientPOs(data || []);
    } catch (error) {
      console.error('Erreur chargement BA clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        console.error('Erreur chargement clients:', error);
      } else {
        setClients(data || []);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des clients:', error);
    }
  };

  const fetchSubmissions = async () => {
    try {
      const { data, error } = await supabase
        .from('submissions')
        .select('id, submission_number, client_name, description, items, amount, status')
        .in('status', ['sent', 'accepted'])
        .order('submission_number', { ascending: false });

      if (error) {
        console.error('Erreur chargement soumissions:', error);
      } else {
        setSubmissions(data || []);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des soumissions:', error);
    }
  };

  // Conversion depuis soumission
  const convertFromSubmission = (submission) => {
    setFormData({
      client_name: submission.client_name,
      ba_number: '', // Sera généré automatiquement
      submission_id: submission.id,
      submission_number: submission.submission_number,
      description: submission.description,
      total_amount: submission.amount || 0,
      status: 'in_progress',
      delivery_address: {
        street: '',
        city: '',
        province: 'QC',
        postal_code: '',
        contact_name: submission.client_name,
        phone: '',
        special_instructions: ''
      },
      items: submission.items || []
    });
    
    // Si la soumission est "Envoyée", la passer à "Acceptée" automatiquement
    if (submission.status === 'sent') {
      try {
        supabase
          .from('submissions')
          .update({ status: 'accepted' })
          .eq('id', submission.id)
          .then(() => {
            console.log('✅ Soumission ' + submission.submission_number + ' passée à Acceptée');
          });
      } catch (err) {
        console.error('Erreur changement statut soumission:', err);
      }
    }
    
    setShowForm(true);
  };

  // Gestion du formulaire BA
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      let baNumber = formData.ba_number;
      
      if (!editingPO) {
        baNumber = await generateBANumber();
      }

      const poData = {
        ...formData,
        ba_number: baNumber,
        total_amount: parseFloat(formData.total_amount)
      };

      if (editingPO) {
        const { error } = await supabase
          .from('client_purchase_orders')
          .update(poData)
          .eq('id', editingPO.id);
        if (error) throw error;

        // Mettre à jour les items
        await supabase
          .from('client_po_items')
          .delete()
          .eq('client_po_id', editingPO.id);
      } else {
        const { data: poResult, error } = await supabase
          .from('client_purchase_orders')
          .insert([poData])
          .select()
          .single();
        if (error) throw error;

        // Insérer les items
        if (formData.items && formData.items.length > 0) {
          const itemsData = formData.items.map(item => ({
            client_po_id: poResult.id,
            product_id: item.product_id,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            selling_price: item.selling_price,
            cost_price: item.cost_price,
            delivered_quantity: 0,
            comment: item.comment || ''
          }));

          const { error: itemsError } = await supabase
            .from('client_po_items')
            .insert(itemsData);
          if (itemsError) throw itemsError;
        }
      }

      await fetchClientPOs();
      setShowForm(false);
      setEditingPO(null);
      resetForm();
      
    } catch (error) {
      console.error('Erreur sauvegarde BA:', error);
      alert('Erreur lors de la sauvegarde du bon d\'achat');
    }
  };

  const resetForm = () => {
    setFormData({
      client_name: '',
      ba_number: '',
      submission_id: null,
      submission_number: '',
      description: '',
      total_amount: '',
      status: 'in_progress',
      delivery_address: {
        street: '',
        city: '',
        province: 'QC',
        postal_code: '',
        contact_name: '',
        phone: '',
        special_instructions: ''
      },
      items: []
    });
  };

  // Badge de statut
    const getStatusBadgeStyle = (status) => {
      const badges = {
        in_progress: 'bg-blue-100 text-blue-800',
        partial: 'bg-yellow-100 text-yellow-800',
        completed: 'bg-green-100 text-green-800'
      };
      return badges[status] || badges.in_progress;
    };
    
    const getStatusLabel = (status) => {
      const labels = {
        in_progress: '🔵 En cours',
        partial: '🚚 Partiellement livré',
        completed: '✅ Complété'
      };
      return labels[status] || labels.in_progress;
    };
  // Interface de livraison
  const openDeliveryForm = (po) => {
    setSelectedPOForDelivery(po);
    setDeliveryData({
      delivery_date: new Date().toISOString().split('T')[0],
      transport_number: '',
      transport_company: 'Purolator',
      delivery_contact: po.delivery_address?.contact_name || po.client_name,
      special_instructions: '',
      selected_items: po.items?.map(item => ({
        ...item,
        quantity_to_deliver: Math.max(0, item.quantity - item.delivered_quantity)
      })) || []
    });
    setShowDeliveryForm(true);
  };

  // Formatage
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('fr-CA');
  };

  // Filtrage
  const filteredPOs = clientPOs.filter(po => {
    const searchText = searchTerm.toLowerCase();
    const matchesSearch = 
      po.ba_number?.toLowerCase().includes(searchText) ||
      po.client_name?.toLowerCase().includes(searchText) ||
      po.description?.toLowerCase().includes(searchText) ||
      po.submission_number?.toLowerCase().includes(searchText);
    
    const matchesStatus = statusFilter === 'all' || po.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        <p className="ml-4 text-indigo-600 dark:text-indigo-400 font-medium">Chargement des bons d'achat client...</p>
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-indigo-200 dark:border-indigo-800 overflow-hidden">
          
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold">
                  {editingPO ? '✏️ Modifier BA Client' : '📋 Nouveau Bon d\'Achat Client'}
                </h2>
                <p className="text-indigo-100 text-sm mt-1">
                  {editingPO ? 'Modifiez les informations' : 'Créez un nouveau bon d\'achat client'}
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingPO(null);
                    resetForm();
                  }}
                  className="w-full sm:w-auto px-4 py-2 bg-white/10 border border-white/20 rounded-lg hover:bg-white/20 text-sm font-medium"
                >
                  ❌ Annuler
                </button>
                <button
                  type="submit"
                  form="po-form"
                  className="w-full sm:w-auto px-4 py-2 bg-white text-indigo-600 rounded-lg hover:bg-gray-100 text-sm font-medium"
                >
                  {editingPO ? '💾 Mettre à jour' : '✨ Créer'}
                </button>
              </div>
            </div>
          </div>
          
          <div className="p-4 sm:p-6">
            <form id="po-form" onSubmit={handleSubmit} className="space-y-6">
              
              {/* Informations de base */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                  <label className="block text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">
                    👤 Client *
                  </label>
                  <select
                    value={formData.client_name}
                    onChange={(e) => setFormData({...formData, client_name: e.target.value})}
                    className="block w-full rounded-lg border-blue-300 dark:border-blue-700 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3 dark:bg-gray-800 dark:text-gray-100"
                    required
                  >
                    <option value="">Sélectionner un client...</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.name}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
                  <label className="block text-sm font-semibold text-green-800 dark:text-green-300 mb-2">
                    📝 Description *
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="block w-full rounded-lg border-green-300 dark:border-green-700 shadow-sm focus:border-green-500 focus:ring-green-500 text-base p-3 dark:bg-gray-800 dark:text-gray-100"
                    placeholder="Description du bon d'achat..."
                    required
                  />
                </div>
              </div>

              {/* Soumission liée */}
              <div className="bg-cyan-50 dark:bg-cyan-900/20 p-4 rounded-lg border border-cyan-200 dark:border-cyan-800">
                <label className="block text-sm font-semibold text-cyan-800 dark:text-cyan-300 mb-2">
                  📋 Soumission Liée (optionnel)
                </label>
                <select
                  value={formData.submission_number}
                  onChange={(e) => {
                    const selectedSubmission = submissions.find(s => s.submission_number === e.target.value);
                    if (selectedSubmission) {
                      setFormData({
                        ...formData,
                        submission_id: selectedSubmission.id,
                        submission_number: selectedSubmission.submission_number,
                        client_name: selectedSubmission.client_name,
                        description: selectedSubmission.description,
                        total_amount: selectedSubmission.amount || 0,
                        items: selectedSubmission.items || []
                      });
                    } else {
                      setFormData({
                        ...formData,
                        submission_id: null,
                        submission_number: ''
                      });
                    }
                  }}
                  className="block w-full rounded-lg border-cyan-300 dark:border-cyan-700 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 text-base p-3 dark:bg-gray-800 dark:text-gray-100"
                >
                  <option value="">Aucune soumission...</option>
                  {submissions.map((submission) => (
                    <option key={submission.id} value={submission.submission_number}>
                      {submission.submission_number} - {submission.client_name} - {formatCurrency(submission.amount)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Montant */}
              <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <label className="block text-sm font-semibold text-yellow-800 dark:text-yellow-300 mb-2">
                  💰 Montant Total *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.total_amount}
                  onChange={(e) => setFormData({...formData, total_amount: e.target.value})}
                  className="block w-full rounded-lg border-yellow-300 dark:border-yellow-700 shadow-sm focus:border-yellow-500 focus:ring-yellow-500 text-base p-3 dark:bg-gray-800 dark:text-gray-100"
                  placeholder="0.00"
                  required
                />
                <p className="text-sm text-yellow-700 dark:text-yellow-400 mt-2">
                  💡 Montant calculé automatiquement si soumission sélectionnée
                </p>
              </div>

              {/* Adresse de livraison */}
              <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg border border-purple-200 dark:border-purple-800">
                <h3 className="text-lg font-semibold text-purple-800 dark:text-purple-300 mb-4">🏠 Adresse de Livraison</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Rue *</label>
                    <input
                      type="text"
                      value={formData.delivery_address.street}
                      onChange={(e) => setFormData({
                        ...formData, 
                        delivery_address: {...formData.delivery_address, street: e.target.value}
                      })}
                      className="block w-full rounded-lg border-purple-300 dark:border-purple-700 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-base p-3 dark:bg-gray-800 dark:text-gray-100"
                      placeholder="123 Rue Principale"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Ville *</label>
                    <input
                      type="text"
                      value={formData.delivery_address.city}
                      onChange={(e) => setFormData({
                        ...formData, 
                        delivery_address: {...formData.delivery_address, city: e.target.value}
                      })}
                      className="block w-full rounded-lg border-purple-300 dark:border-purple-700 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-base p-3 dark:bg-gray-800 dark:text-gray-100"
                      placeholder="Saint-Georges"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Contact Livraison *</label>
                    <input
                      type="text"
                      value={formData.delivery_address.contact_name}
                      onChange={(e) => setFormData({
                        ...formData, 
                        delivery_address: {...formData.delivery_address, contact_name: e.target.value}
                      })}
                      className="block w-full rounded-lg border-purple-300 dark:border-purple-700 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-base p-3 dark:bg-gray-800 dark:text-gray-100"
                      placeholder="Nom du contact"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Téléphone</label>
                    <input
                      type="tel"
                      value={formData.delivery_address.phone}
                      onChange={(e) => setFormData({
                        ...formData, 
                        delivery_address: {...formData.delivery_address, phone: e.target.value}
                      })}
                      className="block w-full rounded-lg border-purple-300 dark:border-purple-700 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-base p-3 dark:bg-gray-800 dark:text-gray-100"
                      placeholder="(418) 555-0199"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Instructions Spéciales</label>
                  <textarea
                    value={formData.delivery_address.special_instructions}
                    onChange={(e) => setFormData({
                      ...formData, 
                      delivery_address: {...formData.delivery_address, special_instructions: e.target.value}
                    })}
                    className="block w-full rounded-lg border-purple-300 dark:border-purple-700 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-base p-3 dark:bg-gray-800 dark:text-gray-100"
                    placeholder="Instructions pour la livraison..."
                    rows="3"
                  />
                </div>
              </div>

              {/* Articles */}
              {formData.items && formData.items.length > 0 && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-300 mb-4">
                    📦 Articles ({formData.items.length})
                  </h3>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-yellow-100 dark:bg-yellow-900/30">
                        <tr>
                          <th className="text-left p-2 font-semibold">Code</th>
                          <th className="text-left p-2 font-semibold">Description</th>
                          <th className="text-center p-2 font-semibold">Qté</th>
                          <th className="text-right p-2 font-semibold">Prix Unit.</th>
                          <th className="text-right p-2 font-semibold">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formData.items.map((item, index) => (
                          <tr key={index} className="border-b border-yellow-100 dark:border-yellow-900/30 dark:bg-gray-900">
                            <td className="p-2 font-mono text-xs">{item.product_id}</td>
                            <td className="p-2">{item.description}</td>
                            <td className="p-2 text-center">{item.quantity}</td>
                            <td className="p-2 text-right">{formatCurrency(item.selling_price)}</td>
                            <td className="p-2 text-right font-medium">{formatCurrency(item.selling_price * item.quantity)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* En-tête avec statistiques */}
      <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-xl shadow-lg p-4 sm:p-6 text-white">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold">📋 Bons d'Achat Client</h2>
            <p className="text-white/90 text-sm sm:text-base mt-1">
              Gérez vos bons d'achat client et livraisons
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="w-full sm:w-auto px-4 py-2 bg-white text-indigo-600 rounded-lg hover:bg-gray-100 text-sm font-medium"
            >
              ➕ Nouveau BA Client
            </button>
          </div>
        </div>

        {/* Statistiques */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">📊</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Total BA</p>
                <p className="text-xl sm:text-2xl font-bold text-white">{clientPOs.length}</p>
              </div>
            </div>
          </div>
        
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">🔵</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">En cours</p>
                <p className="text-xl sm:text-2xl font-bold text-white">
                  {clientPOs.filter(po => po.status === 'in_progress').length}
                </p>
              </div>
            </div>
          </div>
        
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">🚚</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Partiellement livré</p>
                <p className="text-xl sm:text-2xl font-bold text-white">
                  {clientPOs.filter(po => po.status === 'partial').length}
                </p>
              </div>
            </div>
          </div>
        
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">✅</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Complétés</p>
                <p className="text-xl sm:text-2xl font-bold text-white">
                  {clientPOs.filter(po => po.status === 'completed').length}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-4 sm:p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="🔍 Rechercher par N° BA, client, description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-4 py-3 rounded-lg border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
          </div>
          <div className="w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base p-3 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="all">Tous les statuts</option>
              <option value="in_progress">🔵 En cours</option>
              <option value="partial">🚚 Partiellement livré</option>
              <option value="completed">✅ Complété</option>
            </select>
          </div>
        </div>
      </div>

      {/* Section Conversion depuis Soumissions */}
      {submissions.length > 0 && (
        <div className="bg-gradient-to-r from-green-50 dark:from-green-900/10 to-blue-50 dark:to-blue-900/10 rounded-lg p-4 sm:p-6 border border-green-200 dark:border-green-800">
          <h3 className="text-lg font-semibold text-green-800 dark:text-green-300 mb-4">
            🔄 Convertir Soumissions Acceptées en BA Client
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {submissions.slice(0, 6).map((submission) => (
              <div key={submission.id} className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-green-200 dark:border-green-800 shadow-sm">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-gray-100">{submission.submission_number}</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{submission.client_name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{submission.description}</p>
                  </div>
                  <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">
                    ✅ Acceptée
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-green-600">
                    {formatCurrency(submission.amount)}
                  </span>
                  <button
                    onClick={() => convertFromSubmission(submission)}
                    className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium"
                  >
                    🔄 Convertir
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Liste des BA Client */}
      <div className="bg-white dark:bg-gray-900 shadow-lg rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        {filteredPOs.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-6xl mb-4 block">📋</span>
            <p className="text-gray-500 dark:text-gray-400 text-lg">
              {clientPOs.length === 0 ? 'Aucun bon d\'achat client créé' : 'Aucun bon d\'achat trouvé avec ces filtres'}
            </p>
            {clientPOs.length === 0 && (
              <button
                onClick={() => setShowForm(true)}
                className="mt-4 inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
              >
                ➕ Créer le premier BA Client
              </button>
            )}
          </div>
        ) : (
          <div className="hidden lg:block">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Bon d'Achat
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Client & Description
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Montant
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Livraison
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredPOs.map((po) => {
                  return (
                    <tr key={po.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <td className="px-3 py-4 whitespace-nowrap">
                        <div className="text-sm space-y-1">
                          <div className="bg-indigo-100 text-indigo-800 px-2 py-1 rounded text-xs font-medium inline-block">
                            📄 {po.ba_number}
                          </div>
                          {po.submission_number && (
                            <div className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium inline-block ml-1">
                              📋 {po.submission_number}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <div className="text-sm">
                          <div className="font-medium text-gray-900 dark:text-gray-100">{po.client_name}</div>
                          <div className="text-gray-500 dark:text-gray-400 truncate max-w-xs" title={po.description}>
                            {po.description}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-center">
                        <div className="text-sm font-medium text-green-600">
                          {formatCurrency(po.total_amount)}
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeStyle(po.status)}`}>
                          {getStatusLabel(po.status)}
                        </span>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-center text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(po.created_at)}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-center">
                        <div className="flex justify-center space-x-1">
                          {deliveryStatus.status !== 'completed' && po.items && po.items.length > 0 && (
                            <button
                              onClick={() => openDeliveryForm(po)}
                              className="bg-green-100 text-green-700 hover:bg-green-200 p-2 rounded-lg transition-colors"
                              title="Créer livraison"
                            >
                              <Truck className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setEditingPO(po);
                              setFormData({
                                client_name: po.client_name,
                                ba_number: po.ba_number,
                                submission_id: po.submission_id,
                                submission_number: po.submission_number || '',
                                description: po.description,
                                total_amount: po.total_amount,
                                status: po.status,
                                delivery_address: po.delivery_address || {
                                  street: '',
                                  city: '',
                                  province: 'QC',
                                  postal_code: '',
                                  contact_name: '',
                                  phone: '',
                                  special_instructions: ''
                                },
                                items: po.items || []
                              });
                              setShowForm(true);
                            }}
                            className="bg-blue-100 text-blue-700 hover:bg-blue-200 p-2 rounded-lg transition-colors"
                            title="Modifier"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Vue mobile */}
        <div className="lg:hidden space-y-4 p-4">
          {filteredPOs.map((po) => {
            return (
              <div key={po.id} className="bg-white dark:bg-gray-900 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-50 dark:from-blue-900/20 to-indigo-50 dark:to-indigo-900/20 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-base">
                        📄 {po.ba_number}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{po.client_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-green-600">{formatCurrency(po.total_amount)}</p>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDeliveryStatusBadge(deliveryStatus.status)}`}>
                        {deliveryStatus.status === 'in_progress' && '🔵 En cours'}
                        {deliveryStatus.status === 'partial' && `🚚 ${deliveryStatus.percentage}%`}
                        {deliveryStatus.status === 'completed' && '✅ Complété'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4">
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">{po.description}</p>
                  
                  {po.submission_number && (
                    <div className="mb-3">
                      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
                        📋 {po.submission_number}
                      </span>
                    </div>
                  )}

                  {deliveryStatus.status === 'partial' && (
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                        <span>Progression livraison</span>
                        <span>{deliveryStatus.percentage}%</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div 
                          className="bg-yellow-600 h-2 rounded-full" 
                          style={{width: `${deliveryStatus.percentage}%`}}
                        ></div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    {deliveryStatus.status !== 'completed' && po.items && po.items.length > 0 && (
                      <button
                        onClick={() => openDeliveryForm(po)}
                        className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-green-700"
                      >
                        🚚 Livraison
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setEditingPO(po);
                        setFormData({
                          client_name: po.client_name,
                          ba_number: po.ba_number,
                          submission_id: po.submission_id,
                          submission_number: po.submission_number || '',
                          description: po.description,
                          total_amount: po.total_amount,
                          status: po.status,
                          delivery_address: po.delivery_address || {
                            street: '',
                            city: '',
                            province: 'QC',
                            postal_code: '',
                            contact_name: '',
                            phone: '',
                            special_instructions: ''
                          },
                          items: po.items || []
                        });
                        setShowForm(true);
                      }}
                      className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-blue-700"
                    >
                      ✏️ Modifier
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Info footer */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <p className="text-sm text-blue-700 dark:text-blue-300">
          📊 {clientPOs.length} bon(s) d'achat client • {submissions.length} soumission(s) disponible(s) pour conversion
        </p>
      </div>
    </div>
  );
}
