/**
 * @file components/Navigation.js
 * @description Navigation principale de l'application.
 *              - Desktop: barre complète avec tous les modules
 *              - Tablette/Mobile: modules principaux (BA, BT, Clients) + menu "Plus"
 *              - Menu Plus (bottom sheet): Soumissions, Inventaire, Achat, Stats, Facturation, Paramètres
 * @version 2.0.0
 * @date 2026-03-01
 * @changelog
 *   2.0.0 - Navigation mobile Option A: menu "Plus" pour modules bureau
 *   1.0.0 - Version initiale
 */

'use client';

import { Package, FileText, LogOut, Users, Menu, X, ShoppingCart, Truck, Warehouse, Settings, BarChart3, Receipt, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '../lib/supabase';
import { useEffect, useState } from 'react';
import InventoryManager from './InventoryManager.js';
import ClientManager from './ClientManager';

const pages = [
  { id: 'bons-achat', name: "Clients", shortName: "BA", icon: Package },
  { id: 'soumissions', name: 'Soumissions', shortName: "Soum.", icon: FileText },
  { id: 'inventaire', name: 'Inventaire', shortName: "Inv.", icon: Warehouse },
  { id: 'achat-materiels', name: 'Achat', shortName: "Achat", icon: ShoppingCart },
  { id: 'bons-travail', name: 'Bons Travail', shortName: "BT", icon: FileText },
  { id: 'statistiques', name: 'Statistiques', shortName: "Stats", icon: BarChart3 },
  { id: 'facturation', name: 'Facturation', shortName: "Fact.", icon: Receipt },
];

// Pages principales visibles dans la barre mobile
const mobilePrimaryIds = ['bons-achat', 'bons-travail'];
const mobilePages = pages.filter(p => mobilePrimaryIds.includes(p.id));
const plusMenuPages = [
  ...pages.filter(p => !mobilePrimaryIds.includes(p.id)),
  { id: 'parametres', name: 'Paramètres', shortName: "Param.", icon: Settings },
];

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showClientManager, setShowClientManager] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);

  // Vérifier si la page active est dans le menu Plus (pour highlight du bouton)
  const isPlusPageActive = plusMenuPages.some(p => pathname.startsWith('/' + p.id));

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

        const protectedRoutes = ['/bons-', '/soumissions', '/bons-travail', '/inventaire', '/achat-materiels', '/statistiques', '/facturation'];
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

            {/* Navigation tablette ET mobile (modules principaux + menu Plus) */}
            <div className="flex lg:hidden flex-1 min-w-0 items-center justify-center space-x-1 sm:space-x-2 mx-2">
              {mobilePages.map(({ id, name, shortName, icon: Icon }) => {
                const active = pathname.startsWith('/' + id);
                return (
                  <Link
                    key={id}
                    href={`/${id}`}
                    className={`flex flex-col items-center px-3 sm:px-4 py-2 rounded-lg font-medium transition-colors min-w-[60px] sm:min-w-[72px] flex-shrink-0 ${
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

              <button
                onClick={() => setShowClientManager(true)}
                className="flex flex-col items-center px-3 sm:px-4 py-2 rounded-lg font-medium text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors min-w-[60px] sm:min-w-[72px] flex-shrink-0"
                title="Gestion des Clients"
              >
                <Users className="w-5 h-5 sm:w-6 sm:h-6 mb-1" />
                <span className="text-[10px] sm:text-xs leading-tight text-center">Clients</span>
              </button>

              {/* Bouton Plus - ouvre le menu avec les modules bureau */}
              <button
                onClick={() => setShowPlusMenu(true)}
                className={`flex flex-col items-center px-3 sm:px-4 py-2 rounded-lg font-medium transition-colors min-w-[60px] sm:min-w-[72px] flex-shrink-0 relative ${
                  isPlusPageActive
                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-2 border-blue-300 dark:border-blue-700'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                title="Plus de modules"
              >
                <MoreHorizontal className="w-5 h-5 sm:w-6 sm:h-6 mb-1" />
                <span className="text-[10px] sm:text-xs leading-tight text-center">Plus</span>
              </button>
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

      {/* Menu Plus - Bottom sheet mobile/tablette */}
      {showPlusMenu && (
        <div className="lg:hidden fixed inset-0 z-50" onClick={() => setShowPlusMenu(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" />
          {/* Bottom sheet */}
          <div
            className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Poignée */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full" />
            </div>
            {/* Titre */}
            <div className="px-5 pb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Modules</span>
              <button
                onClick={() => setShowPlusMenu(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Grille de modules */}
            <div className="grid grid-cols-3 gap-2 px-4 pb-8">
              {plusMenuPages.map(({ id, name, icon: Icon }) => {
                const active = pathname.startsWith('/' + id);
                return (
                  <Link
                    key={id}
                    href={`/${id}`}
                    onClick={() => setShowPlusMenu(false)}
                    className={`flex flex-col items-center p-3 rounded-xl transition-colors ${
                      active
                        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <Icon className="w-7 h-7 mb-2" />
                    <span className="text-xs text-center font-medium">{name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
