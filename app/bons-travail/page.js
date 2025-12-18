//app/bons-travail/page.js//

'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Calendar, Clock, User, FileText, Edit, Trash2, Send, Eye, Search } from 'lucide-react';
import ConnectionStatus from '../../components/ConnectionStatus';

export default function BonsTravailPage() {
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState('client'); // 'client', 'bt_number', 'date'
  const [statusFilter, setStatusFilter] = useState(() => {
  // Charger le filtre sauvegardé depuis localStorage
  if (typeof window !== 'undefined') {
    return localStorage.getItem('bt-status-filter') || 'all';
  }
  return 'all';
});
  const router = useRouter();

  // Fonction pour formater les heures en h:min
    const formatHoursToHM = (decimalHours) => {
      if (!decimalHours) return '-';
      
      const hours = Math.floor(decimalHours);
      const minutes = Math.round((decimalHours - hours) * 60);
      
      if (minutes === 0) {
        return `${hours}h`;
      }
      return `${hours}h ${minutes}min`;
    };

  // Fonction pour tronquer le texte
  const truncateText = (text, maxLength = 50) => {
    if (!text) return '-';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const fetchWorkOrders = async () => {
    try {
      const response = await fetch('/api/work-orders?limit=10000');
      if (response.ok) {
        const data = await response.json();
        
        console.log('Données reçues:', data);
        console.log('Type:', typeof data);
        console.log('Est un Array:', Array.isArray(data));
        
        // Gérer différents formats de réponse
        let workOrdersData = [];
        if (Array.isArray(data)) {
          workOrdersData = data;
        } else if (data.data && Array.isArray(data.data)) {
          workOrdersData = data.data;
        } else if (data.success && data.data && Array.isArray(data.data)) {
          workOrdersData = data.data;
        } else {
          console.warn('Format de réponse inattendu:', data);
          workOrdersData = [];
        }
        
        setWorkOrders(workOrdersData);
      }
    } catch (error) {
      console.error('Erreur chargement:', error);
      setWorkOrders([]);
    } finally {
      setLoading(false);
    }
  };

  // Sauvegarder le filtre dans localStorage quand il change
    useEffect(() => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('bt-status-filter', statusFilter);
      }
    }, [statusFilter]);

  useEffect(() => {
    fetchWorkOrders();
  }, []);

  // Filtrer les bons de travail selon la recherche ET le statut
    const filteredWorkOrders = useMemo(() => {
      let filtered = workOrders;
      
      // 1. Filtrer par statut d'abord
      if (statusFilter !== 'all') {
        filtered = filtered.filter(wo => wo.status === statusFilter);
      }
      
      // 2. Puis filtrer par recherche
      if (searchTerm.trim()) {
        const searchLower = searchTerm.toLowerCase().trim();
        
        filtered = filtered.filter(wo => {
          switch (searchType) {
            case 'client':
              return wo.client?.name?.toLowerCase().includes(searchLower);
            
            case 'bt_number':
              return wo.bt_number?.toLowerCase().includes(searchLower);
            
            case 'date':
              let workDate = '', workDateFr = '', workDateUs = '';
              if (wo.work_date) {
                const [year, month, day] = wo.work_date.split('-');
                const date = new Date(year, month - 1, day);
                workDate = date.toLocaleDateString('fr-CA');
                workDateFr = date.toLocaleDateString('fr-FR');
                workDateUs = date.toLocaleDateString('en-US');
              }
              
              return workDate.includes(searchLower) || 
                     workDateFr.includes(searchLower) || 
                     workDateUs.includes(searchLower) ||
                     wo.work_date?.includes(searchLower);
            
            default:
              return true;
          }
        });
      }
      
      return filtered;
    }, [workOrders, searchTerm, searchType, statusFilter]);

  // Supprimer un bon de travail
  const handleDelete = async (workOrder) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le bon de travail ${workOrder.bt_number} ?\n\nCette action est irréversible.`)) {
      return;
    }

    setActionLoading(prev => ({ ...prev, [workOrder.id]: 'deleting' }));

    try {
      const response = await fetch(`/api/work-orders?id=${workOrder.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setWorkOrders(prev => prev.filter(wo => wo.id !== workOrder.id));
        alert(`Bon de travail ${workOrder.bt_number} supprimé avec succès.`);
      } else {
        const error = await response.json();
        alert(`Erreur suppression: ${error.error}`);
      }
    } catch (error) {
      console.error('Erreur suppression:', error);
      alert('Erreur lors de la suppression');
    } finally {
      setActionLoading(prev => {
        const newState = { ...prev };
        delete newState[workOrder.id];
        return newState;
      });
    }
  };

  // Modifier le statut (envoyer)
  const handleSend = async (workOrder) => {
    if (!confirm(`Envoyer le bon de travail ${workOrder.bt_number} au client ?\n\nLe statut passera à "Envoyé".`)) {
      return;
    }

    setActionLoading(prev => ({ ...prev, [workOrder.id]: 'sending' }));

    try {
      const response = await fetch('/api/work-orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: workOrder.id,
          status: 'sent'
        })
      });

      if (response.ok) {
        setWorkOrders(prev => prev.map(wo => 
          wo.id === workOrder.id ? { ...wo, status: 'sent' } : wo
        ));
        alert(`Bon de travail ${workOrder.bt_number} envoyé avec succès.`);
      } else {
        const error = await response.json();
        alert(`Erreur envoi: ${error.error}`);
      }
    } catch (error) {
      console.error('Erreur envoi:', error);
      alert('Erreur lors de l\'envoi');
    } finally {
      setActionLoading(prev => {
        const newState = { ...prev };
        delete newState[workOrder.id];
        return newState;
      });
    }
  };

  // Modifier un bon de travail
  const handleEdit = (workOrder) => {
    router.push(`/bons-travail/${workOrder.id}/modifier`);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    // Parser comme date locale, pas UTC
    const [year, month, day] = dateStr.split('-');
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('fr-CA');
  };

  const formatTime = (time) => {
    if (!time) return '-';
    return time.substring(0, 5);
  };

  const getStatusColor = (status) => {
    const colors = {
      draft: 'bg-gray-100 text-gray-800',
      in_progress: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      sent: 'bg-purple-100 text-purple-800',
      archived: 'bg-gray-100 text-gray-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status) => {
    const labels = {
      draft: 'Brouillon',
      in_progress: 'En cours',
      completed: 'Terminé',
      sent: 'Envoyé',
      archived: 'Archivé'
    };
    return labels[status] || status;
  };

  // Vérifier si une action est possible selon le statut
  const canEdit = (status) => ['draft', 'in_progress'].includes(status);
  const canSend = (status) => ['completed'].includes(status);
  const canDelete = (status) => ['draft'].includes(status);

  const getSearchPlaceholder = () => {
    switch (searchType) {
      case 'client':
        return 'Rechercher par nom de client...';
      case 'bt_number':
        return 'Rechercher par numéro de BT...';
      case 'date':
        return 'Rechercher par date (YYYY-MM-DD)...';
      default:
        return 'Rechercher...';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-blue-50 to-indigo-100">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center min-h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
            <span className="ml-2 text-teal-700">Chargement...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header avec dégradé coloré - OPTIMISÉ 50% plus compact */}
        <div className="bg-gradient-to-r from-orange-500 via-orange-400 to-gray-500 rounded-2xl shadow-xl p-4 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">Gestion des Bons de Travail</h1>
              <p className="text-blue-100 text-sm">Gérez vos bons de travail</p>
            </div>
            <div className="flex gap-2">
              <button className="hidden sm:flex bg-white/20 backdrop-blur-sm text-white px-3 py-2 rounded-lg hover:bg-white/30 transition-all duration-200 items-center border border-white/30 text-sm">
                <FileText className="mr-2" size={18} />
                Rapport
              </button>
              <Link 
                href="/bons-travail/nouveau"
                className="bg-white text-teal-600 px-4 py-2 rounded-lg hover:bg-blue-50 transition-all duration-200 flex items-center font-semibold shadow-lg text-sm whitespace-nowrap"
              >
                <Plus className="mr-1 sm:mr-2" size={18} />
                Nouveau BT
              </Link>
             <Link 
                href="/bons-travail/nouveau"
                className="bg-white text-teal-600 px-4 py-2 rounded-lg..."
              >
                <Plus className="mr-1 sm:mr-2" size={18} />
                Nouveau BT
              </Link>   
               <ConnectionStatus className="hidden sm:flex" />   
            </div>
          </div>

          {/* Statistiques dans le header - Version compacte */}
          <div className="hidden sm:grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3 border border-white/30">
              <div className="flex items-center">
                <div className="bg-white/30 p-2 rounded-full">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div className="ml-2">
                  <p className="text-blue-100 text-xs font-medium">Total</p>
                  <p className="text-2xl font-bold text-white">{workOrders.length}</p>
                </div>
              </div>
            </div>

            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3 border border-white/30">
              <div className="flex items-center">
                <div className="bg-yellow-400/80 p-2 rounded-full">
                  <Clock className="w-5 h-5 text-white" />
                </div>
                <div className="ml-2">
                  <p className="text-blue-100 text-xs font-medium">Brouillons</p>
                  <p className="text-2xl font-bold text-white">
                    {workOrders.filter(wo => wo.status === 'draft').length}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3 border border-white/30">
              <div className="flex items-center">
                <div className="bg-green-400/80 p-2 rounded-full">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div className="ml-2">
                  <p className="text-blue-100 text-xs font-medium">Terminés</p>
                  <p className="text-2xl font-bold text-white">
                    {workOrders.filter(wo => wo.status === 'completed').length}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3 border border-white/30">
              <div className="flex items-center">
                <div className="bg-purple-400/80 p-2 rounded-full">
                  <Send className="w-5 h-5 text-white" />
                </div>
                <div className="ml-2">
                  <p className="text-blue-100 text-xs font-medium">Envoyés</p>
                  <p className="text-2xl font-bold text-white">
                    {workOrders.filter(wo => wo.status === 'sent').length}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filtres par statut - NOUVEAUX BOUTONS */}
          <div className="bg-white/70 backdrop-blur-sm rounded-xl shadow-lg p-4 mb-4 border border-white/50">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Filtrer par statut:</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                  statusFilter === 'all'
                    ? 'bg-gradient-to-r from-teal-500 to-blue-600 text-white shadow-md'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                📋 Tous ({workOrders.length})
              </button>
              
              <button
                onClick={() => setStatusFilter('draft')}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                  statusFilter === 'draft'
                    ? 'bg-gradient-to-r from-gray-500 to-gray-600 text-white shadow-md'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                ✏️ Brouillon ({workOrders.filter(wo => wo.status === 'draft').length})
              </button>
              
              <button
                onClick={() => setStatusFilter('ready_for_signature')}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                  statusFilter === 'ready_for_signature'
                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                ✍️ À signer ({workOrders.filter(wo => wo.status === 'ready_for_signature').length})
              </button>
              
              <button
                onClick={() => setStatusFilter('signed')}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                  statusFilter === 'signed'
                    ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-md'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                ✅ Signé ({workOrders.filter(wo => wo.status === 'signed').length})
              </button>
              
              <button
                onClick={() => setStatusFilter('pending_send')}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                  statusFilter === 'pending_send'
                    ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-md'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                ⏳ En attente ({workOrders.filter(wo => wo.status === 'pending_send').length})
              </button>
              
              <button
                onClick={() => setStatusFilter('sent')}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                  statusFilter === 'sent'
                    ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-md'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                📧 Envoyé ({workOrders.filter(wo => wo.status === 'sent').length})
              </button>
            </div>
            
            {/* Indicateur du filtre actif */}
            {statusFilter !== 'all' && (
              <div className="mt-3 text-sm text-blue-700 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200 flex items-center justify-between">
                <span>
                  <span className="font-semibold">{filteredWorkOrders.length}</span> résultat(s) avec le statut sélectionné
                </span>
                <button
                  onClick={() => setStatusFilter('all')}
                  className="text-blue-600 hover:text-blue-800 font-medium underline"
                >
                  Réinitialiser
                </button>
              </div>
            )}
          </div>

        {/* Barre de recherche */}
        <div className="bg-white/70 backdrop-blur-sm rounded-xl shadow-lg p-6 mb-6 border border-white/50">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Sélecteur de type de recherche */}
            <div className="sm:w-48">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rechercher par
              </label>
              <select
                value={searchType}
                onChange={(e) => setSearchType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
              >
                <option value="client">Client</option>
                <option value="bt_number"># BT</option>
                <option value="date">Date</option>
              </select>
            </div>

            {/* Champ de recherche */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Terme de recherche
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={getSearchPlaceholder()}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
                />
              </div>
            </div>

            {/* Bouton pour effacer */}
            {searchTerm && (
              <div className="sm:w-auto flex items-end">
                <button
                  onClick={() => setSearchTerm('')}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Effacer
                </button>
              </div>
            )}
          </div>

          {/* Indicateur de résultats */}
          {searchTerm && (
            <div className="mt-3 text-sm text-gray-600 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200">
              <span className="font-semibold text-blue-700">{filteredWorkOrders.length}</span> résultat(s) trouvé(s) pour "{searchTerm}"
            </div>
          )}
        </div>
        
        <div className="bg-white/70 backdrop-blur-sm rounded-xl shadow-lg border border-white/50 overflow-hidden">
          {filteredWorkOrders.length === 0 ? (
            <div className="p-8 text-center">
              <div className="bg-gradient-to-r from-gray-200 to-gray-300 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText size={32} className="text-gray-500" />
              </div>
              {searchTerm ? (
                <>
                  <p className="text-gray-600 mb-4 text-lg">
                    Aucun bon de travail trouvé pour "{searchTerm}"
                  </p>
                  <button
                    onClick={() => setSearchTerm('')}
                    className="text-teal-600 hover:text-teal-700 font-medium"
                  >
                    Effacer la recherche
                  </button>
                </>
              ) : (
                <>
                  <p className="text-gray-600 mb-4 text-lg">Aucun bon de travail pour le moment</p>
                  <Link 
                    href="/bons-travail/nouveau"
                    className="bg-gradient-to-r from-teal-500 to-blue-600 text-white px-6 py-3 rounded-lg hover:from-teal-600 hover:to-blue-700 transition-all duration-200 inline-flex items-center font-medium"
                  >
                    <Plus className="mr-2" size={20} />
                    Créer le premier BT
                  </Link>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Version MOBILE - Cartes compactes */}
              <div className="md:hidden">
                {filteredWorkOrders.map((wo) => (
                  <div 
                    key={wo.id}
                    onClick={() => handleEdit(wo)}
                    className={`p-3 border-b last:border-b-0 hover:bg-blue-50 active:bg-blue-100 cursor-pointer ${
                      wo.work_date && (new Date() - new Date(wo.work_date)) > (15 * 24 * 60 * 60 * 1000) && wo.status !== 'sent'
                        ? 'bg-red-50 border-l-4 border-l-red-500'
                        : ''
                    }`}
                  >
                    {/* Ligne 1: BT# + Statut */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-sm font-bold bg-gradient-to-r from-teal-500 to-blue-600 bg-clip-text text-transparent flex items-center gap-1.5">
                        {wo.bt_number}
                        {wo.has_active_session && (
                          <span className="relative flex h-2.5 w-2.5" title="Session en cours">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-500"></span>
                          </span>
                        )}
                      </span>
                      <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusColor(wo.status)}`}>
                        {getStatusLabel(wo.status)}
                      </span>
                    </div>
                                        
                    {/* Ligne 2: Client */}
                    <div className="flex items-center text-sm text-gray-700 mb-1">
                      <User className="mr-1 flex-shrink-0" size={14} />
                      <span className="truncate font-medium">{wo.client?.name || 'Client inconnu'}</span>
                    </div>
                    
                    {/* Ligne 3: Date + Heures */}
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <div className="flex items-center">
                        <Calendar className="mr-1" size={12} />
                        {formatDate(wo.work_date)}
                      </div>
                      <div className="flex items-center">
                      <Clock className="mr-1" size={12} />
                      {formatHoursToHM(wo.total_hours)}
                    </div>
                    </div>
                    
                    {/* Description */}
                    {wo.work_description && (
                      <p className="mt-1 text-xs text-gray-600 truncate">
                        {truncateText(wo.work_description, 50)}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Version DESKTOP - Tableau */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-gray-50 to-blue-50">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">BT #</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Client</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Date</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Heures</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Statut</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Description</th>
                      <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredWorkOrders.map((wo, index) => (
                      <tr key={wo.id} className={`hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 transition-all duration-200 ${
                        wo.work_date && (new Date() - new Date(wo.work_date)) > (15 * 24 * 60 * 60 * 1000) && wo.status !== 'sent'
                          ? 'bg-red-100 border-l-4 border-l-red-500'
                          : index % 2 === 0 ? 'bg-white/50' : 'bg-gray-50/50'
                      }`}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="font-mono text-sm bg-gradient-to-r from-teal-500 to-blue-600 bg-clip-text text-transparent font-bold flex items-center gap-2">
                            {wo.bt_number}
                            {wo.has_active_session && (
                              <span className="relative flex h-3 w-3" title="Session en cours">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-gray-900 font-medium">{wo.client?.name || 'Client inconnu'}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center text-sm">
                            <Calendar className="mr-2 text-teal-500" size={14} />
                            <span className="font-medium">{formatDate(wo.work_date)}</span>
                          </div>
                          {(wo.start_time || wo.end_time) && (
                            <div className="flex items-center text-sm text-gray-500 mt-1">
                              <Clock className="mr-2 text-blue-400" size={14} />
                              {formatTime(wo.start_time)} - {formatTime(wo.end_time)}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className="bg-gradient-to-r from-green-400 to-teal-500 bg-clip-text text-transparent font-bold">
                            {formatHoursToHM(wo.total_hours)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${getStatusColor(wo.status)}`}>
                            {getStatusLabel(wo.status)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 w-48">
                          <div title={wo.work_description || 'Aucune description'} className="cursor-help">
                            {truncateText(wo.work_description, 60)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end space-x-2">
                            {/* Bouton Voir */}
                            <button
                              onClick={() => handleEdit(wo)}
                              className="bg-blue-100 text-blue-600 hover:bg-blue-200 hover:text-blue-700 p-2 rounded-lg transition-all duration-200"
                              title="Voir détails"
                            >
                              <Eye size={16} />
                            </button>

                            {/* Bouton Modifier */}
                            {canEdit(wo.status) && (
                              <button
                                onClick={() => handleEdit(wo)}
                                className="bg-green-100 text-green-600 hover:bg-green-200 hover:text-green-700 p-2 rounded-lg transition-all duration-200"
                                title="Modifier"
                                disabled={actionLoading[wo.id]}
                              >
                                <Edit size={16} />
                              </button>
                            )}

                            {/* Bouton Envoyer */}
                            {canSend(wo.status) && (
                              <button
                                onClick={() => handleSend(wo)}
                                className="bg-purple-100 text-purple-600 hover:bg-purple-200 hover:text-purple-700 p-2 rounded-lg transition-all duration-200"
                                title="Envoyer au client"
                                disabled={actionLoading[wo.id]}
                              >
                                {actionLoading[wo.id] === 'sending' ? (
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
                                ) : (
                                  <Send size={16} />
                                )}
                              </button>
                            )}

                            {/* Bouton Supprimer */}
                            {canDelete(wo.status) && (
                              <button
                                onClick={() => handleDelete(wo)}
                                className="bg-red-100 text-red-600 hover:bg-red-200 hover:text-red-700 p-2 rounded-lg transition-all duration-200"
                                title="Supprimer"
                                disabled={actionLoading[wo.id]}
                              >
                                {actionLoading[wo.id] === 'deleting' ? (
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                                ) : (
                                  <Trash2 size={16} />
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
