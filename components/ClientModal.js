'use client';
import { useState } from 'react';
import { X } from 'lucide-react';

export default function ClientModal({ open, onClose, onSaved, client }) {
  /* ---------- états ---------- */
  const [form, setForm] = useState(
    client ?? { name: '', company: '', email: '', phone: '' }
  );
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  /* ---------- helpers ---------- */
  const onChange = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  /* ---------- save ---------- */
  async function save() {
    if (!form.name?.trim()) {
      alert('Le nom est requis');
      return;
    }
    
    setSaving(true);

    try {
      const res = await fetch('/api/save-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...form, 
          id: client?.id,
          name: form.name.trim(),
          company: form.company?.trim() || '',
          email: form.email?.trim() || '',
          phone: form.phone?.trim() || ''
        })
      });
      
      const json = await res.json();
      
      if (!res.ok) {
        throw new Error(json.error || 'Erreur lors de la sauvegarde');
      }

      console.log('Client sauvegardé avec succès');
      onSaved();
      onClose();
      
      setForm({ name: '', company: '', email: '', phone: '' });
      
    } catch (error) {
      console.error('Erreur save client:', error);
      alert('Erreur: ' + error.message);
    } finally {
      setSaving(false);
    }
  }

  /* ---------- render ---------- */
  return (
    <>
      {/* 📱 Overlay */}
      <div 
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* 📱 Modal responsive */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div 
          className="bg-white w-full max-w-md rounded-xl shadow-2xl relative overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          
          {/* 📱 En-tête avec gradient */}
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-4 relative">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors p-1 rounded-full hover:bg-white/20"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold pr-8">
              {client ? '✏️ Modifier le client' : '➕ Nouveau client'}
            </h2>
            <p className="text-blue-100 text-sm mt-1">
              {client ? 'Modifiez les informations' : 'Créez un nouveau contact'}
            </p>
          </div>

          {/* 📱 Contenu du formulaire */}
          <div className="p-6 space-y-5">
            
            {/* 📱 Nom - Input principal */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                👤 Nom du contact *
              </label>
              <input
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-base"
                value={form.name}
                onChange={onChange('name')}
                placeholder="ex: Jean Dupont"
                required
                autoFocus
              />
            </div>

            {/* 📱 Entreprise */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                🏢 Entreprise
              </label>
              <input
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-base"
                value={form.company}
                onChange={onChange('company')}
                placeholder="ex: Services TMT Inc."
              />
            </div>

            {/* 📱 Email */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                📧 Courriel
              </label>
              <input
                type="email"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-base"
                value={form.email}
                onChange={onChange('email')}
                placeholder="ex: jean@exemple.com"
                autoComplete="email"
              />
            </div>

            {/* 📱 Téléphone */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                📱 Téléphone
              </label>
              <input
                type="tel"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-base"
                value={form.phone}
                onChange={onChange('phone')}
                placeholder="ex: (514) 123-4567"
                autoComplete="tel"
              />
            </div>
          </div>

          {/* 📱 Boutons d'action optimisés */}
          <div className="px-6 pb-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={onClose}
                className="w-full sm:w-auto px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all font-medium"
              >
                Annuler
              </button>
              <button
                onClick={save}
                disabled={saving || !form.name?.trim()}
                className="w-full sm:flex-1 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white py-3 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-lg disabled:shadow-none"
              >
                {saving ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                    Sauvegarde…
                  </div>
                ) : (
                  <>
                    {client ? '💾 Mettre à jour' : '✨ Créer le client'}
                  </>
                )}
              </button>
            </div>
            
            {/* 📱 Note de validation */}
            <p className="text-xs text-gray-500 mt-3 text-center">
              * Le nom est obligatoire
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
