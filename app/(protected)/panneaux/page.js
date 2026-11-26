/**
 * @file app/(protected)/panneaux/page.js
 * @description Page « Panneaux » — liste des dispositions du Panneau virtuel.
 * @version 1.0.0
 * @date 2026-11-25
 * @changelog
 *   1.0.0 - Version initiale (Panneau virtuel PR 2)
 */
'use client';
import React from 'react';
import PanelLayoutList from '../../../components/panel/PanelLayoutList';

export default function PanneauxPage() {
  return <PanelLayoutList />;
}
