
import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  Calendar, 
  Clock, 
  User, 
  FileText, 
  Filter,
  ChevronRight,
  Eye,
  Edit,
  Trash2,
  Download
} from 'lucide-react';

// Types (normalement importés depuis votre fichier types)
interface WorkOrder {
  id: string;
  bt_number: string;
  client_id: string;
  work_date: string;
  start_time?: string;
  end_time?: string;
  total_hours?: number;
  status: 'draft' | 'in_progress' | 'completed' | 'sent' | 'archived';
  work_description?: string;
  created_at: string;
}

interface Client {
  id: string;
  name: string;
  address: string;
}

interface WorkOrderWithClient extends WorkOrder {
  client: Client;
}

// Composant principal
const WorkOrderList: React.FC = () => {
  const [workOrders, setWorkOrders] = useState<WorkOrderWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrderWithClient | null>(null);

  useEffect(() => {
    // Simulation chargement données
    setTimeout(() => {
      setWorkOrders(mockWorkOrders);
      setLoading(false);
    }, 500);
  }, []);

  // Labels et couleurs des statuts
  const statusLabels = {
    draft: 'Brouillon',
    in_progress: 'En cours',
    completed: 'Terminé',
    sent: 'Envoyé',
    archived: 'Archivé'
  };

  const statusColors = {
    draft: 'bg-gray-100 text-gray-800',
    in_progress: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    sent: 'bg-purple-100 text-purple-800',
    archived: 'bg-slate-100 text-slate-800'
  };

  // Filtrage des données
  const filteredWorkOrders = workOrders.filter(wo => {
    const matchesSearch = 
      wo.bt_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      wo.client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (wo.work_description?.toLowerCase().includes(searchQuery.toLowerCase()) || false);
    
    const matchesStatus = statusFilter === 'all' || wo.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Handlers
  const handleCreateNew = () => {
    window.location.href = '/bons-travail/nouveau';
  };

  const handleView = (workOrder: WorkOrderWithClient) => {
    setSelectedWorkOrder(workOrder);
  };

  const handleEdit = (workOrder: WorkOrderWithClient) => {
    window.location.href = `/bons-travail/${workOrder.id}/edit`;
  };

  const handleDelete = (workOrder: WorkOrderWithClient) => {
    if (confirm(`Supprimer le bon de travail ${workOrder.bt_number} ?`)) {
      setWorkOrders(prev => prev.filter(wo => wo.id !== workOrder.id));
    }
  };

  const handleDownloadPDF = (workOrder: WorkOrderWithClient) => {
    alert(`Téléchargement PDF pour ${workOrder.bt_number}\n(À implémenter avec la génération PDF)`);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-CA');
  };

  const formatTime = (time?: string) => {
    if (!time) return '-';
    return time.substring(0, 5); // HH:MM
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Chargement des bons de travail...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Bons de Travail</h1>
        <button
          onClick={handleCreateNew}
          className="bg-blue-600 text-white px-3 py-2 sm:px-4 sm:py-2 rounded-lg hover:bg-blue-700 flex items-center whitespace-nowrap text-sm sm:text-base"
        >
          <Plus className="mr-1 sm:mr-2" size={18} />
          <span className="hidden sm:inline">Nouveau BT</span>
          <span className="sm:hidden">Nouveau</span>
        </button>
      </div>

      {/* Filtres */}
      <div className="bg-white p-3 sm:p-4 rounded-lg shadow space-y-3">
        {/* Recherche */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Rechercher BT#, client..."
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        {/* Filtre statut */}
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          <select
            className="w-full pl-9 pr-8 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Tous les statuts</option>
            <option value="draft">Brouillons</option>
            <option value="in_progress">En cours</option>
            <option value="completed">Terminés</option>
            <option value="sent">Envoyés</option>
            <option value="archived">Archivés</option>
          </select>
        </div>
      </div>

      {/* Statistiques rapides - Masqué sur mobile */}
      <div className="hidden sm:grid grid-cols-2 md:grid-cols-5 gap-3">
        {Object.entries(statusLabels).map(([status, label]) => {
          const count = workOrders.filter(wo => wo.status === status).length;
          return (
            <div key={status} className="bg-white p-3 rounded-lg shadow text-center">
              <div className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusColors[status as keyof typeof statusColors]}`}>
                {label}
              </div>
              <div className="text-xl font-bold mt-1">{count}</div>
            </div>
          );
        })}
      </div>

      {/* Liste des bons de travail */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredWorkOrders.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <FileText size={48} className="mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium">Aucun bon de travail trouvé</p>
            <p className="text-sm">Essayez de modifier vos critères de recherche</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Version desktop */}
            <table className="hidden md:table w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Bon de travail
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Client
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Heures
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Statut
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredWorkOrders.map((workOrder) => (
                  <tr key={workOrder.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {workOrder.bt_number}
                        </div>
                        <div className="text-sm text-gray-500 truncate max-w-48">
                          {workOrder.work_description}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{workOrder.client.name}</div>
                      <div className="text-sm text-gray-500">{workOrder.client.address}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center">
                        <Calendar className="mr-1" size={14} />
                        {formatDate(workOrder.work_date)}
                      </div>
                      <div className="flex items-center text-gray-500 mt-1">
                        <Clock className="mr-1" size={14} />
                        {formatTime(workOrder.start_time)} - {formatTime(workOrder.end_time)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className="font-medium">{workOrder.total_hours || 0}h</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusColors[workOrder.status]}`}>
                        {statusLabels[workOrder.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleView(workOrder)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Voir"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => handleEdit(workOrder)}
                          className="text-gray-600 hover:text-gray-900"
                          title="Éditer"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDownloadPDF(workOrder)}
                          className="text-green-600 hover:text-green-900"
                          title="PDF"
                        >
                          <Download size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(workOrder)}
                          className="text-red-600 hover:text-red-900"
                          title="Supprimer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Version mobile */}
            <div className="md:hidden">
              {filteredWorkOrders.map((workOrder) => (
                <div 
                  key={workOrder.id} 
                  onClick={() => handleView(workOrder)}
                  className="p-3 border-b last:border-b-0 active:bg-blue-50 cursor-pointer"
                >
                  {/* Ligne 1: BT# + Statut */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-gray-900">
                      {workOrder.bt_number}
                    </span>
                    <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${statusColors[workOrder.status]}`}>
                      {statusLabels[workOrder.status]}
                    </span>
                  </div>
                  
                  {/* Ligne 2: Client */}
                  <div className="flex items-center text-sm text-gray-700 mb-1">
                    <User className="mr-1 flex-shrink-0" size={14} />
                    <span className="truncate">{workOrder.client.name}</span>
                  </div>
                  
                  {/* Ligne 3: Date + Heures */}
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <div className="flex items-center">
                      <Calendar className="mr-1" size={12} />
                      {formatDate(workOrder.work_date)}
                    </div>
                    <div className="flex items-center">
                      <Clock className="mr-1" size={12} />
                      {workOrder.total_hours || 0}h
                    </div>
                  </div>
                  
                  {/* Description (optionnel, tronqué) */}
                  {workOrder.work_description && (
                    <p className="mt-1 text-xs text-gray-600 truncate">
                      {workOrder.work_description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal détail (simple) */}
      {selectedWorkOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[85vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">Détail BT {selectedWorkOrder.bt_number}</h3>
                <button
                  onClick={() => setSelectedWorkOrder(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <strong>Client:</strong> {selectedWorkOrder.client.name}
                </div>
                <div>
                  <strong>Date:</strong> {formatDate(selectedWorkOrder.work_date)}
                </div>
                <div>
                  <strong>Heures:</strong> {formatTime(selectedWorkOrder.start_time)} - {formatTime(selectedWorkOrder.end_time)} ({selectedWorkOrder.total_hours}h)
                </div>
                <div>
                  <strong>Statut:</strong> 
                  <span className={`ml-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusColors[selectedWorkOrder.status]}`}>
                    {statusLabels[selectedWorkOrder.status]}
                  </span>
                </div>
                {selectedWorkOrder.work_description && (
                  <div>
                    <strong>Description:</strong>
                    <p className="mt-1 text-gray-600">{selectedWorkOrder.work_description}</p>
                  </div>
                )}
              </div>
              
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => handleEdit(selectedWorkOrder)}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Éditer
                </button>
                <button
                  onClick={() => handleDownloadPDF(selectedWorkOrder)}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkOrderList;
