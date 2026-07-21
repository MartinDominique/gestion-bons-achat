/**
 * @file components/order-list/OrderListManager.js
 * @description Page « À Commander » (liste de réapprovisionnement).
 *              - 2 vues: « À commander » (pending) + « Commandés » (ordered, historique)
 *              - Regroupement souple par fournisseur suggéré (+ groupe « À assigner »)
 *              - Sélection multi-items (même à travers plusieurs groupes)
 *              - Édition inline: quantité + fournisseur suggéré, suppression
 *              - « Créer AF »: stocke les items sélectionnés + fournisseur choisi dans
 *                sessionStorage ('af-prefill') puis bascule vers l'onglet Achats
 *                Fournisseurs (le hook AF pré-remplit le formulaire au montage).
 *              - Mobile/tablette: touch targets 44px, cartes empilées.
 * @version 1.0.0
 * @date 2026-07-21
 * @changelog
 *   1.0.0 - Version initiale (Liste À Commander MVP)
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShoppingCart, Trash2, ExternalLink, Check, Loader2, RefreshCw,
  PackageCheck, ClipboardList, ChevronRight,
} from 'lucide-react';
import { createClient } from '../../lib/supabase';

const UNASSIGNED = '__unassigned__';

function formatQcDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('fr-CA', {
      timeZone: 'America/Toronto',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

/**
 * Props:
 *  - onCreateAF: callback() → bascule le parent vers l'onglet Achats Fournisseurs.
 *                Appelé après écriture de sessionStorage 'af-prefill'.
 *  - onCountChange: callback(pendingCount) → notifie le parent du nombre en attente.
 */
export default function OrderListManager({ onCreateAF, onCountChange }) {
  const supabase = useMemo(() => createClient(), []);
  const [view, setView] = useState('pending'); // 'pending' | 'ordered'
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [suppliers, setSuppliers] = useState([]);
  const [afSupplierId, setAfSupplierId] = useState('');
  const [creatingAF, setCreatingAF] = useState(false);
  const [savingId, setSavingId] = useState(null);

  // --- Chargement des fournisseurs (pour la sélection AF + édition inline) ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('suppliers')
        .select('id, company_name')
        .order('company_name', { ascending: true });
      if (!cancelled) setSuppliers(data || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // --- Chargement des items selon la vue ---
  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/items-to-order?status=${view}`);
      const json = await res.json();
      if (json.success) {
        setItems(json.data || []);
        setSelectedIds(new Set());
      }
    } catch (err) {
      console.error('Erreur chargement liste à commander:', err);
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Notifier le parent du nombre en attente (pour la pastille de navigation)
  useEffect(() => {
    if (view === 'pending' && typeof onCountChange === 'function') {
      onCountChange(items.length);
    }
  }, [items, view, onCountChange]);

  // --- Groupement par fournisseur suggéré ---
  const groups = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      const key = it.suggested_supplier?.trim() || UNASSIGNED;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    // Ordre: « À assigner » d'abord (pour inciter à assigner), puis alpha.
    const keys = [...map.keys()].sort((a, b) => {
      if (a === UNASSIGNED) return -1;
      if (b === UNASSIGNED) return 1;
      return a.localeCompare(b, 'fr-CA');
    });
    return keys.map((k) => ({ key: k, items: map.get(k) }));
  }, [items]);

  // --- Sélection ---
  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectGroup = useCallback((groupItems) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = groupItems.every((it) => next.has(it.id));
      groupItems.forEach((it) => (allSelected ? next.delete(it.id) : next.add(it.id)));
      return next;
    });
  }, []);

  const selectedItems = useMemo(
    () => items.filter((it) => selectedIds.has(it.id)),
    [items, selectedIds]
  );

  // Fournisseur AF par défaut = le plus fréquent parmi la sélection s'il matche un fournisseur
  useEffect(() => {
    if (selectedItems.length === 0) {
      setAfSupplierId('');
      return;
    }
    const counts = {};
    selectedItems.forEach((it) => {
      const name = it.suggested_supplier?.trim();
      if (name) counts[name] = (counts[name] || 0) + 1;
    });
    const topName = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (topName) {
      const match = suppliers.find(
        (s) => s.company_name?.trim().toLowerCase() === topName.toLowerCase()
      );
      setAfSupplierId(match ? match.id : '');
    }
  }, [selectedItems, suppliers]);

  // --- Actions item ---
  const updateItem = useCallback(async (id, patch) => {
    setSavingId(id);
    // Optimiste
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    try {
      const res = await fetch(`/api/items-to-order/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
    } catch (err) {
      console.error('Erreur mise à jour item:', err);
      loadItems(); // resync en cas d'échec
    } finally {
      setSavingId(null);
    }
  }, [loadItems]);

  const deleteItem = useCallback(async (item) => {
    if (!confirm(`Retirer « ${item.description} » de la liste à commander ?`)) return;
    setItems((prev) => prev.filter((it) => it.id !== item.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
    try {
      await fetch(`/api/items-to-order/${item.id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Erreur suppression item:', err);
      loadItems();
    }
  }, [loadItems]);

  // --- Créer l'AF pré-rempli ---
  const handleCreateAF = useCallback(() => {
    if (selectedItems.length === 0) return;
    setCreatingAF(true);

    const supplier = suppliers.find((s) => s.id === afSupplierId);
    const prefillItems = selectedItems.map((it) => {
      const cost = it.cost_price != null ? parseFloat(it.cost_price) : 0;
      return {
        product_id: it.product_code || it.product_id || '',
        description: it.description,
        quantity: parseFloat(it.quantity) || 1,
        unit: it.unit || 'UN',
        cost_price: cost,
        selling_price: 0,
        original_cost_price: cost,
        notes: it.notes || '',
        is_non_inventory: false,
      };
    });

    const payload = {
      items: prefillItems,
      supplier_id: supplier ? supplier.id : '',
      supplier_name: supplier ? supplier.company_name : '',
      toOrderIds: selectedItems.map((it) => it.id),
      createdAt: Date.now(),
    };

    try {
      sessionStorage.setItem('af-prefill', JSON.stringify(payload));
    } catch (err) {
      console.error('Erreur sessionStorage af-prefill:', err);
    }

    // Basculer vers l'onglet Achats Fournisseurs (le hook pré-remplit au montage)
    if (typeof onCreateAF === 'function') onCreateAF();
    setCreatingAF(false);
  }, [selectedItems, suppliers, afSupplierId, onCreateAF]);

  // ============================ RENDU ============================
  return (
    <div className="max-w-5xl mx-auto">
      {/* En-tête + bascule de vue */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-orange-600 dark:text-orange-400" />
          À Commander
        </h2>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
            <button
              onClick={() => setView('pending')}
              style={{ minHeight: '44px' }}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                view === 'pending'
                  ? 'bg-orange-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              À commander
            </button>
            <button
              onClick={() => setView('ordered')}
              style={{ minHeight: '44px' }}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                view === 'ordered'
                  ? 'bg-green-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              Commandés
            </button>
          </div>
          <button
            onClick={loadItems}
            disabled={loading}
            title="Rafraîchir"
            style={{ minHeight: '44px', minWidth: '44px' }}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Chargement / vide */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Chargement…
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          {view === 'pending' ? (
            <>
              <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Aucun produit à commander</p>
              <p className="text-sm mt-1">
                Ajoutez des produits depuis un BT, un BL, une soumission ou l'inventaire
                avec le bouton « À commander ».
              </p>
            </>
          ) : (
            <>
              <PackageCheck className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Aucun produit commandé</p>
            </>
          )}
        </div>
      ) : view === 'pending' ? (
        /* ---------------- VUE À COMMANDER ---------------- */
        <div className="space-y-5 pb-28">
          {groups.map((group) => {
            const isUnassigned = group.key === UNASSIGNED;
            const allSelected = group.items.every((it) => selectedIds.has(it.id));
            return (
              <div
                key={group.key}
                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
              >
                {/* En-tête de groupe (fournisseur) */}
                <div
                  className={`flex items-center justify-between px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 ${
                    isUnassigned
                      ? 'bg-amber-50 dark:bg-amber-900/20'
                      : 'bg-gray-50 dark:bg-gray-800'
                  }`}
                >
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => toggleSelectGroup(group.items)}
                      className="w-5 h-5 rounded accent-orange-600"
                    />
                    <span className={`font-semibold ${
                      isUnassigned
                        ? 'text-amber-700 dark:text-amber-300'
                        : 'text-gray-800 dark:text-gray-200'
                    }`}>
                      {isUnassigned ? 'À assigner (aucun fournisseur)' : group.key}
                    </span>
                  </label>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {group.items.length} item{group.items.length > 1 ? 's' : ''}
                  </span>
                </div>

                {/* Items du groupe */}
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {group.items.map((it) => (
                    <div key={it.id} className="p-3 flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(it.id)}
                        onChange={() => toggleSelect(it.id)}
                        className="w-5 h-5 mt-1 rounded accent-orange-600 flex-shrink-0"
                        style={{ minHeight: '20px' }}
                      />
                      <div className="flex-1 min-w-0">
                        {/* Ligne 1: code + description */}
                        <div className="flex items-baseline gap-2 flex-wrap">
                          {it.product_code && (
                            <span className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">
                              {it.product_code}
                            </span>
                          )}
                          <span className="font-medium text-gray-900 dark:text-gray-100 break-words">
                            {it.description}
                          </span>
                        </div>
                        {/* Ligne 2: provenance */}
                        {(it.source_number || it.client_name) && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {it.source_number && <span>{it.source_number}</span>}
                            {it.source_number && it.client_name && <span> · </span>}
                            {it.client_name && <span>{it.client_name}</span>}
                          </div>
                        )}
                        {/* Ligne 3: contrôles (qté + fournisseur) */}
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          <div className="flex items-center gap-1">
                            <label className="text-xs text-gray-500 dark:text-gray-400">Qté</label>
                            <input
                              type="number"
                              inputMode="decimal"
                              value={it.quantity}
                              min="0"
                              step="any"
                              onFocus={(e) => e.target.select()}
                              onChange={(e) =>
                                setItems((prev) =>
                                  prev.map((x) =>
                                    x.id === it.id ? { ...x, quantity: e.target.value } : x
                                  )
                                )
                              }
                              onBlur={(e) => updateItem(it.id, { quantity: e.target.value })}
                              className="w-20 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                              style={{ minHeight: '40px' }}
                            />
                            <span className="text-xs text-gray-500 dark:text-gray-400">{it.unit}</span>
                          </div>
                          <select
                            value={it.suggested_supplier || ''}
                            onChange={(e) =>
                              updateItem(it.id, { suggested_supplier: e.target.value || null })
                            }
                            className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 max-w-[180px]"
                            style={{ minHeight: '40px' }}
                          >
                            <option value="">— Fournisseur —</option>
                            {it.suggested_supplier &&
                              !suppliers.some((s) => s.company_name === it.suggested_supplier) && (
                                <option value={it.suggested_supplier}>{it.suggested_supplier}</option>
                              )}
                            {suppliers.map((s) => (
                              <option key={s.id} value={s.company_name}>
                                {s.company_name}
                              </option>
                            ))}
                          </select>
                          {savingId === it.id && (
                            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                          )}
                        </div>
                      </div>
                      {/* Supprimer */}
                      <button
                        onClick={() => deleteItem(it)}
                        title="Retirer de la liste"
                        style={{ minHeight: '44px', minWidth: '44px' }}
                        className="flex-shrink-0 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ---------------- VUE COMMANDÉS ---------------- */
        <div className="space-y-2 pb-8">
          {items.map((it) => (
            <div
              key={it.id}
              className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex items-start gap-3"
            >
              <div className="flex-shrink-0 mt-0.5 text-green-600 dark:text-green-400">
                <Check className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  {it.product_code && (
                    <span className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">
                      {it.product_code}
                    </span>
                  )}
                  <span className="font-medium text-gray-900 dark:text-gray-100 break-words">
                    {it.description}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    × {parseFloat(it.quantity)} {it.unit}
                  </span>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2 flex-wrap">
                  {it.suggested_supplier && <span>{it.suggested_supplier}</span>}
                  {it.supplier_purchase_number && (
                    <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400 font-medium">
                      <ExternalLink className="w-3 h-3" />
                      {it.supplier_purchase_number}
                    </span>
                  )}
                  {it.ordered_at && <span>· Commandé le {formatQcDate(it.ordered_at)}</span>}
                </div>
              </div>
              <button
                onClick={() => {
                  if (confirm('Remettre cet item dans « À commander » ?')) {
                    updateItem(it.id, { status: 'pending' });
                    setTimeout(loadItems, 300);
                  }
                }}
                title="Remettre à commander"
                style={{ minHeight: '44px', minWidth: '44px' }}
                className="flex-shrink-0 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/30 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Barre d'action flottante (sélection → Créer AF) */}
      {view === 'pending' && selectedItems.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-2xl">
          <div className="max-w-5xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
              {selectedItems.length} item{selectedItems.length > 1 ? 's' : ''} sélectionné{selectedItems.length > 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-2 flex-1">
              <label className="text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">Fournisseur :</label>
              <select
                value={afSupplierId}
                onChange={(e) => setAfSupplierId(e.target.value)}
                className="flex-1 min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                style={{ minHeight: '44px' }}
              >
                <option value="">— Choisir à la commande —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.company_name}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleCreateAF}
              disabled={creatingAF}
              style={{ minHeight: '44px' }}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-60 whitespace-nowrap"
            >
              {creatingAF ? <Loader2 className="w-5 h-5 animate-spin" /> : <ChevronRight className="w-5 h-5" />}
              Créer l'AF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
