'use client';

import { Package, FileText, LogOut, Users, Menu, X, ShoppingCart, Truck, Warehouse } from 'lucide-react';
//
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '../lib/supabase';
import { useEffect, useState } from 'react';
import InventoryManager from './InventoryManager.js';

const pages = [
  { id: 'bons-achat', name: "Bons d'achat Clients", icon: Package },
  { id: 'soumissions', name: 'Soumissions', icon: FileText },
  { id: 'inventaire', name: 'Inventaire', icon: Warehouse },
  { id: 'achat-materiels', name: 'Achat Matériels', icon: ShoppingCart },
  { id: 'dashboard-livraisons', name: 'Dashboard Fournisseurs', icon: Truck },
];

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showClientManager, setShowClientManager] = useState(false);
  const [clients, setClients] = useState([]);
  const [showClientForm, setShowClientForm] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  
  // 📱 NOUVEAU: État pour menu mobile
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const [clientForm, setClientForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    contact_person: ''
  });

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        
        if (error) {
          console.error('Erreur auth:', error);
          setUser(null);
        } else {
          setUser(user);
        }

        const protectedRoutes = ['/bons-', '/soumissions'];
        const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));
        
        if (isProtectedRoute && !user) {
          console.log('🚫 Accès non autorisé à:', pathname);
          router.push('/login');
        }
        
      } catch (error) {
        console.error('Erreur lors de la vérification:', error);
        setUser(null);
        router.push('/login');
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();

    const handleBeforeUnload = () => {
      supabase.auth.signOut();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth event:', event);
      setUser(session?.user || null);
      
      if (event === 'SIGNED_OUT' || !session) {
        router.push('/login');
      }
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [supabase.auth, pathname, router]);

  // 📱 NOUVEAU: Fermer menu mobile quand on change de page
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

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
    try {
      await supabase.auth.signOut();
      router.push('/login');
    } catch (error) {
      console.error('Erreur déconnexion:', error);
    }
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

      await fetchClients();
      
      console.log('✅ Suppression en cascade réussie pour:', clientName);
    } catch (error) {
      console.error('Erreur suppression en cascade:', error);
      alert('❌ Erreur lors de la suppression: ' + error.message);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Vérification de l'authentification...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <>
      {/* 📱 NAVIGATION MOBILE-FIRST */}
      <nav className="bg-white shadow-md mb-6 print:shadow-none">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16 md:h-20">
            
            {/* 📱 Logo adaptatif */}
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Image
                  src="/logo.png"
                  alt="Services TMT Logo"
                  width={315}
                  height={142}
                  className="w-20 h-auto md:w-32 rounded-lg object-contain"
                  priority
                />
              </div>
            </div>

            {/* 📱 Navigation desktop (cachée sur mobile) */}
            <div className="hidden md:flex md:items-center md:space-x-4">
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

            {/* 📱 Actions à droite */}
            <div className="flex items-center space-x-2">
              {/* 📱 Info utilisateur (adaptatif) */}
              {user && (
                <div className="hidden sm:flex items-center space-x-3">
                  <span className="text-sm text-gray-700 hidden lg:block">
                    Bonjour {user.email}
                  </span>
                  <button
                    onClick={handleSignOut}
                    className="flex items-center text-red-600 hover:text-red-800 transition-colors p-2"
                  >
                    <LogOut className="w-4 h-4 mr-1" />
                    <span className="hidden md:block">Se déconnecter</span>
                  </button>
                </div>
              )}

              {/* 📱 Bouton déconnexion mobile uniquement */}
              <button
                onClick={handleSignOut}
                className="sm:hidden flex items-center text-red-600 hover:text-red-800 transition-colors p-2"
                title="Se déconnecter"
              >
                <LogOut className="w-5 h-5" />
              </button>

              {/* 📱 Menu hamburger (mobile uniquement) */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                aria-label="Menu mobile"
              >
                {mobileMenuOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 📱 Menu mobile déroulant */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-200 shadow-lg">
            <div className="px-4 py-2 space-y-1">
              {/* 📱 Navigation mobile */}
              {pages.map(({ id, name, icon: Icon }) => {
                const active = pathname.startsWith('/' + id);
                return (
                  <Link
                    key={id}
                    href={`/${id}`}
                    className={`flex items-center px-3 py-3 rounded-lg font-medium transition-colors ${
                      active
                        ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-5 h-5 mr-3" />
                    {name}
                  </Link>
                );
              })}
              
              {/* 📱 Gestion clients mobile */}
              <button
                onClick={() => {
                  setShowClientManager(true);
                  fetchClients();
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center px-3 py-3 rounded-lg font-medium text-green-600 hover:text-green-900 hover:bg-green-100 transition-colors"
              >
                <Users className="w-5 h-5 mr-3" />
                Gestion des Clients
              </button>

              {/* 📱 Info utilisateur mobile */}
              {user && (
                <div className="border-t border-gray-200 pt-2 mt-2">
                  <div className="px-3 py-2 text-sm text-gray-600">
                    Connecté en tant que:
                  </div>
                  <div className="px-3 py-1 text-sm font-medium text-gray-900 truncate">
                    {user.email}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* 📱 Modal Gestion des Clients - OPTIMISÉ MOBILE */}
      {showClientManager && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            
            {/* 📱 En-tête responsive */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-4 sm:p-6 border-b bg-green-50">
              <h2 className="text-xl sm:text-2xl font-bold text-green-600 mb-3 sm:mb-0">
                👥 Gestion des Clients
              </h2>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <button
                  onClick={() => setShowClientForm(true)}
                  className="w-full sm:w-auto px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
                >
                  ➕ Nouveau Client
                </button>
                <button
                  onClick={() => setShowClientManager(false)}
                  className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm font-medium"
                >
                  ❌ Fermer
                </button>
              </div>
            </div>

            {/* 📱 Liste clients responsive */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {clients.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p>Aucun client enregistré</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {clients.map((client) => (
                    <div key={client.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                      
                      {/* 📱 Affichage mobile-first */}
                      <div className="flex flex-col sm:flex-row sm:justify-between">
                        <div className="flex-1 mb-3 sm:mb-0">
                          <h3 className="font-semibold text-gray-900 text-lg">{client.name}</h3>
                          <div className="text-sm text-gray-600 mt-2 space-y-1">
                            {client.email && (
                              <p className="flex items-center">
                                <span className="mr-2">📧</span>
                                <a href={`mailto:${client.email}`} className="text-blue-600 hover:underline">
                                  {client.email}
                                </a>
                              </p>
                            )}
                            {client.phone && (
                              <p className="flex items-center">
                                <span className="mr-2">📞</span>
                                <a href={`tel:${client.phone}`} className="text-blue-600 hover:underline">
                                  {client.phone}
                                </a>
                              </p>
                            )}
                            {client.address && (
                              <p className="flex items-start">
                                <span className="mr-2 mt-0.5">📍</span>
                                <span>{client.address}</span>
                              </p>
                            )}
                            {client.contact_person && (
                              <p className="flex items-center">
                                <span className="mr-2">👤</span>
                                <span>Contact: {client.contact_person}</span>
                              </p>
                            )}
                          </div>
                        </div>
                        
                        {/* 📱 Boutons actions responsive */}
                        <div className="flex flex-col sm:flex-row gap-2 sm:ml-4">
                          <button
                            onClick={() => {
                              setEditingClient(client);
                              setClientForm(client);
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
        </div>
      )}

      {/* 📱 Modal Formulaire Client - OPTIMISÉ MOBILE */}
      {showClientForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6">
              <h3 className="text-lg sm:text-xl font-bold text-green-600 mb-4">
                {editingClient ? '✏️ Modifier Client' : '➕ Nouveau Client'}
              </h3>
              
              <form onSubmit={handleClientSubmit} className="space-y-4">
                {/* 📱 Formulaire empilé sur mobile */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nom *
                    </label>
                    <input
                      type="text"
                      value={clientForm.name}
                      onChange={(e) => setClientForm({...clientForm, name: e.target.value})}
                      className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 p-3 text-base"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={clientForm.email}
                      onChange={(e) => setClientForm({...clientForm, email: e.target.value})}
                      className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 p-3 text-base"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Téléphone
                    </label>
                    <input
                      type="tel"
                      value={clientForm.phone}
                      onChange={(e) => setClientForm({...clientForm, phone: e.target.value})}
                      className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 p-3 text-base"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Personne Contact
                    </label>
                    <input
                      type="text"
                      value={clientForm.contact_person}
                      onChange={(e) => setClientForm({...clientForm, contact_person: e.target.value})}
                      className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 p-3 text-base"
                    />
                  </div>
                  
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Adresse
                    </label>
                    <textarea
                      value={clientForm.address}
                      onChange={(e) => setClientForm({...clientForm, address: e.target.value})}
                      className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 p-3 text-base"
                      rows="3"
                    />
                  </div>
                </div>
                
                {/* 📱 Boutons responsives */}
                <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
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
                    className="w-full sm:w-auto px-4 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="w-full sm:w-auto px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                  >
                    {editingClient ? 'Mettre à jour' : 'Créer'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
