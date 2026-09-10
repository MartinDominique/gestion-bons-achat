/**
 * @file components/associations/ProductAssociationsPanel.js
 * @description Panneau partagé des « items associés » d'un produit (sens unique parent → enfant).
 *              Utilisé par la fenêtre « As » (BT/BL/Soumission/AF) et par l'onglet « Associés »
 *              de la fiche Inventaire.
 *              - Liste des associés enrichie (code, description, En main, prix vendant)
 *              - Mode sélection (selectable): case à cocher DÉCOCHÉE par défaut, quantité
 *                = quantité par défaut × quantité du parent, modifiable (auto-select, 44 px),
 *                bouton « Ajouter (n) » → onAddItems([{ product, quantity, link }])
 *              - Mode gestion (manage): « Associer un produit » (recherche tolérante via
 *                /api/products/search, quantité par défaut, note) + suppression avec
 *                confirmation. Met à jour le compteur du carré « As » (associationsCache).
 *              - showParents: section « Suggéré par » (les produits qui suggèrent celui-ci)
 * @version 1.0.0
 * @date 2026-09-10
 * @changelog
 *   1.0.0 - Version initiale (Items associés MVP)
 */

'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link2, Loader2, Plus, Search, Trash2, X, AlertCircle, Check } from 'lucide-react';
import { normalizeCode, setCount, invalidateCount } from '../../lib/utils/associationsCache';

const formatCurrency = (amount) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(
    parseFloat(amount) || 0
  );

const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

/**
 * Props:
 *  - parentCode: code du produit parent (obligatoire)
 *  - parentDescription: description affichée (optionnel)
 *  - parentQuantity: quantité du parent dans le document (défaut 1) — multiplie la qté par défaut
 *  - selectable: affiche cases + quantités + bouton « Ajouter » (défaut false)
 *  - onAddItems(entries): callback en mode sélection; entries = [{ product, quantity, link }]
 *  - existingCodes: codes déjà présents dans le document (badge « déjà ajouté »)
 *  - manage: permet d'associer / retirer des produits (défaut true)
 *  - showParents: affiche la section « Suggéré par » (défaut false)
 *  - onChanged(): appelé après création/suppression d'un lien
 */
export default function ProductAssociationsPanel({
  parentCode,
  parentDescription = '',
  parentQuantity = 1,
  selectable = false,
  onAddItems,
  existingCodes = [],
  manage = true,
  showParents = false,
  onChanged,
}) {
  const code = normalizeCode(parentCode);
  const parentQty = parseFloat(parentQuantity) > 0 ? parseFloat(parentQuantity) : 1;

  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Sélection (mode selectable)
  const [checked, setChecked] = useState({});   // link.id -> bool
  const [quantities, setQuantities] = useState({}); // link.id -> string

  // Parents (« Suggéré par »)
  const [parents, setParents] = useState([]);
  const [parentsLoading, setParentsLoading] = useState(false);

  // Gestion: ajout d'un lien
  const [addOpen, setAddOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState(null);
  const [addQty, setAddQty] = useState('1');
  const [addNotes, setAddNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [feedback, setFeedback] = useState('');
  const searchInputRef = useRef(null);
  const searchTimer = useRef(null);

  const existingSet = useMemo(
    () => new Set((existingCodes || []).map(normalizeCode).filter(Boolean)),
    [existingCodes]
  );

  // ===== Chargement des associés =====
  const loadLinks = useCallback(async () => {
    if (!code) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/product-associations?parent=${encodeURIComponent(code)}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Erreur de chargement');
      const data = json.data || [];
      setLinks(data);
      setCount(code, data.length);
      // Quantités initiales = défaut × qté parent (cases décochées par défaut)
      const q = {};
      data.forEach((l) => { q[l.id] = String(round2((l.default_quantity || 1) * parentQty)); });
      setQuantities(q);
      setChecked({});
    } catch (err) {
      console.error('Erreur items associés:', err);
      setError(err.message || 'Impossible de charger les items associés.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const loadParents = useCallback(async () => {
    if (!code || !showParents) return;
    setParentsLoading(true);
    try {
      const res = await fetch(`/api/product-associations?child=${encodeURIComponent(code)}`);
      const json = await res.json();
      if (res.ok && json.success) setParents(json.data || []);
    } catch (err) {
      console.error('Erreur parents associés:', err);
    } finally {
      setParentsLoading(false);
    }
  }, [code, showParents]);

  useEffect(() => { loadLinks(); }, [loadLinks]);
  useEffect(() => { loadParents(); }, [loadParents]);

  // ===== Recherche produit (ajout d'un lien) =====
  useEffect(() => {
    if (!addOpen) return undefined;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const term = searchTerm.trim();
    if (term.length < 2) {
      setSearchResults([]);
      return undefined;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/products/search?search=${encodeURIComponent(term)}&limit=30`);
        const json = await res.json();
        const linked = new Set(links.map((l) => normalizeCode(l.child_code)));
        const rows = (json.data || []).filter((p) => {
          const c = normalizeCode(p.product_id);
          return c && c !== code && !linked.has(c);
        });
        setSearchResults(rows);
      } catch (err) {
        console.error('Erreur recherche produit:', err);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchTerm, addOpen, links, code]);

  const openAdd = () => {
    setAddOpen(true);
    setChosen(null);
    setSearchTerm('');
    setSearchResults([]);
    setAddQty('1');
    setAddNotes('');
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const cancelAdd = () => {
    setAddOpen(false);
    setChosen(null);
    setSearchTerm('');
    setSearchResults([]);
  };

  const saveLink = async () => {
    if (!chosen || saving) return;
    const q = parseFloat(addQty);
    if (!(q > 0)) {
      setError('La quantité par défaut doit être supérieure à 0.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/product-associations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent_code: code,
          child_code: chosen.product_id,
          default_quantity: q,
          notes: addNotes,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Erreur lors de l\'association');
      setFeedback(`${normalizeCode(chosen.product_id)} associé à ${code}`);
      setTimeout(() => setFeedback(''), 2500);
      cancelAdd();
      await loadLinks();
      invalidateCount(code);
      onChanged?.();
    } catch (err) {
      console.error('Erreur création lien:', err);
      setError(err.message || 'Impossible de créer le lien.');
    } finally {
      setSaving(false);
    }
  };

  const removeLink = async (link) => {
    if (deletingId) return;
    const label = link.product?.description
      ? `${link.child_code} — ${link.product.description}`
      : link.child_code;
    if (!window.confirm(`Retirer « ${label} » des items associés de ${code} ?\n\nLes produits eux-mêmes ne sont pas touchés.`)) {
      return;
    }
    setDeletingId(link.id);
    setError('');
    try {
      const res = await fetch(`/api/product-associations/${link.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Erreur lors du retrait');
      await loadLinks();
      invalidateCount(code);
      onChanged?.();
    } catch (err) {
      console.error('Erreur suppression lien:', err);
      setError(err.message || 'Impossible de retirer le lien.');
    } finally {
      setDeletingId(null);
    }
  };

  // ===== Sélection =====
  const selectedCount = links.filter((l) => checked[l.id]).length;

  const toggle = (id) => setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  const confirmAdd = () => {
    if (!onAddItems) return;
    const entries = [];
    for (const l of links) {
      if (!checked[l.id]) continue;
      if (!l.product) continue;
      const q = parseFloat(quantities[l.id]);
      if (!(q > 0)) continue;
      entries.push({ product: l.product, quantity: q, link: l });
    }
    if (entries.length === 0) return;
    onAddItems(entries);
  };

  if (!code) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Aucun code produit — impossible d'afficher les items associés.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* En-tête parent */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Produit</p>
          <p className="font-mono font-semibold text-gray-900 dark:text-gray-100">{code}</p>
          {parentDescription && (
            <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{parentDescription}</p>
          )}
        </div>
        {selectable && (
          <div className="text-right text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
            Qté du parent<br />
            <span className="text-base font-bold text-gray-900 dark:text-gray-100">{parentQty}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {feedback && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm">
          <Check size={16} />
          <span>{feedback}</span>
        </div>
      )}

      {/* Liste des associés */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-1">
            <Link2 size={16} className="text-purple-600 dark:text-purple-400" />
            Items associés {links.length > 0 && <span className="text-gray-500 dark:text-gray-400">({links.length})</span>}
          </h4>
          {selectable && links.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const all = {};
                const allChecked = links.every((l) => checked[l.id]);
                links.forEach((l) => { all[l.id] = !allChecked; });
                setChecked(all);
              }}
              className="text-xs text-purple-700 dark:text-purple-300 underline px-2"
              style={{ minHeight: '44px' }}
            >
              {links.every((l) => checked[l.id]) ? 'Tout décocher' : 'Tout cocher'}
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-6 justify-center text-gray-500 dark:text-gray-400 text-sm">
            <Loader2 className="animate-spin" size={18} /> Chargement...
          </div>
        ) : links.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-3">
            Aucun item associé pour ce produit.
            {manage && ' Utilisez « Associer un produit » ci-dessous.'}
          </p>
        ) : (
          <ul className="divide-y dark:divide-gray-700 border dark:border-gray-700 rounded-lg overflow-hidden">
            {links.map((l) => {
              const p = l.product;
              const childCode = normalizeCode(l.child_code);
              const already = existingSet.has(childCode);
              const isChecked = !!checked[l.id];
              return (
                <li
                  key={l.id}
                  className={`p-2 sm:p-3 flex items-center gap-2 ${
                    isChecked ? 'bg-purple-50 dark:bg-purple-900/20' : 'bg-white dark:bg-gray-900'
                  }`}
                >
                  {selectable && (
                    <label
                      className="flex items-center justify-center flex-shrink-0 cursor-pointer"
                      style={{ minWidth: '44px', minHeight: '44px' }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(l.id)}
                        disabled={!p}
                        className="w-5 h-5 accent-purple-600"
                        aria-label={`Ajouter ${childCode}`}
                      />
                    </label>
                  )}

                  <div
                    className={`flex-1 min-w-0 ${selectable && p ? 'cursor-pointer' : ''}`}
                    onClick={() => { if (selectable && p) toggle(l.id); }}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200 px-1.5 py-0.5 rounded">
                        {childCode}
                      </span>
                      {already && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                          déjà dans la liste
                        </span>
                      )}
                      {!p && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
                          produit introuvable
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-800 dark:text-gray-200 truncate">
                      {p?.description || '—'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-3">
                      <span>× {l.default_quantity} par unité</span>
                      {p?.is_inventory && (
                        <span className={p.stock_qty <= 0 ? 'text-red-600 dark:text-red-400 font-medium' : ''}>
                          📦 En main: {p.stock_qty} {p.unit || ''}
                        </span>
                      )}
                      {p && <span>{formatCurrency(p.selling_price)}</span>}
                      {l.notes && <span className="italic">📝 {l.notes}</span>}
                    </p>
                  </div>

                  {selectable && (
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      value={quantities[l.id] ?? ''}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const v = e.target.value;
                        setQuantities((prev) => ({ ...prev, [l.id]: v }));
                        if (!checked[l.id] && parseFloat(v) > 0) {
                          setChecked((prev) => ({ ...prev, [l.id]: true }));
                        }
                      }}
                      disabled={!p}
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      className="w-16 sm:w-20 text-center font-semibold rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-1"
                      style={{ minHeight: '44px' }}
                      aria-label={`Quantité ${childCode}`}
                    />
                  )}

                  {manage && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeLink(l); }}
                      disabled={deletingId === l.id}
                      title="Retirer ce lien"
                      aria-label="Retirer ce lien"
                      className="flex-shrink-0 inline-flex items-center justify-center rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                      style={{ minWidth: '44px', minHeight: '44px' }}
                    >
                      {deletingId === l.id ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {selectable && links.length > 0 && (
          <button
            type="button"
            onClick={confirmAdd}
            disabled={selectedCount === 0}
            className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ minHeight: '44px' }}
          >
            <Plus size={18} />
            {selectedCount === 0 ? 'Cochez les items à ajouter' : `Ajouter ${selectedCount} item${selectedCount > 1 ? 's' : ''}`}
          </button>
        )}
      </div>

      {/* Associer un produit */}
      {manage && (
        <div className="border-t dark:border-gray-700 pt-3">
          {!addOpen ? (
            <button
              type="button"
              onClick={openAdd}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 font-medium"
              style={{ minHeight: '44px' }}
            >
              <Link2 size={16} />
              Associer un produit à {code}
            </button>
          ) : (
            <div className="space-y-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h5 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  Nouveau produit associé à {code}
                </h5>
                <button
                  type="button"
                  onClick={cancelAdd}
                  className="inline-flex items-center justify-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  style={{ minWidth: '44px', minHeight: '44px' }}
                  aria-label="Annuler"
                >
                  <X size={18} />
                </button>
              </div>

              {!chosen ? (
                <>
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Code ou description (2 lettres min.)"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      className="w-full pl-9 pr-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                      style={{ minHeight: '44px' }}
                    />
                  </div>
                  {searching && (
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Loader2 className="animate-spin" size={12} /> Recherche...
                    </p>
                  )}
                  {searchResults.length > 0 && (
                    <ul className="max-h-56 overflow-y-auto divide-y dark:divide-gray-700 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900">
                      {searchResults.map((p) => (
                        <li key={`${p._source}-${p.product_id}`}>
                          <button
                            type="button"
                            onClick={() => setChosen(p)}
                            className="w-full text-left px-3 py-2 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                            style={{ minHeight: '44px' }}
                          >
                            <span className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-300 mr-2">
                              {p.product_id}
                            </span>
                            <span className="text-sm text-gray-800 dark:text-gray-200">{p.description}</span>
                            {p._source === 'products' && (
                              <span className="ml-2 text-xs text-gray-500">En main: {p.stock_qty ?? 0}</span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!searching && searchTerm.trim().length >= 2 && searchResults.length === 0 && (
                    <p className="text-xs text-gray-500">Aucun produit trouvé (ou déjà associé).</p>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 p-2 rounded bg-white dark:bg-gray-900 border dark:border-gray-700">
                    <div className="min-w-0">
                      <span className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-300 mr-2">
                        {chosen.product_id}
                      </span>
                      <span className="text-sm text-gray-800 dark:text-gray-200">{chosen.description}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setChosen(null)}
                      className="text-xs text-gray-500 underline flex-shrink-0 px-2"
                      style={{ minHeight: '44px' }}
                    >
                      Changer
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <label className="text-xs text-gray-600 dark:text-gray-400">
                      Qté par unité de {code}
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min="0"
                        value={addQty}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setAddQty(e.target.value)}
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 text-center font-semibold"
                        style={{ minHeight: '44px' }}
                      />
                    </label>
                    <label className="text-xs text-gray-600 dark:text-gray-400 sm:col-span-2">
                      Note (optionnel)
                      <input
                        type="text"
                        value={addNotes}
                        onChange={(e) => setAddNotes(e.target.value)}
                        placeholder="ex. si montage mural"
                        autoCorrect="on"
                        autoCapitalize="sentences"
                        spellCheck={true}
                        className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2"
                        style={{ minHeight: '44px' }}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={saveLink}
                    disabled={saving}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-60"
                    style={{ minHeight: '44px' }}
                  >
                    {saving ? <Loader2 className="animate-spin" size={16} /> : <Link2 size={16} />}
                    {saving ? 'Enregistrement...' : 'Enregistrer le lien'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Suggéré par (parents) */}
      {showParents && (
        <div className="border-t dark:border-gray-700 pt-3">
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
            Suggéré par {parents.length > 0 && <span className="text-gray-500 dark:text-gray-400">({parents.length})</span>}
          </h4>
          {parentsLoading ? (
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <Loader2 className="animate-spin" size={12} /> Chargement...
            </p>
          ) : parents.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Aucun produit ne suggère {code}.
            </p>
          ) : (
            <ul className="divide-y dark:divide-gray-700 border dark:border-gray-700 rounded-lg overflow-hidden">
              {parents.map((l) => (
                <li key={l.id} className="p-2 sm:p-3 bg-white dark:bg-gray-900 text-sm">
                  <span className="font-mono text-xs font-semibold bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 px-1.5 py-0.5 rounded mr-2">
                    {normalizeCode(l.parent_code)}
                  </span>
                  <span className="text-gray-800 dark:text-gray-200">{l.product?.description || '—'}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">× {l.default_quantity}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
