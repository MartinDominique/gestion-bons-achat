'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Package, FileText, LogOut } from 'lucide-react';
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

  useEffect(() => {
    // Récupérer l'utilisateur actuel
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };

    getUser();

    // Écouter les changements d'auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <nav className="bg-white shadow-md mb-6 print:shadow-none">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo à gauche */}
          <div className="flex items-center">
            <div className="flex-shrink-0 mr-6">
              {/* Remplace cette div par ton logo */}
              <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">ST</span>
              </div>
              {/* 
              Si tu as un fichier logo, remplace par:
              <Image
                src="/logo.png"
                alt="Services TMT Logo"
                width={48}
                height={48}
                className="rounded-lg"
              />
              */}
            </div>
            
            {/* Nom de l'entreprise */}
            <div className="hidden md:block">
              <h1 className="text-xl font-bold text-gray-900">Services TMT</h1>
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
  );
}
