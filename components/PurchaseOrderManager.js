// components/PurchaseOrderManager.js - INTERFACE PROPRE ET USER-FRIENDLY
'use client'
import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabase';
import { 
  Search, Plus, FileText, Calendar, Building, Hash, 
  Trash2, Eye, X, CheckCircle, Clock, XCircle, 
  Upload, Download, Edit2, Save, FileSpreadsheet,
  LogOut
} from 'lucide-react';

export default function PurchaseOrderManager({ user }) {
  const [orders, setOrders] = useState([]);
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
        alert('Bon d\'achat mis à jour avec succès !');
      } else {
        const { error } = await supabase
          .from('purchase_orders')
          .insert([{
            ...orderData,
            created_by: user.id
          }]);

        if (error) throw error;
        alert('Bon d\'achat créé avec succès !');
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

    try {
      const { error } = await supabase
        .from('purchase_orders')
        .delete()
        .eq('id', id);

      if (error) {
        alert('Erreur: ' + error.message);
      } else {
        await fetchOrders();
        alert('Bon d\'achat supprimé avec succès !');
      }
    } catch (error) {
      alert('Erreur: ' + error.message);
    }
  };

  const handleStatusChange = async (orderId, newStatus) => {
    try {
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
        alert('Statut mis à jour !');
      }
    } catch (error) {
      alert('Erreur: ' + error.message);
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

  const handleLogout = async () => {
    if (window.confirm('Êtes-vous sûr de vouloir vous déconnecter?')) {
      await supabase.auth.signOut();
    }
  };

  // Filtrage et tri
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

  const getStatusIcon = (status) => {
    switch(status) {
      case 'approuve':
        return <CheckCircle className="w-4 h-4" />;
      case 'refuse':
        return <XCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const getFileIcon = (fileName) => {
    const ext = fileName?.split('.').pop().toLowerCase();
    if (['xls', 'xlsx'].includes(ext)) {
      return <FileSpreadsheet className="w-5 h-5 text-green-600" />;
    }
    return <FileText className="w-5 h-5 text-blue-600" />;
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
      // Si parsing échoue
    }
    
    if (order.pdf_url) {
      files.push({ url: order.pdf_url, name: order.pdf_file_name || 'Document' });
    }
    
    return files;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* EN-TÊTE PROPRE ET SIMPLE */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo et titre */}
            <div className="flex items-center space-x-4">
              <img 
                src="/logo.png" 
                alt="ServiceStmt" 
                className="h-12 w-auto"
              />
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  Gestionnaire de Bons d'Achat
                </h1>
                <p className="text-sm text-gray-500">
                  Connecté: {user.email}
                </p>
              </div>
            </div>

            {/* Actions à droite */}
            <div className="flex items-center space-x-3">
              <button
                onClick={() => {
                  resetForm();
                  setShowForm(true);
                }}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nouveau Bon
              </button>
              
              <button
                onClick={handleSendReport}
                disabled={loading}
                className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors font-medium shadow-sm"
              >
                <Upload className="w-4 h-4 mr-2" />
                {loading ? 'Envoi...' : 'Envoyer Rapport PDF'}
              </button>

              <button
                onClick={handleLogout}
                className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium shadow-sm"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* CONTENU PRINCIPAL */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* CARTES DE STATISTIQUES - DESIGN PROPRE */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600 mb-1">Total des Bons</p>
                <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <FileText className="w-8 h-8 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600 mb-1">En Attente</p>
                <p className="text-3xl font-bold text-yellow-600">{stats.enAttente}</p>
              </div>
              <div className="p-3 bg-yellow-50 rounded-lg">
                <Clock className="w-8 h-8 text-yellow-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600 mb-1">Approuvés</p>
                <p className="text-3xl font-bold text-green-600">{stats.approuve}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600 mb-1">Montant Total</p>
                <p className="text-2xl font-bold text-purple-600">
                  {stats.montantTotal.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}
                </p>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg">
                <Hash className="w-8 h-8 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        {/* SECTION RECHERCHE */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Rechercher par client, N° PO ou N° soumission..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <select
              value={filterClient}
              onChange={(e) => setFilterClient(e.target.value)}
              className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white min-w-[200px]"
            >
              <option value="">Tous les clients</option>
              {uniqueClients.map(client => (
                <option key={client} value={client}>{client}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white min-w-[180px]"
            >
              <option value="date">Trier par date</option>
              <option value="client">Trier par client</option>
              <option value="amount">Trier par montant</option>
            </select>
          </div>
        </div>

        {/* TABLEAU PROPRE */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Client</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">N° PO Client</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">N° Soumission</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Montant</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Statut</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Fichiers</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredOrders.map((order) => {
                  const files = getAllFiles(order);
                  return (
                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(order.date).toLocaleDateString('fr-CA')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {order.client_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {order.client_po}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {order.submission_no}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        {parseFloat(order.amount).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                          order.status === 'approuve' ? 'bg-green-100 text-green-800' :
                          order.status === 'refuse' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {getStatusIcon(order.status)}
                          <span className="ml-1.5">
                            {order.status === 'approuve' ? 'Approuvé' :
                             order.status === 'refuse' ? 'Refusé' : 'En attente'}
                          </span>
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {files.length > 0 ? (
                          <div className="flex items-center space-x-2">
                            {files.slice(0, 2).map((file, idx) => (
                              <a 
                                key={idx}
                                href={file.url} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-blue-600 hover:text-blue-800 transition-colors"
                                title={file.name}
                              >
                                {getFileIcon(file.name)}
                              </a>
                            ))}
                            {files.length > 2 && (
                              <span className="text-xs text-gray-500 font-medium">+{files.length - 2}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-3">
                          <button
                            onClick={() => setSelectedOrder(order)}
                            className="text-blue-600 hover:text-blue-800 transition-colors"
                            title="Voir détails"
                          >
                            <Eye className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleEdit(order)}
                            className="text-green-600 hover:text-green-800 transition-colors"
                            title="Modifier"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDelete(order.id)}
                            className="text-red-600 hover:text-red-800 transition-colors"
                            title="Supprimer"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            
            {filteredOrders.length === 0 && (
              <div className="text-center py-16">
                <FileText className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-4 text-lg font-medium text-gray-900">Aucun bon d'achat trouvé</h3>
                <p className="mt-2 text-sm text-gray-500">Commencez par créer votre premier bon d'achat.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* MODAL DE DÉTAILS - DESIGN PROPRE */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-8 py-6 rounded-t-2xl">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Détails du Bon d'Achat</h2>
                  <p className="text-sm text-gray-500 mt-1">N° {selectedOrder.submission_no}</p>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-500">Client</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedOrder.client_name}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-500">Date</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {new Date(selectedOrder.date).toLocaleDateString('fr-CA')}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-500">N° PO Client</p>
                  <p className="text-lg font-mono font-semibold text-gray-900 bg-gray-100 px-3 py-1 rounded-lg inline-block">
                    {selectedOrder.client_po}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-500">N° Soumission</p>
                  <p className="text-lg font-mono font-semibold text-gray-900 bg-blue-100 px-3 py-1 rounded-lg inline-block">
                    {selectedOrder.submission_no}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-500">Montant</p>
                  <p className="text-3xl font-bold text-green-600">
                    {parseFloat(selectedOrder.amount).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-500">Statut</p>
                  <select
                    value={selectedOrder.status}
                    onChange={(e) => {
                      handleStatusChange(selectedOrder.id, e.target.value);
                      setSelectedOrder({...selectedOrder, status: e.target.value});
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900"
                  >
                    <option value="en_attente">En attente</option>
                    <option value="approuve">Approuvé</option>
                    <option value="refuse">Refusé</option>
                  </select>
                </div>
              </div>
              
              {selectedOrder.notes && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-500">Notes</p>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-gray-700">{selectedOrder.notes}</p>
                  </div>
                </div>
              )}
              
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-500">Documents attachés</p>
                <div className="space-y-3">
                  {getAllFiles(selectedOrder).length > 0 ? (
                    getAllFiles(selectedOrder).map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                        <div className="flex items-center space-x-3">
                          {getFileIcon(file.name)}
                          <span className="font-medium text-gray-900">{file.name}</span>
                        </div>
                        <a 
                          href={file.url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="inline-flex items-center px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                        >
                          Ouvrir
                        </a>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <FileText className="mx-auto h-8 w-8 text-gray-400" />
                      <p className="mt-2 text-sm text-gray-500">Aucun document attaché</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE FORMULAIRE - DESIGN PROPRE ET ORGANISÉ */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-8 py-6 rounded-t-2xl">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">
                  {editMode ? 'Modifier le Bon d\'Achat' : 'Nouveau Bon d\'Achat'}
                </h2>
                <button
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-8">
              <form className="space-y-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-3">
                        Nom du Client *
                      </label>
                      <input
                        type="text"
                        value={formData.client_name}
                        onChange={(e) => setFormData({...formData, client_name: e.target.value})}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        placeholder="Ex: Construction ABC Inc."
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-3">
                        N° PO Client *
                      </label>
                      <input
                        type="text"
                        value={formData.client_po}
                        onChange={(e) => setFormData({...formData, client_po: e.target.value})}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        placeholder="Ex: PO-2025-001"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-3">
                        N° Soumission *
                      </label>
                      <input
                        type="text"
                        value={formData.submission_no}
                        onChange={(e) => setFormData({...formData, submission_no: e.target.value})}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        placeholder="Ex: SOU-2025-001"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-3">
                        Date
                      </label>
                      <input
                        type="date"
                        value={formData.date}
                        onChange={(e) => setFormData({...formData, date: e.target.value})}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-3">
                        Montant ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.amount}
                        onChange={(e) => setFormData({...formData, amount: e.target.value})}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        placeholder="0.00"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-3">
                        Statut
                      </label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({...formData, status: e.target.value})}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-colors"
                      >
                        <option value="en_attente">En attente</option>
                        <option value="approuve">Approuvé</option>
                        <option value="refuse">Refusé</option>
                      </select>
                    </div>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    Documents (PDF, XLS, XLSX)
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.xls,.xlsx"
                    multiple
                    onChange={handleFileChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Vous pouvez sélectionner plusieurs fichiers
                  </p>
                  
                  {/* Fichiers existants */}
                  {editMode && existingFiles.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-medium text-gray-700 mb-2">Fichiers existants:</p>
                      <div className="space-y-2">
                        {existingFiles.map((file, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <span className="text-sm text-gray-700">{file.name}</span>
                            <button
                              type="button"
                              onClick={() => removeExistingFile(idx)}
                              className="p-1 text-red-600 hover:text-red-800 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Nouveaux fichiers */}
                  {formData.files.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-medium text-gray-700 mb-2">Nouveaux fichiers:</p>
                      <div className="space-y-1">
                        {Array.from(formData.files).map((file, idx) => (
                          <div key={idx} className="flex items-center p-2 bg-blue-50 rounded">
                            <FileText className="w-4 h-4 mr-2 text-blue-600" />
                            <span className="text-sm text-gray-700">{file.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    Notes
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    rows="4"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-none"
                    placeholder="Notes additionnelles..."
                  />
                </div>
                
                <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      resetForm();
                    }}
                    className="px-6 py-3 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium flex items-center"
                  >
                    {loading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Enregistrement...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        {editMode ? 'Mettre à jour' : 'Enregistrer'}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
