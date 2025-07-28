import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

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
  
  // Form state avec TES vraies colonnes
  const [formData, setFormData] = useState({
    client_name: '',
    po_number: '',
    submission_no: '',
    date: new Date().toISOString().split('T')[0], // Format YYYY-MM-DD
    amount: '',
    status: 'pending',
    notes: '',
    files: []
  });

  useEffect(() => {
    fetchPurchaseOrders();
    fetchClients();
    fetchSubmissions();
    
    // Déconnexion automatique à la fermeture du navigateur
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

  const handleSendReport = async () => {
    setSendingReport(true);
    try {
      const response = await fetch('/api/send-weekly-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        // Rapport envoyé avec succès
      } else {
        const errorData = await response.text();
        console.error('Erreur:', errorData);
      }
    } catch (error) {
      console.error('Erreur lors de l\'envoi:', error);
    } finally {
      setSendingReport(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.client_name || !formData.po_number || !formData.amount) {
      return;
    }

    try {
      const dataToSave = {
        client_name: formData.client_name,
        client: formData.client_name, // Pour compatibilité (doublon dans ta table)
        po_number: formData.po_number,
        submission_no: formData.submission_no,
        date: formData.date,
        amount: parseFloat(formData.amount),
        status: formData.status,
        notes: formData.notes,
        description: formData.notes, // Pour compatibilité
        vendor: formData.client_name, // Pour compatibilité
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
      notes: po.notes || po.description || '',
      files: po.files || []
    });
    setShowForm(true);
  };

  // Fonction pour nettoyer les fichiers lors de la suppression
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
      // Récupérer les infos du bon d'achat avant suppression
      const { data: poData, error: fetchError } = await supabase
        .from('purchase_orders')
        .select('files')
        .eq('id', id)
        .single();

      if (fetchError) {
        console.error('❌ Erreur récupération bon d\'achat:', fetchError);
      }

      // Supprimer le bon d'achat de la base de données
      const { error: deleteError } = await supabase
        .from('purchase_orders')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      // Nettoyer les fichiers associés
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

  // Fonction d'upload de fichiers CORRIGÉE
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploadingFiles(true);
    const uploadedFiles = [];

    console.log('📤 Début upload de', files.length, 'fichier(s)');

    for (const file of files) {
      try {
        console.log('📄 Upload en cours:', file.name);

        // Nettoyer le nom du fichier
        const cleanFileName = file.name
          .replace(/\s+/g, '_')           // Remplacer espaces par _
          .replace(/[^a-zA-Z0-9._-]/g, '') // Supprimer caractères spéciaux
          .substring(0, 100);             // Limiter la longueur

        // Ajouter timestamp pour éviter les doublons
        const fileName = `${Date.now()}_${cleanFileName}`;
        const filePath = `purchase-orders/${fileName}`;

        console.log('📁 Nom nettoyé:', fileName);

        // Upload vers VOTRE bucket existant
        const { data, error } = await supabase.storage
          .from('purchase-orders-pdfs')  // ← VOTRE BUCKET EXISTANT
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (error) {
          console.error('❌ Erreur Supabase:', error);
          throw new Error(`Erreur upload: ${error.message}`);
        }

        console.log('✅ Upload réussi:', data.path);

        // Obtenir l'URL publique
        const { data: urlData } = supabase.storage
          .from('purchase-orders-pdfs')  // ← VOTRE BUCKET EXISTANT
          .getPublicUrl(filePath);

        console.log('🔗 URL générée:', urlData.publicUrl);

        uploadedFiles.push({
          name: file.name,              // Garder le nom original pour l'affichage
          cleanName: cleanFileName,     // Nom nettoyé
          size: file.size,
          type: file.type,
          path: data.path,
          url: urlData.publicUrl,
          uploaded_at: new Date().toISOString()
        });

        console.log('✅ Fichier traité avec succès:', file.name);

      } catch (error) {
        console.error('❌ Erreur upload fichier:', file.name, error);
        
        // Message d'erreur détaillé
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

    // Ajouter les fichiers uploadés avec succès
    if (uploadedFiles.length > 0) {
      setFormData({...formData, files: [...(formData.files || []), ...uploadedFiles]});
      console.log(`✅ ${uploadedFiles.length}/${files.length} fichier(s) uploadé(s) avec succès`);
      
      if (uploadedFiles.length < files.length) {
        alert(`${uploadedFiles.length}/${files.length} fichiers uploadés avec succès. Voir la console pour les erreurs.`);
      }
    }

    setUploadingFiles(false);
    // Réinitialiser l'input
    e.target.value = '';
  };

  // Fonction pour supprimer un fichier
  const removeFile = async (index) => {
    const fileToRemove = formData.files[index];
    
    // Si le fichier a été uploadé, le supprimer du storage
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
    
    // Retirer de la liste
    const newFiles = formData.files.filter((_, i) => i !== index);
    setFormData({...formData, files: newFiles});
  };

  // Fonction pour ouvrir un fichier
  const openFile = (file) => {
    if (file.url) {
      window.open(file.url, '_blank');
    } else {
      alert('Fichier non accessible - URL manquante');
    }
  };

  // Fonction pour télécharger un fichier
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

  // Fonction pour obtenir l'icône du fichier
  const getFileIcon = (fileType) => {
    if (fileType?.includes('pdf')) return '📄';
    if (fileType?.includes('excel') || fileType?.includes('sheet')) return '📊';
    if (fileType?.includes('word') || fileType?.includes('document')) return '📝';
    if (fileType?.includes('image')) return '🖼️';
    return '📎';
  };

  // Fonction pour formater la taille du fichier
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Fonction de test pour votre bucket
  const testExistingBucket = async () => {
    try {
      console.log('🔍 Test du bucket purchase-orders-pdfs...');
      
      const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
      
      if (bucketsError) {
        console.error('❌ Erreur accès buckets:', bucketsError);
        return false;
      }
      
      console.log('📦 Buckets disponibles:', buckets.map(b => b.name));
      
      const yourBucket = buckets.find(b => b.name === 'purchase-orders-pdfs');
      if (!yourBucket) {
        console.error('❌ Bucket "purchase-orders-pdfs" non trouvé');
        alert('❌ Bucket "purchase-orders-pdfs" non trouvé');
        return false;
      }
      
      console.log('✅ Votre bucket trouvé:', yourBucket);
      
      // Test upload
      const testContent = 'test file content';
      const testBlob = new Blob([testContent], { type: 'text/plain' });
      const testFileName = `test_${Date.now()}.txt`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('purchase-orders-pdfs')
        .upload(`test/${testFileName}`, testBlob);
      
      if (uploadError) {
        console.error('❌ Erreur test upload:', uploadError);
        alert(`❌ Erreur test upload: ${uploadError.message}\n\nVérifiez les policies de votre bucket.`);
        return false;
      }
      
      console.log('✅ Test upload réussi');
      
      // Nettoyer le fichier test
      await supabase.storage
        .from('purchase-orders-pdfs')
        .remove([`test/${testFileName}`]);
      
      console.log('✅ Test terminé avec succès');
      alert('✅ Votre bucket purchase-orders-pdfs fonctionne parfaitement !');
      return true;
      
    } catch (error) {
      console.error('❌ Erreur test:', error);
      alert(`❌ Erreur test: ${error.message}`);
      return false;
    }
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
    const baseClasses = "inline-flex items-center px-3 py-1 rounded-full text-xs font-medium";
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
      <div className="max-w-4xl mx-auto">
        {/* Formulaire avec couleurs et tes vraies colonnes */}
        <div className="bg-gradient-to-br from-indigo-50 via-white to-purple-50 rounded-xl shadow-lg border border-indigo-200 p-8">
          <div className="bg-indigo-600 text-white px-6 py-4 rounded-lg mb-6 flex justify-between items-center">
            <h2 className="text-2xl font-bold flex items-center">
              {editingPO ? '✏️ Modifier le Bon d\'Achat' : '➕ Nouveau Bon d\'Achat'}
            </h2>
            {/* Boutons déplacés dans le rectangle bleu */}
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={testExistingBucket}
                className="px-3 py-1 text-xs bg-white/20 rounded border border-white/30 text-white hover:bg-white/30"
              >
                🔍 Test Storage
              </button>
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
                className="px-4 py-2 border border-white/30 rounded-lg text-sm font-medium text-white bg-white/20 hover:bg-white/30 backdrop-blur-sm"
              >
                ❌ Annuler
              </button>
              <button
                type="submit"
                form="po-form"
                className="px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-indigo-600 bg-white hover:bg-gray-100"
              >
                {editingPO ? '💾 Mettre à jour' : '✨ Créer'}
              </button>
            </div>
          </div>
          
          <form id="po-form" onSubmit={handleSubmit} className="space-y-6">
            {/* Client (sélection) + Statut */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <label className="block text-sm font-semibold text-blue-800 mb-2">
                  👤 Client *
                </label>
                <select
                  value={formData.client_name}
                  onChange={(e) => setFormData({...formData, client_name: e.target.value})}
                  className="block w-full rounded-lg border-blue-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-lg p-3"
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

              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <label className="block text-sm font-semibold text-gray-800 mb-2">
                  🏷️ Statut
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value})}
                  className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-lg p-3"
                >
                  <option value="pending">⏳ En attente</option>
                  <option value="approved">✅ Approuvé</option>
                  <option value="rejected">❌ Rejeté</option>
                </select>
              </div>
            </div>

            {/* No. Bon Achat Client + Soumission */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <label className="block text-sm font-semibold text-green-800 mb-2">
                  📄 No. Bon Achat Client *
                </label>
                <input
                  type="text"
                  value={formData.po_number}
                  onChange={(e) => setFormData({...formData, po_number: e.target.value})}
                  className="block w-full rounded-lg border-green-300 shadow-sm focus:border-green-500 focus:ring-green-500 text-lg p-3"
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
                    className="block w-full rounded-lg border-cyan-300 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 text-lg p-3"
                  >
                    <option value="">Sélectionner ou entrer manuellement...</option>
                    {submissions.map((submission) => (
                      <option key={submission.id} value={submission.submission_number}>
                        {submission.submission_number} - {submission.client_name}: {submission.description}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={formData.submission_no}
                    onChange={(e) => setFormData({...formData, submission_no: e.target.value})}
                    className="block w-full rounded-lg border-cyan-300 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 text-lg p-3"
                    placeholder="Ou entrer manuellement..."
                  />
                </div>
              </div>
            </div>

            {/* Date + Montant */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-pink-50 p-4 rounded-lg border border-pink-200">
                <label className="block text-sm font-semibold text-pink-800 mb-2">
                  📅 Date
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                  className="block w-full rounded-lg border-pink-300 shadow-sm focus:border-pink-500 focus:ring-pink-500 text-lg p-3"
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
                  className="block w-full rounded-lg border-yellow-300 shadow-sm focus:border-yellow-500 focus:ring-yellow-500 text-lg p-3"
                  placeholder="0.00"
                  required
                />
              </div>
            </div>

            {/* Notes (réduit à une ligne) */}
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
              <label className="block text-sm font-semibold text-purple-800 mb-2">
                📝 Notes
              </label>
              <input
                type="text"
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                className="block w-full rounded-lg border-purple-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-lg p-3"
                placeholder="Notes et commentaires..."
              />
            </div>

            {/* Section fichiers AMÉLIORÉE */}
            <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
              <label className="block text-sm font-semibold text-indigo-800 mb-2">
                📎 Documents (PDF, XLS, DOC, etc.)
              </label>
              
              {/* Zone d'upload */}
              <div className="mb-4">
                <input
                  type="file"
                  multiple
                  accept=".pdf,.xls,.xlsx,.doc,.docx,.txt,.png,.jpg,.jpeg"
                  onChange={handleFileUpload}
                  disabled={uploadingFiles}
                  className="block w-full text-sm text-indigo-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 disabled:opacity-50"
                />
                {uploadingFiles && (
                  <p className="text-sm text-indigo-600 mt-2 flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600 mr-2"></div>
                    📤 Upload en cours... Veuillez patienter.
                  </p>
                )}
              </div>

              {/* Liste des fichiers */}
              {formData.files && formData.files.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-indigo-700">
                    📁 Documents joints ({formData.files.length})
                  </p>
                  {formData.files.map((file, index) => (
                    <div key={index} className="bg-white p-3 rounded border border-indigo-200 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3 flex-1">
                          <span className="text-xl">{getFileIcon(file.type)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {file.name}
                            </p>
                            <div className="flex items-center space-x-4 text-xs text-gray-500">
                              <span>{formatFileSize(file.size)}</span>
                              <span>{file.type}</span>
                              {file.uploaded_at && (
                                <span>📅 {new Date(file.uploaded_at).toLocaleDateString('fr-CA')}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          {file.url ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openFile(file)}
                                className="px-2 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded border border-blue-300 transition-colors"
                                title="Ouvrir le fichier"
                              >
                                👁️ Voir
                              </button>
                              <button
                                type="button"
                                onClick={() => downloadFile(file)}
                                className="px-2 py-1 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded border border-green-300 transition-colors"
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
                            className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded border border-red-300 transition-colors"
                            title="Supprimer le fichier"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête sans logo et statistiques colorées */}
      <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-xl shadow-lg p-6 text-white">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold">💼 Gestion des Bons d'Achat</h2>
          <div className="flex space-x-3">
            <button
              onClick={handleSendReport}
              disabled={sendingReport}
              className="inline-flex items-center px-4 py-2 border border-white/20 rounded-lg shadow-sm text-sm font-medium text-white bg-white/10 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white disabled:opacity-50 backdrop-blur-sm"
            >
              📧 {sendingReport ? 'Envoi...' : 'Envoyer Rapport'}
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-indigo-600 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              ➕ Nouveau Bon d'Achat
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-3xl mr-3">📊</span>
              <div>
                <p className="text-sm font-medium text-white/90">Total</p>
                <p className="text-2xl font-bold text-white">{purchaseOrders.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-3xl mr-3">✅</span>
              <div>
                <p className="text-sm font-medium text-white/90">Approuvés</p>
                <p className="text-2xl font-bold text-white">
                  {purchaseOrders.filter(po => po.status?.toLowerCase() === 'approved').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-3xl mr-3">⏳</span>
              <div>
                <p className="text-sm font-medium text-white/90">En Attente</p>
                <p className="text-2xl font-bold text-white">
                  {purchaseOrders.filter(po => po.status?.toLowerCase() === 'pending').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-3xl mr-3">💰</span>
              <div>
                <p className="text-sm font-medium text-white/90">Montant Total</p>
                <p className="text-2xl font-bold text-white">{formatCurrency(totalAmount)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filtres et recherche */}
      <div className="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          <div className="flex-1 max-w-lg">
            <input
              type="text"
              placeholder="🔍 Rechercher par numéro PO, client, soumission, notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-lg p-3"
            />
          </div>
          <div className="flex items-center space-x-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-lg p-3"
            >
              <option value="all">Tous les statuts</option>
              <option value="pending">⏳ En attente</option>
              <option value="approved">✅ Approuvé</option>
              <option value="rejected">❌ Rejeté</option>
            </select>
          </div>
        </div>
      </div>

      {/* Info système */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-sm text-gray-600">
          📊 {purchaseOrders.length} bons d'achat • {submissions.length} soumissions disponibles
        </p>
      </div>

      {/* Liste des bons d'achat */}
      <div className="bg-white shadow-lg overflow-hidden rounded-lg border border-gray-200">
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
          <ul className="divide-y divide-gray-200">
            {filteredPurchaseOrders.map((po) => (
              <li key={po.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0">
                      <span className="text-2xl">{getStatusEmoji(po.status)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3 mb-2">
                        <p className="text-lg font-semibold text-gray-900">
                          📄 {po.po_number || 'N/A'}
                        </p>
                        {po.submission_no && (
                          <p className="text-sm text-blue-600 bg-blue-50 px-2 py-1 rounded">
                            📋 {po.submission_no}
                          </p>
                        )}
                        <span className={getStatusBadge(po.status)}>
                          {po.status === 'approved' ? 'Approuvé' : 
                           po.status === 'pending' ? 'En attente' : 
                           po.status === 'rejected' ? 'Rejeté' : (po.status || 'Inconnu')}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                        <p>
                          <span className="font-medium">👤 Client:</span> {po.client_name || po.client || 'N/A'}
                        </p>
                        <p>
                          <span className="font-medium">💰 Montant:</span> {formatCurrency(po.amount)}
                        </p>
                        <p>
                          <span className="font-medium">📅 Date:</span> {formatDate(po.date || po.created_at)}
                        </p>
                      </div>
                      {po.notes && (
                        <p className="text-sm text-gray-500 mt-2 bg-gray-50 p-2 rounded">
                          📝 {po.notes}
                        </p>
                      )}
                      {/* Affichage des fichiers AMÉLIORÉ */}
                      {po.files && po.files.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-indigo-600 mb-1">
                            📎 {po.files.length} document(s):
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {po.files.map((file, index) => (
                              <div key={index} className="flex items-center space-x-1">
                                <button
                                  onClick={() => openFile(file)}
                                  className="inline-flex items-center text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-2 py-1 rounded border border-indigo-300 transition-colors"
                                  title={`Ouvrir ${file.name}`}
                                  disabled={!file.url}
                                >
                                  <span className="mr-1">{getFileIcon(file.type)}</span>
                                  {file.name}
                                </button>
                                {file.url && (
                                  <button
                                    onClick={() => downloadFile(file)}
                                    className="text-xs bg-green-100 hover:bg-green-200 text-green-700 px-1 py-1 rounded border border-green-300 transition-colors"
                                    title="Télécharger"
                                  >
                                    💾
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {po.status?.toLowerCase() === 'pending' && (
                      <>
                        <button
                          onClick={() => handleStatusChange(po.id, 'approved')}
                          className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-white bg-green-600 hover:bg-green-700 shadow-sm"
                          title="Approuver"
                        >
                          ✅ Approuver
                        </button>
                        <button
                          onClick={() => handleStatusChange(po.id, 'rejected')}
                          className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-white bg-red-600 hover:bg-red-700 shadow-sm"
                          title="Rejeter"
                        >
                          ❌ Rejeter
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleEdit(po)}
                      className="inline-flex items-center px-3 py-1 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 shadow-sm"
                      title="Modifier"
                    >
                      ✏️ Modifier
                    </button>
                    <button
                      onClick={() => handleDelete(po.id)}
                      className="inline-flex items-center px-3 py-1 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-red-50 hover:text-red-700 hover:border-red-300 shadow-sm"
                      title="Supprimer"
                    >
                      🗑️ Supprimer
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
