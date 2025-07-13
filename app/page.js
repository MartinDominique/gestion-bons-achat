'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Trash2 } from 'lucide-react';

export default function Page() {
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
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user) fetchOrders();
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (session?.user) fetchOrders();
    });

    return () => listener?.subscription.unsubscribe();
  }, []);

  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*')
      .order('date', { ascending: false });
    if (!error) setOrders(data);
  };

  const handleSubmit = async () => {
    if (!formData.client_name || !formData.client_po || !formData.submission_no) {
      alert('Champs obligatoires manquants');
      return;
    }

    setLoading(true);

    const { data: newOrder, error } = await supabase
      .from('purchase_orders')
      .insert([{ ...formData, created_by: user.id }])
      .select()
      .single();

    if (error) {
      alert('Erreur: ' + error.message);
      setLoading(false);
      return;
    }

    await uploadFiles(newOrder.id);
    fetchOrders();
    resetForm();
    setShowForm(false);
    setLoading(false);
  };

  const uploadFiles = async (orderId) => {
    if (!formData.pdf_files || formData.pdf_files.length === 0) return;

    for (const file of formData.pdf_files) {
      const fileName = `${orderId}_${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('purchase-orders-pdfs')
        .upload(fileName, file);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        continue;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('purchase-orders-pdfs')
        .getPublicUrl(fileName);

      await supabase.from('purchase_order_files').insert({
        purchase_order_id: orderId,
        file_name: file.name,
        file_url: publicUrl,
        file_type: file.type,
        file_size: file.size,
        uploaded_by: user.id
      });
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
      pdf_files: []
    });
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    const valid = files.filter(file =>
      ['application/pdf', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(file.type)
    );
    setFormData({ ...formData, pdf_files: valid });
  };

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce bon d\'achat?')) return;
    await supabase.from('purchase_orders').delete().eq('id', id);
    fetchOrders();
  };

  if (!user) return <div className="p-10">Connexion requise</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Bons d'achat</h1>
        <button onClick={() => setShowForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded">Nouveau</button>
      </div>

      <table className="w-full table-auto border">
        <thead>
          <tr className="bg-gray-100">
            <th className="px-4 py-2">Date</th>
            <th className="px-4 py-2">Client</th>
            <th className="px-4 py-2">PO</th>
            <th className="px-4 py-2">Soumission</th>
            <th className="px-4 py-2">Montant</th>
            <th className="px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map(order => (
            <tr key={order.id} className="border-t">
              <td className="px-4 py-2">{order.date}</td>
              <td className="px-4 py-2">{order.client_name}</td>
              <td className="px-4 py-2">{order.client_po}</td>
              <td className="px-4 py-2">{order.submission_no}</td>
              <td className="px-4 py-2">{parseFloat(order.amount).toFixed(2)}</td>
              <td className="px-4 py-2">
                <button onClick={() => handleDelete(order.id)} className="text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
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
                <button onClick={() => { setShowForm(false); resetForm(); }} className="px-4 py-2 bg-gray-300 rounded">Annuler</button>
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
