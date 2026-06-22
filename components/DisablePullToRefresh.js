/**
 * @file components/DisablePullToRefresh.js
 * @description Désactive le pull-to-refresh natif du navigateur UNIQUEMENT
 *              pendant que ce composant est monté (formulaires de saisie BT/BL
 *              et éditeur de facture). Évite la perte de données quand on tire
 *              la page vers le bas sur mobile/tablette, sans bloquer le
 *              pull-to-refresh sur les pages de liste où il reste utile.
 *
 *              Applique `overscroll-behavior-y: contain` sur <html> et <body>
 *              au montage, puis restaure la valeur précédente au démontage.
 * @version 1.0.0
 * @date 2026-06-22
 * @changelog
 *   1.0.0 - Version initiale
 */

'use client';

import { useEffect } from 'react';

export default function DisablePullToRefresh() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overscrollBehaviorY;
    const prevBody = body.style.overscrollBehaviorY;

    html.style.overscrollBehaviorY = 'contain';
    body.style.overscrollBehaviorY = 'contain';

    return () => {
      html.style.overscrollBehaviorY = prevHtml;
      body.style.overscrollBehaviorY = prevBody;
    };
  }, []);

  return null;
}
