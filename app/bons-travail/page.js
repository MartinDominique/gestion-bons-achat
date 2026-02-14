/**
 * @file app/bons-travail/page.js
 * @description Page de liste unifiée des Bons de Travail (BT) et Bons de Livraison (BL)
 *              - Affiche BT + BL dans une liste chronologique mixte
 *              - Filtre par type (BT/BL), statut, recherche
 *              - Actions: modifier, supprimer, envoyer
 *              - Statistiques combinées
 * @version 2.1.0
 * @date 2026-02-14
 * @changelog
 *   2.1.0 - Fix filtre type multi-select + restauration layout tablette style main
 *   2.0.0 - Ajout support BL dans la liste unifiée
 *   1.0.0 - Version initiale (BT seulement)
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Calendar, Clock, User, FileText, Edit, Trash2, Send, Eye, Search, Truck, Package } from 'lucide-react';
import ConnectionStatus from '../../components/ConnectionStatus';

export default function BonsTravailPage() {
  const [workOrders, setWorkOrders] = useState([]);
  const [deliveryNotes, setDeliveryNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState('client');
  const [typeFilter, setTypeFilter] = useState([]); // [] = tous, ['bt'], ['bl'], ['bt','bl'] = tous
  const [statusFilter, setStatusFilter] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('bt-status-filter');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch (e) { /* ignore */ }
    }
    return [];
  });
  const router = useRouter();

  // Formater heures
  const formatHoursToHM = (decimalHours) => {
    if (!decimalHours) return '-';
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}min`;
  };

  // Tronquer texte
  const truncateText = (text, maxLength = 50) => {
    if (!text) return '-';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  // Charger les données
  const fetchData = async () => {
    try {
      const [woResponse, blResponse] = await Promise.all([
        fetch('/api/work-orders?limit=10000'),
        fetch('/api/delivery-notes?limit=10000')
      ]);

      // Work Orders
      if (woResponse.ok) {
        const data = await woResponse.json();
        let woData = [];
        if (Array.isArray(data)) woData = data;
        else if (data.data && Array.isArray(data.data)) woData = data.data;
        else if (data.success && data.data) woData = data.data;
        setWorkOrders(woData);
      }

      // Delivery Notes
      if (blResponse.ok) {
        const data = await blResponse.json();
        let blData = [];
        if (Array.isArray(data)) blData = data;
        else if (data.data && Array.isArray(data.data)) blData = data.data;
        else if (data.success && data.data) blData = data.data;
        setDeliveryNotes(blData);
      }
    } catch (error) {
      console.error('Erreur chargement:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('bt-status-filter', JSON.stringify(statusFilter));
    }
  }, [statusFilter]);

  const toggleStatusFilter = (status) => {
    setStatusFilter(prev => {
      if (prev.includes(status)) return prev.filter(s => s !== status);
      return [...prev, status];
    });
  };

  const toggleTypeFilter = (type) => {
    setTypeFilter(prev => {
      if (prev.includes(type)) return prev.filter(t => t !== type);
      return [...prev, type];
    });
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Liste combinée BT + BL
  const combinedList = useMemo(() => {
    const btItems = workOrders.map(wo => ({
      ...wo,
      _type: 'bt',
      _number: wo.bt_number,
      _date: wo.work_date,
      _description: wo.work_description,
      _clientName: wo.client?.name || 'Client inconnu',
      _sortDate: wo.work_date || wo.created_at || '',
    }));

    const blItems = deliveryNotes.map(bl => ({
      ...bl,
      _type: 'bl',
      _number: bl.bl_number,
      _date: bl.delivery_date,
      _description: bl.delivery_description,
      _clientName: bl.client?.name || bl.client_name || 'Client inconnu',
      _sortDate: bl.delivery_date || bl.created_at || '',
    }));

    const all = [...btItems, ...blItems];
    // Trier par numéro décroissant (le plus récent en premier)
    all.sort((a, b) => {
      if (b._sortDate > a._sortDate) return 1;
      if (b._sortDate < a._sortDate) return -1;
      return 0;
    });

    return all;
  }, [workOrders, deliveryNotes]);

  // Filtrage
  const filteredItems = useMemo(() => {
    let filtered = combinedList;

    // 1. Filtre par type (multi-select)
    if (typeFilter.length > 0 && typeFilter.length < 2) {
      filtered = filtered.filter(item => typeFilter.includes(item._type));
    }

    // 2. Filtre par statut
    if (statusFilter.length > 0) {
      filtered = filtered.filter(item => statusFilter.includes(item.status));
    }

    // 3. Recherche
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(item => {
        switch (searchType) {
          case 'client':
            return item._clientName?.toLowerCase().includes(searchLower);
          case 'bt_number':
            return item._number?.toLowerCase().includes(searchLower);
          case 'date':
            return item._date?.includes(searchLower);
          default:
            return true;
        }
      });
    }

    return filtered;
  }, [combinedList, searchTerm, searchType, statusFilter, typeFilter]);

  // Supprimer
  const handleDelete = async (item) => {
    const label = item._type === 'bt' ? `bon de travail ${item.bt_number}` : `bon de livraison ${item.bl_number}`;
    if (!confirm(`Supprimer le ${label} ?\n\nCette action est irréversible.`)) return;

    const key = `${item._type}-${item.id}`;
    setActionLoading(prev => ({ ...prev, [key]: 'deleting' }));

    try {
      const endpoint = item._type === 'bt'
        ? `/api/work-orders?id=${item.id}`
        : `/api/delivery-notes?id=${item.id}`;

      const response = await fetch(endpoint, { method: 'DELETE' });

      if (response.ok) {
        if (item._type === 'bt') {
          setWorkOrders(prev => prev.filter(wo => wo.id !== item.id));
        } else {
          setDeliveryNotes(prev => prev.filter(bl => bl.id !== item.id));
        }
        alert(`${label} supprimé avec succès.`);
      } else {
        const error = await response.json();
        alert(`Erreur suppression: ${error.error}`);
      }
    } catch (error) {
      alert('Erreur lors de la suppression');
    } finally {
      setActionLoading(prev => {
        const newState = { ...prev };
        delete newState[key];
        return newState;
      });
    }
  };

  // Modifier
  const handleEdit = (item) => {
    if (item._type === 'bt') {
      router.push(`/bons-travail/${item.id}/modifier`);
    } else {
      router.push(`/bons-travail/bl/${item.id}/modifier`);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const [year, month, day] = dateStr.split('-');
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('fr-CA');
  };

  const getStatusColor = (status) => {
    const colors = {
      draft: 'bg-gray-100 text-gray-800',
      in_progress: 'bg-blue-100 text-blue-800',
      ready_for_signature: 'bg-blue-100 text-blue-800',
      signed: 'bg-green-100 text-green-800',
      completed: 'bg-green-100 text-green-800',
      pending_send: 'bg-orange-100 text-orange-800',
      sent: 'bg-purple-100 text-purple-800',
      archived: 'bg-gray-100 text-gray-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status) => {
    const labels = {
      draft: 'Brouillon',
      in_progress: 'En cours',
      ready_for_signature: 'A signer',
      signed: 'Signe',
      completed: 'Termine',
      pending_send: 'En attente',
      sent: 'Envoye',
      archived: 'Archive'
    };
    return labels[status] || status;
  };

  const canEdit = (status) => ['draft', 'in_progress'].includes(status);
  const canDelete = (status) => ['draft'].includes(status);

  const getSearchPlaceholder = () => {
    switch (searchType) {
      case 'client': return 'Rechercher par nom de client...';
      case 'bt_number': return 'Rechercher par numero de BT/BL...';
      case 'date': return 'Rechercher par date (YYYY-MM-DD)...';
      default: return 'Rechercher...';
    }
  };

  // Compteurs
  const totalBT = workOrders.length;
  const totalBL = deliveryNotes.length;
  const totalAll = totalBT + totalBL;
  const totalDrafts = combinedList.filter(i => i.status === 'draft').length;
  const totalSent = combinedList.filter(i => i.status === 'sent').length;
  const totalSigned = combinedList.filter(i => i.status === 'signed' || i.status === 'completed').length;

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
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 via-orange-400 to-gray-500 rounded-2xl shadow-xl p-4 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">Bons de Travail & Livraison</h1>
              <p className="text-blue-100 text-sm">BT + BL - Vue unifiee</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Link
                href="/bons-travail/nouveau"
                className="bg-white text-teal-600 px-4 py-2 rounded-lg hover:bg-blue-50 transition-all duration-200 flex items-center font-semibold shadow-lg text-sm whitespace-nowrap"
              >
                <Plus className="mr-1" size={18} />
                Nouveau BT
              </Link>
              <Link
                href="/bons-travail/nouveau-bl"
                className="bg-white text-orange-600 px-4 py-2 rounded-lg hover:bg-orange-50 transition-all duration-200 flex items-center font-semibold shadow-lg text-sm whitespace-nowrap"
              >
                <Plus className="mr-1" size={18} />
                Nouveau BL
              </Link>
              <ConnectionStatus className="hidden sm:flex" />
            </div>
          </div>

          {/* Statistiques */}
          <div className="hidden sm:grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3 border border-white/30">
              <div className="flex items-center">
                <div className="bg-white/30 p-2 rounded-full"><FileText className="w-5 h-5 text-white" /></div>
                <div className="ml-2">
                  <p className="text-blue-100 text-xs font-medium">Total</p>
                  <p className="text-2xl font-bold text-white">{totalAll}</p>
                  <p className="text-blue-200 text-xs">{totalBT} BT + {totalBL} BL</p>
                </div>
              </div>
            </div>

            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3 border border-white/30">
              <div className="flex items-center">
                <div className="bg-yellow-400/80 p-2 rounded-full"><Clock className="w-5 h-5 text-white" /></div>
                <div className="ml-2">
                  <p className="text-blue-100 text-xs font-medium">Brouillons</p>
                  <p className="text-2xl font-bold text-white">{totalDrafts}</p>
                </div>
              </div>
            </div>

            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3 border border-white/30">
              <div className="flex items-center">
                <div className="bg-green-400/80 p-2 rounded-full"><FileText className="w-5 h-5 text-white" /></div>
                <div className="ml-2">
                  <p className="text-blue-100 text-xs font-medium">Signes/Termines</p>
                  <p className="text-2xl font-bold text-white">{totalSigned}</p>
                </div>
              </div>
            </div>

            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3 border border-white/30">
              <div className="flex items-center">
                <div className="bg-purple-400/80 p-2 rounded-full"><Send className="w-5 h-5 text-white" /></div>
                <div className="ml-2">
                  <p className="text-blue-100 text-xs font-medium">Envoyes</p>
                  <p className="text-2xl font-bold text-white">{totalSent}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filtre par type BT/BL */}
        <div className="bg-white/70 backdrop-blur-sm rounded-xl shadow-lg p-4 mb-4 border border-white/50">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Filtrer par type:</h3>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setTypeFilter([])}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                typeFilter.length === 0
                  ? 'bg-gradient-to-r from-teal-500 to-blue-600 text-white shadow-md'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Tous ({totalAll})
            </button>
            <button
              onClick={() => toggleTypeFilter('bt')}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-1 ${
                typeFilter.includes('bt')
                  ? 'bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-md ring-2 ring-teal-400 ring-offset-1'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              <FileText size={14} /> BT ({totalBT})
            </button>
            <button
              onClick={() => toggleTypeFilter('bl')}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-1 ${
                typeFilter.includes('bl')
                  ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-md ring-2 ring-orange-400 ring-offset-1'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              <Truck size={14} /> BL ({totalBL})
            </button>
          </div>

          <h3 className="text-sm font-semibold text-gray-700 mb-3">Filtrer par statut:</h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setStatusFilter([])}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                statusFilter.length === 0
                  ? 'bg-gradient-to-r from-teal-500 to-blue-600 text-white shadow-md'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Tous
            </button>
            {['draft', 'ready_for_signature', 'signed', 'pending_send', 'sent'].map(status => (
              <button
                key={status}
                onClick={() => toggleStatusFilter(status)}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                  statusFilter.includes(status)
                    ? `bg-gradient-to-r ${
                        status === 'draft' ? 'from-gray-500 to-gray-600' :
                        status === 'ready_for_signature' ? 'from-blue-500 to-blue-600' :
                        status === 'signed' ? 'from-green-500 to-green-600' :
                        status === 'pending_send' ? 'from-orange-500 to-orange-600' :
                        'from-purple-500 to-purple-600'
                      } text-white shadow-md ring-2 ring-offset-1 ${
                        status === 'draft' ? 'ring-gray-400' :
                        status === 'ready_for_signature' ? 'ring-blue-400' :
                        status === 'signed' ? 'ring-green-400' :
                        status === 'pending_send' ? 'ring-orange-400' :
                        'ring-purple-400'
                      }`
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {getStatusLabel(status)} ({combinedList.filter(i => i.status === status).length})
              </button>
            ))}
          </div>

          {statusFilter.length > 0 && (
            <div className="mt-3 text-sm text-blue-700 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200 flex items-center justify-between">
              <span>
                <span className="font-semibold">{filteredItems.length}</span> resultat(s)
              </span>
              <button onClick={() => setStatusFilter([])} className="text-blue-600 hover:text-blue-800 font-medium underline">
                Reinitialiser
              </button>
            </div>
          )}
        </div>

        {/* Recherche */}
        <div className="bg-white/70 backdrop-blur-sm rounded-xl shadow-lg p-6 mb-6 border border-white/50">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="sm:w-48">
              <label className="block text-sm font-medium text-gray-700 mb-1">Rechercher par</label>
              <select
                value={searchType}
                onChange={(e) => setSearchType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              >
                <option value="client">Client</option>
                <option value="bt_number"># BT/BL</option>
                <option value="date">Date</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Terme de recherche</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={getSearchPlaceholder()}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                />
              </div>
            </div>
            {searchTerm && (
              <div className="sm:w-auto flex items-end">
                <button
                  onClick={() => setSearchTerm('')}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Effacer
                </button>
              </div>
            )}
          </div>
          {searchTerm && (
            <div className="mt-3 text-sm text-gray-600 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200">
              <span className="font-semibold text-blue-700">{filteredItems.length}</span> resultat(s) pour "{searchTerm}"
            </div>
          )}
        </div>

        {/* Liste */}
        <div className="bg-white/70 backdrop-blur-sm rounded-xl shadow-lg border border-white/50 overflow-hidden">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center">
              <div className="bg-gradient-to-r from-gray-200 to-gray-300 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText size={32} className="text-gray-500" />
              </div>
              {searchTerm ? (
                <>
                  <p className="text-gray-600 mb-4 text-lg">Aucun resultat pour "{searchTerm}"</p>
                  <button onClick={() => setSearchTerm('')} className="text-teal-600 hover:text-teal-700 font-medium">
                    Effacer la recherche
                  </button>
                </>
              ) : (
                <>
                  <p className="text-gray-600 mb-4 text-lg">Aucun bon pour le moment</p>
                  <div className="flex gap-3 justify-center">
                    <Link
                      href="/bons-travail/nouveau"
                      className="bg-gradient-to-r from-teal-500 to-blue-600 text-white px-6 py-3 rounded-lg inline-flex items-center font-medium"
                    >
                      <Plus className="mr-2" size={20} /> Nouveau BT
                    </Link>
                    <Link
                      href="/bons-travail/nouveau-bl"
                      className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-6 py-3 rounded-lg inline-flex items-center font-medium"
                    >
                      <Plus className="mr-2" size={20} /> Nouveau BL
                    </Link>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Version MOBILE / TABLETTE - Cartes compactes (style main) */}
              <div className="lg:hidden">
                {filteredItems.map((item) => {
                  const key = `${item._type}-${item.id}`;
                  const isBL = item._type === 'bl';
                  const dateStr = item._date;
                  const isOld = dateStr && (new Date() - new Date(dateStr)) > (15 * 24 * 60 * 60 * 1000) && item.status !== 'sent';

                  return (
                    <div
                      key={key}
                      onClick={() => handleEdit(item)}
                      className={`p-3 border-b last:border-b-0 hover:bg-blue-50 active:bg-blue-100 cursor-pointer ${
                        isOld ? 'bg-red-50 border-l-4 border-l-red-500' : ''
                      }`}
                    >
                      {/* Ligne 1: BT/BL# + Statut */}
                      <div className="flex items-center justify-between mb-2">
                        <span className={`font-mono text-sm font-bold flex items-center gap-1.5 ${
                          isBL
                            ? 'text-orange-600'
                            : 'bg-gradient-to-r from-teal-500 to-blue-600 bg-clip-text text-transparent'
                        }`}>
                          {item._number}
                          {!isBL && item.has_active_session && (
                            <span className="relative flex h-2.5 w-2.5" title="Session en cours">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-500"></span>
                            </span>
                          )}
                        </span>
                        <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusColor(item.status)}`}>
                          {getStatusLabel(item.status)}
                        </span>
                      </div>

                      {/* Ligne 2: Client */}
                      <div className="flex items-center text-sm text-gray-700 mb-1">
                        <User className="mr-1 flex-shrink-0" size={14} />
                        <span className="truncate font-medium">{item._clientName}</span>
                      </div>

                      {/* Ligne 3: Date + Heures (BT) ou Livraison (BL) */}
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <div className="flex items-center">
                          <Calendar className="mr-1" size={12} />
                          {formatDate(dateStr)}
                        </div>
                        {!isBL ? (
                          <div className="flex items-center">
                            <Clock className="mr-1" size={12} />
                            {formatHoursToHM(item.total_hours)}
                          </div>
                        ) : (
                          <div className="flex items-center text-orange-600">
                            <Package className="mr-1" size={12} />
                            Livraison
                          </div>
                        )}
                      </div>

                      {/* Description */}
                      {item._description && (
                        <p className="mt-1 text-xs text-gray-600 truncate">
                          {truncateText(item._description, 50)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Version DESKTOP - Tableau (style main avec px-6) */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-gray-50 to-blue-50">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">BT/BL #</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Client</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Date</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Heures</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Statut</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Description</th>
                      <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredItems.map((item, index) => {
                      const key = `${item._type}-${item.id}`;
                      const isBL = item._type === 'bl';
                      const dateStr = item._date;
                      const isOld = dateStr && (new Date() - new Date(dateStr)) > (15 * 24 * 60 * 60 * 1000) && item.status !== 'sent';

                      return (
                        <tr key={key} className={`hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 transition-all duration-200 ${
                          isOld ? 'bg-red-100 border-l-4 border-l-red-500' : index % 2 === 0 ? 'bg-white/50' : 'bg-gray-50/50'
                        }`}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`font-mono text-sm font-bold flex items-center gap-2 ${
                              isBL ? 'text-orange-600' : 'bg-gradient-to-r from-teal-500 to-blue-600 bg-clip-text text-transparent'
                            }`}>
                              {item._number}
                              {!isBL && item.has_active_session && (
                                <span className="relative flex h-3 w-3" title="Session en cours">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-gray-900 font-medium">{item._clientName}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center text-sm">
                              <Calendar className="mr-2 text-teal-500" size={14} />
                              <span className="font-medium">{formatDate(dateStr)}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {!isBL ? (
                              <span className="bg-gradient-to-r from-green-400 to-teal-500 bg-clip-text text-transparent font-bold">
                                {formatHoursToHM(item.total_hours)}
                              </span>
                            ) : (
                              <span className="text-orange-600 font-medium flex items-center gap-1">
                                <Package size={14} /> Livraison
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${getStatusColor(item.status)}`}>
                              {getStatusLabel(item.status)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600 w-48">
                            <div title={item._description || 'Aucune description'} className="cursor-help">
                              {truncateText(item._description, 60)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                onClick={() => handleEdit(item)}
                                className="bg-blue-100 text-blue-600 hover:bg-blue-200 hover:text-blue-700 p-2 rounded-lg transition-all duration-200"
                                title="Voir details"
                              >
                                <Eye size={16} />
                              </button>
                              {canEdit(item.status) && (
                                <button
                                  onClick={() => handleEdit(item)}
                                  className="bg-green-100 text-green-600 hover:bg-green-200 hover:text-green-700 p-2 rounded-lg transition-all duration-200"
                                  title="Modifier"
                                  disabled={actionLoading[key]}
                                >
                                  <Edit size={16} />
                                </button>
                              )}
                              {canDelete(item.status) && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                                  className="bg-red-100 text-red-600 hover:bg-red-200 hover:text-red-700 p-2 rounded-lg transition-all duration-200"
                                  title="Supprimer"
                                  disabled={actionLoading[key]}
                                >
                                  {actionLoading[key] === 'deleting' ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                                  ) : (
                                    <Trash2 size={16} />
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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
