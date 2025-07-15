'use client';
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import ClientModal from './ClientModal';
import {
  Plus, FileText, Save, Calculator, Package,
  Upload, Trash2, ChevronDown, ChevronUp
} from 'lucide-react';

export default function SoumissionsManager({ user }) {
  /* ---------- états principaux ---------- */
  const [products, setProducts] = useState([]);
  const [clients,  setClients]  = useState([]);
  const [quotes,   setQuotes]   = useState([]);

  /* ---------- soumission courante ---------- */
  const [currentQuote, setCurrentQuote] = useState([]);
  const [currentQuoteId, setCurrentQuoteId] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);

  /* ---------- recherche produit ---------- */
  const [productSearch, setProductSearch] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug]   = useState(false);
  const [selIdx,  setSelIdx]    = useState(0);     // index sélectionné (↑/↓)

  /* ---------- autres UI ---------- */
  const [showClientModal, setShowClientModal] = useState(false);
  const [editClient,      setEditClient]      = useState(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  /* ---------- chargement initial ---------- */
  useEffect(() => {
    if (!user) return;
    (async()=>{
      const { data: p } = await supabase.from('products').select('*');
      const { data: c } = await supabase.from('clients').select('*');
      setProducts(p||[]); setClients(c||[]);
    })();
    generateNewQuoteNumber();
  }, [user]);

  function generateNewQuoteNumber() {
    const d = new Date();
    setCurrentQuoteId(
      `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${d.getTime().toString().slice(-4)}`
    );
  }

  /* ---------- recherche ---------- */
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
    const exact = products.find(p =>
      p.product_id.toLowerCase() === productSearch.toLowerCase()
    );
    const item  = exact || suggestions[selIdx];
    if (!item) return alert('Produit non trouvé');
    addProduct(item, quantity);
  }

  /* ---------- ajouter / retirer produit ---------- */
  function addProduct(prod, qty=1) {
    const idx = currentQuote.findIndex(i=>i.product_id===prod.product_id);
    if (idx !== -1) {
      const u=[...currentQuote]; u[idx].quantity += qty; setCurrentQuote(u);
    } else {
      setCurrentQuote([...currentQuote,{...prod,quantity:qty,note:''}]);
    }
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
    if(r.ok){ alert(`${j.rows} produits mis à jour 👍`); location.reload(); }
    else alert(j.error);
  }

  /* ---------- rendu ---------- */
  return (
  <div className="min-h-screen bg-gray-50">
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* En‑tête */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold flex items-center">
            <Calculator className="w-8 h-8 mr-3 text-blue-600"/> Gestion des Soumissions
          </h1>
          <div className="flex gap-3">
            <button onClick={()=>fileInputRef.current?.click()}
              disabled={importing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center disabled:opacity-50">
              {importing ? 'Import…' : <><Upload className="w-4 h-4 mr-2"/>Importer CSV</>}
            </button>
            <button onClick={()=>{setEditClient(null);setShowClientModal(true);}}
              className="px-3 py-2 bg-purple-600 text-white rounded-lg flex items-center">
              <Plus className="w-4 h-4 mr-1"/> Client
            </button>
            <input ref={fileInputRef} hidden type="file" accept=".csv" onChange={handleImport}/>
          </div>
        </div>

        {/* infos soumission */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><label className="block text-sm">N°</label>
            <input value={currentQuoteId} readOnly className="w-full bg-gray-100 border px-3 py-2 rounded"/>
          </div>
          <div><label className="block text-sm">Date</label>
            <input value={new Date().toLocaleDateString('fr-CA')} readOnly className="w-full bg-gray-100 border px-3 py-2 rounded"/>
          </div>
          <div><label className="block text-sm">Client</label>
            <select value={selectedClient?.id||''} onChange={e=>{
              setSelectedClient(clients.find(c=>String(c.id)===e.target.value));
            }} className="w-full border px-3 py-2 rounded">
              <option value="">-- Sélectionner --</option>
              {clients.map(c=>(
                <option key={c.id} value={c.id}>
                  {c.company?`${c.name} (${c.company})`:c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Recherche + bouton Ajouter */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Ajouter des produits</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* champ recherche */}
          <div className="md:col-span-2 relative">
            <label className="block text-sm">Recherche</label>
            <input value={productSearch}
              onChange={e=>updateSearch(e.target.value)}
              onKeyDown={e=>{
                if(e.key==='ArrowDown'){e.preventDefault();setSelIdx(i=>Math.min(i+1,suggestions.length-1));}
                if(e.key==='ArrowUp'){e.preventDefault();setSelIdx(i=>Math.max(i-1,0));}
                if(e.key==='Enter'){e.preventDefault();addFromInput();}
              }}
              placeholder="Nom ou # produit…"
              className="w-full border px-3 py-2 rounded"
            />
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
          {/* quantité */}
          <div>
            <label className="block text-sm">Qté</label>
            <input type="number" min="1"
              value={quantity} onChange={e=>setQuantity(parseInt(e.target.value)||1)}
              className="w-full border px-3 py-2 rounded text-center"/>
          </div>
          {/* bouton ajouter */}
          <div className="flex items-end">
            <button onClick={addFromInput}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg flex justify-center items-center">
              <Plus className="w-4 h-4 mr-1"/> Ajouter
            </button>
          </div>
        </div>
      </div>

      {/* Tableau produits */}
      <div className="bg-white rounded-lg shadow-md overflow-x-auto mb-6">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50"><tr>
            {['Produit #','Description','Note','Qté','Prix unit.','Sous-total',''].map(h=>(
              <th key={h} className="px-6 py-3 text-left text-xs text-gray-500 uppercase">{h}</th>
            ))}
          </tr></thead>
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
                <td className="px-6 py-4"><button onClick={()=>removeProduct(idx)} className="text-red-600">
                  <Trash2 className="w-5 h-5"/></button></td>
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

      {/* Résumé */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Résumé</h3>
        <div className="space-y-2">
          <div className="flex justify-between"><span>Coût total :</span><span className="text-red-600">${totals.totalCost.toFixed(2)}</span></div>
          <div className="flex justify-between"><span>Sous-total :</span><span>${totals.subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between"><span>TPS 5 % :</span><span>${totals.gst.toFixed(2)}</span></div>
          <div className="flex justify-between"><span>TVQ 9.975 % :</span><span>${totals.pst.toFixed(2)}</span></div>
          <div className="flex justify-between border-t pt-2 text-lg font-bold">
            <span>TOTAL :</span><span className="text-green-600">${totals.total.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>

    {/* Modal client */}
    <ClientModal
      open={showClientModal}
      onClose={()=>setShowClientModal(false)}
      onSaved={()=>{loadClients();}}
      client={editClient}
    />
  </div>
  );
}
