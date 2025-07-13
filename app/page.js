// Nouveau fichier complet refait avec logique corrigée pour l'ajout de fichiers
'use client';
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, LogOut, FileText, Clock, CheckCircle, XCircle, Trash2, Eye, Download } from 'lucide-react';

export default function PurchaseOrderManager() {
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [formData, setFormData] = useState({
    client_name: '',
    client_po: '',
    submission_no: '',
    date: new Date().toISOString().split('T')[0],
    amount: '',
    status: 'en_attente',
    notes: '',
    pdf_files: []
  });
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [orderFiles, setOrderFiles] = useState({});

  useEffect(() => {
    checkUser();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (session?.user) fetchOrders();
    });
    return () => listener?.subscription.unsubscribe();
  }, []);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    if (user) fetchOrders();
  };

  const fetchOrders = async () => {
    const { data, error } = await supabase.from('purchase_orders').select('*').order('date', { ascending: false });
    if (!error) setOrders(data);
  };

  const uploadFiles = async (purchaseOrderId) => {
    if (!formData.pdf_files || formData.pdf_files.length === 0) return;

    const uploads = formData.pdf_files.map(async (file) => {
      const fileName = `${purchaseOrderId}_${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from('purchase-orders-pdfs').upload(fileName, file);
      if (uploadError) return console.error(uploadError);
      const { data: { publicUrl } } = supabase.storage.from('purchase-orders-pdfs').getPublicUrl(fileName);
      const { error: dbError } = await supabase.from('purchase_order_files').insert({
        purchase_order_id: purchaseOrderId,
        file_name: file.name,
        file_url: publicUrl,
        file_type: file.type,
        file_size: file.size,
        uploaded_by: user.id
      });
      if (dbError) console.error(dbError);
    });

    await Promise.all(uploads);
  };

  const handleSubmit = async () => {
    if (!formData.client_name || !formData.client_po || !formData.submission_no) {
      alert('Champs obligatoires manquants');
      return;
    }

    setLoading(true);
    const { data: newOrder, error } = await supabase.from('purchase_orders')
      .insert([{ ...formData, created_by: user.id }])
      .select()
      .single();

    if (error) {
      alert('Erreur: ' + error.message);
    } else {
      await uploadFiles(newOrder.id);
      fetchOrders();
      resetForm();
      setShowForm(false);
    }
    setLoading(false);
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
      pdf_files: []
    });
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    const validFiles = files.filter(file =>
      ['application/pdf', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(file.type)
    );
    if (validFiles.length !== files.length) {
      alert('Seuls les fichiers PDF et Excel sont autorisés.');
    }
    setFormData({ ...formData, pdf_files: validFiles });
  };

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce bon d\'achat?')) return;
    await supabase.from('purchase_orders').delete().eq('id', id);
    fetchOrders();
  };

  if (!user) return <div>Connexion requise</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between mb-4">
        <h1 className="text-2xl font-bold">Bons d'achat</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded">Nouveau</button>
          <button onClick={() => supabase.auth.signOut()} className="bg-gray-600 text-white px-4 py-2 rounded">Déconnexion</button>
        </div>
      </div>
      <table className="w-full table-auto border">
        <thead><tr><th>Date</th><th>Client</th><th>PO</th><th>Soumission</th><th>Montant</th><th>Actions</th></tr></thead>
        <tbody>
          {orders.map(order => (
            <tr key={order.id} className="border-t">
              <td>{order.date}</td>
              <td>{order.client_name}</td>
              <td>{order.client_po}</td>
              <td>{order.submission_no}</td>
              <td>{parseFloat(order.amount).toFixed(2)}</td>
              <td>
                <button onClick={() => handleDelete(order.id)} className="text-red-600"><Trash2 className="w-4 h-4" /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-xl">
            <h2 className="text-xl font-bold mb-4">Nouveau Bon</h2>
            <div className="grid gap-4">
              <input placeholder="Nom client" value={formData.client_name} onChange={(e) => setFormData({ ...formData, client_name: e.target.value })} className="border p-2 rounded" />
              <input placeholder="PO client" value={formData.client_po} onChange={(e) => setFormData({ ...formData, client_po: e.target.value })} className="border p-2 rounded" />
              <input placeholder="Soumission" value={formData.submission_no} onChange={(e) => setFormData({ ...formData, submission_no: e.target.value })} className="border p-2 rounded" />
              <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="border p-2 rounded" />
              <input type="number" placeholder="Montant" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} className="border p-2 rounded" />
              <textarea placeholder="Notes" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="border p-2 rounded" rows={3}></textarea>
              <input type="file" accept=".pdf,.xls,.xlsx" multiple onChange={handleFileChange} className="border p-2 rounded" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-300 rounded">Annuler</button>
                <button onClick={handleSubmit} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded">
                  {loading ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
