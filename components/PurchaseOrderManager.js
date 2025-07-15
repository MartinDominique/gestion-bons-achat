// components/PurchaseOrderManager.js - VERSION STYLE CLASSIQUE
'use client'
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Search, Plus, FileText, Calendar, Building, Hash, 
  Trash2, Eye, X, CheckCircle, Clock, XCircle, 
  LogOut, Upload, Download, Edit2, Save, FileSpreadsheet
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
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    client_name: '',
    client_po: '',
    submission_no: '',
    date: new Date().toISOString().split('T')[0],
    amount: '',
    status: 'en_attente',
    notes: '',
    files: []
  });
  const [existingFiles, setExistingFiles] = useState([]);

  useEffect(() => {
    checkUser();
      async function loadQuotes() {
    const { data, error } = await supabase
      .from('quotes')
      .select('id, created_at, total, client:clients(name)')
      .order('created_at', { ascending: false });

    if (!error) setQuotes(data || []);
  }
  loadQuotes();
}, []);
  
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

  const handleEdit = (order) => {
    setEditMode(true);
    setEditingId(order.id);
    setFormData({
      client_name: order.client_name,
      client_po: order.client_po,
      submission_no: order.submission_no,
      date: order.date,
      amount: order.amount,
      status: order.status,
      notes: order.notes || '',
      files: []
    });
    const files = [];
    if (order.pdf_url) {
      files.push({
        url: order.pdf_url,
        name: order.pdf_file_name || 'Document',
        type: 'existing'
      });
    }
    setExistingFiles(files);
    setShowForm(true);
  };

  const handleSendReport = async () => {
    try {
      setLoading(true);
      
      const thisWeek = new Date();
      thisWeek.setDate(thisWeek.getDate() - 7);

      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .gte('date', thisWeek.toISOString().split('T')[0]);

      if (error) {
        alert("Erreur lors de la récupération des bons d'achat.");
        return;
      }

      const doc = new jsPDF();
      doc.text("Rapport des Bons d'Achat - Semaine", 14, 15);
      autoTable(doc, {
        head: [['Date', 'Client', 'PO', 'Soumission', 'Montant', 'Statut']],
        body: data.map(order => [
          new Date(order.date).toLocaleDateString('fr-CA'),
          order.client_name,
          order.client_po,
          order.submission_no,
          `${order.amount} $`,
          order.status
        ])
      });

      const pdfBlob = doc.output('arraybuffer');
      const pdfBuffer = Buffer.from(pdfBlob);
      const fileBase64 = pdfBuffer.toString('base64');

      const response = await fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: user.email,
          fileBase64
        })
      });

      if (!response.ok) {
        throw new Error('Erreur lors de l\'envoi du rapport');
      }

      alert("Rapport envoyé avec succès !");
      
    } catch (error) {
      alert('Erreur: ' + error.message);
      console.error('Erreur détaillée:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.client_name || !formData.client_po || !formData.submission_no) {
      alert('Veuillez remplir tous les champs obligatoires');
      return;
    }

    setLoading(true);

    try {
      let fileUrls = [];
      let fileNames = [];

      if (formData.files && formData.files.length > 0) {
        for (const file of formData.files) {
          const fileExt = file.name.split('.').pop();
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
          
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('purchase-orders-pdfs')
            .upload(fileName, file);

          if (uploadError) {
            console.error('Erreur upload:', uploadError);
            continue;
          }

          const { data: { publicUrl } } = supabase.storage
            .from('purchase-orders-pdfs')
            .getPublicUrl(fileName);

          fileUrls.push(publicUrl);
          fileNames.push(file.name);
        }
      }

      if (editMode && existingFiles.length > 0) {
        existingFiles.forEach(file => {
          fileUrls.push(file.url);
          fileNames.push(file.name);
        });
      }

      const orderData = {
        client_name: formData.client_name,
        client_po: formData.client_po,
        submission_no: formData.submission_no,
        date: formData.date,
        amount: formData.amount || 0,
        status: formData.status,
        notes: formData.notes,
        pdf_url: fileUrls[0] || null,
        pdf_file_name: fileNames[0] || null,
        files_data: JSON.stringify({ urls: fileUrls, names: fileNames })
      };

      if (editMode) {
        const { error } = await supabase
          .from('purchase_orders')
          .update(orderData)
          .eq('id', editingId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('purchase_orders')
          .insert([{
            ...orderData,
            created_by: user.id
          }]);

        if (error) throw error;
      }

      await fetchOrders();
      resetForm();
      setShowForm(false);

    } catch (error) {
      alert('Erreur: ' + error.message);
      console.error('Erreur détaillée:', error);
    } finally {
      setLoading(false);
    }
  };

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
      files: []
    });
    setExistingFiles([]);
    setEditMode(false);
    setEditingId(null);
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    const validFiles = files.filter(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      return ['pdf', 'xls', 'xlsx'].includes(ext);
    });
    
    if (validFiles.length !== files.length) {
      alert('Seuls les fichiers PDF, XLS et XLSX sont acceptés');
    }
    
    setFormData({ ...formData, files: validFiles });
  };

  const removeExistingFile = (index) => {
    setExistingFiles(existingFiles.filter((_, i) => i !== index));
  };

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

  const getAllFiles = (order) => {
    const files = [];
    
    try {
      if (order.files_data) {
        const data = JSON.parse(order.files_data);
        if (data.urls && data.names) {
          data.urls.forEach((url, index) => {
            files.push({ url, name: data.names[index] || 'Document' });
          });
          return files;
        }
      }
    } catch (e) {
      // Si parsing échoue, utiliser l'ancien format
    }
    
    if (order.pdf_url) {
      files.push({ url: order.pdf_url, name: order.pdf_file_name || 'Document' });
    }
    
    return files;
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded shadow-sm border border-gray-200 w-full max-w-md">
          <div className="text-center mb-6">
            <img 
              src="/logo.png" 
              alt="Logo" 
              className="h-12 w-auto mx-auto mb-4"
            />
            <h2 className="text-xl font-bold text-gray-900">
              {isLogin ? 'Connexion' : 'Inscription'}
            </h2>
            <p className="text-gray-600 mt-1 text-sm">Gestionnaire de Bons d'Achat</p>
          </div>
          
          <form onSubmit={handleAuth}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* EN-TÊTE SIMPLE */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <img 
                src="/logo.png" 
                alt="ServiceStmt" 
                className="h-10 w-auto mr-3"
              />
              <div>
                <h1 className="text-xl font-bold text-gray-900">Gestionnaire de Bons d'Achat</h1>
                <p className="text-xs text-gray-600">Connecté: {user.email}</p>
              </div>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => {
                  resetForm();
                  setShowForm(true);
                }}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              >
                Nouveau Bon
              </button>
              <button
                onClick={handleSendReport}
                disabled={loading}
                className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 disabled:opacity-50"
              >
                {loading ? 'Envoi...' : 'Envoyer Rapport PDF'}
              </button>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"
              >
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* STATISTIQUES SIMPLES */}
        <div className="bg-white border border-gray-200 rounded p-4 mb-6">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-sm text-gray-600">Total des Bons</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">En Attente</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.enAttente}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Approuvés</p>
              <p className="text-2xl font-bold text-green-600">{stats.approuve}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Montant Total</p>
              <p className="text-xl font-bold text-gray-900">
                {stats.montantTotal.toLocaleString('fr-CA', { 
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2 
                })} $
              </p>
            </div>
          </div>
        </div>

        {/* BARRE DE RECHERCHE */}
        <div className="bg-white border border-gray-200 rounded p-4 mb-4">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Rechercher par client, No PO ou No soumission..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
            />
            <select
              value={filterClient}
              onChange={(e) => setFilterClient(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">Tous les clients</option>
              {uniqueClients.map(client => (
                <option key={client} value={client}>{client}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="date">Trier par date</option>
              <option value="client">Trier par client</option>
              <option value="amount">Trier par montant</option>
            </select>
          </div>
        </div>

        {/* TABLEAU SIMPLE */}
        <div className="bg-white border border-gray-200 rounded overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-200">
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">Date</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">Client</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">No PO Client</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">No Soumission</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">Montant</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">Statut</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">Fichiers</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => {
                const files = getAllFiles(order);
                return (
                  <tr key={order.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {new Date(order.date).toLocaleDateString('fr-CA')}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {order.client_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {order.client_po}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {order.submission_no}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {parseFloat(order.amount).toLocaleString('fr-CA', { 
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2 
                      })} $
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded ${
                        order.status === 'approuve' ? 'bg-green-100 text-green-800' :
                        order.status === 'refuse' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {order.status === 'approuve' ? 'Approuvé' :
                         order.status === 'refuse' ? 'Refusé' : 'En attente'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {files.length > 0 ? (
                        files.length > 1 ? `(${files.length})` : (
                          <a 
                            href={files[0].url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-blue-600 hover:underline"
                          >
                            <FileText className="w-4 h-4 inline" />
                          </a>
                        )
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="text-blue-600 hover:text-blue-800"
                          title="Voir"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEdit(order)}
                          className="text-green-600 hover:text-green-800"
                          title="Modifier"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(order.id)}
                          className="text-red-600 hover:text-red-800"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredOrders.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-600">Aucun bon d'achat trouvé</p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL DÉTAILS - SIMPLIFIÉE */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded border border-gray-300 max-w-2xl w-full p-6">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold">Détails du Bon d'Achat</h2>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Client</p>
                  <p className="font-medium">{selectedOrder.client_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Date</p>
                  <p className="font-medium">{new Date(selectedOrder.date).toLocaleDateString('fr-CA')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">No PO Client</p>
                  <p className="font-medium">{selectedOrder.client_po}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">No Soumission</p>
                  <p className="font-medium">{selectedOrder.submission_no}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Montant</p>
                  <p className="font-medium text-lg">{parseFloat(selectedOrder.amount).toLocaleString('fr-CA', { 
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2 
                  })} $</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Statut</p>
                  <select
                    value={selectedOrder.status}
                    onChange={(e) => {
                      handleStatusChange(selectedOrder.id, e.target.value);
                      setSelectedOrder({...selectedOrder, status: e.target.value});
                    }}
                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                  >
                    <option value="en_attente">En attente</option>
                    <option value="approuve">Approuvé</option>
                    <option value="refuse">Refusé</option>
                  </select>
                </div>
              </div>
              {selectedOrder.notes && (
                <div>
                  <p className="text-sm text-gray-600">Notes</p>
                  <p className="mt-1 p-2 bg-gray-50 rounded border border-gray-200">{selectedOrder.notes}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-gray-600 mb-2">Documents</p>
                <div className="space-y-1">
                  {getAllFiles(selectedOrder).map((file, idx) => (
                    <div key={idx} className="flex items-center space-x-2">
                      <FileText className="w-4 h-4 text-gray-400" />
                      <span className="text-sm">{file.name}</span>
                      <a 
                        href={file.url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-blue-600 hover:underline text-sm"
                      >
                        Ouvrir
                      </a>
                    </div>
                  ))}
                  {getAllFiles(selectedOrder).length === 0 && (
                    <p className="text-gray-500 text-sm">Aucun document</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FORMULAIRE - SIMPLIFIÉE */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded border border-gray-300 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">
                  {editMode ? 'Modifier le Bon d\'Achat' : 'Nouveau Bon d\'Achat'}
                </h2>
                <button
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nom du Client *
                    </label>
                    <input
                      type="text"
                      value={formData.client_name}
                      onChange={(e) => setFormData({...formData, client_name: e.target.value})}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      No PO Client *
                    </label>
                    <input
                      type="text"
                      value={formData.client_po}
                      onChange={(e) => setFormData({...formData, client_po: e.target.value})}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      No Soumission *
                    </label>
                    <input
                      type="text"
                      value={formData.submission_no}
                      onChange={(e) => setFormData({...formData, submission_no: e.target.value})}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Date
                    </label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({...formData, date: e.target.value})}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Montant ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData({...formData, amount: e.target.value})}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Statut
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value})}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
                    >
                      <option value="en_attente">En attente</option>
                      <option value="approuve">Approuvé</option>
                      <option value="refuse">Refusé</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Documents (PDF, XLS, XLSX)
                    </label>
                    <input
                      type="file"
                      accept=".pdf,.xls,.xlsx"
                      multiple
                      onChange={handleFileChange}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
                    />
                    
                    {editMode && existingFiles.length > 0 && (
                      <div className="mt-2">
                        <p className="text-sm text-gray-700 mb-1">Fichiers existants:</p>
                        <div className="space-y-1">
                          {existingFiles.map((file, idx) => (
                            <div key={idx} className="flex items-center justify-between p-1 bg-gray-50 rounded text-sm">
                              <span>{file.name}</span>
                              <button
                                type="button"
                                onClick={() => removeExistingFile(idx)}
                                className="text-red-600 hover:text-red-800"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {formData.files.length > 0 && (
                      <div className="mt-2">
                        <p className="text-sm text-gray-700 mb-1">Nouveaux fichiers:</p>
                        <ul className="text-sm text-gray-600">
                          {Array.from(formData.files).map((file, idx) => (
                            <li key={idx}>• {file.name}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notes
                    </label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({...formData, notes: e.target.value})}
                      rows="3"
                      className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
                <div className="flex justify-end space-x-3 mt-4">
                  <button
                    onClick={() => {
                      setShowForm(false);
                      resetForm();
                    }}
                    className="px-4 py-1.5 text-gray-700 bg-gray-200 rounded hover:bg-gray-300 text-sm"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
                  >
                    {loading ? 'Enregistrement...' : (editMode ? 'Mettre à jour' : 'Enregistrer')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
