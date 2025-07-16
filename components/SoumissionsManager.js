'use client';
import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '../lib/supabase';
import ClientModal from './ClientModal';
import {
  Plus, FileText, Save, Calculator, Package,
  Upload, Trash2, Download, Users, History, Edit2, X, Mail
} from 'lucide-react';

export default function SoumissionsManager() {
  const supabase = createClient();
  const [user, setUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  const [quotes, setQuotes] = useState([]);

  const [currentQuote, setCurrentQuote] = useState([]);
  const [currentQuoteId, setCurrentQuoteId] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [editingQuoteId, setEditingQuoteId] = useState(null); // Pour modification

  const [productSearch, setProductSearch] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [showClientModal, setShowClientModal] = useState(false);
  const [editClient, setEditClient] = useState(null);
  const [showQuoteHistory, setShowQuoteHistory] = useState(false);
  const [selectedHistoryQuote, setSelectedHistoryQuote] = useState(null);

  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Vérifier l'authentification et charger les données
  useEffect(() => {
    const initializeData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.error('Utilisateur non connecté');
          return;
        }
        setUser(user);

        await Promise.all([
          loadProducts(),
          loadClients(), 
          loadQuotes()
        ]);
        
        await generateNewQuoteNumber();
      } catch (error) {
        console.error('Erreur initialisation:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeData();
  }, []);

  async function loadProducts() {
    try {
      console.log('🔄 Chargement de TOUS les produits...');
      
      let { data, error, count } = await supabase
        .from('products')
        .select('*', { count: 'exact' })
        .order('product_id')
        .range(0, 9999);
      
      if (error) {
        console.error('Erreur chargement produits:', error);
        return;
      }
      
      console.log(`✅ ${data?.length || 0} produits chargés sur ${count} total`);
      
      if (data.length < count) {
        console.log('📄 Pagination nécessaire...');
        let allProducts = [...data];
        let from = data.length;
        
        while (from < count) {
          const { data: nextBatch, error: nextError } = await supabase
            .from('products')
            .select('*')
            .order('product_id')
            .range(from, from + 999);
          
          if (nextError) break;
          allProducts = [...allProducts, ...nextBatch];
          from += nextBatch.length;
          if (nextBatch.length === 0) break;
        }
        setProducts(allProducts);
      } else {
        setProducts(data || []);
      }
    } catch (error) {
      console.error('Erreur loadProducts:', error);
    }
  }

  async function loadClients() {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name');
      
      if (error) {
        console.error('Erreur chargement clients:', error);
        return;
      }
      
      setClients(data || []);
    } catch (error) {
      console.error('Erreur loadClients:', error);
    }
  }

  async function loadQuotes() {
    try {
      const { data, error } = await supabase
        .from('quotes')
        .select(`
          *,
          clients (*),
          quote_items (*)
        `)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Erreur chargement soumissions:', error);
        return;
      }
      
      setQuotes(data || []);
    } catch (error) {
      console.error('Erreur loadQuotes:', error);
    }
  }

  // Génération automatique du numéro de soumission (format 2507-01)
  async function generateNewQuoteNumber() {
    try {
      const now = new Date();
      const yearMonth = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const prefix = `${yearMonth}-`;

      // Trouver le dernier numéro utilisé ce mois
      const { data, error } = await supabase
        .from('quotes')
        .select('id')
        .like('id', `${prefix}%`)
        .order('id', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Erreur génération numéro:', error);
        setCurrentQuoteId(`${prefix}01`);
        return;
      }

      let nextNumber = 1;
      if (data && data.length > 0) {
        const lastId = data[0].id;
        const lastNumber = parseInt(lastId.split('-')[1]);
        nextNumber = lastNumber + 1;
      }

      const newQuoteId = `${prefix}${String(nextNumber).padStart(2, '0')}`;
      setCurrentQuoteId(newQuoteId);
      console.log('📄 Nouveau numéro généré:', newQuoteId);
    } catch (error) {
      console.error('Erreur generateNewQuoteNumber:', error);
      // Fallback
      const now = new Date();
      const yearMonth = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
      setCurrentQuoteId(`${yearMonth}-01`);
    }
  }

  // Gestion de sélection client
  function handleClientSelection(clientId) {
    if (!clientId) {
      setSelectedClient(null);
      return;
    }
    
    const client = clients.find(c => parseInt(c.id) === parseInt(clientId));
    setSelectedClient(client || null);
  }

  // Gestion de recherche produit optimisée
  function handleProductSearch(val) {
    setProductSearch(val);
    
    if (val.length < 2) {
      setShowSuggestions(false);
      setSearchSuggestions([]);
      return;
    }
    
    const searchTerm = val.toLowerCase();
    const res = products.filter(p => {
      const productId = p.product_id ? String(p.product_id).toLowerCase() : '';
      const description = p.description ? String(p.description).toLowerCase() : '';
      return productId.includes(searchTerm) || description.includes(searchTerm);
    }).slice(0, 12);
    
    setSearchSuggestions(res);
    setShowSuggestions(res.length > 0);
  }

  function addProductToQuote(product, qty = null) {
    const q = qty || quantity;
    const idx = currentQuote.findIndex(i => i.product_id === product.product_id);
    
    if (idx !== -1) {
      const updated = [...currentQuote];
      updated[idx].quantity += q;
      setCurrentQuote(updated);
    } else {
      setCurrentQuote([...currentQuote, { 
        ...product, 
        quantity: q, 
        note: '',
        selling_price: product.selling_price || 0,
        cost_price: product.cost_price || 0
      }]);
    }
    
    setProductSearch('');
    setQuantity(1);
    setShowSuggestions(false);
  }

  function removeProductFromQuote(i) {
    setCurrentQuote(currentQuote.filter((_, idx) => idx !== i));
  }

  function calculateTotals() {
    const sub = currentQuote.reduce((s, it) => s + (it.quantity * (it.selling_price || 0)), 0);
    const cost = currentQuote.reduce((s, it) => s + (it.quantity * (it.cost_price || 0)), 0);
    const gst = sub * 0.05;
    const pst = sub * 0.09975;
    return { subtotal: sub, totalCost: cost, gst, pst, total: sub + gst + pst };
  }

  // Sauvegarder ou modifier une soumission
  async function saveQuote() {
    if (!selectedClient) {
      alert('Veuillez sélectionner un client');
      return;
    }
    if (!currentQuote.length) {
      alert('Veuillez ajouter au moins un produit');
      return;
    }

    try {
      const t = calculateTotals();
      const isEditing = editingQuoteId !== null;
      const quoteId = editingQuoteId || currentQuoteId;
      
      // Sauvegarder la soumission
      const { error: qErr } = await supabase.from('quotes').upsert({
        id: quoteId,
        client_id: parseInt(selectedClient.id),
        quote_date: new Date().toISOString().slice(0, 10),
        subtotal: t.subtotal,
        total_cost: t.totalCost,
        gst: t.gst, 
        pst: t.pst, 
        total: t.total,
        status: 'draft'
      });
      
      if (qErr) {
        console.error('Erreur sauvegarde soumission:', qErr);
        alert('Erreur: ' + qErr.message);
        return;
      }

      // Supprimer les anciens items
      await supabase.from('quote_items').delete().eq('quote_id', quoteId);

      // Ajouter les nouveaux items
      const items = currentQuote.map(it => ({
        quote_id: quoteId,
        product_id: it.product_id,
        description: it.description,
        quantity: it.quantity,
        selling_price: it.selling_price || 0,
        cost_price: it.cost_price || 0,
        note: it.note || ''
      }));

      const { error: iErr } = await supabase.from('quote_items').insert(items);
      
      if (iErr) {
        console.error('Erreur sauvegarde items:', iErr);
        alert('Erreur items: ' + iErr.message);
        return;
      }

      alert(isEditing ? 'Soumission modifiée avec succès !' : 'Soumission sauvegardée avec succès !');
      
      // Réinitialiser
      resetForm();
      await loadQuotes();
      
    } catch (error) {
      console.error('Erreur saveQuote:', error);
      alert('Erreur: ' + error.message);
    }
  }

  // Charger une soumission pour modification
  async function editQuote(quote) {
    try {
      // Charger les items de la soumission
      const { data: items, error } = await supabase
        .from('quote_items')
        .select('*')
        .eq('quote_id', quote.id);

      if (error) {
        console.error('Erreur chargement items:', error);
        alert('Erreur lors du chargement de la soumission');
        return;
      }

      // Populer le formulaire
      setEditingQuoteId(quote.id);
      setCurrentQuoteId(quote.id);
      setSelectedClient(quote.clients);
      setCurrentQuote(items || []);
      setShowQuoteHistory(false);

      console.log('✏️ Soumission chargée pour modification:', quote.id);
    } catch (error) {
      console.error('Erreur editQuote:', error);
      alert('Erreur: ' + error.message);
    }
  }

  // Réinitialiser le formulaire
  function resetForm() {
    setCurrentQuote([]);
    setSelectedClient(null);
    setEditingQuoteId(null);
    generateNewQuoteNumber();
  }

  // Sélectionner une soumission depuis l'historique
  function selectFromHistory(quote) {
    setSelectedHistoryQuote(quote);
  }

  // Envoyer rapport par email
  async function sendEmailReport() {
    if (!user?.email) {
      alert('Aucun email configuré pour l\'utilisateur');
      return;
    }

    setSendingEmail(true);
    try {
      const response = await fetch('/api/send-weekly-report', {
        method: 'GET'
      });

      const result = await response.json();

      if (response.ok) {
        alert(`Rapport envoyé avec succès ! ${result.message || ''}`);
      } else {
        alert('Erreur envoi email: ' + result.error);
      }
    } catch (error) {
      console.error('Erreur envoi email:', error);
      alert('Erreur technique: ' + error.message);
    } finally {
      setSendingEmail(false);
    }
  }

  async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    setImporting(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/import-inventory', { method: 'POST', body: form });
      const json = await res.json();
      
      if (res.ok) {
        alert(`${json.rows} produits mis à jour`);
        await loadProducts();
      } else {
        alert('Erreur import: ' + json.error);
      }
    } catch (error) {
      alert('Erreur: ' + error.message);
    } finally {
      setImporting(false);
    }
  }

  // Afficher loading
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement des données...</p>
          <p className="text-sm text-gray-500 mt-2">Chargement de ~3700 produits</p>
        </div>
      </div>
    );
  }

  const totals = calculateTotals();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Vue professionnelle pour impression */}
        <div className="hidden print:block">
          {/* ... Code d'impression identique ... */}
        </div>

        {/* Interface normale (masquée à l'impression) */}
        <div className="print:hidden">
          
          {/* En-tête avec boutons d'action */}
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold flex items-center">
              <Calculator className="w-8 h-8 mr-3 text-blue-600" />
              {editingQuoteId ? 'Modifier Soumission' : 'Gestion des Soumissions'}
              <span className="ml-4 text-sm font-normal text-gray-500">
                ({products.length} produits disponibles)
              </span>
            </h1>
            <div className="flex gap-3">
              {editingQuoteId && (
                <button 
                  onClick={resetForm}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center"
                >
                  <X className="w-5 h-5 mr-2" /> Annuler
                </button>
              )}
              <button 
                onClick={saveQuote} 
                disabled={!selectedClient || currentQuote.length === 0}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-5 h-5 mr-2" /> 
                {editingQuoteId ? 'Modifier' : 'Sauvegarder'}
              </button>
              <button 
                onClick={() => window.print()} 
                disabled={currentQuote.length === 0 || !selectedClient}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4 mr-2" />Imprimer PDF
              </button>
              <button 
                onClick={sendEmailReport}
                disabled={sendingEmail}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center disabled:opacity-50"
              >
                <Mail className="w-4 h-4 mr-2" />
                {sendingEmail ? 'Envoi...' : 'Email Rapport'}
              </button>
              <button 
                onClick={() => fileInputRef.current?.click()} 
                disabled={importing} 
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center disabled:opacity-50"
              >
                {importing ? 'Import…' : <><Upload className="w-4 h-4 mr-2" />Importer CSV</>}
              </button>
              <button 
                onClick={() => { setEditClient(null); setShowClientModal(true); }} 
                className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center"
              >
                <Users className="w-4 h-4 mr-1" /> Clients
              </button>
              <button 
                onClick={() => setShowQuoteHistory(!showQuoteHistory)} 
                className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center"
              >
                <History className="w-4 h-4 mr-1" /> Historique
              </button>
              <input ref={fileInputRef} type="file" accept=".csv" hidden onChange={handleImport} />
            </div>
          </div>

          {/* Alert si modification en cours */}
          {editingQuoteId && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-center">
                <Edit2 className="w-5 h-5 text-blue-600 mr-2" />
                <span className="text-blue-800 font-medium">
                  Modification en cours de la soumission {editingQuoteId}
                </span>
              </div>
            </div>
          )}

          {/* Informations de la soumission */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium mb-1">N° Soumission</label>
              <input 
                value={currentQuoteId} 
                readOnly 
                className="w-full bg-gray-100 border px-3 py-2 rounded font-mono" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Date</label>
              <input 
                value={new Date().toLocaleDateString('fr-CA')} 
                readOnly 
                className="w-full bg-gray-100 border px-3 py-2 rounded" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Client *</label>
              <select
                value={selectedClient?.id || ''}
                onChange={(e) => handleClientSelection(e.target.value)}
                className="w-full border border-gray-300 px-3 py-2 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">-- Sélectionner un client --</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.company ? `${c.name} (${c.company})` : c.name}
                  </option>
                ))}
              </select>
              {clients.length === 0 && (
                <p className="text-sm text-orange-600 mt-1">
                  Aucun client trouvé. Créez-en un d'abord.
                </p>
              )}
              {selectedClient && (
                <p className="text-sm text-green-600 mt-1">
                  ✓ Client sélectionné: {selectedClient.name}
                </p>
              )}
            </div>
          </div>

          {/* Section d'ajout de produits */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <Plus className="w-5 h-5 mr-2" />
              Ajouter des produits
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2 relative">
                <label className="block text-sm font-medium mb-1">Recherche produit</label>
                <input
                  value={productSearch}
                  onChange={e => handleProductSearch(e.target.value)}
                  onFocus={() => {
                    if (productSearch.length >= 2 && searchSuggestions.length > 0) {
                      setShowSuggestions(true);
                    }
                  }}
                  onBlur={() => {
                    setTimeout(() => setShowSuggestions(false), 200);
                  }}
                  placeholder="Tapez au moins 2 caractères..."
                  className="w-full border border-gray-300 px-3 py-2 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                
                {products.length === 0 && (
                  <p className="text-sm text-orange-600 mt-1">
                    Aucun produit dans l'inventaire. Importez un fichier CSV d'abord.
                  </p>
                )}
                
                {showSuggestions && searchSuggestions.length > 0 && (
                  <div className="absolute z-50 w-full bg-white border-2 border-blue-300 rounded-md mt-1 max-h-60 overflow-y-auto shadow-xl">
                    <div className="bg-blue-50 px-3 py-1 text-xs text-blue-700 font-medium">
                      {searchSuggestions.length} résultat(s) trouvé(s)
                    </div>
                    {searchSuggestions.map((p, index) => (
                      <div
                        key={p.id || index}
                        onMouseDown={() => addProductToQuote(p)}
                        className="p-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                      >
                        <div className="font-medium text-gray-900">{p.product_id}</div>
                        <div className="text-sm text-gray-600 truncate">{p.description}</div>
                        <div className="text-sm text-blue-600 font-medium">
                          ${(p.selling_price || 0).toFixed(2)}
                          {p.stock_qty !== undefined && (
                            <span className="text-gray-500 ml-2">Stock: {p.stock_qty}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {showSuggestions && searchSuggestions.length === 0 && productSearch.length >= 2 && (
                  <div className="absolute z-50 w-full bg-white border border-gray-300 rounded-md mt-1 p-3 shadow-lg">
                    <div className="text-gray-500 text-sm">Aucun produit trouvé pour "{productSearch}"</div>
                  </div>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Quantité</label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={e => setQuantity(parseInt(e.target.value) || 1)}
                  className="w-full border border-gray-300 px-3 py-2 rounded text-center focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div className="flex items-end">
                <button
                  onClick={() => {
                    if (searchSuggestions.length > 0) {
                      addProductToQuote(searchSuggestions[0]);
                    }
                  }}
                  disabled={!productSearch || searchSuggestions.length === 0}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50 flex items-center justify-center"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Ajouter
                </button>
              </div>
            </div>
          </div>

          {/* Tableau des produits dans la soumission */}
          <div className="bg-white rounded-lg shadow-md overflow-x-auto mb-6">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Produit #', 'Description', 'Note', 'Qté', 'Prix unitaire', 'Sous-total', ''].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {currentQuote.map((it, idx) => (
                  <tr key={idx}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{it.product_id}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{it.description}</td>
                    <td className="px-6 py-4">
                      <input
                        value={it.note}
                        onChange={e => {
                          const u = [...currentQuote];
                          u[idx].note = e.target.value;
                          setCurrentQuote(u);
                        }}
                        className="border px-2 py-1 rounded w-full text-sm"
                        placeholder="Note optionnelle"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <input
                        type="number"
                        min="1"
                        value={it.quantity}
                        onChange={e => {
                          const u = [...currentQuote];
                          u[idx].quantity = parseInt(e.target.value) || 1;
                          setCurrentQuote(u);
                        }}
                        className="border px-2 py-1 rounded w-20 text-center text-sm"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <input
                        type="number"
                        value={it.selling_price}
                        onChange={e => {
                          const u = [...currentQuote];
                          u[idx].selling_price = parseFloat(e.target.value) || 0;
                          setCurrentQuote(u);
                        }}
                        step="0.01"
                        min="0"
                        className="border px-2 py-1 rounded w-24 text-right text-sm"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      ${((it.quantity || 0) * (it.selling_price || 0)).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <button 
                        onClick={() => removeProductFromQuote(idx)} 
                        className="text-red-600 hover:text-red-800"
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
                <Package className="mx-auto w-12 h-12 text-gray-400 mb-4" />
                <p className="text-gray-600">Aucun produit ajouté à la soumission</p>
                <p className="text-sm text-gray-500">Utilisez la recherche ci-dessus pour ajouter des produits</p>
              </div>
            )}
          </div>

          {/* Résumé financier */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4">Résumé financier</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Coût total :</span>
                <span className="text-red-600 font-medium">${totals.totalCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Sous-total :</span>
                <span className="font-medium">${totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>TPS (5%) :</span>
                <span>${totals.gst.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>TVQ (9.975%) :</span>
                <span>${totals.pst.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 text-lg font-bold">
                <span>TOTAL :</span>
                <span className="text-green-600">${totals.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

        </div> {/* Fin de print:hidden */}

      </div>

      {/* Modal - Historique des soumissions amélioré */}
      {showQuoteHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white w-full max-w-6xl rounded-lg p-6 relative shadow-xl max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowQuoteHistory(false)}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold mb-6">Historique des Soumissions ({quotes.length})</h2>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">N° Soumission</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {quotes.map(q => (
                    <tr key={q.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{q.id}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {new Date(q.created_at).toLocaleDateString('fr-CA')}
                      </td>
                      <td className="px-6 py-4 text-sm">{q.clients?.name || 'Client supprimé'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        ${(q.total || 0).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          q.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                          q.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {q.status || 'draft'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex gap-2">
                          <button
                            onClick={() => editQuote(q)}
                            className="text-blue-600 hover:text-blue-800"
                            title="Modifier"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => selectFromHistory(q)}
                            className="text-green-600 hover:text-green-800"
                            title="Sélectionner"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {quotes.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                        Aucune soumission trouvée
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal de gestion des clients */}
      <ClientModal
        open={showClientModal}
        onClose={() => setShowClientModal(false)}
        onSaved={loadClients}
        client={editClient}
      />
    </div>
  );
}
