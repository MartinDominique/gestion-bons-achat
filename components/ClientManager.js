'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function ClientManager({ onSelect }) {
  const supabase = createClientComponentClient();
  const [clients, setClients] = useState([]);
  const [term, setTerm] = useState('');

  // Charger tous les clients au montage
  useEffect(() => {
    supabase.from('clients').select('*').then(({ data }) => setClients(data || []));
  }, []);

  // Ajouter un client
  async function addClient(name, address) {
    const { data, error } = await supabase.from('clients')
      .insert({ name, address })
      .select().single();
    if (!error) setClients(prev => [...prev, data]);
  }

  const filtered = clients.filter(c => c.name.toLowerCase().includes(term.toLowerCase()));

  return (
    <div>
      <input
        type="text"
        placeholder="Rechercher client..."
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        className="w-full p-2 border rounded mb-2"
      />

      <ul className="max-h-40 overflow-auto border rounded">
        {filtered.map(c => (
          <li
            key={c.id}
            onClick={() => onSelect(c)}
            className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
          >
            {c.name}
          </li>
        ))}
      </ul>

      {/* Ex : modal add client (à implémenter ou simple prompt) */}
      <button
        onClick={() => {
          const name = prompt('Nom :');
          if (!name) return;
          const address = prompt('Adresse :') || '';
          addClient(name, address);
        }}
        className="mt-2 bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded"
      >
        ➕ Client
      </button>
    </div>
  );
}
