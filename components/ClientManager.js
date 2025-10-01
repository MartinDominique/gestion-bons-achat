'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { User, Users, Building, Mail, Phone, Plus, Search } from 'lucide-react';

export default function ClientManager({ onSelect }) {
  const supabase = createClientComponentClient();
  const [clients, setClients] = useState([]);
  const [term, setTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // Charger tous les clients au montage
  useEffect(() => {
    loadClients();
  }, []);

  async function loadClients() {
    setLoading(true);
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('name');
    
    if (!error) {
      setClients(data || []);
    }
    setLoading(false);
  }

  // Ajouter un client (fonction simple pour compatibilité)
  async function addClient(name, address) {
    const { data, error } = await supabase.from('clients')
      .insert({ name, address })
      .select().single();
    if (!error) {
      setClients(prev => [...prev, data]);
    }
  }

  // Filtrer les clients par nom, entreprise ou emails
  const filtered = clients.filter(c => {
    const searchTerm = term.toLowerCase();
    return (
      c.name?.toLowerCase().includes(searchTerm) ||
      c.company?.toLowerCase().includes(searchTerm) ||
      c.email?.toLowerCase().includes(searchTerm) ||
      c.email_2?.toLowerCase().includes(searchTerm) ||
      c.email_admin?.toLowerCase().includes(searchTerm)
    );
  });

  // Fonction pour compter les contacts remplis
  function countContacts(client) {
    let count = 0;
    if (client.email || client.phone) count++;
    if (client.email_2 || client.contact_2) count++;
    if (client.email_admin || client.contact_admin) count++;
    return count;
  }

  // Fonction pour afficher un contact compact
  function ContactBadge({ icon: Icon, label, email, phone, color }) {
    if (!email && !phone) return null;
    
    return (
      <div className={`flex items-center space-x-1 text-xs px-2 py-1 rounded-full ${color}`}>
        <Icon className="w-3 h-3" />
        <span className="font-medium">{label}</span>
        {email && <Mail className="w-3 h-3 opacity-70" />}
        {phone && <Phone className="w-3 h-3 opacity-70" />}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      {/* En-tête avec recherche */}
      <div className="p-4 border-b bg-gray-50">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Rechercher par nom, entreprise ou email..."
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
          />
        </div>
      </div>

      {/* Liste des clients */}
      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-gray-500">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent mx-auto mb-2"></div>
            Chargement...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            {term ? 'Aucun client trouvé' : 'Aucun client'}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map(client => (
              <div
                key={client.id}
                onClick={() => onSelect(client)}
                className="p-4 hover:bg-gray-50 cursor-pointer transition-colors group"
              >
                {/* Ligne principale */}
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {client.name}
                      </h3>
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                        {countContacts(client)} contact{countContacts(client) > 1 ? 's' : ''}
                      </span>
                    </div>
                    
                    {client.company && (
                      <p className="text-sm text-gray-600 mb-2 truncate">
                        🏢 {client.company}
                      </p>
                    )}

                    {/* Badges des contacts */}
                    <div className="flex flex-wrap gap-1">
                      <ContactBadge
                        icon={User}
                        label="Principal"
                        email={client.email}
                        phone={client.phone}
                        color="bg-green-100 text-green-800"
                      />
                      <ContactBadge
                        icon={Users}
                        label="#2"
                        email={client.email_2}
                        phone={client.contact_2}
                        color="bg-blue-100 text-blue-800"
                      />
                      <ContactBadge
                        icon={Building}
                        label="Admin"
                        email={client.email_admin}
                        phone={client.contact_admin}
                        color="bg-purple-100 text-purple-800"
                      />
                    </div>
                  </div>

                  {/* Flèche de sélection */}
                  <div className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                      <span className="text-white text-xs">→</span>
                    </div>
                  </div>
                </div>

                {/* Détails des contacts au survol (optionnel) */}
                <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity max-h-0 group-hover:max-h-32 overflow-hidden">
                  <div className="text-xs text-gray-500 space-y-1 pt-2 border-t border-gray-200">
                    {(client.email || client.phone) && (
                      <div className="flex items-center space-x-2">
                        <User className="w-3 h-3 text-green-600" />
                        <span>Principal:</span>
                        {client.email && <span>{client.email}</span>}
                        {client.phone && <span>{client.phone}</span>}
                      </div>
                    )}
                    {(client.email_2 || client.contact_2) && (
                      <div className="flex items-center space-x-2">
                        <Users className="w-3 h-3 text-blue-600" />
                        <span>Contact #2:</span>
                        {client.email_2 && <span>{client.email_2}</span>}
                        {client.contact_2 && <span>{client.contact_2}</span>}
                      </div>
                    )}
                    {(client.email_admin || client.contact_admin) && (
                      <div className="flex items-center space-x-2">
                        <Building className="w-3 h-3 text-purple-600" />
                        <span>Administration:</span>
                        {client.email_admin && <span>{client.email_admin}</span>}
                        {client.contact_admin && <span>{client.contact_admin}</span>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bouton ajouter client */}
      <div className="p-4 border-t bg-gray-50">
        <button
          onClick={() => {
            const name = prompt('Nom du client:');
            if (!name) return;
            const address = prompt('Adresse:') || '';
            addClient(name, address);
          }}
          className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white px-4 py-2 rounded-lg transition-all font-medium flex items-center justify-center space-x-2 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Nouveau Client</span>
        </button>
      </div>
    </div>
  );
}
