/**
 * @file app/(protected)/panneaux/[id]/page.js
 * @description Page de l'éditeur de disposition (Panneau virtuel), plein écran.
 * @version 1.0.0
 * @date 2026-11-25
 * @changelog
 *   1.0.0 - Version initiale (Panneau virtuel PR 2)
 */
'use client';
import React from 'react';
import PanelEditor from '../../../../components/panel/editor/PanelEditor';

export default function PanneauEditorPage({ params }) {
  return <PanelEditor layoutId={params.id} />;
}
