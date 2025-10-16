'use client';

import { useState, useRef, useEffect } from 'react';
import { Check, Send, Wifi, WifiOff, X, FileText, User, Calendar, Clock, Mail } from 'lucide-react';
import { handleSignatureWithAutoSend } from '../../lib/services/client-signature.js';

export default function WorkOrderClientView({ workOrder, onStatusUpdate }) {
  const [signature, setSignature] = useState('');
  const [isSigning, setIsSigning] = useState(false);
  const [showSummary, setShowSummary] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

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

  try {
    // Utiliser le nouveau service client (sans Resend côté client)
    const result = await handleSignatureWithAutoSend(
      workOrder.id, 
      signature, 
      workOrder.client?.name || 'Client'
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
        {/* Informations client - Compact sur mobile */}
        <div className="bg-gray-50 rounded-lg p-3 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-base sm:text-xl font-semibold mb-2 sm:mb-4 flex items-center">
            <User className="mr-2" size={20} />
            Informations Client
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4 text-sm">
            <div className="space-y-1">
              <p><strong>Nom:</strong> {workOrder.client?.name || 'N/A'}</p>
              <p><strong>Contact:</strong> {workOrder.client?.contact_person || 'N/A'}</p>
            </div>
            <div className="space-y-1">
              <p><strong>Date:</strong> {workOrder.work_date || 'N/A'}</p>
              <p><strong>Heures:</strong> {(() => {
                const hours = workOrder.total_hours || calculateTotalHours();
                const h = Math.floor(hours);
                const m = Math.round((hours - h) * 60);
                return m > 0 ? `${h}h ${m}min` : `${h}h`;
              })()}</p>
            </div>
            <div className="col-span-2 lg:col-span-1 space-y-1">
              <p><strong>Tél:</strong> {workOrder.client?.phone || 'N/A'}</p>
              {(workOrder.linked_po?.po_number || workOrder.linked_po_id) && (
                <p><strong>BA client:</strong> {workOrder.linked_po?.po_number || workOrder.linked_po_id}</p>
              )}
            </div>
          </div>
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
        {workOrder.materials && workOrder.materials.length > 0 && (
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
                      disabled={!signature}
                      className={`px-6 py-2 rounded-lg font-semibold ${
                        signature 
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
