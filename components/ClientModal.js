/**
 * @file components/ClientModal.js
 * @description Modal de création et modification d'un client.
 *              - Formulaire avec 4 contacts (principal, #2, #3, administration)
 *              - Section Tarification (taux horaire, transport, conditions paiement)
 *              - 5 signataires autorisés
 *              - Formatage automatique des numéros de téléphone
 *              - email_admin optionnel
 * @version 2.0.1
 * @date 2026-02-27
 * @changelog
 *   2.0.1 - Fix: ContactSection causait perte de focus (rendu fonction au lieu de composant)
 *   2.0.0 - Ajout Tarification + Contact #3 + email_admin optionnel (Phase A)
 *   1.1.0 - Ajout support dark mode
 *   1.0.0 - Version initiale
 */
'use client';
import { useState, useEffect } from 'react';
import { X, User, Users, Building, PenTool, DollarSign } from 'lucide-react';

const PAYMENT_TERMS_OPTIONS = [
  { value: '', label: 'Par défaut (voir Paramètres)' },
  { value: 'Net 30 jours', label: 'Net 30 jours' },
  { value: '2% 10 Net 30 jours', label: '2% 10 Net 30 jours' },
  { value: 'Payable sur réception', label: 'Payable sur réception' },
];

const EMPTY_FORM = {
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
  // Contact #3
  contact_name_3: '',
  email_3: '',
  contact_3: '',
  // Contact Administration
  contact_name_admin: '',
  email_admin: '',
  contact_admin: '',
  // Tarification
  hourly_rate_regular: '',
  transport_fee: '',
  email_billing: '',
  payment_terms: '',
  // Signataires
  signatory_1: '',
  signatory_2: '',
  signatory_3: '',
  signatory_4: '',
  signatory_5: '',
};

function clientToForm(client) {
  return {
    name: client.name || '',
    address: client.address || '',
    travel_minutes: client.travel_minutes || 0,
    contact_name: client.contact_name || client.contact_person || '',
    email: client.email || '',
    phone: client.phone || '',
    contact_name_2: client.contact_name_2 || '',
    email_2: client.email_2 || '',
    contact_2: client.contact_2 || '',
    contact_name_3: client.contact_name_3 || '',
    email_3: client.email_3 || '',
    contact_3: client.contact_3 || '',
    contact_name_admin: client.contact_name_admin || '',
    email_admin: client.email_admin || '',
    contact_admin: client.contact_admin || '',
    hourly_rate_regular: client.hourly_rate_regular ?? '',
    transport_fee: client.transport_fee ?? '',
    email_billing: client.email_billing || '',
    payment_terms: client.payment_terms || '',
    signatory_1: client.signatory_1 || '',
    signatory_2: client.signatory_2 || '',
    signatory_3: client.signatory_3 || '',
    signatory_4: client.signatory_4 || '',
    signatory_5: client.signatory_5 || '',
  };
}

export default function ClientModal({ open, onClose, onSaved, client }) {
  /* ---------- états ---------- */
  const [form, setForm] = useState(client ? clientToForm(client) : { ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [defaultRate, setDefaultRate] = useState(null);

  useEffect(() => {
    if (client) {
      setForm(clientToForm(client));
    }
  }, [client]);

  // Charger le taux par défaut pour l'afficher comme placeholder
  useEffect(() => {
    if (open) {
      fetch('/api/settings')
        .then(r => r.json())
        .then(json => {
          if (json.success && json.data?.default_hourly_rate) {
            setDefaultRate(json.data.default_hourly_rate);
          }
        })
        .catch(() => {});
    }
  }, [open]);

  if (!open) return null;

  /* ---------- helpers ---------- */
  const onChange = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const formatPhoneNumber = (value) => {
    const numbers = value.replace(/\D/g, '');
    const limited = numbers.slice(0, 10);
    if (limited.length <= 3) return limited;
    else if (limited.length <= 6) return `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
    else return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6)}`;
  };

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

    setSaving(true);

    try {
      const payload = {
        ...form,
        id: client?.id,
        name: form.name.trim(),
        address: form.address?.trim() || '',
        travel_minutes: parseInt(form.travel_minutes) || 0,
        // Contact Principal
        contact_person: form.contact_name?.trim() || '',
        contact_name: form.contact_name?.trim() || '',
        email: form.email?.trim() || '',
        phone: form.phone?.trim() || '',
        // Contact #2
        contact_name_2: form.contact_name_2?.trim() || '',
        email_2: form.email_2?.trim() || '',
        contact_2: form.contact_2?.trim() || '',
        // Contact #3
        contact_name_3: form.contact_name_3?.trim() || '',
        email_3: form.email_3?.trim() || '',
        contact_3: form.contact_3?.trim() || '',
        // Contact Administration
        contact_name_admin: form.contact_name_admin?.trim() || '',
        email_admin: form.email_admin?.trim() || '',
        contact_admin: form.contact_admin?.trim() || '',
        // Tarification
        hourly_rate_regular: form.hourly_rate_regular !== '' ? parseFloat(form.hourly_rate_regular) : null,
        transport_fee: form.transport_fee !== '' ? parseFloat(form.transport_fee) : null,
        email_billing: form.email_billing?.trim() || null,
        payment_terms: form.payment_terms || null,
        // Signataires
        signatory_1: form.signatory_1?.trim() || '',
        signatory_2: form.signatory_2?.trim() || '',
        signatory_3: form.signatory_3?.trim() || '',
        signatory_4: form.signatory_4?.trim() || '',
        signatory_5: form.signatory_5?.trim() || '',
      };

      const res = await fetch('/api/save-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Erreur lors de la sauvegarde');
      }

      onSaved(json.client);
      onClose();
      setForm({ ...EMPTY_FORM });
    } catch (error) {
      console.error('Erreur save client:', error);
      alert('Erreur: ' + error.message);
    } finally {
      setSaving(false);
    }
  }

  /* ---------- render helpers ---------- */
  const inputBase = "w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100";

  const colorStyles = {
    green: {
      border: 'border-green-300 dark:border-green-600 focus:border-green-500 focus:ring-green-200 dark:focus:ring-green-800',
      bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700',
      text: 'text-green-800 dark:text-green-300',
      icon: 'text-green-600 dark:text-green-400',
    },
    blue: {
      border: 'border-blue-300 dark:border-blue-600 focus:border-blue-500 focus:ring-blue-200 dark:focus:ring-blue-800',
      bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700',
      text: 'text-blue-800 dark:text-blue-300',
      icon: 'text-blue-600 dark:text-blue-400',
    },
    indigo: {
      border: 'border-indigo-300 dark:border-indigo-600 focus:border-indigo-500 focus:ring-indigo-200 dark:focus:ring-indigo-800',
      bg: 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-700',
      text: 'text-indigo-800 dark:text-indigo-300',
      icon: 'text-indigo-600 dark:text-indigo-400',
    },
    purple: {
      border: 'border-purple-300 dark:border-purple-600 focus:border-purple-500 focus:ring-purple-200 dark:focus:ring-purple-800',
      bg: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700',
      text: 'text-purple-800 dark:text-purple-300',
      icon: 'text-purple-600 dark:text-purple-400',
    },
  };

  // Fonction de rendu (PAS un composant React — évite le remount à chaque render)
  const renderContactSection = (title, Icon, color, fields) => {
    const styles = colorStyles[color];
    return (
      <div className={`${styles.bg} border p-4 rounded-lg`}>
        <h3 className={`text-lg font-semibold ${styles.text} mb-4 flex items-center`}>
          <Icon className={`w-5 h-5 mr-2 ${styles.icon}`} />
          {title}
        </h3>
        <div className="space-y-3">
          {fields.map(({ label, key, type = 'text', placeholder, required }) => (
            <div key={key}>
              <label className={`block text-sm font-medium ${styles.text} mb-1`}>
                {label} {required && <span className="text-red-600">*</span>}
              </label>
              <input
                type={type}
                className={`${inputBase} ${styles.border}`}
                value={form[key]}
                onChange={type === 'tel' ? onPhoneChange(key) : onChange(key)}
                placeholder={placeholder}
                autoComplete={type === 'email' ? 'email' : type === 'tel' ? 'tel' : undefined}
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  /* ---------- render ---------- */
  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white dark:bg-gray-900 w-full max-w-5xl max-h-[90vh] rounded-xl shadow-2xl relative overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* En-tête */}
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex-1">
                <h2 className="text-xl font-bold">
                  {client ? 'Modifier le client' : 'Nouveau client'}
                </h2>
                <p className="text-blue-100 text-sm mt-1">
                  {client ? 'Modifiez les informations' : 'Créez un nouveau contact avec ses contacts et signataires'}
                </p>
              </div>
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
                      Sauvegarde...
                    </div>
                  ) : (
                    client ? 'Mettre à jour' : 'Créer le client'
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Contenu du formulaire avec scroll */}
          <div className="overflow-y-auto max-h-[calc(90vh-140px)]">
            <div className="p-6 space-y-6">

              {/* Informations générales */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center">
                  <Building className="w-5 h-5 mr-2 text-blue-600" />
                  Informations générales
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                      Client *
                    </label>
                    <input
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all text-base bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      value={form.name}
                      onChange={onChange('name')}
                      placeholder="ex: Concrea, A Toulouse, Belvédère du Lac"
                      required
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                      Adresse civique
                    </label>
                    <textarea
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all text-base resize-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      value={form.address}
                      onChange={onChange('address')}
                      placeholder="ex: 3197, 42e Rue Nord, St-Georges, QC, G5Z 0V9"
                      rows="2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                      Temps de voyagement (minutes)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all text-base bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        value={form.travel_minutes}
                        onChange={onChange('travel_minutes')}
                        onFocus={(e) => e.target.select()}
                        placeholder="ex: 30"
                        inputMode="numeric"
                      />
                      <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap px-2">
                        = {(form.travel_minutes / 60 * 10).toFixed(1)} /10h
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Grid des 4 contacts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {renderContactSection("Contact Principal", User, "green", [
                  { label: 'Nom du contact', key: 'contact_name', placeholder: 'ex: Jean Tremblay' },
                  { label: 'Courriel', key: 'email', type: 'email', placeholder: 'contact@exemple.com' },
                  { label: 'Téléphone', key: 'phone', type: 'tel', placeholder: '(418) 225-3875' },
                ])}
                {renderContactSection("Contact #2", Users, "blue", [
                  { label: 'Nom du contact', key: 'contact_name_2', placeholder: 'ex: Marie Dupont' },
                  { label: 'Courriel', key: 'email_2', type: 'email', placeholder: 'contact2@exemple.com' },
                  { label: 'Téléphone', key: 'contact_2', type: 'tel', placeholder: '(418) 225-3875' },
                ])}
                {renderContactSection("Contact #3", Users, "indigo", [
                  { label: 'Nom du contact', key: 'contact_name_3', placeholder: 'ex: Pierre Roy' },
                  { label: 'Courriel', key: 'email_3', type: 'email', placeholder: 'contact3@exemple.com' },
                  { label: 'Téléphone', key: 'contact_3', type: 'tel', placeholder: '(418) 225-3875' },
                ])}
                {renderContactSection("Administration", Building, "purple", [
                  { label: 'Nom Admin', key: 'contact_name_admin', placeholder: 'ex: Julie Comptabilité' },
                  { label: 'Courriel Admin', key: 'email_admin', type: 'email', placeholder: 'admin@exemple.com' },
                  { label: 'Contact Admin', key: 'contact_admin', type: 'tel', placeholder: '(418) 225-3875' },
                ])}
              </div>

              {/* SECTION - Tarification */}
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 p-4 rounded-lg">
                <h3 className="text-lg font-semibold text-emerald-800 dark:text-emerald-300 mb-4 flex items-center">
                  <DollarSign className="w-5 h-5 mr-2 text-emerald-600 dark:text-emerald-400" />
                  Tarification
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Taux horaire spécial */}
                  <div>
                    <label className="block text-sm font-medium text-emerald-800 dark:text-emerald-300 mb-1">
                      Taux horaire spécial
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className={`${inputBase} border-emerald-300 dark:border-emerald-600 focus:border-emerald-500 focus:ring-emerald-200 dark:focus:ring-emerald-800 pr-10`}
                        value={form.hourly_rate_regular}
                        onChange={onChange('hourly_rate_regular')}
                        onFocus={(e) => e.target.select()}
                        placeholder={defaultRate ? `${defaultRate.toFixed(2)}` : '0.00'}
                        inputMode="decimal"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-emerald-600 dark:text-emerald-400">$/h</span>
                    </div>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                      Vide = taux par défaut{defaultRate ? ` (${defaultRate.toFixed(2)} $/h)` : ''}
                    </p>
                  </div>

                  {/* Frais de transport */}
                  <div>
                    <label className="block text-sm font-medium text-emerald-800 dark:text-emerald-300 mb-1">
                      Frais de transport
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className={`${inputBase} border-emerald-300 dark:border-emerald-600 focus:border-emerald-500 focus:ring-emerald-200 dark:focus:ring-emerald-800 pr-8`}
                        value={form.transport_fee}
                        onChange={onChange('transport_fee')}
                        onFocus={(e) => e.target.select()}
                        placeholder="0.00"
                        inputMode="decimal"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-emerald-600 dark:text-emerald-400">$</span>
                    </div>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                      Vide = aucun frais de transport
                    </p>
                  </div>

                  {/* Email facturation */}
                  <div>
                    <label className="block text-sm font-medium text-emerald-800 dark:text-emerald-300 mb-1">
                      Courriel facturation
                    </label>
                    <input
                      type="email"
                      className={`${inputBase} border-emerald-300 dark:border-emerald-600 focus:border-emerald-500 focus:ring-emerald-200 dark:focus:ring-emerald-800`}
                      value={form.email_billing}
                      onChange={onChange('email_billing')}
                      placeholder="facture@exemple.com"
                      autoComplete="email"
                    />
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                      Vide = utilise admin / principal
                    </p>
                  </div>

                  {/* Conditions de paiement */}
                  <div>
                    <label className="block text-sm font-medium text-emerald-800 dark:text-emerald-300 mb-1">
                      Conditions de paiement
                    </label>
                    <select
                      className={`${inputBase} border-emerald-300 dark:border-emerald-600 focus:border-emerald-500 focus:ring-emerald-200 dark:focus:ring-emerald-800`}
                      value={form.payment_terms}
                      onChange={onChange('payment_terms')}
                    >
                      {PAYMENT_TERMS_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION - Signataires */}
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 p-4 rounded-lg">
                <h3 className="text-lg font-semibold text-orange-800 dark:text-orange-300 mb-4 flex items-center">
                  <PenTool className="w-5 h-5 mr-2 text-orange-600 dark:text-orange-400" />
                  Signataires autorisés
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  {[1, 2, 3, 4, 5].map(n => (
                    <div key={n}>
                      <label className="block text-sm font-medium text-orange-800 dark:text-orange-300 mb-1">
                        Signataire #{n}
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 border border-orange-300 dark:border-orange-600 rounded-md focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-200 dark:focus:ring-orange-800 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        value={form[`signatory_${n}`]}
                        onChange={onChange(`signatory_${n}`)}
                        placeholder="Nom complet"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
                  Personnes autorisées à signer les bons de travail pour ce client
                </p>
              </div>

            </div>
          </div>
        </div>
      </div>
    </>
  );
}
