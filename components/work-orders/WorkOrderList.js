
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

  // Données de démo (remplacer par vraies données Supabase)
  const mockWorkOrders: WorkOrderWithClient[] = [
    {
      id: '1',
      bt_number: 'BT-2025-001',
      client_id: 'c1',
      client: { id: 'c1', name: 'Usine ABC Inc.', address: '123 Rue Industrielle' },
      work_date: '2025-09-08',
      start_time: '08:00',
      end_time: '16:30',
      total_hours: 7.5,
      status: 'completed',
      work_description: 'Installation panneau électrique 200A',
      created_at: '2025-09-08T10:00:00Z'
    },
    {
      id: '2',
      bt_number: 'BT-2025-002',
      client_id: 'c2',
      client: { id: 'c2', name: 'Manufacture XYZ', address: '456 Avenue du Commerce' },
      work_date: '2025-09-07',
      start_time: '09:00',
      end_time: '17:00',
      total_hours: 7.0,
      status: 'sent',
      work_description: 'Maintenance préventive moteurs',
      created_at: '2025-09-07T15:30:00Z'
    },
    {
      id: '3',
      bt_number: 'BT-2025-003',
      client_id: 'c3',
      client: { id: 'c3', name: 'Industries DEF', address: '789 Boulevard Technologique' },
      work_date: '2025-09-06',
      start_time: '07:30',
      end_time: '15:30',
      total_hours: 7.0,
      status: 'draft',
      work_description: 'Installation nouveaux circuits',
      created_at: '2025-09-06T08:00:00Z'
    }
  ];

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Bons de Travail</h1>
        <button
          onClick={handleCreateNew}
          className="mt-4 sm:mt-0 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center"
        >
          <Plus className="mr-2" size={20} />
          Nouveau BT
        </button>
      </div>

      {/* Filtres */}
      <div className="bg-white p-4 rounded-lg shadow space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Recherche */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Rechercher par BT#, client, description..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          {/* Filtre statut */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <select
              className="pl-10 pr-8 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
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
      </div>

      {/* Statistiques rapides */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Object.entries(statusLabels).map(([status, label]) => {
          const count = workOrders.filter(wo => wo.status === status).length;
          return (
            <div key={status} className="bg-white p-4 rounded-lg shadow text-center">
              <div className={`inline-block px-2 py-1 rounded text-sm font-medium ${statusColors[status as keyof typeof statusColors]}`}>
                {label}
              </div>
              <div className="text-2xl font-bold mt-2">{count}</div>
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
                <div key={workOrder.id} className="p-4 border-b last:border-b-0">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-gray-900">
                          {workOrder.bt_number}
                        </span>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusColors[workOrder.status]}`}>
                          {statusLabels[workOrder.status]}
                        </span>
                      </div>
                      
                      <div className="mt-1 flex items-center text-sm text-gray-600">
                        <User className="mr-1" size={14} />
                        {workOrder.client.name}
                      </div>
                      
                      <div className="mt-1 flex items-center space-x-4 text-sm text-gray-500">
                        <div className="flex items-center">
                          <Calendar className="mr-1" size={14} />
                          {formatDate(workOrder.work_date)}
                        </div>
                        <div className="flex items-center">
                          <Clock className="mr-1" size={14} />
                          {workOrder.total_hours || 0}h
                        </div>
                      </div>
                      
                      {workOrder.work_description && (
                        <p className="mt-2 text-sm text-gray-600 truncate">
                          {workOrder.work_description}
                        </p>
                      )}
                    </div>
                    
                    <button
                      onClick={() => handleView(workOrder)}
                      className="ml-4 text-gray-400 hover:text-gray-600"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal détail (simple) */}
      {selectedWorkOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-96 overflow-y-auto">
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
