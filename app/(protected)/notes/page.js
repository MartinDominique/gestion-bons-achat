/**
 * @file app/(protected)/notes/page.js
 * @description Page tableau de bord des Notes (page d'ouverture de l'app).
 * @version 1.0.0
 * @date 2026-06-09
 * @changelog
 *   1.0.0 - Version initiale (Système de Notes MVP)
 */

'use client';

import React from 'react';
import NotesManager from '../../../components/notes/NotesManager';

export default function NotesPage() {
  return <NotesManager />;
}
