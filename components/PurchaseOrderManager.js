// components/PurchaseOrderManager.js - VERSION TEST SIMPLE
'use client'
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Search, Plus, FileText, Calendar, Building, Hash, 
  Trash2, Eye, X, CheckCircle, Clock, XCircle, 
  Upload, Download, Edit2, Save, FileSpreadsheet
} from 'lucide-react';

export default function PurchaseOrderManager({ user }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Charger les commandes
  useEffect(() => {
    if (user) {
      fetchOrders();
    }
  }, [user]);

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .order('date', { ascending: false });

      if (error) {
        console.error('Erreur:', error);
      } else {
        setOrders(data || []);
      }
    } catch (error) {
      console.error('Erreur fetch:', error);
    }
  };

  // Test simple du bouton
  const handleNewOrder = () => {
    console.log('Bouton Nouveau Bon cliqué !');
    alert('Bouton fonctionne !');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Test simple */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Gestionnaire de Bons d'Achat - Test
          </h1>
          <p className="text-gray-600 mb-4">Connecté: {user?.email}</p>
          
          <div className="flex space-x-4">
            <button
              onClick={handleNewOrder}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-5 h-5 mr-2" />
              Nouveau Bon (Test)
            </button>
            
            <button
              onClick={() => alert('Test réussi !')}
              className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Test Bouton
            </button>
          </div>
        </div>

        {/* Statistiques simples */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Statistiques</h3>
          <p>Nombre de bons d'achat: <strong>{orders.length}</strong></p>
          {orders.length > 0 && (
            <div className="mt-4">
              <h4 className="font-medium">Derniers bons d'achat:</h4>
              <ul className="mt-2 space-y-1">
                {orders.slice(0, 3).map((order, index) => (
                  <li key={index} className="text-sm text-gray-600">
                    {order.client_name} - {order.client_po} - ${order.amount}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Modal de test */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Test Modal</h2>
                <button
                  onClick={closeForm}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="space-y-4">
                <p>✅ Le bouton fonctionne !</p>
                <p>✅ La modal s'ouvre !</p>
                <p>✅ JavaScript fonctionne !</p>
                
                <button
                  onClick={closeForm}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Debug info */}
        <div className="bg-gray-100 rounded-lg p-4">
          <h3 className="font-semibold mb-2">Debug Info:</h3>
          <p><strong>User:</strong> {user ? '✅ Connecté' : '❌ Non connecté'}</p>
          <p><strong>Orders:</strong> {orders.length} chargées</p>
          <p><strong>ShowForm:</strong> {showForm ? '✅ Ouvert' : '❌ Fermé'}</p>
          <p><strong>Loading:</strong> {loading ? '⏳ Oui' : '✅ Non'}</p>
        </div>
      </div>
    </div>
  );
}
