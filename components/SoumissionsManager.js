// components/SoumissionsManager.js
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  Search, Plus, FileText, Trash2, Save, Calculator,
  Upload, Package
} from 'lucide-react';

export default function SoumissionsManager({ user }) {
  /* ----------------- États et hooks ----------------- */
  const [products, setProducts]     = useState([]);
  const [clients, setClients]       = useState([]);
  const [quotes, setQuotes]         = useState([]);
  const [currentQuote, setCurrentQuote] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [currentQuoteId, setCurrentQuoteId] = useState('');

  const [productSearch, setProductSearch] = useState('');
  const [quantity, setQuantity]   = useState(1);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions]     = useState(false);

  const [loading, setLoading]     = useState(false);
  const [importing, setImporting] = useState(false);

  const fileInputRef = useRef(null);

  /* ------------ Chargement initial ------------- */
  useEffect(() => {
    if (user) {
      loadProducts();
      loadClients();
      loadQuotes();
      generateNewQuoteNumber();
    }
  }, [user]);

  const loadProducts = async () => {
    const { data } = await supabase.from('products').select('*').order('product_id');
    setProducts(data || []);
  };

  const loadClients = async () => {
    const { data } = await supabase.from('clients').select('*').order('name');
    setClients(data || []);
  };

  const loadQuotes = async () => {
    const { data } = await supabase
      .from('quotes')
      .select('*, client:clients(name)')
      .order('created_at', { ascending: false });
    setQuotes(data || []);
  };

  const generateNewQuoteNumber = () => {
    const d = new Date();
    const id = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
      d.getDate()
    ).padStart(2, '0')}-${d.getTime().toString().slice(-4)}`;
    setCurrentQuoteId(id);
  };

  /* ------------- Recherche / ajout produits ------------- */
  const handleProductSearch = (term) => {
    setProductSearch(term);
    if (term.length >= 2) {
      const res = products
        .filter(
          (p) =>
            p.product_id.toLowerCase().includes(term.toLowerCase()) ||
            p.description.toLowerCase().includes(term.toLowerCase())
        )
        .slice(0, 10);
      setSearchSuggestions(res);
      setShowSuggestions(true);
    } else setShowSuggestions(false);
  };

  const addProductToQuote = (product, qty = quantity) => {
    setCurrentQuote((prev) => {
      const idx = prev.findIndex((i) => i.product_id === product.product_id);
      if (idx !== -1) {
        const clone = [...prev];
        clone[idx].quantity += qty;
        return clone;
      }
      return [
        ...prev,
        {
          product_id: product.product_id,
          description: product.description,
          quantity: qty,
          selling_price: product.selling_price,
          note: ''
        }
      ];
    });
    setProductSearch('');
    setQuantity(1);
    setShowSuggestions(false);
  };

  const removeProductFromQuote = (i) =>
    setCurrentQuote((prev) => prev.filter((_, idx) => idx !== i));

  /* ---------------- Totaux ---------------- */
  const totals = (() => {
    const subtotal = currentQuote.reduce((s, i) => s + i.quantity * i.selling_price, 0);
    const gst = subtotal * 0.05;
    const pst = subtotal * 0.09975;
    return { subtotal, gst, pst, total: subtotal + gst + pst };
  })();

  /* --------------- Import CSV --------------- */
  async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);

    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/import-inventory', { method: 'POST', body: form });
    const json = await res.json();

    setImporting(false);
    if (res.ok) {
      alert(`${json.rows} produits mis à jour 👍`);
      loadProducts();
    } else alert('Erreur : ' + (json.error?.message || 'inconnue'));
  }

  /* ------------------ RENDER ------------------ */
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* --- En‑tête --- */}
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold flex items-center text-gray-900">
                <Calculator className="w-8 h-8 mr-3 text-blue-600" />
                Gestion des Soumissions
              </h1>
              <p className="text-gray-600 mt-1">
                Créer et gérer vos soumissions professionnelles
              </p>
            </div>

            <div className="flex space-x-3">
              {/* Historique (à implémenter) */}
              <button
                className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                onClick={() => alert('Historique à venir')}
              >
                <FileText className="w-5 h-5 mr-2" />
                Historique
              </button>

              {/* Sauvegarder */}
              <button
                onClick={() => alert('Sauvegarde à implémenter')}
                disabled={loading}
                className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                <Save className="w-5 h-5 mr-2" />
                {loading ? 'Sauvegarde…' : 'Sauvegarder'}
              </button>

              {/* -------- input caché -------- */}
              <input
                type="file"
                accept=".csv"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleImport}
              />

              {/* Bouton Importer CSV */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {importing ? '⏳ Import…' : <><Upload className="w-4 h-4" />Importer CSV</>}
              </button>
            </div>
          </div>

          {/* --- Infos soumission (N°, date, client) --- */}
          {/* ... (garde ton bloc existant ou simplifie) ... */}
        </div>

        {/* --- Recherche + ajout produits --- */}
        {/* ... ton code existant pour la recherche ... */}

        {/* --- Tableau des produits sélectionnés --- */}
        {/* ... ton code existant pour currentQuote ... */}

        {/* --- Résumé totaux --- */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Résumé</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span>Sous-total :</span>
              <span>{totals.subtotal.toFixed(2)} $</span>
            </div>
            <div className="flex justify-between">
              <span>TPS (5 %) :</span>
              <span>{totals.gst.toFixed(2)} $</span>
            </div>
            <div className="flex justify-between">
              <span>TVQ (9.975 %) :</span>
              <span>{totals.pst.toFixed(2)} $</span>
            </div>
            <div className="border-t pt-2 flex justify-between font-bold">
              <span>TOTAL :</span>
              <span className="text-green-600">{totals.total.toFixed(2)} $</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
