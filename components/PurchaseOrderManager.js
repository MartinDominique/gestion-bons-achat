import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { MoreVertical, Eye, Edit, Trash2, FileText, Download, ChevronDown, X, Upload, Search } from 'lucide-react';
import { Building2, FileUp } from 'lucide-react';

export default function PurchaseOrderManager() {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPO, setEditingPO] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sendingReport, setSendingReport] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [supplierDocuments, setSupplierDocuments] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [uploadingSupplierDocs, setUploadingSupplierDocs] = useState(false);
  
  // Form state avec TES vraies colonnes
  const [formData, setFormData] = useState({
  client_name: '',
  po_number: '',
  submission_no: '',
  date: new Date().toISOString().split('T')[0],
  amount: '',
  status: 'pending',
  notes: '',  // ← Devient la description principale
  additionalNotes: '',  // ← Nouveau champ pour notes complémentaires
  files: []
});

  useEffect(() => {
    fetchPurchaseOrders();
    fetchClients();
    fetchSubmissions();
    fetchSuppliers();
    const fetchSuppliers = async () => {
  try {
    const { data, error } = await supabase
      .from('suppliers')
      .select('id, company_name')
      .order('company_name', { ascending: true });

    if (error) {
      console.error('Erreur chargement fournisseurs:', error);
    } else {
      setSuppliers(data || []);
    }
  } catch (error) {
    console.error('Erreur lors du chargement des fournisseurs:', error);
  }
};

const fetchSupplierDocuments = async (purchaseOrderId) => {
  if (!purchaseOrderId) return;
  
  try {
    const { data, error } = await supabase
      .from('supplier_documents')
      .select('*, suppliers(company_name)')
      .eq('purchase_order_id', purchaseOrderId)
      .order('uploaded_at', { ascending: false });

    if (error) {
      console.error('Erreur chargement documents fournisseurs:', error);
    } else {
      setSupplierDocuments(data || []);
    }
  } catch (error) {
    console.error('Erreur lors du chargement des documents fournisseurs:', error);
  }
};

const handleSupplierDocumentUpload = async (e, supplierId) => {
  const files = Array.from(e.target.files);
  if (files.length === 0 || !editingPO) return;

  setUploadingSupplierDocs(true);
  const uploadedDocs = [];

  for (const file of files) {
    try {
      const cleanFileName = file.name
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9._-]/g, '')
        .substring(0, 100);

      const fileName = `${Date.now()}_${cleanFileName}`;
      const filePath = `supplier-documents/${fileName}`;

      const { data, error } = await supabase.storage
        .from('purchase-orders-pdfs')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('purchase-orders-pdfs')
        .getPublicUrl(filePath);

      // Enregistrer dans la table supplier_documents
      const { error: dbError } = await supabase
        .from('supplier_documents')
        .insert({
          purchase_order_id: editingPO.id,
          supplier_id: supplierId,
          document_type: 'invoice',
          file_name: file.name,
          file_path: data.path,
          file_url: urlData.publicUrl,
          file_size: file.size
        });

      if (dbError) throw dbError;

      uploadedDocs.push({
        file_name: file.name,
        supplier_id: supplierId
      });

    } catch (error) {
      console.error('Erreur upload document fournisseur:', error);
      alert(`Erreur upload "${file.name}": ${error.message}`);
    }
  }

  if (uploadedDocs.length > 0) {
    await fetchSupplierDocuments(editingPO.id);
    alert(`✅ ${uploadedDocs.length} document(s) fournisseur uploadé(s) avec succès`);
  }

  setUploadingSupplierDocs(false);
  e.target.value = '';
};

const removeSupplierDocument = async (docId, filePath) => {
  if (!confirm('Êtes-vous sûr de vouloir supprimer ce document fournisseur ?')) return;

  try {
    // Supprimer du storage
    if (filePath) {
      const { error: storageError } = await supabase.storage
        .from('purchase-orders-pdfs')
        .remove([filePath]);
      
      if (storageError) {
        console.error('Erreur suppression storage:', storageError);
      }
    }

    // Supprimer de la BD
    const { error: dbError } = await supabase
      .from('supplier_documents')
      .delete()
      .eq('id', docId);

    if (dbError) throw dbError;

    await fetchSupplierDocuments(editingPO.id);
    alert('✅ Document fournisseur supprimé');

  } catch (error) {
    console.error('Erreur suppression document:', error);
    alert('Erreur lors de la suppression');
  }
};
    
    const handleBeforeUnload = () => {
      supabase.auth.signOut();
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        console.error('Erreur chargement clients:', error);
      } else {
        setClients(data || []);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des clients:', error);
    }
  };

  const fetchSubmissions = async () => {
    try {
      const { data, error } = await supabase
        .from('submissions')
        .select('id, submission_number, client_name, description, created_at')
        .order('submission_number', { ascending: false });

      if (error) {
        console.error('Erreur chargement soumissions:', error);
      } else {
        setSubmissions(data || []);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des soumissions:', error);
    }
  };

  const fetchPurchaseOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erreur Supabase:', error);
        throw error;
      }
      console.log('Bons d\'achat chargés:', data?.length || 0);
      setPurchaseOrders(data || []);
    } catch (error) {
      console.error('Erreur lors du chargement des bons d\'achat:', error);
      console.error('Erreur lors du chargement des bons d\'achat:', error.message);
    } finally {
      setLoading(false);
    }
  };

  // 🔧 FONCTION RAPPORT CORRIGÉE - utilise GET au lieu de POST
  const handleSendReport = async () => {
    setSendingReport(true);
    try {
      const response = await fetch('/api/send-weekly-report', {
        method: 'GET'  // ← CHANGÉ DE POST À GET
      });

      if (response.ok) {
        const result = await response.json();
        console.log('📧 Rapport envoyé avec succès !', result);
        alert(`📧 Rapport envoyé avec succès !\n${result.message || 'Email envoyé'}`);
      } else {
        const errorData = await response.json();
        console.error('❌ Erreur lors de l\'envoi du rapport:', errorData);
        alert(`❌ Erreur lors de l'envoi du rapport: ${errorData.error || 'Erreur inconnue'}`);
      }
    } catch (error) {
      console.error('Erreur lors de l\'envoi:', error);
      alert('❌ Erreur lors de l\'envoi du rapport');
    } finally {
      setSendingReport(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const dataToSave = {
  client_name: formData.client_name,
  client: formData.client_name,
  po_number: formData.po_number,
  submission_no: formData.submission_no,
  date: formData.date,
  amount: parseFloat(formData.amount),
  status: formData.status,
  notes: formData.notes,  // ← Description principale
  description: formData.notes,  // ← Alias pour compatibilité
  additionalNotes: formData.additionalNotes,  // ← Notes complémentaires
  vendor: formData.client_name,
  files: formData.files
};

    try {
      const dataToSave = {
        client_name: formData.client_name,
        client: formData.client_name,
        po_number: formData.po_number,
        submission_no: formData.submission_no,
        date: formData.date,
        amount: parseFloat(formData.amount),
        status: formData.status,
        notes: formData.notes,
        description: formData.notes,
        vendor: formData.client_name,
        files: formData.files
      };

      console.log('Données à sauvegarder:', dataToSave);

      if (editingPO) {
        const { data, error } = await supabase
          .from('purchase_orders')
          .update(dataToSave)
          .eq('id', editingPO.id)
          .select();

        if (error) {
          console.error('Erreur UPDATE:', error);
          throw error;
        }
      } else {
        const { data, error } = await supabase
          .from('purchase_orders')
          .insert([dataToSave])
          .select();

        if (error) {
          console.error('Erreur INSERT:', error);
          throw error;
        }
      }

      await fetchPurchaseOrders();
      setShowForm(false);
      setEditingPO(null);
      setFormData({
        client_name: '',
        po_number: '',
        submission_no: '',
        date: new Date().toISOString().split('T')[0],
        amount: '',
        status: 'pending',
        notes: '',
        files: []
      });
      
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error.message);
    }
  };

  const handleEdit = (po) => {
  setEditingPO(po);
  setFormData({
    client_name: po.client_name || po.client || '',
    po_number: po.po_number || '',
    submission_no: po.submission_no || '',
    date: po.date || new Date().toISOString().split('T')[0],
    amount: po.amount || '',
    status: po.status || 'pending',
    notes: po.notes || po.description || '',  // ← Description principale
    additionalNotes: po.additionalNotes || '',  // ← Notes complémentaires
    files: po.files || []
  });
  setShowForm(true);
    fetchSupplierDocuments(po.id);
};

  const cleanupFilesForPO = async (files) => {
    if (!files || files.length === 0) return;
    
    try {
      const filePaths = files
        .filter(file => file.path)
        .map(file => file.path);
      
      if (filePaths.length > 0) {
        const { error } = await supabase.storage
          .from('purchase-orders-pdfs')
          .remove(filePaths);
        
        if (error) {
          console.error('❌ Erreur nettoyage fichiers:', error);
        } else {
          console.log(`🧹 ${filePaths.length} fichier(s) supprimé(s) du storage`);
        }
      }
    } catch (error) {
      console.error('❌ Erreur lors du nettoyage:', error);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('🗑️ Êtes-vous sûr de vouloir supprimer ce bon d\'achat ?')) {
      return;
    }

    try {
      const { data: poData, error: fetchError } = await supabase
        .from('purchase_orders')
        .select('files')
        .eq('id', id)
        .single();

      if (fetchError) {
        console.error('❌ Erreur récupération bon d\'achat:', fetchError);
      }

      const { error: deleteError } = await supabase
        .from('purchase_orders')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      if (poData?.files) {
        await cleanupFilesForPO(poData.files);
      }

      await fetchPurchaseOrders();
      console.log('✅ Bon d\'achat et fichiers supprimés avec succès');

    } catch (error) {
      console.error('❌ Erreur lors de la suppression:', error.message);
      alert('Erreur lors de la suppression du bon d\'achat');
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      const { error } = await supabase
        .from('purchase_orders')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;
      await fetchPurchaseOrders();
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut:', error.message);
    }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploadingFiles(true);
    const uploadedFiles = [];

    console.log('📤 Début upload de', files.length, 'fichier(s)');

    for (const file of files) {
      try {
        console.log('📄 Upload en cours:', file.name);

        const cleanFileName = file.name
          .replace(/\s+/g, '_')
          .replace(/[^a-zA-Z0-9._-]/g, '')
          .substring(0, 100);

        const fileName = `${Date.now()}_${cleanFileName}`;
        const filePath = `purchase-orders/${fileName}`;

        console.log('📁 Nom nettoyé:', fileName);

        const { data, error } = await supabase.storage
          .from('purchase-orders-pdfs')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (error) {
          console.error('❌ Erreur Supabase:', error);
          throw new Error(`Erreur upload: ${error.message}`);
        }

        console.log('✅ Upload réussi:', data.path);

        const { data: urlData } = supabase.storage
          .from('purchase-orders-pdfs')
          .getPublicUrl(filePath);

        console.log('🔗 URL générée:', urlData.publicUrl);

        uploadedFiles.push({
          name: file.name,
          cleanName: cleanFileName,
          size: file.size,
          type: file.type,
          path: data.path,
          url: urlData.publicUrl,
          uploaded_at: new Date().toISOString()
        });

        console.log('✅ Fichier traité avec succès:', file.name);

      } catch (error) {
        console.error('❌ Erreur upload fichier:', file.name, error);
        
        let errorMessage = `Erreur upload "${file.name}": `;
        
        if (error.message.includes('not found')) {
          errorMessage += 'Bucket "purchase-orders-pdfs" non trouvé. Vérifiez la configuration Supabase.';
        } else if (error.message.includes('unauthorized')) {
          errorMessage += 'Accès non autorisé. Vérifiez les politiques du bucket.';
        } else if (error.message.includes('too large')) {
          errorMessage += 'Fichier trop volumineux (max 50MB).';
        } else {
          errorMessage += error.message;
        }
        
        alert(errorMessage);
      }
    }

    if (uploadedFiles.length > 0) {
      setFormData({...formData, files: [...(formData.files || []), ...uploadedFiles]});
      console.log(`✅ ${uploadedFiles.length}/${files.length} fichier(s) uploadé(s) avec succès`);
      
      if (uploadedFiles.length < files.length) {
        alert(`${uploadedFiles.length}/${files.length} fichiers uploadés avec succès. Voir la console pour les erreurs.`);
      }
    }

    setUploadingFiles(false);
    e.target.value = '';
  };

  const removeFile = async (index) => {
    const fileToRemove = formData.files[index];
    
    if (fileToRemove.path) {
      try {
        const { error } = await supabase.storage
          .from('purchase-orders-pdfs')
          .remove([fileToRemove.path]);
        
        if (error) {
          console.error('❌ Erreur suppression fichier:', error);
        } else {
          console.log('🗑️ Fichier supprimé du storage:', fileToRemove.path);
        }
      } catch (error) {
        console.error('❌ Erreur suppression fichier:', error);
      }
    }
    
    const newFiles = formData.files.filter((_, i) => i !== index);
    setFormData({...formData, files: newFiles});
  };

  const openFile = (file) => {
    if (file.url) {
      window.open(file.url, '_blank');
    } else {
      alert('Fichier non accessible - URL manquante');
    }
  };

  const downloadFile = async (file) => {
    if (!file.url) {
      alert('Impossible de télécharger - URL manquante');
      return;
    }

    try {
      const response = await fetch(file.url);
      const blob = await response.blob();
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('❌ Erreur téléchargement:', error);
      alert('Erreur lors du téléchargement');
    }
  };

  const getFileIcon = (fileType) => {
    if (fileType?.includes('pdf')) return '📄';
    if (fileType?.includes('excel') || fileType?.includes('sheet')) return '📊';
    if (fileType?.includes('word') || fileType?.includes('document')) return '📝';
    if (fileType?.includes('image')) return '🖼️';
    return '📎';
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusEmoji = (status) => {
    switch (status?.toLowerCase()) {
      case 'approved': return '✅';
      case 'pending': return '⏳';
      case 'rejected': return '❌';
      default: return '⏳';
    }
  };

  const getStatusBadge = (status) => {
    const baseClasses = "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium";
    switch (status?.toLowerCase()) {
      case 'approved':
        return `${baseClasses} bg-green-100 text-green-800 border border-green-200`;
      case 'pending':
        return `${baseClasses} bg-yellow-100 text-yellow-800 border border-yellow-200`;
      case 'rejected':
        return `${baseClasses} bg-red-100 text-red-800 border border-red-200`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800 border border-gray-200`;
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('fr-CA');
  };

  const filteredPurchaseOrders = purchaseOrders.filter(po => {
    const searchText = searchTerm.toLowerCase();
    const matchesSearch = 
      po.po_number?.toLowerCase().includes(searchText) ||
      po.client_name?.toLowerCase().includes(searchText) ||
      po.client?.toLowerCase().includes(searchText) ||
      po.submission_no?.toLowerCase().includes(searchText) ||
      po.notes?.toLowerCase().includes(searchText);
    
    const matchesStatus = statusFilter === 'all' || po.status?.toLowerCase() === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const totalAmount = filteredPurchaseOrders.reduce((sum, po) => sum + (po.amount || 0), 0);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        <p className="ml-4 text-indigo-600 font-medium">Chargement des bons d'achat...</p>
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        {/* 📱 FORMULAIRE MOBILE-FRIENDLY */}
        <div className="bg-white rounded-xl shadow-lg border border-indigo-200 overflow-hidden">
          
          {/* 📱 En-tête du formulaire responsive */}
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold">
                  {editingPO ? '✏️ Modifier le Bon d\'Achat' : '➕ Nouveau Bon d\'Achat'}
                </h2>
                <p className="text-indigo-100 text-sm mt-1">
                  {editingPO ? 'Modifiez les informations' : 'Créez un nouveau bon d\'achat'}
                </p>
              </div>
              
              {/* 📱 Boutons d'action responsive */}
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingPO(null);
                    setFormData({
                      client_name: '',
                      po_number: '',
                      submission_no: '',
                      date: new Date().toISOString().split('T')[0],
                      amount: '',
                      status: 'pending',
                      notes: '',
                      files: []
                    });
                  }}
                  className="w-full sm:w-auto px-4 py-2 bg-white/10 border border-white/20 rounded-lg hover:bg-white/20 text-sm font-medium"
                >
                  ❌ Annuler
                </button>
                <button
                  type="submit"
                  form="po-form"
                  className="w-full sm:w-auto px-4 py-2 bg-white text-indigo-600 rounded-lg hover:bg-gray-100 text-sm font-medium"
                >
                  {editingPO ? '💾 Mettre à jour' : '✨ Créer'}
                </button>
              </div>
            </div>
          </div>
          
          {/* 📱 Contenu du formulaire */}
          <div className="p-4 sm:p-6">
            <form id="po-form" onSubmit={handleSubmit} className="space-y-6">
              
              {/* 📱 Client et Description - Stack sur mobile */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <label className="block text-sm font-semibold text-blue-800 mb-2">
                    👤 Client *
                  </label>
                  <select
                    value={formData.client_name}
                    onChange={(e) => setFormData({...formData, client_name: e.target.value})}
                    className="block w-full rounded-lg border-blue-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3"
                    required
                  >
                    <option value="">Sélectionner un client...</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.name}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <label className="block text-sm font-semibold text-green-800 mb-2">
                    📝 Description *
                  </label>
                  <input
                    type="text"
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    className="block w-full rounded-lg border-green-300 shadow-sm focus:border-green-500 focus:ring-green-500 text-base p-3"
                    placeholder="Description du bon d'achat..."
                    required
                  />
                </div>
              </div>

              {/* 📱 Numéro PO et Soumission */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                  <label className="block text-sm font-semibold text-indigo-800 mb-2">
                    📄 No. Bon Achat Client *
                  </label>
                  <input
                    type="text"
                    value={formData.po_number}
                    onChange={(e) => setFormData({...formData, po_number: e.target.value})}
                    className="block w-full rounded-lg border-indigo-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base p-3"
                    placeholder="Ex: PO-2025-001"
                    required
                  />
                </div>

                <div className="bg-cyan-50 p-4 rounded-lg border border-cyan-200">
                  <label className="block text-sm font-semibold text-cyan-800 mb-2">
                    📋 No. Soumission
                  </label>
                  <div className="space-y-2">
                    <select
                      value={formData.submission_no}
                      onChange={(e) => setFormData({...formData, submission_no: e.target.value})}
                      className="block w-full rounded-lg border-cyan-300 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 text-base p-3"
                    >
                      <option value="">Sélectionner ou entrer manuellement...</option>
                      {submissions.map((submission) => (
                        <option key={submission.id} value={submission.submission_number}>
                          {submission.submission_number} - {submission.client_name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={formData.submission_no}
                      onChange={(e) => setFormData({...formData, submission_no: e.target.value})}
                      className="block w-full rounded-lg border-cyan-300 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 text-base p-3"
                      placeholder="Ou entrer manuellement..."
                    />
                  </div>
                </div>
              </div>

              {/* 📱 Date, Montant et Statut */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                <div className="bg-pink-50 p-4 rounded-lg border border-pink-200">
                  <label className="block text-sm font-semibold text-pink-800 mb-2">
                    📅 Date
                  </label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({...formData, date: e.target.value})}
                    className="block w-full rounded-lg border-pink-300 shadow-sm focus:border-pink-500 focus:ring-pink-500 text-base p-3"
                  />
                </div>

                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                  <label className="block text-sm font-semibold text-yellow-800 mb-2">
                    💰 Montant *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({...formData, amount: e.target.value})}
                    className="block w-full rounded-lg border-yellow-300 shadow-sm focus:border-yellow-500 focus:ring-yellow-500 text-base p-3"
                    placeholder="0.00"
                    required
                  />
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    🏷️ Statut
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({...formData, status: e.target.value})}
                    className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base p-3"
                  >
                    <option value="pending">⏳ En attente</option>
                    <option value="approved">✅ Approuvé</option>
                    <option value="rejected">❌ Rejeté</option>
                  </select>
                </div>
              </div>

              {/* 📱 Notes complémentaires */}
              <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                <label className="block text-sm font-semibold text-purple-800 mb-2">
                  📝 Notes complémentaires (optionnel)
                </label>
                <textarea
                  value={formData.additionalNotes || ''}
                  onChange={(e) => setFormData({...formData, additionalNotes: e.target.value})}
                  className="block w-full rounded-lg border-purple-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-base p-3"
                  placeholder="Notes additionnelles, instructions spéciales..."
                  rows="3"
                />
              </div>

              {/* 📱 Section fichiers MOBILE-FRIENDLY */}
              <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                <label className="block text-sm font-semibold text-indigo-800 mb-2">
                 {/* 📎 Documents d'Achat Fournisseurs - NOUVEAU BLOC */}
{editingPO && (
  <div className="bg-orange-50 p-4 rounded-lg border border-orange-200 mb-4">
    <label className="block text-sm font-semibold text-orange-800 mb-2">
      🏢 Documents d'Achat Fournisseurs
    </label>
    
    {/* Upload par fournisseur */}
    <div className="mb-4">
      <p className="text-sm text-orange-600 mb-2">
        Ajouter des documents (factures, bons de commande) par fournisseur :
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {suppliers.map((supplier) => (
          <div key={supplier.id} className="flex items-center gap-2">
            <label 
              htmlFor={`supplier-doc-${supplier.id}`}
              className="flex-1 px-3 py-2 bg-white border border-orange-300 rounded-lg hover:bg-orange-50 cursor-pointer text-sm"
            >
              <Building2 className="w-4 h-4 inline mr-2" />
              {supplier.company_name}
            </label>
            <input
              id={`supplier-doc-${supplier.id}`}
              type="file"
              multiple
              accept=".pdf,.xls,.xlsx,.doc,.docx,.png,.jpg,.jpeg"
              onChange={(e) => handleSupplierDocumentUpload(e, supplier.id)}
              disabled={uploadingSupplierDocs}
              className="hidden"
            />
          </div>
        ))}
      </div>
      {uploadingSupplierDocs && (
        <p className="text-sm text-orange-600 mt-2 flex items-center">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-600 mr-2"></div>
          📤 Upload en cours...
        </p>
      )}
    </div>

    {/* Liste des documents fournisseurs */}
    {supplierDocuments.length > 0 && (
      <div className="space-y-2">
        <p className="text-sm font-medium text-orange-700">
          📁 Documents fournisseurs ({supplierDocuments.length})
        </p>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {supplierDocuments.map((doc) => (
            <div key={doc.id} className="bg-white p-3 rounded border border-orange-200 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  <span className="text-xl flex-shrink-0">🏢</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {doc.file_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {doc.suppliers?.company_name || 'Fournisseur inconnu'} • 
                      {formatFileSize(doc.file_size)} • 
                      {new Date(doc.uploaded_at).toLocaleDateString('fr-CA')}
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  {doc.file_url && (
                    <>
                      <button
                        type="button"
                        onClick={() => window.open(doc.file_url, '_blank')}
                        className="px-2 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded"
                      >
                        👁️ Voir
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadFile({url: doc.file_url, name: doc.file_name})}
                        className="px-2 py-1 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded"
                      >
                        💾
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => removeSupplierDocument(doc.id, doc.file_path)}
                    className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

    {supplierDocuments.length === 0 && (
      <p className="text-sm text-orange-600 italic mt-2">
        Aucun document fournisseur attaché pour l'instant
      </p>
    )}
  </div>
)}
                 📎 Documents (PDF, XLS, DOC, etc.)
                </label>
                
                {/* 📱 Zone d'upload mobile-friendly */}
                <div className="mb-4">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.xls,.xlsx,.doc,.docx,.txt,.png,.jpg,.jpeg"
                      onChange={handleFileUpload}
                      disabled={uploadingFiles}
                      className="block w-full text-sm text-indigo-600 file:mr-4 file:py-3 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 disabled:opacity-50"
                    />
                  </div>
                  {uploadingFiles && (
                    <p className="text-sm text-indigo-600 mt-2 flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600 mr-2"></div>
                      📤 Upload en cours... Veuillez patienter.
                    </p>
                  )}
                </div>

                {/* 📱 Liste des fichiers mobile-friendly */}
                {formData.files && formData.files.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-indigo-700">
                      📁 Documents joints ({formData.files.length})
                    </p>
                    <div className="space-y-2">
                      {formData.files.map((file, index) => (
                        <div key={index} className="bg-white p-3 rounded border border-indigo-200 shadow-sm">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="flex items-center space-x-3 flex-1 min-w-0">
                              <span className="text-xl flex-shrink-0">{getFileIcon(file.type)}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {file.name}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {formatFileSize(file.size)} • {file.type}
                                </p>
                              </div>
                            </div>
                            
                            {/* 📱 Actions fichier responsive */}
                            <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                              {file.url ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openFile(file)}
                                    className="flex-1 sm:flex-none px-3 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded border border-blue-300 transition-colors"
                                    title="Ouvrir le fichier"
                                  >
                                    👁️ Voir
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => downloadFile(file)}
                                    className="flex-1 sm:flex-none px-3 py-1 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded border border-green-300 transition-colors"
                                    title="Télécharger le fichier"
                                  >
                                    💾 Télécharger
                                  </button>
                                </>
                              ) : (
                                <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded">
                                  🔄 En cours...
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => removeFile(index)}
                                className="flex-1 sm:flex-none px-3 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded border border-red-300 transition-colors"
                                title="Supprimer le fichier"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* 📱 En-tête responsive avec statistiques */}
      <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-xl shadow-lg p-4 sm:p-6 text-white">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold">💼 Gestion des Bons d'Achat</h2>
            <p className="text-white/90 text-sm sm:text-base mt-1">
              Gérez vos bons d'achat et commandes clients
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={handleSendReport}
              disabled={sendingReport}
              className="w-full sm:w-auto px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-sm font-medium hover:bg-white/20 backdrop-blur-sm"
            >
              📧 {sendingReport ? 'Envoi...' : 'Rapport'}
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="w-full sm:w-auto px-4 py-2 bg-white text-indigo-600 rounded-lg hover:bg-gray-100 text-sm font-medium"
            >
              ➕ Nouveau Bon d'Achat
            </button>
          </div>
        </div>

        {/* 📱 Statistiques responsive */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">📊</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Total</p>
                <p className="text-xl sm:text-2xl font-bold text-white">{purchaseOrders.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">✅</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Approuvés</p>
                <p className="text-xl sm:text-2xl font-bold text-white">
                  {purchaseOrders.filter(po => po.status?.toLowerCase() === 'approved').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">⏳</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">En Attente</p>
                <p className="text-xl sm:text-2xl font-bold text-white">
                  {purchaseOrders.filter(po => po.status?.toLowerCase() === 'pending').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">💰</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Montant Total</p>
                <p className="text-lg sm:text-2xl font-bold text-white">{formatCurrency(totalAmount)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 📱 Filtres et recherche responsive */}
      <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6 border border-gray-200">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="🔍 Rechercher par numéro PO, client, soumission..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-4 py-3 rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base"
              />
            </div>
          </div>
          <div className="w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base p-3"
            >
              <option value="all">Tous les statuts</option>
              <option value="pending">⏳ En attente</option>
              <option value="approved">✅ Approuvé</option>
              <option value="rejected">❌ Rejeté</option>
            </select>
          </div>
        </div>
      </div>

      {/* 📊 DESKTOP VIEW - Table compacte avec Client & Description */}
      <div className="hidden lg:block bg-white shadow-lg overflow-hidden rounded-lg border border-gray-200">
        {filteredPurchaseOrders.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-6xl mb-4 block">📋</span>
            <p className="text-gray-500 text-lg">
              {purchaseOrders.length === 0 ? 'Aucun bon d\'achat créé' : 'Aucun bon d\'achat trouvé avec ces filtres'}
            </p>
            {purchaseOrders.length === 0 && (
              <button
                onClick={() => setShowForm(true)}
                className="mt-4 inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
              >
                ➕ Créer le premier bon d'achat
              </button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Bon d'achat
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client & Description
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Montant
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fichiers
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPurchaseOrders.map((po) => (
                <tr key={po.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-4 whitespace-nowrap">
                    <div className="text-sm space-y-1">
                      <div className="bg-indigo-100 text-indigo-800 px-2 py-1 rounded text-xs font-medium inline-block">
                        📄 {po.po_number || 'N/A'}
                      </div>
                      {po.submission_no && (
                        <div className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium inline-block ml-1">
                          📋 {po.submission_no}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <div className="text-sm">
                      <div className="font-medium text-gray-900">{po.client_name || po.client || 'N/A'}</div>
                      <div className="text-gray-500 truncate max-w-xs" title={po.notes || po.description}>
                        {po.notes || po.description || 'Aucune description'}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                    {formatDate(po.date || po.created_at)}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-center">
                    <div className="text-sm font-medium text-green-600">
                      {formatCurrency(po.amount)}
                    </div>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      po.status?.toLowerCase() === 'approved' ? 'bg-green-100 text-green-800' :
                      po.status?.toLowerCase() === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      po.status?.toLowerCase() === 'rejected' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {po.status?.toLowerCase() === 'approved' ? '✅' :
                       po.status?.toLowerCase() === 'pending' ? '⏳' :
                       po.status?.toLowerCase() === 'rejected' ? '❌' : '❓'}
                    </span>
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                    {po.files && po.files.length > 0 ? (
                      <div className="flex items-center justify-center">
                        <FileText className="w-4 h-4 mr-1" />
                        {po.files.length}
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-center">
                    <div className="flex justify-center space-x-1">
                      {po.status?.toLowerCase() === 'pending' && (
                        <>
                          <button
                            onClick={() => handleStatusChange(po.id, 'approved')}
                            className="bg-green-100 text-green-700 hover:bg-green-200 p-2 rounded-lg transition-colors"
                            title="Approuver"
                          >
                            ✅
                          </button>
                          <button
                            onClick={() => handleStatusChange(po.id, 'rejected')}
                            className="bg-red-100 text-red-700 hover:bg-red-200 p-2 rounded-lg transition-colors"
                            title="Rejeter"
                          >
                            ❌
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleEdit(po)}
                        className="bg-blue-100 text-blue-700 hover:bg-blue-200 p-2 rounded-lg transition-colors"
                        title="Modifier"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(po.id)}
                        className="bg-red-100 text-red-700 hover:bg-red-200 p-2 rounded-lg transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 📱 MOBILE VIEW - Cards empilées */}
      <div className="lg:hidden space-y-4">
        {filteredPurchaseOrders.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <span className="text-6xl mb-4 block">📋</span>
            <p className="text-gray-500 text-lg mb-4">
              {purchaseOrders.length === 0 ? 'Aucun bon d\'achat créé' : 'Aucun bon d\'achat trouvé'}
            </p>
            {purchaseOrders.length === 0 && (
              <button
                onClick={() => setShowForm(true)}
                className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
              >
                ➕ Créer le premier bon d'achat
              </button>
            )}
          </div>
        ) : (
          filteredPurchaseOrders.map((po) => (
            <div key={po.id} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
              
              {/* 📱 En-tête de la card */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">{getStatusEmoji(po.status)}</span>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-base">
                        📄 {po.po_number || 'N/A'}
                      </h3>
                      <p className="text-sm text-gray-600">{po.client_name || po.client || 'N/A'}</p>
                    </div>
                  </div>
                  
                  {/* 📱 Menu actions mobile */}
                  <div className="relative">
                    <button
                      onClick={() => setSelectedOrderId(selectedOrderId === po.id ? null : po.id)}
                      className="p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-white/50"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                    
                    {/* 📱 Dropdown actions */}
                    {selectedOrderId === po.id && (
                      <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                        <div className="py-1">
                          <button
                            onClick={() => {
                              handleEdit(po);
                              setSelectedOrderId(null);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            Modifier
                          </button>
                          {po.status?.toLowerCase() === 'pending' && (
                            <>
                              <button
                                onClick={() => {
                                  handleStatusChange(po.id, 'approved');
                                  setSelectedOrderId(null);
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-green-600 hover:bg-green-50 flex items-center"
                              >
                                ✅ Approuver
                              </button>
                              <button
                                onClick={() => {
                                  handleStatusChange(po.id, 'rejected');
                                  setSelectedOrderId(null);
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-orange-600 hover:bg-orange-50 flex items-center"
                              >
                                ❌ Rejeter
                              </button>
                            </>
                          )}
                          <hr className="my-1" />
                          <button
                            onClick={() => {
                              handleDelete(po.id);
                              setSelectedOrderId(null);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Supprimer
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 📱 Contenu de la card */}
              <div className="p-4 space-y-3">
                
                {/* 📱 Description */}
                <div>
                  <span className="text-gray-500 text-sm block">📝 Description</span>
                  <p className="text-gray-900 font-medium">{po.notes || po.description || 'Aucune description'}</p>
                </div>

                {/* 📱 Informations principales */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 block">📅 Date</span>
                    <span className="font-medium text-gray-900">{formatDate(po.date || po.created_at)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">💰 Montant</span>
                    <span className="font-bold text-green-600 text-base">{formatCurrency(po.amount)}</span>
                  </div>
                </div>

                {/* 📱 Soumission si présente */}
                {po.submission_no && (
                  <div className="text-sm">
                    <span className="text-gray-500">📋 Soumission</span>
                    <span className="ml-2 text-blue-600 font-medium">{po.submission_no}</span>
                  </div>
                )}

                {/* 📱 Statut */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 text-sm">Statut</span>
                  <span className={`px-2 py-1 rounded text-xs ${
                    po.status?.toLowerCase() === 'approved' ? 'bg-green-100 text-green-800' :
                    po.status?.toLowerCase() === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    po.status?.toLowerCase() === 'rejected' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {po.status?.toLowerCase() === 'approved' ? '✅ Approuvé' : 
                     po.status?.toLowerCase() === 'pending' ? '⏳ En attente' : 
                     po.status?.toLowerCase() === 'rejected' ? '❌ Rejeté' : (po.status || 'Inconnu')}
                  </span>
                </div>

                {/* 📱 Notes additionnelles si présentes */}
                {po.additionalNotes && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <span className="text-gray-500 text-sm block mb-1">📝 Notes complémentaires</span>
                    <p className="text-gray-700 text-sm">{po.additionalNotes}</p>
                  </div>
                )}

                {/* 📱 Fichiers attachés */}
                {po.files && po.files.length > 0 && (
                  <div className="border-t pt-3">
                    <span className="text-gray-500 text-sm block mb-2">📎 Fichiers ({po.files.length})</span>
                    <div className="space-y-2">
                      {po.files.map((file, index) => (
                        <div key={index} className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-2">
                          <div className="flex items-center space-x-2 flex-1 min-w-0">
                            <span className="text-lg">{getFileIcon(file.type)}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-blue-800 truncate">{file.name}</p>
                              <p className="text-xs text-blue-600">{formatFileSize(file.size)}</p>
                            </div>
                          </div>
                          <div className="flex space-x-1">
                            <button
                              onClick={() => openFile(file)}
                              className="p-1 text-blue-600 hover:bg-blue-200 rounded"
                              title="Ouvrir"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => downloadFile(file)}
                              className="p-1 text-green-600 hover:bg-green-200 rounded"
                              title="Télécharger"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 📱 Actions rapides en bas */}
              <div className="bg-gray-50 px-4 py-3 flex gap-2">
                <button
                  onClick={() => handleEdit(po)}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  ✏️ Modifier
                </button>
                {po.status?.toLowerCase() === 'pending' && (
                  <button
                    onClick={() => handleStatusChange(po.id, 'approved')}
                    className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                  >
                    ✅ Approuver
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 📱 Note explicative */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-700">
          📊 {purchaseOrders.length} bons d'achat • {submissions.length} soumissions disponibles
        </p>
      </div>
    </div>
  );
}
