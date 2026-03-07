'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

export default function RestorePage() {
  const [file, setFile] = useState<File | null>(null);
  const [backupData, setBackupData] = useState<any>(null);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [confirmText, setConfirmText] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [result, setResult] = useState<any>(null);
  const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    const text = await uploadedFile.text();
    const data = JSON.parse(text);
    setBackupData(data);
    setSelectedTables(Object.keys(data.tables));
  };

  const toggleTable = (tableName: string) => {
    setSelectedTables(prev =>
      prev.includes(tableName)
        ? prev.filter(t => t !== tableName)
        : [...prev, tableName]
    );
  };

  const handleRestore = async () => {
    if (confirmText !== 'RESTAURER') {
      alert('Vous devez taper RESTAURER pour confirmer');
      return;
    }

    setIsRestoring(true);
    setResult(null);

    try {
      const response = await fetch('/api/admin/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backupData,
          selectedTables
        })
      });

      const data = await response.json();
      setResult(data);
    } catch (error: any) {
      setResult({ error: error.message });
    } finally {
      setIsRestoring(false);
      setConfirmText('');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">🔄 Restauration de la Base de Données</h1>
      
      {/* Avertissement */}
      <div className="bg-red-50 border-2 border-red-500 rounded-lg p-4 mb-6">
        <h2 className="text-red-700 font-bold text-lg mb-2">⚠️ ATTENTION</h2>
        <p className="text-red-600">
          Cette opération va ÉCRASER les données actuelles des tables sélectionnées.
          Un backup automatique sera créé avant la restauration.
        </p>
      </div>

      {/* Upload du fichier */}
      <div className="bg-white border rounded-lg p-6 mb-6">
        <label className="block mb-2 font-semibold">1. Sélectionner le fichier de backup (.json)</label>
        <input
          type="file"
          accept=".json"
          onChange={handleFileUpload}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
      </div>

      {/* Aperçu du backup */}
      {backupData && (
        <>
          <div className="bg-white border rounded-lg p-6 mb-6">
            <h2 className="font-semibold mb-4">2. Informations du backup</h2>
            <div className="space-y-2 text-sm">
              <p><strong>Date du backup:</strong> {new Date(backupData.date).toLocaleString('fr-CA')}</p>
              <p><strong>Projet:</strong> {backupData.project}</p>
              <p><strong>Nombre de tables:</strong> {Object.keys(backupData.tables).length}</p>
            </div>
          </div>

          {/* Sélection des tables */}
          <div className="bg-white border rounded-lg p-6 mb-6">
            <h2 className="font-semibold mb-4">3. Sélectionner les tables à restaurer</h2>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(backupData.tables).map(([tableName, tableData]: [string, any]) => (
                <label key={tableName} className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedTables.includes(tableName)}
                    onChange={() => toggleTable(tableName)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">
                    <strong>{tableName}</strong>
                    <span className="text-gray-500 ml-2">({tableData.count} enregistrements)</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setSelectedTables(Object.keys(backupData.tables))}
                className="text-sm text-blue-600 hover:underline"
              >
                Tout sélectionner
              </button>
              <button
                onClick={() => setSelectedTables([])}
                className="text-sm text-blue-600 hover:underline"
              >
                Tout désélectionner
              </button>
            </div>
          </div>

          {/* Confirmation */}
          {selectedTables.length > 0 && (
            <div className="bg-white border rounded-lg p-6 mb-6">
              <h2 className="font-semibold mb-4">4. Confirmation finale</h2>
              <p className="text-sm mb-4">
                Vous êtes sur le point de restaurer <strong>{selectedTables.length} table(s)</strong>.
                Cette action est IRRÉVERSIBLE.
              </p>
              <label className="block mb-2 text-sm font-semibold">
                Tapez "RESTAURER" pour confirmer:
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="border rounded px-3 py-2 w-full mb-4"
                placeholder="RESTAURER"
                disabled={isRestoring}
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <button
                onClick={handleRestore}
                disabled={confirmText !== 'RESTAURER' || isRestoring}
                className={`w-full py-3 rounded font-semibold ${
                  confirmText === 'RESTAURER' && !isRestoring
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isRestoring ? '🔄 Restauration en cours...' : '🔄 RESTAURER LA BASE DE DONNÉES'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Résultat */}
      {result && (
        <div className={`border rounded-lg p-6 ${result.error ? 'bg-red-50 border-red-500' : 'bg-green-50 border-green-500'}`}>
          <h2 className="font-semibold mb-4">
            {result.error ? '❌ Erreur' : '✅ Restauration terminée'}
          </h2>
          {result.error ? (
            <p className="text-red-600">{result.error}</p>
          ) : (
            <div className="space-y-2 text-sm">
              <p><strong>Backup de sécurité créé:</strong> ✅</p>
              <p><strong>Tables restaurées:</strong> {result.restored?.length}</p>
              <div className="mt-4">
                <p className="font-semibold mb-2">Détails:</p>
                <ul className="list-disc list-inside space-y-1">
                  {result.details?.map((detail: string, i: number) => (
                    <li key={i} className="text-gray-700">{detail}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
