
// ========================================
// FICHIER 1: hooks/usePurchaseOrders.js
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

  return {
    purchaseOrders: filteredPOs,
    clients,
    isLoading,
    error,
    searchTerm,
    statusFilter,
    setSearchTerm,
    setStatusFilter,
    fetchPurchaseOrders,
    createPurchaseOrder,
    generatePONumber
  };
};

export default usePurchaseOrders;
