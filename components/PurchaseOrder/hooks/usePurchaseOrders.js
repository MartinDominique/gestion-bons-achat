// ========================================
// FICHIER 1: hooks/usePurchaseOrders.js
// (Nouveau - Logique CRUD des BAs)
// ========================================
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

const usePurchaseOrders = () => {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [filteredPOs, setFilteredPOs] = useState([]);
  const [clients, setClients] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Charger tous les bons d'achat
  const fetchPurchaseOrders = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');
      
      const { data, error: fetchError } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          submissions!inner(
            client_name,
            client_email,
            client_phone,
            client_address
          )
        `)
        .order('created_at', { ascending: false });

      if (fetchError) {
        throw new Error(`Erreur chargement BAs: ${fetchError.message}`);
      }

      setPurchaseOrders(data || []);
      console.log(`✅ ${data?.length || 0} bons d'achat chargés`);
      
    } catch (err) {
      console.error('Erreur fetchPurchaseOrders:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Charger la liste des clients depuis les soumissions
  const fetchClients = useCallback(async () => {
    try {
      const { data, error: clientsError } = await supabase
        .from('submissions')
        .select('client_name, client_email, client_phone, client_address')
        .not('client_name', 'is', null);

      if (clientsError) {
        console.error('Erreur chargement clients:', clientsError);
        return;
      }

      // Supprimer les doublons basés sur client_name
      const uniqueClients = data?.reduce((acc, client) => {
        const existing = acc.find(c => c.client_name === client.client_name);
        if (!existing) {
          acc.push(client);
        }
        return acc;
      }, []) || [];

      setClients(uniqueClients);
      console.log(`✅ ${uniqueClients.length} clients uniques chargés`);
      
    } catch (err) {
      console.error('Erreur fetchClients:', err);
    }
  }, []);

  // Créer un nouveau bon d'achat
  const createPurchaseOrder = useCallback(async (formData) => {
    try {
      setError('');
      
      // Générer le numéro de BA
      const poNumber = await generatePONumber();
      
      // Préparer les données
      const poData = {
        po_number: poNumber,
        submission_no: formData.submission_no || null,
        client_name: formData.client_name,
        client_email: formData.client_email || null,
        client_phone: formData.client_phone || null,
        client_address: formData.client_address || null,
        po_date: formData.po_date,
        delivery_date: formData.delivery_date || null,
        payment_terms: formData.payment_terms || null,
        special_instructions: formData.special_instructions || null,
        status: 'draft',
        total_amount: 0
      };

      // Créer le BA
      const { data: newPO, error: createError } = await supabase
        .from('purchase_orders')
        .insert(poData)
        .select()
        .single();

      if (createError) {
        throw new Error(`Erreur création BA: ${createError.message}`);
      }

      // Si articles fournis, les ajouter
      if (formData.items && formData.items.length > 0) {
        await addItemsToPO(newPO.id, formData.items);
      }

      // Rafraîchir la liste
      await fetchPurchaseOrders();
      
      console.log(`✅ BA ${poNumber} créé avec succès`);
      return newPO;
      
    } catch (err) {
      console.error('Erreur createPurchaseOrder:', err);
      setError(err.message);
      throw err;
    }
  }, [fetchPurchaseOrders]);

  // Ajouter des articles à un BA
  const addItemsToPO = useCallback(async (purchaseOrderId, items) => {
    try {
      const itemsData = items.map(item => ({
        purchase_order_id: purchaseOrderId,
        product_id: item.product_id || item.code,
        description: item.description || item.name,
        quantity: parseFloat(item.quantity) || 0,
        unit: item.unit || 'unité',
        cost_price: parseFloat(item.cost_price) || 0,
        selling_price: parseFloat(item.price) || parseFloat(item.selling_price) || 0,
        delivered_quantity: 0
      }));

      const { error: itemsError } = await supabase
        .from('client_po_items')
        .insert(itemsData);

      if (itemsError) {
        throw new Error(`Erreur ajout articles: ${itemsError.message}`);
      }

      // Calculer et mettre à jour le total
      const totalAmount = itemsData.reduce((sum, item) => 
        sum + (item.quantity * item.selling_price), 0
      );

      await supabase
        .from('purchase_orders')
        .update({ total_amount: totalAmount })
        .eq('id', purchaseOrderId);

      console.log(`✅ ${items.length} articles ajoutés au BA`);
      
    } catch (err) {
      console.error('Erreur addItemsToPO:', err);
      throw err;
    }
  }, []);

  // Générer un numéro de BA automatique
  const generatePONumber = useCallback(async () => {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const prefix = `BA-${year}${month}`;
    
    const { data } = await supabase
      .from('purchase_orders')
      .select('po_number')
      .like('po_number', `${prefix}%`)
      .order('po_number', { ascending: false })
      .limit(1);
    
    if (!data || data.length === 0) {
      return `${prefix}-001`;
    }
    
    const lastNum = parseInt(data[0].po_number.split('-')[2]) || 0;
    return `${prefix}-${String(lastNum + 1).padStart(3, '0')}`;
  }, []);

  // Filtrer les BAs selon les critères de recherche
  useEffect(() => {
    let filtered = purchaseOrders;

    // Filtre par terme de recherche
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(po => 
        po.po_number?.toLowerCase().includes(term) ||
        po.client_name?.toLowerCase().includes(term) ||
        po.submission_no?.toLowerCase().includes(term)
      );
    }

    // Filtre par statut
    if (statusFilter !== 'all') {
      filtered = filtered.filter(po => po.status === statusFilter);
    }

    setFilteredPOs(filtered);
  }, [purchaseOrders, searchTerm, statusFilter]);

  // Charger les données au montage du hook
  useEffect(() => {
    fetchPurchaseOrders();
    fetchClients();
  }, [fetchPurchaseOrders, fetchClients]);

  return {
    // État
    purchaseOrders: filteredPOs,
    clients,
    isLoading,
    error,
    searchTerm,
    statusFilter,
    
    // Actions
    setSearchTerm,
    setStatusFilter,
    fetchPurchaseOrders,
    createPurchaseOrder,
    addItemsToPO,
    
    // Utilitaires
    generatePONumber
  };
};

export default usePurchaseOrders;
