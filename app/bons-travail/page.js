'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Calendar, Clock, User, FileText, Edit, Trash2, Send, Eye, Search } from 'lucide-react';

export default function BonsTravailPage() {
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState('client'); // 'client', 'bt_number', 'date'
  const router = useRouter();

  // Fonction pour tronquer le texte
  const truncateText = (text, maxLength = 50) => {
    if (!text) return '-';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const fetchWorkOrders = async () => {
    try {
      const response = await fetch('/api/work-orders');
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

  useEffect(() => {
    fetchWorkOrders();
  }, []);

  // Filtrer les bons de travail selon la recherche
  const filteredWorkOrders = useMemo(() => {
    if (!searchTerm.trim()) return workOrders;

    const searchLower = searchTerm.toLowerCase().trim();

    return workOrders.filter(wo => {
      switch (searchType) {
        case 'client':
          return wo.client?.name?.toLowerCase().includes(searchLower);
        
        case 'bt_number':
          return wo.bt_number?.toLowerCase().includes(searchLower);
        
        case 'date':
          // Recherche par date (format YYYY-MM-DD ou DD/MM/YYYY ou MM/DD/YYYY)
          const workDate = wo.work_date ? new Date(wo.work_date).toLocaleDateString('fr-CA') : '';
          const workDateFr = wo.work_date ? new Date(wo.work_date).toLocaleDateString('fr-FR') : '';
          const workDateUs = wo.work_date ? new Date(wo.work_date).toLocaleDateString('en-US') : '';
          
          return workDate.includes(searchLower) || 
                 workDateFr.includes(searchLower) || 
                 workDateUs.includes(searchLower) ||
                 wo.work_date?.includes(searchLower);
        
        default:
          return true;
      }
    });
  }, [workOrders, searchTerm, searchType]);

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
    return new Date(dateStr).toLocaleDateString('fr-CA');
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
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2">Chargement...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Bons de Travail</h1>
        <Link 
          href="/bons-travail/nouveau"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center"
        >
          <Plus className="mr-2" size={20} />
          Nouveau BT
        </Link>
      </div>

      {/* Barre de recherche */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Sélecteur de type de recherche */}
          <div className="sm:w-48">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rechercher par
            </label>
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Bouton pour effacer */}
          {searchTerm && (
            <div className="sm:w-auto flex items-end">
              <button
                onClick={() => setSearchTerm('')}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Effacer
              </button>
            </div>
          )}
        </div>

        {/* Indicateur de résultats */}
        {searchTerm && (
          <div className="mt-3 text-sm text-gray-600">
            {filteredWorkOrders.length} résultat(s) trouvé(s) pour "{searchTerm}"
          </div>
        )}
      </div>

      {/* Statistiques rapides */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="bg-gray-100 p-2 rounded-full">
              <FileText className="w-6 h-6 text-gray-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total</p>
              <p className="text-2xl font-bold text-gray-900">{filteredWorkOrders.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="bg-yellow-100 p-2 rounded-full">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Brouillons</p>
              <p className="text-2xl font-bold text-gray-900">
                {filteredWorkOrders.filter(wo => wo.status === 'draft').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="bg-green-100 p-2 rounded-full">
              <FileText className="w-6 h-6 text-green-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Terminés</p>
              <p className="text-2xl font-bold text-gray-900">
                {filteredWorkOrders.filter(wo => wo.status === 'completed').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="bg-purple-100 p-2 rounded-full">
              <Send className="w-6 h-6 text-purple-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Envoyés</p>
              <p className="text-2xl font-bold text-gray-900">
                {filteredWorkOrders.filter(wo => wo.status === 'sent').length}
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow">
        {filteredWorkOrders.length === 0 ? (
          <div className="p-8 text-center">
            <FileText size={48} className="mx-auto mb-4 text-gray-300" />
            {searchTerm ? (
              <>
                <p className="text-gray-600 mb-4">
                  Aucun bon de travail trouvé pour "{searchTerm}"
                </p>
                <button
                  onClick={() => setSearchTerm('')}
                  className="text-blue-600 hover:text-blue-700"
                >
                  Effacer la recherche
                </button>
              </>
            ) : (
              <>
                <p className="text-gray-600 mb-4">Aucun bon de travail pour le moment</p>
                <Link 
                  href="/bons-travail/nouveau"
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                >
                  Créer le premier BT
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">BT #</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Client</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Date</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Heures</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Statut</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Description</th>
                  <th className="px-6 py-3 text-right text-sm font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredWorkOrders.map((wo) => (
                  <tr key={wo.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-sm">
                      {wo.bt_number}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <User className="mr-2" size={16} />
                        {wo.client?.name || 'Client inconnu'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm">
                        <Calendar className="mr-1" size={14} />
                        {formatDate(wo.work_date)}
                      </div>
                      {(wo.start_time || wo.end_time) && (
                        <div className="flex items-center text-sm text-gray-500 mt-1">
                          <Clock className="mr-1" size={14} />
                          {formatTime(wo.start_time)} - {formatTime(wo.end_time)}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {wo.total_hours ? `${wo.total_hours}h` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(wo.status)}`}>
                        {getStatusLabel(wo.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 w-48">
                      <div title={wo.work_description || 'Aucune description'}>
                        {truncateText(wo.work_description, 60)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        {/* Bouton Voir */}
                        <button
                          onClick={() => handleEdit(wo)}
                          className="text-blue-600 hover:text-blue-900 p-1"
                          title="Voir détails"
                        >
                          <Eye size={16} />
                        </button>

                        {/* Bouton Modifier */}
                        {canEdit(wo.status) && (
                          <button
                            onClick={() => handleEdit(wo)}
                            className="text-green-600 hover:text-green-900 p-1"
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
                            className="text-purple-600 hover:text-purple-900 p-1"
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
                            className="text-red-600 hover:text-red-900 p-1"
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
        )}
      </div>
    </div>
  );
}
