'use client';
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import ClientModal from './ClientModal';

import {
  Plus, FileText, Save, Calculator, Package,
  Upload, Trash2
} from 'lucide-react';

export default function SoumissionsManager({ user }) {
  /* ---------- états principaux ---------- */
  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  const [quotes,  setQuotes]  = useState([]);

  const [currentQuote, setCurrentQuote] = useState([]);
  const [currentQuoteId, setCurrentQuoteId] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);

  /* ---------- UI ---------- */
  const [productSearch, setProductSearch] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions]   = useState(false);

  const [showClientModal, setShowClientModal]   = useState(false);
  const [editClient, setEditClient]             = useState(null);

  const [showQuoteHistoryModal, setShowQuoteHistoryModal] = useState(false);

  /* ---------- chargement au démarrage ---------- */
  useEffect(() => {
    if (!user) return;
    loadProducts();
    loadClients();
    loadQuotes();
    generateNewQuoteNumber();
  }, [user]);

  async function loadProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('product_id');
    if (!error) setProducts(data);
  }

  async function loadClients() {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('name');
    if (!error) setClients(data);
  }

  async function loadQuotes() {
    const { data, error } = await supabase
      .from('quotes')
      .select('*, clients (*)')
      .order('created_at', { ascending: false });
    if (!error) setQuotes(data);
  }

  /* ---------- numéro unique ---------- */
  function generateNewQuoteNumber() {
    const d = new Date();
    setCurrentQuoteId(
      `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${d.getTime().toString().slice(-4)}`
    );
  }

  /* ---------- recherche produit ---------- */
  function handleProductSearch(val) {
    setProductSearch(val);
    if (val.length < 2) { setShowSuggestions(false); return; }
    const res = products.filter(p =>
      p.product_id.toLowerCase().includes(val.toLowerCase()) ||
      p.description.toLowerCase().includes(val.toLowerCase())
    ).slice(0,10);
    setSearchSuggestions(res);
    setShowSuggestions(true);
  }

  /* ---------- ajouter produit ---------- */
  function addProductToQuote(product, qty = null) {
    const q = qty || quantity;
    const idx = currentQuote.findIndex(i => i.product_id === product.product_id);
    if (idx !== -1) {
      const updated = [...currentQuote];
      updated[idx].quantity += q;
      setCurrentQuote(updated);
    } else {
      setCurrentQuote([
        ...currentQuote,
        { ...product, quantity: q, note: '' }
      ]);
    }
    setProductSearch('');
    setQuantity(1);
    setShowSuggestions(false);
  }

  function removeProductFromQuote(i) {
    setCurrentQuote(currentQuote.filter((_,idx)=> idx!==i));
  }

  /* ---------- totaux ---------- */
  function calculateTotals() {
    const sub = currentQuote.reduce((s,it)=> s + it.quantity*it.selling_price, 0);
    const cost= currentQuote.reduce((s,it)=> s + it.quantity*it.cost_price,    0);
    const gst = sub * 0.05;
    const pst = sub * 0.09975;
    return { subtotal: sub, totalCost: cost, gst, pst, total: sub+gst+pst };
  }

  /* ---------- sauvegarder soumission ---------- */
  async function saveQuote() {
    if (!selectedClient) return alert('Sélectionnez un client');
    if (!currentQuote.length) return alert('Aucun produit');

    const t = calculateTotals();
    const { error: qErr } = await supabase
      .from('quotes')
      .upsert({
        id: currentQuoteId,
        client_id: selectedClient.id,
        quote_date: new Date().toISOString().slice(0,10),
        subtotal: t.subtotal,
        total_cost: t.totalCost,
        gst: t.gst, pst: t.pst, total: t.total,
        status: 'draft'
      });
    if (qErr) return alert(qErr.message);

    await supabase.from('quote_items')
      .delete()
      .eq('quote_id', currentQuoteId);

    const items = currentQuote.map(it => ({
      quote_id: currentQuoteId,
      product_id: it.product_id,
      description: it.description,
      quantity: it.quantity,
      selling_price: it.selling_price,
      cost_price: it.cost_price,
      note: it.note || ''
    }));
    const { error: iErr } = await supabase.from('quote_items').insert(items);
    if (iErr) return alert(iErr.message);

    alert('Soumission sauvegardée !');
    loadQuotes();
  }

  /* ---------- import CSV ---------- */
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    const form = new FormData();
    form.append('file', file);
    const res  = await fetch('/api/import-inventory', { method:'POST', body:form });
    const json = await res.json();
    setImporting(false);
    if (res.ok) { alert(`${json.rows} produits mis à jour 👍`); loadProducts(); }
    else alert('Erreur : ' + json.error);
  }

  const totals = calculateTotals();

  /* ---------- Rendu ---------- */
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* --- En‑tête --- */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-3xl font-bold flex items-center">
              <Calculator className="w-8 h-8 mr-3 text-blue-600"/>
              Gestion des Soumissions
            </h1>
            <div className="flex gap-3">
              <button
                onClick={() => setShowQuoteHistoryModal(true)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center"
              >
                <FileText className="w-5 h-5 mr-2"/> Historique
              </button>
              <button
                onClick={saveQuote}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
              >
                <Save className="w-5 h-5 mr-2"/> Sauvegarder
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center disabled:opacity-50"
              >
                {importing ? 'Import…' : <><Upload className="w-4 h-4 mr-2"/>Importer CSV</>}
              </button>
              <button
                onClick={()=>{ setEditClient(null); setShowClientModal(true); }}
                className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center"
              >
                <Plus className="w-4 h-4 mr-1"/> Client
              </button>
              <input ref={fileInputRef} type="file" accept=".csv" hidden onChange={handleImport}/>
            </div>
          </div>

          {/* --- info soumission --- */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium">N° Soumission</label>
              <input value={currentQuoteId} readOnly className="w-full bg-gray-100 border px-3 py-2 rounded"/>
            </div>
            <div>
              <label className="block text-sm font-medium">Date</label>
              <input value={new Date().toLocaleDateString('fr-CA')} readOnly className="w-full bg-gray-100 border px-3 py-2 rounded"/>
            </div>
            <div>
              <label className="block text-sm font-medium">Client</label>
              <select
                value={selectedClient?.id || ''}
                onChange={e=>setSelectedClient(clients.find(c=>c.id==e.target.value))}
                className="w-full border px-3 py-2 rounded"
              >
                <option value="">-- Sélectionner --</option>
                {clients.map(c=>(
                  <option key={c.id} value={c.id}>{c.company ? `${c.name} (${c.company})` : c.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* --- Recherche produits --- */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Ajouter des produits</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2 relative">
              <label className="block text-sm font-medium">Recherche</label>
              <input
                value={productSearch}
                onChange={e=>handleProductSearch(e.target.value)}
                placeholder="Nom ou # produit…"
                className="w-full border px-3 py-2 rounded"
              />
              {showSuggestions && (
                <div className="absolute z-10 w-full bg-white border rounded mt-1 max-h-60 overflow-y-auto">
                  {searchSuggestions.map(p=>(
                    <div
                      key={p.product_id}
                      onClick={()=>addProductToQuote(p)}
                      className="p-3 hover:bg-gray-100 cursor-pointer border-b"
                    >
                      <div className="font-medium">{p.product_id}</div>
                      <div className="text-sm text-gray-600">{p.description}</div>
                      <div className="text-sm text-blue-600 font-medium">${p.selling_price.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium">Quantité</label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={e=>setQuantity(parseInt(e.target.value)||1)}
                className="w-full border px-3 py-2 rounded text-center"
              />
            </div>
          </div>
        </div>

        {/* --- Tableau produits --- */}
        <div className="bg-white rounded-lg shadow-md overflow-x-auto mb-6">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Produit #','Description','Note','Qté','Prix unit.','Sous‑total',''].map(h=>(
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {currentQuote.map((it,idx)=>(
                <tr key={idx} className="divide-x">
                  <td className="px-6 py-4">{it.product_id}</td>
                  <td className="px-6 py-4">{it.description}</td>
                  <td className="px-6 py-4">
                    <input
                      value={it.note}
                      onChange={e=>{
                        const u=[...currentQuote]; u[idx].note=e.target.value; setCurrentQuote(u);
                      }}
                      className="border px-2 py-1 rounded w-full text-sm"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <input
                      type="number"
                      value={it.quantity}
                      onChange={e=>{
                        const u=[...currentQuote]; u[idx].quantity=parseInt(e.target.value)||1; setCurrentQuote(u);
                      }}
                      className="border px-2 py-1 rounded w-20 text-center text-sm"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <input
                      type="number"
                      value={it.selling_price}
                      onChange={e=>{
                        const u=[...currentQuote]; u[idx].selling_price=parseFloat(e.target.value)||0; setCurrentQuote(u);
                      }}
                      step="0.01" className="border px-2 py-1 rounded w-24 text-right text-sm"
                    />
                  </td>
                  <td className="px-6 py-4 font-medium">
                    ${(it.quantity*it.selling_price).toFixed(2)}
                  </td>
                  <td className="px-6 py-4">
                    <button onClick={()=>removeProductFromQuote(idx)} className="text-red-600">
                      <Trash2 className="w-5 h-5"/>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {currentQuote.length===0 && (
            <div className="text-center py-12">
              <Package className="mx-auto w-12 h-12 text-gray-400"/>
              <p className="mt-2 text-gray-600">Aucun produit ajouté</p>
            </div>
          )}
        </div>

        {/* --- Résumé --- */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">Résumé</h3>
          <div className="space-y-2">
            <div className="flex justify-between"><span>Coût total :</span><span className="text-red-600">${totals.totalCost.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Sous‑total :</span><span>${totals.subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>TPS 5 % :</span><span>${totals.gst.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>TVQ 9.975 % :</span><span>${totals.pst.toFixed(2)}</span></div>
            <div className="flex justify-between border-t pt-2 text-lg font-bold"><span>TOTAL :</span><span className="text-green-600">${totals.total.toFixed(2)}</span></div>
          </div>
        </div>
      </div>

      {/* ---- Modal client ---- */}
      <ClientModal
        open={showClientModal}
        onClose={()=>setShowClientModal(false)}
        onSaved={loadClients}
        client={editClient}
      />
    </div>
  );
}
