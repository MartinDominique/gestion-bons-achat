/**
 * @file components/ThemeProvider.js
 * @description Wrapper pour next-themes ThemeProvider
 *              - Gere le mode sombre/clair avec support systeme
 *              - Client component requis pour next-themes
 * @version 1.0.0
 * @date 2026-02-22
 * @changelog
 *   1.0.0 - Version initiale
 */
'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

export default function ThemeProvider({ children }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </NextThemesProvider>
  );
}
