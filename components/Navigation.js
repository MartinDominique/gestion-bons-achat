'use client';

import Link from 'next/link';
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
    <nav className="bg-white shadow mb-6">
      <ul className="flex gap-2 p-4 items-center">
        {pages.map(({ id, name, icon: Icon }) => {
          const active = pathname.startsWith('/' + id);
          return (
            <li key={id}>
              <Link
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
            </li>
          );
        })}

        {user && (
          <li className="ml-auto flex items-center gap-4">
            <span className="text-sm text-gray-700">Bonjour {user.email}</span>
            <button
              onClick={handleSignOut}
              className="flex items-center text-red-600 hover:underline"
            >
              <LogOut className="w-4 h-4 mr-1" />
              Se déconnecter
            </button>
          </li>
        )}
      </ul>
    </nav>
  );
}
