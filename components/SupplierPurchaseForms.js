import React from 'react';
import { 
  MoreVertical, Eye, Edit, Trash2, FileText, Download, Search, 
  Plus, Upload, X, ChevronDown, ShoppingCart, Building2, Truck,
  MapPin, Calendar, Package, DollarSign, Printer, Wrench, MessageSquare, Calculator
} from 'lucide-react';

import { 
  CARRIERS,
  PURCHASE_STATUSES,
  CANADIAN_PROVINCES,
  getPostalCodePattern,
  getPostalCodePlaceholder,
  formatCurrency,
  formatUnitPrice,
  formatDate,
  exportPDF,
  generatePurchaseNumber
} from './SupplierPurchaseServices';

// ===== COMPOSANT PRINCIPAL DU FORMULAIRE D'ACHAT =====
export const PurchaseForm = ({ 
  // Props du hook
  purchaseForm,
  setPurchaseForm,
  suppliers,
  shippingAddresses,
  purchaseOrders,
  selectedItems,
  setSelectedItems,
  editingPurchase,
  
  // Handlers
  handlePurchaseSubmit,
  resetForm,
  shouldShowBilingual,
  isCanadianSupplier,
  
  // États produits
  productSearchTerm,
  setProductSearchTerm,
  products,
  searchingProducts,
  focusedProductIndex,
  setFocusedProductIndex,
  showQuantityInput,
  setShowQuantityInput,
  selectedProductForQuantity,
  setSelectedProductForQuantity,
  tempQuantity,
  setTempQuantity,
  
  // Handlers produits
  handleProductKeyDown,
  handleQuantityKeyDown,
  selectProductForQuantity,
  addItemToPurchase,
  updateItemQuantity,
  updateItemPrice,
  updateItemNotes,
  removeItemFromPurchase,

  // États modal non-inventaire
  showNonInventoryModal,
  setShowNonInventoryModal,
  nonInventoryForm,
  setNonInventoryForm,
  showUsdCalculatorCost,
  setShowUsdCalculatorCost,
  showUsdCalculatorSelling,
  setShowUsdCalculatorSelling,
  usdAmountCost,
  setUsdAmountCost,
  usdAmountSelling,
  setUsdAmountSelling,
  usdToCadRate,
  loadingExchangeRate,
  exchangeRateError,
  
  // Fonctions modal non-inventaire
  fetchExchangeRate,
  applyProfitMargin,
  useConvertedAmountCost,
  useConvertedAmountSelling,
  addNonInventoryProduct,
  
  // États modals
  setShowSupplierFormModal,
  setShowSupplierModal,
  setShowAddressFormModal,
  setShowAddressModal,
  setShowImportSubmissionModal,
  handleFetchAvailableSubmissions,
  
  // États email
  emailStatus,
  isLoadingEmail,
  
  // Reset forms
  resetSupplierForm,
  resetAddressForm,

  // Modal mise à jour prix
  showPriceUpdateModal,
  priceUpdateItem,
  priceUpdateForm,
  setPriceUpdateForm,
  handlePriceBlur,
  applyPriceUpdateMargin,
  updateInventoryPrice,
  closePriceUpdateModal
}) => {
  
  const selectedSupplier = suppliers.find(s => s.id === purchaseForm.supplier_id);
  const selectedAddress = shippingAddresses.find(a => a.id === purchaseForm.shipping_address_id);

  const handlePrint = async () => {
    try {
      // Inclure les selectedItems actuels dans purchaseForm pour le PDF
      const formWithItems = { ...purchaseForm, items: selectedItems };
      await exportPDF('download', editingPurchase, formWithItems, {
        supplier: selectedSupplier,
        deliveryAddress: selectedAddress,
      });
    } catch (error) {
      console.error('Erreur génération PDF:', error);
      alert('Erreur lors de la génération du PDF');
    }
  };

  // Fonction pour générer PDF et envoyer au fournisseur par email
  const imprimerEtEnvoyerFournisseur = async () => {
    // Validation des champs obligatoires
    const missingFields = [];

    if (!purchaseForm.supplier_id) {
      missingFields.push('Fournisseur');
    }
    if (!purchaseForm.shipping_address_id) {
      missingFields.push('Adresse de livraison');
    }
    if (!purchaseForm.delivery_date) {
      missingFields.push('Date livraison prévue');
    }
    if (selectedItems.length === 0) {
      missingFields.push('Au moins un produit');
    }

    if (missingFields.length > 0) {
      alert(`⚠️ Champs obligatoires manquants:\n\n• ${missingFields.join('\n• ')}`);
      return;
    }

    if (!selectedSupplier) {
      alert('⚠️ Veuillez sélectionner un fournisseur avant d\'envoyer');
      return;
    }

    if (!selectedSupplier.email) {
      alert('⚠️ Aucun email trouvé pour ce fournisseur.\nAjoutez un email dans la fiche fournisseur.');
      return;
    }

    try {
      // Générer et sauvegarder le PDF via jsPDF (inclure selectedItems actuels)
      const formWithItems = { ...purchaseForm, items: selectedItems };
      await exportPDF('download', editingPurchase, formWithItems, {
        supplier: selectedSupplier,
        deliveryAddress: selectedAddress,
      });

      const confirmation = confirm(
        `✅ PDF sauvegardé : ${purchaseForm.purchase_number}.pdf\n\n` +
        `Voulez-vous ouvrir eM Client pour envoyer ce PDF à :\n${selectedSupplier.email} ?`
      );

      if (confirmation) {
        const isBilingual = shouldShowBilingual();
          
          const sujet = isBilingual 
            ? `Purchase Order ${purchaseForm.purchase_number} - Services TMT Inc.`
            : `Bon de Commande ${purchaseForm.purchase_number} - Services TMT Inc.`;
          
          const corpsEmail = isBilingual 
            ? `Hello,

Please find attached our purchase order for your reference.

ORDER SUMMARY:
- PO Number: ${purchaseForm.purchase_number}
- Subtotal: ${formatCurrency(purchaseForm.subtotal)}

Details:
- Number of items: ${selectedItems.length}
${purchaseForm.delivery_date ? `- Expected delivery: ${formatDate(purchaseForm.delivery_date)}` : ''}

Please confirm receipt and expected shipping date.

Thank you!`
            : `Bonjour,

Veuillez trouver ci-joint notre bon de commande.

RÉSUMÉ:
- N° Commande: ${purchaseForm.purchase_number}
- Sous-total: ${formatCurrency(purchaseForm.subtotal)}

Détails:
- Nombre d'articles: ${selectedItems.length}
${purchaseForm.delivery_date ? `- Livraison prévue: ${formatDate(purchaseForm.delivery_date)}` : ''}

Veuillez confirmer la réception et la date d'expédition prévue.

Merci!`;

          const mailtoLink = `mailto:${selectedSupplier.email}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corpsEmail)}`;
          
          // Iframe invisible pour éviter la navigation
          const iframe = document.createElement('iframe');
          iframe.style.display = 'none';
          iframe.src = mailtoLink;
          document.body.appendChild(iframe);
          
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 1000);

          // Notification temporaire
          const notification = document.createElement('div');
          notification.innerHTML = '✅ Email préparé - Attachez le PDF dans eM Client';
          notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #10b981;
            color: white;
            padding: 16px 24px;
            border-radius: 8px;
            font-weight: 600;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            z-index: 9999;
          `;
          document.body.appendChild(notification);
          
          setTimeout(() => {
            if (document.body.contains(notification)) {
              document.body.removeChild(notification);
            }
          }, 3000);
        }

    } catch (error) {
      alert(`❌ Erreur: ${error.message}`);
    }
  };

  return (
    <>
      {/* FORMULAIRE */}
      <div className="max-w-6xl mx-auto p-4 no-print">
        <div className="bg-white rounded-xl shadow-lg border border-orange-200 overflow-hidden">

        {/* En-tête */}
        <div className="bg-gradient-to-r from-orange-500 to-red-600 text-white p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold">
                {editingPurchase ? 'Modifier Achat Fournisseur' : 'Nouvel Achat Fournisseur'}
              </h2>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-1">
                {purchaseForm.purchase_number && (
                  <p className="text-orange-100 text-sm">
                    N°: {purchaseForm.purchase_number}
                  </p>
                )}
                {/* NOUVEAU - Date de création en mode édition */}
                {editingPurchase && editingPurchase.created_at && (
                  <>
                    {purchaseForm.purchase_number && <span className="hidden sm:inline text-orange-200">•</span>}
                    <div className="text-orange-100 text-sm">
                      <span className="bg-white/20 px-2 py-1 rounded">
                        📅 {formatDate(editingPurchase.created_at)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
            
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <button
                onClick={handlePrint}
                className="w-full sm:w-auto px-4 py-2 bg-white/20 rounded-lg hover:bg-white/30 text-sm font-medium"
              >
                🖨️ Imprimer
              </button>
              <button
                type="button"
                onClick={imprimerEtEnvoyerFournisseur}
                className="w-full sm:w-auto px-4 py-2 bg-green-500 rounded-lg hover:bg-green-600 text-sm font-medium"
              >
                📧 Envoyer au Fournisseur
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="w-full sm:w-auto px-4 py-2 bg-white/10 border border-white/20 rounded-lg hover:bg-white/20 text-sm font-medium"
              >
                Annuler
              </button>
              <button
                type="submit"
                form="purchase-form"
                className="w-full sm:w-auto px-4 py-2 bg-white text-orange-600 rounded-lg hover:bg-gray-100 font-medium text-sm"
                disabled={isLoadingEmail}
              >
                {isLoadingEmail ? 'Envoi...' : (editingPurchase ? 'Mettre à jour' : 'Créer')}
              </button>
            </div>
          </div>
        </div>

          {/* Affichage du statut email */}
          {emailStatus && (
            <div className={`mx-6 mt-4 p-4 rounded-lg border ${
              emailStatus.includes('✅') 
                ? 'bg-green-50 border-green-200 text-green-800' 
                : emailStatus.includes('❌')
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-blue-50 border-blue-200 text-blue-800'
            }`}>
              {emailStatus}
            </div>
          )}
          
          {/* Contenu du formulaire */}
          <div className="p-4 sm:p-6">
            <form 
              id="purchase-form" 
              onSubmit={handlePurchaseSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.type !== 'submit') {
                  e.preventDefault();
                }
              }}
              className="space-y-6"
            >
              
              {/* Fournisseur et Bon d'achat lié */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <label className="block text-sm font-semibold text-blue-800 mb-2">
                    Fournisseur *
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={purchaseForm.supplier_id}
                      onChange={(e) => {
                        const supplier = suppliers.find(s => s.id === e.target.value);
                        setPurchaseForm({
                          ...purchaseForm, 
                          supplier_id: e.target.value,
                          supplier_name: supplier?.company_name || ''
                        });
                      }}
                      className={`block flex-1 rounded-lg border-blue-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3 ${
                        editingPurchase ? 'bg-gray-100 cursor-not-allowed' : ''
                      }`}
                      required
                      disabled={!!editingPurchase}
                    >
                      <option value="">Sélectionner un fournisseur...</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.company_name}
                        </option>
                      ))}
                    </select>
                    
                    <button
                      type="button"
                      onClick={() => {
                        resetSupplierForm();
                        setShowSupplierFormModal(true);
                      }}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex-shrink-0"
                      title="Nouveau fournisseur"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => setShowSupplierModal(true)}
                      className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 flex-shrink-0"
                      title="Gérer les fournisseurs"
                    >
                      <Building2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <label className="block text-sm font-semibold text-green-800 mb-2">
                    Bon d'achat client lié
                  </label>
                  <select
                    value={purchaseForm.linked_po_id}
                    onChange={(e) => {
                      const selectedPoId = e.target.value;
                      const po = purchaseOrders.find(p => p.id === selectedPoId);
                      
                      setPurchaseForm({
                        ...purchaseForm, 
                        linked_po_id: selectedPoId,
                        linked_po_number: po?.po_number || '',
                      });
                    }}
                    className="block w-full rounded-lg border-green-300 shadow-sm focus:border-green-500 focus:ring-green-500 text-base p-3"
                  >
                    <option value="">Aucun (optionnel)</option>
                    {purchaseOrders.map((po) => (
                      <option key={po.id} value={po.id}>
                        {po.po_number} - {po.client_name} - {po.description ? (po.description.length > 20 ? po.description.substring(0, 20) + '...' : po.description) : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* NOUVEAU - BA Acomba et Soumission fournisseur */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
                <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                  <label className="block text-sm font-semibold text-purple-800 mb-2">
                    BA Acomba
                  </label>
                  <input
                    type="text"
                    value={purchaseForm.ba_acomba}
                    onChange={(e) => setPurchaseForm({...purchaseForm, ba_acomba: e.target.value})}
                    className="block w-full rounded-lg border-purple-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-base p-3"
                    placeholder="BA Acomba..."
                  />
                </div>

                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                  <label className="block text-sm font-semibold text-yellow-800 mb-2">
                    Soumission
                  </label>
                  <input
                    type="text"
                    value={purchaseForm.supplier_quote_reference}
                    onChange={(e) => setPurchaseForm({...purchaseForm, supplier_quote_reference: e.target.value})}
                    className="block w-full rounded-lg border-yellow-300 shadow-sm focus:border-yellow-500 focus:ring-yellow-500 text-base p-3"
                    placeholder="Réf. soumission fournisseur"
                  />
                </div>

                <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                  <label className="block text-sm font-semibold text-indigo-800 mb-2">
                    Date livraison prévue *
                  </label>
                  <input
                    type="date"
                    value={purchaseForm.delivery_date}
                    onChange={(e) => setPurchaseForm({...purchaseForm, delivery_date: e.target.value})}
                    className="block w-full rounded-lg border-indigo-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base p-3"
                  />
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    Statut
                  </label>
                  <select
                    value={purchaseForm.status}
                    onChange={(e) => setPurchaseForm({...purchaseForm, status: e.target.value})}
                    className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base p-3"
                  >
                    {Object.entries(PURCHASE_STATUSES).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Adresse de livraison et Méthode */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                  <label className="block text-sm font-semibold text-purple-800 mb-2">
                    Adresse de livraison *
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={purchaseForm.shipping_address_id}
                      onChange={(e) => setPurchaseForm({...purchaseForm, shipping_address_id: e.target.value})}
                      className="block flex-1 rounded-lg border-purple-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-base p-3"
                      required
                    >
                      <option value="">Sélectionner une adresse...</option>
                      {shippingAddresses.map((address) => (
                        <option key={address.id} value={address.id}>
                          {address.name}
                          {address.is_default && ' ⭐'}
                        </option>
                      ))}
                    </select>
                    
                    <button
                      type="button"
                      onClick={() => {
                        resetAddressForm();
                        setShowAddressFormModal(true);
                      }}
                      className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex-shrink-0"
                      title="Nouvelle adresse"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => setShowAddressModal(true)}
                      className="px-3 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 flex-shrink-0"
                      title="Gérer les adresses"
                    >
                      <MapPin className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-semibold text-orange-800 mb-2">
                        Transporteur
                      </label>
                      <select
                        value={purchaseForm.shipping_company}
                        onChange={(e) => setPurchaseForm({...purchaseForm, shipping_company: e.target.value})}
                        className="block w-full rounded-lg border-orange-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3"
                      >
                        {CARRIERS.map((carrier, index) => (
                          <option key={index} value={carrier}>
                            {carrier || 'Sélectionner...'}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-orange-800 mb-2">
                        N° Compte
                      </label>
                      <input
                        type="text"
                        value={purchaseForm.shipping_account}
                        onChange={(e) => setPurchaseForm({...purchaseForm, shipping_account: e.target.value})}
                        className="block w-full rounded-lg border-orange-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3"
                        placeholder="N° compte..."
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Frais de livraison */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                  <label className="block text-sm font-semibold text-red-800 mb-2">
                    Frais de livraison
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={purchaseForm.shipping_cost}
                    onChange={(e) => setPurchaseForm({...purchaseForm, shipping_cost: e.target.value})}
                    className="block w-full rounded-lg border-red-300 shadow-sm focus:border-red-500 focus:ring-red-500 text-base p-3"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Recherche produits AVEC BOUTON IMPORT SOUMISSION */}
              <ProductSearch 
                productSearchTerm={productSearchTerm}
                setProductSearchTerm={setProductSearchTerm}
                products={products}
                searchingProducts={searchingProducts}
                focusedProductIndex={focusedProductIndex}
                setFocusedProductIndex={setFocusedProductIndex}
                handleProductKeyDown={handleProductKeyDown}
                selectProductForQuantity={selectProductForQuantity}
                setShowImportSubmissionModal={setShowImportSubmissionModal}
                handleFetchAvailableSubmissions={handleFetchAvailableSubmissions}
                setShowNonInventoryModal={setShowNonInventoryModal}
                setNonInventoryForm={setNonInventoryForm}
                supplierName={purchaseForm.supplier_name}
                fetchExchangeRate={fetchExchangeRate}
              />

              {/* Modal quantité */}
              <QuantityModal 
                showQuantityInput={showQuantityInput}
                setShowQuantityInput={setShowQuantityInput}
                selectedProductForQuantity={selectedProductForQuantity}
                setSelectedProductForQuantity={setSelectedProductForQuantity}
                tempQuantity={tempQuantity}
                setTempQuantity={setTempQuantity}
                handleQuantityKeyDown={handleQuantityKeyDown}
                addItemToPurchase={addItemToPurchase}
                setProductSearchTerm={setProductSearchTerm}
                setFocusedProductIndex={setFocusedProductIndex}
              />

              {/* Modal produit non-inventaire */}
              <NonInventoryModal 
                showNonInventoryModal={showNonInventoryModal}
                setShowNonInventoryModal={setShowNonInventoryModal}
                nonInventoryForm={nonInventoryForm}
                setNonInventoryForm={setNonInventoryForm}
                showUsdCalculatorCost={showUsdCalculatorCost}
                setShowUsdCalculatorCost={setShowUsdCalculatorCost}
                showUsdCalculatorSelling={showUsdCalculatorSelling}
                setShowUsdCalculatorSelling={setShowUsdCalculatorSelling}
                usdAmountCost={usdAmountCost}
                setUsdAmountCost={setUsdAmountCost}
                usdAmountSelling={usdAmountSelling}
                setUsdAmountSelling={setUsdAmountSelling}
                usdToCadRate={usdToCadRate}
                loadingExchangeRate={loadingExchangeRate}
                exchangeRateError={exchangeRateError}
                fetchExchangeRate={fetchExchangeRate}
                applyProfitMargin={applyProfitMargin}
                useConvertedAmountCost={useConvertedAmountCost}
                useConvertedAmountSelling={useConvertedAmountSelling}
                addNonInventoryProduct={addNonInventoryProduct}
                formatCurrency={formatCurrency}
              />    

              {/* Items sélectionnés */}
              <SelectedItemsTable 
                selectedItems={selectedItems}
                updateItemQuantity={updateItemQuantity}
                updateItemPrice={updateItemPrice}
                updateItemNotes={updateItemNotes}
                removeItemFromPurchase={removeItemFromPurchase}
                formatCurrency={formatCurrency}
                handlePriceBlur={handlePriceBlur}
              />

              {/* Modal mise à jour prix inventaire */}
              <PriceUpdateModal
                showModal={showPriceUpdateModal}
                item={priceUpdateItem}
                form={priceUpdateForm}
                setForm={setPriceUpdateForm}
                applyMargin={applyPriceUpdateMargin}
                onUpdate={updateInventoryPrice}
                onClose={closePriceUpdateModal}
              />

              {/* Notes */}
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <label className="block text-sm font-semibold text-gray-800 mb-2">
                  Notes
                </label>
                <textarea
                  value={purchaseForm.notes}
                  onChange={(e) => setPurchaseForm({...purchaseForm, notes: e.target.value.toUpperCase()})}
                  className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500 text-base p-3"
                  rows="3"
                  placeholder="Notes additionnelles..."
                />
              </div>

              {/* Totaux */}
              <div className={`grid grid-cols-1 gap-4 ${isCanadianSupplier() ? 'sm:grid-cols-5' : 'sm:grid-cols-3'}`}>
                <div className="bg-green-100 p-4 rounded-lg border border-green-300">
                  <p className="text-sm font-semibold text-green-800">Sous-total</p>
                  <p className="text-xl font-bold text-green-900">{formatCurrency(purchaseForm.subtotal)}</p>
                </div>
                
                {isCanadianSupplier() && (
                  <>
                    <div className="bg-blue-100 p-4 rounded-lg border border-blue-300">
                      <p className="text-sm font-semibold text-blue-800">TPS (5%)</p>
                      <p className="text-xl font-bold text-blue-900">{formatCurrency(purchaseForm.tps)}</p>
                    </div>
                    <div className="bg-cyan-100 p-4 rounded-lg border border-cyan-300">
                      <p className="text-sm font-semibold text-cyan-800">TVQ (9.975%)</p>
                      <p className="text-xl font-bold text-cyan-900">{formatCurrency(purchaseForm.tvq)}</p>
                    </div>
                  </>
                )}
                
                <div className="bg-orange-100 p-4 rounded-lg border border-orange-300">
                  <p className="text-sm font-semibold text-orange-800">Livraison</p>
                  <p className="text-xl font-bold text-orange-900">{formatCurrency(purchaseForm.shipping_cost)}</p>
                </div>
                <div className="bg-purple-100 p-4 rounded-lg border border-purple-300">
                  <p className="text-sm font-semibold text-purple-800">TOTAL</p>
                  <p className="text-xl font-bold text-purple-900">{formatCurrency(purchaseForm.total_amount)}</p>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
};

// ===== COMPOSANT RECHERCHE PRODUITS =====
export const ProductSearch = ({
  productSearchTerm,
  setProductSearchTerm,
  products,
  searchingProducts,
  focusedProductIndex,
  setFocusedProductIndex,
  handleProductKeyDown,
  selectProductForQuantity,
  setShowImportSubmissionModal,
  handleFetchAvailableSubmissions,
  setShowNonInventoryModal,
  setNonInventoryForm,
  supplierName,
  fetchExchangeRate
}) => {
  return (
    <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
      <h3 className="text-base sm:text-lg font-semibold text-indigo-800 mb-4">
        Recherche Produits
      </h3>
      
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              id="product-search"
              type="text"
              placeholder="Rechercher un produit (min. 2 caractères)..."
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
          onClick={() => {
            fetchExchangeRate();
            // Auto-remplir le fournisseur depuis l'AF en cours
            if (supplierName && setNonInventoryForm) {
              setNonInventoryForm(prev => ({ ...prev, supplier: supplierName }));
            }
            setShowNonInventoryModal(true);
          }}
          className="w-full sm:w-auto px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-medium flex items-center justify-center"
        >
          <Plus className="w-4 h-4 mr-2" />
          Produit Non-Inventaire
        </button>
        
        <button
          type="button"
          onClick={() => {
            handleFetchAvailableSubmissions();
            setShowImportSubmissionModal(true);
          }}
          className="w-full sm:w-auto px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium flex items-center justify-center"
        >
          <Upload className="w-4 h-4 mr-2" />
          Importer depuis Soumission
        </button>
      </div>
      
      {/* Résultats recherche */}
      {searchingProducts && (
        <div className="flex items-center justify-center p-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mr-2"></div>
          <span className="text-indigo-600">Recherche en cours...</span>
        </div>
      )}
      
      {productSearchTerm.length >= 2 && !searchingProducts && products.length > 0 && (
        <div className="mt-3 max-h-60 overflow-y-auto border border-indigo-200 rounded-lg">
          {products.map((product, index) => (
            <div 
              key={product.product_id} 
              className={`p-3 border-b hover:bg-indigo-50 cursor-pointer ${
                index === focusedProductIndex ? 'bg-indigo-100' : ''
              }`}
              onClick={() => selectProductForQuantity(product)}
            >
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium">{product.product_id} - {product.description}</p>
                  <p className="text-sm text-gray-600">
                    Prix coût: {formatUnitPrice(product.cost_price)} / {product.unit}
                  </p>
                </div>
                <button
                  type="button"
                  className="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm"
                >
                  Ajouter
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ===== MODAL QUANTITÉ =====
export const QuantityModal = ({
  showQuantityInput,
  setShowQuantityInput,
  selectedProductForQuantity,
  setSelectedProductForQuantity,
  tempQuantity,
  setTempQuantity,
  handleQuantityKeyDown,
  addItemToPurchase,
  setProductSearchTerm,
  setFocusedProductIndex
}) => {
  if (!showQuantityInput || !selectedProductForQuantity) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md p-6">
        <h3 className="text-lg font-semibold mb-4">
          Quantité pour: {selectedProductForQuantity.description}
        </h3>
         <input
            id="quantity-input"
            type="number"
            step="1"
            min="1"
            value={tempQuantity}
            onChange={(e) => setTempQuantity(e.target.value)}
            onKeyDown={handleQuantityKeyDown}
            onFocus={(e) => e.target.select()}
            className="block w-full rounded-lg border-gray-300 shadow-sm text-base p-3 mb-4"
            autoFocus
          />
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              setShowQuantityInput(false);
              setSelectedProductForQuantity(null);
              setTempQuantity('1');
            }}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => {
              if (tempQuantity && parseInt(tempQuantity) > 0) {
                addItemToPurchase(selectedProductForQuantity, parseInt(tempQuantity));
                setShowQuantityInput(false);
                setSelectedProductForQuantity(null);
                setTempQuantity('1');
                setProductSearchTerm('');
                setFocusedProductIndex(-1);
              }
            }}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
};

// ===== MODAL PRODUIT NON-INVENTAIRE =====
export const NonInventoryModal = ({
  showNonInventoryModal,
  setShowNonInventoryModal,
  nonInventoryForm,
  setNonInventoryForm,
  showUsdCalculatorCost,
  setShowUsdCalculatorCost,
  showUsdCalculatorSelling,
  setShowUsdCalculatorSelling,
  usdAmountCost,
  setUsdAmountCost,
  usdAmountSelling,
  setUsdAmountSelling,
  usdToCadRate,
  loadingExchangeRate,
  exchangeRateError,
  fetchExchangeRate,
  applyProfitMargin,
  useConvertedAmountCost,
  useConvertedAmountSelling,
  addNonInventoryProduct,
  formatCurrency
}) => {
  if (!showNonInventoryModal) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="p-4 sm:p-6">
          <h3 className="text-lg font-semibold mb-4 text-orange-600 flex items-center">
            <Plus className="w-5 h-5 mr-2" />
            Ajouter Produit Non-Inventaire
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Code Produit */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Code Produit *</label>
              <input
                type="text"
                value={nonInventoryForm.product_id}
                onChange={(e) => setNonInventoryForm({...nonInventoryForm, product_id: e.target.value.toUpperCase()})}
                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3"
                placeholder="Ex: TEMP-001"
                required
              />
            </div>

            {/* Unité */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Unité</label>
              <select
                value={nonInventoryForm.unit}
                onChange={(e) => setNonInventoryForm({...nonInventoryForm, unit: e.target.value})}
                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3"
              >
                <option value="Un">Un</option>
                <option value="M">m</option>
                <option value="PI">Pi</option>
                <option value="L">litre</option>
                <option value="H">heure</option>
              </select>
            </div>

            {/* Description */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Description *</label>
              <input
                type="text"
                value={nonInventoryForm.description}
                onChange={(e) => setNonInventoryForm({...nonInventoryForm, description: e.target.value.toUpperCase()})}
                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3"
                placeholder="Description du produit..."
                required
              />
            </div>

            {/* Dernier fournisseur */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Dernier fournisseur</label>
              <input
                type="text"
                value={nonInventoryForm.supplier || ''}
                onChange={(e) => setNonInventoryForm({...nonInventoryForm, supplier: e.target.value.toUpperCase()})}
                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3"
                placeholder="Rempli automatiquement depuis l'AF en cours"
              />
              {nonInventoryForm.supplier && (
                <p className="text-xs text-gray-500 mt-1">Auto-rempli depuis l'AF en cours</p>
              )}
            </div>

            {/* PRIX CÔTE À CÔTE */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Prix Coût CAD *</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={nonInventoryForm.cost_price}
                  onChange={(e) => setNonInventoryForm({...nonInventoryForm, cost_price: e.target.value})}
                  className="flex-1 rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3"
                  placeholder="0.00"
                  required
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowUsdCalculatorCost(!showUsdCalculatorCost);
                    if (!showUsdCalculatorCost) {
                      fetchExchangeRate();
                    }
                  }}
                  className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm font-medium flex items-center"
                  title="Convertir USD → CAD"
                >
                  <DollarSign className="w-4 h-4 mr-1" />
                  USD
                </button>
              </div>

              {/* CALCULATEUR USD COÛTANT */}
              {showUsdCalculatorCost && (
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-blue-800 flex items-center">
                      <Calculator className="w-4 h-4 mr-1" />
                      Convertir USD → CAD
                    </h4>
                    <button
                      type="button"
                      onClick={() => setShowUsdCalculatorCost(false)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-blue-700">Taux:</span>
                      <span className="font-medium">1 USD = {usdToCadRate.toFixed(4)} CAD</span>
                      {loadingExchangeRate && (
                        <div className="animate-spin rounded-full h-3 w-3 border-b border-blue-600"></div>
                      )}
                      <button
                        type="button"
                        onClick={fetchExchangeRate}
                        className="text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded hover:bg-blue-300"
                        disabled={loadingExchangeRate}
                      >
                        🔄 Actualiser
                      </button>
                    </div>
                    
                    {exchangeRateError && (
                      <div className="text-xs text-orange-600 bg-orange-50 p-2 rounded">
                        {exchangeRateError}
                      </div>
                    )}
                    
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={usdAmountCost}
                        onChange={(e) => setUsdAmountCost(e.target.value)}
                        placeholder="Montant USD"
                        className="flex-1 rounded border-blue-300 text-sm p-2"
                      />
                      <span className="text-sm text-blue-700">USD</span>
                      <span className="text-sm">=</span>
                      <span className="font-medium text-green-700">
                        {usdAmountCost ? (parseFloat(usdAmountCost) * usdToCadRate).toFixed(2) : '0.00'} CAD
                      </span>
                    </div>
                    
                    <button
                      type="button"
                      onClick={useConvertedAmountCost}
                      disabled={!usdAmountCost || parseFloat(usdAmountCost) <= 0}
                      className="w-full px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      ✅ Utiliser {usdAmountCost ? (parseFloat(usdAmountCost) * usdToCadRate).toFixed(2) : '0.00'} CAD
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* PRIX VENDANT SANS USD */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Prix Vente CAD *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={nonInventoryForm.selling_price}
                onChange={(e) => setNonInventoryForm({...nonInventoryForm, selling_price: e.target.value})}
                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3"
                placeholder="0.00"
                required
              />

              {/* BOUTONS DE PROFIT */}
              {nonInventoryForm.cost_price && parseFloat(nonInventoryForm.cost_price) > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-gray-600 mb-2">Profit automatique:</p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => applyProfitMargin(15)}
                      className="flex-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200 font-medium"
                    >
                      +15%
                    </button>
                    <button
                      type="button"
                      onClick={() => applyProfitMargin(20)}
                      className="flex-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 font-medium"
                    >
                      +20%
                    </button>
                    <button
                      type="button"
                      onClick={() => applyProfitMargin(27)}
                      className="flex-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs hover:bg-purple-200 font-medium"
                    >
                      +27%
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Marge */}
            {nonInventoryForm.selling_price && nonInventoryForm.cost_price && (
              <div className="sm:col-span-2 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  💰 Marge: {formatCurrency(parseFloat(nonInventoryForm.selling_price || 0) - parseFloat(nonInventoryForm.cost_price || 0))} 
                  ({((parseFloat(nonInventoryForm.selling_price || 0) - parseFloat(nonInventoryForm.cost_price || 0)) / parseFloat(nonInventoryForm.selling_price || 1) * 100).toFixed(1)}%)
                </p>
              </div>
            )}
          </div>

          {/* Boutons */}
          <div className="flex flex-col sm:flex-row gap-3 mt-6">
            <button
              type="button"
              onClick={() => {
                setShowNonInventoryModal(false);
                setNonInventoryForm({
                  product_id: '',
                  description: '',
                  cost_price: '',
                  selling_price: '',
                  unit: 'Un',
                  product_group: 'Non-Inventaire',
                  supplier: ''
                });
                setShowUsdCalculatorCost(false);
                setShowUsdCalculatorSelling(false);
                setUsdAmountCost('');
                setUsdAmountSelling('');
              }}
              className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={addNonInventoryProduct}
              className="w-full sm:flex-1 px-4 py-2 border border-transparent rounded-lg text-white bg-orange-600 hover:bg-orange-700"
            >
              ✅ Sauvegarder et Ajouter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ===== TABLEAU ITEMS SÉLECTIONNÉS =====
export const SelectedItemsTable = ({
  selectedItems,
  updateItemQuantity,
  updateItemPrice,
  updateItemNotes,
  removeItemFromPurchase,
  formatCurrency,
  handlePriceBlur
}) => {
  if (selectedItems.length === 0) return null;

  return (
    <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
      <h3 className="text-base sm:text-lg font-semibold text-yellow-800 mb-4">
        Produits Sélectionnés ({selectedItems.length})
      </h3>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-yellow-100">
            <tr>
              <th className="text-left p-2">Code</th>
              <th className="text-left p-2">Description</th>
              <th className="text-center p-2">Qté</th>
              <th className="text-right p-2">Prix Coût</th>
              <th className="text-right p-2">Total</th>
              <th className="text-left p-2">Notes</th>
              <th className="text-center p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {selectedItems.map((item) => (
              <tr key={item.product_id} className="border-b">
                <td className="p-2">{item.product_id}</td>
                <td className="p-2">{item.description}</td>
                <td className="p-2 text-center">
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => updateItemQuantity(item.product_id, e.target.value)}
                    className="w-16 text-center rounded border-gray-300"
                  />
                </td>
                <td className="p-2 text-right">
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={item.cost_price}
                    onChange={(e) => updateItemPrice(item.product_id, e.target.value)}
                    onBlur={(e) => handlePriceBlur && handlePriceBlur(item.product_id, e.target.value)}
                    className="w-24 text-right rounded border-gray-300"
                  />
                </td>
                <td className="p-2 text-right font-medium">
                  {formatCurrency(item.cost_price * item.quantity)}
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    value={item.notes || ''}
                    onChange={(e) => updateItemNotes(item.product_id, e.target.value)}
                    className="w-32 rounded border-gray-300 text-sm p-1"
                    placeholder="Notes..."
                  />
                </td>
                <td className="p-2 text-center">
                  <button
                    type="button"
                    onClick={() => removeItemFromPurchase(item.product_id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};


// ===== MODAL MISE À JOUR PRIX INVENTAIRE =====
export const PriceUpdateModal = ({
  showModal,
  item,
  form,
  setForm,
  applyMargin,
  onUpdate,
  onClose
}) => {
  if (!showModal || !item) return null;

  const priceDiff = item.newCostPrice - item.originalCostPrice;
  const priceDiffPercent = item.originalCostPrice > 0 
    ? ((priceDiff / item.originalCostPrice) * 100).toFixed(1)
    : 0;

  const currentMargin = form.newCostPrice && form.newSellingPrice
    ? (((parseFloat(form.newSellingPrice) - parseFloat(form.newCostPrice)) / parseFloat(form.newSellingPrice)) * 100).toFixed(1)
    : null;

  const handleKeyDown = (e) => {
    // Toujours stopper la propagation pour empêcher le formulaire parent de réagir
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      // Si un prix de vente est défini, appliquer la mise à jour
      if (form.newSellingPrice) {
        onUpdate();
      }
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onKeyDown={handleKeyDown}
    >
      <div className="bg-white rounded-lg w-full max-w-md shadow-xl">
        <div className="bg-amber-50 px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-amber-900">
            Mise à jour prix inventaire
          </h3>
          <p className="text-sm text-amber-700 mt-1">
            {item.product_id} - {item.description}
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Prix inventaire actuel:</span>
              <span className="font-medium">{item.originalCostPrice?.toFixed(2)} $</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Nouveau prix fournisseur:</span>
              <span className={`font-bold ${priceDiff > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {item.newCostPrice?.toFixed(2)} $
                <span className="ml-2 text-sm">
                  ({priceDiff > 0 ? '↑' : '↓'} {Math.abs(priceDiff).toFixed(2)}$ / {priceDiff > 0 ? '+' : ''}{priceDiffPercent}%)
                </span>
              </span>
            </div>
          </div>

          <div className="bg-green-50 p-4 rounded-lg">
            <label className="block text-sm font-medium text-green-800 mb-2">
              Calcul automatique par marge %
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="number"
                step="1"
                min="0"
                value={form.marginPercent}
                onChange={(e) => setForm({...form, marginPercent: e.target.value})}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    applyMargin(parseFloat(e.target.value) || 0);
                  }
                }}
                className="flex-1 rounded-lg border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 p-2"
                placeholder="Ex: 25"
                autoFocus
              />
              <button
                type="button"
                onClick={() => applyMargin(parseFloat(form.marginPercent) || 0)}
                disabled={!form.marginPercent || parseFloat(form.marginPercent) <= 0}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                OK
              </button>
            </div>
            <div className="flex gap-1">
              {[15, 20, 25, 30].map(pct => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => applyMargin(pct)}
                  className="flex-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200 font-medium"
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nouveau prix de vente *
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.newSellingPrice}
              onChange={(e) => setForm({...form, newSellingPrice: e.target.value})}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  if (form.newSellingPrice) {
                    onUpdate();
                  }
                }
              }}
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 p-3"
              placeholder="0.00"
            />
          </div>

          {currentMargin && (
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Aperçu marge:</div>
              <div className={`text-lg font-medium ${
                parseFloat(currentMargin) >= 20 ? 'text-green-600' : 
                parseFloat(currentMargin) >= 10 ? 'text-amber-600' : 'text-red-600'
              }`}>
                {currentMargin}%
              </div>
            </div>
          )}
        </div>

        <div className="bg-gray-50 px-6 py-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100"
          >
            Ignorer (Esc)
          </button>
          <button
            type="button"
            onClick={onUpdate}
            disabled={!form.newSellingPrice}
            className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Mettre à jour (Enter)
          </button>
        </div>
      </div>
    </div>
  );
};


// ===== MODAL GESTION FOURNISSEURS =====
export const SupplierModal = ({ 
  showModal,
  onClose,
  suppliers,
  editingSupplier,
  setEditingSupplier,
  supplierForm,
  setSupplierForm,
  handleSupplierSubmit,
  handleDeleteSupplier,
  resetSupplierForm
}) => {
  if (!showModal) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-6 border-b bg-orange-50">
          <h2 className="text-2xl font-bold text-orange-600">Gestion des Fournisseurs</h2>
          <div className="flex gap-3">
            <button
              onClick={() => {
                resetSupplierForm();
                document.getElementById('supplier-form-modal').showModal();
              }}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
            >
              Nouveau Fournisseur
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Fermer
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {suppliers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Building2 className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p>Aucun fournisseur enregistré</p>
            </div>
          ) : (
            <div className="space-y-4">
              {suppliers.map((supplier) => (
                <div key={supplier.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{supplier.company_name}</h3>
                      <div className="text-sm text-gray-600 mt-2 space-y-1">
                        {supplier.contact_name && <p>Contact: {supplier.contact_name}</p>}
                        {supplier.email && <p>{supplier.email}</p>}
                        {supplier.phone && <p>{supplier.phone}</p>}
                        {supplier.address && (
                          <p>{supplier.address}, {supplier.city}, {supplier.province} {supplier.postal_code}</p>
                        )}
                        {supplier.notes && <p className="italic">{supplier.notes}</p>}
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => {
                          setEditingSupplier(supplier);
                          setSupplierForm({
                            ...supplier,
                            preferred_english: supplier.preferred_english || false,
                            tax_id: supplier.tax_id || '',
                            tax_exempt: supplier.tax_exempt || false
                          });
                          document.getElementById('supplier-form-modal').showModal();
                        }}
                        className="px-3 py-2 bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => handleDeleteSupplier(supplier.id)}
                        className="px-3 py-2 bg-red-100 text-red-800 rounded hover:bg-red-200"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal Formulaire Fournisseur */}
      <SupplierFormModal 
        editingSupplier={editingSupplier}
        supplierForm={supplierForm}
        setSupplierForm={setSupplierForm}
        handleSupplierSubmit={handleSupplierSubmit}
      />
    </div>
  );
};

// ===== MODAL FORMULAIRE FOURNISSEUR =====
export const SupplierFormModal = ({ 
  editingSupplier,
  supplierForm,
  setSupplierForm,
  handleSupplierSubmit
}) => {
  // 📱 Formatage automatique des numéros de téléphone
  const formatPhoneNumber = (value) => {
    // Enlever tous les caractères non-numériques
    const numbers = value.replace(/\D/g, '');
    
    // Limiter à 10 chiffres
    const limited = numbers.slice(0, 10);
    
    // Formater selon le nombre de chiffres
    if (limited.length <= 3) {
      return limited;
    } else if (limited.length <= 6) {
      return `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
    } else {
      return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6)}`;
    }
  };

  // Handler spécial pour le champ téléphone
  const handlePhoneChange = (e) => {
    const formatted = formatPhoneNumber(e.target.value);
    setSupplierForm({...supplierForm, phone: formatted});
  };

  return (
    <dialog id="supplier-form-modal" className="p-0 rounded-lg backdrop:bg-black backdrop:bg-opacity-50">
      <div className="bg-white rounded-lg w-full max-w-2xl p-6">
        <h3 className="text-xl font-bold text-orange-600 mb-4">
          {editingSupplier ? 'Modifier Fournisseur' : 'Nouveau Fournisseur'}
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nom du contact
              </label>
              <input
                type="text"
                value={supplierForm.contact_name}
                onChange={(e) => setSupplierForm({...supplierForm, contact_name: e.target.value})}
                className="w-full rounded-lg border-gray-300 shadow-sm p-3"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={supplierForm.email}
                onChange={(e) => setSupplierForm({...supplierForm, email: e.target.value})}
                className="w-full rounded-lg border-gray-300 shadow-sm p-3"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Téléphone
              </label>
              <input
                type="tel"
                value={supplierForm.phone}
                onChange={handlePhoneChange}
                className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                placeholder="(418) 225-3875"
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Adresse
              </label>
              <input
                type="text"
                value={supplierForm.address}
                onChange={(e) => setSupplierForm({...supplierForm, address: e.target.value})}
                className="w-full rounded-lg border-gray-300 shadow-sm p-3"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Pays
              </label>
              <select
                value={supplierForm.country}
                onChange={(e) => {
                  const newCountry = e.target.value;
                  setSupplierForm({
                    ...supplierForm, 
                    country: newCountry,
                    province: newCountry === 'Canada' ? 'QC' : '',
                    postal_code: ''
                  });
                }}
                className="w-full rounded-lg border-gray-300 shadow-sm p-3"
              >
                <option value="Canada">Canada</option>
                <option value="USA">USA</option>
                <option value="Mexique">Mexique</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ville
              </label>
              <input
                type="text"
                value={supplierForm.city}
                onChange={(e) => setSupplierForm({...supplierForm, city: e.target.value})}
                className="w-full rounded-lg border-gray-300 shadow-sm p-3"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {supplierForm.country === 'USA' ? 'État' : 'Province'}
              </label>
              {supplierForm.country === 'Canada' ? (
                <select
                  value={supplierForm.province}
                  onChange={(e) => setSupplierForm({...supplierForm, province: e.target.value})}
                  className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                >
                  {Object.entries(CANADIAN_PROVINCES).map(([code, name]) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={supplierForm.province}
                  onChange={(e) => setSupplierForm({...supplierForm, province: e.target.value})}
                  className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                  placeholder={supplierForm.country === 'USA' ? 'Ex: California, Texas...' : 'État/Province'}
                />
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {supplierForm.country === 'USA' ? 'ZIP Code' : 'Code postal'}
              </label>
              <input
                type="text"
                value={supplierForm.postal_code}
                onChange={(e) => {
                  let value = e.target.value;
                  if (supplierForm.country === 'Canada') {
                    value = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    if (value.length >= 4) {
                      value = value.slice(0, 3) + ' ' + value.slice(3, 6);
                    }
                  }
                  setSupplierForm({...supplierForm, postal_code: value});
                }}
                className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                placeholder={getPostalCodePlaceholder(supplierForm.country)}
                pattern={getPostalCodePattern(supplierForm.country)}
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes
              </label>
              <textarea
                value={supplierForm.notes}
                onChange={(e) => setSupplierForm({...supplierForm, notes: e.target.value})}
                className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                rows="3"
              />
            </div>

            <div className="md:col-span-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={supplierForm.preferred_english}
                  onChange={(e) => setSupplierForm({...supplierForm, preferred_english: e.target.checked})}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Préférence anglais / English preference
                </span>
              </label>
              <p className="text-xs text-gray-500 mt-1">
                Si coché, les bons de commande seront générés en anglais/français pour ce fournisseur
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={supplierForm.tax_exempt}
                  onChange={(e) => setSupplierForm({...supplierForm, tax_exempt: e.target.checked})}
                  className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Exempt de taxes / Tax exempt
                </span>
              </label>
              <p className="text-xs text-gray-500 mt-1">
                Si coché, aucune taxe ne sera appliquée aux commandes de ce fournisseur
              </p>
            </div>

            {supplierForm.country === 'USA' && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tax ID / EIN (optionnel)
                </label>
                <input
                  type="text"
                  value={supplierForm.tax_id}
                  onChange={(e) => setSupplierForm({...supplierForm, tax_id: e.target.value})}
                  className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                  placeholder="12-3456789"
                />
              </div>
            )}
          </div>
          
          <div className="flex gap-3 justify-end pt-4">
            <button
              type="button"
              onClick={() => document.getElementById('supplier-form-modal').close()}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
            >
              {editingSupplier ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
};

// ===== MODAL FORMULAIRE FOURNISSEUR SIMPLE =====
export const SupplierFormSimpleModal = ({ 
  showModal,
  onClose,
  supplierForm,
  setSupplierForm,
  handleSupplierFormSubmit,
  resetSupplierForm
}) => {
  // 📱 Formatage automatique des numéros de téléphone
  const formatPhoneNumber = (value) => {
    // Enlever tous les caractères non-numériques
    const numbers = value.replace(/\D/g, '');
    
    // Limiter à 10 chiffres
    const limited = numbers.slice(0, 10);
    
    // Formater selon le nombre de chiffres
    if (limited.length <= 3) {
      return limited;
    } else if (limited.length <= 6) {
      return `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
    } else {
      return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6)}`;
    }
  };

  // Handler spécial pour le champ téléphone
  const handlePhoneChange = (e) => {
    const formatted = formatPhoneNumber(e.target.value);
    setSupplierForm({...supplierForm, phone: formatted});
  };

  if (!showModal) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
      <div className="bg-white rounded-lg w-full max-w-2xl p-6 shadow-2xl">
        <h3 className="text-xl font-bold text-blue-600 mb-4">Nouveau Fournisseur</h3>
        
        <form onSubmit={handleSupplierFormSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="Nom de l'entreprise *"
            value={supplierForm.company_name}
            onChange={(e) => setSupplierForm({...supplierForm, company_name: e.target.value})}
            className="w-full rounded-lg border-gray-300 p-3"
            required
          />
          
          <div className="grid grid-cols-2 gap-4">
            <input
              type="email"
              placeholder="Email"
              value={supplierForm.email}
              onChange={(e) => setSupplierForm({...supplierForm, email: e.target.value})}
              className="w-full rounded-lg border-gray-300 p-3"
            />
            <input
              type="tel"
              placeholder="Téléphone"
              value={supplierForm.phone}
              onChange={handlePhoneChange}
              className="w-full rounded-lg border-gray-300 p-3"
            />
          </div>

          <div className="flex items-center space-x-2 pt-2">
            <input
              type="checkbox"
              checked={supplierForm.preferred_english}
              onChange={(e) => setSupplierForm({...supplierForm, preferred_english: e.target.checked})}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Préférence anglais / English preference</span>
          </div>
                  
          <div className="flex gap-3 justify-end pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Créer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
