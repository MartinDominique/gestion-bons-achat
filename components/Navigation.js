'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Package, FileText, LogOut, Users } from 'lucide-react';
import { createClient } from '../lib/supabase';
import { useEffect, useState } from 'react';

const pages = [
  { id: 'bons-achat', name: "Bons d'achat", icon: Package },
  { id: 'soumissions', name: 'Soumissions', icon: FileText }
];

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState(null);
  const [showClientManager, setShowClientManager] = useState(false);
  const [clients, setClients] = useState([]);
  const [showClientForm, setShowClientForm] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [clientForm, setClientForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    contact_person: ''
  });

  useEffect(() => {
    // Récupérer l'utilisateur actuel
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };

    getUser();

    // Déconnexion automatique à la fermeture du navigateur
    const handleBeforeUnload = () => {
      supabase.auth.signOut();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Écouter les changements d'auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [supabase.auth]);

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        console.error('Erreur chargement clients:', error);
      } else {
        setClients(data || []);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des clients:', error);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleClientSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingClient) {
        const { error } = await supabase
          .from('clients')
          .update(clientForm)
          .eq('id', editingClient.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('clients')
          .insert([clientForm]);
        if (error) throw error;
      }

      await fetchClients();
      setShowClientForm(false);
      setEditingClient(null);
      setClientForm({
        name: '',
        email: '',
        phone: '',
        address: '',
        contact_person: ''
      });
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const handleDeleteClient = async (id) => {
    if (!confirm('🗑️ Êtes-vous sûr de vouloir supprimer ce client ?\n\n⚠️ ATTENTION: Cela supprimera aussi TOUTES ses soumissions et bons d\'achat !')) return;
    
    try {
      // Récupérer le nom du client pour identifier ses données
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('name')
        .eq('id', id)
        .single();

      if (clientError) throw clientError;
      
      const clientName = clientData.name;
      console.log('🗑️ Suppression en cascade pour:', clientName);

      // 1. Supprimer toutes les soumissions du client
      const { error: submissionsError } = await supabase
        .from('submissions')
        .delete()
        .eq('client_name', clientName);

      if (submissionsError) {
        console.error('Erreur suppression soumissions:', submissionsError);
        // Continuer même si erreur (peut-être pas de soumissions)
      }

      // 2. Supprimer tous les bons d'achat du client
      const { error: purchaseOrdersError } = await supabase
        .from('purchase_orders')
        .delete()
        .or(`client_name.eq.${clientName},client.eq.${clientName}`);

      if (purchaseOrdersError) {
        console.error('Erreur suppression bons d\'achat:', purchaseOrdersError);
        // Continuer même si erreur
      }

      // 3. Supprimer le client lui-même
      const { error: clientDeleteError } = await supabase
        .from('clients')
        .delete()
        .eq('id', id);

      if (clientDeleteError) throw clientDeleteError;

      // 4. Rafraîchir la liste
      await fetchClients();
      
      console.log('✅ Suppression en cascade réussie pour:', clientName);
    } catch (error) {
      console.error('Erreur suppression en cascade:', error);
      alert('❌ Erreur lors de la suppression: ' + error.message);
    }
  };

  return (
    <>
      <nav className="bg-white shadow-md mb-6 print:shadow-none">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-20">
            
            {/* Logo à gauche - AGRANDI 3X */}
            <div className="flex items-center">
              <div className="flex-shrink-0 mr-6">
                <Image
                  src="/logo.png"
                  alt="Services TMT Logo"
                  width={315}
                  height={142}
                  className="w-32 h-auto rounded-lg object-contain"
                  priority
                />
              </div>
              
              {/* Nom de l'entreprise */}
              <div className="hidden lg:block">
                <h1 className="text-xl font-bold text-gray-900">o</h1>
                <p className="text-sm text-gray-500">Gestion des soumissions</p>
              </div>
            </div>

            {/* Navigation centrale */}
            <div className="flex space-x-4">
              {pages.map(({ id, name, icon: Icon }) => {
                const active = pathname.startsWith('/' + id);
                return (
                  <Link
                    key={id}
                    href={`/${id}`}
                    className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${
                      active
                        ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-5 h-5 mr-2" />
                    {name}
                  </Link>
                );
              })}
              
              {/* Bouton Gestion des Clients */}
              <button
                onClick={() => {
                  setShowClientManager(true);
                  fetchClients();
                }}
                className="flex items-center px-4 py-2 rounded-lg font-medium text-green-600 hover:text-green-900 hover:bg-green-100 transition-colors"
              >
                <Users className="w-5 h-5 mr-2" />
                Gestion des Clients
              </button>
            </div>

            {/* Utilisateur et déconnexion à droite */}
            {user && (
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-700 hidden md:block">
                  Bonjour {user.email}
                </span>
                <button
                  onClick={handleSignOut}
                  className="flex items-center text-red-600 hover:text-red-800 transition-colors"
                >
                  <LogOut className="w-4 h-4 mr-1" />
                  <span className="hidden sm:block">Se déconnecter</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Modal Gestion des Clients */}
      {showClientManager && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-green-600">👥 Gestion des Clients</h2>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowClientForm(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  ➕ Nouveau Client
                </button>
                <button
                  onClick={() => setShowClientManager(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  ❌ Fermer
                </button>
              </div>
            </div>

            {/* Liste des clients */}
            <div className="space-y-4">
              {clients.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p>Aucun client enregistré</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {clients.map((client) => (
                    <div key={client.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{client.name}</h3>
                          <div className="text-sm text-gray-600 mt-1 space-y-1">
                            {client.email && <p>📧 {client.email}</p>}
                            {client.phone && <p>📞 {client.phone}</p>}
                            {client.address && <p>📍 {client.address}</p>}
                            {client.contact_person && <p>👤 Contact: {client.contact_person}</p>}
                          </div>
                        </div>
                        <div className="flex space-x-2 ml-4">
                          <button
                            onClick={() => {
                              setEditingClient(client);
                              setClientForm(client);
                              setShowClientForm(true);
                            }}
                            className="px-3 py-1 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 text-sm"
                          >
                            ✏️ Modifier
                          </button>
                          <button
                            onClick={() => handleDeleteClient(client.id)}
                            className="px-3 py-1 bg-red-100 text-red-800 rounded hover:bg-red-200 text-sm"
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
        </div>
      )}

      {/* Modal Formulaire Client */}
      {showClientForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
            <h3 className="text-xl font-bold text-green-600 mb-4">
              {editingClient ? '✏️ Modifier Client' : '➕ Nouveau Client'}
            </h3>
            
            <form onSubmit={handleClientSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Nom *</label>
                  <input
                    type="text"
                    value={clientForm.name}
                    onChange={(e) => setClientForm({...clientForm, name: e.target.value})}
                    className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 p-3"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    value={clientForm.email}
                    onChange={(e) => setClientForm({...clientForm, email: e.target.value})}
                    className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 p-3"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Téléphone</label>
                  <input
                    type="tel"
                    value={clientForm.phone}
                    onChange={(e) => setClientForm({...clientForm, phone: e.target.value})}
                    className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 p-3"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Personne Contact</label>
                  <input
                    type="text"
                    value={clientForm.contact_person}
                    onChange={(e) => setClientForm({...clientForm, contact_person: e.target.value})}
                    className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 p-3"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Adresse</label>
                <textarea
                  value={clientForm.address}
                  onChange={(e) => setClientForm({...clientForm, address: e.target.value})}
                  className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 p-3"
                  rows="3"
                />
              </div>
              
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowClientForm(false);
                    setEditingClient(null);
                    setClientForm({
                      name: '',
                      email: '',
                      phone: '',
                      address: '',
                      contact_person: ''
                    });
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  {editingClient ? 'Mettre à jour' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
