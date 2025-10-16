import React, { useState, useEffect } from 'react';
import { Play, Square, Clock, Edit, Save } from 'lucide-react';

export default function TimeTracker({ 
  onTimeChange, 
  initialStartTime = null, 
  initialEndTime = null,
  initialPauseMinutes = 0,
  workDate = null 
}) {
  const [isWorking, setIsWorking] = useState(false);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endTime, setEndTime] = useState(initialEndTime);
  const [pauseMinutes, setPauseMinutes] = useState(initialPauseMinutes);
  useEffect(() => {
  if (initialPauseMinutes !== undefined && initialPauseMinutes !== null) {
    setPauseMinutes(initialPauseMinutes);
  }
}, [initialPauseMinutes]);
  
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // États d'édition manuelle
  const [showManualEdit, setShowManualEdit] = useState(false);
  const [manualStart, setManualStart] = useState('');
  const [manualEnd, setManualEnd] = useState('');

  // Mise à jour temps courant chaque seconde
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Initialisation avec valeurs existantes
  useEffect(() => {
    if (initialStartTime) {
      setStartTime(new Date(workDate + 'T' + initialStartTime));
    }
    if (initialEndTime) {
      setEndTime(new Date(workDate + 'T' + initialEndTime));
    }
    if (initialStartTime && !initialEndTime) {
      setIsWorking(true);
    }
  }, [initialStartTime, initialEndTime, workDate]);

  // Notifier parent des changements
  useEffect(() => {
    if (startTime && onTimeChange) {
      const startTimeStr = startTime.toTimeString().substring(0, 5);
      const endTimeStr = endTime ? endTime.toTimeString().substring(0, 5) : '';
      const totalHours = calculateTotalHours();
      
      onTimeChange({
        start_time: startTimeStr,
        end_time: endTimeStr,
        total_hours: totalHours,
        pause_minutes: pauseMinutes
      });
    }
  }, [startTime, endTime, pauseMinutes]);

  const calculateTotalHours = () => {
  if (!startTime) return 0;
  
  const end = endTime || currentTime;
  const workingTimeMs = end.getTime() - startTime.getTime();
  const workingHours = workingTimeMs / (1000 * 60 * 60);
  const pauseHours = pauseMinutes / 60;
  
  const netHours = Math.max(0, workingHours - pauseHours);
  
  // Arrondir au quart d'heure supérieur (0.25h = 15 min)
  return roundToQuarterHour(netHours);
    };
    
    // Nouvelle fonction à ajouter après calculateTotalHours
    const roundToQuarterHour = (hours) => {
      // Séparer heures entières et décimales
      const fullHours = Math.floor(hours);
      const decimalPart = hours - fullHours;
      
      // Convertir la partie décimale en minutes
      const minutes = decimalPart * 60;
      
      // Arrondir au quart d'heure supérieur
      let roundedMinutes;
      if (minutes <= 15) {
        roundedMinutes = 15;
      } else if (minutes <= 30) {
        roundedMinutes = 30;
      } else if (minutes <= 45) {
        roundedMinutes = 45;
      } else {
        roundedMinutes = 60;
      }
      
      // Si 60 minutes, ajouter 1 heure
      if (roundedMinutes === 60) {
        return fullHours + 1;
      }
      
      // Reconvertir en heures décimales
      return fullHours + (roundedMinutes / 60);
    };

  const formatTime = (date) => {
    if (!date) return '--:--';
    return date.toTimeString().substring(0, 5);
  };

  const formatDuration = (hours) => {
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    return `${h}h ${m.toString().padStart(2, '0')}m`;
  };

  // Commencer le travail
  const handlePunchIn = () => {
    const now = new Date();
    setStartTime(now);
    setEndTime(null);
    setIsWorking(true);
    setPauseMinutes(0);
  };

  // Terminer le travail
  const handlePunchOut = () => {
    const now = new Date();
    setEndTime(now);
    setIsWorking(false);
  };

  // Reset
  const handleReset = () => {
    setStartTime(null);
    setEndTime(null);
    setIsWorking(false);
    setPauseMinutes(0);
  };

  // Édition manuelle
  const handleManualEdit = () => {
    setManualStart(startTime ? formatTime(startTime) : '');
    setManualEnd(endTime ? formatTime(endTime) : '');
    setShowManualEdit(true);
  };

  const saveManualEdit = () => {
    try {
      const today = workDate || new Date().toISOString().split('T')[0];
      
      if (manualStart) {
        setStartTime(new Date(today + 'T' + manualStart + ':00'));
      }
      if (manualEnd) {
        setEndTime(new Date(today + 'T' + manualEnd + ':00'));
        setIsWorking(false);
      }
      
      setShowManualEdit(false);
    } catch (error) {
      alert('Format d\'heure invalide');
    }
  };

  const cancelManualEdit = () => {
    setShowManualEdit(false);
    setManualStart('');
    setManualEnd('');
  };

  return (
    <div className="bg-gray-50 p-4 rounded-lg space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900 flex items-center">
          <Clock className="mr-2" size={20} />
          Suivi du temps
        </h3>
        <button
          type="button"
          onClick={handleManualEdit}
          className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
        >
          <Edit size={14} className="mr-1" />
          Édition manuelle
        </button>
      </div>

      {/* Interface principale */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Début */}
        <div className="text-center">
          <div className="text-sm text-gray-600 mb-1">Début</div>
          <div className="text-xl font-mono font-bold text-green-700">
            {formatTime(startTime)}
          </div>
        </div>

        {/* Fin */}
        <div className="text-center">
          <div className="text-sm text-gray-600 mb-1">Fin</div>
          <div className="text-xl font-mono font-bold text-red-700">
            {formatTime(endTime)}
          </div>
        </div>

        {/* Pause */}
        <div className="text-center">
          <div className="text-sm text-gray-600 mb-1">Pause (min)</div>
          <input
            type="number"
            min="0"
            max="120"
            value={pauseMinutes}
            onChange={(e) => setPauseMinutes(Math.min(120, Math.max(0, parseInt(e.target.value) || 0)))}
            className="w-full text-center text-xl font-mono font-bold text-orange-700 border-2 border-orange-300 rounded-lg px-2 py-1 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            placeholder="0"
            disabled={!startTime}
          />
          <div className="text-xs text-gray-500 mt-1">0-120 min</div>
        </div>

        {/* Total */}
        <div className="text-center">
          <div className="text-sm text-gray-600 mb-1">Total travaillé</div>
          <div className="text-xl font-mono font-bold text-blue-700">
            {formatDuration(calculateTotalHours())}
          </div>
        </div>
      </div>

      {/* Affichage du calcul */}
      {startTime && endTime && pauseMinutes > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
          <div className="flex justify-between items-center">
            <span>Temps brut:</span>
            <span className="font-mono">{formatDuration((endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60))}</span>
          </div>
          <div className="flex justify-between items-center">
            <span>Pause dîner:</span>
            <span className="font-mono text-orange-700">- {pauseMinutes} min</span>
          </div>
          <div className="flex justify-between items-center font-bold border-t border-blue-300 mt-2 pt-2">
            <span>Temps travaillé:</span>
            <span className="font-mono text-lg">{formatDuration(calculateTotalHours())}</span>
          </div>
        </div>
      )}

      {/* Statut actuel */}
      <div className="text-center">
        {isWorking && !endTime && (
          <div className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-green-100 text-green-800">
            <div className="w-2 h-2 rounded-full mr-2 bg-green-500 animate-pulse"></div>
            En cours - {formatDuration(calculateTotalHours())}
          </div>
        )}
        
        {endTime && (
          <div className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
            <Square className="w-4 h-4 mr-2" />
            Travail terminé
          </div>
        )}
        
        {!startTime && (
          <div className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-gray-100 text-gray-600">
            Pas encore commencé
          </div>
        )}
      </div>

      {/* Boutons de contrôle */}
      <div className="flex justify-center gap-3">
        {!startTime && (
          <button
            type="button"
            onClick={handlePunchIn}
            className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 flex items-center font-medium"
          >
            <Play className="mr-2" size={18} />
            Commencer travail
          </button>
        )}

        {isWorking && !endTime && (
          <button
            type="button"
            onClick={handlePunchOut}
            className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 flex items-center font-medium"
          >
            <Square className="mr-2" size={18} />
            Terminer travail
          </button>
        )}

        {(startTime || endTime) && (
          <button
            type="button"
            onClick={handleReset}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 text-sm"
          >
            Reset
          </button>
        )}
      </div>

      {/* Modal édition manuelle */}
      {showManualEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">Édition manuelle des heures</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Heure début
                </label>
                <input
                  type="time"
                  value={manualStart}
                  onChange={(e) => setManualStart(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Heure fin (optionnel)
                </label>
                <input
                  type="time"
                  value={manualEnd}
                  onChange={(e) => setManualEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={saveManualEdit}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center"
              >
                <Save className="mr-2" size={16} />
                Sauvegarder
              </button>
              <button
                type="button"
                onClick={cancelManualEdit}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
