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
  const [isSubmitting, setIsSubmitting] = useState(false);
  
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
      // 🆕 Empêcher les clics multiples
      if (isSubmitting) {
        return;
      }
    
      if (!signature) {
        alert('Signature requise pour accepter les travaux');
        return;
      }
      
      if (!signerName || signerName.trim().length < 2) {
        alert('Veuillez sélectionner un signataire ou entrer un nom (minimum 2 caractères)');
        return;
      }
    
      try {
        setIsSubmitting(true); // 🆕 Désactiver le bouton
        
        const result = await handleSignatureWithAutoSend(
          workOrder.id, 
          signature, 
          signerName.trim()
        );
        
        console.log('🔍 RÉSULTAT SIGNATURE:', result);
        
        if (result.success && result.signatureSaved) {
          setIsSigning(false);
          
          if (result.autoSendResult?.success && result.workOrderStatus === 'sent') {
            console.log('✅ Email envoyé et statut confirmé à "sent" - Fermeture');
            
            onStatusUpdate?.('sent');
            
            setTimeout(() => {
              window.close();
            }, 500);
            
          } else if (result.autoSendResult.needsManualSend) {
            onStatusUpdate?.(result.workOrderStatus || 'pending_send');
            alert(`Travail signé avec succès. ${result.autoSendResult.reason}`);
            setIsSubmitting(false); // 🆕 Réactiver si on ne ferme pas
            
          } else {
            onStatusUpdate?.(result.workOrderStatus || 'pending_send');
            alert('Travail signé. Email sera envoyé manuellement depuis le bureau.');
            setIsSubmitting(false); // 🆕 Réactiver si on ne ferme pas
          }
        } else {
          throw new Error(result.error || 'Erreur lors de la signature');
        }
        
       } catch (error) {
        console.error('Erreur signature:', error);
        
        // 🆕 Message plus clair pour problème de connexion
        if (error.message === 'Failed to fetch' || !navigator.onLine) {
          alert('❌ Erreur de connexion\n\nVérifiez votre connexion internet et réessayez.');
        } else {
          alert(`Erreur lors de la signature: ${error.message}`);
        }
        
        setIsSubmitting(false);
      }
    };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('fr-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount || 0);
  };

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


  const calculateTotal = () => {
    return workOrder.materials?.reduce((total, material) => {
      const price = material.product?.selling_price || material.unit_price || 0;
      return total + (material.quantity * price);
    }, 0) || 0;
  };

  if (!workOrder) {
    return <div className="p-8 text-center">Chargement...</div>;
  }

 // ✅ DEBUG complet
  console.log('🔍 DEBUG PRIX JOBÉ:');
  console.log('  - workOrder.is_prix_jobe:', workOrder.is_prix_jobe);
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
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'block';
                  }}
                />
                <div className="text-2xl font-bold text-gray-800 hidden">
                  LOGO
                </div>
              </div>
            </div>

            {/* Colonne 2: Informations Entreprise - Masqué sur mobile */}
            <div className="hidden sm:flex flex-col items-start">
              <h1 className="text-xl font-bold text-gray-900 mb-2">Services TMT Inc.</h1>
              <div className="text-sm text-gray-700 space-y-0.5">
                <p>3195, 42e Rue Nord</p>
                <p>Saint-Georges, QC G5Z 0V9</p>
                <p>Tél: (418) 225-3875</p>
                <p>info.servicestmt@gmail.com</p>
              </div>
            </div>
         
            {/* Colonne 3: Information Document */}
            <div className="text-right">
              <h2 className="text-base sm:text-xl font-bold text-gray-900 mb-1 sm:mb-2">BON DE TRAVAIL</h2>
              <div className="text-xs sm:text-sm text-gray-700 space-y-0.5 sm:space-y-1">
                <p><strong>N°:</strong> {workOrder.bt_number || `BT-2025-${String(workOrder.id).padStart(3, '0')}`}</p>
                <p><strong>Date:</strong> {workOrder.work_date}</p>
                <div className="flex items-center justify-end mt-2">
                  {isOnline ? (
                    <>
                      <Wifi size={14} className="mr-1 text-green-600" />
                      <span className="text-xs text-green-600">En ligne</span>
                    </>
                  ) : (
                    <>
                      <WifiOff size={14} className="mr-1 text-red-600" />
                      <span className="text-xs text-red-600">Hors ligne</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Ligne de séparation */}
          <div className="border-t-2 border-gray-900"></div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        {/* Informations client - Ultra-compact */}
        <div className="bg-gray-50 rounded-lg p-3 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-base sm:text-xl font-semibold mb-2 sm:mb-4 flex items-center">
            <User className="mr-2" size={20} />
            Informations Client
          </h2>
          
          {/* ⭐ NOUVEAU - Infos client ultra-compactes sur 1 ligne */}
          <div className="bg-white rounded-lg p-3 mb-4 border border-gray-300">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              {/* Nom en gras */}
              <div className="font-bold text-gray-900">
                {workOrder.client?.name || 'Client inconnu'}
              </div>
              
              {/* Séparateur vertical */}
              <div className="hidden sm:block text-gray-300">|</div>
              
              {/* Adresse complète */}
              {workOrder.client?.address && (
                <>
                  <div className="text-gray-700">
                    {workOrder.client.address}
                  </div>
                  <div className="hidden sm:block text-gray-300">|</div>
                </>
              )}
              
              {/* Téléphone sans label */}
              {workOrder.client?.phone && (
                <>
                  <div className="text-gray-700 font-medium">
                    {workOrder.client.phone}
                  </div>
                  <div className="hidden sm:block text-gray-300">|</div>
                </>
              )}
              
              {/* BA client si présent */}
              {(workOrder.linked_po?.po_number || workOrder.linked_po_id) && (
                <div className="text-blue-700 font-medium">
                  BA: {workOrder.linked_po?.po_number || workOrder.linked_po_id}
                </div>
              )}
            </div>
          </div>
        
          {/* ⭐ Sessions de travail - Séparées et bien visibles */}
          {!workOrder.is_prix_jobe && (
          <div>
            <h3 className="text-lg font-semibold text-black mb-2">Sessions de travail:</h3>
            {workOrder.time_entries && workOrder.time_entries.length > 0 ? (
              <div className="space-y-1">
                {workOrder.time_entries.map((entry, index) => (
                  <div key={index} className="text-sm bg-white p-2 rounded border">
                    <span className="font-semibold">{entry.date}</span>: {entry.start_time} → {entry.end_time || 'En cours'}
                    {entry.pause_minutes > 0 && <span className="text-orange-600 ml-2">(Pause: {entry.pause_minutes}min)</span>}
                    <span className="font-bold text-blue-700 ml-2">
                      {(() => {
                        const h = Math.floor(entry.total_hours || 0);
                        const m = Math.round(((entry.total_hours || 0) - h) * 60);
                        return m > 0 ? `${h}h ${m}min` : `${h}h`;
                      })()}
                    </span>
                    {entry.end_time && entry.include_travel && workOrder.client?.travel_minutes > 0 && (
                      <span className="text-orange-600 ml-2">(Retour: {workOrder.client.travel_minutes}min)</span>
                    )}
                  </div>
                ))}
               <div className="text-sm font-bold text-blue-900 pt-2 border-t mt-2">
                  TOTAL: {(() => {
                    const total = workOrder.total_hours || 0;
                    const h = Math.floor(total);
                    const m = Math.round((total - h) * 60);
                    return m > 0 ? `${h}h ${m}min` : `${h}h`;
                  })()}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Aucune session enregistrée</p>
            )}
          </div>
          )}
        </div>
         {/* Emails destinataires - NOUVEAU */}
          {workOrder.recipient_emails && workOrder.recipient_emails.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
              <h3 className="text-sm font-semibold text-blue-900 mb-2 flex items-center">
                <Mail className="mr-2" size={16} />
                Email(s) destinataire(s) du bon de travail
              </h3>
              <div className="space-y-1">
                {workOrder.recipient_emails.map((email, index) => (
                  <div key={index} className="text-sm text-blue-800 flex items-center">
                    <span className="inline-block w-2 h-2 bg-blue-600 rounded-full mr-2"></span>
                    {email}
                  </div>
                ))}
              </div>
              <p className="text-xs text-blue-600 mt-2">
                {workOrder.recipient_emails.length} email(s) recevront ce bon de travail une fois signé
              </p>
            </div>
          )}      

        {/* Description des travaux */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <FileText className="mr-2" size={24} />
            Description des Travaux
          </h2>
          <div className="bg-white border rounded-lg p-6">
            <div className="text-gray-800 leading-relaxed whitespace-pre-line">
              {workOrder.description || workOrder.work_description || 'Aucune description disponible'}
            </div>
          </div>
        </div>

        {/* Matériaux utilisés - Format carte sur mobile */}
        {!workOrder.is_prix_jobe && workOrder.materials && workOrder.materials.length > 0 && (
          <div className="mb-4 sm:mb-6">
            <h2 className="text-base sm:text-xl font-semibold mb-2 sm:mb-4">Matériaux Utilisés</h2>
            
            {/* Version MOBILE - Cartes compactes */}
            <div className="md:hidden bg-white border rounded-lg divide-y">
              {workOrder.materials.map((material, index) => (
                <div key={index} className="p-3">
                  {/* Ligne 1: Code + Quantité */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                      {material.product?.product_id || material.product_id || 'N/A'}
                    </span>
                    <span className="text-sm font-bold text-gray-900">
                      Qté: {material.quantity} {material.unit || material.product?.unit || 'UN'}
                    </span>
                  </div>
                  
                  {/* Ligne 2: Description */}
                  <p className="text-sm text-gray-700 mb-1">
                    {material.product?.description || material.description || 'Sans description'}
                  </p>
                  
                  {/* Notes si présentes */}
                  {material.notes && (
                    <p className="text-xs text-gray-900 mt-1">
                      {material.notes}
                    </p>
                  )}
                  
                  {/* Prix si affichés */}
                  {material.show_price && (material.product?.selling_price || material.unit_price) && (
                    <div className="flex justify-between items-center mt-2 pt-2 border-t text-xs">
                      <span className="text-gray-600">
                        Prix unit.: {formatCurrency(material.product?.selling_price || material.unit_price || 0)}
                      </span>
                      <span className="font-bold text-green-700">
                        Total: {formatCurrency(material.quantity * (material.product?.selling_price || material.unit_price || 0))}
                      </span>
                    </div>
                  )}
                </div>
              ))}
              
              {/* Total si prix affichés */}
              {workOrder.materials.some(m => m.show_price === true) && (
                <div className="p-3 bg-green-50 border-t-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-green-900">Total matériaux:</span>
                    <span className="text-lg font-bold text-green-900">
                      {formatCurrency(calculateTotal())}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Version DESKTOP - Tableau */}
            <div className="hidden md:block bg-white border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">Code</th>
                    <th className="px-4 py-3 text-left">Matériau / Description</th>
                    <th className="px-4 py-3 text-center">Quantité</th>
                    <th className="px-4 py-3 text-center">Unité</th>
                   {(workOrder.materials && workOrder.materials.some(m => m.show_price === true)) && (
                      <>
                        <th className="px-4 py-3 text-right">Prix Unit.</th>
                        <th className="px-4 py-3 text-right">Total</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {workOrder.materials.map((material, index) => (
                    <tr key={index} className="border-t">
                      <td className="px-4 py-3 font-mono text-sm font-bold">
                        {material.product?.product_id || material.product_id || 'N/A'}
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-semibold">
                            {material.product?.product_id || material.product_id || 'Matériau sans code'}
                          </p>
                          {(material.product?.description || material.description) && (
                            <p className="text-sm text-gray-600 mt-1">
                              {material.product?.description || material.description}
                            </p>
                          )}
                          {material.notes && (
                            <p className="text-sm text-gray-900 mt-1">
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

        {/* Zone de signature - MODAL */}
        {workOrder.status === 'ready_for_signature' && (
          <>
            {!isSigning ? (
              <>
                {/* 🎯 BARRE DE BOUTONS FIXÉE EN BAS - TOUJOURS VISIBLE */}
                <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-r from-orange-50 to-yellow-50 border-t-4 border-orange-400 shadow-2xl z-40 p-3">
                  <div className="max-w-6xl mx-auto">
                    {/* Texte explicatif compact */}
                    <p className="text-orange-800 text-sm font-semibold mb-2 text-center">
                      ✓ Vérifiez tous les détails ci-dessus puis signez pour accepter les travaux
                    </p>
                    
                    {/* Boutons */}
                    <div className="flex flex-col sm:flex-row gap-2">
                      {/* Bouton Fermer */}
                      <button
                        onClick={() => {
                          window.close();
                          setTimeout(() => {
                            window.location.href = `/bons-travail`;
                          }, 100);
                        }}
                        className="flex-1 bg-gray-500 text-white px-6 py-3 rounded-lg hover:bg-gray-600 transition-all font-bold text-base flex items-center justify-center shadow-lg"
                      >
                        <X className="mr-2" size={20} />
                        Fermer
                      </button>
                      
                      {/* Bouton Accepter et Signer */}
                      <button
                        onClick={() => setIsSigning(true)}
                        className="flex-1 bg-gradient-to-r from-green-600 to-green-700 text-white px-8 py-3 rounded-lg hover:from-green-700 hover:to-green-800 transition-all font-bold text-base flex items-center justify-center shadow-xl border-2 border-green-500"
                      >
                        <Check className="mr-2" size={20} />
                        Accepter et Signer
                      </button>
                    </div>
                  </div>
                </div>
                
                {/* Espacement en bas pour éviter que le contenu soit caché par la barre fixe */}
                <div className="h-32"></div>
              </>
            ) : (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
                  <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl my-8">
                    {/* Header du modal */}
                    <div className="bg-gradient-to-r from-green-500 to-teal-600 text-white px-6 py-4 rounded-t-xl">
                      <h3 className="text-xl font-bold">Signature du Client - Acceptation des Travaux</h3>
                      <p className="text-green-50 text-sm mt-1">Veuillez signer ci-dessous pour accepter les travaux</p>
                    </div>
          
                    {/* Contenu du modal */}
                    <div className="p-6 space-y-6">
                      {/* Sélection du signataire */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-3">
                          Qui signe ce formulaire? *
                        </label>
                        
                        {(() => {
                          const signatories = getClientSignatories();
                          
                          if (signatories.length === 0) {
                            return (
                              <div className="bg-gray-50 border-2 border-gray-300 rounded-lg p-4">
                                <label className="flex items-center cursor-pointer">
                                  <input
                                    type="radio"
                                    name="signatory"
                                    checked={true}
                                    onChange={() => {}}
                                    className="mr-3 w-5 h-5"
                                  />
                                  <div className="flex-1">
                                    <span className="text-sm font-medium text-gray-700 block mb-2">Entrer le nom:</span>
                                    <input
                                      type="text"
                                      value={customSignerName}
                                      onChange={(e) => {
                                        setCustomSignerName(e.target.value);
                                        setSelectedSignatoryMode('custom');
                                      }}
                                      placeholder="Ex: Jean Tremblay"
                                      className="w-full px-3 py-2 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                      maxLength={50}
                                    />
                                  </div>
                                </label>
                              </div>
                            );
                          }
                          
                          return (
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {signatories.map((signatory) => (
                                  <label 
                                    key={signatory.index} 
                                    className={`flex items-center bg-white border-2 rounded-lg px-4 py-3 hover:border-blue-400 cursor-pointer transition-all ${
                                      selectedSignatoryMode === 'checkbox' && selectedSignatoryIndex === signatory.index 
                                        ? 'border-blue-500 bg-blue-50' 
                                        : 'border-gray-300'
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name="signatory"
                                      checked={selectedSignatoryMode === 'checkbox' && selectedSignatoryIndex === signatory.index}
                                      onChange={() => handleSignatorySelect(signatory.index)}
                                      className="mr-2 w-5 h-5 cursor-pointer"
                                    />
                                    <span className="text-sm font-medium text-gray-800">{signatory.name}</span>
                                  </label>
                                ))}
                              </div>
                              
                              <div className={`bg-white border-2 rounded-lg p-4 ${
                                selectedSignatoryMode === 'custom' ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                              }`}>
                                <label className="flex items-start cursor-pointer">
                                  <input
                                    type="radio"
                                    name="signatory"
                                    checked={selectedSignatoryMode === 'custom'}
                                    onChange={handleCustomSelect}
                                    className="mt-1 mr-3 w-5 h-5 cursor-pointer flex-shrink-0"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <span className="text-sm font-medium text-gray-700 block mb-2">Autre:</span>
                                    <input
                                      type="text"
                                      value={customSignerName}
                                      onChange={(e) => {
                                        setCustomSignerName(e.target.value);
                                        handleCustomSelect();
                                      }}
                                      onFocus={handleCustomSelect}
                                      placeholder="Ex: Jean Tremblay"
                                      className="w-full px-3 py-2 text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                      maxLength={50}
                                    />
                                  </div>
                                </label>
                              </div>
                            </div>
                          );
                        })()}
                        
                        {signerName && (
                          <div className="mt-3 p-3 bg-green-50 border-2 border-green-300 rounded-lg">
                            <p className="text-sm text-green-800">
                              <span className="font-semibold">✓ Signataire:</span> {signerName}
                            </p>
                          </div>
                        )}
                      </div>
                      
                      {/* Zone de signature */}
                      <div>
                        <p className="text-sm font-semibold text-gray-700 mb-2">
                          Signature avec votre doigt ou stylet:
                        </p>
                        <div className="border-4 border-gray-400 rounded-xl bg-white overflow-hidden shadow-inner">
                          <canvas
                            ref={canvasRef}
                            width={800}
                            height={250}
                            className="w-full h-64 cursor-crosshair touch-none"
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onTouchStart={startDrawing}
                            onTouchMove={draw}
                            onTouchEnd={stopDrawing}
                          />
                        </div>
                      </div>
                      
                      {/* Boutons */}
                      <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t-2 border-gray-200">
                        <button
                          onClick={clearSignature}
                          className="flex-1 bg-gray-500 text-white px-6 py-3 rounded-lg hover:bg-gray-600 transition-colors font-semibold text-base flex items-center justify-center"
                        >
                          <X className="mr-2" size={20} />
                          Effacer
                        </button>
                        
                        <button
                          onClick={() => setIsSigning(false)}
                          className="flex-1 bg-red-500 text-white px-6 py-3 rounded-lg hover:bg-red-600 transition-colors font-semibold text-base"
                        >
                          Annuler
                        </button>
                        
                        <button
                          onClick={handleAcceptWork}
                          disabled={!signature || !signerName || isSubmitting}
                          className={`flex-1 px-6 py-3 rounded-lg font-semibold text-base flex items-center justify-center transition-colors ${
                            signature && signerName && !isSubmitting
                              ? 'bg-green-600 text-white hover:bg-green-700 shadow-lg' 
                              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          }`}
                        >
                          {isSubmitting ? (
                            <>
                              <span className="animate-spin mr-2">⏳</span>
                              Envoi en cours...
                            </>
                          ) : (
                            <>
                              <Check className="mr-2" size={20} />
                              Confirmer Signature
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
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
