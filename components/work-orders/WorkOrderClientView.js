'use client';

import { useState, useRef, useEffect } from 'react';
import { Check, Send, Wifi, WifiOff, X, FileText, User, Calendar, Clock, Mail } from 'lucide-react';
import { handleSignatureWithAutoSend } from '../../lib/services/client-signature.js';

export default function WorkOrderClientView({ workOrder, onStatusUpdate }) {
  const [signature, setSignature] = useState('');
  const [isSigning, setIsSigning] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [showSummary, setShowSummary] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  
  // ✅ NOUVEAU - États pour les signataires
  const [selectedSignatoryMode, setSelectedSignatoryMode] = useState('checkbox'); // 'checkbox' ou 'custom'
  const [selectedSignatoryIndex, setSelectedSignatoryIndex] = useState(null); // 1, 2, 3, 4, 5 ou null
  const [customSignerName, setCustomSignerName] = useState('');

  // Surveiller le statut de connexion
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Configuration du canvas pour signature
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }, [isSigning]);

  // ✅ NOUVEAU - Récupérer les signataires du client
  const getClientSignatories = () => {
    if (!workOrder?.client) return [];
    
    const signatories = [];
    for (let i = 1; i <= 5; i++) {
      const signatoryName = workOrder.client[`signatory_${i}`];
      if (signatoryName && signatoryName.trim()) {
        signatories.push({
          index: i,
          name: signatoryName.trim()
        });
      }
    }
    return signatories;
  };

  // ✅ NOUVEAU - Mettre à jour signerName quand la sélection change
  useEffect(() => {
    if (selectedSignatoryMode === 'checkbox' && selectedSignatoryIndex !== null) {
      const signatories = getClientSignatories();
      const selected = signatories.find(s => s.index === selectedSignatoryIndex);
      if (selected) {
        setSignerName(selected.name);
      }
    } else if (selectedSignatoryMode === 'custom') {
      setSignerName(customSignerName);
    }
  }, [selectedSignatoryMode, selectedSignatoryIndex, customSignerName, workOrder]);

  // ✅ NOUVEAU - Gérer la sélection d'un signataire
  const handleSignatorySelect = (index) => {
    setSelectedSignatoryMode('checkbox');
    setSelectedSignatoryIndex(index);
    setCustomSignerName(''); // Reset custom name
  };

  // ✅ NOUVEAU - Gérer la sélection "Autre"
  const handleCustomSelect = () => {
    setSelectedSignatoryMode('custom');
    setSelectedSignatoryIndex(null);
  };

  // Fonctions signature tactile
  const startDrawing = (e) => {
    e.preventDefault();
    setIsDrawing(true);
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e) => {
    e.preventDefault();
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    // Convertir canvas en base64
    const canvas = canvasRef.current;
    setSignature(canvas.toDataURL());
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignature('');
  };

 const handleAcceptWork = async () => {
  if (!signature) {
    alert('Signature requise pour accepter les travaux');
    return;
  }
  
  if (!signerName || signerName.trim().length < 2) {
    alert('Veuillez sélectionner un signataire ou entrer un nom (minimum 2 caractères)');
    return;
  }

  try {
    // Utiliser le nouveau service client (sans Resend côté client)
    const result = await handleSignatureWithAutoSend(
      workOrder.id, 
      signature, 
      signerName.trim()
    );
    
    if (result.success && result.signatureSaved) {
      setIsSigning(false);
      
       if (result.autoSendResult.success) {
        // ✅ Envoi automatique réussi - PAS d'alert, juste fermer
        onStatusUpdate?.('sent');
        
        // Fermer la fenêtre après 1 seconde
        setTimeout(() => {
          window.close();
        }, 1000);
        
      } else if (result.autoSendResult.needsManualSend) {
        // Signature OK mais envoi automatique impossible
        onStatusUpdate?.(result.workOrderStatus || 'pending_send');
        alert(`Travail signé avec succès. ${result.autoSendResult.reason}`);
        
      } else {
        // Erreur envoi automatique
        onStatusUpdate?.(result.workOrderStatus || 'pending_send');
        alert('Travail signé. Email sera envoyé manuellement depuis le bureau.');
      }
    } else {
      throw new Error(result.error || 'Erreur lors de la signature');
    }
    
  } catch (error) {
    console.error('Erreur signature:', error);
    alert(`Erreur lors de la signature: ${error.message}`);
  }
};

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('fr-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount || 0);
  };

        const calculateTotalHours = () => {
          if (!workOrder?.start_time || !workOrder?.end_time) return 0;
        
          // Parse "HH:MM" -> minutes, sans objet Date (aucun décalage TZ/secondes)
          const parseHHMM = (t) => {
            const [h, m] = String(t).split(':').map((n) => parseInt(n, 10) || 0);
            return h * 60 + m;
          };
        
          const startMin = parseHHMM(workOrder.start_time);
          const endMin   = parseHHMM(workOrder.end_time);
        
          // Durée nette en minutes
          const pause = parseInt(workOrder.pause_minutes, 10) || 0;
          let netMin = Math.max(0, endMin - startMin - pause);
        
          // Arrondi au quart d'heure supérieur (ceil)
          const roundedMin = Math.ceil(netMin / 15) * 15;
        
          // Retour en heures décimales (arrondi 2 décimales pour stockage/affichage)
          return Math.round((roundedMin / 60) * 100) / 100;
        };


  const calculateTotal = () => {
    return workOrder.materials?.reduce((total, material) => {
      const price = material.product?.selling_price || material.unit_price || 0;
      return total + (material.quantity * price);
    }, 0) || 0;
  };

  if (!workOrder) {
    return <div className="p-8 text-center">Chargement...</div>;
  }

  // ✅ AJOUTEZ CE DEBUG
console.log('🔍 DEBUG PRIX CLIENT:');
console.log('  - workOrder.materials:', workOrder.materials);
console.log('  - show_price values:', workOrder.materials?.map(m => ({
  code: m.product_code,
  show_price: m.show_price,
  type: typeof m.show_price
})));
console.log('  - some(show_price === true):', workOrder.materials?.some(m => m.show_price === true));

    console.log('Material prices debug:', workOrder.materials?.map(m => ({
    code: m.product?.product_id,
    selling_price: m.product?.selling_price,
    show_price: m.show_price,
    unit_price: m.unit_price
  })));
  console.log('Condition check:', workOrder.materials && workOrder.materials.some(m => m.product?.selling_price > 0));
  
  return (
    <div className="min-h-screen bg-white">
      {/* Header professionnel style TMT */}
      <div className="bg-white p-3 sm:p-6 print:bg-white">
        <div className="max-w-6xl mx-auto">
          {/* Layout responsive : 2 colonnes mobile, 3 desktop */}
          <div className="grid grid-cols-2 sm:grid-cols-3 items-start gap-3 sm:gap-6 pb-3 sm:pb-4">
            
            {/* Colonne 1: Logo */}
            <div className="flex items-center">
              <div className="w-40 h-24 flex items-center justify-center">
                <img 
                  src="/logo.png" 
                  alt="Logo Entreprise" 
                  className="w-full h-full object-contain"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </div>
            </div>
            
            {/* Colonne 2: Info Entreprise */}
            <div className="text-left text-xs sm:text-sm space-y-1">
              <h2 className="font-bold text-base sm:text-lg">Services TMT Inc.</h2>
              <p>3195 42e Rue Nord</p>
              <p>Saint-Georges, QC, G5Z 0V9</p>
              <p>(418) 225-3875</p>
              <p>info.servicestmt@gmail.com</p>
            </div>
            
            {/* Colonne 3: Infos BT (alignées à droite sur desktop) */}
            <div className="col-span-2 sm:col-span-1 text-left sm:text-right text-xs sm:text-sm space-y-1">
              <h1 className="text-base sm:text-lg font-bold">BON DE TRAVAIL</h1>
              <p className="font-semibold">{workOrder.bt_number}</p>
              <p>Date: {new Date(workOrder.work_date).toLocaleDateString('fr-CA')}</p>
              {workOrder.linked_po && (
                <p className="text-xs">BA Client: {workOrder.linked_po.po_number}</p>
              )}
            </div>
          </div>

          {/* Ligne de séparation */}
          <div className="border-b-2 border-gray-300 mb-4"></div>

          {/* Layout 2 colonnes desktop / 1 colonne mobile */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
            
            {/* INFORMATIONS CLIENT */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-blue-800 mb-3 flex items-center">
                <User className="mr-2" size={20} />
                Informations Client
              </h3>
              <div className="space-y-2 text-sm">
                {workOrder.client.name && (
                  <p className="font-semibold">{workOrder.client.name}</p>
                )}
                {workOrder.client.address && (
                  <p className="text-gray-700">{workOrder.client.address}</p>
                )}
                {workOrder.client.phone && (
                  <p className="text-gray-700">Tél: {workOrder.client.phone}</p>
                )}
              </div>
            </div>

            {/* HEURES TRAVAILLÉES */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-green-800 mb-3 flex items-center">
                <Clock className="mr-2" size={20} />
                Heures Travaillées
              </h3>
              
              {workOrder.time_entries && workOrder.time_entries.length > 0 ? (
                <div className="space-y-2">
                  {workOrder.time_entries.map((entry, index) => {
                    const hours = Math.floor(entry.total_hours || 0);
                    const minutes = Math.round(((entry.total_hours || 0) - hours) * 60);
                    const pauseDisplay = entry.pause_minutes > 0 ? ` (-${entry.pause_minutes}min)` : '';
                    
                    return (
                      <div key={index} className="text-sm bg-white p-2 rounded">
                        <p className="font-semibold">{new Date(entry.date).toLocaleDateString('fr-CA')}</p>
                        <p className="text-gray-700">
                          {entry.start_time} - {entry.end_time}{pauseDisplay}
                          <span className="font-semibold ml-2">
                            = {hours}h{minutes > 0 ? ` ${minutes}min` : ''}
                          </span>
                        </p>
                      </div>
                    );
                  })}
                  
                  {/* Total des heures */}
                  {workOrder.time_entries.length > 1 && (
                    <div className="bg-green-100 p-2 rounded mt-3">
                      {(() => {
                        const grandTotal = workOrder.time_entries.reduce((sum, e) => sum + (e.total_hours || 0), 0);
                        const totalH = Math.floor(grandTotal);
                        const totalM = Math.round((grandTotal - totalH) * 60);
                        return (
                          <p className="font-bold text-green-800">
                            TOTAL: {totalH}h{totalM > 0 ? ` ${totalM}min` : ''}
                          </p>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">Aucune entrée de temps</p>
              )}
            </div>
          </div>

          {/* DESCRIPTION DES TRAVAUX */}
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-semibold text-orange-800 mb-3 flex items-center">
              <FileText className="mr-2" size={20} />
              Description des Travaux
            </h3>
            {workOrder.work_description ? (
              <p className="text-gray-800 whitespace-pre-wrap">{workOrder.work_description}</p>
            ) : (
              <p className="text-gray-500 italic">Aucune description</p>
            )}
          </div>

        {/* MATÉRIAUX / ÉQUIPEMENT */}
        {workOrder.materials && workOrder.materials.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">
              Matériaux et Équipement
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full border border-gray-300 text-sm">
                <thead className="bg-gray-100 border-b border-gray-300">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Code</th>
                    <th className="px-4 py-2 text-left font-semibold">Description</th>
                    <th className="px-4 py-2 text-center font-semibold">Qté</th>
                    <th className="px-4 py-2 text-center font-semibold">Unité</th>
                    {(workOrder.materials && workOrder.materials.some(m => m.show_price === true)) && (
                      <>
                        <th className="px-4 py-2 text-right font-semibold">Prix Unit.</th>
                        <th className="px-4 py-2 text-right font-semibold">Total</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {workOrder.materials.map((material, index) => (
                    <tr key={index} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">
                        {material.product?.product_id || material.product_code}
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium">
                            {material.product?.product_name || material.description}
                          </p>
                          {material.notes && (
                            <p className="text-xs text-gray-600 mt-1 italic">
                              {material.notes}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold">{material.quantity}</td>
                      <td className="px-4 py-3 text-center">
                        {material.unit || material.product?.unit || 'UN'}
                      </td>
                      {(workOrder.materials && workOrder.materials.some(m => m.show_price === true)) && (
                        <>
                          <td className="px-4 py-3 text-right">
                            {material.show_price ? 
                              formatCurrency(material.product?.selling_price || material.unit_price || 0) : 
                              ''
                            }
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {material.show_price ? 
                              formatCurrency(material.quantity * (material.product?.selling_price || material.unit_price || 0)) : 
                              ''
                            }
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
                {(workOrder.materials && workOrder.materials.some(m => m.show_price === true)) && (
                  <tfoot className="bg-gray-50 border-t-2">
                    <tr>
                      <td colSpan="4" className="px-4 py-3 text-right font-bold">
                        Total:
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-lg">
                        {formatCurrency(calculateTotal())}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* Zone de signature */}
        {workOrder.status === 'ready_for_signature' && (
          <div className="border-2 border-orange-200 rounded-lg p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-orange-700">
                Signature du Client - Acceptation des Travaux
              </h2>
              <button
                onClick={() => {
                  // Fermer cet onglet et retourner au formulaire principal
                  window.close();
                  // Si ça ne ferme pas (popup bloqué), rediriger
                  setTimeout(() => {
                    window.location.href = `/bons-travail`;
                  }, 100);
                }}
                className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 flex items-center"
              >
                ← Fermer
              </button>
            </div>
            
            {!isSigning ? (
              <div className="text-center">
                <p className="text-gray-600 mb-6 text-lg">
                  En signant ci-dessous, vous confirmez que les travaux ont été réalisés à votre satisfaction.
                </p>
                <button
                  onClick={() => setIsSigning(true)}
                  className="bg-green-600 text-white px-8 py-4 rounded-lg hover:bg-green-700 text-xl font-semibold"
                >
                  <Check className="inline mr-2" size={24} />
                  Accepter et Signer
                </button>
              </div>
            ) : (
              <div>
                {/* ✅ NOUVEAU - Sélection du signataire */}
                <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <label className="block text-sm font-semibold text-blue-800 mb-3">
                    Qui signe ce formulaire? *
                  </label>
                  
                  {/* Checkboxes pour les signataires */}
                  {(() => {
                    const signatories = getClientSignatories();
                    
                    if (signatories.length === 0) {
                      // Aucun signataire configuré - afficher seulement le champ texte
                      return (
                        <div className="bg-white border-2 border-gray-300 rounded-lg p-3">
                          <label className="flex items-start cursor-pointer">
                            <input
                              type="radio"
                              name="signatory"
                              checked={true}
                              onChange={() => {}}
                              className="mt-1 mr-3 w-5 h-5"
                            />
                            <div className="flex-1">
                              <span className="font-medium text-gray-700 block mb-2">Entrer le nom:</span>
                              <input
                                type="text"
                                value={customSignerName}
                                onChange={(e) => {
                                  setCustomSignerName(e.target.value);
                                  setSelectedSignatoryMode('custom');
                                }}
                                placeholder="Ex: Jean Tremblay"
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                maxLength={50}
                              />
                            </div>
                          </label>
                        </div>
                      );
                    }
                    
                    // Signataires disponibles - afficher les options
                    return (
                      <div className="space-y-2">
                        {signatories.map((signatory) => (
                          <div key={signatory.index} className="bg-white border-2 border-gray-300 rounded-lg p-3 hover:border-blue-400 transition-colors">
                            <label className="flex items-center cursor-pointer">
                              <input
                                type="radio"
                                name="signatory"
                                checked={selectedSignatoryMode === 'checkbox' && selectedSignatoryIndex === signatory.index}
                                onChange={() => handleSignatorySelect(signatory.index)}
                                className="mr-3 w-5 h-5 cursor-pointer"
                              />
                              <span className="text-lg font-medium text-gray-800">{signatory.name}</span>
                            </label>
                          </div>
                        ))}
                        
                        {/* Option "Autre" */}
                        <div className="bg-white border-2 border-gray-300 rounded-lg p-3 hover:border-blue-400 transition-colors">
                          <label className="flex items-start cursor-pointer">
                            <input
                              type="radio"
                              name="signatory"
                              checked={selectedSignatoryMode === 'custom'}
                              onChange={handleCustomSelect}
                              className="mt-1 mr-3 w-5 h-5 cursor-pointer"
                            />
                            <div className="flex-1">
                              <span className="font-medium text-gray-700 block mb-2">Autre (entrer le nom):</span>
                              <input
                                type="text"
                                value={customSignerName}
                                onChange={(e) => {
                                  setCustomSignerName(e.target.value);
                                  handleCustomSelect();
                                }}
                                onFocus={handleCustomSelect}
                                placeholder="Ex: Jean Tremblay"
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                maxLength={50}
                              />
                            </div>
                          </label>
                        </div>
                      </div>
                    );
                  })()}
                  
                  {/* Aperçu du nom sélectionné */}
                  {signerName && (
                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded">
                      <p className="text-sm text-green-800">
                        <span className="font-semibold">Signataire:</span> {signerName}
                      </p>
                    </div>
                  )}
                </div>
                
                <p className="text-sm text-gray-600 mb-2">
                  Veuillez signer dans l'espace ci-dessous avec votre doigt ou stylet:
                </p>
                <div className="border-2 border-gray-300 rounded-lg bg-white mb-4">
                  <canvas
                    ref={canvasRef}
                    width={800}
                    height={200}
                    className="w-full h-48 cursor-crosshair touch-none"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                </div>
                
                <div className="flex justify-between">
                  <button
                    onClick={clearSignature}
                    className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600"
                  >
                    <X className="inline mr-1" size={16} />
                    Effacer
                  </button>
                  
                  <div className="space-x-2">
                    <button
                      onClick={() => setIsSigning(false)}
                      className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleAcceptWork}
                      disabled={!signature || !signerName}
                      className={`px-6 py-2 rounded-lg font-semibold ${
                        signature && signerName
                          ? 'bg-green-600 text-white hover:bg-green-700' 
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      <Check className="inline mr-2" size={16} />
                      Confirmer Signature
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Travaux signés - bouton d'envoi */}
        {workOrder.status === 'signed' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-green-800 mb-2">
                  ✅ Travaux Acceptés et Signés
                </h3>
                <p className="text-green-700">
                  Signé le {new Date(workOrder.signed_at).toLocaleString('fr-CA')}
                </p>
                <p className="text-sm text-green-600 mt-1">
                  Email envoyé automatiquement au client
                </p>
              </div>
              <button
                onClick={() => window.close()}
                className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
              >
                Fermer
              </button>
            </div>
          </div>
        )}

        {/* Statut d'attente envoi */}
       {workOrder.status === 'pending_send' && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-6 mb-6">
            <h3 className="text-lg font-semibold text-orange-800 mb-2">
              ⏳ En Attente d'Envoi
            </h3>
            <p className="text-orange-700 mb-3">
              Travaux signés - Envoi automatique en cours de traitement par le système
            </p>
            <p className="text-sm text-orange-600">
              L'email sera envoyé automatiquement depuis le bureau
            </p>
          </div>
        )}

        {/* Travaux envoyés */}
        {workOrder.status === 'sent' && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-6 mb-6 text-center">
            <h3 className="text-lg font-semibold text-orange-800 mb-2">
              📧 Bon de Travail Envoyé avec Succès
            </h3>
            <p className="text-orange-700">
              Envoyé le {workOrder.sent_at ? new Date(workOrder.sent_at).toLocaleString('fr-CA') : 'maintenant'}
            </p>
            <button
              onClick={() => window.close()}
              className="mt-3 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
            >
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
