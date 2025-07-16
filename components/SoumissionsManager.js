'use client';
import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '../lib/supabase';
import ClientModal from './ClientModal';
import {
  Plus, FileText, Save, Calculator, Package,
  Upload, Trash2, Download, Users, History, Edit, X, Eye, Mail
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
  const [editingQuote, setEditingQuote] = useState(null);

  const [productSearch, setProductSearch] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [showClientModal, setShowClientModal] = useState(false);
  const [editClient, setEditClient] = useState(null);
  const [showQuoteHistory, setShowQuoteHistory] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [selectedHistoryQuote, setSelectedHistoryQuote] = useState(null);

  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sendingReport, setSendingReport] = useState(false);

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
        console.log(`🎉 TOUS les ${allProducts.length} produits chargés !`);
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
          clients (*)
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

  // Fonction de numérotation automatique YYYYMM-XX
  async function generateNewQuoteNumber() {
    try {
      const now = new Date();
      const yearMonth = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
      
      // Chercher le dernier numéro de ce mois
      const { data, error } = await supabase
        .from('quotes')
        .select('id')
        .like('id', `${yearMonth}-%`)
        .order('id', { ascending: false })
        .limit(1);
      
      if (error) {
        console.error('Erreur génération numéro:', error);
        setCurrentQuoteId(`${yearMonth}-01`);
        return;
      }
      
      let nextNumber = 1;
      if (data && data.length > 0) {
        const lastId = data[0].id;
        const lastNumber = parseInt(lastId.split('-')[1]) || 0;
        nextNumber = lastNumber + 1;
      }
      
      const newQuoteId = `${yearMonth}-${String(nextNumber).padStart(2, '0')}`;
      setCurrentQuoteId(newQuoteId);
      console.log('📄 Nouveau numéro de soumission:', newQuoteId);
      
    } catch (error) {
      console.error('Erreur generateNewQuoteNumber:', error);
      const now = new Date();
      const yearMonth = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
      setCurrentQuoteId(`${yearMonth}-01`);
    }
  }

  // Fonction d'envoi du rapport hebdomadaire
  async function sendWeeklyReport() {
    setSendingReport(true);
    try {
      console.log('📧 Envoi du rapport hebdomadaire...');
      
      const response = await fetch('/api/send-weekly-report', {
        method: 'GET'
      });
      
      const result = await response.json();
      
      if (response.ok) {
        alert(`✅ Rapport envoyé avec succès !\n\n${result.message}\nEmail ID: ${result.emailId}`);
        console.log('✅ Rapport envoyé:', result);
      } else {
        alert(`❌ Erreur envoi rapport: ${result.error}`);
        console.error('❌ Erreur:', result);
      }
      
    } catch (error) {
      console.error('❌ Erreur sendWeeklyReport:', error);
      alert(`❌ Erreur technique: ${error.message}`);
    } finally {
      setSendingReport(false);
    }
  }

  // Gestion de sélection client
  function handleClientSelection(clientId) {
    if (!clientId) {
      setSelectedClient(null);
      return;
    }
    
    const client = clients.find(c => String(c.id) === String(clientId));
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
      
      const { error: qErr } = await supabase.from('quotes').upsert({
        id: currentQuoteId,
        client_id: selectedClient.id,
        quote_date: new Date().toISOString().slice(0, 10),
        subtotal: t.subtotal,
        total_cost: t.totalCost,
        gst: t.gst, 
        pst: t.pst, 
        total: t.total,
        status: editingQuote ? editingQuote.status : 'draft'
      });
      
      if (qErr) {
        console.error('Erreur sauvegarde soumission:', qErr);
        alert('Erreur: ' + qErr.message);
        return;
      }

      await supabase.from('quote_items').delete().eq('quote_id', currentQuoteId);

      const items = currentQuote.map(it => ({
        quote_id: currentQuoteId,
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

      alert(editingQuote ? 'Soumission modifiée avec succès !' : 'Soumission sauvegardée avec succès !');
      
      resetForm();
      await loadQuotes();
      
    } catch (error) {
      console.error('Erreur saveQuote:', error);
      alert('Erreur: ' + error.message);
    }
  }

  // Fonction pour charger une soumission à modifier
  async function loadQuoteForEdit(quote) {
    try {
      setEditingQuote(quote);
      setCurrentQuoteId(quote.id);
      
      const client = clients.find(c => c.id === quote.client_id);
      setSelectedClient(client || null);
      
      const { data: items, error } = await supabase
        .from('quote_items')
        .select('*')
        .eq('quote_id', quote.id);
      
      if (error) {
        console.error('Erreur chargement items:', error);
        return;
      }
      
      setCurrentQuote(items || []);
      setShowQuoteHistory(false);
      setShowQuoteModal(false);
      
    } catch (error) {
      console.error('Erreur loadQuoteForEdit:', error);
    }
  }

  // Fonction pour voir les détails d'une soumission
  async function viewQuoteDetails(quote) {
    try {
      const { data: items, error } = await supabase
        .from('quote_items')
        .select('*')
        .eq('quote_id', quote.id);
      
      if (error) {
        console.error('Erreur chargement détails:', error);
        return;
      }
      
      setSelectedHistoryQuote({
        ...quote,
        items: items || []
      });
      
    } catch (error) {
      console.error('Erreur viewQuoteDetails:', error);
    }
  }

  function resetForm() {
    setCurrentQuote([]);
    setSelectedClient(null);
    setEditingQuote(null);
    generateNewQuoteNumber();
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
          <div className="quote-container">
            {/* En-tête professionnel */}
            <div className="flex justify-between items-start mb-8">
              <div>
                <div className="flex items-center mb-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg flex items-center justify-center mr-4">
                    <span className="text-white font-bold text-2xl">ST</span>
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">Services TMT</h1>
                    <p className="text-gray-600">Solutions techniques et maintenance</p>
                  </div>
                </div>
                <div className="text-sm text-gray-600">
                  <p>123 Rue Principale</p>
                  <p>Saint-Georges, QC G5Y 1A1</p>
                  <p>Tél: (418) 555-0123</p>
                  <p>Email: info@servicestmt.com</p>
                </div>
              </div>
              
              <div className="text-right">
                <h2 className="text-3xl font-bold text-gray-900 mb-2">SOUMISSION</h2>
                <div className="text-sm">
                  <p><strong>N°:</strong> {currentQuoteId}</p>
                  <p><strong>Date:</strong> {new Date().toLocaleDateString('fr-CA')}</p>
                  <p><strong>Valide jusqu'au:</strong> {new Date(Date.now() + 30*24*60*60*1000).toLocaleDateString('fr-CA')}</p>
                </div>
              </div>
            </div>

            {/* Informations client */}
            {selectedClient && (
              <div className="client-info bg-gray-50 border border-gray-300 p-4 rounded mb-6">
                <h3 className="font-bold text-lg mb-2">FACTURÉ À:</h3>
                <div>
                  <p className="font-semibold">{selectedClient.name}</p>
                  {selectedClient.company && <p>{selectedClient.company}</p>}
                  {selectedClient.email && <p>Email: {selectedClient.email}</p>}
                  {selectedClient.phone && <p>Tél: {selectedClient.phone}</p>}
                </div>
              </div>
            )}

            {/* Tableau des articles pour impression */}
            {currentQuote.length > 0 && (
              <div className="mb-8">
                <table className="w-full border-collapse border border-gray-400">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-400 px-3 py-2 text-left">Code</th>
                      <th className="border border-gray-400 px-3 py-2 text-left">Description</th>
                      <th className="border border-gray-400 px-3 py-2 text-center">Qté</th>
                      <th className="border border-gray-400 px-3 py-2 text-right">Prix unit.</th>
                      <th className="border border-gray-400 px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentQuote.map((item, idx) => (
                      <tr key={idx}>
                        <td className="border border-gray-400 px-3 py-2 font-mono text-sm">{item.product_id}</td>
                        <td className="border border-gray-400 px-3 py-2">
                          <div className="text-sm">{item.description}</div>
                          {item.note && (
                            <div className="text-xs text-gray-600 italic mt-1">Note: {item.note}</div>
                          )}
                        </td>
                        <td className="border border-gray-400 px-3 py-2 text-center">{item.quantity}</td>
                        <td className="border border-gray-400 px-3 py-2 text-right text-sm">
                          ${(item.selling_price || 0).toFixed(2)}
                        </td>
                        <td className="border border-gray-400 px-3 py-2 text-right font-semibold text-sm">
                          ${((item.quantity || 0) * (item.selling_price || 0)).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Résumé financier pour impression */}
            <div className="grid grid-cols-2 gap-8 border-2 border-gray-800 p-4">
              <div>
                <h4 className="font-bold mb-3">TERMES ET CONDITIONS:</h4>
                <div className="text-sm space-y-1">
                  <p>• Paiement net 30 jours</p>
                  <p>• Prix valides pour 30 jours</p>
                  <p>• Installation non incluse</p>
                  <p>• Garantie: 1 an pièces et main d'œuvre</p>
                </div>
                
                <div className="mt-4">
                  <p className="font-semibold text-sm">Merci de votre confiance!</p>
                  <p className="text-sm">Pour questions: info@servicestmt.com</p>
                </div>
              </div>
              
              <div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Sous-total:</span>
                    <span>${totals.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>TPS (5%):</span>
                    <span>${totals.gst.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>TVQ (9.975%):</span>
                    <span>${totals.pst.toFixed(2)}</span>
                  </div>
                  <div className="border-t-2 border-gray-800 pt-2 flex justify-between text-lg font-bold">
                    <span>TOTAL:</span>
                    <span>${totals.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Interface normale (masquée à l'impression) */}
        <div className="print:hidden">
          
          {/* En-tête avec boutons d'action */}
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold flex items-center">
              <Calculator className="w-8 h-8 mr-3 text-blue-600" />
              {editingQuote ? 'Modification Soumission' : 'Gestion des Soumissions'}
              <span className="ml-4 text-sm font-normal text-gray-500">
                ({products.length} produits disponibles)
              </span>
            </h1>
            <div className="flex gap-3">
              {editingQuote && (
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
                <Save className="w-5 h-5 mr-2" /> {editingQuote ? 'Modifier' : 'Sauvegarder'}
              </button>
              <button 
                onClick={() => window.print()} 
                disabled={currentQuote.length === 0 || !selectedClient}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4 mr-2" />Imprimer PDF
              </button>
              <button 
                onClick={sendWeeklyReport}
                disabled={sendingReport}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center disabled:opacity-50"
                title="Envoyer rapport par email"
              >
                {sendingReport ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Envoi...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4 mr-2" />
                    📧 Rapport
                  </>
                )}
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
                onClick={() => setShowQuoteModal(true)} 
                className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center"
              >
                <History className="w-4 h-4 mr-1" /> Historique
              </button>
              <input ref={fileInputRef} type="file" accept=".csv" hidden onChange={handleImport} />
            </div>
          </div>

          {/* Message si en cours de modification */}
          {editingQuote && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-blue-800">
                <strong>Modification en cours:</strong> Soumission {editingQuote.id} - 
                Client: {clients.find(c => c.id === editingQuote.client_id)?.name || 'Inconnu'}
              </p>
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

      {/* Modal - Historique des Soumissions avec choix défilant */}
      {showQuoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white w-full max-w-6xl rounded-lg p-6 relative shadow-xl max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setShowQuoteModal(false);
                setSelectedHistoryQuote(null);
              }}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold mb-6">Historique des Soumissions ({quotes.length})</h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Liste des soumissions */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Liste des soumissions</h3>
                <div className="max-h-96 overflow-y-auto border border-gray-200 rounded">
                  {quotes.map(quote => (
                    <div 
                      key={quote.id} 
                      className={`p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                        selectedHistoryQuote?.id === quote.id ? 'bg-blue-50 border-blue-200' : ''
                      }`}
                      onClick={() => viewQuoteDetails(quote)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-gray-900">{quote.id}</p>
                          <p className="text-sm text-gray-600">{quote.clients?.name || 'Client supprimé'}</p>
                          <p className="text-sm text-gray-500">{new Date(quote.created_at).toLocaleDateString('fr-CA')}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-green-600">${(quote.total || 0).toFixed(2)}</p>
                          <div className="flex gap-1 mt-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                loadQuoteForEdit(quote);
                              }}
                              className="text-blue-600 hover:text-blue-800"
                              title="Modifier"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                viewQuoteDetails(quote);
                              }}
                              className="text-gray-600 hover:text-gray-800"
                              title="Voir détails"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {quotes.length === 0 && (
                    <div className="p-8 text-center text-gray-500">
                      Aucune soumission trouvée
                    </div>
                  )}
                </div>
              </div>

              {/* Détails de la soumission sélectionnée */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Détails de la soumission</h3>
                {selectedHistoryQuote ? (
                  <div className="border border-gray-200 rounded p-4">
                    <div className="mb-4">
                      <h4 className="font-medium text-gray-900">{selectedHistoryQuote.id}</h4>
                      <p className="text-sm text-gray-600">Client: {selectedHistoryQuote.clients?.name}</p>
                      <p className="text-sm text-gray-600">Date: {new Date(selectedHistoryQuote.created_at).toLocaleDateString('fr-CA')}</p>
                      <p className="text-sm text-green-600 font-medium">Total: ${(selectedHistoryQuote.total || 0).toFixed(2)}</p>
                    </div>
                    
                    <div className="max-h-64 overflow-y-auto">
                      <h5 className="font-medium mb-2">Articles ({selectedHistoryQuote.items?.length || 0}):</h5>
                      {selectedHistoryQuote.items?.map((item, idx) => (
                        <div key={idx} className="text-sm border-b border-gray-100 py-2">
                          <div className="flex justify-between">
                            <span className="font-medium">{item.product_id}</span>
                            <span>${((item.quantity || 0) * (item.selling_price || 0)).toFixed(2)}</span>
                          </div>
                          <div className="text-gray-600">{item.description}</div>
                          <div className="text-gray-500">Qté: {item.quantity} × ${(item.selling_price || 0).toFixed(2)}</div>
                          {item.note && <div className="text-gray-500 italic">Note: {item.note}</div>}
                        </div>
                      ))}
                    </div>
                    
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => loadQuoteForEdit(selectedHistoryQuote)}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 flex items-center"
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Modifier
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded p-8 text-center text-gray-500">
                    Cliquez sur une soumission pour voir les détails
                  </div>
                )}
              </div>
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
