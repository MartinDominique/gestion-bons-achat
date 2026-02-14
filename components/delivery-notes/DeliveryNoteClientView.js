/**
 * @file components/delivery-notes/DeliveryNoteClientView.js
 * @description Page de présentation du BL au client pour signature
 *              - Affiche résumé BL (client, matériaux, description)
 *              - Zone de signature tactile
 *              - Envoi automatique après signature
 *              Mobile-first: 95% usage tablette/mobile
 * @version 1.0.0
 * @date 2026-02-12
 * @changelog
 *   1.0.0 - Version initiale
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { Check, Send, Wifi, WifiOff, X, FileText, User, Calendar, Package, Mail, Truck } from 'lucide-react';
import { handleBLSignatureWithAutoSend } from '../../lib/services/client-signature.js';

export default function DeliveryNoteClientView({ deliveryNote, onStatusUpdate }) {
  const [signature, setSignature] = useState('');
  const [isSigning, setIsSigning] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [showSummary, setShowSummary] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // États pour les signataires
  const [selectedSignatoryMode, setSelectedSignatoryMode] = useState('checkbox');
  const [selectedSignatoryIndex, setSelectedSignatoryIndex] = useState(null);
  const [customSignerName, setCustomSignerName] = useState('');

  // Surveiller connexion
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

  // Configuration canvas
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

  // Récupérer les signataires
  const getClientSignatories = () => {
    if (!deliveryNote?.client) return [];
    const signatories = [];
    for (let i = 1; i <= 5; i++) {
      const signatoryName = deliveryNote.client[`signatory_${i}`];
      if (signatoryName && signatoryName.trim()) {
        signatories.push({ index: i, name: signatoryName.trim() });
      }
    }
    return signatories;
  };

  useEffect(() => {
    if (selectedSignatoryMode === 'checkbox' && selectedSignatoryIndex !== null) {
      const signatories = getClientSignatories();
      const selected = signatories.find(s => s.index === selectedSignatoryIndex);
      if (selected) setSignerName(selected.name);
    } else if (selectedSignatoryMode === 'custom') {
      setSignerName(customSignerName);
    }
  }, [selectedSignatoryMode, selectedSignatoryIndex, customSignerName, deliveryNote]);

  const handleSignatorySelect = (index) => {
    setSelectedSignatoryMode('checkbox');
    setSelectedSignatoryIndex(index);
    setCustomSignerName('');
  };

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
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    setSignature(canvas.toDataURL());
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignature('');
  };

  // Soumettre la signature
  const handleSubmitSignature = async () => {
    if (!signature || !signerName.trim()) {
      alert('Veuillez signer et indiquer votre nom.');
      return;
    }

    if (!isOnline) {
      alert('Pas de connexion internet. Veuillez vérifier votre connexion et réessayer.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await handleBLSignatureWithAutoSend(
        deliveryNote.id,
        signature,
        signerName.trim()
      );

      if (result.success) {
        setIsSigning(false);
        setShowSummary(false);

        // Afficher succès
        if (result.autoSendResult?.success) {
          // Auto-envoi réussi
        }
      } else {
        alert('Erreur: ' + (result.error || 'Erreur inconnue'));
      }
    } catch (error) {
      alert('Erreur lors de la signature: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Vue signature complétée
  if (deliveryNote.status === 'sent' || deliveryNote.status === 'signed' || deliveryNote.status === 'pending_send') {
    if (deliveryNote.signature_data) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-green-50 to-teal-50 p-4">
          <div className="max-w-lg mx-auto">
            <div className="bg-white rounded-2xl shadow-xl p-6 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h1 className="text-2xl font-bold text-green-800 mb-2">Bon de livraison signé</h1>
              <p className="text-green-600 mb-4">
                {deliveryNote.bl_number} a été signé avec succès
                {deliveryNote.status === 'sent' && ' et envoyé par email'}
              </p>
              <div className="bg-green-50 rounded-lg p-4 mb-4">
                <p className="text-sm text-green-700">
                  <strong>Signé par:</strong> {deliveryNote.client_signature_name || 'N/A'}
                </p>
                {deliveryNote.signature_timestamp && (
                  <p className="text-sm text-green-700 mt-1">
                    <strong>Date:</strong> {new Date(deliveryNote.signature_timestamp).toLocaleString('fr-CA', { timeZone: 'America/Toronto' })}
                  </p>
                )}
              </div>
              {deliveryNote.signature_data && (
                <div className="border border-green-200 rounded-lg p-2 bg-white">
                  <img src={deliveryNote.signature_data} alt="Signature" className="mx-auto max-h-24" />
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }
  }

  // =============================================
  // RENDER PRINCIPAL
  // =============================================

  const signatories = getClientSignatories();

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-teal-50">
      {/* Barre connexion */}
      <div className={`sticky top-0 z-50 px-4 py-2 text-center text-sm font-medium ${
        isOnline ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
      }`}>
        {isOnline ? (
          <span className="flex items-center justify-center gap-2">
            <Wifi size={16} /> Connecté
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <WifiOff size={16} /> Hors ligne - Signature impossible
          </span>
        )}
      </div>

      <div className="p-4 max-w-lg mx-auto">
        {/* En-tête */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Truck className="text-orange-500" size={24} />
                <h1 className="text-xl font-bold text-gray-900">Bon de Livraison</h1>
              </div>
              <p className="text-orange-600 font-mono font-bold text-lg">{deliveryNote.bl_number}</p>
            </div>
            <div className="text-right text-sm text-gray-600">
              <p className="flex items-center justify-end gap-1">
                <Calendar size={14} />
                {deliveryNote.delivery_date}
              </p>
            </div>
          </div>

          {/* Info client */}
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-2">
              <User className="text-gray-500 mt-0.5" size={16} />
              <div>
                <p className="font-medium text-gray-900">{deliveryNote.client?.name || deliveryNote.client_name || 'Client'}</p>
                {deliveryNote.client?.address && (
                  <p className="text-sm text-gray-600">{deliveryNote.client.address}</p>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          {deliveryNote.delivery_description && (
            <div className="bg-blue-50 rounded-lg p-4 mb-4">
              <p className="text-sm font-medium text-blue-800 mb-1">Description:</p>
              <p className="text-sm text-blue-700">{deliveryNote.delivery_description}</p>
            </div>
          )}

          {/* Matériaux */}
          {deliveryNote.materials && deliveryNote.materials.length > 0 && (
            <div>
              <h3 className="font-medium text-gray-800 mb-2 flex items-center gap-2">
                <Package size={16} />
                Matériaux livrés ({deliveryNote.materials.length})
              </h3>
              <div className="space-y-2">
                {deliveryNote.materials.map((m, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">
                        {m.description || m.product?.description || 'Article'}
                      </p>
                      {m.notes && (
                        <p className="text-xs text-gray-500 italic mt-0.5">{m.notes}</p>
                      )}
                    </div>
                    <div className="text-right ml-3">
                      <p className="text-sm font-bold text-gray-900">
                        {m.quantity} {m.unit || 'UN'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ==========================================
            SECTION SIGNATURE
            ========================================== */}
        {!isSigning ? (
          <button
            onClick={() => setIsSigning(true)}
            disabled={!isOnline}
            className="w-full py-4 bg-teal-600 text-white rounded-2xl font-bold text-lg shadow-xl hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ minHeight: '56px' }}
          >
            Signer le bon de livraison
          </button>
        ) : (
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Signature</h2>

            {/* Sélection signataire */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nom du signataire
              </label>

              {signatories.length > 0 && (
                <div className="space-y-2 mb-3">
                  {signatories.map(({ index, name }) => (
                    <label
                      key={index}
                      className={`flex items-center p-3 rounded-lg cursor-pointer border ${
                        selectedSignatoryMode === 'checkbox' && selectedSignatoryIndex === index
                          ? 'bg-teal-50 border-teal-400'
                          : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                      }`}
                      style={{ minHeight: '44px' }}
                    >
                      <input
                        type="radio"
                        name="signatory"
                        checked={selectedSignatoryMode === 'checkbox' && selectedSignatoryIndex === index}
                        onChange={() => handleSignatorySelect(index)}
                        className="w-5 h-5 text-teal-600"
                      />
                      <span className="ml-3 font-medium text-gray-800">{name}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* Option "Autre" */}
              <label
                className={`flex items-center p-3 rounded-lg cursor-pointer border ${
                  selectedSignatoryMode === 'custom'
                    ? 'bg-teal-50 border-teal-400'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                }`}
                style={{ minHeight: '44px' }}
              >
                <input
                  type="radio"
                  name="signatory"
                  checked={selectedSignatoryMode === 'custom'}
                  onChange={handleCustomSelect}
                  className="w-5 h-5 text-teal-600"
                />
                <span className="ml-3 font-medium text-gray-800">Autre</span>
              </label>

              {selectedSignatoryMode === 'custom' && (
                <input
                  type="text"
                  value={customSignerName}
                  onChange={(e) => setCustomSignerName(e.target.value)}
                  placeholder="Entrer le nom du signataire"
                  className="w-full mt-2 px-4 py-3 border border-gray-300 rounded-lg text-base"
                  style={{ minHeight: '44px' }}
                />
              )}
            </div>

            {/* Zone de signature */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">
                  Dessinez votre signature
                </label>
                <button
                  onClick={clearSignature}
                  className="text-sm text-red-600 hover:text-red-700 font-medium px-3 py-1"
                  style={{ minHeight: '44px' }}
                >
                  <X className="inline mr-1" size={14} />
                  Effacer
                </button>
              </div>
              <div className="border-2 border-dashed border-gray-300 rounded-lg overflow-hidden bg-white">
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={200}
                  className="w-full touch-none"
                  style={{ height: '150px' }}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
              </div>
            </div>

            {/* Boutons */}
            <div className="flex gap-3">
              <button
                onClick={() => { setIsSigning(false); clearSignature(); }}
                className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium"
                style={{ minHeight: '44px' }}
              >
                Annuler
              </button>
              <button
                onClick={handleSubmitSignature}
                disabled={isSubmitting || !signature || !signerName.trim() || !isOnline}
                className="flex-1 py-3 bg-teal-600 text-white rounded-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ minHeight: '44px' }}
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Envoi...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Send size={18} />
                    Confirmer et envoyer
                  </span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
