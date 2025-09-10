'use client';

import { useState, useEffect } from 'react';
import { Save, X, Calendar, Clock, FileText, User } from 'lucide-react';

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
    break_time: 0.5,
    work_description: '',
    additional_notes: '',
    status: 'draft'
  });

  const [materials, setMaterials] = useState([]);
  const [errors, setErrors] = useState({});
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);

  // Charger les clients au démarrage
  useEffect(() => {
    const loadClients = async () => {
      try {
        const response = await fetch('/api/clients');
        if (response.ok) {
          const data = await response.json();
          setClients(data);
        }
      } catch (error) {
        console.error('Erreur chargement clients:', error);
      }
    };
    
    loadClients();
  }, []);

  // Calcul du temps total
  const calculateTotalHours = () => {
    if (!formData.start_time || !formData.end_time) return 0;
    
    const start = new Date(`2000-01-01T${formData.start_time}:00`);
    const end = new Date(`2000-01-01T${formData.end_time}:00`);
    
    if (end <= start) return 0;
    
    const diffHours = (end - start) / (1000 * 60 * 60);
    return Math.max(0, diffHours - (formData.break_time || 0));
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

  // Soumission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    const dataToSave = {
      ...formData,
      client_id: parseInt(formData.client_id),
      total_hours: calculateTotalHours(),
      materials
    };

    onSave(dataToSave);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">
          {mode === 'create' ? 'Nouveau Bon de Travail' : 'Édition Bon de Travail'}
        </h2>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X size={24} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
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

        {/* Heures */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Pause (heures)
            </label>
            <input
              type="number"
              step="0.25"
              min="0"
              max="8"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              value={formData.break_time}
              onChange={(e) => handleChange('break_time', parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>

        {/* Total heures */}
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

        {/* Matériaux - Version simplifiée pour commencer */}
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-3">Matériaux utilisés</h3>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <p className="text-gray-500 mb-2">Section matériaux - À développer</p>
            <p className="text-sm text-gray-400">
              Recherche dans vos {clients.length > 0 ? '6718' : ''} produits à venir
            </p>
          </div>
        </div>

        {/* Boutons */}
        <div className="flex gap-3 pt-4 border-t">
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center"
          >
            <Save className="mr-2" size={16} />
            {saving ? 'Sauvegarde...' : (mode === 'create' ? 'Créer le BT' : 'Mettre à jour')}
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="bg-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-400"
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
