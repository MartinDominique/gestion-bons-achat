import React from 'react';
import { 
  MoreVertical, Edit, Trash2, Search, Plus, ShoppingCart, Building2, Wrench, Calendar
} from 'lucide-react';

// Imports des autres fichiers
import { useSupplierPurchase } from './SupplierPurchaseHooks';
import { 
  PurchaseForm, 
  SupplierModal, 
  SupplierFormModal,
  SupplierFormSimpleModal 
} from './SupplierPurchaseForms';
import { 
  formatCurrency, 
  formatDate, 
  generatePurchaseNumber,
  PURCHASE_STATUSES,
  getPONumber
} from './SupplierPurchaseServices';

export default function SupplierPurchaseManager() {
  // Utilisation du hook principal
  const hookData = useSupplierPurchase();
  
  const {
    // États principaux
    supplierPurchases,
    suppliers,
    purchaseOrders,
    shippingAddresses,
    loading,
    
    // États UI
    showForm,
    setShowForm,
    showSupplierModal,
    setShowSupplierModal,
    showAddressModal,
    setShowAddressModal,
    showAddressFormModal,
    setShowAddressFormModal,
    editingPurchase,
    setEditingPurchase,
    editingSupplier,
    setEditingSupplier,
    editingAddress,
    setEditingAddress,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    selectedPurchaseId,
    setSelectedPurchaseId,
    showSupplierFormModal,
    setShowSupplierFormModal,
    
    // NOUVEAUX ÉTATS POUR FILTRES DATE
    dateFilter,
    setDateFilter,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    getDateFilterStats,
    
    // États import soumission
    showImportSubmissionModal,
    setShowImportSubmissionModal,
    availableSubmissions,
    selectedSubmissionForImport,
    itemsToImport,
    loadingSubmissions,
    emailStatus,
    setEmailStatus,
    isLoadingEmail,
    
    // États recherche produits
    productSearchTerm,
    setProductSearchTerm,
    searchingProducts,
    selectedItems,
    setSelectedItems,
    focusedProductIndex,
    setFocusedProductIndex,
    showQuantityInput,
    setShowQuantityInput,
    selectedProductForQuantity,
    setSelectedProductForQuantity,
    tempQuantity,
    setTempQuantity,
    
    // État correction
    isFixingPOs,
    
    // Formulaires
    purchaseForm,
    setPurchaseForm,
    supplierForm,
    setSupplierForm,
    addressForm,
    setAddressForm,
    
    // Handlers principaux
    handlePurchaseSubmit,
    handleDeletePurchase,
    handleEditPurchase,
    handleQuickStatusUpdate, // NOUVELLE FONCTION
    handleSupplierSubmit,
    handleSupplierFormSubmit,
    handleDeleteSupplier,
    handleAddressSubmit,
    handleDeleteAddress,
    
    // Handlers produits
    handleProductKeyDown,
    handleQuantityKeyDown,
    selectProductForQuantity,
    addItemToPurchase,
    updateItemQuantity,
    updateItemPrice,
    updateItemNotes,
    removeItemFromPurchase,
    
    // Handlers soumissions
    handleFetchAvailableSubmissions,
    handleSubmissionSelect,
    toggleItemSelection,
    updateImportQuantity,
    handleImportSelectedItems,
    
    // Fonctions utilitaires
    resetForm,
    resetSupplierForm,
    resetAddressForm,
    shouldShowBilingual,
    isCanadianSupplier,
    handleFixExistingPurchases,
    handleTestEmail,
    
    // Données filtrées
    filteredPurchases
  } = hookData;

  // Fonction pour tester l'email quotidien
  const testDailyEmail = async () => {
    try {
      setEmailStatus('📤 Envoi de l\'email de test en cours...');
      
      const response = await fetch('/api/send-daily-report', {
        method: 'POST'
      });
      
      if (response.ok) {
        const data = await response.json();
        setEmailStatus(`✅ Email envoyé avec succès! ${data.message}`);
      } else {
        setEmailStatus('❌ Erreur lors de l\'envoi de l\'email de test');
      }
    } catch (error) {
      setEmailStatus('❌ Erreur: ' + error.message);
    }
  };
  
  // Loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
        <p className="ml-4 text-orange-600 font-medium">Chargement des achats fournisseurs...</p>
      </div>
    );
  }

  // Affichage du formulaire
  if (showForm) {
    return (
      <>
        <PurchaseForm 
          // Props du hook
          purchaseForm={purchaseForm}
          setPurchaseForm={setPurchaseForm}
          suppliers={suppliers}
          shippingAddresses={shippingAddresses}
          purchaseOrders={purchaseOrders}
          selectedItems={selectedItems}
          setSelectedItems={setSelectedItems}
          editingPurchase={editingPurchase}
          
          // Handlers
          handlePurchaseSubmit={handlePurchaseSubmit}
          resetForm={resetForm}
          shouldShowBilingual={shouldShowBilingual}
          isCanadianSupplier={isCanadianSupplier}
          
          // États produits
          productSearchTerm={productSearchTerm}
          setProductSearchTerm={setProductSearchTerm}
          products={hookData.products}
          searchingProducts={searchingProducts}
          focusedProductIndex={focusedProductIndex}
          setFocusedProductIndex={setFocusedProductIndex}
          showQuantityInput={showQuantityInput}
          setShowQuantityInput={setShowQuantityInput}
          selectedProductForQuantity={selectedProductForQuantity}
          setSelectedProductForQuantity={setSelectedProductForQuantity}
          tempQuantity={tempQuantity}
          setTempQuantity={setTempQuantity}
          
          // Handlers produits
          handleProductKeyDown={handleProductKeyDown}
          handleQuantityKeyDown={handleQuantityKeyDown}
          selectProductForQuantity={selectProductForQuantity}
          addItemToPurchase={addItemToPurchase}
          updateItemQuantity={updateItemQuantity}
          updateItemPrice={updateItemPrice}
          updateItemNotes={updateItemNotes}
          removeItemFromPurchase={removeItemFromPurchase}
          
          // États modals
          setShowSupplierFormModal={setShowSupplierFormModal}
          setShowSupplierModal={setShowSupplierModal}
          setShowAddressFormModal={setShowAddressFormModal}
          setShowAddressModal={setShowAddressModal}
          setShowImportSubmissionModal={setShowImportSubmissionModal}
          handleFetchAvailableSubmissions={handleFetchAvailableSubmissions}
          
          // États email
          emailStatus={emailStatus}
          isLoadingEmail={isLoadingEmail}
          
          // Reset forms
          resetSupplierForm={resetSupplierForm}
          resetAddressForm={resetAddressForm}

          resetAddressForm={resetAddressForm}
          
          // États modal non-inventaire
          showNonInventoryModal={hookData.showNonInventoryModal}
          setShowNonInventoryModal={hookData.setShowNonInventoryModal}
          nonInventoryForm={hookData.nonInventoryForm}
          setNonInventoryForm={hookData.setNonInventoryForm}
          showUsdCalculatorCost={hookData.showUsdCalculatorCost}
          setShowUsdCalculatorCost={hookData.setShowUsdCalculatorCost}
          showUsdCalculatorSelling={hookData.showUsdCalculatorSelling}
          setShowUsdCalculatorSelling={hookData.setShowUsdCalculatorSelling}
          usdAmountCost={hookData.usdAmountCost}
          setUsdAmountCost={hookData.setUsdAmountCost}
          usdAmountSelling={hookData.usdAmountSelling}
          setUsdAmountSelling={hookData.setUsdAmountSelling}
          usdToCadRate={hookData.usdToCadRate}
          loadingExchangeRate={hookData.loadingExchangeRate}
          exchangeRateError={hookData.exchangeRateError}
          
          // Fonctions modal non-inventaire
          fetchExchangeRate={hookData.fetchExchangeRate}
          applyProfitMargin={hookData.applyProfitMargin}
          useConvertedAmountCost={hookData.useConvertedAmountCost}
          useConvertedAmountSelling={hookData.useConvertedAmountSelling}
          addNonInventoryProduct={hookData.addNonInventoryProduct}
        />

          {/* MODAL IMPORT SOUMISSION */}
        <ImportSubmissionModal 
          showModal={showImportSubmissionModal}
          onClose={() => {
            setShowImportSubmissionModal(false);
            setSelectedSubmissionForImport(null);
            setItemsToImport([]);
          }}
          availableSubmissions={availableSubmissions}
          selectedSubmissionForImport={selectedSubmissionForImport}
          itemsToImport={itemsToImport}
          loadingSubmissions={loadingSubmissions}
          handleSubmissionSelect={handleSubmissionSelect}
          toggleItemSelection={toggleItemSelection}
          updateImportQuantity={updateImportQuantity}
          handleImportSelectedItems={handleImportSelectedItems}
        />

        {/* MODAL GESTION ADRESSES */}
        <AddressModal 
          showModal={showAddressModal}
          onClose={() => setShowAddressModal(false)}
          addresses={shippingAddresses}
          editingAddress={editingAddress}
          setEditingAddress={setEditingAddress}
          addressForm={addressForm}
          setAddressForm={setAddressForm}
          handleAddressSubmit={handleAddressSubmit}
          handleDeleteAddress={handleDeleteAddress}
          resetAddressForm={resetAddressForm}
          setShowAddressFormModal={setShowAddressFormModal}
        />

        {/* MODAL FORMULAIRE ADRESSE */}
        <AddressFormModal 
          showModal={showAddressFormModal}
          onClose={() => setShowAddressFormModal(false)}
          editingAddress={editingAddress}
          addressForm={addressForm}
          setAddressForm={setAddressForm}
          handleAddressSubmit={handleAddressSubmit}
        />

        {/* MODAL FORMULAIRE FOURNISSEUR SIMPLE */}
        <SupplierFormSimpleModal 
          showModal={showSupplierFormModal}
          onClose={() => setShowSupplierFormModal(false)}
          supplierForm={supplierForm}
          setSupplierForm={setSupplierForm}
          handleSupplierFormSubmit={handleSupplierFormSubmit}
          resetSupplierForm={resetSupplierForm}
        />
      </>
    );
  }

  // Interface principale (liste des achats)
  return (
    <div className="space-y-6 p-4">
      {/* En-tête avec statistiques */}
      <div className="bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 rounded-xl shadow-lg p-4 sm:p-6 text-white">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold">Gestion des Achats Fournisseurs</h2>
            <p className="text-white/90 text-sm sm:text-base mt-1">
              Gérez vos commandes fournisseurs et suivez vos achats
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={handleFixExistingPurchases}
              disabled={isFixingPOs}
              className={`w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium ${
                isFixingPOs 
                  ? 'bg-yellow-400 text-yellow-800 cursor-not-allowed' 
                  : 'bg-yellow-600 text-white hover:bg-yellow-700'
              }`}
              title="Corriger les PO manquants dans les achats existants"
            >
              {isFixingPOs ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-800 inline mr-2"></div>
                  Correction...
                </>
              ) : (
                <>
                  <Wrench className="w-4 h-4 inline mr-2" />
                  Corriger POs
                </>
              )}
            </button>
            <button
              onClick={() => setShowSupplierModal(true)}
              className="w-full sm:w-auto px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-sm font-medium hover:bg-white/20"
            >
              <Building2 className="w-4 h-4 inline mr-2" />
              Gestion Fournisseurs
            </button>
            <button
              onClick={async () => {
                const newNumber = await generatePurchaseNumber();
                setPurchaseForm(prev => ({
                  ...prev,
                  purchase_number: newNumber
                }));
                setShowForm(true);
              }}
              className="w-full sm:w-auto px-4 py-2 bg-white text-orange-600 rounded-lg hover:bg-gray-100 font-medium text-sm"
            >
              Nouvel Achat
            </button>
            <button
              onClick={testDailyEmail}
              disabled={isLoadingEmail}
              className="w-full sm:w-auto px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-50"
              title="Tester l'email quotidien des achats en cours"
            >
              {isLoadingEmail ? 'Envoi...' : '📧 Test Email Quotidien'}
            </button>
            {/* Bouton test email en développement */}
            {process.env.NODE_ENV === 'development' && (
              <button
                onClick={handleTestEmail}
                disabled={isLoadingEmail}
                className="w-full sm:w-auto px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm font-medium disabled:opacity-50"
                title="Tester l'envoi d'email à Dominique"
              >
                {isLoadingEmail ? 'Test...' : '🧪 Test Email'}
              </button>
            )}
          </div>
        </div>

        {/* Statistiques */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">📝</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Brouillons</p>
                <p className="text-xl sm:text-2xl font-bold">
                  {supplierPurchases.filter(p => p.status === 'draft').length}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">⏳</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">En commande</p>
                <p className="text-xl sm:text-2xl font-bold">
                  {supplierPurchases.filter(p => p.status === 'in_order').length}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">📤</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Commandés</p>
                <p className="text-xl sm:text-2xl font-bold">
                  {supplierPurchases.filter(p => p.status === 'ordered').length}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">✅</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Reçus</p>
                <p className="text-xl sm:text-2xl font-bold">
                  {supplierPurchases.filter(p => p.status === 'received').length}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
            <div className="flex items-center">
              <span className="text-2xl sm:text-3xl mr-3">💰</span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white/90">Total</p>
                <p className="text-lg sm:text-2xl font-bold">
                  {formatCurrency(supplierPurchases.reduce((sum, p) => sum + (p.total_amount || 0), 0))}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Affichage du statut email global */}
      {emailStatus && (
        <div className={`mb-4 p-3 rounded-lg border ${
          emailStatus.includes('✅') 
            ? 'bg-green-500/20 border-green-400/30 text-white' 
            : emailStatus.includes('❌')
            ? 'bg-red-500/20 border-red-400/30 text-red-100'
            : 'bg-blue-500/20 border-blue-400/30 text-blue-100'
        }`}>
          <div className="flex justify-between items-center">
            <span className="text-sm">{emailStatus}</span>
            <button 
              onClick={() => setEmailStatus('')}
              className="text-white/60 hover:text-white text-sm"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Filtres AMÉLIORÉS avec date de création */}
      <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
        <div className="space-y-4">
          {/* Première ligne : Recherche et Statut */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Rechercher par numéro, fournisseur, BA Acomba..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="block w-full pl-10 pr-4 py-3 rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base"
                />
              </div>
            </div>
            <div className="w-full sm:w-auto">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3"
              >
                <option value="all">Tous les statuts</option>
                {Object.entries(PURCHASE_STATUSES).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* NOUVELLE LIGNE : Filtres par date de création */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
              <Calendar className="w-4 h-4 mr-2" />
              Filtrer par date de création
            </h4>
            
            <div className="flex flex-col lg:flex-row gap-3">
              {/* Sélecteur de période prédéfinie */}
              <div className="w-full lg:w-auto">
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-sm p-2"
                >
                  <option value="all">Toutes les dates</option>
                  <option value="today">Aujourd'hui ({getDateFilterStats().todayCount})</option>
                  <option value="this_week">Cette semaine ({getDateFilterStats().thisWeekCount})</option>
                  <option value="this_month">Ce mois ({getDateFilterStats().thisMonthCount})</option>
                  <option value="custom">Période personnalisée</option>
                </select>
              </div>

              {/* Dates personnalisées (affichées seulement si "custom" est sélectionné) */}
              {dateFilter === 'custom' && (
                <div className="flex flex-col sm:flex-row gap-2 items-center">
                  <div className="w-full sm:w-auto">
                    <label className="block text-xs text-gray-500 mb-1">Du</label>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="w-full rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-sm p-2"
                    />
                  </div>
                  <div className="w-full sm:w-auto">
                    <label className="block text-xs text-gray-500 mb-1">Au</label>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="w-full rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-sm p-2"
                    />
                  </div>
                  {(customStartDate || customEndDate) && (
                    <button
                      onClick={() => {
                        setCustomStartDate('');
                        setCustomEndDate('');
                        setDateFilter('all');
                      }}
                      className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
                      title="Effacer les filtres de date"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}

              {/* Indicateur du nombre de résultats */}
              <div className="flex items-center text-sm text-gray-600 lg:ml-auto">
                <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded">
                  {filteredPurchases.length} résultat{filteredPurchases.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Liste des achats - Desktop AVEC DATE DE CRÉATION */}
      <div className="hidden lg:block bg-white shadow-lg rounded-lg overflow-hidden">
        {filteredPurchases.length === 0 ? (
          <div className="text-center py-12">
            <ShoppingCart className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500 text-lg">Aucun achat fournisseur trouvé</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">N° Achat</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date Création</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">BA Acomba</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">PO Client Lié</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fournisseur</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Date Livraison</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Montant</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Statut</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredPurchases.map((purchase) => {
                const poNumber = getPONumber(purchase, purchaseOrders);
                return (
                  <tr key={purchase.id} className="hover:bg-gray-50">
                    <td className="px-3 py-4 whitespace-nowrap">
                      <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs font-medium">
                        {purchase.purchase_number}
                      </span>
                    </td>
                    {/* NOUVELLE COLONNE - DATE DE CRÉATION */}
                    <td className="px-3 py-4 whitespace-nowrap">
                      <div className="text-sm">
                        <div className="font-medium text-gray-900">
                          {formatDate(purchase.created_at)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {purchase.created_at && new Date(purchase.created_at).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">
                      {purchase.ba_acomba ? (
                        <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs">
                          {purchase.ba_acomba}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-4 text-center">
                      {poNumber ? (
                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                          {poNumber}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-4">
                      <div className="text-sm font-medium text-gray-900">{purchase.supplier_name}</div>
                    </td>
                    <td className="px-3 py-4 text-center text-sm text-gray-500">
                      {formatDate(purchase.delivery_date)}
                    </td>
                    <td className="px-3 py-4 text-center">
                      <span className="text-sm font-medium text-green-600">
                        {formatCurrency(purchase.total_amount)}
                      </span>
                    </td>
                    {/* SELECT POUR STATUT */}
                    <td className="px-3 py-4 text-center">
                      <select
                        value={purchase.status}
                        onChange={(e) => handleQuickStatusUpdate(purchase.id, e.target.value, purchase)}
                        disabled={isLoadingEmail}
                        className={`px-2 py-1 rounded text-xs font-medium border-0 cursor-pointer ${
                          purchase.status === 'ordered' ? 'bg-blue-100 text-blue-800' :
                          purchase.status === 'in_order' ? 'bg-yellow-100 text-yellow-800' :
                          purchase.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                          purchase.status === 'received' ? 'bg-green-100 text-green-800' :
                          'bg-red-100 text-red-800'
                        }`}
                      >
                        {Object.entries(PURCHASE_STATUSES).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-4 text-center">
                      <div className="flex justify-center space-x-1">
                        <button
                          onClick={() => handleEditPurchase(purchase)}
                          className="bg-orange-100 text-orange-700 hover:bg-orange-200 p-2 rounded-lg"
                          title="Modifier"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeletePurchase(purchase.id)}
                          className="bg-red-100 text-red-700 hover:bg-red-200 p-2 rounded-lg"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Liste mobile AVEC DATE DE CRÉATION */}
      <div className="lg:hidden space-y-4">
        {filteredPurchases.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <ShoppingCart className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500">Aucun achat fournisseur trouvé</p>
          </div>
        ) : (
          filteredPurchases.map((purchase) => {
            const poNumber = getPONumber(purchase, purchaseOrders);
            return (
              <div key={purchase.id} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-orange-50 to-red-50 px-4 py-3 border-b">
                  <div className="flex justify-between items-center">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{purchase.purchase_number}</h3>
                      <div className="flex items-center space-x-2 mt-1">
                        <p className="text-sm text-gray-600">{purchase.supplier_name}</p>
                        {/* NOUVELLE SECTION - DATE DE CRÉATION */}
                        <span className="text-gray-400">•</span>
                        <div className="text-xs text-gray-500">
                          <span className="bg-gray-100 px-2 py-1 rounded">
                            Créé le {formatDate(purchase.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="relative">
                      <button
                        onClick={() => setSelectedPurchaseId(selectedPurchaseId === purchase.id ? null : purchase.id)}
                        className="p-2 text-gray-400 hover:text-gray-600"
                      >
                        <MoreVertical className="w-5 h-5" />
                      </button>
                      
                      {selectedPurchaseId === purchase.id && (
                        <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border z-10">
                          <div className="py-1">
                            <button
                              onClick={() => {
                                handleEditPurchase(purchase);
                                setSelectedPurchaseId(null);
                              }}
                              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                            >
                              <Edit className="w-4 h-4 inline mr-2" />
                              Modifier
                            </button>
                            <hr />
                            <button
                              onClick={() => {
                                handleDeletePurchase(purchase.id);
                                setSelectedPurchaseId(null);
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4 inline mr-2" />
                              Supprimer
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  {/* SECTION DÉTAILS AVEC DATE DE CRÉATION */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500 block">Date création</span>
                      <div className="font-medium">
                        {formatDate(purchase.created_at)}
                        {purchase.created_at && (
                          <div className="text-xs text-gray-500">
                            {new Date(purchase.created_at).toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Date livraison</span>
                      <span className="font-medium">{formatDate(purchase.delivery_date)}</span>
                    </div>
                  </div>
                  
                  {purchase.ba_acomba && (
                    <div>
                      <span className="text-gray-500 text-sm">BA Acomba</span>
                      <p className="font-medium">{purchase.ba_acomba}</p>
                    </div>
                  )}
                  
                  {poNumber && (
                    <div>
                      <span className="text-gray-500 text-sm">PO Client lié</span>
                      <p className="font-medium">{poNumber}</p>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500 block">Montant</span>
                      <span className="font-bold text-green-600">{formatCurrency(purchase.total_amount)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Statut</span>
                      <select
                        value={purchase.status}
                        onChange={(e) => handleQuickStatusUpdate(purchase.id, e.target.value, purchase)}
                        disabled={isLoadingEmail}
                        className={`px-2 py-1 rounded text-xs border-0 cursor-pointer ${
                          purchase.status === 'ordered' ? 'bg-blue-100 text-blue-800' :
                          purchase.status === 'in_order' ? 'bg-yellow-100 text-yellow-800' :
                          purchase.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                          purchase.status === 'received' ? 'bg-green-100 text-green-800' :
                          'bg-red-100 text-red-800'
                        }`}
                      >
                        {Object.entries(PURCHASE_STATUSES).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Gestion Fournisseurs */}
      <SupplierModal 
        showModal={showSupplierModal}
        onClose={() => setShowSupplierModal(false)}
        suppliers={suppliers}
        editingSupplier={editingSupplier}
        setEditingSupplier={setEditingSupplier}
        supplierForm={supplierForm}
        setSupplierForm={setSupplierForm}
        handleSupplierSubmit={handleSupplierSubmit}
        handleDeleteSupplier={handleDeleteSupplier}
        resetSupplierForm={resetSupplierForm}
      />
    </div>
  );
}

// ===== MODAL IMPORT SOUMISSION =====
const ImportSubmissionModal = ({
  showModal,
  onClose,
  availableSubmissions,
  selectedSubmissionForImport,
  itemsToImport,
  loadingSubmissions,
  handleSubmissionSelect,
  toggleItemSelection,
  updateImportQuantity,
  handleImportSelectedItems
}) => {
  if (!showModal) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        
        {/* En-tête */}
        <div className="bg-green-50 p-6 border-b border-green-200">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-green-600">Importer depuis une Soumission</h2>
              <p className="text-green-700 text-sm mt-1">
                Sélectionnez une soumission acceptée et choisissez les items à commander
              </p>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Fermer
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Étape 1: Sélection de la soumission */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              1. Sélectionnez une soumission acceptée
            </h3>
            
            {loadingSubmissions ? (
              <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mr-3"></div>
                <span className="text-green-600">Chargement des soumissions...</span>
              </div>
            ) : availableSubmissions.length === 0 ? (
              <div className="text-center p-8 text-gray-500">
                <p>Aucune soumission acceptée trouvée</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {availableSubmissions.map((submission) => (
                  <div 
                    key={submission.id} 
                    className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                      selectedSubmissionForImport?.id === submission.id 
                        ? 'border-green-500 bg-green-50' 
                        : 'border-gray-200 hover:border-green-300 hover:bg-green-25'
                    }`}
                    onClick={() => handleSubmissionSelect(submission)}
                  >
                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <h4 className="font-semibold text-gray-900">
                          {submission.submission_number}
                        </h4>
                        <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
                          Acceptée
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">
                        <strong>Client:</strong> {submission.client_name}
                      </p>
                      <p className="text-sm text-gray-600">
                        <strong>Description:</strong> {submission.description}
                      </p>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-green-600 font-medium">
                          {formatCurrency(submission.amount)}
                        </span>
                        <span className="text-gray-500">
                          {submission.items?.length || 0} item(s)
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {formatDate(submission.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Étape 2: Sélection des items */}
          {selectedSubmissionForImport && (
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                2. Sélectionnez les items à commander
              </h3>
              
              <div className="bg-blue-50 p-4 rounded-lg mb-4">
                <p className="text-blue-800 text-sm">
                  <strong>Soumission sélectionnée:</strong> {selectedSubmissionForImport.submission_number} - {selectedSubmissionForImport.client_name}
                </p>
              </div>

              {itemsToImport.length === 0 ? (
                <p className="text-gray-500 text-center py-8">Cette soumission ne contient aucun item</p>
              ) : (
                <>
                  {/* Actions en lot */}
                  <div className="flex gap-3 mb-4">
                    <button
                      type="button"
                      onClick={() => {
                        itemsToImport.forEach(item => toggleItemSelection(item.product_id, true));
                      }}
                      className="px-4 py-2 bg-green-100 text-green-800 rounded-lg hover:bg-green-200 text-sm"
                    >
                      Tout sélectionner
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        itemsToImport.forEach(item => toggleItemSelection(item.product_id, false));
                      }}
                      className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 text-sm"
                    >
                      Tout désélectionner
                    </button>
                  </div>

                  {/* Tableau des items */}
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left p-3 font-semibold">Sélection</th>
                          <th className="text-left p-3 font-semibold">Code</th>
                          <th className="text-left p-3 font-semibold">Description</th>
                          <th className="text-center p-3 font-semibold">Qté Originale</th>
                          <th className="text-center p-3 font-semibold">Qté à Commander</th>
                          <th className="text-right p-3 font-semibold">Prix Coût</th>
                          <th className="text-right p-3 font-semibold">Total Coût</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itemsToImport.map((item) => (
                          <tr key={item.product_id} className="border-t hover:bg-gray-50">
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                checked={item.selected}
                                onChange={(e) => toggleItemSelection(item.product_id, e.target.checked)}
                                className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                              />
                            </td>
                            <td className="p-3 font-mono text-xs">{item.product_id}</td>
                            <td className="p-3">
                              <div>
                                <div className="font-medium">{item.description}</div>
                                <div className="text-xs text-gray-500">{item.unit}</div>
                              </div>
                            </td>
                            <td className="p-3 text-center text-gray-600">
                              {item.quantity}
                            </td>
                            <td className="p-3 text-center">
                              <input
                                type="number"
                                step="0.1"
                                min="0.1"
                                value={item.importQuantity}
                                onChange={(e) => updateImportQuantity(item.product_id, e.target.value)}
                                disabled={!item.selected}
                                className={`w-20 text-center rounded border p-1 ${
                                  item.selected 
                                    ? 'border-green-300 focus:border-green-500 focus:ring-green-500' 
                                    : 'border-gray-200 bg-gray-50'
                                }`}
                              />
                            </td>
                            <td className="p-3 text-right font-medium text-orange-600">
                              {formatCurrency(item.cost_price || 0)}
                            </td>
                            <td className="p-3 text-right font-bold">
                              {formatCurrency((item.cost_price || 0) * (item.importQuantity || 0))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Actions finales */}
                  <div className="flex justify-between items-center mt-6">
                    <div className="text-sm text-gray-600">
                      {itemsToImport.filter(item => item.selected).length} item(s) sélectionné(s) 
                      sur {itemsToImport.length}
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={onClose}
                        className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        onClick={handleImportSelectedItems}
                        disabled={itemsToImport.filter(item => item.selected).length === 0}
                        className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                      >
                        Importer {itemsToImport.filter(item => item.selected).length} item(s)
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ===== MODAL GESTION ADRESSES =====
const AddressModal = ({ 
  showModal,
  onClose,
  addresses,
  editingAddress,
  setEditingAddress,
  addressForm,
  setAddressForm,
  handleDeleteAddress,
  resetAddressForm,
  setShowAddressFormModal
}) => {
  if (!showModal) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{ zIndex: 50 }}>
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="flex justify-between items-center p-6 border-b bg-purple-50">
          <h2 className="text-2xl font-bold text-purple-600">Gestion des Adresses de Livraison</h2>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setEditingAddress(null);
                resetAddressForm();
                onClose();
                setShowAddressFormModal(true);
              }}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Nouvelle Adresse
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Fermer
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {addresses.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>Aucune adresse de livraison enregistrée</p>
            </div>
          ) : (
            <div className="space-y-4">
              {addresses.map((address) => (
                <div key={address.id} className="border rounded-lg p-4 hover:bg-gray-50 relative">
                  {address.is_default && (
                    <div className="absolute top-2 right-2">
                      <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs font-medium">
                        Par défaut
                      </span>
                    </div>
                  )}
                  
                  <div className="flex justify-between">
                    <div className="flex-1 pr-4">
                      <h3 className="font-semibold text-lg">{address.name}</h3>
                      <div className="text-sm text-gray-600 mt-2 space-y-1">
                        <p>{address.address}</p>
                        <p>{address.city}, {address.province} {address.postal_code}</p>
                        <p>{address.country}</p>
                      </div>
                    </div>
                    
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => {
                          setEditingAddress(address);
                          setAddressForm(address);
                          onClose();
                          setShowAddressFormModal(true);
                        }}
                        className="px-3 py-2 bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => handleDeleteAddress(address.id)}
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
    </div>
  );
};

// ===== MODAL FORMULAIRE ADRESSE =====
const AddressFormModal = ({ 
  showModal,
  onClose,
  editingAddress,
  addressForm,
  setAddressForm,
  handleAddressSubmit
}) => {
  if (!showModal) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{ zIndex: 60 }}>
      <div className="bg-white rounded-lg w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-bold text-purple-600 mb-4">
          {editingAddress ? 'Modifier Adresse' : 'Nouvelle Adresse'}
        </h3>
        
        <form onSubmit={handleAddressSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nom de l'adresse *
              </label>
              <input
                type="text"
                value={addressForm.name}
                onChange={(e) => setAddressForm({...addressForm, name: e.target.value})}
                className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                placeholder="Ex: Bureau principal, Entrepôt..."
                required
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Adresse complète *
              </label>
              <input
                type="text"
                value={addressForm.address}
                onChange={(e) => setAddressForm({...addressForm, address: e.target.value})}
                className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                placeholder="123 Rue Principale, App. 456"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ville *
              </label>
              <input
                type="text"
                value={addressForm.city}
                onChange={(e) => setAddressForm({...addressForm, city: e.target.value})}
                className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Province *
              </label>
              <select
                value={addressForm.province}
                onChange={(e) => setAddressForm({...addressForm, province: e.target.value})}
                className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                required
              >
                <option value="QC">Québec</option>
                <option value="ON">Ontario</option>
                <option value="BC">Colombie-Britannique</option>
                <option value="AB">Alberta</option>
                <option value="MB">Manitoba</option>
                <option value="SK">Saskatchewan</option>
                <option value="NS">Nouvelle-Écosse</option>
                <option value="NB">Nouveau-Brunswick</option>
                <option value="NL">Terre-Neuve-et-Labrador</option>
                <option value="PE">Île-du-Prince-Édouard</option>
                <option value="NT">Territoires du Nord-Ouest</option>
                <option value="YT">Yukon</option>
                <option value="NU">Nunavut</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Code postal
              </label>
              <input
                type="text"
                value={addressForm.postal_code}
                onChange={(e) => setAddressForm({...addressForm, postal_code: e.target.value.toUpperCase()})}
                className="w-full rounded-lg border-gray-300 shadow-sm p-3"
                placeholder="H1A 1A1"
                pattern="[A-Za-z]\d[A-Za-z] \d[A-Za-z]\d"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Pays
              </label>
              <select
                value={addressForm.country}
                onChange={(e) => setAddressForm({...addressForm, country: e.target.value})}
                className="w-full rounded-lg border-gray-300 shadow-sm p-3"
              >
                <option value="Canada">Canada</option>
                <option value="USA">USA</option>
                <option value="Mexique">Mexique</option>
              </select>
            </div>
            
            <div className="md:col-span-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={addressForm.is_default}
                  onChange={(e) => setAddressForm({...addressForm, is_default: e.target.checked})}
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Définir comme adresse par défaut
                </span>
              </label>
            </div>
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
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              {editingAddress ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
