/**
 * @file components/notes/NoteCard.js
 * @description Carte d'affichage d'une note individuelle dans le tableau de bord.
 *              - Couleur de fond selon l'urgence (rouge/orange/gris)
 *              - Checkbox pour marquer complété (la note disparaît ensuite)
 *              - Badge projet cliquable (ouvre le SplitView: BT/BL/BA/Soumission)
 *              - Badge client (si la note est associée à un client)
 *              - Boutons Éditer / Supprimer (suppression avec confirmation)
 * @version 1.1.0
 * @date 2026-06-09
 * @changelog
 *   1.1.0 - Affichage du client associé à la note (badge)
 *   1.0.0 - Version initiale (Système de Notes MVP)
 */

'use client';

import React, { useState } from 'react';
import { Check, Pencil, Trash2, Calendar, Loader2, StickyNote, User } from 'lucide-react';
import ReferenceLink from '../SplitView/ReferenceLink';
import {
  getUrgency,
  urgencyCardClasses,
  urgencyBadgeClasses,
  formatDueDate,
  projectToReferenceLink,
  PROJECT_TYPE_SHORT,
} from '../../lib/utils/notes';

export default function NoteCard({ note, onToggleComplete, onEdit, onDelete }) {
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const urgency = getUrgency(note.due_date);
  const refLink = projectToReferenceLink(note);

  const handleToggle = async () => {
    setBusy(true);
    try {
      await onToggleComplete(note);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await onDelete(note);
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${urgencyCardClasses(urgency)}`}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox complété (touch target 44px) */}
        <button
          type="button"
          onClick={handleToggle}
          disabled={busy}
          aria-label="Marquer comme complétée"
          title="Marquer comme complétée"
          className="flex-shrink-0 mt-0.5 w-11 h-11 flex items-center justify-center rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          ) : (
            <Check className="w-5 h-5 text-emerald-600 opacity-40" />
          )}
        </button>

        {/* Contenu */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 break-words">
              {note.title}
            </h3>
          </div>

          {note.description && (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap break-words">
              {note.description}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* Badge échéance */}
            {note.due_date ? (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${urgencyBadgeClasses(urgency)}`}
              >
                <Calendar className="w-3 h-3" />
                {formatDueDate(note.due_date)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-gray-500 dark:text-gray-400">
                <Calendar className="w-3 h-3" />
                Sans échéance
              </span>
            )}

            {/* Badge client */}
            {note.client_name && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                <User className="w-3 h-3" />
                {note.client_name}
              </span>
            )}

            {/* Badge type / projet cliquable */}
            {refLink ? (
              <span className="inline-flex items-center gap-1">
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {PROJECT_TYPE_SHORT[note.project_type]}
                </span>
                <ReferenceLink
                  type={refLink.type}
                  label={note.project_number || 'Ouvrir'}
                  data={refLink.data}
                  variant={refLink.variant}
                />
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300">
                <StickyNote className="w-3 h-3" />
                Global
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(note)}
            disabled={busy}
            aria-label="Éditer"
            title="Éditer"
            className="w-11 h-11 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors disabled:opacity-50"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
            aria-label="Supprimer"
            title="Supprimer"
            className="w-11 h-11 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-700 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Confirmation de suppression (action destructive) */}
      {confirmDelete && (
        <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-800 dark:text-red-200 mb-2">
            Supprimer définitivement cette note ?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Supprimer
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
