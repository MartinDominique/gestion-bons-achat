// components/SoumissionsManager.js
'use client'
import { Upload } from 'lucide-react';
import { useRef } from 'react';
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Search, Plus, FileText, Calendar, Building, Hash, 
  Trash2, Eye, X, CheckCircle, Clock, XCircle, 
  Save, Edit2, Calculator, Users, Package, 
  Download, Upload, Printer
} from 'lucide-react';

export default function SoumissionsManager({ user }) {
  // États principaux
  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [currentQuote, setCurrentQuote] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [currentQuoteId, setCurrentQuoteId] = useState('');
  
  // États des modales
  const [showProductModal, setShowProductModal] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [showCustomProductModal, setShowCustomProductModal] = useState(false);
  const [showQuoteHistoryModal, setShowQuoteHistoryModal] = useState(false);
  
  // États de recherche et filtres
  const [productSearch, setProductSearch] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // États de chargement
  const [loading, setLoading] = useState(false);
  
const fileInputRef = useRef(null);

const handleImport = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const form = new FormData();
  form.append('file', file);

  const res = await fetch('/api/import-inventory', {
    method: 'POST',
    body: form,
  });
  const json = await res.json();

  if (res.ok) {
    alert(`${json.rows} produits mis à jour 👍`);
    loadProducts?.();
  } else {
    alert('Erreur : ' + (json.error?.message || 'inconnue'));
  }
};

  // Charger les données au démarrage
  useEffect(() => {
    if (user) {
      loadProducts();
      loadClients();
      loadQuotes();
      generateNewQuoteNumber();
    }
  }, [user]);

  // Fonctions de chargement des données
  const loadProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('product_id');
    
    if (!error && data) {
      setProducts(data);
    }
  };

  const loadClients = async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('name');
    
    if (!error && data) {
      setClients(data);
    }
  };

  const loadQuotes = async () => {
    const { data, error } = await supabase
      .from('quotes')
      .select(`
        *,
        clients (*)
      `)
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setQuotes(data);
    }
  };

  // Génération du numéro de soumission
  const generateNewQuoteNumber = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const time = today.getTime().toString().slice(-4);
    setCurrentQuoteId(`${year}${month}${day}-${time}`);
  };

  // Recherche de produits
  const handleProductSearch = (searchTerm) => {
    setProductSearch(searchTerm);
    
    if (searchTerm.length >= 2) {
      const results = products
        .filter(product => 
          product.product_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          product.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
          product.product_group.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .slice(0, 10);
      
      setSearchSuggestions(results);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  // Ajouter un produit à la soumission
  const addProductToQuote = (product, qty = null) => {
    const quantityToAdd = qty || quantity;
    const existingIndex = currentQuote.findIndex(item => item.product_id === product.product_id);
    
    if (existingIndex !== -1) {
      const updatedQuote = [...currentQuote];
      updatedQuote[existingIndex].quantity += quantityToAdd;
      setCurrentQuote(updatedQuote);
    } else {
      const newItem = {
        product_id: product.product_id,
        description: product.description,
        product_group: product.product_group,
        quantity: quantityToAdd,
        selling_price: product.selling_price,
        cost_price: product.cost_price,
        note: ''
      };
      setCurrentQuote([...currentQuote, newItem]);
    }
    
    setProductSearch('');
    setQuantity(1);
    setShowSuggestions(false);
  };

  // Supprimer un produit de la soumission
  const removeProductFromQuote = (index) => {
    const updatedQuote = currentQuote.filter((_, i) => i !== index);
    setCurrentQuote(updatedQuote);
  };

  // Calculer les totaux
  const calculateTotals = () => {
    const subtotal = currentQuote.reduce((sum, item) => sum + (item.quantity * item.selling_price), 0);
    const totalCost = currentQuote.reduce((sum, item) => sum + (item.quantity * item.cost_price), 0);
    const gst = subtotal * 0.05;
    const pst = subtotal * 0.09975;
    const total = subtotal + gst + pst;
    
    return { subtotal, totalCost, gst, pst, total };
  };

  // Sauvegarder la soumission
  const saveQuote = async () => {
    if (currentQuote.length === 0) {
      alert('Aucun produit à sauvegarder.');
      return;
    }
    
    if (!selectedClient) {
      alert('Veuillez sélectionner un client.');
      return;
    }
    
    setLoading(true);
    
    try {
      const totals = calculateTotals();
      
      // Insérer la soumission
      const { data: quoteData, error: quoteError } = await supabase
        .from('quotes')
        .upsert({
          id: currentQuoteId,
          client_id: selectedClient.id,
          quote_date: new Date().toISOString().split('T')[0],
          subtotal: totals.subtotal,
          total_cost: totals.totalCost,
          gst: totals.gst,
          pst: totals.pst,
          total: totals.total,
          status: 'draft',
          created_by: user.id
        });
      
      if (quoteError) throw quoteError;
      
      // Supprimer les anciens items
      await supabase
        .from('quote_items')
        .delete()
        .eq('quote_id', currentQuoteId);
      
      // Insérer les nouveaux items
      const quoteItems = currentQuote.map(item => ({
        quote_id: currentQuoteId,
        product_id: item.product_id,
        description: item.description,
        product_group: item.product_group,
        quantity: item.quantity,
        selling_price: item.selling_price,
        cost_price: item.cost_price,
        note: item.note || ''
      }));
      
      const { error: itemsError } = await supabase
        .from('quote_items')
        .insert(quoteItems);
      
      if (itemsError) throw itemsError;
      
      alert('Soumission sauvegardée avec succès!');
      loadQuotes();
      
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la sauvegarde: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const totals = calculateTotals();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* En-tête */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                <Calculator className="w-8 h-8 mr-3 text-blue-600" />
                Gestion des Soumissions
              </h1>
              <p className="text-gray-600 mt-1">Créer et gérer vos soumissions professionnelles</p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowQuoteHistoryModal(true)}
                className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                <FileText className="w-5 h-5 mr-2" />
                Historique
              </button>
              <button
                onClick={saveQuote}
                disabled={loading}
                className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                <Save className="w-5 h-5 mr-2" />
                {loading ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
            </div>
          </div>

          {/* Informations de la soumission */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-blue-50 rounded-lg">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">N° Soumission</label>
              <input
                type="text"
                value={currentQuoteId}
                readOnly
                className="w-full px-3 py-2 bg-gray-100 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="text"
                value={new Date().toLocaleDateString('fr-CA')}
                readOnly
                className="w-full px-3 py-2 bg-gray-100 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
              <select
                value={selectedClient?.id || ''}
                onChange={(e) => {
                  const client = clients.find(c => c.id === parseInt(e.target.value));
                  setSelectedClient(client);
                }}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Sélectionner un client --</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>
                    {client.company ? `${client.name} (${client.company})` : client.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Section recherche de produits */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Ajouter des produits</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2 relative">
              <label className="block text-sm font-medium text-gray-700 mb-2">Recherche produit</label>
              <input
                type="text"
                value={productSearch}
                onChange={(e) => handleProductSearch(e.target.value)}
                placeholder="Tapez le nom ou numéro du produit..."
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              
              {/* Suggestions */}
              {showSuggestions && searchSuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {searchSuggestions.map((product, index) => (
                    <div
                      key={index}
                      onClick={() => addProductToQuote(product)}
                      className="p-3 hover:bg-gray-100 cursor-pointer border-b"
                    >
                      <div className="font-medium text-gray-900">{product.product_id}</div>
                      <div className="text-sm text-gray-600">{product.description}</div>
                      <div className="text-sm text-blue-600 font-medium">${product.selling_price.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Quantité</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                min="1"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div className="flex items-end space-x-2">
              <button
                onClick={() => setShowCustomProductModal(true)}
                className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Personnalisé
              </button>
            </div>
          </div>
        </div>

        {/* Tableau des produits */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Produit #</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Note</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qté</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prix unit.</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sous-total</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {currentQuote.map((item, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {item.product_id}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {item.description}
                    </td>
                    <td className="px-6 py-4">
                      <input
                        type="text"
                        value={item.note}
                        onChange={(e) => {
                          const updatedQuote = [...currentQuote];
                          updatedQuote[index].note = e.target.value;
                          setCurrentQuote(updatedQuote);
                        }}
                        placeholder="Note..."
                        className="w-full px-2 py-1 text-sm border rounded"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => {
                          const updatedQuote = [...currentQuote];
                          updatedQuote[index].quantity = parseInt(e.target.value) || 1;
                          setCurrentQuote(updatedQuote);
                        }}
                        min="1"
                        className="w-20 px-2 py-1 text-sm border rounded text-center"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <input
                        type="number"
                        value={item.selling_price}
                        onChange={(e) => {
                          const updatedQuote = [...currentQuote];
                          updatedQuote[index].selling_price = parseFloat(e.target.value) || 0;
                          setCurrentQuote(updatedQuote);
                        }}
                        step="0.01"
                        min="0"
                        className="w-24 px-2 py-1 text-sm border rounded text-right"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      ${(item.quantity * item.selling_price).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => removeProductFromQuote(index)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {currentQuote.length === 0 && (
              <div className="text-center py-12">
                <Package className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-2 text-sm text-gray-600">Aucun produit ajouté</p>
              </div>
            )}
          </div>
        </div>

        {/* Résumé */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">Résumé de la soumission</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Coût total:</span>
              <span className="font-medium text-red-600">${totals.totalCost.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Sous-total:</span>
              <span className="font-medium">${totals.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">TPS (5%):</span>
              <span className="font-medium">${totals.gst.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">TVQ (9.975%):</span>
              <span className="font-medium">${totals.pst.toFixed(2)}</span>
            </div>
            <div className="border-t pt-3">
              <div className="flex justify-between text-lg font-bold">
                <span>TOTAL:</span>
                <span className="text-green-600">${totals.total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
