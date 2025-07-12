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

  const handleSubmit = async () => {
    if (!formData.client_name || !formData.client_po || !formData.submission_no) {
      alert('Veuillez remplir tous les champs obligatoires');
      return;
    }

    setLoading(true);
    let pdfUrl = null;
    let pdfFileName = null;

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

  const handleDelete = async (id) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce bon d\'achat?')) return;

    const { error } = await supabase
      .from('purchase_orders')
      .delete()
      .eq('id', id);

    if (error) {
      alert('Erreur: ' + error.message)
