'use client';

import { useState, useEffect } from 'react';
import { Save, X, Calendar, Clock, FileText, User, AlertCircle } from 'lucide-react';
import MaterialSelector from './MaterialSelector';

export default function WorkOrderForm({ 
  workOrder = null, 
  onSave, 
  onCancel, 
  mode = 'create',
  saving = false 
}) {
  const [formData, setFormData] = useState({
    client_id: '',
    work_date: new Date().toISOString().split('T')[0],
    start_time: '',
    end_time: '',
    work_description: '',
    additional_notes: '',
    status: 'draft'
  });

  const [materials, setMaterials] = useState([]);
  const [errors, setErrors] = useState({});
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);

  // Initialisation pour mode édition
  useEffect(() => {
    if (workOrder && mode === 'edit') {
      setFormData({
        client_id: workOrder.client_id?.toString() || '',
        work_date: workOrder.work_date || new Date().toISOString().split('T')[0],
        start_time: workOrder.start_time || '',
        end_time: workOrder.end_time || '',
        work_description: workOrder.work_description || '',
        additional_notes: workOrder.additional_notes || '',
        status: workOrder.status || 'draft'
      });
      
      if (workOrder.client) {
        setSelectedClient(workOrder.client);
      }

      // Charger les matériaux existants
      if (workOrder.materials) {
        setMaterials(workOrder.materials);
      }
    }
  }, [workOrder, mode]);

  // Charger les clients au démarrage
  useEffect(() => {
    const loadClients = async () => {
      try {
        const response = await fetch('/api/clients');
        if (response.ok) {
          const data = await response.json();
          setClients(data);
          
          // Si mode édition, sélectionner le client actuel
          if (workOrder && mode === 'edit') {
            const client = data.find(c => c.id === workOrder.client_id);
            if (client) {
              setSelectedClient(client);
            }
          }
        }
      } catch (error) {
        console.error('Erreur chargement clients:', error);
      }
    };
    
    loadClients();
  }, [workOrder, mode]);

  // Calcul du temps total (sans pause maintenant)
  const calculateTotalHours = () => {
    if (!formData.start_time || !formData.end_time) return 0;
    
    const start = new Date(`2000-01-01T${formData.start_time}:00`);
    const end = new Date(`2000-01-01T${formData.end_time}:00`);
    
    if (end <= start) return 0;
    
    const diffHours = (end - start) / (1000 * 60 * 60);
    return Math.max(0, diffHours);
  };

  // Validation
  const validateForm = () => {
    const newErrors = {};

    if (!formData.client_id) newErrors.client_id = 'Client requis';
    if (!formData.work_date) newErrors.work_date = 'Date requise';
    if (!formData.work_description || formData.work_description.length < 10) {
      newErrors.work_description = 'Description requise (min 10 caractères)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Gestion des changements
  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  // Sélection client
  const handleClientSelect = (clientId) => {
    const client = clients.find(c => c.id === parseInt(clientId));
    setSelectedClient(client);
    handleChange('client_id', clientId);
  };

  // FONCTION MANQUANTE - Gestion des matériaux
  const handleMaterialsChange = (updatedMaterials) => {
    setMaterials(updatedMaterials);
    // Supprimer l'erreur des matériaux si elle existe
    if (errors.materials) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.materials;
        return newErrors;
      });
    }
  };

  // Soumission avec statut spécifique
  const handleSubmit = async (status = 'draft') => {
    if (!validateForm()) return;

    const dataToSave = {
      ...formData,
      client_id: parseInt(formData.client_id),
      total_hours: calculateTotalHours(),
      status,
      materials
    };

    // Si mode édition, ajouter l'ID
    if (mode === 'edit' && workOrder) {
      dataToSave.id = workOrder.id;
    }

    onSave(dataToSave, status);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">
          {mode === 'create' ? 'Nouveau Bon de Travail' : `Édition ${workOrder?.bt_number}`}
        </h2>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X size={24} />
        </button>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-6">
        {/* Section Client */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <User className="inline mr-2" size={16} />
            Client *
          </label>
          <select
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.client_id ? 'border-red-500' : 'border-gray-300'
            }`}
            value={formData.client_id}
            onChange={(e) => handleClientSelect(e.target.value)}
          >
            <option value="">Sélectionner un client</option>
            {clients.map(client => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          {errors.client_id && (
            <p className="text-red-500 text-sm mt-1">{errors.client_id}</p>
          )}
          {selectedClient && (
            <div className="mt-2 p-2 bg-blue-50 rounded text-sm text-blue-800">
              {selectedClient.address && <div>{selectedClient.address}</div>}
              {selectedClient.email && <div>{selectedClient.email}</div>}
            </div>
          )}
        </div>

        {/* Date de travail */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Calendar className="inline mr-2" size={16} />
            Date de travail *
          </label>
          <input
            type="date"
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.work_date ? 'border-red-500' : 'border-gray-300'
            }`}
            value={formData.work_date}
            onChange={(e) => handleChange('work_date', e.target.value)}
          />
          {errors.work_date && (
            <p className="text-red-500 text-sm mt-1">{errors.work_date}</p>
          )}
        </div>

        {/* Heures - Simplifié sans pause */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Clock className="inline mr-2" size={16} />
              Heure début
            </label>
            <input
              type="time"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              value={formData.start_time}
              onChange={(e) => handleChange('start_time', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Heure fin
            </label>
            <input
              type="time"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              value={formData.end_time}
              onChange={(e) => handleChange('end_time', e.target.value)}
            />
          </div>
        </div>

        {/* Total heures - Sans pause */}
        {formData.start_time && formData.end_time && (
          <div className="bg-blue-50 p-3 rounded-lg">
            <p className="text-blue-800 font-medium">
              Total heures: {calculateTotalHours().toFixed(2)}h
            </p>
          </div>
        )}

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <FileText className="inline mr-2" size={16} />
            Description du travail *
          </label>
          <textarea
            rows={4}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.work_description ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Décrire les travaux effectués, installations, réparations..."
            value={formData.work_description}
            onChange={(e) => handleChange('work_description', e.target.value)}
          />
          {errors.work_description && (
            <p className="text-red-500 text-sm mt-1">{errors.work_description}</p>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Notes additionnelles
          </label>
          <textarea
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Observations, recommandations, prochaines étapes..."
            value={formData.additional_notes}
            onChange={(e) => handleChange('additional_notes', e.target.value)}
          />
        </div>

       {/* Section Matériaux */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-2">
              <span className="text-blue-600 font-bold text-sm">4</span>
            </div>
            Matériaux et Produits
          </h3>
          
          <MaterialSelector
            materials={materials}
            onMaterialsChange={handleMaterialsChange}
          />
          
          {errors.materials && (
            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded flex items-center">
              <AlertCircle className="text-yellow-600 mr-2" size={16} />
              <p className="text-yellow-800 text-sm">{errors.materials}</p>
            </div>
          )}
        </div>

        {/* Boutons d'action - Selon le mode */}
        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
          {mode === 'create' ? (
            // Boutons création
            <>
              <button
                type="button"
                onClick={() => handleSubmit('draft')}
                disabled={saving}
                className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 flex items-center justify-center"
              >
                <Save className="mr-2" size={16} />
                {saving ? 'Sauvegarde...' : 'Sauvegarder brouillon'}
              </button>

              <button
                type="button"
                onClick={() => handleSubmit('completed')}
                disabled={saving}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center"
              >
                {saving ? 'Création...' : 'Créer le BT'}
              </button>
            </>
          ) : (
            // Boutons édition
            <>
              <button
                type="button"
                onClick={() => handleSubmit('draft')}
                disabled={saving}
                className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 flex items-center justify-center"
              >
                <Save className="mr-2" size={16} />
                {saving ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>

              <button
                type="button"
                onClick={() => handleSubmit('completed')}
                disabled={saving}
                className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center"
              >
                {saving ? 'Finalisation...' : 'Finaliser'}
              </button>

              <button
                type="button"
                onClick={() => handleSubmit('sent')}
                disabled={saving}
                className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center"
              >
                {saving ? 'Envoi...' : 'Envoyer'}
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onCancel}
            className="bg-white border border-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-50"
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
