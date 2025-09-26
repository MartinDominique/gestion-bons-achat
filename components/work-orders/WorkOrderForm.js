'use client';

import { useState, useEffect } from 'react';
import { Save, X, Calendar, Clock, FileText, User, AlertCircle, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
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
    client_po_number: '', // NOUVEAU: Numéro bon d'achat client
    work_date: new Date().toISOString().split('T')[0],
    start_time: '',
    end_time: '',
    work_description: '',
    additional_notes: '',
    status: 'draft'
  });

  // NOUVEAU: État pour descriptions multiligne
  const [descriptions, setDescriptions] = useState(['']);
  
  // NOUVEAU: État pour checkbox prix
  const [showPrices, setShowPrices] = useState(false);

  const [materials, setMaterials] = useState([]);
  const [errors, setErrors] = useState({});
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);

  // Initialisation pour mode édition
  useEffect(() => {
    if (workOrder && mode === 'edit') {
      setFormData({
        client_id: workOrder.client_id?.toString() || '',
        linked_po_id: workOrder.linked_po_id || '', // Lien vers purchase_orders
        work_date: workOrder.work_date || new Date().toISOString().split('T')[0],
        start_time: workOrder.start_time || '',
        end_time: workOrder.end_time || '',
        work_description: workOrder.work_description || '',
        additional_notes: workOrder.additional_notes || '',
        status: workOrder.status || 'draft'
      });
      
      // NOUVEAU: Convertir description en tableau de paragraphes
      if (workOrder.work_description) {
        const paragraphs = workOrder.work_description.split('\n\n').filter(p => p.trim());
        setDescriptions(paragraphs.length > 0 ? paragraphs : ['']);
      }
      
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

  // NOUVEAU: Synchroniser descriptions avec work_description
  useEffect(() => {
    const combinedDescription = descriptions
      .filter(desc => desc.trim()) // Enlever les paragraphes vides
      .join('\n\n'); // Joindre avec double saut de ligne
    
    setFormData(prev => ({ ...prev, work_description: combinedDescription }));
  }, [descriptions]);

  // NOUVEAU: Gestion des descriptions multiligne
  const handleDescriptionChange = (index, value) => {
    const newDescriptions = [...descriptions];
    newDescriptions[index] = value;
    setDescriptions(newDescriptions);
  };

  const addDescription = () => {
    setDescriptions([...descriptions, '']);
  };

  const removeDescription = (index) => {
    if (descriptions.length > 1) {
      const newDescriptions = descriptions.filter((_, i) => i !== index);
      setDescriptions(newDescriptions);
    }
  };

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
    
    // MODIFIÉ: Validation sur descriptions combinées
    const hasValidDescription = descriptions.some(desc => desc.trim().length >= 10);
    if (!hasValidDescription) {
      newErrors.work_description = 'Au moins une description de 10 caractères minimum requise';
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

  // Gestion des matériaux
  const handleMaterialsChange = (updatedMaterials) => {
    console.log('🔄 MATERIALS CHANGED:', updatedMaterials);
    console.log('🔄 MATERIALS COUNT:', updatedMaterials.length);
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

  // MODIFIÉ: Soumission avec nouveaux statuts
  const handleSubmit = async (status = 'draft') => {
    if (!validateForm()) return;

    console.log('📝 ÉTAT ACTUEL:');
    console.log('- descriptions:', descriptions);
    console.log('- formData.work_description:', formData.work_description);
    console.log('- materials:', materials);
    console.log('- materials.length:', materials.length);

    const dataToSave = {
      ...formData,
      client_id: parseInt(formData.client_id),
      total_hours: calculateTotalHours(),
      status,
      materials
    };
    
    console.log('📝 DATASAVE.MATERIALS:', dataToSave.materials);
    console.log('📝 DATASAVE.WORK_DESCRIPTION:', dataToSave.work_description);

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
        {/* Section Client + Bon d'achat */}
        <div className="bg-blue-50 p-4 rounded-lg space-y-4">
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
              <div className="mt-2 p-2 bg-white rounded text-sm text-blue-800">
                {selectedClient.address && <div>{selectedClient.address}</div>}
                {selectedClient.email && <div>{selectedClient.email}</div>}
              </div>
            )}
          </div>

          {/* NOUVEAU: Sélection bon d'achat client */}
          {selectedClient && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                📋 Bon d'achat / Job client (optionnel)
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                value={formData.linked_po_id}
                onChange={(e) => handleChange('linked_po_id', e.target.value)}
              >
                <option value="">Aucun bon d'achat associé</option>
                {clientPurchaseOrders.map(po => (
                  <option key={po.id} value={po.id}>
                    {po.po_number} - {po.status} 
                    {po.total_amount && ` - ${new Intl.NumberFormat('en-CA', {
                      style: 'currency',
                      currency: 'CAD'
                    }).format(po.total_amount)}`}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Lier ce BT à un bon d'achat existant pour le suivi comptable
              </p>
              {clientPurchaseOrders.length === 0 && (
                <p className="text-xs text-yellow-600 mt-1">
                  Aucun bon d'achat trouvé pour ce client
                </p>
              )}
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

        {/* NOUVEAU: Descriptions multiligne avec ajout de lignes */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-gray-700">
              <FileText className="inline mr-2" size={16} />
              Descriptions du travail *
            </label>
            <button
              type="button"
              onClick={addDescription}
              className="bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 flex items-center text-sm"
            >
              <Plus className="mr-1" size={14} />
              Ajouter ligne
            </button>
          </div>
          
          {descriptions.map((description, index) => (
            <div key={index} className="mb-3 flex gap-2">
              <div className="flex-1">
                <textarea
                  rows={2}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                    errors.work_description && index === 0 ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder={index === 0 ? "Description principale des travaux effectués..." : "Description additionnelle..."}
                  value={description}
                  onChange={(e) => handleDescriptionChange(index, e.target.value)}
                />
              </div>
              {descriptions.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeDescription(index)}
                  className="text-red-500 hover:text-red-700 p-2"
                  title="Supprimer cette ligne"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
          
          {errors.work_description && (
            <p className="text-red-500 text-sm mt-1">{errors.work_description}</p>
          )}
          
          {/* Aperçu combiné */}
          {descriptions.some(d => d.trim()) && (
            <div className="mt-3 p-3 bg-white border rounded-lg">
              <div className="text-xs text-gray-500 mb-2">Aperçu final:</div>
              <div className="text-sm text-gray-700 whitespace-pre-line">
                {descriptions.filter(d => d.trim()).join('\n\n')}
              </div>
            </div>
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

        {/* NOUVEAU: Section Matériaux avec checkbox prix */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-2">
                <span className="text-blue-600 font-bold text-sm">4</span>
              </div>
              Matériaux et Produits
            </h3>
            
            {/* NOUVEAU: Checkbox afficher prix */}
            <div className="flex items-center">
              <input
                type="checkbox"
                id="showPrices"
                checked={showPrices}
                onChange={(e) => setShowPrices(e.target.checked)}
                className="mr-2 rounded"
              />
              <label 
                htmlFor="showPrices" 
                className="text-sm text-gray-700 flex items-center cursor-pointer"
              >
                {showPrices ? <Eye size={16} className="mr-1" /> : <EyeOff size={16} className="mr-1" />}
                Afficher prix de vente
              </label>
            </div>
          </div>
          
          <MaterialSelector
            materials={materials}
            onMaterialsChange={handleMaterialsChange}
            showPrices={showPrices} // NOUVEAU: Passer le paramètre
          />
          
          {errors.materials && (
            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded flex items-center">
              <AlertCircle className="text-yellow-600 mr-2" size={16} />
              <p className="text-yellow-800 text-sm">{errors.materials}</p>
            </div>
          )}
        </div>

        {/* MODIFIÉ: Nouveaux boutons workflow terrain */}
        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
          {/* Bouton Sauvegarder brouillon - toujours disponible */}
          <button
            type="button"
            onClick={() => handleSubmit('draft')}
            disabled={saving}
            className="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-200 disabled:opacity-50 flex items-center justify-center font-medium"
          >
            <Save className="mr-2" size={16} />
            {saving ? 'Sauvegarde...' : 'Sauvegarder pour plus tard'}
          </button>

          {/* Bouton Présenter au client - workflow principal */}
          <button
            type="button"
            onClick={() => handleSubmit('ready_for_signature')}
            disabled={saving}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center font-medium"
          >
            <FileText className="mr-2" size={16} />
            {saving ? 'Préparation...' : 'Présenter au client'}
          </button>

          {/* Bouton Annuler */}
          <button
            type="button"
            onClick={onCancel}
            className="bg-white border border-gray-300 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-50 font-medium"
          >
            Annuler
          </button>
        </div>

        {/* NOUVEAU: Aide contextuelle workflow */}
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <h4 className="font-medium text-blue-900 mb-2">💡 Workflow Terrain</h4>
          <div className="text-sm text-blue-800 space-y-1">
            <p><strong>Sauvegarder pour plus tard:</strong> Garde le BT en brouillon, vous pourrez le reprendre</p>
            <p><strong>Présenter au client:</strong> Prépare le BT pour signature sur tablette</p>
            <p><strong>Afficher prix:</strong> Cochez si le client doit voir les prix des matériaux</p>
          </div>
        </div>
      </form>
    </div>
  );
}
