'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { User, Users, Building, Search, Plus, X } from 'lucide-react';
import ClientModal from './ClientModal';

export default function ClientManager({ onClose }) {
  const supabase = createClientComponentClient();
  const [clients, setClients] = useState([]);
  const [term, setTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showClientForm, setShowClientForm] = useState(false);
  const [editingClient, setEditingClient] = useState(null);

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

  // Fonction de suppression en cascade
  const handleDeleteClient = async (id) => {
    if (!confirm('🗑️ Êtes-vous sûr de vouloir supprimer ce client ?\n\n⚠️ ATTENTION: Cela supprimera aussi TOUTES ses soumissions et bons d\'achat !')) return;
    
    try {
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('name')
        .eq('id', id)
        .single();

      if (clientError) throw clientError;
      
      const clientName = clientData.name;
      console.log('🗑️ Suppression en cascade pour:', clientName);

      const { error: submissionsError } = await supabase
        .from('submissions')
        .delete()
        .eq('client_name', clientName);

      if (submissionsError) {
        console.error('Erreur suppression soumissions:', submissionsError);
      }

      const { error: purchaseOrdersError } = await supabase
        .from('purchase_orders')
        .delete()
        .or(`client_name.eq.${clientName},client.eq.${clientName}`);

      if (purchaseOrdersError) {
        console.error('Erreur suppression bons d\'achat:', purchaseOrdersError);
      }

      const { error: clientDeleteError } = await supabase
        .from('clients')
        .delete()
        .eq('id', id);

      if (clientDeleteError) throw clientDeleteError;

      await loadClients();
      
      console.log('✅ Suppression en cascade réussie pour:', clientName);
    } catch (error) {
      console.error('Erreur suppression en cascade:', error);
      alert('❌ Erreur lors de la suppression: ' + error.message);
    }
  };

  return (
    <>
      <div className="flex flex-col h-full">
        
        {/* En-tête avec titre et bouton fermer */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-4 sm:p-6 border-b bg-green-50">
          <h2 className="text-xl sm:text-2xl font-bold text-green-600 mb-3 sm:mb-0">
            👥 Gestion des Clients
          </h2>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={() => {
                setEditingClient(null);
                setShowClientForm(true);
              }}
              className="w-full sm:w-auto px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Nouveau Client
            </button>
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm font-medium flex items-center justify-center gap-2"
            >
              <X className="w-4 h-4" />
              Fermer
            </button>
          </div>
        </div>

        {/* Barre de recherche */}
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
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="text-center py-8 text-gray-500">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent mx-auto mb-2"></div>
              Chargement...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p>{term ? 'Aucun client trouvé' : 'Aucun client enregistré'}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filtered.map((client) => (
                <div key={client.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                  
                  {/* Affichage mobile-first */}
                  <div className="flex flex-col sm:flex-row sm:justify-between">
                    <div className="flex-1 mb-3 sm:mb-0">
                      <h3 className="font-semibold text-gray-900 text-lg">{client.name}</h3>
                      <div className="text-sm text-gray-600 mt-2 space-y-1">
                        
                        {/* Contact Principal */}
                        {(client.email || client.phone) && (
                          <div className="bg-green-50 p-2 rounded mb-2">
                            <div className="flex items-center mb-1">
                              <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded font-medium mr-2">Principal</span>
                              {(client.contact_name || client.contact_person) && (
                                <span className="text-sm font-medium text-green-800">
                                  {client.contact_name || client.contact_person}
                                </span>
                              )}
                            </div>
                            {client.email && (
                              <p className="flex items-center text-sm">
                                <span className="mr-2">📧</span>
                                <a href={`mailto:${client.email}`} className="text-blue-600 hover:underline">
                                  {client.email}
                                </a>
                              </p>
                            )}
                            {client.phone && (
                              <p className="flex items-center text-sm">
                                <span className="mr-2">📞</span>
                                <a href={`tel:${client.phone}`} className="text-blue-600 hover:underline">
                                  {client.phone}
                                </a>
                              </p>
                            )}
                          </div>
                        )}
                        
                        {/* Contact #2 */}
                        {(client.email_2 || client.contact_2) && (
                          <div className="bg-blue-50 p-2 rounded mb-2">
                            <div className="flex items-center mb-1">
                              <span className="text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded font-medium mr-2">Contact #2</span>
                              {client.contact_name_2 && (
                                <span className="text-sm font-medium text-blue-800">
                                  {client.contact_name_2}
                                </span>
                              )}
                            </div>
                            {client.email_2 && (
                              <p className="flex items-center text-sm">
                                <span className="mr-2">📧</span>
                                <a href={`mailto:${client.email_2}`} className="text-blue-600 hover:underline">
                                  {client.email_2}
                                </a>
                              </p>
                            )}
                            {client.contact_2 && (
                              <p className="flex items-center text-sm">
                                <span className="mr-2">📞</span>
                                <a href={`tel:${client.contact_2}`} className="text-blue-600 hover:underline">
                                  {client.contact_2}
                                </a>
                              </p>
                            )}
                          </div>
                        )}
                        
                        {/* Contact Administration */}
                        {(client.email_admin || client.contact_admin) && (
                          <div className="bg-purple-50 p-2 rounded mb-2">
                            <div className="flex items-center mb-1">
                              <span className="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded font-medium mr-2">Administration</span>
                              {client.contact_name_admin && (
                                <span className="text-sm font-medium text-purple-800">
                                  {client.contact_name_admin}
                                </span>
                              )}
                            </div>
                            {client.email_admin && (
                              <p className="flex items-center text-sm">
                                <span className="mr-2">📧</span>
                                <a href={`mailto:${client.email_admin}`} className="text-blue-600 hover:underline">
                                  {client.email_admin}
                                </a>
                              </p>
                            )}
                            {client.contact_admin && (
                              <p className="flex items-center text-sm">
                                <span className="mr-2">📞</span>
                                <a href={`tel:${client.contact_admin}`} className="text-blue-600 hover:underline">
                                  {client.contact_admin}
                                </a>
                              </p>
                            )}
                          </div>
                        )}
                        
                        {/* Adresse */}
                        {client.address && (
                          <p className="flex items-start">
                            <span className="mr-2 mt-0.5">📍</span>
                            <span>{client.address}</span>
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {/* Boutons actions responsive */}
                    <div className="flex flex-col sm:flex-row gap-2 sm:ml-4">
                      <button
                        onClick={() => {
                          setEditingClient(client);
                          setShowClientForm(true);
                        }}
                        className="w-full sm:w-auto px-3 py-2 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 text-sm font-medium"
                      >
                        ✏️ Modifier
                      </button>
                      <button
                        onClick={() => handleDeleteClient(client.id)}
                        className="w-full sm:w-auto px-3 py-2 bg-red-100 text-red-800 rounded hover:bg-red-200 text-sm font-medium"
                      >
                        🗑️ Supprimer
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal pour créer/modifier client */}
      <ClientModal
        open={showClientForm}
        onClose={() => {
          setShowClientForm(false);
          setEditingClient(null);
        }}
        onSaved={() => {
          loadClients();
          setShowClientForm(false);
          setEditingClient(null);
        }}
        client={editingClient}
      />
    </>
  );
}
