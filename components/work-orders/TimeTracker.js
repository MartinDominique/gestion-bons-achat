import React, { useState, useEffect,useRef } from 'react';
import { Play, Square, Clock, Edit, Save, Plus, Trash2, Calendar } from 'lucide-react';

export default function TimeTracker({ 
  onTimeChange, 
  initialTimeEntries = [],
  workDate = null 
}) {
  // État pour gérer PLUSIEURS sessions
  const [timeEntries, setTimeEntries] = useState(initialTimeEntries || []);
  const [currentSession, setCurrentSession] = useState(null); // Session en cours
  const [isWorking, setIsWorking] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [isInitialized, setIsInitialized] = useState(false);
  const lastNotifiedData = useRef(null);
  const processedEntriesRef = useRef(null);
  
  // États d'édition manuelle
  const [showManualEdit, setShowManualEdit] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [manualDate, setManualDate] = useState('');
  const [manualStart, setManualStart] = useState('');
  const [manualEnd, setManualEnd] = useState('');
  const [manualPause, setManualPause] = useState(0);

  // ========================================
// MISE À JOUR TEMPS COURANT
// ========================================
useEffect(() => {
  const interval = setInterval(() => {
    setCurrentTime(new Date());
  }, 1000);
  return () => clearInterval(interval);
}, []);

// ========================================
// FONCTIONS HELPER
// ========================================

const toQuarterHourUp = (startHHMM, endHHMM, pauseMinutes = 0) => {
  const parseHHMM = (t) => {
    const [h, m] = String(t || '').split(':').map((n) => parseInt(n, 10) || 0);
    return h * 60 + m;
  };
  const s = parseHHMM(startHHMM);
  const e = parseHHMM(endHHMM);
  let net = Math.max(0, e - s - (parseInt(pauseMinutes, 10) || 0));
  const rounded = Math.ceil(net / 15) * 15;
  return Math.round((rounded / 60) * 100) / 100;
};

const getAllSessions = () => {
  if (!currentSession) {
    return timeEntries;
  }
  
  // Calculer le total de la session en cours
  const now = new Date();
  const currentEndTime = currentSession.end_time || now.toTimeString().substring(0, 5);
  const currentTotal = toQuarterHourUp(
    currentSession.start_time,
    currentEndTime,
    currentSession.pause_minutes || 0
  );
  
  // Session en cours avec total provisoire
  const sessionInProgress = {
    ...currentSession,
    total_hours: currentTotal,
    in_progress: true
  };
  
  return [...timeEntries, sessionInProgress];
};

// ========================================
// NOTIFIER PARENT DES CHANGEMENTS
// ========================================
useEffect(() => {
  if (!onTimeChange) return;
  
  // ⭐ Attendre que l'initialisation soit au moins tentée
  if (!isInitialized && initialTimeEntries && initialTimeEntries.length > 0) {
    console.log('⏸️ Attente initialisation avant notification');
    return;
  }
  
  const allSessions = getAllSessions();
  const grandTotal = allSessions.reduce((sum, e) => sum + (e.total_hours || 0), 0);
  
  const dataToSend = {
    time_entries: allSessions,
    total_hours: grandTotal
  };
  
  // Comparer avec dernière notification pour éviter boucles
  const dataString = JSON.stringify(dataToSend);
  if (dataString !== lastNotifiedData.current) {
    console.log('📤 Notification parent - Sessions:', allSessions.length, allSessions);
    lastNotifiedData.current = dataString;
    onTimeChange(dataToSend);
  }
}, [timeEntries, currentSession, isInitialized]);

// Mettre à jour affichage toutes les 30 secondes (pas chaque seconde)
useEffect(() => {
  if (!isWorking || !currentSession) return;
  
  const interval = setInterval(() => {
    setCurrentTime(new Date());
  }, 30000); // 30 secondes
  
  return () => clearInterval(interval);
}, [isWorking, currentSession]);

// ========================================
// INITIALISATION AVEC VALEURS EXISTANTES
// ========================================

// Utiliser useRef pour tracker si on a déjà traité ces données spécifiques
const processedEntriesRef = useRef(null);

useEffect(() => {
  // Créer une signature unique des données reçues
  const entriesSignature = JSON.stringify(initialTimeEntries);
  
  console.log('🚀 TimeTracker useEffect DÉCLENCHÉ', {
    hasEntries: initialTimeEntries?.length > 0,
    entriesCount: initialTimeEntries?.length,
    processedBefore: processedEntriesRef.current === entriesSignature
  });
  
  // ⭐ CRITIQUE : Ne traiter que si les données ont VRAIMENT changé
  if (processedEntriesRef.current === entriesSignature) {
    console.log('⏭️ Mêmes données déjà traitées, skip');
    return;
  }
  
  if (initialTimeEntries && initialTimeEntries.length > 0) {
    console.log('🔄 Initialisation TimeTracker avec:', initialTimeEntries);
    
    // Chercher une session en cours
    const sessionInProgress = initialTimeEntries.find(
      entry => !entry.end_time || entry.in_progress
    );
    
    if (sessionInProgress) {
      console.log('⏰ Session en cours détectée:', sessionInProgress);
      
      // Retirer la session en cours de la liste
      const completedSessions = initialTimeEntries.filter(
        entry => entry !== sessionInProgress
      );
      
      setTimeEntries(completedSessions);
      setCurrentSession({
        date: sessionInProgress.date,
        start_time: sessionInProgress.start_time,
        end_time: null,
        pause_minutes: sessionInProgress.pause_minutes || 0,
        total_hours: 0
      });
      setIsWorking(true);
      
      console.log('✅ Session en cours restaurée:', sessionInProgress);
    } else {
      // Toutes les sessions sont complétées
      console.log('📋 Toutes les sessions sont complétées');
      setTimeEntries(initialTimeEntries);
    }
    
    // ⭐ Marquer ces données comme traitées
    processedEntriesRef.current = entriesSignature;
    setIsInitialized(true);
  } else if (initialTimeEntries && initialTimeEntries.length === 0) {
    // Tableau vide explicite
    console.log('📭 Aucune session à charger');
    processedEntriesRef.current = entriesSignature;
    setIsInitialized(true);
  }
}, [initialTimeEntries]); // ⭐ Écoute SEULEMENT initialTimeEntries

// ========================================
// FONCTIONS DE CALCUL
// ========================================

const calculateSessionHours = (session) => {
  if (!session.start_time || !session.end_time) return 0;
  return toQuarterHourUp(session.start_time, session.end_time, session.pause_minutes || 0);
};

const calculateGrandTotal = () => {
  return timeEntries.reduce((total, entry) => {
    return total + (entry.total_hours || 0);
  }, 0);
};

const formatTime = (timeStr) => {
  if (!timeStr) return '--:--';
  return timeStr.substring(0, 5);
};

const formatDuration = (hours) => {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
};

  // ========================================
  // GESTION DES SESSIONS
  // ========================================

  // Commencer une nouvelle session
  const handlePunchIn = () => {
    const now = new Date();
    const newSession = {
      date: workDate || now.toISOString().split('T')[0],
      start_time: now.toTimeString().substring(0, 5),
      end_time: null,
      pause_minutes: 0,
      total_hours: 0
    };
    setCurrentSession(newSession);
    setIsWorking(true);
  };

  // Terminer la session courante
    const handlePunchOut = () => {
      if (!currentSession) return;
      
      const now = new Date();
      const endTime = now.toTimeString().substring(0, 5);
      const totalHours = toQuarterHourUp(
        currentSession.start_time, 
        endTime, 
        currentSession.pause_minutes
      );
      
      const completedSession = {
        date: currentSession.date,
        start_time: currentSession.start_time,
        end_time: endTime,
        pause_minutes: currentSession.pause_minutes,
        total_hours: totalHours,
        in_progress: false // ⭐ Marquer comme complétée
      };
      
      setTimeEntries([...timeEntries, completedSession]);
      setCurrentSession(null);
      setIsWorking(false);
      
      console.log('✅ Session terminée:', completedSession);
    };

  // Supprimer une session
  const handleDeleteSession = (index) => {
    if (confirm('Supprimer cette session de travail ?')) {
      const newEntries = timeEntries.filter((_, i) => i !== index);
      setTimeEntries(newEntries);
    }
  };

  // Ouvrir modal d'édition
  const handleEditSession = (index) => {
    const session = timeEntries[index];
    setEditingIndex(index);
    setManualDate(session.date);
    setManualStart(session.start_time);
    setManualEnd(session.end_time || '');
    setManualPause(session.pause_minutes || 0);
    setShowManualEdit(true);
  };

  // Ajouter session manuelle
  const handleAddManualSession = () => {
    setEditingIndex(null);
    setManualDate(workDate || new Date().toISOString().split('T')[0]);
    setManualStart('');
    setManualEnd('');
    setManualPause(0);
    setShowManualEdit(true);
  };

  // Sauvegarder session manuelle
  const saveManualEdit = () => {
    if (!manualStart) {
      alert('Heure de début requise');
      return;
    }

    const totalHours = manualEnd ? 
      toQuarterHourUp(manualStart, manualEnd, manualPause) : 0;

    const session = {
      date: manualDate,
      start_time: manualStart,
      end_time: manualEnd || null,
      pause_minutes: parseInt(manualPause) || 0,
      total_hours: totalHours
    };

    if (editingIndex !== null) {
      // Éditer session existante
      const newEntries = [...timeEntries];
      newEntries[editingIndex] = session;
      setTimeEntries(newEntries);
    } else {
      // Ajouter nouvelle session
      setTimeEntries([...timeEntries, session]);
    }

    setShowManualEdit(false);
    setEditingIndex(null);
  };

  const cancelManualEdit = () => {
    setShowManualEdit(false);
    setEditingIndex(null);
  };

  // ========================================
  // AFFICHAGE
  // ========================================

  return (
    <div className="bg-gray-50 p-4 rounded-lg space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900 flex items-center">
          <Clock className="mr-2" size={20} />
          Suivi du temps - Multi-journées
        </h3>
        <button
          type="button"
          onClick={handleAddManualSession}
          className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 flex items-center"
        >
          <Plus size={14} className="mr-1" />
          Ajouter session
        </button>
      </div>

      {/* Session en cours */}
      {currentSession && (
        <div className="bg-green-50 border-2 border-green-500 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-green-900 flex items-center">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse mr-2"></div>
              Session en cours
            </h4>
            <button
              type="button"
              onClick={handlePunchOut}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 flex items-center text-sm"
            >
              <Square className="mr-1" size={16} />
              Terminer
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-xs text-gray-600 mb-1">Date</div>
              <div className="font-mono font-bold text-green-700">{currentSession.date}</div>
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Début</div>
              <div className="font-mono font-bold text-green-700">{currentSession.start_time}</div>
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Pause (min)</div>
              <input
                type="number"
                min="0"
                max="120"
                value={currentSession.pause_minutes}
                onChange={(e) => setCurrentSession({
                  ...currentSession,
                  pause_minutes: Math.min(120, Math.max(0, parseInt(e.target.value) || 0))
                })}
                className="w-full text-center font-mono font-bold text-orange-700 border-2 border-orange-300 rounded px-2 py-1"
              />
            </div>
          </div>

          <div className="mt-3 text-center text-lg font-bold text-green-700">
            Temps écoulé: {formatDuration(
              toQuarterHourUp(
                currentSession.start_time,
                currentTime.toTimeString().substring(0, 5),
                currentSession.pause_minutes
              )
            )}
          </div>
        </div>
      )}

      {/* Liste des sessions terminées */}
      {timeEntries.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-gray-700">Sessions enregistrées:</h4>
          {timeEntries.map((entry, index) => (
            <div 
              key={index} 
              className={`border rounded-lg p-3 flex items-center justify-between ${
                entry.in_progress 
                  ? 'bg-green-50 border-green-500 border-2' 
                  : 'bg-white border-gray-300'
              }`}
            >
              <div className="flex-1 grid grid-cols-5 gap-2 text-sm">
                <div>
                  <div className="text-xs text-gray-500">Date</div>
                  <div className="font-semibold flex items-center">
                    <Calendar size={12} className="mr-1 text-blue-600" />
                    {entry.date}
                    {entry.in_progress && (
                      <span className="ml-2 text-xs bg-green-600 text-white px-2 py-0.5 rounded-full">
                        EN COURS
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Début</div>
                  <div className="font-mono font-bold text-green-700">{entry.start_time}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Fin</div>
                  <div className="font-mono font-bold text-red-700">
                    {entry.end_time || (entry.in_progress ? '⏱️ En cours' : '--:--')}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Pause</div>
                  <div className="font-mono text-orange-700">{entry.pause_minutes || 0} min</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Total</div>
                  <div className={`font-bold ${entry.in_progress ? 'text-green-700' : 'text-blue-700'}`}>
                    {formatDuration(entry.total_hours || 0)}
                    {entry.in_progress && ' ⏱️'}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 ml-3">
                <button
                  type="button"
                  onClick={() => handleEditSession(index)}
                  disabled={entry.in_progress}
                  className={`p-1 ${
                    entry.in_progress 
                      ? 'text-gray-400 cursor-not-allowed opacity-50' 
                      : 'text-blue-600 hover:text-blue-800'
                  }`}
                  title={entry.in_progress ? 'Session en cours - terminez d\'abord' : 'Modifier'}
                >
                  <Edit size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSession(index)}
                  disabled={entry.in_progress}
                  className={`p-1 ${
                    entry.in_progress 
                      ? 'text-gray-400 cursor-not-allowed opacity-50' 
                      : 'text-red-600 hover:text-red-800'
                  }`}
                  title={entry.in_progress ? 'Session en cours - terminez d\'abord' : 'Supprimer'}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Total général */}
      {timeEntries.length > 0 && (
        <div className="bg-blue-100 border-2 border-blue-500 rounded-lg p-4">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-blue-900">TOTAL TOUTES SESSIONS:</span>
            <span className="text-2xl font-bold text-blue-900">{formatDuration(calculateGrandTotal())}</span>
          </div>
          <div className="text-sm text-blue-700 mt-1">
            {timeEntries.length} session{timeEntries.length > 1 ? 's' : ''} enregistrée{timeEntries.length > 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Bouton Punch-in si aucune session active */}
      {!isWorking && (
        <div className="text-center">
          <button
            type="button"
            onClick={handlePunchIn}
            className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 flex items-center mx-auto font-medium"
          >
            <Play className="mr-2" size={18} />
            Commencer nouvelle session
          </button>
        </div>
      )}

      {/* Modal édition manuelle */}
      {showManualEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">
              {editingIndex !== null ? 'Modifier session' : 'Ajouter session manuellement'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date de travail *
                </label>
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Heure début *
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
                  Heure fin
                </label>
                <input
                  type="time"
                  value={manualEnd}
                  onChange={(e) => setManualEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pause dîner (minutes)
                </label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={manualPause}
                  onChange={(e) => setManualPause(Math.min(120, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {manualStart && manualEnd && (
                <div className="bg-blue-50 p-3 rounded text-sm">
                  <strong>Aperçu:</strong> {formatDuration(toQuarterHourUp(manualStart, manualEnd, manualPause))}
                </div>
              )}
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
