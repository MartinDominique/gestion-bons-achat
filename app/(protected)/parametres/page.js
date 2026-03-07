/**
 * @file app/(protected)/parametres/page.js
 * @description Page de paramètres de l'application
 *              - Section Apparence (thème clair/sombre)
 *              - Section Taux & Tarifs horaires (taux régulier, 1.5x, 2x, augmentation)
 *              - Section Facturation (numéros taxes, taux TPS/TVQ, conditions, N° facture)
 * @version 2.0.1
 * @date 2026-03-07
 * @changelog
 *   2.0.1 - Ajout attributs autoCorrect/autoCapitalize/spellCheck sur les champs texte
 *   2.0.0 - Ajout sections Taux & Tarifs et Facturation (Phase A Fondations)
 *   1.0.0 - Version initiale - Sélecteur de thème
 */

'use client';

import { useTheme } from 'next-themes';
import { useState, useEffect, useCallback } from 'react';
import { Sun, Moon, Monitor, DollarSign, FileText, Save, RefreshCw, AlertTriangle } from 'lucide-react';

export default function ParametresPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Settings state
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  // Charger les paramètres
  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/settings');
      const json = await res.json();
      if (json.success) {
        setSettings(json.data);
      } else {
        setError(json.error || 'Erreur lors du chargement');
      }
    } catch (err) {
      console.error('Erreur chargement paramètres:', err);
      setError('Impossible de charger les paramètres');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Sauvegarder les paramètres
  const saveSettings = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccessMsg('');

      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const json = await res.json();

      if (json.success) {
        setSettings(json.data);
        setDirty(false);
        setSuccessMsg('Paramètres sauvegardés');
        setTimeout(() => setSuccessMsg(''), 3000);
      } else {
        setError(json.error || 'Erreur lors de la sauvegarde');
      }
    } catch (err) {
      console.error('Erreur sauvegarde paramètres:', err);
      setError('Impossible de sauvegarder');
    } finally {
      setSaving(false);
    }
  };

  // Helper pour mettre à jour un champ
  const updateField = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  // Calculs dérivés
  const rate = settings?.default_hourly_rate || 0;
  const rate15 = (rate * 1.5).toFixed(2);
  const rate2 = (rate * 2).toFixed(2);
  const increasePct = settings?.hourly_rate_increase_pct || 0;
  const newRate = increasePct > 0 ? (rate * (1 + increasePct / 100)).toFixed(2) : null;

  if (!mounted) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">Parametres</h1>
        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-48 rounded-xl"></div>
      </div>
    );
  }

  const themeOptions = [
    { value: 'system', label: 'Systeme (auto)', description: 'Suit les preferences de votre appareil', icon: Monitor },
    { value: 'light', label: 'Clair', description: 'Theme clair en permanence', icon: Sun },
    { value: 'dark', label: 'Sombre', description: 'Theme sombre en permanence', icon: Moon },
  ];

  const paymentTermsOptions = [
    'Net 30 jours',
    '2% 10 Net 30 jours',
    'Payable sur réception',
  ];

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Paramètres</h1>
        {dirty && (
          <button
            onClick={saveSettings}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 font-medium"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        )}
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {successMsg && (
        <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg">
          {successMsg}
        </div>
      )}

      {/* ======== SECTION APPARENCE ======== */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Apparence</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Choisissez le thème de l&apos;application. Le mode &quot;Système&quot; s&apos;adapte automatiquement
          aux préférences de votre appareil.
        </p>
        <div className="grid gap-3">
          {themeOptions.map(({ value, label, description, icon: Icon }) => {
            const isActive = theme === value;
            return (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-all text-left ${
                  isActive
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-400'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <div className={`p-2 rounded-lg ${
                  isActive
                    ? 'bg-blue-100 text-blue-600 dark:bg-blue-800 dark:text-blue-300'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                }`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className={`font-medium ${
                    isActive ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'
                  }`}>{label}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
                </div>
                {isActive && (
                  <div className="ml-auto">
                    <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ======== SECTION TAUX & TARIFS ======== */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
          Taux & Tarifs horaires
        </h2>

        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg w-1/2"></div>
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg w-1/3"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Taux horaires */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Taux régulier (1x)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    value={settings?.default_hourly_rate ?? ''}
                    onChange={(e) => updateField('default_hourly_rate', parseFloat(e.target.value) || 0)}
                    onFocus={(e) => e.target.select()}
                    inputMode="decimal"
                    placeholder="0.00"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">$/h</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Temps et demi (1.5x)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    readOnly
                    className="w-full px-3 py-2 pr-10 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 cursor-not-allowed"
                    value={rate15}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$/h</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Soirs + Samedis + Dimanches</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Temps double (2x)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    readOnly
                    className="w-full px-3 py-2 pr-10 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 cursor-not-allowed"
                    value={rate2}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$/h</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Jours fériés</p>
              </div>
            </div>

            {/* Augmentation annuelle */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Augmentation annuelle</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Augmentation prévue
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      className="w-full px-3 py-2 pr-8 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      value={settings?.hourly_rate_increase_pct ?? ''}
                      onChange={(e) => updateField('hourly_rate_increase_pct', parseFloat(e.target.value) || 0)}
                      onFocus={(e) => e.target.select()}
                      inputMode="decimal"
                      placeholder="0.0"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">%</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Date d&apos;application
                  </label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    value={settings?.hourly_rate_increase_date || ''}
                    onChange={(e) => updateField('hourly_rate_increase_date', e.target.value || null)}
                  />
                </div>
              </div>
              {newRate && (
                <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
                  Aperçu : {rate.toFixed(2)} $ → {newRate} $/h (+{(newRate - rate).toFixed(2)} $)
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ======== SECTION FACTURATION ======== */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          Facturation
        </h2>

        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg w-2/3"></div>
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg w-1/2"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Numéros de taxes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Numéro TPS
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  value={settings?.invoice_tps_number ?? ''}
                  onChange={(e) => updateField('invoice_tps_number', e.target.value)}
                  onFocus={(e) => e.target.select()}
                  placeholder="123456789 RT0001"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Numéro TVQ
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  value={settings?.invoice_tvq_number ?? ''}
                  onChange={(e) => updateField('invoice_tvq_number', e.target.value)}
                  onFocus={(e) => e.target.select()}
                  placeholder="1234567890 TQ0001"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>
            </div>

            {/* Taux de taxes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Taux TPS
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    max="100"
                    className="w-full px-3 py-2 pr-8 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    value={settings?.tps_rate ?? ''}
                    onChange={(e) => updateField('tps_rate', parseFloat(e.target.value) || 0)}
                    onFocus={(e) => e.target.select()}
                    inputMode="decimal"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">%</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Taux TVQ
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    max="100"
                    className="w-full px-3 py-2 pr-8 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    value={settings?.tvq_rate ?? ''}
                    onChange={(e) => updateField('tvq_rate', parseFloat(e.target.value) || 0)}
                    onFocus={(e) => e.target.select()}
                    inputMode="decimal"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">%</span>
                </div>
              </div>
            </div>

            {/* Conditions de paiement */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Conditions de paiement par défaut
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                value={settings?.default_payment_terms || 'Net 30 jours'}
                onChange={(e) => updateField('default_payment_terms', e.target.value)}
              >
                {paymentTermsOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            {/* Note pied de facture */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Note en pied de facture
              </label>
              <textarea
                rows="2"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none"
                value={settings?.invoice_footer_note ?? ''}
                onChange={(e) => updateField('invoice_footer_note', e.target.value)}
                placeholder="Merci de votre confiance!"
                autoCorrect="on"
                autoCapitalize="sentences"
                spellCheck={true}
              />
            </div>

            {/* Prochain numéro de facture */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <div className="max-w-xs">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Prochain numéro de facture
                </label>
                <input
                  type="number"
                  min="1"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  value={settings?.invoice_next_number ?? ''}
                  onChange={(e) => updateField('invoice_next_number', parseInt(e.target.value) || 1)}
                  onFocus={(e) => e.target.select()}
                  inputMode="numeric"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Entrez le numéro courant d&apos;Acomba. S&apos;incrémente automatiquement après chaque facture.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bouton sauvegarder en bas (sticky pour mobile) */}
      {dirty && (
        <div className="sticky bottom-4 flex justify-end">
          <button
            onClick={saveSettings}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors disabled:opacity-50 font-medium shadow-lg"
          >
            {saving ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            {saving ? 'Sauvegarde...' : 'Sauvegarder les paramètres'}
          </button>
        </div>
      )}
    </div>
  );
}
