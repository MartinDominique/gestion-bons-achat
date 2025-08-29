// AJOUTS À FAIRE DANS SupplierPurchaseManager.js

// ============= NOUVEAUX ÉTATS À AJOUTER =============
const [showImportSubmissionModal, setShowImportSubmissionModal] = useState(false);
const [availableSubmissions, setAvailableSubmissions] = useState([]);
const [selectedSubmissionForImport, setSelectedSubmissionForImport] = useState(null);
const [itemsToImport, setItemsToImport] = useState([]); // Items avec checkbox sélectionnés
const [loadingSubmissions, setLoadingSubmissions] = useState(false);

// ============= NOUVELLES FONCTIONS À AJOUTER =============

// Fonction pour récupérer les soumissions acceptées
const fetchAvailableSubmissions = async () => {
  setLoadingSubmissions(true);
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('status', 'accepted') // Filtrer seulement les acceptées
      .order('created_at', { ascending: false });

    if (error) throw error;
    setAvailableSubmissions(data || []);
  } catch (error) {
    console.error('Erreur chargement soumissions:', error);
    alert('Erreur lors du chargement des soumissions');
  } finally {
    setLoadingSubmissions(false);
  }
};

// Fonction pour gérer la sélection d'une soumission
const handleSubmissionSelect = (submission) => {
  setSelectedSubmissionForImport(submission);
  // Initialiser tous les items comme non-sélectionnés
  const itemsWithSelection = (submission.items || []).map(item => ({
    ...item,
    selected: false,
    importQuantity: item.quantity || 1 // Quantité modifiable
  }));
  setItemsToImport(itemsWithSelection);
};

// Fonction pour toggle la sélection d'un item
const toggleItemSelection = (productId, isSelected) => {
  setItemsToImport(items => 
    items.map(item => 
      item.product_id === productId 
        ? { ...item, selected: isSelected }
        : item
    )
  );
};

// Fonction pour modifier la quantité d'import
const updateImportQuantity = (productId, newQuantity) => {
  const quantity = parseFloat(newQuantity);
  if (quantity > 0) {
    setItemsToImport(items => 
      items.map(item => 
        item.product_id === productId 
          ? { ...item, importQuantity: quantity }
          : item
      )
    );
  }
};

// Fonction pour importer les items sélectionnés
const handleImportSelectedItems = () => {
  const selectedItems = itemsToImport.filter(item => item.selected);
  
  if (selectedItems.length === 0) {
    alert('Veuillez sélectionner au moins un item à importer');
    return;
  }

  // Convertir les items de soumission en items d'achat
  const importedItems = selectedItems.map(item => ({
    ...item,
    quantity: item.importQuantity,
    cost_price: item.cost_price, // cost_price de soumission → cost_price d'achat
    // Garder le selling_price original pour référence
    original_selling_price: item.selling_price,
    notes: `Importé de soumission ${selectedSubmissionForImport.submission_number}`,
  }));

  // Ajouter aux items déjà sélectionnés (éviter les doublons)
  const existingProductIds = selectedItems.map(item => item.product_id);
  const filteredExisting = selectedItems.filter(item => 
    !existingProductIds.includes(item.product_id)
  );
  
  setSelectedItems([...filteredExisting, ...importedItems]);
  
  // Mettre à jour le formulaire avec la liaison à la soumission
  setPurchaseForm(prev => ({
    ...prev,
    linked_submission_id: selectedSubmissionForImport.id,
    notes: prev.notes + 
      `\nImporté depuis soumission ${selectedSubmissionForImport.submission_number} - ${selectedSubmissionForImport.client_name}`
  }));

  // Fermer le modal
  setShowImportSubmissionModal(false);
  setSelectedSubmissionForImport(null);
  setItemsToImport([]);
  
  alert(`${importedItems.length} item(s) importé(s) depuis la soumission ${selectedSubmissionForImport.submission_number}`);
};

// ============= MODIFICATION DU FORMULAIRE PRINCIPAL =============

// Dans la section "Recherche produits", APRÈS le bouton "Nouveau fournisseur", ajouter :

<button
  type="button"
  onClick={() => {
    fetchAvailableSubmissions();
    setShowImportSubmissionModal(true);
  }}
  className="w-full sm:w-auto px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium flex items-center justify-center"
>
  <Upload className="w-4 h-4 mr-2" />
  Importer depuis Soumission
</button>

// ============= MODAL D'IMPORT À AJOUTER AVANT LA FERMETURE DU COMPONENT =============

{/* Modal Import Soumission */}
{showImportSubmissionModal && (
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
            onClick={() => {
              setShowImportSubmissionModal(false);
              setSelectedSubmissionForImport(null);
              setItemsToImport([]);
            }}
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
              <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
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
              <p className="text-blue-700 text-xs mt-1">
                Les prix de coût de la soumission deviendront les prix de coût de l'achat. Les prix de vente sont conservés pour référence.
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
                      setItemsToImport(items => items.map(item => ({ ...item, selected: true })));
                    }}
                    className="px-4 py-2 bg-green-100 text-green-800 rounded-lg hover:bg-green-200 text-sm"
                  >
                    Tout sélectionner
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setItemsToImport(items => items.map(item => ({ ...item, selected: false })));
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
                        <th className="text-right p-3 font-semibold">Prix Vente (Réf)</th>
                        <th className="text-right p-3 font-semibold">Total Coût</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemsToImport.map((item, index) => (
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
                          <td className="p-3 text-right font-medium text-blue-600">
                            {formatCurrency(item.selling_price || 0)}
                          </td>
                          <td className="p-3 text-right font-bold">
                            {formatCurrency((item.cost_price || 0) * (item.importQuantity || 0))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan="7" className="p-3 text-right font-semibold">
                          Total Coût Sélectionné:
                        </td>
                        <td className="p-3 text-right font-bold text-green-600">
                          {formatCurrency(
                            itemsToImport
                              .filter(item => item.selected)
                              .reduce((sum, item) => sum + (item.cost_price || 0) * (item.importQuantity || 0), 0)
                          )}
                        </td>
                      </tr>
                    </tfoot>
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
                      onClick={() => {
                        setShowImportSubmissionModal(false);
                        setSelectedSubmissionForImport(null);
                        setItemsToImport([]);
                      }}
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
)}

// ============= MODIFICATION DU FORMULAIRE ACHAT (handlePurchaseSubmit) =============

// Dans la fonction handlePurchaseSubmit, modifier purchaseData pour inclure:
const purchaseData = {
  supplier_id: purchaseForm.supplier_id,
  supplier_name: purchaseForm.supplier_name,
  linked_po_id: purchaseForm.linked_po_id || null,
  linked_po_number: purchaseForm.linked_po_number,
  linked_submission_id: purchaseForm.linked_submission_id || null, // NOUVEAU CHAMP
  shipping_address_id: purchaseForm.shipping_address_id,
  shipping_company: purchaseForm.shipping_company,
  shipping_account: purchaseForm.shipping_account,
  delivery_date: purchaseForm.delivery_date || (() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  })(),
  items: selectedItems,
  subtotal: purchaseForm.subtotal,
  tps: purchaseForm.tps,
  tvq: purchaseForm.tvq,
  shipping_cost: parseFloat(purchaseForm.shipping_cost || 0),
  total_amount: purchaseForm.total_amount,
  status: purchaseForm.status,
  notes: purchaseForm.notes,
  purchase_number: purchaseNumber
};

// ============= SCRIPT SQL À EXÉCUTER =============
-- Ajouter la colonne avec le bon type (bigint pour correspondre à submissions.id)
ALTER TABLE supplier_purchases 
ADD COLUMN linked_submission_id bigint REFERENCES submissions(id);

// ============= MODIFICATION DU FORMULAIRE PRINCIPAL (resetForm) =============

// Dans resetForm, ajouter:
setPurchaseForm({
  supplier_id: '',
  supplier_name: '',
  linked_po_id: '',
  linked_po_number: '',
  linked_submission_id: null, // NOUVEAU CHAMP (null au lieu de string vide)
  shipping_address_id: '',
  shipping_company: '',
  shipping_account: '',
  delivery_date: '',
  items: [],
  subtotal: 0,
  tps: 0,
  tvq: 0,
  shipping_cost: 0,
  total_amount: 0,
  status: 'draft',
  notes: '',
  purchase_number: ''
});
