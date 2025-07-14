// app/page.js - NOUVEAU FICHIER PRINCIPAL
'use client'
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import Navigation from '../components/Navigation';
import PurchaseOrderManager from '../components/PurchaseOrderManager';
import SoumissionsManager from '../components/SoumissionsManager';

export default function MainApp() {
  // GESTION DE L'AUTHENTIFICATION (DÉPLACÉE DE VOTRE ANCIEN CODE)
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  
  // NAVIGATION ENTRE LES PAGES
  const [currentPage, setCurrentPage] = useState('bons-achat');

  // GESTION DE L'AUTHENTIFICATION (VOTRE CODE EXISTANT)
  useEffect(() => {
    checkUser();
    
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert('Vérifiez votre email pour confirmer votre inscription!');
      }
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentPage('bons-achat'); // Retour à la page par défaut
  };

  // PAGE DE CONNEXION (VOTRE CODE EXISTANT ADAPTÉ)
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <div className="text-center mb-6">
            <img 
              src="/logo.png" 
              alt="Logo" 
              className="h-16 w-auto mx-auto mb-4"
            />
            <h2 className="text-2xl font-bold text-gray-900">
              {isLogin ? 'Connexion' : 'Inscription'}
            </h2>
            <p className="text-gray-600 mt-2">Gestionnaire d'Entreprise</p>
          </div>
          
          <form onSubmit={handleAuth}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {loading ? 'Chargement...' : (isLogin ? 'Se connecter' : 'S\'inscrire')}
            </button>
          </form>
          
          <p className="text-center mt-4 text-sm text-gray-600">
            {isLogin ? 'Pas encore de compte?' : 'Déjà un compte?'}
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-blue-600 hover:underline ml-1 font-medium"
            >
              {isLogin ? 'S\'inscrire' : 'Se connecter'}
            </button>
          </p>
        </div>
      </div>
    );
  }

  // APPLICATION PRINCIPALE AVEC NAVIGATION
  return (
    <div className="min-h-screen bg-gray-50">
      {/* NAVIGATION ENTRE BONS D'ACHAT ET SOUMISSIONS */}
      <Navigation 
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        user={user}
        onLogout={handleLogout}
      />
      
      {/* CONTENU PRINCIPAL */}
      <main>
        {/* PAGE BONS D'ACHAT (VOTRE CODE EXISTANT) */}
        {currentPage === 'bons-achat' && (
          <PurchaseOrderManager user={user} />
        )}
        
        {/* PAGE SOUMISSIONS (NOUVEAU) */}
        {currentPage === 'soumissions' && (
          <SoumissionsManager user={user} />
        )}
      </main>
    </div>
  );
}
