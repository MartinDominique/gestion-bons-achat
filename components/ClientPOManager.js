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
    status: 'draft',
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
        .eq('status', 'accepted')
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
      status: 'draft',
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
      status: 'draft',
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

  // Calculer le statut de livraison
  const getDeliveryStatus = (po) => {
    if (!po.items || po.items.length === 0) return { status: 'empty', percentage: 0 };
    
    const totalItems = po.items.length;
    const deliveredItems = po.items.filter(item => item.delivered_quantity >= item.quantity).length;
    const partialItems = po.items.filter(item => item.delivered_quantity > 0 && item.delivered_quantity < item.quantity).length;
    
    const percentage = Math.round((deliveredItems / totalItems) * 100);
    
    if (deliveredItems === totalItems) return { status: 'complete', percentage: 100 };
    if (partialItems > 0 || deliveredItems > 0) return { status: 'partial', percentage };
    return { status: 'pending', percentage: 0 };
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

  const getStatusBadge = (status) => {
    const badges = {
      draft: 'bg-gray-100 text-gray-800',
      confirmed: 'bg-blue-100 text-blue-800',
      partial: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-100 text-green-800'
    };
    return badges[status] || badges.draft;
  };

  const getDeliveryStatusBadge = (status) => {
    const badges = {
      pending: 'bg-red-100 text-red-800',
      partial: 'bg-yellow-100 text-yellow-800', 
      complete: 'bg-green-100 text-green-800',
      empty: 'bg-gray-100 text-gray-800'
    };
    return badges[status] || badges.empty;
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
        <p className="ml-4 text-indigo-600 font-medium">Chargement des bons d'achat client...</p>
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <div className="bg-white rounded-xl shadow-lg border border-indigo-200 overflow-hidden">
          
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
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <label className="block text-sm font-semibold text-blue-800 mb-2">
                    👤 Client *
                  </label>
                  <select
                    value={formData.client_name}
                    onChange={(e) => setFormData({...formData, client_name: e.target.value})}
                    className="block w-full rounded-lg border-blue-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3"
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

                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <label className="block text-sm font-semibold text-green-800 mb-2">
                    📝 Description *
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="block w-full rounded-lg border-green-300 shadow-sm focus:border-green-500 focus:ring-green-500 text-base p-3"
                    placeholder="Description du bon d'achat..."
                    required
                  />
                </div>
              </div>

              {/* Soumission liée */}
              <div className="bg-cyan-50 p-4 rounded-lg border border-cyan-200">
                <label className="block text-sm font-semibold text-cyan-800 mb-2">
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
                  className="block w-full rounded-lg border-cyan-300 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 text-base p-3"
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
              <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                <label className="block text-sm font-semibold text-yellow-800 mb-2">
                  💰 Montant Total *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.total_amount}
                  onChange={(e) => setFormData({...formData, total_amount: e.target.value})}
                  className="block w-full rounded-lg border-yellow-300 shadow-sm focus:border-yellow-500 focus:ring-yellow-500 text-base p-3"
                  placeholder="0.00"
                  required
                />
                <p className="text-sm text-yellow-700 mt-2">
                  💡 Montant calculé automatiquement si soumission sélectionnée
                </p>
              </div>

              {/* Adresse de livraison */}
              <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                <h3 className="text-lg font-semibold text-purple-800 mb-4">🏠 Adresse de Livraison</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Rue *</label>
                    <input
                      type="text"
                      value={formData.delivery_address.street}
                      onChange={(e) => setFormData({
                        ...formData, 
                        delivery_address: {...formData.delivery_address, street: e.target.value}
                      })}
                      className="block w-full rounded-lg border-purple-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-base p-3"
                      placeholder="123 Rue Principale"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Ville *</label>
                    <input
                      type="text"
                      value={formData.delivery_address.city}
                      onChange={(e) => setFormData({
                        ...formData, 
                        delivery_address: {...formData.delivery_address, city: e.target.value}
                      })}
                      className="block w-full rounded-lg border-purple-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-base p-3"
                      placeholder="Saint-Georges"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Contact Livraison *</label>
                    <input
                      type="text"
                      value={formData.delivery_address.contact_name}
                      onChange={(e) => setFormData({
                        ...formData, 
                        delivery_address: {...formData.delivery_address, contact_name: e.target.value}
                      })}
                      className="block w-full rounded-lg border-purple-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-base p-3"
                      placeholder="Nom du contact"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Téléphone</label>
                    <input
                      type="tel"
                      value={formData.delivery_address.phone}
                      onChange={(e) => setFormData({
                        ...formData, 
                        delivery_address: {...formData.delivery_address, phone: e.target.value}
                      })}
                      className="block w-full rounded-lg border-purple-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-base p-3"
                      placeholder="(418) 555-0199"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Instructions Spéciales</label>
                  <textarea
                    value={formData.delivery_address.special_instructions}
                    onChange={(e) => setFormData({
                      ...formData, 
                      delivery_address: {...formData.delivery_address, special_instructions: e.target.value}
                    })}
                    className="block w-full rounded-lg border-purple-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-base p-3"
                    placeholder="Instructions pour la livraison..."
                    rows="3"
                  />
                </div>
              </div>

              {/* Articles */}
              {formData.items && formData.items.length > 0 && (
                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                  <h3 className="text-lg font-semibold text-yellow-800 mb-4">
                    📦 Articles ({formData.items.length})
                  </h3>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-yellow-100">
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
                          <tr key={index} className="border-b border-yellow-100">
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
              <span className="text-2xl sm:text-3xl mr-3">🚚</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">En Livraison</p>
                <p className="text-xl sm:text-2xl font-bold text-white">
                  {clientPOs.filter(po => getDeliveryStatus(po).status === 'partial').length}
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
                  {clientPOs.filter(po => getDeliveryStatus(po).status === 'complete').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">💰</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Valeur Totale</p>
                <p className="text-lg sm:text-2xl font-bold text-white">
                  {formatCurrency(clientPOs.reduce((sum, po) => sum + (po.total_amount || 0), 0))}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6 border border-gray-200">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="🔍 Rechercher par N° BA, client, description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-4 py-3 rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base"
              />
            </div>
          </div>
          <div className="w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base p-3"
            >
              <option value="all">Tous les statuts</option>
              <option value="draft">📝 Brouillon</option>
              <option value="confirmed">✅ Confirmé</option>
              <option value="partial">🚚 Livraison partielle</option>
              <option value="completed">✅ Complété</option>
            </select>
          </div>
        </div>
      </div>

      {/* Section Conversion depuis Soumissions */}
      {submissions.length > 0 && (
        <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-4 sm:p-6 border border-green-200">
          <h3 className="text-lg font-semibold text-green-800 mb-4">
            🔄 Convertir Soumissions Acceptées en BA Client
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {submissions.slice(0, 6).map((submission) => (
              <div key={submission.id} className="bg-white p-4 rounded-lg border border-green-200 shadow-sm">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-medium text-gray-900">{submission.submission_number}</h4>
                    <p className="text-sm text-gray-600">{submission.client_name}</p>
                    <p className="text-xs text-gray-500 truncate">{submission.description}</p>
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
      <div className="bg-white shadow-lg rounded-lg overflow-hidden border border-gray-200">
        {filteredPOs.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-6xl mb-4 block">📋</span>
            <p className="text-gray-500 text-lg">
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
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Bon d'Achat
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Client & Description
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Montant
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Livraison
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPOs.map((po) => {
                  const deliveryStatus = getDeliveryStatus(po);
                  return (
                    <tr key={po.id} className="hover:bg-gray-50 transition-colors">
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
                          <div className="font-medium text-gray-900">{po.client_name}</div>
                          <div className="text-gray-500 truncate max-w-xs" title={po.description}>
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
                        <div className="space-y-1">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDeliveryStatusBadge(deliveryStatus.status)}`}>
                            {deliveryStatus.status === 'pending' && '⏳ En attente'}
                            {deliveryStatus.status === 'partial' && `🚚 ${deliveryStatus.percentage}%`}
                            {deliveryStatus.status === 'complete' && '✅ Complété'}
                            {deliveryStatus.status === 'empty' && '📋 Vide'}
                          </span>
                          {deliveryStatus.status === 'partial' && (
                            <div className="w-16 bg-gray-200 rounded-full h-1.5 mx-auto">
                              <div 
                                className="bg-yellow-600 h-1.5 rounded-full" 
                                style={{width: `${deliveryStatus.percentage}%`}}
                              ></div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                        {formatDate(po.created_at)}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-center">
                        <div className="flex justify-center space-x-1">
                          {deliveryStatus.status !== 'complete' && po.items && po.items.length > 0 && (
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
            const deliveryStatus = getDeliveryStatus(po);
            return (
              <div key={po.id} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900 text-base">
                        📄 {po.ba_number}
                      </h3>
                      <p className="text-sm text-gray-600">{po.client_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-green-600">{formatCurrency(po.total_amount)}</p>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDeliveryStatusBadge(deliveryStatus.status)}`}>
                        {deliveryStatus.status === 'pending' && '⏳ En attente'}
                        {deliveryStatus.status === 'partial' && `🚚 ${deliveryStatus.percentage}%`}
                        {deliveryStatus.status === 'complete' && '✅ Complété'}
                        {deliveryStatus.status === 'empty' && '📋 Vide'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4">
                  <p className="text-sm text-gray-700 mb-3">{po.description}</p>
                  
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
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-yellow-600 h-2 rounded-full" 
                          style={{width: `${deliveryStatus.percentage}%`}}
                        ></div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    {deliveryStatus.status !== 'complete' && po.items && po.items.length > 0 && (
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
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-700">
          📊 {clientPOs.length} bon(s) d'achat client • {submissions.length} soumission(s) disponible(s) pour conversion
        </p>
      </div>
    </div>
  );
}
