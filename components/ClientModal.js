'use client';
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { X } from 'lucide-react';

export default function ClientModal({ open, onClose, onSaved, client }) {
  const [form, setForm] = useState(
    client ?? { name: '', company: '', email: '', phone: '' }
  );
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const save = async () => {
    if (!form.name) return alert('Nom requis');
    setSaving(true);
    const { error } = await supabase
      .from('clients')
      .upsert({ ...form, id: client?.id });
    setSaving(false);
    if (error) return alert(error.message);
    onSaved();      // rechargera la liste
    onClose();
  };

  const onChange = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white w-full max-w-md rounded-lg p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
        >
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold mb-4">
          {client ? 'Modifier client' : 'Nouveau client'}
        </h2>

        <label className="block text-sm mt-3">
          Nom*
          <input
            className="mt-1 w-full px-3 py-2 border rounded"
            value={form.name}
            onChange={onChange('name')}
            required
          />
        </label>

        <label className="block text-sm mt-3">
          Entreprise
          <input
            className="mt-1 w-full px-3 py-2 border rounded"
            value={form.company}
            onChange={onChange('company')}
          />
        </label>

        <label className="block text-sm mt-3">
          Courriel
          <input
            type="email"
            className="mt-1 w-full px-3 py-2 border rounded"
            value={form.email}
            onChange={onChange('email')}
          />
        </label>

        <label className="block text-sm mt-3">
          Téléphone
          <input
            className="mt-1 w-full px-3 py-2 border rounded"
            value={form.phone}
            onChange={onChange('phone')}
          />
        </label>

        <button
          onClick={save}
          disabled={saving}
          className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg disabled:opacity-50"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
