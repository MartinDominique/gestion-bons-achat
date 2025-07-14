// components/PurchaseOrderManager.js - VERSION CORRIGÉE
'use client'
import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabase';
import { 
  Search, Plus, FileText, Calendar, Building, Hash, 
  Trash2, Eye, X, CheckCircle, Clock, XCircle, 
  LogOut, Upload, Download, Edit2, Save, FileSpreadsheet
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

  // ✅ CORRECTION : useEffect simplifié - plus de gestion d'auth
  useEffect(() => {
    if (user) {
      fetchOrders();
    }
  }, [user]);

  // ✅ CORRECTION : Plus besoin de checkUser
  
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
    // Charger les fichiers existants
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

  // FONCTION POUR ENVOYER LE RAPPORT - SORTIE DE handleSubmit
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

      // Upload des nouveaux fichiers
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

      // Si on modifie, garder les fichiers existants
      if (editMode && existingFiles.length > 0) {
        existingFiles.forEach(file => {
          fileUrls.push(file.url);
          fileNames.push(file.name);
        });
      }

      // Préparer les données
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
    
    // Essayer de parser les données de fichiers
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
    
    // Format legacy
    if (order.pdf_url) {
      files.push({ url: order.pdf_url, name: order.pdf_file_name || 'Document' });
    }
    
    return files;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-4">
              <img 
                src="/logo.png" 
                alt="Logo" 
                className="h-24 w-auto"
              />
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Gestionnaire de Bons d'Achat</h1>
                <p className="text-sm text-gray-600 mt-1">Connecté: {user.email}</p>
              </div>
            </div>
            <div className="flex space-x-4">
              <button
                onClick={() => {
                  resetForm();
                  setShowForm(true);
                }}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-5 h-5 mr-2" />
                Nouveau Bon
              </button>
              <button
                onClick={handleSendReport}
                disabled={loading}
                className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                <Upload className="w-5 h-5 mr-2" />
                {loading ? 'Envoi...' : 'Envoyer Rapport PDF'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* GARDEZ TOUT LE RESTE DE VOTRE JSX EXACTEMENT PAREIL */}
      {/* Je n'ai mis que la partie corrigée pour éviter la répétition */}
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {/* Vos statistiques, tableau, modales etc. - gardez tout comme c'était */}
        {/* ... COPIEZ TOUT LE RESTE DE VOTRE CODE JSX ICI ... */}
      </div>
    </div>
  );
}
