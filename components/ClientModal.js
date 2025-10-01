'use client';
import { useState } from 'react';
import { X, User, Users, Building } from 'lucide-react';

export default function ClientModal({ open, onClose, onSaved, client }) {
  /* ---------- états ---------- */
  const [form, setForm] = useState(
    client ?? { 
      name: '', 
      company: '', 
      // Contact Principal
      email: '', 
      phone: '',
      // Contact #2
      email_2: '', 
      contact_2: '',
      // Contact Administration
      email_admin: '', 
      contact_admin: ''
    }
  );
  // 🔍 LIGNE DE DEBUG - Ajoute ça temporairement
console.log('🔍 Form state:', form);
console.log('🔍 Client prop:', client);
  
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
          // Contact Principal
          email: form.email?.trim() || '',
          phone: form.phone?.trim() || '',
          // Contact #2
          email_2: form.email_2?.trim() || '',
          contact_2: form.contact_2?.trim() || '',
          // Contact Administration
          email_admin: form.email_admin?.trim() || '',
          contact_admin: form.contact_admin?.trim() || ''
        })
      });
      
      const json = await res.json();
      
      if (!res.ok) {
        throw new Error(json.error || 'Erreur lors de la sauvegarde');
      }

      console.log('Client sauvegardé avec succès');
      onSaved();
      onClose();
      
      setForm({ 
        name: '', 
        company: '', 
        email: '', 
        phone: '', 
        email_2: '', 
        contact_2: '', 
        email_admin: '', 
        contact_admin: '' 
      });
      
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
      
      {/* 📱 Modal responsive - Plus large pour 3 contacts */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div 
          className="bg-white w-full max-w-4xl max-h-[90vh] rounded-xl shadow-2xl relative overflow-hidden"
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
              {client ? 'Modifiez les informations' : 'Créez un nouveau contact avec ses 3 contacts'}
            </p>
          </div>

          {/* 📱 Contenu du formulaire avec scroll */}
          <div className="overflow-y-auto max-h-[calc(90vh-140px)]">
            <div className="p-6 space-y-6">
              
              {/* 📱 Informations générales */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                  <Building className="w-5 h-5 mr-2 text-blue-600" />
                  Informations générales
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Nom */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-800 mb-2">
                      👤 Nom du client *
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

                  {/* Entreprise */}
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
                </div>
              </div>

              {/* 📱 Grid des 3 contacts */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Contact Principal */}
                <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-green-800 mb-4 flex items-center">
                    <User className="w-5 h-5 mr-2 text-green-600" />
                    Contact Principal
                  </h3>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-green-800 mb-1">
                        📧 Courriel
                      </label>
                      <input
                        type="email"
                        className="w-full px-3 py-2 border border-green-300 rounded-md focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-200 text-sm"
                        value={form.email}
                        onChange={onChange('email')}
                        placeholder="principal@exemple.com"
                        autoComplete="email"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-green-800 mb-1">
                        📱 Téléphone
                      </label>
                      <input
                        type="tel"
                        className="w-full px-3 py-2 border border-green-300 rounded-md focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-200 text-sm"
                        value={form.phone}
                        onChange={onChange('phone')}
                        placeholder="(514) 123-4567"
                        autoComplete="tel"
                      />
                    </div>
                  </div>
                </div>

                {/* Contact #2 */}
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-blue-800 mb-4 flex items-center">
                    <Users className="w-5 h-5 mr-2 text-blue-600" />
                    Contact #2
                  </h3>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-blue-800 mb-1">
                        📧 Courriel #2
                      </label>
                      <input
                        type="email"
                        className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-sm"
                        value={form.email_2}
                        onChange={onChange('email_2')}
                        placeholder="contact2@exemple.com"
                        autoComplete="email"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-blue-800 mb-1">
                        📱 Contact #2
                      </label>
                      <input
                        type="tel"
                        className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-sm"
                        value={form.contact_2}
                        onChange={onChange('contact_2')}
                        placeholder="(514) 987-6543"
                        autoComplete="tel"
                      />
                    </div>
                  </div>
                </div>

                {/* Contact Administration */}
                <div className="bg-purple-50 border border-purple-200 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-purple-800 mb-4 flex items-center">
                    <Building className="w-5 h-5 mr-2 text-purple-600" />
                    Administration
                  </h3>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-purple-800 mb-1">
                        📧 Courriel Admin
                      </label>
                      <input
                        type="email"
                        className="w-full px-3 py-2 border border-purple-300 rounded-md focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-200 text-sm"
                        value={form.email_admin}
                        onChange={onChange('email_admin')}
                        placeholder="admin@exemple.com"
                        autoComplete="email"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-purple-800 mb-1">
                        📱 Contact Admin
                      </label>
                      <input
                        type="tel"
                        className="w-full px-3 py-2 border border-purple-300 rounded-md focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-200 text-sm"
                        value={form.contact_admin}
                        onChange={onChange('contact_admin')}
                        placeholder="(514) 555-0000"
                        autoComplete="tel"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 📱 Boutons d'action fixes en bas */}
          <div className="border-t bg-white px-6 py-4">
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
              * Le nom est obligatoire • Les contacts sont optionnels
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
