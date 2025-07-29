import { useState, useEffect } from 'react';
import { MoreVertical, Eye, Edit, Trash2, FileText, Download, Search, Plus, Upload, X, ChevronDown } from 'lucide-react';

export default function SoumissionsManager() {
  const [soumissions, setSoumissions] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSubmission, setEditingSubmission] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sendingReport, setSendingReport] = useState(false);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(null);
  
  // Recherche produits
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [products, setProducts] = useState([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [focusedProductIndex, setFocusedProductIndex] = useState(-1);
  const [tempQuantity, setTempQuantity] = useState('1');
  const [showQuantityInput, setShowQuantityInput] = useState(false);
  const [selectedProductForQuantity, setSelectedProductForQuantity] = useState(null);
  const [showQuickAddProduct, setShowQuickAddProduct] = useState(false);

  // Form states
  const [submissionForm, setSubmissionForm] = useState({
    client_name: '',
    description: '',
    amount: 0,
    status: 'draft',
    items: [],
    submission_number: ''
  });

  const [quickProductForm, setQuickProductForm] = useState({
    product_id: '',
    description: '',
    selling_price: '',
    cost_price: '',
    unit: 'pcs',
    product_group: 'Divers'
  });

  const [calculatedCostTotal, setCalculatedCostTotal] = useState(0);
  
  // Debounce pour la recherche produits
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (productSearchTerm.length >= 2) {
        setSearchingProducts(true);
        searchProducts(productSearchTerm).finally(() => {
          setSearchingProducts(false);
        });
      } else {
        setProducts([]);
      }
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [productSearchTerm]);
  
  // Calcul automatique des totaux
  useEffect(() => {
    const totalSelling = selectedItems.reduce((sum, item) => {
      return sum + (item.selling_price * item.quantity);
    }, 0);
    
    const totalCost = selectedItems.reduce((sum, item) => {
      return sum + (item.cost_price * item.quantity);
    }, 0);
    
    setSubmissionForm(prev => ({ 
      ...prev, 
      amount: totalSelling
    }));
    
    setCalculatedCostTotal(totalCost);
  }, [selectedItems]);

  useEffect(() => {
    // Simuler le chargement des données - REMPLACEZ par vos appels API
    setTimeout(() => {
      setSoumissions([
        {
          id: 1,
          client_name: 'Entreprise ABC',
          description: 'Installation système électrique',
          amount: 15000,
          status: 'sent',
          submission_number: '2507-001',
          created_at: '2025-07-15',
          items: [
            { product_id: 'ELEC-001', description: 'Panneau électrique 200A', quantity: 2, selling_price: 450, cost_price: 320, unit: 'pcs', product_group: 'Électrique', comment: 'Installation selon code électrique' },
            { product_id: 'CABLE-100', description: 'Câble 12 AWG', quantity: 150, selling_price: 2.5, cost_price: 1.8, unit: 'm', product_group: 'Câblage', comment: 'Longueur approximative, ajustement sur site' }
          ]
        },
        {
          id: 2,
          client_name: 'Construction XYZ',
          description: 'Éclairage commercial',
          amount: 8500,
          status: 'draft',
          submission_number: '2507-002',
          created_at: '2025-07-20',
          items: [
            { product_id: 'LED-050', description: 'Luminaire LED 50W', quantity: 20, selling_price: 85, cost_price: 55, unit: 'pcs', product_group: 'Éclairage', comment: 'Blanc chaud 3000K requis' }
          ]
        }
      ]);
      
      setClients([
        { id: 1, name: 'Entreprise ABC', email: 'contact@abc.com', phone: '514-555-0123' },
        { id: 2, name: 'Construction XYZ', email: 'info@xyz.ca', phone: '450-555-0456' }
      ]);
      
      setLoading(false);
    }, 1000);
  }, []);

  const generateSubmissionNumber = async () => {
    const now = new Date();
    const yearMonth = `${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    
    try {
      // REMPLACEZ par votre logique de génération de numéro avec base de données
      const lastNumber = Math.max(...soumissions.map(s => {
        const match = s.submission_number?.match(/-(\d{3})$/);
        return match ? parseInt(match[1]) : 0;
      }), 0);
      
      const nextSequence = (lastNumber + 1).toString().padStart(3, '0');
      return `${yearMonth}-${nextSequence}`;
    } catch (error) {
      console.error('Erreur génération numéro:', error);
      return `${yearMonth}-001`;
    }
  };

  const searchProducts = async (searchTerm) => {
    if (!searchTerm || searchTerm.length < 2) {
      setProducts([]);
      return;
    }

    try {
      // REMPLACEZ par votre appel API de recherche de produits
      const mockProducts = [
        { product_id: 'ELEC-001', description: 'Panneau électrique 200A', selling_price: 450, cost_price: 320, unit: 'pcs', product_group: 'Électrique', stock_qty: 12 },
        { product_id: 'CABLE-100', description: 'Câble 12 AWG', selling_price: 2.5, cost_price: 1.8, unit: 'm', product_group: 'Câblage', stock_qty: 500 },
        { product_id: 'LED-050', description: 'Luminaire LED 50W', selling_price: 85, cost_price: 55, unit: 'pcs', product_group: 'Éclairage', stock_qty: 25 },
        { product_id: 'SWITCH-001', description: 'Interrupteur simple', selling_price: 15, cost_price: 8, unit: 'pcs', product_group: 'Accessoires', stock_qty: 100 }
      ].filter(p => 
        p.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.product_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.product_group.toLowerCase().includes(searchTerm.toLowerCase())
      );

      setProducts(mockProducts);
    } catch (error) {
      console.error('Erreur lors de la recherche dynamique:', error);
      setProducts([]);
    }
  };

  const handleDeleteSubmission = async (id) => {
    if (!confirm('🗑️ Êtes-vous sûr de vouloir supprimer cette soumission ?')) return;
    
    try {
      // REMPLACEZ par votre appel API de suppression
      setSoumissions(prev => prev.filter(s => s.id !== id));
    } catch (error) {
      console.error('Erreur suppression soumission:', error);
    }
  };

  const handleSendReport = async () => {
    setSendingReport(true);
    try {
      // REMPLACEZ par votre appel API d'envoi de rapport
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('📧 Rapport envoyé avec succès !');
    } catch (error) {
      console.error('Erreur lors de l\'envoi:', error);
    } finally {
      setSendingReport(false);
    }
  };

  const handleProductKeyDown = (e) => {
    const availableProducts = products;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedProductIndex(prev => {
        const newIndex = prev < availableProducts.length - 1 ? prev + 1 : prev;
        setTimeout(() => {
          const element = document.querySelector(`[data-product-index="${newIndex}"]`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }, 0);
        return newIndex;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedProductIndex(prev => {
        const newIndex = prev > 0 ? prev - 1 : prev;
        setTimeout(() => {
          const element = document.querySelector(`[data-product-index="${newIndex}"]`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }, 0);
        return newIndex;
      });
    } else if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      if (focusedProductIndex >= 0 && availableProducts[focusedProductIndex]) {
        selectProductForQuantity(availableProducts[focusedProductIndex]);
      }
    } else if (e.key === 'Escape') {
      setFocusedProductIndex(-1);
    }
  };

  const selectProductForQuantity = (product) => {
    setSelectedProductForQuantity(product);
    setShowQuantityInput(true);
    setTempQuantity('1');
    setTimeout(() => {
      document.getElementById('quantity-input')?.focus();
    }, 100);
  };

  const handleQuantityKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedProductForQuantity && tempQuantity && parseInt(tempQuantity) > 0) {
        addItemToSubmission(selectedProductForQuantity, parseInt(tempQuantity));
        setShowQuantityInput(false);
        setSelectedProductForQuantity(null);
        setTempQuantity('1');
        setProductSearchTerm('');
        setFocusedProductIndex(-1);
        setTimeout(() => {
          document.getElementById('product-search')?.focus();
        }, 100);
      }
    } else if (e.key === 'Escape') {
      setShowQuantityInput(false);
      setSelectedProductForQuantity(null);
      setTempQuantity('1');
    }
  };

  const addItemToSubmission = (product, quantity = 1) => {
    const intQuantity = parseInt(quantity);
    const existingItem = selectedItems.find(item => item.product_id === product.product_id);
    
    if (existingItem) {
      setSelectedItems(selectedItems.map(item => 
        item.product_id === product.product_id 
          ? { ...item, quantity: item.quantity + intQuantity }
          : item
      ));
    } else {
      setSelectedItems([...selectedItems, {
        ...product,
        quantity: intQuantity,
        comment: ''
      }]);
    }
  };

  const updateItemQuantity = (productId, quantity) => {
    const intQuantity = parseInt(quantity);
    if (intQuantity <= 0 || isNaN(intQuantity)) {
      setSelectedItems(selectedItems.filter(item => item.product_id !== productId));
    } else {
      setSelectedItems(selectedItems.map(item =>
        item.product_id === productId ? { ...item, quantity: intQuantity } : item
      ));
    }
  };

  const updateItemPrice = (productId, field, price) => {
    setSelectedItems(selectedItems.map(item =>
      item.product_id === productId ? { ...item, [field]: parseFloat(price) || 0 } : item
    ));
  };

  const updateItemComment = (productId, comment) => {
    setSelectedItems(selectedItems.map(item =>
      item.product_id === productId ? { ...item, comment: comment } : item
    ));
  };

  const removeItemFromSubmission = (productId) => {
    setSelectedItems(selectedItems.filter(item => item.product_id !== productId));
  };

  const handleSubmissionSubmit = async () => {
    try {
      let submissionNumber = submissionForm.submission_number;
      
      if (!editingSubmission) {
        submissionNumber = await generateSubmissionNumber();
      }

      const submissionData = {
        ...submissionForm,
        submission_number: submissionNumber,
        items: selectedItems,
        id: editingSubmission?.id || Date.now()
      };

      if (editingSubmission) {
        // REMPLACEZ par votre appel API de mise à jour
        setSoumissions(prev => prev.map(s => s.id === editingSubmission.id ? submissionData : s));
      } else {
        // REMPLACEZ par votre appel API de création
        setSoumissions(prev => [submissionData, ...prev]);
      }

      setShowForm(false);
      setEditingSubmission(null);
      setSelectedItems([]);
      setSubmissionForm({
        client_name: '',
        description: '',
        amount: 0,
        status: 'draft',
        items: [],
        submission_number: ''
      });
      setCalculatedCostTotal(0);
    } catch (error) {
      console.error('Erreur sauvegarde:', error.message);
    }
  };

  // 🖨️ FONCTION D'IMPRESSION AMÉLIORÉE
  const handlePrint = () => {
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Soumission ${submissionForm.submission_number}</title>
          <style>
            @page {
              margin: 20mm;
              size: A4;
            }
            
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            
            body {
              font-family: 'Arial', sans-serif;
              font-size: 12px;
              line-height: 1.4;
              color: #333;
              background: white;
            }
            
            .header {
              text-align: center;
              margin-bottom: 30px;
              padding-bottom: 20px;
              border-bottom: 2px solid #333;
            }
            
            .company-name {
              font-size: 24px;
              font-weight: bold;
              color: #6366f1;
              margin-bottom: 5px;
            }
            
            .document-title {
              font-size: 18px;
              font-weight: bold;
              margin-bottom: 10px;
            }
            
            .info-section {
              display: flex;
              justify-content: space-between;
              margin-bottom: 30px;
            }
            
            .info-block {
              flex: 1;
              margin-right: 20px;
            }
            
            .info-block:last-child {
              margin-right: 0;
            }
            
            .info-title {
              font-weight: bold;
              color: #4338ca;
              margin-bottom: 5px;
              font-size: 14px;
            }
            
            .items-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 30px;
              page-break-inside: auto;
            }
            
            .items-table th {
              background-color: #f8fafc;
              border: 1px solid #cbd5e1;
              padding: 8px;
              text-align: left;
              font-weight: bold;
              color: #1e293b;
              font-size: 11px;
            }
            
            .items-table td {
              border: 1px solid #cbd5e1;
              padding: 8px;
              font-size: 11px;
              page-break-inside: avoid;
            }
            
            .items-table tr {
              page-break-inside: avoid;
              page-break-after: auto;
            }
            
            .items-table tr:nth-child(even) {
              background-color: #f8fafc;
            }
            
            .comment-cell {
              font-style: italic;
              color: #555;
              max-width: 200px;
              word-wrap: break-word;
            }
            
            .text-right {
              text-align: right;
            }
            
            .text-center {
              text-align: center;
            }
            
            .totals-section {
              margin-top: 20px;
              float: right;
              width: 300px;
            }
            
            .total-row {
              display: flex;
              justify-content: space-between;
              padding: 8px 0;
              border-bottom: 1px solid #e2e8f0;
            }
            
            .total-row.final {
              border-bottom: 2px solid #333;
              font-weight: bold;
              font-size: 14px;
              background-color: #f1f5f9;
              padding: 12px 10px;
              margin-top: 10px;
            }
            
            .footer {
              margin-top: 50px;
              text-align: center;
              font-size: 10px;
              color: #64748b;
              clear: both;
            }
            
            .status-badge {
              display: inline-block;
              padding: 4px 8px;
              border-radius: 4px;
              font-size: 10px;
              font-weight: bold;
            }
            
            .status-draft {
              background-color: #f3f4f6;
              color: #374151;
            }
            
            .status-sent {
              background-color: #dbeafe;
              color: #1e40af;
            }
            
            .status-accepted {
              background-color: #d1fae5;
              color: #065f46;
            }
            
            .margin-info {
              background-color: #fef3c7;
              padding: 10px;
              border-radius: 4px;
              margin-top: 10px;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company-name">VOTRE ENTREPRISE</div>
            <div class="document-title">SOUMISSION</div>
            <div>Date: ${new Date().toLocaleDateString('fr-CA')}</div>
          </div>
          
          <div class="info-section">
            <div class="info-block">
              <div class="info-title">NUMÉRO DE SOUMISSION</div>
              <div>${submissionForm.submission_number || 'N/A'}</div>
            </div>
            
            <div class="info-block">
              <div class="info-title">CLIENT</div>
              <div>${submissionForm.client_name}</div>
            </div>
            
            <div class="info-block">
              <div class="info-title">STATUT</div>
              <span class="status-badge status-${submissionForm.status}">
                ${submissionForm.status === 'draft' ? 'Brouillon' : 
                  submissionForm.status === 'sent' ? 'Envoyée' : 'Acceptée'}
              </span>
            </div>
          </div>
          
          <div class="info-section">
            <div class="info-block">
              <div class="info-title">DESCRIPTION</div>
              <div>${submissionForm.description}</div>
            </div>
          </div>
          
          ${selectedItems.length > 0 ? `
          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 12%">Code</th>
                <th style="width: 28%">Description</th>
                <th style="width: 6%">Qté</th>
                <th style="width: 6%">Unité</th>
                <th style="width: 10%">Prix Unit.</th>
                <th style="width: 10%">Total</th>
                <th style="width: 28%">Commentaire</th>
              </tr>
            </thead>
            <tbody>
              ${selectedItems.map(item => `
                <tr>
                  <td style="font-family: monospace; font-size: 10px;">${item.product_id}</td>
                  <td>${item.description}</td>
                  <td class="text-center">${item.quantity}</td>
                  <td class="text-center">${item.unit}</td>
                  <td class="text-right">${new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(item.selling_price)}</td>
                  <td class="text-right"><strong>${new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(item.selling_price * item.quantity)}</strong></td>
                  <td class="comment-cell">${item.comment && item.comment.trim() ? item.comment : ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          ` : ''}
          
          <div class="totals-section">
            <div class="total-row">
              <span>Sous-total:</span>
              <span>${new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(submissionForm.amount)}</span>
            </div>
            <div class="total-row">
              <span>Total coût:</span>
              <span>${new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(calculatedCostTotal)}</span>
            </div>
            <div class="total-row">
              <span>Marge brute:</span>
              <span>${new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(submissionForm.amount - calculatedCostTotal)}</span>
            </div>
            <div class="total-row final">
              <span>TOTAL:</span>
              <span>${new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(submissionForm.amount)}</span>
            </div>
            
            ${submissionForm.amount > 0 && calculatedCostTotal > 0 ? `
            <div class="margin-info">
              <strong>Marge: ${((submissionForm.amount - calculatedCostTotal) / submissionForm.amount * 100).toFixed(1)}%</strong>
            </div>
            ` : ''}
          </div>
          
          <div class="footer">
            <p>Cette soumission est valide pour 30 jours à compter de la date d'émission.</p>
            <p>Soumission générée le ${new Date().toLocaleString('fr-CA')} • Total items: ${selectedItems.length}</p>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
    };
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('fr-CA');
  };

  const filteredSoumissions = soumissions.filter(sub => {
    const matchesSearch = sub.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         sub.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        <p className="ml-4 text-purple-600 font-medium">Chargement des soumissions...</p>
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <div className="bg-white rounded-xl shadow-lg border border-purple-200 overflow-hidden">
          
          {/* En-tête du formulaire */}
          <div className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <div className="flex items-center space-x-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold">
                    {editingSubmission ? '✏️ Modifier Soumission' : '📝 Nouvelle Soumission'}
                  </h2>
                  <p className="text-purple-100 text-sm mt-1">
                    {editingSubmission ? 'Modifiez les informations' : 'Créez une nouvelle soumission'}
                  </p>
                </div>
                {submissionForm.submission_number && (
                  <div className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-lg">
                    <span className="text-sm font-medium">N°: {submissionForm.submission_number}</span>
                  </div>
                )}
              </div>
              
              {/* Boutons d'action */}
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <button
                  onClick={handlePrint}
                  className="w-full sm:w-auto px-4 py-2 bg-white/20 rounded-lg hover:bg-white/30 text-sm font-medium"
                >
                  🖨️ Imprimer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingSubmission(null);
                    setSelectedItems([]);
                    setSubmissionForm({
                      client_name: '', 
                      description: '', 
                      amount: 0, 
                      status: 'draft', 
                      items: [],
                      submission_number: ''
                    });
                    setCalculatedCostTotal(0);
                    setProductSearchTerm('');
                    setFocusedProductIndex(-1);
                  }}
                  className="w-full sm:w-auto px-4 py-2 bg-white/10 border border-white/20 rounded-lg hover:bg-white/20 text-sm font-medium"
                >
                  ❌ Annuler
                </button>
                <button
                  type="button"
                  onClick={handleSubmissionSubmit}
                  className="w-full sm:w-auto px-4 py-2 bg-white text-purple-600 rounded-lg hover:bg-gray-50 font-medium text-sm"
                >
                  {editingSubmission ? '💾 Mettre à jour' : '✨ Créer'}
                </button>
              </div>
            </div>
          </div>
          
          {/* Contenu du formulaire */}
          <div className="p-4 sm:p-6">
            <div className="space-y-6">
              
              {/* Client et Description */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <label className="block text-sm font-semibold text-blue-800 mb-2">
                    👤 Client *
                  </label>
                  <select
                    value={submissionForm.client_name}
                    onChange={(e) => setSubmissionForm({...submissionForm, client_name: e.target.value})}
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
                    value={submissionForm.description}
                    onChange={(e) => setSubmissionForm({...submissionForm, description: e.target.value})}
                    className="block w-full rounded-lg border-green-300 shadow-sm focus:border-green-500 focus:ring-green-500 text-base p-3"
                    placeholder="Description de la soumission..."
                    required
                  />
                </div>
              </div>

              {/* Statut pour édition */}
              {editingSubmission && (
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    🏷️ Statut
                  </label>
                  <select
                    value={submissionForm.status}
                    onChange={(e) => setSubmissionForm({...submissionForm, status: e.target.value})}
                    className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base p-3"
                  >
                    <option value="draft">📝 Brouillon</option>
                    <option value="sent">📤 Envoyée</option>
                    <option value="accepted">✅ Acceptée</option>
                  </select>
                </div>
              )}

              {/* Section recherche produits */}
              <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                <h3 className="text-base sm:text-lg font-semibold text-indigo-800 mb-4">
                  🔍 Recherche Produits (6718 au total)
                </h3>
                
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input
                        id="product-search"
                        type="text"
                        placeholder="Rechercher un produit - minimum 2 caractères..."
                        value={productSearchTerm}
                        onChange={(e) => {
                          setProductSearchTerm(e.target.value);
                          setFocusedProductIndex(-1);
                        }}
                        onKeyDown={handleProductKeyDown}
                        className="block w-full pl-10 pr-4 py-3 rounded-lg border-indigo-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base"
                        autoComplete="off"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowQuickAddProduct(true)}
                    className="w-full sm:w-auto px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-medium flex items-center justify-center"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Produit Non-Inventaire
                  </button>
                </div>
                
                {/* Résultats recherche */}
                {searchingProducts && (
                  <div className="flex items-center justify-center p-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mr-2"></div>
                    <span className="text-indigo-600">Recherche en cours...</span>
                  </div>
                )}
                
                {productSearchTerm && productSearchTerm.length < 2 && !searchingProducts && (
                  <div className="p-4 text-center text-gray-500 border border-gray-200 rounded-lg">
                    Tapez au moins 2 caractères pour rechercher dans les 6718 produits
                  </div>
                )}
                
                {productSearchTerm.length >= 2 && !searchingProducts && (
                  <div className="max-h-60 overflow-y-auto border border-indigo-200 rounded-lg">
                    {products.length === 0 ? (
                      <div className="p-4 text-center text-gray-500">
                        Aucun produit trouvé pour "{productSearchTerm}"
                        <br />
                        <span className="text-xs">Essayez avec d'autres mots-clés</span>
                      </div>
                    ) : (
                      <>
                        <div className="p-2 bg-gray-50 text-xs text-gray-600 border-b">
                          {products.length} résultat(s) trouvé(s) {products.length === 50 ? '(50 max affichés)' : ''}
                        </div>
                        {products.map((product, index) => (
                          <div 
                            key={product.product_id} 
                            data-product-index={index}
                            className={`p-3 border-b border-indigo-100 hover:bg-indigo-50 cursor-pointer ${
                              index === focusedProductIndex ? 'bg-indigo-100 border-indigo-300' : ''
                            }`}
                            onClick={() => selectProductForQuantity(product)}
                          >
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                              <div className="flex-1">
                                <h4 className="font-medium text-gray-900 text-sm">
                                  {product.product_id} - {product.description}
                                </h4>
                                <div className="text-xs text-gray-500 space-y-1 sm:space-y-0 sm:space-x-4 sm:flex">
                                  <span>📦 Groupe: {product.product_group}</span>
                                  <span>📏 Unité: {product.unit}</span>
                                  <span>📊 Stock: {product.stock_qty}</span>
                                </div>
                                <div className="flex flex-col sm:flex-row sm:space-x-4 text-xs mt-1">
                                  <span className="text-indigo-600 font-medium">
                                    💰 Vente: {formatCurrency(product.selling_price)}
                                  </span>
                                  <span className="text-orange-600 font-medium">
                                    🏷️ Coût: {formatCurrency(product.cost_price)}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="w-full sm:w-auto px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
                              >
                                ➕ Ajouter
                              </button>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Modal quantité */}
              {showQuantityInput && selectedProductForQuantity && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-lg w-full max-w-md">
                    <div className="p-4 sm:p-6">
                      <h3 className="text-lg font-semibold mb-4">
                        Quantité pour: {selectedProductForQuantity.description}
                      </h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Quantité ({selectedProductForQuantity.unit})
                          </label>
                          <input
                            id="quantity-input"
                            type="number"
                            step="1"
                            min="1"
                            value={tempQuantity}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (value === '' || (parseInt(value) > 0 && Number.isInteger(parseFloat(value)))) {
                                setTempQuantity(value);
                              }
                            }}
                            onKeyDown={handleQuantityKeyDown}
                            className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3"
                            autoFocus
                          />
                        </div>
                        <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                          <p>Prix vente: {formatCurrency(selectedProductForQuantity.selling_price)} / {selectedProductForQuantity.unit}</p>
                          <p>Prix coût: {formatCurrency(selectedProductForQuantity.cost_price)} / {selectedProductForQuantity.unit}</p>
                          <p className="font-medium text-green-700 mt-2">
                            Total vente: {formatCurrency(selectedProductForQuantity.selling_price * parseInt(tempQuantity || 0))}
                          </p>
                          <p className="font-medium text-orange-700">
                            Total coût: {formatCurrency(selectedProductForQuantity.cost_price * parseInt(tempQuantity || 0))}
                          </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setShowQuantityInput(false);
                              setSelectedProductForQuantity(null);
                              setTempQuantity('1');
                            }}
                            className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                          >
                            Annuler
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (tempQuantity && parseInt(tempQuantity) > 0) {
                                addItemToSubmission(selectedProductForQuantity, parseInt(tempQuantity));
                                setShowQuantityInput(false);
                                setSelectedProductForQuantity(null);
                                setTempQuantity('1');
                                setProductSearchTerm('');
                                setFocusedProductIndex(-1);
                              }
                            }}
                            className="w-full sm:flex-1 px-4 py-2 border border-transparent rounded-lg text-white bg-blue-600 hover:bg-blue-700"
                          >
                            Ajouter
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Modal ajout rapide produit */}
              {showQuickAddProduct && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                    <div className="p-4 sm:p-6">
                      <h3 className="text-lg font-semibold mb-4 text-orange-600">
                        ➕ Ajouter Produit Non-Inventaire
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Code Produit *</label>
                          <input
                            type="text"
                            value={quickProductForm.product_id}
                            onChange={(e) => setQuickProductForm({...quickProductForm, product_id: e.target.value})}
                            className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3"
                            placeholder="Ex: TEMP-001"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Unité</label>
                          <select
                            value={quickProductForm.unit}
                            onChange={(e) => setQuickProductForm({...quickProductForm, unit: e.target.value})}
                            className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3"
                          >
                            <option value="pcs">pcs</option>
                            <option value="m">m</option>
                            <option value="m2">m²</option>
                            <option value="kg">kg</option>
                            <option value="litre">litre</option>
                            <option value="heure">heure</option>
                            <option value="lot">lot</option>
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-2">Description *</label>
                          <input
                            type="text"
                            value={quickProductForm.description}
                            onChange={(e) => setQuickProductForm({...quickProductForm, description: e.target.value})}
                            className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3"
                            placeholder="Description du produit..."
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Prix Coût *</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={quickProductForm.cost_price}
                            onChange={(e) => setQuickProductForm({...quickProductForm, cost_price: e.target.value})}
                            className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3"
                            placeholder="0.00"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Prix Vente *</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={quickProductForm.selling_price}
                            onChange={(e) => setQuickProductForm({...quickProductForm, selling_price: e.target.value})}
                            className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3"
                            placeholder="0.00"
                            required
                          />
                        </div>
                      </div>
                      
                      {quickProductForm.selling_price && quickProductForm.cost_price && (
                        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                          <p className="text-sm text-blue-800">
                            💰 Marge: {formatCurrency(parseFloat(quickProductForm.selling_price || 0) - parseFloat(quickProductForm.cost_price || 0))} 
                            ({((parseFloat(quickProductForm.selling_price || 0) - parseFloat(quickProductForm.cost_price || 0)) / parseFloat(quickProductForm.selling_price || 1) * 100).toFixed(1)}%)
                          </p>
                        </div>
                      )}
                      
                      <div className="flex flex-col sm:flex-row gap-3 mt-6">
                        <button
                          type="button"
                          onClick={() => {
                            setShowQuickAddProduct(false);
                            setQuickProductForm({
                              product_id: '',
                              description: '',
                              selling_price: '',
                              cost_price: '',
                              unit: 'pcs',
                              product_group: 'Divers'
                            });
                          }}
                          className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (quickProductForm.product_id && quickProductForm.description && 
                                quickProductForm.selling_price && quickProductForm.cost_price) {
                              const tempProduct = {
                                product_id: quickProductForm.product_id,
                                description: quickProductForm.description,
                                selling_price: parseFloat(quickProductForm.selling_price),
                                cost_price: parseFloat(quickProductForm.cost_price),
                                unit: quickProductForm.unit,
                                product_group: quickProductForm.product_group,
                                stock_qty: 0
                              };
                              
                              addItemToSubmission(tempProduct, 1);
                              
                              setShowQuickAddProduct(false);
                              setQuickProductForm({
                                product_id: '',
                                description: '',
                                selling_price: '',
                                cost_price: '',
                                unit: 'pcs',
                                product_group: 'Divers'
                              });
                            }
                          }}
                          className="w-full sm:flex-1 px-4 py-2 border border-transparent rounded-lg text-white bg-orange-600 hover:bg-orange-700"
                        >
                          ✅ Ajouter à la soumission
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Items sélectionnés */}
              {selectedItems.length > 0 && (
                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                  <h3 className="text-base sm:text-lg font-semibold text-yellow-800 mb-4">
                    📦 Produits Sélectionnés ({selectedItems.length})
                  </h3>
                  
                  {/* Tableau desktop */}
                  <div className="hidden sm:block max-h-80 overflow-y-auto border border-yellow-200 rounded-lg bg-white">
                    <table className="w-full text-sm">
                      <thead className="bg-yellow-100 sticky top-0">
                        <tr>
                          <th className="text-left p-2 font-semibold">Code</th>
                          <th className="text-left p-2 font-semibold">Description</th>
                          <th className="text-center p-2 font-semibold">Qté</th>
                          <th className="text-right p-2 font-semibold text-green-700">💰 Prix Vente</th>
                          <th className="text-right p-2 font-semibold text-orange-700">🏷️ Prix Coût</th>
                          <th className="text-right p-2 font-semibold">Total Vente</th>
                          <th className="text-right p-2 font-semibold">Total Coût</th>
                          <th className="text-left p-2 font-semibold">💬 Commentaire</th>
                          <th className="text-center p-2 font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...selectedItems].reverse().map((item) => (
                          <tr key={item.product_id} className="border-b border-yellow-100 hover:bg-yellow-50">
                            <td className="p-2 font-mono text-xs">{item.product_id}</td>
                            <td className="p-2">
                              <div className="max-w-xs">
                                <div className="font-medium text-gray-900 truncate">{item.description}</div>
                                <div className="text-xs text-gray-500">{item.product_group} • {item.unit}</div>
                              </div>
                            </td>
                            <td className="p-2 text-center">
                              <input
                                type="number"
                                step="1"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  if (value === '' || (parseInt(value) > 0 && Number.isInteger(parseFloat(value)))) {
                                    updateItemQuantity(item.product_id, value);
                                  }
                                }}
                                className="w-16 text-center rounded border-gray-300 text-sm"
                              />
                            </td>
                            <td className="p-2 text-right">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={item.selling_price}
                                onChange={(e) => updateItemPrice(item.product_id, 'selling_price', e.target.value)}
                                className="w-20 text-right rounded border-green-300 text-sm focus:border-green-500 focus:ring-green-500"
                              />
                            </td>
                            <td className="p-2 text-right">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={item.cost_price}
                                onChange={(e) => updateItemPrice(item.product_id, 'cost_price', e.target.value)}
                                className="w-20 text-right rounded border-orange-300 text-sm focus:border-orange-500 focus:ring-orange-500"
                              />
                            </td>
                            <td className="p-2 text-right font-medium text-green-700">
                              {formatCurrency(item.selling_price * item.quantity)}
                            </td>
                            <td className="p-2 text-right font-medium text-orange-700">
                              {formatCurrency(item.cost_price * item.quantity)}
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={item.comment || ''}
                                onChange={(e) => updateItemComment(item.product_id, e.target.value)}
                                className="w-32 text-sm rounded border-blue-300 focus:border-blue-500 focus:ring-blue-500"
                                placeholder="Note..."
                              />
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => removeItemFromSubmission(item.product_id)}
                                className="px-2 py-1 bg-red-100 text-red-800 rounded hover:bg-red-200 text-xs"
                                title="Supprimer"
                              >
                                ❌
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Cards mobile */}
                  <div className="sm:hidden space-y-3">
                    {[...selectedItems].reverse().map((item) => (
                      <div key={item.product_id} className="bg-white p-3 rounded-lg border border-yellow-200">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-900 text-sm">{item.product_id}</h4>
                            <p className="text-xs text-gray-600">{item.description}</p>
                            <p className="text-xs text-gray-500">{item.product_group} • {item.unit}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeItemFromSubmission(item.product_id)}
                            className="ml-2 p-1 bg-red-100 text-red-800 rounded hover:bg-red-200"
                            title="Supprimer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Quantité</label>
                            <input
                              type="number"
                              step="1"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (value === '' || (parseInt(value) > 0 && Number.isInteger(parseFloat(value)))) {
                                  updateItemQuantity(item.product_id, value);
                                }
                              }}
                              className="w-full text-center rounded border-gray-300 text-sm p-2"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-green-700 mb-1">Prix Vente</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.selling_price}
                              onChange={(e) => updateItemPrice(item.product_id, 'selling_price', e.target.value)}
                              className="w-full text-right rounded border-green-300 text-sm focus:border-green-500 focus:ring-green-500 p-2"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-orange-700 mb-1">Prix Coût</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.cost_price}
                              onChange={(e) => updateItemPrice(item.product_id, 'cost_price', e.target.value)}
                              className="w-full text-right rounded border-orange-300 text-sm focus:border-orange-500 focus:ring-orange-500 p-2"
                            />
                          </div>
                        </div>

                        <div className="mt-2">
                          <label className="block text-xs text-blue-700 mb-1">💬 Commentaire</label>
                          <input
                            type="text"
                            value={item.comment || ''}
                            onChange={(e) => updateItemComment(item.product_id, e.target.value)}
                            className="w-full text-sm rounded border-blue-300 focus:border-blue-500 focus:ring-blue-500 p-2"
                            placeholder="Ajouter une note..."
                          />
                        </div>
                        
                        <div className="mt-2 pt-2 border-t border-gray-200 flex justify-between text-sm">
                          <span className="text-green-700 font-medium">
                            Total vente: {formatCurrency(item.selling_price * item.quantity)}
                          </span>
                          <span className="text-orange-700 font-medium">
                            Total coût: {formatCurrency(item.cost_price * item.quantity)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-3 space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-yellow-700">
                        📊 {selectedItems.length} article(s) • 
                        Total quantité: {selectedItems.reduce((sum, item) => sum + parseInt(item.quantity), 0)} unités
                      </span>
                      <div className="flex flex-col sm:flex-row sm:space-x-4">
                        <span className="text-green-700 font-medium">
                          💰 {formatCurrency(submissionForm.amount)}
                        </span>
                        <span className="text-orange-700 font-medium">
                          🏷️ {formatCurrency(calculatedCostTotal)}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-yellow-600 bg-yellow-200 p-2 rounded">
                      💡 Utilisez ↑↓ pour naviguer, quantités entières uniquement, prix modifiables
                    </div>
                  </div>
                </div>
              )}

              {/* Totaux */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-green-100 p-4 rounded-lg border border-green-300">
                  <label className="block text-base sm:text-lg font-semibold text-green-800 mb-2">
                    💰 Total Vente
                  </label>
                  <div className="text-xl sm:text-2xl font-bold text-green-900">
                    {formatCurrency(submissionForm.amount)}
                  </div>
                </div>
                
                <div className="bg-orange-100 p-4 rounded-lg border border-orange-300">
                  <label className="block text-base sm:text-lg font-semibold text-orange-800 mb-2">
                    🏷️ Total Coût
                  </label>
                  <div className="text-xl sm:text-2xl font-bold text-orange-900">
                    {formatCurrency(calculatedCostTotal)}
                  </div>
                </div>

                <div className="bg-blue-100 p-4 rounded-lg border border-blue-300">
                  <label className="block text-base sm:text-lg font-semibold text-blue-800 mb-2">
                    📈 Marge
                  </label>
                  <div className="text-xl sm:text-2xl font-bold text-blue-900">
                    {formatCurrency(submissionForm.amount - calculatedCostTotal)}
                  </div>
                  {submissionForm.amount > 0 && calculatedCostTotal > 0 && (
                    <div className="text-sm text-blue-700">
                      {((submissionForm.amount - calculatedCostTotal) / submissionForm.amount * 100).toFixed(1)}%
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-center">
                <p className="text-gray-600 text-sm">
                  📋 {selectedItems.length} produit(s) sélectionné(s) • 
                  Utilisez les boutons dans la barre violette ci-dessus pour sauvegarder
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* En-tête avec statistiques */}
      <div className="bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 rounded-xl shadow-lg p-4 sm:p-6 text-white">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold">📝 Gestion des Soumissions</h2>
            <p className="text-white/90 text-sm sm:text-base mt-1">
              Créez et gérez vos soumissions client
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
              onClick={async () => {
                try {
                  const newNumber = await generateSubmissionNumber();
                  setSubmissionForm(prev => ({
                    ...prev,
                    submission_number: newNumber
                  }));
                  setShowForm(true);
                } catch (error) {
                  console.error('Erreur génération numéro:', error);
                  setShowForm(true);
                }
              }}
              className="w-full sm:w-auto px-4 py-2 bg-white text-purple-600 rounded-lg hover:bg-gray-100 font-medium text-sm"
            >
              ➕ Nouvelle Soumission
            </button>
          </div>
        </div>

        {/* Statistiques */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">📊</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Total</p>
                <p className="text-xl sm:text-2xl font-bold">{soumissions.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">📝</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Brouillons</p>
                <p className="text-xl sm:text-2xl font-bold">
                  {soumissions.filter(s => s.status === 'draft').length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">📤</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Envoyées</p>
                <p className="text-xl sm:text-2xl font-bold">
                  {soumissions.filter(s => s.status === 'sent').length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">💰</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Total Vente</p>
                <p className="text-lg sm:text-2xl font-bold">
                  {formatCurrency(soumissions.reduce((sum, s) => sum + (s.amount || 0), 0))}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Info système */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-sm text-gray-600">
          📊 {soumissions.length} soumissions • {clients.length} clients • Recherche dynamique sur 6718 produits
        </p>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="🔍 Rechercher par client ou description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-4 py-3 rounded-lg border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-base"
              />
            </div>
          </div>
          <div className="w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-base p-3"
            >
              <option value="all">Tous les statuts</option>
              <option value="draft">📝 Brouillons</option>
              <option value="sent">📤 Envoyées</option>
              <option value="accepted">✅ Acceptées</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table desktop */}
      <div className="hidden lg:block bg-white shadow-lg rounded-lg overflow-hidden">
        {filteredSoumissions.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-6xl mb-4 block">📝</span>
            <p className="text-gray-500 text-lg">Aucune soumission trouvée</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Soumission
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Montant
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredSoumissions.map((submission) => (
                <tr key={submission.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {submission.submission_number && (
                        <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs font-medium mr-2">
                          N°: {submission.submission_number}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{submission.client_name}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 max-w-xs truncate">{submission.description}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                    {formatCurrency(submission.amount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded text-xs ${
                      submission.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                      submission.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {submission.status === 'sent' ? '📤 Envoyée' :
                       submission.status === 'draft' ? '📝 Brouillon' : '✅ Acceptée'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(submission.created_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => {
                          setEditingSubmission(submission);
                          setSubmissionForm({
                            client_name: submission.client_name,
                            description: submission.description,
                            amount: submission.amount,
                            status: submission.status,
                            items: submission.items || [],
                            submission_number: submission.submission_number || ''
                          });
                          setSelectedItems(submission.items || []);
                          const existingCostTotal = (submission.items || []).reduce((sum, item) => 
                            sum + ((item.cost_price || 0) * (item.quantity || 0)), 0
                          );
                          setCalculatedCostTotal(existingCostTotal);
                          setShowForm(true);
                        }}
                        className="text-purple-600 hover:text-purple-900 p-1"
                        title="Modifier"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteSubmission(submission.id)}
                        className="text-red-600 hover:text-red-900 p-1"
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

      {/* Cards mobile */}
      <div className="lg:hidden space-y-4">
        {filteredSoumissions.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <span className="text-6xl mb-4 block">📝</span>
            <p className="text-gray-500 text-lg">Aucune soumission trouvée</p>
          </div>
        ) : (
          filteredSoumissions.map((submission) => (
            <div key={submission.id} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
              
              {/* En-tête de la card */}
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">
                      {submission.status === 'sent' ? '📤' :
                       submission.status === 'draft' ? '📝' : '✅'}
                    </span>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-base">
                        👤 {submission.client_name}
                      </h3>
                      {submission.submission_number && (
                        <p className="text-sm text-purple-600">N°: {submission.submission_number}</p>
                      )}
                    </div>
                  </div>
                  
                  {/* Menu actions mobile */}
                  <div className="relative">
                    <button
                      onClick={() => setSelectedSubmissionId(selectedSubmissionId === submission.id ? null : submission.id)}
                      className="p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-white/50"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                    
                    {/* Dropdown actions */}
                    {selectedSubmissionId === submission.id && (
                      <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                        <div className="py-1">
                          <button
                            onClick={() => {
                              setEditingSubmission(submission);
                              setSubmissionForm({
                                client_name: submission.client_name,
                                description: submission.description,
                                amount: submission.amount,
                                status: submission.status,
                                items: submission.items || [],
                                submission_number: submission.submission_number || ''
                              });
                              setSelectedItems(submission.items || []);
                              const existingCostTotal = (submission.items || []).reduce((sum, item) => 
                                sum + ((item.cost_price || 0) * (item.quantity || 0)), 0
                              );
                              setCalculatedCostTotal(existingCostTotal);
                              setShowForm(true);
                              setSelectedSubmissionId(null);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            Modifier
                          </button>
                          <hr className="my-1" />
                          <button
                            onClick={() => {
                              handleDeleteSubmission(submission.id);
                              setSelectedSubmissionId(null);
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

              {/* Contenu de la card */}
              <div className="p-4 space-y-3">
                
                {/* Description */}
                <div>
                  <span className="text-gray-500 text-sm block">📝 Description</span>
                  <p className="text-gray-900 font-medium">{submission.description}</p>
                </div>

                {/* Informations principales */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 block">💰 Montant</span>
                    <span className="font-bold text-green-600 text-base">{formatCurrency(submission.amount)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">📅 Date</span>
                    <span className="font-medium text-gray-900">{formatDate(submission.created_at)}</span>
                  </div>
                </div>

                {/* Statut */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 text-sm">Statut</span>
                  <span className={`px-2 py-1 rounded text-xs ${
                    submission.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                    submission.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {submission.status === 'sent' ? 'Envoyée' :
                     submission.status === 'draft' ? 'Brouillon' : 'Acceptée'}
                  </span>
                </div>

                {/* Marge et coût */}
                {submission.items && submission.items.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-orange-600 font-medium">
                          🏷️ Coût: {formatCurrency(
                            submission.items.reduce((sum, item) => sum + ((item.cost_price || 0) * (item.quantity || 0)), 0)
                          )}
                        </span>
                      </div>
                      <div>
                        <span className="text-blue-600 font-medium">
                          📈 Marge: {formatCurrency(
                            submission.amount - submission.items.reduce((sum, item) => sum + ((item.cost_price || 0) * (item.quantity || 0)), 0)
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-gray-600">
                      📦 {submission.items.length} item(s)
                    </div>
                  </div>
                )}
              </div>

              {/* Actions rapides en bas */}
              <div className="bg-gray-50 px-4 py-3 flex gap-2">
                <button
                  onClick={() => {
                    setEditingSubmission(submission);
                    setSubmissionForm({
                      client_name: submission.client_name,
                      description: submission.description,
                      amount: submission.amount,
                      status: submission.status,
                      items: submission.items || [],
                      submission_number: submission.submission_number || ''
                    });
                    setSelectedItems(submission.items || []);
                    const existingCostTotal = (submission.items || []).reduce((sum, item) => 
                      sum + ((item.cost_price || 0) * (item.quantity || 0)), 0
                    );
                    setCalculatedCostTotal(existingCostTotal);
                    setShowForm(true);
                  }}
                  className="flex-1 bg-purple-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
                >
                  ✏️ Modifier
                </button>
                <button
                  onClick={() => handleDeleteSubmission(submission.id)}
                  className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                >
                  🗑️ Supprimer
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
