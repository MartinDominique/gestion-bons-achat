/**
 * @file components/notes/NotesManager.js
 * @description Tableau de bord principal du système de Notes (page d'ouverture).
 *              - Charge et affiche les notes actives triées par échéance
 *              - Recherche (titre/description) + filtre par type (Tous/Global/Projet)
 *              - Création, édition, complétion (masquage immédiat) et suppression
 *              - Coloration des cartes selon l'urgence (rouge/orange/gris)
 * @version 1.0.0
 * @date 2026-06-09
 * @changelog
 *   1.0.0 - Version initiale (Système de Notes MVP)
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, StickyNote, Loader2, RefreshCw } from 'lucide-react';
import { createClient } from '../../lib/supabase';
import NoteCard from './NoteCard';
import NoteForm from './NoteForm';
import { sortNotes, countUrgent } from '../../lib/utils/notes';

const TYPE_FILTERS = [
  { value: 'all', label: 'Toutes' },
  { value: 'global', label: 'Globales' },
  { value: 'project', label: 'Projets' },
];

export default function NotesManager() {
  const supabase = createClient();

  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const [showForm, setShowForm] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [userId, setUserId] = useState(null);

  // Récupérer l'utilisateur courant (créateur des nouvelles notes)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data?.user?.id || null);
    });
  }, [supabase]);

  const fetchNotes = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/notes?completed=false');
      const json = await res.json();
      if (json.success) {
        setNotes(sortNotes(json.data));
      } else {
        setError(json.error || 'Erreur lors du chargement des notes.');
      }
    } catch (e) {
      setError('Impossible de charger les notes (connexion ?).');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Filtrage client (recherche + type)
  const visibleNotes = notes.filter((n) => {
    if (typeFilter !== 'all' && n.note_type !== typeFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const inTitle = (n.title || '').toLowerCase().includes(q);
      const inDesc = (n.description || '').toLowerCase().includes(q);
      const inNumber = (n.project_number || '').toLowerCase().includes(q);
      if (!inTitle && !inDesc && !inNumber) return false;
    }
    return true;
  });

  const urgentCount = countUrgent(notes);

  // --- Actions CRUD ---

  const handleSave = async (payload) => {
    if (editingNote) {
      const res = await fetch(`/api/notes/${editingNote.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Erreur de mise à jour.');
      setNotes((prev) =>
        sortNotes(prev.map((n) => (n.id === editingNote.id ? json.data : n)))
      );
    } else {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, user_id: userId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Erreur de création.');
      setNotes((prev) => sortNotes([...prev, json.data]));
    }
    setShowForm(false);
    setEditingNote(null);
  };

  const handleToggleComplete = async (note) => {
    // Masquage optimiste immédiat
    setNotes((prev) => prev.filter((n) => n.id !== note.id));
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true }),
      });
      const json = await res.json();
      if (!json.success) throw new Error();
    } catch (e) {
      // Rollback en cas d'échec
      setNotes((prev) => sortNotes([...prev, note]));
      setError('Échec de la complétion. La note a été restaurée.');
    }
  };

  const handleDelete = async (note) => {
    const res = await fetch(`/api/notes/${note.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.success) {
      setError(json.error || 'Erreur lors de la suppression.');
      return;
    }
    setNotes((prev) => prev.filter((n) => n.id !== note.id));
  };

  const openCreate = () => {
    setEditingNote(null);
    setShowForm(true);
  };

  const openEdit = (note) => {
    setEditingNote(note);
    setShowForm(true);
  };

  return (
    <div>
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <StickyNote className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Notes</h1>
          {urgentCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white">
              {urgentCount} urgente{urgentCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchNotes}
            title="Rafraîchir"
            className="w-11 h-11 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nouvelle note
          </button>
        </div>
      </div>

      {/* Barre de filtres */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Rechercher une note…"
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setTypeFilter(f.value)}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                typeFilter === f.value
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      {/* Liste des notes */}
      {loading ? (
        <div className="py-16 text-center text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin inline" />
        </div>
      ) : visibleNotes.length === 0 ? (
        <div className="py-16 text-center">
          <StickyNote className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">
            {notes.length === 0
              ? 'Aucune note active. Créez-en une !'
              : 'Aucune note ne correspond à votre recherche.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {visibleNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onToggleComplete={handleToggleComplete}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Modal formulaire */}
      {showForm && (
        <NoteForm
          note={editingNote}
          onSave={handleSave}
          onClose={() => {
            setShowForm(false);
            setEditingNote(null);
          }}
        />
      )}
    </div>
  );
}
