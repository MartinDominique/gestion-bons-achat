import { useState, useEffect } from 'react';
import { PlusIcon, PencilIcon, TrashIcon, EyeIcon, CheckIcon, ClockIcon, XMarkIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import { supabase } from '../lib/supabase';
import PurchaseOrderForm from './PurchaseOrderForm';
import PurchaseOrderView from './PurchaseOrderView';

export default function PurchaseOrderManager() {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showView, setShowView] = useState(false);
  const [editingPO, setEditingPO] = useState(null);
  const [viewingPO, setViewingPO] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sendingReport, setSendingReport] = useState(false);

  useEffect(() => {
    fetchPurchaseOrders();
  }, []);

  const fetchPurchaseOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPurchaseOrders(data || []);
    } catch (error) {
      console.error('Erreur lors du chargement des bons d\'achat:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendReport = async () => {
    setSendingReport(true);
    try {
      const response = await fetch('/api/send-weekly-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        alert('📧 Rapport envoyé avec succès !');
      } else {
        const errorData = await response.text();
        console.error('Erreur:', errorData);
        alert('❌ Erreur lors de l\'envoi du rapport');
      }
    } catch (error) {
      console.error('Erreur lors de l\'envoi:', error);
      alert('❌ Erreur lors de l\'envoi du rapport');
    } finally {
      setSendingReport(false);
    }
  };

  const handleSubmit = async (formData) => {
    try {
      if (editingPO) {
        const { error } = await supabase
          .from('purchase_orders')
          .update(formData)
          .eq('id', editingPO.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('purchase_orders')
          .insert([formData]);

        if (error) throw error;
      }

      await fetchPurchaseOrders();
      setShowForm(false);
      setEditingPO(null);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      alert('Erreur lors de la sauvegarde du bon d\'achat');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce bon d\'achat ?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('purchase_orders')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchPurchaseOrders();
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      alert('Erreur lors de la suppression du bon d\'achat');
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      const { error } = await supabase
        .from('purchase_orders')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;
      await fetchPurchaseOrders();
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut:', error);
      alert('Erreur lors de la mise à jour du statut');
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'approved':
        return <CheckIcon className="h-5 w-5 text-green-500" />;
      case 'pending':
        return <ClockIcon className="h-5 w-5 text-yellow-500" />;
      case 'rejected':
        return <XMarkIcon className="h-5 w-5 text-red-500" />;
      default:
        return <ClockIcon className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusBadge = (status) => {
    const baseClasses = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium";
    switch (status) {
      case 'approved':
        return `${baseClasses} bg-green-100 text-green-800`;
      case 'pending':
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      case 'rejected':
        return `${baseClasses} bg-red-100 text-red-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('fr-CA');
  };

  const filteredPurchaseOrders = purchaseOrders.filter(po => {
    const matchesSearch = po.po_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         po.vendor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         po.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || po.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const totalAmount = filteredPurchaseOrders.reduce((sum, po) => sum + (po.amount || 0), 0);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (showForm) {
    return (
      <PurchaseOrderForm
        purchaseOrder={editingPO}
        onSubmit={handleSubmit}
        onCancel={() => {
          setShowForm(false);
          setEditingPO(null);
        }}
      />
    );
  }

  if (showView && viewingPO) {
    return (
      <PurchaseOrderView
        purchaseOrder={viewingPO}
        onClose={() => {
          setShowView(false);
          setViewingPO(null);
        }}
        onEdit={() => {
          setEditingPO(viewingPO);
          setShowView(false);
          setShowForm(true);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête avec statistiques */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Gestion des Bons d'Achat</h2>
          <div className="flex space-x-3">
            <button
              onClick={handleSendReport}
              disabled={sendingReport}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <EnvelopeIcon className="h-4 w-4 mr-2" />
              {sendingReport ? 'Envoi...' : 'Envoyer Rapport'}
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Nouveau Bon d'Achat
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckIcon className="h-8 w-8 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-blue-600">Total</p>
                <p className="text-2xl font-semibold text-blue-900">{purchaseOrders.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-green-50 p-4 rounded-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckIcon className="h-8 w-8 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-green-600">Approuvés</p>
                <p className="text-2xl font-semibold text-green-900">
                  {purchaseOrders.filter(po => po.status === 'approved').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 p-4 rounded-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ClockIcon className="h-8 w-8 text-yellow-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-yellow-600">En Attente</p>
                <p className="text-2xl font-semibold text-yellow-900">
                  {purchaseOrders.filter(po => po.status === 'pending').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <span className="text-2xl">💰</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Montant Total</p>
                <p className="text-2xl font-semibold text-gray-900">{formatCurrency(totalAmount)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filtres et recherche */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          <div className="flex-1 max-w-lg">
            <input
              type="text"
              placeholder="Rechercher par numéro, fournisseur ou description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center space-x-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="all">Tous les statuts</option>
              <option value="pending">En attente</option>
              <option value="approved">Approuvé</option>
              <option value="rejected">Rejeté</option>
            </select>
          </div>
        </div>
      </div>

      {/* Liste des bons d'achat */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        {filteredPurchaseOrders.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">Aucun bon d'achat trouvé</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {filteredPurchaseOrders.map((po) => (
              <li key={po.id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0">
                      {getStatusIcon(po.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {po.po_number || 'N/A'}
                        </p>
                        <span className={getStatusBadge(po.status)}>
                          {po.status === 'approved' ? 'Approuvé' : 
                           po.status === 'pending' ? 'En attente' : 
                           po.status === 'rejected' ? 'Rejeté' : 'Inconnu'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-6 mt-1">
                        <p className="text-sm text-gray-500">
                          <span className="font-medium">Fournisseur:</span> {po.vendor || 'N/A'}
                        </p>
                        <p className="text-sm text-gray-500">
                          <span className="font-medium">Montant:</span> {formatCurrency(po.amount)}
                        </p>
                        <p className="text-sm text-gray-500">
                          <span className="font-medium">Date:</span> {formatDate(po.created_at)}
                        </p>
                      </div>
                      {po.description && (
                        <p className="text-sm text-gray-500 mt-1 truncate">
                          {po.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {po.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleStatusChange(po.id, 'approved')}
                          className="inline-flex items-center p-2 border border-transparent rounded-full shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                          title="Approuver"
                        >
                          <CheckIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleStatusChange(po.id, 'rejected')}
                          className="inline-flex items-center p-2 border border-transparent rounded-full shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                          title="Rejeter"
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => {
                        setViewingPO(po);
                        setShowView(true);
                      }}
                      className="inline-flex items-center p-2 border border-gray-300 rounded-full shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      title="Voir"
                    >
                      <EyeIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        setEditingPO(po);
                        setShowForm(true);
                      }}
                      className="inline-flex items-center p-2 border border-gray-300 rounded-full shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      title="Modifier"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(po.id)}
                      className="inline-flex items-center p-2 border border-gray-300 rounded-full shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                      title="Supprimer"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
