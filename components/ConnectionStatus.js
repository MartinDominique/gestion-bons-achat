// components/ConnectionStatus.js

'use client';
import { useState, useEffect } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

export default function ConnectionStatus({ className = '' }) {
  const [isOnline, setIsOnline] = useState(true);
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
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
      {/* Badge compact */}
      <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
        isOnline 
          ? 'bg-green-100 text-green-700' 
          : 'bg-red-100 text-red-700 animate-pulse'
      } ${className}`}>
        {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
        {isOnline ? 'En ligne' : 'Hors ligne'}
      </div>

      {/* Bannière d'avertissement quand offline */}
      {showWarning && !isOnline && (
        <div className="fixed top-0 left-0 right-0 bg-red-600 text-white text-center py-2 text-sm font-medium z-50 animate-pulse">
          ⚠️ Connexion perdue - Les sauvegardes peuvent échouer
          <button 
            onClick={() => setShowWarning(false)}
            className="ml-4 underline"
          >
            Fermer
          </button>
        </div>
      )}
    </>
  );
}
