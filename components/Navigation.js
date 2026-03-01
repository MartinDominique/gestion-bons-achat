/**
 * @file components/Navigation.js
 * @description Navigation principale de l'application
 *              - Desktop: tous les onglets visibles
 *              - Mobile/Tablette: Option A — tabs terrain + menu "Plus"
 *                BT, BA, Achat, Inventaire visibles; Soumissions, Stats,
 *                Gestion Clients, Paramètres dans le menu "Plus"
 * @version 2.0.0
 * @date 2026-03-01
 * @changelog
 *   2.0.0 - Navigation mobile Option A — menu "Plus" pour modules bureau
 *   1.0.0 - Version initiale
 */

'use client';

import { Package, FileText, LogOut, Users, ShoppingCart, Warehouse, Settings, BarChart3, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '../lib/supabase';
import { useEffect, useState, useRef } from 'react';
import InventoryManager from './InventoryManager.js';
import ClientManager from './ClientManager';

// Tous les onglets (desktop — ordre original)
const pages = [
  { id: 'bons-achat', name: "Clients", shortName: "BA", icon: Package },
  { id: 'soumissions', name: 'Soumissions', shortName: "Soum.", icon: FileText },
  { id: 'inventaire', name: 'Inventaire', shortName: "Inv.", icon: Warehouse },
  { id: 'achat-materiels', name: 'Achat', shortName: "Achat", icon: ShoppingCart },
  { id: 'bons-travail', name: 'Bons Travail', shortName: "BT", icon: FileText },
  { id: 'statistiques', name: 'Statistiques', shortName: "Stats", icon: BarChart3 },
];

// Mobile: onglets principaux (modules terrain, toujours visibles)
const mobilePrimaryPages = [
  { id: 'bons-travail', name: 'Bons Travail', shortName: "BT", icon: FileText },
  { id: 'bons-achat', name: "Clients", shortName: "BA", icon: Package },
  { id: 'achat-materiels', name: 'Achat', shortName: "Achat", icon: ShoppingCart },
  { id: 'inventaire', name: 'Inventaire', shortName: "Inv.", icon: Warehouse },
];

// Mobile: modules bureau dans le menu "Plus"
const mobileSecondaryPages = [
  { id: 'soumissions', name: 'Soumissions', icon: FileText },
  { id: 'statistiques', name: 'Statistiques', icon: BarChart3 },
];

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showClientManager, setShowClientManager] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef(null);

  // "Plus" button actif si une page secondaire ou paramètres est active
  const isMoreMenuActive = mobileSecondaryPages.some(p => pathname.startsWith('/' + p.id)) || pathname.startsWith('/parametres');

 // Routes où la navigation doit être CACHÉE complètement
const shouldHideNav = pathname.includes('/bons-travail/') && 
  (pathname.includes('/nouveau') || pathname.includes('/client') || pathname.includes('/modifier'));

  // Sauvegarder la dernière page visitée
  useEffect(() => {
    const currentPage = pages.find(page => pathname.startsWith('/' + page.id));
    
    if (currentPage) {
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

        const protectedRoutes = ['/bons-', '/soumissions', '/bons-travail', '/inventaire', '/achat-materiels', '/statistiques'];
        const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));
        
        if (isProtectedRoute && !user) {
          console.log('Accès non autorisé à:', pathname);
          router.push('/login');
        }
        
        // Rediriger vers la dernière page visitée si on est sur la racine
        if (user && pathname === '/') {
          const lastPage = localStorage.getItem('lastVisitedPage');
          if (lastPage) {
            console.log('Redirection vers la dernière page visitée:', lastPage);
            router.push('/' + lastPage);
          } else {
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth event:', event);
      setUser(session?.user || null);
      
      if (event === 'SIGNED_OUT' || !session) {
        router.push('/login');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase.auth, pathname, router]);

  // Fermer le menu "Plus" au changement de route
  useEffect(() => {
    setMoreMenuOpen(false);
  }, [pathname]);

  // Fermer le menu "Plus" au clic extérieur
  useEffect(() => {
    if (!moreMenuOpen) return;
    const handleClickOutside = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [moreMenuOpen]);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/login');
    } catch (error) {
      console.error('Erreur déconnexion:', error);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Vérification de l'authentification...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (shouldHideNav) {
  return null;
}

return (
  <>
    {/* Navigation principale */}
    <nav className="sticky top-0 z-40 bg-white dark:bg-gray-900 shadow-md dark:shadow-gray-950/50 mb-6 print:shadow-none">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16 md:h-20">
            
            {/* Logo */}
            <div className="flex items-center flex-shrink-0">
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

            {/* Navigation desktop (grand écran) */}
            <div className="hidden lg:flex lg:items-center lg:space-x-4">
              {pages.map(({ id, name, icon: Icon }) => {
                const active = pathname.startsWith('/' + id);
                return (
                  <Link
                    key={id}
                    href={`/${id}`}
                    className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${
                      active
                        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-2 border-blue-300 dark:border-blue-700'
                        : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <Icon className="w-5 h-5 mr-2" />
                    {name}
                  </Link>
                );
              })}

              <button
                onClick={() => setShowClientManager(true)}
                className="flex items-center px-4 py-2 rounded-lg font-medium text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
              >
                <Users className="w-5 h-5 mr-2" />
                Gestion Clients
              </button>

              <Link
                href="/parametres"
                className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${
                  pathname.startsWith('/parametres')
                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-2 border-blue-300 dark:border-blue-700'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <Settings className="w-5 h-5 mr-2" />
                Paramètres
              </Link>
            </div>

            {/* Navigation tablette ET mobile — Option A: tabs terrain + menu "Plus" */}
            <div className="flex lg:hidden flex-1 min-w-0 items-center mx-2">
              {/* Tabs primaires (modules terrain — toujours visibles) */}
              <div className="flex items-center space-x-1 overflow-x-auto scrollbar-hide flex-1 min-w-0">
                {mobilePrimaryPages.map(({ id, name, shortName, icon: Icon }) => {
                  const active = pathname.startsWith('/' + id);
                  return (
                    <Link
                      key={id}
                      href={`/${id}`}
                      className={`flex flex-col items-center px-2 sm:px-3 py-2 rounded-lg font-medium transition-colors min-w-[56px] sm:min-w-[70px] flex-shrink-0 ${
                        active
                          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-2 border-blue-300 dark:border-blue-700'
                          : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                      title={name}
                    >
                      <Icon className="w-5 h-5 sm:w-6 sm:h-6 mb-1" />
                      <span className="text-[10px] sm:text-xs leading-tight text-center">{shortName}</span>
                    </Link>
                  );
                })}
              </div>

              {/* Bouton "Plus" avec dropdown — modules bureau */}
              <div className="relative flex-shrink-0 ml-1" ref={moreMenuRef}>
                <button
                  onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                  className={`flex flex-col items-center px-2 sm:px-3 py-2 rounded-lg font-medium transition-colors min-w-[56px] sm:min-w-[70px] ${
                    isMoreMenuActive || moreMenuOpen
                      ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-2 border-blue-300 dark:border-blue-700'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                  title="Plus d'options"
                >
                  <MoreHorizontal className="w-5 h-5 sm:w-6 sm:h-6 mb-1" />
                  <span className="text-[10px] sm:text-xs leading-tight text-center">Plus</span>
                </button>

                {/* Dropdown menu */}
                {moreMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-1 z-50">
                    {mobileSecondaryPages.map(({ id, name, icon: Icon }) => {
                      const active = pathname.startsWith('/' + id);
                      return (
                        <Link
                          key={id}
                          href={`/${id}`}
                          className={`flex items-center px-4 py-3 text-sm font-medium transition-colors ${
                            active
                              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`}
                          onClick={() => setMoreMenuOpen(false)}
                        >
                          <Icon className="w-5 h-5 mr-3" />
                          {name}
                        </Link>
                      );
                    })}
                    <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
                    <button
                      onClick={() => { setShowClientManager(true); setMoreMenuOpen(false); }}
                      className="w-full flex items-center px-4 py-3 text-sm font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                    >
                      <Users className="w-5 h-5 mr-3" />
                      Gestion Clients
                    </button>
                    <Link
                      href="/parametres"
                      className={`flex items-center px-4 py-3 text-sm font-medium transition-colors ${
                        pathname.startsWith('/parametres')
                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                      onClick={() => setMoreMenuOpen(false)}
                    >
                      <Settings className="w-5 h-5 mr-3" />
                      Paramètres
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* Actions à droite */}
            <div className="flex items-center space-x-2 flex-shrink-0">
              {/* Info utilisateur desktop */}
              {user && (
                <div className="hidden sm:flex items-center space-x-3">
                  <span className="text-sm text-gray-700 dark:text-gray-300 hidden lg:block">
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
            </div>
          </div>
        </div>
      </nav>

      {/* Modal ClientManager */}
      {showClientManager && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden">
            <ClientManager onClose={() => setShowClientManager(false)} />
          </div>
        </div>
      )}
    </>
  );
}
