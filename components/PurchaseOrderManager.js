'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, Save } from 'lucide-react';

/**
 * PurchaseOrderManager
 * -----------------------------------------------------
 * - Gestion simplifiée d'un Bon d'achat (ajout de lignes + sauvegarde)
 * - Affiche en bas l'historique des soumissions existantes avec lien PDF
 */
export default function PurchaseOrderManager() {
  /* -------------------- ÉTATS PRINCIPAUX -------------------- */
  const [products, setProducts] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [orderItems, setOrderItems] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(false);

  /* -------------------- CHARGER PRODUITS -------------------- */
  useEffect(() => {
    supabase.from('products').select('*').then(({ data }) => setProducts(data || []));
  }, []);

  /* -------------------- CHARGER HISTORIQUE SOUMISSIONS -------------------- */
  useEffect(() => {
    async function loadQuotes() {
      const { data } = await supabase
        .from('quotes')
        .select('id, created_at, total, client:clients(name)')
        .order('created_at', { ascending: false });
      setQuotes(data || []);
    }
    loadQuotes();
  }, []);

  /* -------------------- AJOUTER UN PRODUIT -------------------- */
  function addItem(product) {
    setOrderItems((prev) => [
      ...prev,
      { ...product, qty: 1, total: product.selling_price }
    ]);
    setProductSearch('');
  }

  /* -------------------- SAUVEGARDER LE BON D'ACHAT -------------------- */
  async function saveOrder() {
    if (!orderItems.length) return alert('Aucun article.');
    setLoading(true);

    const total = orderItems.reduce((sum, i) => sum + i.total, 0);
    const { error } = await supabase.from('purchase_orders').insert({
      total,
      items: orderItems
    });

    setLoading(false);
    if (error) alert(error.message);
    else {
      alert('Bon d’achat sauvegardé');
      setOrderItems([]);
    }
  }

  /* -------------------- RENDER -------------------- */
  const filtered = productSearch
    ? products.filter((p) =>
        p.description.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.product_id.toLowerCase().includes(productSearch.toLowerCase())
      )
    : [];

  return (
    <div className="space-y-8">
      {/* ---------- EN-TÊTE ---------- */}
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold">Nouveau Bon d’achat</h1>
        <button
          onClick={saveOrder}
          disabled={loading}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {loading ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>
      </div>

      {/* ---------- RECHERCHE PRODUIT ---------- */}
      <div>
        <input
          type="text"
          placeholder="Recherche produit…"
          value={productSearch}
          onChange={(e) => setProductSearch(e.target.value)}
          className="w-full p-2 border rounded"
        />

        {filtered.length > 0 && (
          <ul className="border rounded mt-1 max-h-40 overflow-auto">
            {filtered.slice(0, 10).map((p) => (
              <li
                key={p.id}
                onClick={() => addItem(p)}
                className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
              >
                {p.product_id} — {p.description}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---------- TABLEAU DES ARTICLES ---------- */}
      <table className="w-full text-sm border">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-2 py-1">Code</th>
            <th className="px-2 py-1">Description</th>
            <th className="px-2 py-1 w-20">Qté</th>
            <th className="px-2 py-1 w-24">Prix ($)</th>
            <th className="px-2 py-1 w-24">Total ($)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {orderItems.map((item, idx) => (
            <tr key={idx} className="border-t">
              <td className="px-2 py-1">{item.product_id}</td>
              <td className="px-2 py-1">{item.description}</td>
              <td className="px-2 py-1 text-center">{item.qty}</td>
              <td className="px-2 py-1 text-right">{item.selling_price.toFixed(2)}</td>
              <td className="px-2 py-1 text-right">{item.total.toFixed(2)}</td>
              <td className="px-2 py-1 text-right">
                <button
                  onClick={() =>
                    setOrderItems(orderItems.filter((_, i) => i !== idx))
                  }
                  className="text-red-600 hover:text-red-800"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
          {orderItems.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-center text-gray-500">
                Aucun article.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* ---------- HISTORIQUE DES SOUMISSIONS ---------- */}
      <h2 className="text-xl font-bold mt-10 mb-3">
        Soumissions enregistrées
      </h2>

      <table className="w-full text-sm border">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-2 py-1 text-left">Date</th>
            <th className="px-2 py-1 text-left">Client</th>
            <th className="px-2 py-1 text-right">Total ($)</th>
            <th className="px-2 py-1"></th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((q) => (
            <tr key={q.id} className="border-t hover:bg-gray-50">
              <td className="px-2 py-1">
                {new Date(q.created_at).toLocaleDateString()}
              </td>
              <td className="px-2 py-1">{q.client?.name}</td>
              <td className="px-2 py-1 text-right">{q.total.toFixed(2)}</td>
              <td className="px-2 py-1 text-right">
                <a
                  href={`/api/quote-pdf?id=${q.id}`}
                  className="text-blue-600 hover:underline"
                  target="_blank"
                >
                  📄 PDF
                </a>
              </td>
            </tr>
          ))}

          {quotes.length === 0 && (
            <tr>
              <td colSpan={4} className="px-2 py-4 text-center text-gray-500">
                Aucune soumission trouvée.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
