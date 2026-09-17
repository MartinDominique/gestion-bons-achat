/**
 * @file components/invoices/InvoiceProductSearch.js
 * @description Recherche d'article pour ajouter une ligne matériau dans l'éditeur de facture
 *              (même recherche tolérante que BT/BL/Inventaire via /api/products/search:
 *              « p1540 » trouve « P1-540 »). Liste déroulante: code, description, vendant,
 *              En main, unité. Un tap → onSelect(product). Cibles tactiles 44 px.
 * @version 1.1.0
 * @date 2026-09-17
 * @changelog
 *   1.1.0 - Résultats affichés dans le flux (sous le champ) au lieu d'une superposition:
 *           le cadre des lignes (overflow-hidden) et la zone défilante de la modale
 *           coupaient la liste. Défilement automatique pour amener la liste en vue.
 *   1.0.0 - Version initiale (ajout d'article depuis la facture)
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Loader2, Package, X } from 'lucide-react';

const formatCurrency = (amount) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(amount || 0);

export default function InvoiceProductSearch({ onSelect, placeholder = 'Ajouter un article (code ou description)...', compact = false }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const resultsRef = useRef(null);
  const requestId = useRef(0);

  // Recherche avec délai (300 ms), 2 caractères minimum
  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const id = ++requestId.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/products/search?search=${encodeURIComponent(q)}&limit=30`);
        const json = await res.json();
        if (id !== requestId.current) return;
        setResults(json.success ? (json.data || []) : []);
        setOpen(true);
      } catch (err) {
        if (id === requestId.current) setResults([]);
      } finally {
        if (id === requestId.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [term]);

  // Amener la liste en vue quand elle s'ouvre (elle est dans le flux, sous le champ)
  useEffect(() => {
    if (open && results.length > 0 && resultsRef.current) {
      try { resultsRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) {}
    }
  }, [open, results.length]);

  // Fermer la liste au clic à l'extérieur
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, []);

  const pick = useCallback((product) => {
    onSelect(product);
    setTerm('');
    setResults([]);
    setOpen(false);
  }, [onSelect]);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setOpen(false); }
            if (e.key === 'Enter') {
              e.preventDefault();
              if (results.length > 0) pick(results[0]);
            }
          }}
          placeholder={placeholder}
          className={`w-full pl-9 pr-9 ${compact ? 'py-2' : 'py-2.5'} min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500`}
          inputMode="search"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        {searching ? (
          <Loader2 className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />
        ) : term ? (
          <button
            type="button"
            onClick={() => { setTerm(''); setResults([]); setOpen(false); }}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            title="Effacer"
          >
            <X className="w-4 h-4" />
          </button>
        ) : null}
      </div>

      {open && term.trim().length >= 2 && (
        <div ref={resultsRef} className="mt-1 max-h-72 overflow-y-auto bg-white dark:bg-gray-800 border border-emerald-300 dark:border-emerald-700 rounded-lg shadow-lg">
          {results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">
              {searching ? 'Recherche...' : 'Aucun article trouvé'}
            </div>
          ) : (
            results.map((p) => {
              const stock = parseFloat(p.stock_qty) || 0;
              return (
                <button
                  key={`${p._source || 'p'}-${p.product_id}`}
                  type="button"
                  onClick={() => pick(p)}
                  className="w-full text-left px-3 py-2 min-h-[44px] border-b last:border-b-0 border-gray-100 dark:border-gray-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex items-start gap-2"
                >
                  <Package className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-300">{p.product_id}</span>
                      {p._source === 'non_inventory' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300">Non-inv.</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-800 dark:text-gray-200 truncate">{p.description}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 flex gap-3 flex-wrap">
                      <span>Vendant: <span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(p.selling_price)}</span></span>
                      <span>Coûtant: <span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(p.cost_price)}</span></span>
                      <span className={stock <= 0 ? 'text-red-600 dark:text-red-400' : ''}>En main: <span className="font-medium">{stock}</span> {p.unit || 'UN'}</span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
