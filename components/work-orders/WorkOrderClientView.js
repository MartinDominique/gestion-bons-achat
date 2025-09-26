'use client';

import { useState, useRef, useEffect } from 'react';
import { Check, Send, Wifi, WifiOff, X, FileText, User, Calendar, Clock } from 'lucide-react';

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
      const response = await fetch(`/api/work-orders/${workOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'signed',
          signature: signature,
          signed_at: new Date().toISOString(),
          client_name: workOrder.client?.name || 'Client'
        })
      });

      if (response.ok) {
        onStatusUpdate?.('signed');
        setIsSigning(false);
        // Auto-envoi si en ligne, sinon marquer comme en attente
        if (isOnline) {
          handleSendWork();
        } else {
          onStatusUpdate?.('pending_send');
          alert('Travail signé et mis en attente d\'envoi (mode hors ligne)');
        }
      }
    } catch (error) {
      console.error('Erreur signature:', error);
      alert('Erreur lors de la signature');
    }
  };

  const handleSendWork = async () => {
    try {
      const response = await fetch(`/api/work-orders/${workOrder.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        onStatusUpdate?.('sent');
        alert('Bon de travail envoyé avec succès !');
        window.close(); // Fermer la fenêtre tablette
      }
    } catch (error) {
      console.error('Erreur envoi:', error);
      alert('Erreur lors de l\'envoi - sauvegardé en local');
      onStatusUpdate?.('pending_send');
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('fr-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount || 0);
  };

  const calculateTotal = () => {
    return workOrder.materials?.reduce((total, material) => {
      return total + (material.quantity * material.unit_price);
    }, 0) || 0;
  };

  if (!workOrder) {
    return <div className="p-8 text-center">Chargement...</div>;
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header avec logo entreprise */}
      <div className="bg-blue-600 text-white p-4 print:bg-white print:text-black">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">VOTRE ENTREPRISE</h1>
            <p className="text-blue-100 print:text-gray-600">Bon de Travail #{workOrder.work_order_number}</p>
          </div>
          <div className="text-right text-sm">
            <p>{new Date(workOrder.created_at).toLocaleDateString('fr-CA')}</p>
            <div className="flex items-center mt-1">
              {isOnline ? (
                <>
                  <Wifi size={16} className="mr-1" />
                  <span>En ligne</span>
                </>
              ) : (
                <>
                  <WifiOff size={16} className="mr-1" />
                  <span>Hors ligne</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        {/* Informations client */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-semibold mb-2 flex items-center">
            <User className="mr-2" size={20} />
            Informations Client
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p><strong>Client:</strong> {workOrder.client?.name || 'N/A'}</p>
              <p><strong>Contact:</strong> {workOrder.client?.contact_person || 'N/A'}</p>
            </div>
            <div>
              <p><strong>Date:</strong> {workOrder.work_date}</p>
              <p><strong>Heure:</strong> {workOrder.start_time} - {workOrder.end_time}</p>
            </div>
          </div>
        </div>

        {/* Description des travaux */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2 flex items-center">
            <FileText className="mr-2" size={20} />
            Description des Travaux
          </h2>
          <p className="bg-white border rounded-lg p-4">
            {workOrder.description || 'Aucune description'}
          </p>
        </div>

        {/* Matériaux utilisés */}
        {workOrder.materials && workOrder.materials.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-4">Matériaux Utilisés</h2>
            <div className="bg-white border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">Matériau</th>
                    <th className="px-4 py-3 text-center">Quantité</th>
                    <th className="px-4 py-3 text-center">Unité</th>
                    {workOrder.show_prices && (
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
                      <td className="px-4 py-3">{material.name}</td>
                      <td className="px-4 py-3 text-center">{material.quantity}</td>
                      <td className="px-4 py-3 text-center">{material.unit}</td>
                      {workOrder.show_prices && (
                        <>
                          <td className="px-4 py-3 text-right">
                            {formatCurrency(material.unit_price)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {formatCurrency(material.quantity * material.unit_price)}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
                {workOrder.show_prices && (
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
          <div className="border-2 border-blue-200 rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4 text-blue-800">
              Signature du Client - Acceptation des Travaux
            </h2>
            
            {!isSigning ? (
              <div className="text-center">
                <p className="text-gray-600 mb-4">
                  En signant ci-dessous, vous confirmez que les travaux ont été réalisés à votre satisfaction.
                </p>
                <button
                  onClick={() => setIsSigning(true)}
                  className="bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 text-lg font-semibold"
                >
                  <Check className="inline mr-2" size={20} />
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
              </div>
              <button
                onClick={handleSendWork}
                disabled={!isOnline}
                className={`px-6 py-3 rounded-lg font-semibold flex items-center ${
                  isOnline 
                    ? 'bg-blue-600 text-white hover:bg-blue-700' 
                    : 'bg-gray-400 text-gray-600 cursor-not-allowed'
                }`}
              >
                <Send className="mr-2" size={16} />
                {isOnline ? 'Envoyer Maintenant' : 'Attente Connexion'}
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
              Travaux signés - Sera envoyé automatiquement dès la reconnexion
            </p>
            {isOnline && (
              <button
                onClick={handleSendWork}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                <Send className="inline mr-2" size={16} />
                Envoyer Maintenant
              </button>
            )}
          </div>
        )}

        {/* Travaux envoyés */}
        {workOrder.status === 'sent' && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6 text-center">
            <h3 className="text-lg font-semibold text-blue-800 mb-2">
              📧 Bon de Travail Envoyé avec Succès
            </h3>
            <p className="text-blue-700">
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
