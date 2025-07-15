'use client';
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import ClientModal from './ClientModal';
import {
  Plus, FileText, Save, Calculator, Package,
  Upload, Trash2
} from 'lucide-react';

export default function SoumissionsManager({ user }) {
  /* ---------- états ---------- */
  const [products, setProducts] = useState([]);
  const [clients,  setClients]  = useState([]);
  const [currentQuote, setCurrentQuote] = useState([]);
  const [currentQuoteId, setCurrentQuoteId] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);

  /* recherche */
  const [productSearch, setProductSearch] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug] = useState(false);
  const [selIdx,  setSelIdx]  = useState(0);

  /* ui */
  const [showClientModal, setShowClientModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  /* ---------- chargement initial ---------- */
  useEffect(() => {
    if (!user) return;
    loadProducts(); loadClients(); generateNewQuoteNumber();
  }, [user]);

  async function loadProducts() {
    const { data } = await supabase.from('products').select('*');
    setProducts(data || []);
  }
  async function loadClients() {
    const { data } = await supabase.from('clients').select('*');
    setClients(data || []);
  }

  function generateNewQuoteNumber() {
    const d = new Date();
    setCurrentQuoteId(
      `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${d.getTime().toString().slice(-4)}`
    );
  }

  /* ---------- recherche produit ---------- */
  function updateSearch(val) {
    setProductSearch(val); setSelIdx(0);
    if (val.length < 2) { setShowSug(false); return; }
    const list = products.filter(p =>
      p.product_id.toLowerCase().includes(val.toLowerCase()) ||
      p.description.toLowerCase().includes(val.toLowerCase())
    ).slice(0,10);
    setSuggestions(list); setShowSug(true);
  }
  function addFromInput() {
    const item = suggestions[selIdx];
    if (!item) return alert('Produit non trouvé');
    addProduct(item, quantity);
  }

  /* ---------- ajouter / retirer produit ---------- */
  function addProduct(prod, qty=1){
    const idx=currentQuote.findIndex(i=>i.product_id===prod.product_id);
    if(idx>-1){ const u=[...currentQuote];u[idx].quantity+=qty;setCurrentQuote(u);}
    else {setCurrentQuote([...currentQuote,{...prod,quantity:qty,note:''}]);}
    setProductSearch(''); setQuantity(1); setShowSug(false);
  }
  function removeProduct(i){ setCurrentQuote(currentQuote.filter((_,x)=>x!==i)); }

  /* ---------- totaux ---------- */
  const totals = (()=>{
    const sub=currentQuote.reduce((s,i)=>s+i.quantity*i.selling_price,0);
    const cost=currentQuote.reduce((s,i)=>s+i.quantity*i.cost_price,0);
    const gst=sub*0.05, pst=sub*0.09975;
    return { subtotal:sub,totalCost:cost,gst,pst,total:sub+gst+pst };
  })();

  /* ---------- import CSV ---------- */
  async function handleImport(e){
    const f=e.target.files[0]; if(!f) return;
    setImporting(true);
    const fd=new FormData(); fd.append('file',f);
    const r=await fetch('/api/import-inventory',{method:'POST',body:fd});
    const j=await r.json(); setImporting(false);
    if(r.ok){ alert(`${j.rows} produits mis à jour 👍`); loadProducts(); }
    else alert(j.error);
  }

  /* ---------- rendu ---------- */
  return (
  <div className="min-h-screen bg-gray-50">
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* En‑tête : numéro, date, client */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h1 className="text-2xl font-bold flex items-center mb-4">
          <Calculator className="w-7 h-7 mr-2 text-blue-600"/> Gestion des Soumissions
        </h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><label className="text-sm">N°</label>
            <input value={currentQuoteId} readOnly className="w-full bg-gray-100 border px-3 py-2 rounded"/>
          </div>
          <div><label className="text-sm">Date</label>
            <input value={new Date().toLocaleDateString('fr-CA')} readOnly className="w-full bg-gray-100 border px-3 py-2 rounded"/>
          </div>
          <div><label className="text-sm">Client</label>
            <select value={selectedClient?.id||''}
              onChange={e=>setSelectedClient(clients.find(c=>String(c.id)===e.target.value))}
              className="w-full border px-3 py-2 rounded">
              <option value="">-- Sélectionner --</option>
              {clients.map(c=>(
                <option key={c.id} value={c.id}>
                  {c.company?`${c.name} (${c.company})`:c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={()=>fileInputRef.current?.click()}
            disabled={importing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">
            {importing?'Import…':'Importer CSV'}
          </button>
          <button onClick={()=>setShowClientModal(true)}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg">
            Nouveau client
          </button>
          <input hidden ref={fileInputRef} type="file" accept=".csv" onChange={handleImport}/>
        </div>
      </div>

      {/* Recherche produits */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Ajouter des produits</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2 relative">
            <label className="text-sm">Recherche</label>
            <input value={productSearch}
              onChange={e=>updateSearch(e.target.value)}
              onKeyDown={e=>{
                if(e.key==='ArrowDown'){e.preventDefault();setSelIdx(i=>Math.min(i+1,suggestions.length-1));}
                if(e.key==='ArrowUp'){e.preventDefault();setSelIdx(i=>Math.max(i-1,0));}
                if(e.key==='Enter'){e.preventDefault();addFromInput();}
              }}
              className="w-full border px-3 py-2 rounded"/>
            {showSug && (
              <div className="absolute z-10 w-full bg-white border rounded mt-1 max-h-60 overflow-y-auto">
                {suggestions.map((p,i)=>(
                  <div key={p.product_id}
                    onClick={()=>addProduct(p,quantity)}
                    className={`p-3 cursor-pointer border-b ${i===selIdx?'bg-blue-50':'hover:bg-gray-100'}`}>
                    <div className="font-medium flex justify-between">
                      <span>{p.product_id}</span>
                      <span className="text-blue-600">${p.selling_price.toFixed(2)}</span>
                    </div>
                    <div className="text-sm text-gray-600">{p.description}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-sm">Qté</label>
            <input type="number" min="1" value={quantity}
              onChange={e=>setQuantity(parseInt(e.target.value)||1)}
              className="w-full border px-3 py-2 rounded text-center"/>
          </div>
          <div className="flex items-end">
            <button onClick={addFromInput}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg">
              <Plus className="w-4 h-4 inline mr-1"/> Ajouter
            </button>
          </div>
        </div>
      </div>

      {/* Tableau produits */}
      <div className="bg-white rounded-lg shadow-md overflow-x-auto mb-6">
        <table className="min-w-full divide-y">
          <thead className="bg-gray-50">
            <tr>{['#','Description','Note','Qté','PU','Sous-total',''].map(h=>
              <th key={h} className="px-6 py-3 text-left text-xs text-gray-500 uppercase">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {currentQuote.map((it,idx)=>(
              <tr key={idx} className="divide-x">
                <td className="px-6 py-4">{it.product_id}</td>
                <td className="px-6 py-4">{it.description}</td>
                <td className="px-6 py-4"><input value={it.note}
                  onChange={e=>{const u=[...currentQuote];u[idx].note=e.target.value;setCurrentQuote(u);}}
                  className="border px-2 py-1 rounded w-full text-sm"/></td>
                <td className="px-6 py-4"><input type="number" value={it.quantity}
                  onChange={e=>{const u=[...currentQuote];u[idx].quantity=parseInt(e.target.value)||1;setCurrentQuote(u);}}
                  className="border px-2 py-1 rounded w-20 text-center text-sm"/></td>
                <td className="px-6 py-4"><input type="number" value={it.selling_price}
                  onChange={e=>{const u=[...currentQuote];u[idx].selling_price=parseFloat(e.target.value)||0;setCurrentQuote(u);}}
                  step="0.01" className="border px-2 py-1 rounded w-24 text-right text-sm"/></td>
                <td className="px-6 py-4 font-medium">${(it.quantity*it.selling_price).toFixed(2)}</td>
                <td className="px-6 py-4">
                  <button onClick={()=>removeProduct(idx)} className="text-red-600"><Trash2 className="w-5 h-5"/></button>
                </td>
              </tr>
            ))}
            {currentQuote.length===0 && (
              <tr><td colSpan={7} className="text-center py-8 text-gray-500">
                <Package className="mx-auto w-10 h-10 mb-2"/> Aucun produit</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Résumé */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Résumé</h3>
        {[
          ['Coût total', totals.totalCost.toFixed(2), 'text-red-600'],
          ['Sous-total', totals.subtotal.toFixed(2)],
          ['TPS 5 %',     totals.gst.toFixed(2)],
          ['TVQ 9.975 %', totals.pst.toFixed(2)],
        ].map(([lbl,val,color])=>(
          <div key={lbl} className="flex justify-between mb-1">
            <span>{lbl} :</span><span className={color}>{'$'+val}</span>
          </div>
        ))}
        <div className="flex justify-between border-t pt-2 text-lg font-bold">
          <span>TOTAL :</span><span className="text-green-600">${totals.total.toFixed(2)}</span>
        </div>
      </div>
    </div>

    {/* Modal client */}
    <ClientModal
      open={showClientModal}
      onClose={()=>setShowClientModal(false)}
      onSaved={loadClients}
      client={null}
    />
  </div>
  );
}
