// package.json
{
  "name": "gestion-bons-achat",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "14.0.0",
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "@supabase/supabase-js": "^2.39.0",
    "lucide-react": "^0.263.1"
  }
}

// app/layout.js
export const metadata = {
  title: 'Gestion des Bons d\'Achat',
  description: 'Application de gestion des bons d\'achat et soumissions',
}

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}

// app/globals.css
@tailwind base;
@tailwind components;
@tailwind utilities;

// lib/supabase.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// app/page.js
'use client'
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Search, Plus, FileText, Calendar, Building, Hash, 
  Trash2, Eye, X, CheckCircle, Clock, XCircle, 
  LogOut, Upload, Download 
} from 'lucide-react';

export default function PurchaseOrderManager() {
  const [orders, setOrders] = useState([]);
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [formData, setFormData] = useState({
    client_name: '',
    client_po: '',
    submission_no: '',
    date: new Date().toISOString().split('T')[0],
    amount: '',
    status: 'en_attente',
    notes: '',
    pdf_file: null
  });

  // Vérifier l'authentification
  useEffect(() => {
    checkUser();
    
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
      if (session?.user) {
        fetchOrders();
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    if (user) {
      fetchOrders();
    }
  };

  // Connexion/Inscription
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
    setOrders([]);
  };

  // Charger les bons d'achat
  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*')
      .order('date', { ascending: false });

    if (error) {
      console.error('Erreur:', error);
    } else {
      setOrders(data || []);
    }
  };

  // Ajouter un bon d'achat
  const handleSubmit = async () => {
    if (!formData.client_name || !formData.client_po || !formData.submission_no) {
      alert('Veuillez remplir tous les champs obligatoires');
      return;
    }

    setLoading(true);
    let pdfUrl = null;
    let pdfFileName = null;

    // Upload du PDF si présent
    if (formData.pdf_file) {
      const fileExt = formData.pdf_file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('purchase-orders-pdfs')
        .upload(fileName, formData.pdf_file);

      if (uploadError) {
        alert('Erreur upload PDF: ' + uploadError.message);
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from('purchase-orders-pdfs')
          .getPublicUrl(fileName);
        
        pdfUrl = publicUrl;
        pdfFileName = formData.pdf_file.name;
      }
    }

    // Insérer dans la base de données
    const { error } = await supabase
      .from('purchase_orders')
      .insert([{
        ...formData,
        pdf_url: pdfUrl,
        pdf_file_name: pdfFileName,
        amount: formData.amount || 0,
        created_by: user.id
      }]);

    if (error) {
      alert('Erreur: ' + error.message);
    } else {
      await fetchOrders();
      resetForm();
      setShowForm(false);
    }
    
    setLoading(false);
  };

  // Supprimer un bon d'achat
  const handleDelete = async (id) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce bon d\'achat?')) return;

    const { error } = await supabase
      .from('purchase_orders')
      .delete()
      .eq('id', id);

    if (error) {
      alert('Erreur: ' + error.message);
    } else {
      await fetchOrders();
    }
  };

  // Mettre à jour le statut
  const handleStatusChange = async (orderId, newStatus) => {
    const { error } = await supabase
      .from('purchase_orders')
      .update({ status: newStatus })
      .eq('id', orderId);

    if (error) {
      alert('Erreur: ' + error.message);
    } else {
      await fetchOrders();
      if (selectedOrder?.id === orderId) {
        setSelectedOrder({...selectedOrder, status: newStatus});
      }
    }
  };

  const resetForm = () => {
    setFormData({
      client_name: '',
      client_po: '',
      submission_no: '',
      date: new Date().toISOString().split('T')[0],
      amount: '',
      status: 'en_attente',
      notes: '',
      pdf_file: null
    });
  };

  // Filtrer et trier
  const filteredOrders = orders
    .filter(order => {
      const matchSearch = 
        order.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.client_po.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.submission_no.toLowerCase().includes(searchTerm.toLowerCase());
      const matchClient = filterClient === '' || order.client_name === filterClient;
      return matchSearch && matchClient;
    })
    .sort((a, b) => {
      if (sortBy === 'date') return new Date(b.date) - new Date(a.date);
      if (sortBy === 'client') return a.client_name.localeCompare(b.client_name);
      if (sortBy === 'amount') return parseFloat(b.amount) - parseFloat(a.amount);
      return 0;
    });

  const uniqueClients = [...new Set(orders.map(order => order.client_name))];

  const stats = {
    total: orders.length,
    enAttente: orders.filter(o => o.status === 'en_attente').length,
    approuve: orders.filter(o => o.status === 'approuve').length,
    montantTotal: orders.reduce((sum, o) => sum + parseFloat(o.amount || 0), 0)
  };

  // Si pas connecté, afficher le formulaire de connexion
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <h2 className="text-2xl font-bold mb-6 text-center">
            {isLogin ? 'Connexion' : 'Inscription'}
          </h2>
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
              className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Chargement...' : (isLogin ? 'Se connecter' : 'S\'inscrire')}
            </button>
          </form>
          <p className="text-center mt-4 text-sm text-gray-600">
            {isLogin ? 'Pas encore de compte?' : 'Déjà un compte?'}
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-blue-600 hover:underline ml-1"
            >
              {isLogin ? 'S\'inscrire' : 'Se connecter'}
            </button>
          </p>
        </div>
      </div>
    );
  }

  // Interface principale (reste du code identique mais avec les champs adaptés pour Supabase)
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header avec bouton déconnexion */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Gestionnaire de Bons d'Achat</h1>
              <p className="text-sm text-gray-600 mt-1">Connecté: {user.email}</p>
            </div>
            <div className="flex space-x-4">
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-5 h-5 mr-2" />
                Nouveau Bon
              </button>
              <button
                onClick={handleLogout}
                className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                <LogOut className="w-5 h-5 mr-2" />
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Le reste de votre interface (stats, tableau, etc.) reste identique */}
      {/* ... */}
    </div>
  );
}

// .env.local (à créer)
NEXT_PUBLIC_SUPABASE_URL=votre_url_ici
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre_cle_ici
