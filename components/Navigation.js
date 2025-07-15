'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Package, FileText } from 'lucide-react';

/** Pages à afficher dans la barre */
const pages = [
  { id: 'bons-achat', name: "Bons d'achat", icon: Package },
  { id: 'soumissions', name: 'Soumissions',  icon: FileText }
];

export default function Navigation() {
  const pathname = usePathname();           // URL courante

  return (
    <nav className="bg-white shadow-md mb-6">
      <ul className="flex gap-2 p-4">
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
      </ul>
    </nav>
  );
}
