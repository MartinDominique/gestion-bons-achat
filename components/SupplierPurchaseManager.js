import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  MoreVertical, Eye, Edit, Trash2, FileText, Download, Search, 
  Plus, Upload, X, ChevronDown, ShoppingCart, Building2, Truck,
  MapPin, Calendar, Package, DollarSign, Printer, Wrench
} from 'lucide-react';

export default function SupplierPurchaseManager() {
  // États principaux
  const [supplierPurchases, setSupplierPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [shippingAddresses, setShippingAddresses] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // États UI
  const [showForm, setShowForm] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [showAddressFormModal, setShowAddressFormModal] = useState(false);
  const [showSupplierFormModal, setShowSupplierFormModal] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [editingAddress, setEditingAddress] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedPurchaseId, setSelectedPurchaseId] = useState(null);
  
  // Recherche produits
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [focusedProductIndex, setFocusedProductIndex] = useState(-1);
  const [showQuantityInput, setShowQuantityInput] = useState(false);
  const [selectedProductForQuantity, setSelectedProductForQuantity] = useState(null);
  const [tempQuantity, setTempQuantity] = useState('1');
  
  // État pour la correction
  const [isFixingPOs, setIsFixingPOs] = useState(false);
  
  // État pour sauvegarder le contexte du formulaire
  const [formContext, setFormContext] = useState(null);

  // Fonctions pour gérer le contexte du formulaire
  const openSupplierManagementFromForm = () => {
    setFormContext({ purchaseForm, selectedItems, editingPurchase });
    setShowForm(false);
    setShowSupplierModal(true);
  };

  const openNewSupplierFromForm = () => {
    setFormContext({ purchaseForm, selectedItems, editingPurchase });
    setShowForm(false);
    setEditingSupplier(null);
    setSupplierForm({
      company_name: '', contact_name: '', email: '', phone: '',
      address: '', city: '', province: 'QC', postal_code: '',
      country: 'Canada', notes: ''
    });
    setShowSupplierFormModal(true);
  };

  const returnToForm = () => {
    if (formContext) {
      setPurchaseForm(formContext.purchaseForm);
      setSelectedItems(formContext.selectedItems);
      setEditingPurchase(formContext.editingPurchase);
      setFormContext(null);
    }
    setShowSupplierModal(false);
    setShowSupplierFormModal(false);
    setShowForm(true);
  };
  
  // Formulaires
  const [purchaseForm, setPurchaseForm] = useState({
    supplier_id: '', supplier_name: '', linked_po_id: '', linked_po_number: '',
    shipping_address_id: '', shipping_company: '', shipping_account: '',
    delivery_date: '', items: [], subtotal: 0, taxes: 0, shipping_cost: 0,
    total_amount: 0, status: 'draft', notes: '', purchase_number: ''
  });

  const [supplierForm, setSupplierForm] = useState({
    company_name: '', contact_name: '', email: '', phone: '',
    address: '', city: '', province: 'QC', postal_code: '',
    country: 'Canada', notes: ''
  });

  const [addressForm, setAddressForm] = useState({
    name: '', address: '', city: '', province: 'QC',
    postal_code: '', country: 'Canada', is_default: false
  });

  // Effet de chargement initial
  useEffect(() => {
    const initializeData = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session) {
          setLoading(false);
          return;
        }
        
        await Promise.all([
          fetchSupplierPurchases(),
          fetchSuppliers(), 
          fetchPurchaseOrders(),
          fetchShippingAddresses()
        ]);
      } catch (error) {
        console.error('Erreur initialisation:', error);
        setLoading(false);
      }
    };
    initializeData();
  }, []);

  // Calcul automatique des totaux
  useEffect(() => {
    const subtotal = selectedItems.reduce((sum, item) => sum + (item.cost_price * item.quantity), 0);
    const taxes = subtotal * 0.14975;
    const total = subtotal + taxes + parseFloat(purchaseForm.shipping_cost || 0);
    
    setPurchaseForm(prev => ({ ...prev, subtotal, taxes, total_amount: total }));
  }, [selectedItems, purchaseForm.shipping_cost]);

  // Fonctions de récupération des données
  const fetchSupplierPurchases = async () => {
    try {
      const { data, error } = await supabase
        .from('supplier_purchases')
        .select('*, purchase_orders!linked_po_id(po_number, client_name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSupplierPurchases(data || []);
    } catch (error) {
      console.error('Erreur chargement achats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('company_name', { ascending: true });
      if (error) throw error;
      setSuppliers(data || []);
    } catch (error) {
      console.error('Erreur chargement fournisseurs:', error);
    }
  };

  const fetchPurchaseOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('id, po_number, client_name, amount, status')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPurchaseOrders(data || []);
    } catch (error) {
      console.error('Erreur chargement bons achat:', error);
    }
  };

  const fetchShippingAddresses = async () => {
    try {
      const { data, error } = await supabase
        .from('shipping_addresses')
        .select('*')
        .order('is_default', { ascending: false });
      if (error) throw error;
      setShippingAddresses(data || []);
    } catch (error) {
      console.error('Erreur chargement adresses:', error);
    }
  };

  // Gestion des fournisseurs
  const handleSupplierSubmit = async (e) => {
    e.preventDefault();
    try {
      let savedSupplierId = null;
      
      if (editingSupplier) {
        const { error } = await supabase
          .from('suppliers')
          .update(supplierForm)
          .eq('id', editingSupplier.id);
        if (error) throw error;
        savedSupplierId = editingSupplier.id;
      } else {
        const { data, error } = await supabase
          .from('suppliers')
          .insert([supplierForm])
          .select()
          .single();
        if (error) throw error;
        savedSupplierId = data.id;
      }

      await fetchSuppliers();
      
      if (formContext && savedSupplierId) {
        const supplier = { id: savedSupplierId, company_name: supplierForm.company_name };
        setFormContext({
          ...formContext,
          purchaseForm: {
            ...formContext.purchaseForm,
            supplier_id: savedSupplierId,
            supplier_name: supplier.company_name
          }
        });
      }
      
      setShowSupplierFormModal(false);
      setEditingSupplier(null);
      setSupplierForm({
        company_name: '', contact_name: '', email: '', phone: '',
        address: '', city: '', province: 'QC', postal_code: '',
        country: 'Canada', notes: ''
      });
      
      if (formContext) {
        setTimeout(() => returnToForm(), 100);
      }
      
    } catch (error) {
      console.error('Erreur sauvegarde fournisseur:', error);
      alert('Erreur lors de la sauvegarde du fournisseur');
    }
  };

  // Utilitaires
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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
        <p className="ml-4 text-orange-600 font-medium">Chargement...</p>
      </div>
    );
  }

  // Composant principal
  return (
    <div className="space-y-6 p-4">
      <div className="bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 rounded-xl shadow-lg p-6 text-white">
        <h2 className="text-3xl font-bold">🛒 Gestion des Achats Fournisseurs</h2>
        <p className="text-white/90 mt-1">Gérez vos commandes fournisseurs</p>
        
        <div className="flex gap-3 mt-4">
          <button
            onClick={() => setShowSupplierModal(true)}
            className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-sm font-medium hover:bg-white/20"
          >
            <Building2 className="w-4 h-4 inline mr-2" />
            Gestion Fournisseurs
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-white text-orange-600 rounded-lg hover:bg-gray-100 font-medium text-sm"
          >
            ➕ Nouvel Achat
          </button>
        </div>
      </div>

      {/* Liste des achats */}
      <div className="bg-white shadow-lg rounded-lg p-6">
        <p className="text-gray-500">Liste des achats à implémenter...</p>
      </div>

      {/* Modal Gestion Fournisseurs */}
      {showSupplierModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-6 border-b bg-orange-50">
              <h2 className="text-2xl font-bold text-orange-600">🏢 Gestion des Fournisseurs</h2>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowSupplierFormModal(true)}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
                >
                  ➕ Nouveau Fournisseur
                </button>
                {formContext && (
                  <button
                    onClick={returnToForm}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    🔄 Retour au formulaire
                  </button>
                )}
                <button
                  onClick={() => {
                    if (formContext) {
                      returnToForm();
                    } else {
                      setShowSupplierModal(false);
                    }
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  ❌ Fermer
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <p className="text-gray-500">Liste des fournisseurs...</p>
            </div>
          </div>
        </div>
      )}

      {/* Modal Formulaire Fournisseur Direct */}
      {showSupplierFormModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
          <div className="bg-white rounded-lg w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-blue-600 mb-4">
              {editingSupplier ? '✏️ Modifier Fournisseur' : '➕ Nouveau Fournisseur'}
            </h3>
            
            <form onSubmit={handleSupplierSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nom de l'entreprise *
                  </label>
                  <input
                    type="text"
                    value={supplierForm.company_name}
                    onChange={(e) => setSupplierForm({...supplierForm, company_name: e.target.value})}
                    className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    value={supplierForm.email}
                    onChange={(e) => setSupplierForm({...supplierForm, email: e.target.value})}
                    className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Téléphone</label>
                  <input
                    type="tel"
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm({...supplierForm, phone: e.target.value})}
                    className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                  />
                </div>
              </div>
              
              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => {
                    if (formContext) {
                      returnToForm();
                    } else {
                      setShowSupplierFormModal(false);
                    }
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  {formContext ? '🔄 Retour au formulaire' : 'Annuler'}
                </button>
                
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingSupplier ? '💾 Mettre à jour' : '✨ Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
