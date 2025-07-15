'use client';
import './globals.css';
import Navigation from '../components/Navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useEffect, useState } from 'react';

export default function RootLayout({ children }) {
  const supabase = createClientComponentClient();
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  return (
    <html lang="fr">
      <body className="bg-gray-100">
        <Navigation user={user} />
        <main className="max-w-6xl mx-auto p-6 bg-white rounded-lg shadow">
          {children}
        </main>
      </body>
    </html>
  );
}
