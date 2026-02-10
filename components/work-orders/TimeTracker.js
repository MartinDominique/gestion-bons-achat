import React, { useState, useEffect,useRef } from 'react';
import { Play, Square, Clock, Edit, Save, Plus, Trash2, Calendar } from 'lucide-react';

export default function TimeTracker({ 
  onTimeChange, 
  initialTimeEntries = [],
  workDate = null,
  status = 'draft',
  selectedClient = null
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
  let netMinutes = Math.max(0, e - s - (parseInt(pauseMinutes, 10) || 0));
  
  if (netMinutes < 60) {
    return 1.0;
  }
  
  const hours = Math.floor(netMinutes / 60);
  const minutes = netMinutes % 60;
  
  let roundedMinutes;
  
  if (minutes <= 6) {
    roundedMinutes = 0;
  } else if (minutes <= 21) {
    roundedMinutes = 15;
  } else if (minutes <= 36) {
    roundedMinutes = 30;
  } else if (minutes <= 51) {
    roundedMinutes = 45;
  } else {
    return hours + 1;
  }
  
  const totalMinutes = (hours * 60) + roundedMinutes;
  return Math.round((totalMinutes / 60) * 100) / 100;
};

  // Arrondir un nombre d'heures au quart d'heure supérieur
  const roundToQuarterHour = (hours) => {
    const totalMinutes = hours * 60;
    const roundedMinutes = Math.ceil(totalMinutes / 15) * 15;
    return roundedMinutes / 60;
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
  if (!isInitialized) {
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

useEffect(() => {
  // Créer une signature unique des données reçues
  const entriesSignature = JSON.stringify(initialTimeEntries);
  
  console.log('🚀 TimeTracker useEffect DÉCLENCHÉ', {
    hasEntries: initialTimeEntries?.length > 0,
    entriesCount: initialTimeEntries?.length,
    isInitialized: isInitialized,
    processedBefore: processedEntriesRef.current === entriesSignature
  });
  
  // ⭐ CRITIQUE : Ne traiter que si les données ont VRAIMENT changé
  if (processedEntriesRef.current === entriesSignature) {
    console.log('⏭️ Mêmes données déjà traitées, skip');
    return;
  }
  
  if (initialTimeEntries && initialTimeEntries.length > 0) {
    console.log('🔄 Initialisation TimeTracker avec:', initialTimeEntries);
    
    // Chercher une session en cours (par INDEX, pas par référence)
    const sessionInProgressIndex = initialTimeEntries.findIndex(
      entry => !entry.end_time || entry.in_progress
    );
    
    if (sessionInProgressIndex !== -1) {
      const sessionInProgress = initialTimeEntries[sessionInProgressIndex];
      console.log('⏰ Session en cours détectée à index', sessionInProgressIndex, ':', sessionInProgress);
      
      // ✅ FIX: Filtrer par INDEX au lieu de référence d'objet
      const completedSessions = initialTimeEntries.filter(
        (entry, index) => index !== sessionInProgressIndex
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
      console.log('✅ Sessions complétées:', completedSessions.length);
    } else {
      // Toutes les sessions sont complétées
      console.log('📋 Toutes les sessions sont complétées:', initialTimeEntries.length);
      setTimeEntries(initialTimeEntries);
    }
    
    // ⭐ Marquer ces données comme traitées
    processedEntriesRef.current = entriesSignature;
    setIsInitialized(true);
  } else if (initialTimeEntries && initialTimeEntries.length === 0 && !isInitialized) {
    // Tableau vide explicite - seulement si pas encore initialisé
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
  const handlePunchIn = async () => {
    if (status === 'sent' || status === 'signed') {
      alert('❌ Impossible d\'ajouter une session.\nCe bon de travail a déjà été envoyé au client.');
      return;
    }

    // Vérifier s'il y a déjà une session en cours ailleurs
    try {
      const response = await fetch('/api/check-active-session');
      const { hasActiveSession, activeSession } = await response.json();
      
      if (hasActiveSession) {
        alert(`❌ Impossible de commencer une nouvelle session.\n\nUne session est déjà en cours:\n• Client: ${activeSession.client_name}\n• BT: ${activeSession.bt_number}\n• Début: ${activeSession.start_time}\n\nTerminez cette session avant d'en commencer une nouvelle.`);
        return;
      }
    } catch (error) {
      console.error('Erreur vérification session active:', error);
      // En cas d'erreur, on laisse continuer pour ne pas bloquer
    }

    const now = new Date();
    
    const newSession = {
      date: now.toISOString().split('T')[0],  // ✅ Toujours la date du jour
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
      if (status === 'sent' || status === 'signed') {
    alert('❌ Impossible de terminer cette session.\nCe bon de travail a déjà été envoyé au client.');
    return;
  }
      
      const now = new Date();
      const endTime = now.toTimeString().substring(0, 5);
      
      // Calculer les heures de session (sans voyage)
      const sessionHours = toQuarterHourUp(
        currentSession.start_time, 
        endTime, 
        currentSession.pause_minutes
      );
      
      // Par défaut, inclure le voyage si le client a travel_minutes
      const includeTravel = selectedClient?.travel_minutes > 0;
      const travelHours = includeTravel ? (selectedClient.travel_minutes / 60) : 0;
      const totalHours = roundToQuarterHour(sessionHours + travelHours);
      
      const completedSession = {
        date: currentSession.date,
        start_time: currentSession.start_time,
        end_time: endTime,
        pause_minutes: currentSession.pause_minutes,
        total_hours: totalHours,
        include_travel: includeTravel,
        include_transport_fee: true,
        in_progress: false
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
    if (status === 'sent' || status === 'signed') {
    alert('❌ Impossible d\'ajouter une session.\nCe bon de travail a déjà été envoyé au client.');
    return;
  }
    setEditingIndex(null);
    setManualDate(new Date().toISOString().split('T')[0]);  // ✅ Toujours la date du jour
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

    // Calculer les heures de session (sans voyage)
    const sessionHours = manualEnd ? 
      toQuarterHourUp(manualStart, manualEnd, manualPause) : 0;
    
    // Par défaut, inclure le voyage si le client a travel_minutes
    const includeTravel = selectedClient?.travel_minutes > 0;
    const travelHours = includeTravel ? (selectedClient.travel_minutes / 60) : 0;
    const totalHours = roundToQuarterHour(sessionHours + travelHours);

    const session = {
      date: manualDate,
      start_time: manualStart,
      end_time: manualEnd || null,
      pause_minutes: parseInt(manualPause) || 0,
      total_hours: totalHours,
      include_travel: includeTravel,
      include_transport_fee: true,
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
          disabled={status === 'sent' || status === 'signed'}  // ⭐ NOUVEAU
          className={`text-sm px-3 py-1 rounded flex items-center ${
            status === 'sent' || status === 'signed'
              ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
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
                disabled={status === 'sent' || status === 'signed'}  // ⭐ NOUVEAU
                className={`w-full text-center font-mono font-bold text-orange-700 border-2 rounded px-2 py-1 ${
                  status === 'sent' || status === 'signed' 
                    ? 'border-gray-300 bg-gray-100 cursor-not-allowed' 
                    : 'border-orange-300'
                }`}
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
            className={`border rounded-lg p-3 ${
              entry.in_progress 
                ? 'bg-green-50 border-green-500 border-2' 
                : 'bg-white border-gray-300'
            }`}
          >
            {/* VERSION MOBILE */}
            <div className="md:hidden space-y-2">
              {/* Ligne 1: Date + Badge en cours */}
              <div className="flex items-center justify-between">
                <div className="flex items-center font-semibold">
                  <Calendar size={14} className="mr-1 text-blue-600" />
                  {entry.date}
                </div>
                {entry.in_progress && (
                  <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded-full">
                    EN COURS
                  </span>
                )}
              </div>
              
              {/* Ligne 2: Début - Fin - Pause */}
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-green-700">{entry.start_time}</span>
                  <span className="text-gray-400">→</span>
                  <span className="font-mono font-bold text-red-700">
                    {entry.end_time || (entry.in_progress ? '⏱️' : '--:--')}
                  </span>
                </div>
                <span className="text-orange-700 text-xs">Pause: {entry.pause_minutes || 0}min</span>
              </div>
              
              {/* Ligne 3: Total + Checkboxes + Actions */}
              <div className="flex items-center justify-between">
                <div className={`font-bold ${entry.in_progress ? 'text-green-700' : 'text-blue-700'}`}>
                  {formatDuration(entry.total_hours || 0)}
                  {entry.in_progress && ' ⏱️'}
                </div>
                
                <div className="flex items-center gap-3">
                  {/* Checkbox Retour */}
                  {!entry.in_progress && selectedClient?.travel_minutes > 0 && (
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={entry.include_travel || false}
                        onChange={(e) => {
                          const newEntries = [...timeEntries];
                          const sessionHours = toQuarterHourUp(entry.start_time, entry.end_time, entry.pause_minutes);
                          const travelHours = e.target.checked ? (selectedClient.travel_minutes / 60) : 0;
                          newEntries[index] = {
                            ...entry,
                            include_travel: e.target.checked,
                            total_hours: roundToQuarterHour(sessionHours + travelHours)
                          };
                          setTimeEntries(newEntries);
                        }}
                        className="mr-1 h-4 w-4 text-orange-600"
                      />
                      <span className="text-xs text-orange-600">{selectedClient.travel_minutes}m</span>
                    </label>
                  )}
                  
                  {/* Checkbox Transport */}
                  {!entry.in_progress && (
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={entry.include_transport_fee ?? true}
                        onChange={(e) => {
                          const newEntries = [...timeEntries];
                          newEntries[index] = { ...entry, include_transport_fee: e.target.checked };
                          setTimeEntries(newEntries);
                        }}
                        className="mr-1 h-4 w-4 text-green-600"
                      />
                      <span className="text-xs">🚗</span>
                    </label>
                  )}
                  
                  {/* Actions */}
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleEditSession(index)}
                      disabled={entry.in_progress}
                      className={`p-1 ${entry.in_progress ? 'text-gray-400 opacity-50' : 'text-blue-600'}`}
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSession(index)}
                      disabled={entry.in_progress}
                      className={`p-1 ${entry.in_progress ? 'text-gray-400 opacity-50' : 'text-red-600'}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
        
            {/* VERSION DESKTOP */}
            <div className="hidden md:flex items-center justify-between">
              <div className="flex-1 grid grid-cols-6 gap-2 text-sm">
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
                <div>
                  <div className="text-xs text-gray-500">Retour</div>
                  {!entry.in_progress && selectedClient?.travel_minutes > 0 ? (
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={entry.include_travel || false}
                        onChange={(e) => {
                          const newEntries = [...timeEntries];
                          const sessionHours = toQuarterHourUp(entry.start_time, entry.end_time, entry.pause_minutes);
                          const travelHours = e.target.checked ? (selectedClient.travel_minutes / 60) : 0;
                          newEntries[index] = {
                            ...entry,
                            include_travel: e.target.checked,
                            total_hours: roundToQuarterHour(sessionHours + travelHours)
                          };
                          setTimeEntries(newEntries);
                        }}
                        className="mr-1 h-4 w-4 text-orange-600"
                      />
                      <span className="text-xs text-orange-600">{selectedClient.travel_minutes}min</span>
                    </label>
                  ) : (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </div>
              </div>
        
              {/* Colonne: Frais transport */}
              <div className="ml-2">
                <div className="text-xs text-gray-500">Transport</div>
                {!entry.in_progress ? (
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={entry.include_transport_fee ?? true}
                      onChange={(e) => {
                        const newEntries = [...timeEntries];
                        newEntries[index] = { ...entry, include_transport_fee: e.target.checked };
                        setTimeEntries(newEntries);
                      }}
                      className="mr-1 h-4 w-4 text-green-600"
                    />
                    <span className="text-xs text-green-600">🚗</span>
                  </label>
                ) : (
                  <span className="text-xs text-gray-400">-</span>
                )}
              </div>
                  
              <div className="flex gap-2 ml-3">
                <button
                  type="button"
                  onClick={() => handleEditSession(index)}
                  disabled={entry.in_progress}
                  className={`p-1 ${entry.in_progress ? 'text-gray-400 cursor-not-allowed opacity-50' : 'text-blue-600 hover:text-blue-800'}`}
                  title={entry.in_progress ? 'Session en cours - terminez d\'abord' : 'Modifier'}
                >
                  <Edit size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSession(index)}
                  disabled={entry.in_progress}
                  className={`p-1 ${entry.in_progress ? 'text-gray-400 cursor-not-allowed opacity-50' : 'text-red-600 hover:text-red-800'}`}
                  title={entry.in_progress ? 'Session en cours - terminez d\'abord' : 'Supprimer'}
                >
                  <Trash2 size={16} />
                </button>
              </div>
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
            {/* ⭐ NOUVEAU - Message si verrouillé */}
            {(status === 'sent' || status === 'signed') && (
              <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-4">
                <p className="text-sm text-yellow-800">
                  🔒 <strong>Bon de travail verrouillé</strong>
                </p>
                <p className="text-xs text-yellow-700 mt-1">
                  Ce BT a été envoyé au client. Vous ne pouvez plus ajouter de sessions.
                </p>
              </div>
            )}
            
            <button
              type="button"
              onClick={handlePunchIn}
              disabled={status === 'sent' || status === 'signed'}  // ⭐ NOUVEAU
              className={`px-6 py-3 rounded-lg flex items-center mx-auto font-medium ${
                status === 'sent' || status === 'signed'
                  ? 'bg-gray-400 cursor-not-allowed text-gray-700'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
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
