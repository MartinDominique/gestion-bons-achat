'use client';
import { useState, useEffect } from 'react';
import { X, User, Users, Building, PenTool } from 'lucide-react';

export default function ClientModal({ open, onClose, onSaved, client }) {
  /* ---------- états ---------- */
  const [form, setForm] = useState(
    client ? {
      name: client.name || '',
      address: client.address || '',
      travel_minutes: client.travel_minutes || 0,
      // Contact Principal (avec fallback vers anciennes colonnes)
      contact_name: client.contact_name || client.contact_person || '',
      email: client.email || '',
      phone: client.phone || '',
      // Contact #2
      contact_name_2: client.contact_name_2 || '',
      email_2: client.email_2 || '',
      contact_2: client.contact_2 || '',
      // Contact Administration
      contact_name_admin: client.contact_name_admin || '',
      email_admin: client.email_admin || '',
      contact_admin: client.contact_admin || '',
      // Signataires
      signatory_1: client.signatory_1 || '',
      signatory_2: client.signatory_2 || '',
      signatory_3: client.signatory_3 || '',
      signatory_4: client.signatory_4 || '',
      signatory_5: client.signatory_5 || ''
    } : { 
      name: '', 
      address: '',
      travel_minutes: 0,
      // Contact Principal
      contact_name: '',
      email: '', 
      phone: '',
      // Contact #2
      contact_name_2: '',
      email_2: '', 
      contact_2: '',
      // Contact Administration
      contact_name_admin: '',
      email_admin: '', 
      contact_admin: '',
      // Signataires
      signatory_1: '',
      signatory_2: '',
      signatory_3: '',
      signatory_4: '',
      signatory_5: ''
    }
  );
  const [saving, setSaving] = useState(false);

      useEffect(() => {
        if (client) {
          console.log('🔍 USEEFFECT - Chargement client:', client);
          setForm({
            name: client.name || '',
            address: client.address || '',
            travel_minutes: client.travel_minutes || 0,
            contact_name: client.contact_name || client.contact_person || '',
            email: client.email || '',
            phone: client.phone || '',
            contact_name_2: client.contact_name_2 || '',
            email_2: client.email_2 || '',
            contact_2: client.contact_2 || '',
            contact_name_admin: client.contact_name_admin || '',
            email_admin: client.email_admin || '',
            contact_admin: client.contact_admin || '',
            signatory_1: client.signatory_1 || '',
            signatory_2: client.signatory_2 || '',
            signatory_3: client.signatory_3 || '',
            signatory_4: client.signatory_4 || '',
            signatory_5: client.signatory_5 || ''
          });
        }
      }, [client]);
      
      if (!open) return null;

  /* ---------- helpers ---------- */
  const onChange = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // 📱 Formatage automatique des numéros de téléphone
  const formatPhoneNumber = (value) => {
    // Enlever tous les caractères non-numériques
    const numbers = value.replace(/\D/g, '');
    
    // Limiter à 10 chiffres
    const limited = numbers.slice(0, 10);
    
    // Formater selon le nombre de chiffres
    if (limited.length <= 3) {
      return limited;
    } else if (limited.length <= 6) {
      return `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
    } else {
      return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6)}`;
    }
  };

  // Handler spécial pour les champs téléphone
  const onPhoneChange = (fieldName) => (e) => {
    const formatted = formatPhoneNumber(e.target.value);
    setForm((f) => ({ ...f, [fieldName]: formatted }));
  };

  /* ---------- save ---------- */
  async function save() {
    if (!form.name?.trim()) {
      alert('Le nom est requis');
      return;
    }
      
      // AJOUTER CETTE VALIDATION
      if (!form.email_admin?.trim()) {
        alert('Le courriel admin est requis');
        return;
      }
      
      setSaving(true);
    
    setSaving(true);

    try {
      const res = await fetch('/api/save-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...form, 
          id: client?.id,
          name: form.name.trim(),
          address: form.address?.trim() || '',
          travel_minutes: parseInt(form.travel_minutes) || 0,
          // Contact Principal - sauvegarder dans anciennes ET nouvelles colonnes
          contact_person: form.contact_name?.trim() || '', // pour compatibilité 
          contact_name: form.contact_name?.trim() || '',
          email: form.email?.trim() || '',
          phone: form.phone?.trim() || '',
          // Contact #2
          contact_name_2: form.contact_name_2?.trim() || '',
          email_2: form.email_2?.trim() || '',
          contact_2: form.contact_2?.trim() || '',
          // Contact Administration
          contact_name_admin: form.contact_name_admin?.trim() || '',
          email_admin: form.email_admin?.trim() || '',
          contact_admin: form.contact_admin?.trim() || '',
          // Signataires
          signatory_1: form.signatory_1?.trim() || '',
          signatory_2: form.signatory_2?.trim() || '',
          signatory_3: form.signatory_3?.trim() || '',
          signatory_4: form.signatory_4?.trim() || '',
          signatory_5: form.signatory_5?.trim() || ''
        })
      });
      
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Erreur lors de la sauvegarde');
      }
     
      onSaved(json.client);
      onClose();
      
      setForm({ 
        name: '', 
        address: '',
        contact_name: '',
        email: '', 
        phone: '', 
        contact_name_2: '',
        email_2: '', 
        contact_2: '', 
        contact_name_admin: '',
        email_admin: '', 
        contact_admin: '',
        signatory_1: '',
        signatory_2: '',
        signatory_3: '',
        signatory_4: '',
        signatory_5: ''
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
          
          {/* 📱 En-tête avec gradient et boutons */}
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              {/* Titre */}
              <div className="flex-1">
                <h2 className="text-xl font-bold">
                  {client ? '✏️ Modifier le client' : '➕ Nouveau client'}
                </h2>
                <p className="text-blue-100 text-sm mt-1">
                  {client ? 'Modifiez les informations' : 'Créez un nouveau contact avec ses 3 contacts et signataires'}
                </p>
              </div>

              {/* Boutons d'action */}
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all font-medium border border-white/30 text-sm"
                >
                  Annuler
                </button>
                <button
                  onClick={save}
                  disabled={saving || !form.name?.trim()}
                  className="px-4 py-2 bg-white text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-lg disabled:shadow-none text-sm"
                >
                  {saving ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent mr-2"></div>
                      Sauvegarde…
                    </div>
                  ) : (
                    <>
                      {client ? '💾 Mettre à jour' : '✨ Créer le client'}
                    </>
                  )}
                </button>
              </div>
            </div>
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
                  {/* Client (nom de l'entreprise) */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-800 mb-2">
                      🏢 Client *
                    </label>
                    <input
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-base"
                      value={form.name}
                      onChange={onChange('name')}
                      placeholder="ex: Concrea, A Toulouse, Belvédère du Lac"
                      required
                      autoFocus
                    />
                  </div>
              
                  {/* Adresse - Sur toute la largeur */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-800 mb-2">
                      📍 Adresse civique
                    </label>
                    <textarea
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-base resize-none"
                      value={form.address}
                      onChange={onChange('address')}
                      placeholder="ex: 3197, 42e Rue Nord, St-Georges, QC, G5Z 0V9"
                      rows="2"
                    />
                  </div>
              
                  {/* ⭐ NOUVEAU CHAMP - Temps de voyagement ⭐ */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-800 mb-2">
                      🚗 Temps de voyagement (minutes)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-base"
                        value={form.travel_minutes}
                        onChange={onChange('travel_minutes')}
                        placeholder="ex: 30"
                      />
                      <span className="text-sm text-gray-500 whitespace-nowrap px-2">
                        = {(form.travel_minutes / 60 * 10).toFixed(1)} /10h
                      </span>
                    </div>
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
                        👤 Nom du contact
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 border border-green-300 rounded-md focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-200 text-sm"
                        value={form.contact_name}
                        onChange={onChange('contact_name')}
                        placeholder="ex: Jean Tremblay"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-green-800 mb-1">
                        📧 Courriel
                      </label>
                      <input
                        type="email"
                        className="w-full px-3 py-2 border border-green-300 rounded-md focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-200 text-sm"
                        value={form.email}
                        onChange={onChange('email')}
                        placeholder="contact@exemple.com"
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
                        onChange={onPhoneChange('phone')}
                        placeholder="(418) 225-3875"
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
                        👤 Nom du contact
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-sm"
                        value={form.contact_name_2}
                        onChange={onChange('contact_name_2')}
                        placeholder="ex: Marie Dupont"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-blue-800 mb-1">
                        📧 Courriel
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
                        📱 Téléphone
                      </label>
                      <input
                        type="tel"
                        className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-sm"
                        value={form.contact_2}
                        onChange={onPhoneChange('contact_2')}
                        placeholder="(418) 225-3875"
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
                        👤 Nom Admin
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 border border-purple-300 rounded-md focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-200 text-sm"
                        value={form.contact_name_admin}
                        onChange={onChange('contact_name_admin')}
                        placeholder="ex: Julie Comptabilité"
                      />
                    </div>

                    

                    <div>
                      <label className="block text-sm font-medium text-purple-800 mb-1">
                        📧 Courriel Admin <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="email"
                        required
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
                        onChange={onPhoneChange('contact_admin')}
                        placeholder="(418) 225-3875"
                        autoComplete="tel"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 📱 NOUVELLE SECTION - Signataires */}
              <div className="bg-orange-50 border border-orange-200 p-4 rounded-lg">
                <h3 className="text-lg font-semibold text-orange-800 mb-4 flex items-center">
                  <PenTool className="w-5 h-5 mr-2 text-orange-600" />
                  Signataires autorisés
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  {/* Signataire 1 */}
                  <div>
                    <label className="block text-sm font-medium text-orange-800 mb-1">
                      ✍️ Signataire #1
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-orange-300 rounded-md focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-200 text-sm"
                      value={form.signatory_1}
                      onChange={onChange('signatory_1')}
                      placeholder="Nom complet"
                    />
                  </div>

                  {/* Signataire 2 */}
                  <div>
                    <label className="block text-sm font-medium text-orange-800 mb-1">
                      ✍️ Signataire #2
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-orange-300 rounded-md focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-200 text-sm"
                      value={form.signatory_2}
                      onChange={onChange('signatory_2')}
                      placeholder="Nom complet"
                    />
                  </div>

                  {/* Signataire 3 */}
                  <div>
                    <label className="block text-sm font-medium text-orange-800 mb-1">
                      ✍️ Signataire #3
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-orange-300 rounded-md focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-200 text-sm"
                      value={form.signatory_3}
                      onChange={onChange('signatory_3')}
                      placeholder="Nom complet"
                    />
                  </div>

                  {/* Signataire 4 */}
                  <div>
                    <label className="block text-sm font-medium text-orange-800 mb-1">
                      ✍️ Signataire #4
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-orange-300 rounded-md focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-200 text-sm"
                      value={form.signatory_4}
                      onChange={onChange('signatory_4')}
                      placeholder="Nom complet"
                    />
                  </div>

                  {/* Signataire 5 */}
                  <div>
                    <label className="block text-sm font-medium text-orange-800 mb-1">
                      ✍️ Signataire #5
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-orange-300 rounded-md focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-200 text-sm"
                      value={form.signatory_5}
                      onChange={onChange('signatory_5')}
                      placeholder="Nom complet"
                    />
                  </div>
                </div>

                <p className="text-xs text-orange-600 mt-2">
                  💡 Personnes autorisées à signer les bons de travail pour ce client
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
