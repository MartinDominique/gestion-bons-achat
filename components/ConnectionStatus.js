/**
 * @file components/ConnectionStatus.js
 * @description Badge de connexion (En ligne / Hors ligne) + bannière d'avertissement rouge quand la connexion tombe
 * @version 1.0.1
 * @date 2026-10-09
 * @changelog
 *   1.0.1 - Mode sombre: badge En ligne / Hors ligne
 *   1.0.0 - Version initiale (en-tête ajouté rétroactivement)
 */
// components/ConnectionStatus.js
// ================================
// RÔLE: Affiche un badge de connexion (🟢 En ligne / 🔴 Hors ligne)
//       + Bannière d'avertissement rouge quand la connexion tombe
// USAGE: <ConnectionStatus /> dans n'importe quel header/page
// ================================

'use client';
import { useState, useEffect } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

export default function ConnectionStatus({ className = '' }) {
  const [isOnline, setIsOnline] = useState(true);
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    // Initialiser avec le statut actuel
    setIsOnline(navigator.onLine);
    
    const handleOnline = () => {
      setIsOnline(true);
      setShowWarning(false);
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      setShowWarning(true);
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <>
      {/* Badge compact - toujours visible */}
      <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
        isOnline 
          ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' 
          : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 animate-pulse'
      } ${className}`}>
        {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
        {isOnline ? 'En ligne' : 'Hors ligne'}
      </div>

      {/* Bannière d'avertissement quand offline - en haut de l'écran */}
      {showWarning && !isOnline && (
        <div className="fixed top-0 left-0 right-0 bg-red-600 text-white text-center py-2 text-sm font-medium z-50 shadow-lg">
          <div className="flex items-center justify-center gap-2">
            <WifiOff size={16} />
            <span>⚠️ Connexion perdue - Les sauvegardes peuvent échouer!</span>
            <button 
              onClick={() => setShowWarning(false)}
              className="ml-4 bg-red-700 hover:bg-red-800 px-2 py-1 rounded text-xs"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  );
}
