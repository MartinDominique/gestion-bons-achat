// components/PurchaseOrderManager.js – COMPACT VERSION (Version b ➜ compact comme Version main)
// -----------------------------------------------------------------------------
// ✅ Prête à coller dans ton projet. Tailwind uniquement, sans dépendances exotiques.
// ✅ Garde la même logique, mais avec des espacements, typos et cartes plus denses.
// ✅ Si tu as déjà un fichier du même nom, remplace-le au complet par celui‑ci.

'use client'
import React, { useEffect, useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function PurchaseOrderManager({ user }) {
  // --- State -----------------------------------------------------------------
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [stats, setStats] = useState({
    total: 0,
    draft: 0,
    approved: 0,
    partial: 0,
    delivered: 0,
    totalValue: 0,
  })

  const [showCreateModal, setShowCreateModal] = useState(false)

  // --- Helpers ---------------------------------------------------------------
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(Number(amount || 0))
  }
  const formatDate = (d) => (d ? new Date(d).toLocaleDateString('fr-CA') : '—')

  const getStatusColor = (status) => {
    switch ((status || '').toLowerCase()) {
      case 'approved':
      case 'approuvé':
        return 'bg-green-100 text-green-700 ring-1 ring-green-200'
      case 'draft':
      case 'brouillon':
        return 'bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200'
      case 'partial':
      case 'partiel':
      case 'partiels':
        return 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200'
      case 'delivered':
      case 'livré':
      case 'livrés':
        return 'bg-blue-100 text-blue-700 ring-1 ring-blue-200'
      default:
        return 'bg-gray-100 text-gray-700 ring-1 ring-gray-200'
    }
  }

  // --- Data fetch (Supabase) ------------------------------------------------
  useEffect(() => {
    const fetchAll = async () => {
      try {
        setLoading(true)
        // ⚠️ Adapte les noms de tables/colonnes à ton schéma si besoin.
        const { data: poData, error } = await supabase
          .from('purchase_orders')
          .select('*')
          .order('created_at', { ascending: false })

        if (error) throw error
        setOrders(poData || [])

        // Stats rapides
        const s = { total: 0, draft: 0, approved: 0, partial: 0, delivered: 0, totalValue: 0 }
        for (const po of poData || []) {
          s.total += 1
          s.totalValue += Number(po.amount || 0)
          const st = (po.status || '').toLowerCase()
          if (st.includes('draft') || st.includes('brouillon')) s.draft += 1
          else if (st.includes('approved') || st.includes('approuvé')) s.approved += 1
          else if (st.includes('partial') || st.includes('partiel')) s.partial += 1
          else if (st.includes('delivered') || st.includes('livré')) s.delivered += 1
        }
        setStats(s)
      } catch (e) {
        console.error('Fetch error', e)
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [])

  // --- Derived list ----------------------------------------------------------
  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return orders.filter((po) => {
      const matchTerm = !term
        || (po.po_number || '').toLowerCase().includes(term)
        || (po.client_name || '').toLowerCase().includes(term)
        || (po.submission_no || '').toLowerCase().includes(term)

      const st = (po.status || '').toLowerCase()
      const matchStatus = statusFilter === 'all' || st === statusFilter ||
        (statusFilter === 'approved' && st.includes('approuv')) ||
        (statusFilter === 'draft' && st.includes('brouillon')) ||
        (statusFilter === 'partial' && st.includes('partiel')) ||
        (statusFilter === 'delivered' && st.includes('livr'))

      return matchTerm && matchStatus
    })
  }, [orders, searchTerm, statusFilter])

  // --- Actions ---------------------------------------------------------------
  const handleCreate = () => {
    // Ouvre ton modal/route de création
    setShowCreateModal(true)
  }

  const handleEditPO = (po) => {
    // Branche ceci vers ta page/modale d’édition
    console.log('Gérer PO', po)
  }

  // --- UI -------------------------------------------------------------------
  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      {/* Header compact */}
      <div className="bg-white rounded-md shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              Gestion des Bons d'Achat Client
            </h1>
            <p className="text-gray-500 text-xs mt-1">
              Module de gestion des bons d'achat et livraisons partielles
            </p>
          </div>
          <button
            onClick={handleCreate}
            className="bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 text-sm inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Nouveau BA
          </button>
        </div>

        {/* Stats – compact */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mt-3">
          {[{
            v: stats.total,
            l: 'Total BAs'
          }, {
            v: stats.draft,
            l: 'Brouillons'
          }, {
            v: stats.approved,
            l: 'Approuvés'
          }, {
            v: stats.partial,
            l: 'Partiels'
          }, {
            v: stats.delivered,
            l: 'Livrés'
          }, {
            v: formatCurrency(stats.totalValue),
            l: 'Valeur totale'
          }].map((it, i) => (
            <div key={i} className="bg-gray-50 border border-gray-200 rounded-md p-2 text-center">
              <div className="text-lg font-semibold leading-5">{it.v}</div>
              <div className="text-[11px] text-gray-600">{it.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Search + filter – compact */}
      <div className="bg-white rounded-md shadow-sm border border-gray-200 p-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher par numéro de BA, client ou soumission..."
              className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          >
            <option value="all">Tous les statuts</option>
            <option value="approved">Approuvés</option>
            <option value="draft">Brouillons</option>
            <option value="partial">Partiels</option>
            <option value="delivered">Livrés</option>
          </select>
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {loading && (
          <div className="text-sm text-gray-500">Chargement…</div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="bg-white border border-dashed rounded-md p-6 text-center text-sm text-gray-500">
            Aucun résultat.
          </div>
        )}

        {filtered.map((po) => (
          <div
            key={po.id}
            className="bg-white border rounded-md p-3 hover:bg-gray-50 transition-colors"
          >
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <div className="text-base font-semibold text-gray-900">
                  BA #{po.po_number || po.id}
                </div>
                <span className={`inline-flex px-1.5 py-0.5 text-[11px] font-medium rounded-full ${getStatusColor(po.status)}`}>
                  {po.status || '—'}
                </span>
              </div>
              <button
                onClick={() => handleEditPO(po)}
                className="bg-blue-600 text-white px-2.5 py-1 rounded text-xs hover:bg-blue-700"
              >
                Gérer
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-gray-500 text-xs">Client</div>
                <div className="text-gray-900">{po.client_name || 'N/A'}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Date</div>
                <div className="text-gray-900">{formatDate(po.date)}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Montant</div>
                <div className="text-gray-900 font-medium">{formatCurrency(po.amount)}</div>
              </div>
              {po.submission_no && (
                <div>
                  <div className="text-gray-500 text-xs">Soumission</div>
                  <div className="text-gray-700">#{po.submission_no}</div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* (Optionnel) Modal de création – structure de base */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-md w-full max-w-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-semibold">Nouveau Bon d'Achat</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-sm text-gray-500 hover:text-gray-700">Fermer</button>
            </div>
            <p className="text-sm text-gray-600">Implémente ici ton formulaire (client, date, lignes, etc.).</p>
          </div>
        </div>
      )}
    </div>
  )
}
