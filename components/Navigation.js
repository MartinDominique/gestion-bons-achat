'use client';

import { Package, FileText, LogOut, Users, Menu, X, ShoppingCart, Truck, Warehouse } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '../lib/supabase';
import { useEffect, useState } from 'react';
import InventoryManager from './InventoryManager.js';
import ClientManager from './ClientManager';

const pages = [
  { id: 'bons-achat', name: "Clients", icon: Package },
  { id: 'soumissions', name: 'Soumissions', icon: FileText },
  { id: 'inventaire', name: 'Inventaire', icon: Warehouse },
  { id: 'achat-materiels', name: 'Achat', icon: ShoppingCart },
  { id: 'bons-travail', name: 'Bons de Travail', icon: FileText },
];

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showClientManager, setShowClientManager] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // ✨ NOUVEAU : Sauvegarder la dernière page visitée
  useEffect(() => {
    // Vérifier si le pathname correspond à une des pages principales
    const currentPage = pages.find(page => pathname.startsWith('/' + page.id));
    
    if (currentPage) {
      // Sauvegarder dans localStorage
      localStorage.setItem('lastVisitedPage', currentPage.id);
      console.log('Page sauvegardée:', currentPage.id);
    }
  }, [pathname]);

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

        const protectedRoutes = ['/bons-', '/soumissions', '/bons-travail', '/inventaire', '/achat-materiels'];
        const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));
        
        if (isProtectedRoute && !user) {
          console.log('Accès non autorisé à:', pathname);
          router.push('/login');
        }
        
        // ✨ NOUVEAU : Rediriger vers la dernière page visitée si on est sur la racine
        if (user && pathname === '/') {
          const lastPage = localStorage.getItem('lastVisitedPage');
          if (lastPage) {
            console.log('Redirection vers la dernière page visitée:', lastPage);
            router.push('/' + lastPage);
          } else {
            // Page par défaut si aucune page n'a été visitée
            router.push('/bons-achat');
          }
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

    //const handleBeforeUnload = () => {
     // supabase.auth.signOut();
    //};

    //window.addEventListener('beforeunload', handleBeforeUnload);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth event:', event);
      setUser(session?.user || null);
      
      if (event === 'SIGNED_OUT' || !session) {
        router.push('/login');
      }
    });

    return () => {
      subscription.unsubscribe();
     // window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [supabase.auth, pathname, router]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      // ✨ NOUVEAU : Optionnel - Effacer la dernière page lors de la déconnexion
      // localStorage.removeItem('lastVisitedPage');
      router.push('/login');
    } catch (error) {
      console.error('Erreur déconnexion:', error);
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
      {/* Navigation principale */}
      <nav className="bg-white shadow-md mb-6 print:shadow-none">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16 md:h-20">
            
            {/* Logo */}
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Image
                  src="/logo.png"
                  alt="Services TMT Logo"
                  width={315}
                  height={142}
                  className="w-20 h-auto md:w-32 rounded-lg object-contain -ml-2 md:-ml-4"
                  priority
                />
              </div>
            </div>

            {/* Navigation desktop */}
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
                onClick={() => setShowClientManager(true)}
                className="flex items-center px-4 py-2 rounded-lg font-medium text-green-600 hover:text-green-900 hover:bg-green-100 transition-colors"
              >
                <Users className="w-5 h-5 mr-2" />
                Gestion des Clients
              </button>
            </div>

            {/* Actions à droite */}
            <div className="flex items-center space-x-2">
              {/* Info utilisateur desktop */}
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

              {/* Bouton déconnexion mobile */}
              <button
                onClick={handleSignOut}
                className="sm:hidden flex items-center text-red-600 hover:text-red-800 transition-colors p-2"
                title="Se déconnecter"
              >
                <LogOut className="w-5 h-5" />
              </button>

              {/* Menu hamburger mobile */}
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

        {/* Menu mobile déroulant */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-200 shadow-lg">
            <div className="px-4 py-2 space-y-1">
              {/* Navigation mobile */}
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
              
              {/* Gestion clients mobile */}
              <button
                onClick={() => {
                  setShowClientManager(true);
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center px-3 py-3 rounded-lg font-medium text-green-600 hover:text-green-900 hover:bg-green-100 transition-colors"
              >
                <Users className="w-5 h-5 mr-3" />
                Gestion des Clients
              </button>

              {/* Info utilisateur mobile */}
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

      {/* Modal ClientManager */}
      {showClientManager && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden">
            <ClientManager onClose={() => setShowClientManager(false)} />
          </div>
        </div>
      )}
    </>
  );
}
