/**
 * @file app/(protected)/parametres/page.js
 * @description Page de parametres de l'application
 *              - Selecteur de theme (Systeme / Clair / Sombre)
 *              - Utilise next-themes pour la gestion du theme
 * @version 1.0.0
 * @date 2026-02-22
 * @changelog
 *   1.0.0 - Version initiale - Selecteur de theme
 */

'use client';

import { useTheme } from 'next-themes';
import { useState, useEffect } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

export default function ParametresPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">Parametres</h1>
        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-48 rounded-xl"></div>
      </div>
    );
  }

  const themeOptions = [
    { value: 'system', label: 'Systeme (auto)', description: 'Suit les preferences de votre appareil', icon: Monitor },
    { value: 'light', label: 'Clair', description: 'Theme clair en permanence', icon: Sun },
    { value: 'dark', label: 'Sombre', description: 'Theme sombre en permanence', icon: Moon },
  ];

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">Parametres</h1>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Apparence</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Choisissez le theme de l&apos;application. Le mode &quot;Systeme&quot; s&apos;adapte automatiquement
          aux preferences de votre appareil (Windows, macOS, etc.).
        </p>

        <div className="grid gap-3">
          {themeOptions.map(({ value, label, description, icon: Icon }) => {
            const isActive = theme === value;
            return (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-all text-left ${
                  isActive
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-400'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <div className={`p-2 rounded-lg ${
                  isActive
                    ? 'bg-blue-100 text-blue-600 dark:bg-blue-800 dark:text-blue-300'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                }`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className={`font-medium ${
                    isActive
                      ? 'text-blue-700 dark:text-blue-300'
                      : 'text-gray-900 dark:text-gray-100'
                  }`}>
                    {label}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
                </div>
                {isActive && (
                  <div className="ml-auto">
                    <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
