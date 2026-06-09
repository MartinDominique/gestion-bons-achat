/**
 * @file components/notes/NoteForm.js
 * @description Modal de création / édition d'une note.
 *              - Champs: Titre (requis), Description, Échéance (optionnelle),
 *                Client (optionnel), Type (Global / Lié à un projet), sélecteur de document
 *              - Le client (si choisi) filtre le sélecteur de document
 *              - Le sélecteur charge BT/BL/BA/Soumission via /api/notes/projects
 *                (Brouillons BT/BL, BA En cours, Soumissions Envoyées/Acceptées)
 *              - Validation: titre min 3 caractères, document requis si type projet
 * @version 1.1.0
 * @date 2026-06-09
 * @changelog
 *   1.1.0 - Ajout du sélecteur de client (optionnel) qui filtre les documents liables
 *   1.0.0 - Version initiale (Système de Notes MVP)
 */

'use client';

import React, { useState, useEffect } from 'react';
import { X, Loader2, Search } from 'lucide-react';
import { PROJECT_TYPE_LABELS } from '../../lib/utils/notes';

const PROJECT_TYPE_OPTIONS = [
  { value: 'work_order', label: 'Bon de Travail (BT)' },
  { value: 'delivery_note', label: 'Bon de Livraison (BL)' },
  { value: 'purchase_order', label: "Bon d'Achat client (BA)" },
  { value: 'submission', label: 'Soumission' },
];

export default function NoteForm({ note, onSave, onClose }) {
  const isEdit = !!note;

  const [title, setTitle] = useState(note?.title || '');
  const [description, setDescription] = useState(note?.description || '');
  const [dueDate, setDueDate] = useState(note?.due_date || '');
  const [clientId, setClientId] = useState(note?.client_id || '');
  const [clientName, setClientName] = useState(note?.client_name || '');
  const [noteType, setNoteType] = useState(note?.note_type || 'global');
  const [projectType, setProjectType] = useState(note?.project_type || 'work_order');
  const [projectId, setProjectId] = useState(note?.project_id || null);
  const [projectNumber, setProjectNumber] = useState(note?.project_number || '');

  const [clients, setClients] = useState([]);
  const [docs, setDocs] = useState([]);
  const [docSearch, setDocSearch] = useState('');
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Charger la liste des clients (pour le sélecteur de client)
  useEffect(() => {
    let cancelled = false;
    fetch('/api/clients')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setClients(data);
      })
      .catch(() => {
        if (!cancelled) setClients([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Charger les documents quand on passe en mode projet ou qu'on change de type/client
  useEffect(() => {
    if (noteType !== 'project') return;
    let cancelled = false;

    const load = async () => {
      setLoadingDocs(true);
      try {
        const params = new URLSearchParams({ type: projectType });
        if (docSearch.trim()) params.set('search', docSearch.trim());
        // BT/BL filtrés par client_id, BA/Soumission par client_name
        if (clientId) params.set('client_id', clientId);
        if (clientName) params.set('client_name', clientName);
        const res = await fetch(`/api/notes/projects?${params.toString()}`);
        const json = await res.json();
        if (!cancelled && json.success) setDocs(json.data || []);
      } catch (e) {
        if (!cancelled) setDocs([]);
      } finally {
        if (!cancelled) setLoadingDocs(false);
      }
    };

    const t = setTimeout(load, 250); // debounce recherche
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [noteType, projectType, docSearch, clientId, clientName]);

  // Quand on change de client, réinitialiser le document sélectionné
  const handleClientChange = (e) => {
    const id = e.target.value;
    setClientId(id);
    const selected = clients.find((c) => String(c.id) === String(id));
    setClientName(selected?.name || '');
    setProjectId(null);
    setProjectNumber('');
  };

  const handleSelectDoc = (doc) => {
    setProjectId(doc.id);
    setProjectNumber(doc.number);
  };

  const handleSubmit = async () => {
    setError('');

    if (!title.trim() || title.trim().length < 3) {
      setError('Le titre est requis (minimum 3 caractères).');
      return;
    }
    if (noteType === 'project' && !projectId) {
      setError('Veuillez sélectionner un document à lier.');
      return;
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      due_date: dueDate || null,
      client_id: clientId || null,
      client_name: clientName || null,
      note_type: noteType,
      project_type: noteType === 'project' ? projectType : null,
      project_id: noteType === 'project' ? projectId : null,
      project_number: noteType === 'project' ? projectNumber : null,
    };

    setSaving(true);
    try {
      await onSave(payload);
    } catch (e) {
      setError(e?.message || 'Erreur lors de l\'enregistrement.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
        {/* En-tête */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-900">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {isEdit ? 'Modifier la note' : 'Nouvelle note'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps */}
        <div className="p-5 space-y-4">
          {/* Titre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Titre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoCorrect="on"
              autoCapitalize="sentences"
              spellCheck={true}
              placeholder="Ex: Retourner finir le câblage du panneau"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              autoCorrect="on"
              autoCapitalize="sentences"
              spellCheck={true}
              rows={3}
              placeholder="Détails optionnels…"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
            />
          </div>

          {/* Échéance (optionnelle) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Date d'échéance <span className="text-gray-400 font-normal">(optionnelle)</span>
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Sans date, la note reste en bas du tableau (fond gris).
            </p>
          </div>

          {/* Client (optionnel) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Client <span className="text-gray-400 font-normal">(optionnel)</span>
            </label>
            <select
              value={clientId || ''}
              onChange={handleClientChange}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">— Aucun client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Filtre les documents (BT/BL/BA/Soumission) liables à ce client.
            </p>
          </div>

          {/* Type de note */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setNoteType('global')}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  noteType === 'global'
                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                Note globale
              </button>
              <button
                type="button"
                onClick={() => setNoteType('project')}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  noteType === 'project'
                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                Liée à un document
              </button>
            </div>
          </div>

          {/* Sélecteur de document (si type projet) */}
          {noteType === 'project' && (
            <div className="space-y-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Type de document
                </label>
                <select
                  value={projectType}
                  onChange={(e) => {
                    setProjectType(e.target.value);
                    setProjectId(null);
                    setProjectNumber('');
                  }}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {PROJECT_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Recherche document */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder={`Rechercher un ${PROJECT_TYPE_LABELS[projectType]}…`}
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Document sélectionné */}
              {projectNumber && (
                <div className="text-sm px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  Sélectionné : <span className="font-semibold">{projectNumber}</span>
                </div>
              )}

              {/* Liste des documents */}
              <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                {loadingDocs ? (
                  <div className="p-4 text-center text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin inline" />
                  </div>
                ) : docs.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-400">
                    Aucun document trouvé.
                  </div>
                ) : (
                  docs.map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => handleSelectDoc(doc)}
                      className={`w-full text-left px-3 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors ${
                        projectId === doc.id ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-white dark:bg-gray-800'
                      }`}
                    >
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {doc.number}
                      </div>
                      {doc.client_name && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {doc.client_name}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}
        </div>

        {/* Pied */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-900">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? 'Enregistrer' : 'Créer la note'}
          </button>
        </div>
      </div>
    </div>
  );
}
