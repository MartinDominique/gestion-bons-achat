'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = createClientComponentClient();

  async function handleLogin(e) {
    e.preventDefault();
    setError('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) setError(error.message);
    else router.push('/soumissions');
  }

  async function handleSignup() {
    setError('');
    const { error } = await supabase.auth.signUp({ email, password });

    if (error) setError(error.message);
    else alert('Compte créé ! Vérifie ton courriel pour confirmer.');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white shadow-lg rounded-lg p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold mb-4 text-center">Connexion</h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm">Courriel</label>
            <input
              type="email"
              value={email}
              onChange={e=>setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={e=>setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border rounded"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded"
          >
            Se connecter
          </button>
        </form>
        <button
          onClick={handleSignup}
          className="mt-4 w-full bg-gray-100 hover:bg-gray-200 text-sm py-2 rounded"
        >
          Créer un compte
        </button>
      </div>
    </div>
  );
}
