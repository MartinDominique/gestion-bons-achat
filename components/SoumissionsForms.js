import { Search, Plus, Printer, X, MessageSquare, DollarSign, Calculator, MoreVertical, Edit, Trash2 } from 'lucide-react';
import { useSoumissions } from './SoumissionsHooks';
import * as API from './SoumissionsServices';

// ===== COMPOSANT PRINCIPAL FORMULAIRE =====
export function SoumissionForm() {
  const {
    // États
    clients,
    submissionForm,
    setSubmissionForm,
    selectedItems,
    calculatedCostTotal,
    sendingEmail,
    emailSent,
    emailError,
    uploadingFiles,
    
    // Handlers
    handleSubmissionSubmit,
    handleCloseForm,
    handlePrint,
    handlePrintClient,
    handleSendSubmissionEmail,
    handleFileUpload,
    removeFile
  } = useSoumissions();

  return (
    <>
      {/* CSS D'IMPRESSION - GARDER EXACTEMENT */}
      <style>
        {`
        /* CSS d'impression pour tableau horizontal */
        @media print {
          @page {
            size: letter;
            margin: 0.5in;
          }
          
          body * {
            visibility: hidden;
          }
          
          /* Version client - sans coûts */
          body.print-client .print-area-client,
          body.print-client .print-area-client * {
            visibility: visible !important;
          }
          
          /* Version complète - avec coûts */
          body:not(.print-client) .print-area,
          body:not(.print-client) .print-area * {
            visibility: visible !important;
          }
          
          .print-area,
          .print-area-client {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white;
            padding: 20px;
            font-size: 12px;
            font-family: Arial, sans-serif;
          }
          
          /* Header professionnel */
          .print-header {
            display: flex !important;
            justify-content: space-between !important;
            align-items: flex-start !important;
            margin-bottom: 30px;
            padding-bottom: 15px;
            border-bottom: 2px solid #333;
          }
          
          .print-company-info {
            flex: 1;
            font-size: 11px;
            line-height: 1.4;
          }
          
          .print-submission-header {
            text-align: right;
          }
          
          .print-submission-header h1 {
            font-size: 20px;
            margin: 0 0 5px 0;
            font-weight: bold;
          }
          
          /* Client info */
          .print-client-info {
            margin: 20px 0;
            padding: 15px;
            border: 1px solid #ddd;
            background-color: #f9f9f9;
          }
          
          /* Tableau horizontal */
          .print-table {
            width: 100% !important;
            border-collapse: collapse !important;
            margin: 20px 0 !important;
            table-layout: fixed !important;
            display: table !important;
          }
          
          .print-table thead {
            display: table-header-group !important;
          }
          
          .print-table tbody {
            display: table-row-group !important;
          }
          
          .print-table tr {
            display: table-row !important;
            page-break-inside: avoid;
          }
          
          .print-table th,
          .print-table td {
            display: table-cell !important;
            border: 1px solid #333 !important;
            padding: 8px !important;
            text-align: left !important;
            font-size: 10px !important;
            vertical-align: top !important;
            word-wrap: break-word !important;
          }
          
          .print-table th {
            background-color: #f0f0f0 !important;
            font-weight: bold !important;
            text-align: center !important;
          }
          
          /* Largeurs des colonnes pour version COMPLÈTE */
          .print-table.complete th:nth-child(1),
          .print-table.complete td:nth-child(1) { width: 12% !important; }
          .print-table.complete th:nth-child(2),
          .print-table.complete td:nth-child(2) { width: 28% !important; }
          .print-table.complete th:nth-child(3),
          .print-table.complete td:nth-child(3) { width: 8% !important; text-align: center !important; }
          .print-table.complete th:nth-child(4),
          .print-table.complete td:nth-child(4) { width: 8% !important; text-align: center !important; }
          .print-table.complete th:nth-child(5),
          .print-table.complete td:nth-child(5) { width: 12% !important; text-align: right !important; }
          .print-table.complete th:nth-child(6),
          .print-table.complete td:nth-child(6) { width: 12% !important; text-align: right !important; }
          .print-table.complete th:nth-child(7),
          .print-table.complete td:nth-child(7) { width: 10% !important; text-align: right !important; }
          .print-table.complete th:nth-child(8),
          .print-table.complete td:nth-child(8) { width: 10% !important; text-align: right !important; }
          
          /* Largeurs des colonnes pour version CLIENT */
          .print-table.client th:nth-child(1),
          .print-table.client td:nth-child(1) { width: 15% !important; }
          .print-table.client th:nth-child(2),
          .print-table.client td:nth-child(2) { width: 45% !important; }
          .print-table.client th:nth-child(3),
          .print-table.client td:nth-child(3) { width: 10% !important; text-align: center !important; }
          .print-table.client th:nth-child(4),
          .print-table.client td:nth-child(4) { width: 10% !important; text-align: center !important; }
          .print-table.client th:nth-child(5),
          .print-table.client td:nth-child(5) { width: 10% !important; text-align: right !important; }
          .print-table.client th:nth-child(6),
          .print-table.client td:nth-child(6) { width: 10% !important; text-align: right !important; }
          
          /* Totaux */
          .print-totals {
            margin-top: 30px;
            text-align: right;
            page-break-inside: avoid;
          }
          
          .print-totals p {
            font-size: 14px;
            font-weight: bold;
            margin: 8px 0;
          }
          
          /* Commentaires */
          .print-comment {
            font-style: italic;
            color: #666;
            font-size: 9px;
            margin-top: 3px;
          }
          
          .no-print {
            display: none !important;
          }
        }
        @media screen {
          .print-area,
          .print-area-client {
            display: none;
          }
        }
        `}
      </style>

      <div className="max-w-6xl mx-auto p-4">
        
        {/* TEMPLATES D'IMPRESSION - VERSION COMPLÈTE */}
        {selectedItems.length > 0 && (
          <div className="print-area">
            <PrintHeader />
            <PrintClientInfo />
            <PrintTableComplete />
            <PrintTotalsComplete />
          </div>
        )}

        {/* TEMPLATES D'IMPRESSION - VERSION CLIENT */}
        {selectedItems.length > 0 && (
          <div className="print-area-client">
            <PrintHeader />
            <PrintClientInfo />
            <PrintTableClient />
            <PrintTotalsClient />
          </div>
        )}

        {/* FORMULAIRE PRINCIPAL */}
        <div className="bg-white rounded-xl shadow-lg border border-purple-200 overflow-hidden">
          
          {/* Header du formulaire */}
          <FormHeader />
          
          {/* Contenu du formulaire */}
          <div className="p-4 sm:p-6 no-print">
            <form id="submission-form" onSubmit={handleSubmissionSubmit} className="space-y-6">
              
              {/* Client et Description */}
              <ClientDescriptionSection />

              {/* Statut (si édition) */}
              <StatusSection />

              {/* Recherche produits */}
              <ProductSearchSection />

              {/* Items sélectionnés */}
              <SelectedItemsSection />

              {/* Notifications email */}
              <EmailNotifications />

              {/* Section Documents */}
              <DocumentsSection />

              {/* Totaux */}
              <TotalsSection />

              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-center">
                <p className="text-gray-600 text-sm">
                  📋 {selectedItems.length} produit(s) sélectionné(s) • 
                  Utilisez les boutons dans la barre violette ci-dessus pour sauvegarder
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* MODALS */}
      <QuantityModal />
      <CommentModal />
      <QuickAddProductModal />
    </>
  );
}

// ===== SOUS-COMPOSANTS D'IMPRESSION =====
function PrintHeader() {
  const { submissionForm } = useSoumissions();
  
  return (
    <div className="print-header">
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <img src="/logo.png" alt="Logo" style={{ width: '180px', marginRight: '20px' }} />
        <div className="print-company-info">
          <strong>Services TMT Inc.</strong><br />
          195, 42e Rue Nord<br />
          Saint-Georges, QC G5Z 0V9<br />
          Tél: (418) 225-3875<br />
          info.servicestmt@gmail.com
        </div>
      </div>
      <div className="print-submission-header">
        <h1>SOUMISSION</h1>
        <p><strong>N°:</strong> {submissionForm.submission_number}</p>
        <p><strong>Date:</strong> {new Date().toLocaleDateString('fr-CA')}</p>
      </div>
    </div>
  );
}

function PrintClientInfo() {
  const { submissionForm } = useSoumissions();
  
  return (
    <div className="print-client-info">
      <strong>CLIENT:</strong> {submissionForm.client_name}<br />
      <strong>DESCRIPTION:</strong> {submissionForm.description}
    </div>
  );
}

function PrintTableComplete() {
  const { selectedItems } = useSoumissions();
  
  return (
    <table className="print-table complete">
      <thead>
        <tr>
          <th>Code</th>
          <th>Description</th>
          <th>Qté</th>
          <th>Unité</th>
          <th>Prix Unit.</th>
          <th>Coût Unit.</th>
          <th>Total Vente</th>
          <th>Total Coût</th>
        </tr>
      </thead>
      <tbody>
        {selectedItems.map((item, index) => (
          <tr key={item.product_id}>
            <td>{item.product_id}</td>
            <td>
              {item.description}
              {item.comment && (
                <div className="print-comment">💬 {item.comment}</div>
              )}
            </td>
            <td style={{ textAlign: 'center' }}>{item.quantity}</td>
            <td style={{ textAlign: 'center' }}>{item.unit}</td>
            <td style={{ textAlign: 'right' }}>{API.formatCurrency(item.selling_price)}</td>
            <td style={{ textAlign: 'right' }}>{API.formatCurrency(item.cost_price)}</td>
            <td style={{ textAlign: 'right' }}>{API.formatCurrency(item.selling_price * item.quantity)}</td>
            <td style={{ textAlign: 'right' }}>{API.formatCurrency(item.cost_price * item.quantity)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PrintTableClient() {
  const { selectedItems } = useSoumissions();
  
  return (
    <table className="print-table client">
      <thead>
        <tr>
          <th>Code</th>
          <th>Description</th>
          <th>Qté</th>
          <th>Unité</th>
          <th>Prix Unit.</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {selectedItems.map((item, index) => (
          <tr key={item.product_id}>
            <td>{item.product_id}</td>
            <td>
              {item.description}
              {item.comment && (
                <div className="print-comment">💬 {item.comment}</div>
              )}
            </td>
            <td style={{ textAlign: 'center' }}>{item.quantity}</td>
            <td style={{ textAlign: 'center' }}>{item.unit}</td>
            <td style={{ textAlign: 'right' }}>{API.formatCurrency(item.selling_price)}</td>
            <td style={{ textAlign: 'right' }}>{API.formatCurrency(item.selling_price * item.quantity)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PrintTotalsComplete() {
  const { submissionForm, calculatedCostTotal } = useSoumissions();
  
  return (
    <div className="print-totals">
      <p>TOTAL VENTE: {API.formatCurrency(submissionForm.amount)}</p>
      <p>TOTAL COÛT: {API.formatCurrency(calculatedCostTotal)}</p>
      <p style={{ color: '#2563eb' }}>
        MARGE: {API.formatCurrency(submissionForm.amount - calculatedCostTotal)}
        {submissionForm.amount > 0 && calculatedCostTotal > 0 && (
          <span style={{ fontSize: '12px' }}>
            {" "}({((submissionForm.amount - calculatedCostTotal) / submissionForm.amount * 100).toFixed(1)}%)
          </span>
        )}
      </p>
    </div>
  );
}

function PrintTotalsClient() {
  const { submissionForm } = useSoumissions();
  
  return (
    <div className="print-totals">
      <p style={{ fontSize: '16px' }}>TOTAL: {API.formatCurrency(submissionForm.amount)}</p>
    </div>
  );
}

// ===== SOUS-COMPOSANTS FORMULAIRE =====
function FormHeader() {
  const {
    submissionForm,
    editingSubmission,
    selectedItems,
    sendingEmail,
    handlePrint,
    handlePrintClient,
    handleSendSubmissionEmail,
    handleCloseForm
  } = useSoumissions();

  return (
    <div className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white p-4 sm:p-6 no-print">
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
        
        {/* Boutons d'action responsive */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <button
            onClick={handlePrint}
            className="w-full sm:w-auto px-4 py-2 bg-white/20 rounded-lg hover:bg-white/30 text-sm font-medium"
          >
            🖨️ Imprimer
          </button>
          <button
            onClick={handlePrintClient}
            className="w-full sm:w-auto px-4 py-2 bg-green-500/20 rounded-lg hover:bg-green-500/30 text-sm font-medium"
          >
            <Printer className="w-4 h-4 inline mr-1" />
            Impression Client
          </button>
          
          {/* Bouton Envoyer Email */}
          <button
            onClick={handleSendSubmissionEmail}
            disabled={sendingEmail || selectedItems.length === 0 || !submissionForm.client_name}
            className={`w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center ${
              sendingEmail 
                ? 'bg-gray-400 cursor-not-allowed' 
                : selectedItems.length === 0 || !submissionForm.client_name
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-500/20 hover:bg-blue-500/30 text-white'
            }`}
            title={
              !submissionForm.client_name 
                ? 'Sélectionnez un client d\'abord'
                : selectedItems.length === 0 
                ? 'Ajoutez des produits d\'abord'
                : 'Envoyer la soumission par email au client'
            }
          >
            {sendingEmail ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Envoi...
              </>
            ) : (
              <>📧 Envoyer Email</>
            )}
          </button>
          
          <button
            type="button"
            onClick={handleCloseForm}
            className="w-full sm:w-auto px-4 py-2 bg-white/10 border border-white/20 rounded-lg hover:bg-white/20 text-sm font-medium"
          >
            ❌ Annuler
          </button>
          <button
            type="submit"
            form="submission-form"
            className="w-full sm:w-auto px-4 py-2 bg-white text-purple-600 rounded-lg hover:bg-gray-50 font-medium text-sm"
          >
            {editingSubmission ? '💾 Mettre à jour' : '✨ Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ClientDescriptionSection() {
  const { clients, submissionForm, setSubmissionForm } = useSoumissions();

  return (
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
  );
}

function StatusSection() {
  const { editingSubmission, submissionForm, setSubmissionForm } = useSoumissions();

  if (!editingSubmission) return null;

  return (
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
  );
}

function ProductSearchSection() {
  return <ProductSearch />;
}

function SelectedItemsSection() {
  return <SelectedItemsTable />;
}

function EmailNotifications() {
  const { emailSent, emailError, clients, submissionForm } = useSoumissions();

  return (
    <>
      {emailSent && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative">
          <div className="flex items-center">
            <span className="text-green-500 mr-2">✅</span>
            <span className="font-medium">Email envoyé avec succès !</span>
          </div>
          <p className="text-sm mt-1">
            La soumission a été envoyée à {clients.find(c => c.name === submissionForm.client_name)?.email}
          </p>
        </div>
      )}
      
      {emailError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
          <div className="flex items-center">
            <span className="text-red-500 mr-2">❌</span>
            <span className="font-medium">Erreur d'envoi</span>
          </div>
          <p className="text-sm mt-1">{emailError}</p>
        </div>
      )}
    </>
  );
}

function DocumentsSection() {
  const { submissionForm, uploadingFiles, handleFileUpload, removeFile } = useSoumissions();

  return (
    <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
      <label className="block text-sm font-semibold text-purple-800 mb-2">
        📎 Documents (PDF, XLS, DOC, etc.)
      </label>
      
      <div className="mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="file"
            multiple
            accept={API.FILE_CONFIG.ALLOWED_TYPES}
            onChange={handleFileUpload}
            disabled={uploadingFiles}
            className="block w-full text-sm text-purple-600 file:mr-4 file:py-3 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700 disabled:opacity-50"
          />
        </div>
        {uploadingFiles && (
          <p className="text-sm text-purple-600 mt-2 flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600 mr-2"></div>
            📤 Upload en cours... Veuillez patienter.
          </p>
        )}
      </div>

      {submissionForm.files && submissionForm.files.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-purple-700">
            📁 Documents joints ({submissionForm.files.length})
          </p>
          <div className="space-y-2">
            {submissionForm.files.map((file, index) => (
              <FileItem key={index} file={file} index={index} onRemove={removeFile} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FileItem({ file, index, onRemove }) {
  const openFile = (file) => {
    if (file.url) {
      window.open(file.url, '_blank');
    } else {
      alert('Fichier non accessible - URL manquante');
    }
  };

  const downloadFile = async (file) => {
    if (!file.url) {
      alert('Impossible de télécharger - URL manquante');
      return;
    }

    try {
      const response = await fetch(file.url);
      const blob = await response.blob();
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Erreur téléchargement:', error);
      alert('Erreur lors du téléchargement');
    }
  };

  return (
    <div className="bg-white p-3 rounded border border-purple-200 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <span className="text-xl flex-shrink-0">{API.getFileIcon(file.type)}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {file.name}
            </p>
            <p className="text-xs text-gray-500">
              {API.formatFileSize(file.size)} • {file.type}
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2 sm:flex-nowrap">
          {file.url ? (
            <>
              <button
                type="button"
                onClick={() => openFile(file)}
                className="flex-1 sm:flex-none px-3 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded border border-blue-300 transition-colors"
                title="Ouvrir le fichier"
              >
                👁️ Voir
              </button>
              <button
                type="button"
                onClick={() => downloadFile(file)}
                className="flex-1 sm:flex-none px-3 py-1 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded border border-green-300 transition-colors"
                title="Télécharger le fichier"
              >
                💾 Télécharger
              </button>
            </>
          ) : (
            <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded">
              📄 En cours...
            </span>
          )}
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="flex-1 sm:flex-none px-3 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded border border-red-300 transition-colors"
            title="Supprimer le fichier"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}

function TotalsSection() {
  const { submissionForm, calculatedCostTotal } = useSoumissions();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="bg-green-100 p-4 rounded-lg border border-green-300">
        <label className="block text-base sm:text-lg font-semibold text-green-800 mb-2">
          💰 Total Vente
        </label>
        <div className="text-xl sm:text-2xl font-bold text-green-900">
          {API.formatCurrency(submissionForm.amount)}
        </div>
      </div>
      
      <div className="bg-orange-100 p-4 rounded-lg border border-orange-300">
        <label className="block text-base sm:text-lg font-semibold text-orange-800 mb-2">
          🏷️ Total Coût
        </label>
        <div className="text-xl sm:text-2xl font-bold text-orange-900">
          {API.formatCurrency(calculatedCostTotal)}
        </div>
      </div>

      <div className="bg-blue-100 p-4 rounded-lg border border-blue-300">
        <label className="block text-base sm:text-lg font-semibold text-blue-800 mb-2">
          📈 Marge
        </label>
        <div className="text-xl sm:text-2xl font-bold text-blue-900">
          {API.formatCurrency(submissionForm.amount - calculatedCostTotal)}
        </div>
        {submissionForm.amount > 0 && calculatedCostTotal > 0 && (
          <div className="text-sm text-blue-700">
            {((submissionForm.amount - calculatedCostTotal) / submissionForm.amount * 100).toFixed(1)}%
          </div>
        )}
      </div>
    </div>
  );
}

// ===== COMPOSANTS RECHERCHE PRODUITS =====
export function ProductSearch() {
  const {
    products,
    productSearchTerm,
    setProductSearchTerm,
    searchingProducts,
    focusedProductIndex,
    setFocusedProductIndex,
    selectProductForQuantity,
    setShowQuickAddProduct,
    handleProductKeyDown
  } = useSoumissions();

  return (
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
              placeholder={`Rechercher un produit - minimum ${API.SEARCH_CONFIG.MIN_SEARCH_LENGTH} caractères...`}
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
      <ProductSearchResults />
    </div>
  );
}

function ProductSearchResults() {
  const {
    productSearchTerm,
    searchingProducts,
    products,
    focusedProductIndex,
    selectProductForQuantity
  } = useSoumissions();

  if (searchingProducts) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mr-2"></div>
        <span className="text-indigo-600">Recherche en cours...</span>
      </div>
    );
  }

  if (productSearchTerm && productSearchTerm.length < API.SEARCH_CONFIG.MIN_SEARCH_LENGTH) {
    return (
      <div className="p-4 text-center text-gray-500 border border-gray-200 rounded-lg">
        Tapez au moins {API.SEARCH_CONFIG.MIN_SEARCH_LENGTH} caractères pour rechercher dans les 6718 produits
      </div>
    );
  }

  if (productSearchTerm.length >= API.SEARCH_CONFIG.MIN_SEARCH_LENGTH) {
    return (
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
              {products.length} résultat(s) trouvé(s) {products.length === API.SEARCH_CONFIG.MAX_RESULTS ? `(${API.SEARCH_CONFIG.MAX_RESULTS} max affichés)` : ''}
            </div>
            {products.map((product, index) => (
              <ProductSearchItem
                key={product.product_id}
                product={product}
                index={index}
                isFocused={index === focusedProductIndex}
                onSelect={() => selectProductForQuantity(product)}
              />
            ))}
          </>
        )}
      </div>
    );
  }

  return null;
}

function ProductSearchItem({ product, index, isFocused, onSelect }) {
  return (
    <div 
      data-product-index={index}
      className={`p-3 border-b border-indigo-100 hover:bg-indigo-50 cursor-pointer ${
        isFocused ? 'bg-indigo-100 border-indigo-300' : ''
      }`}
      onClick={onSelect}
    >
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
        <div className="flex-1">
          <h4 className="font-medium text-gray-900 text-sm">
            {product.product_id} - {product.description}
            {product.is_non_inventory && (
              <span className="ml-2 bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs font-medium">
                🏷️ Service
              </span>
            )}
          </h4>
          <div className="text-xs text-gray-500 space-y-1 sm:space-y-0 sm:space-x-4 sm:flex">
            <span>📦 Groupe: {product.product_group}</span>
            <span>📏 Unité: {product.unit}</span>
            <span>📊 Stock: {product.stock_qty}</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:space-x-4 text-xs mt-1">
            <span className="text-indigo-600 font-medium">
              💰 Vente: {API.formatCurrency(product.selling_price)}
            </span>
            <span className="text-orange-600 font-medium">
              🏷️ Coût: {API.formatCurrency(product.cost_price)}
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
  );
}

// ===== COMPOSANT TABLEAU ITEMS SÉLECTIONNÉS =====
export function SelectedItemsTable() {
  const { selectedItems, openCommentModal, updateItemQuantity, updateItemPrice, removeItemFromSubmission } = useSoumissions();

  if (selectedItems.length === 0) return null;

  return (
    <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
      <h3 className="text-base sm:text-lg font-semibold text-yellow-800 mb-4">
        📦 Produits Sélectionnés ({selectedItems.length})
      </h3>
      
      {/* Tableau desktop */}
      <DesktopItemsTable />
      
      {/* Cards mobile */}
      <MobileItemsCards />
      
      <ItemsSummary />
    </div>
  );
}

function DesktopItemsTable() {
  const { selectedItems, openCommentModal, updateItemQuantity, updateItemPrice, removeItemFromSubmission } = useSoumissions();

  return (
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
            <th className="text-center p-2 font-semibold">💬</th>
            <th className="text-center p-2 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {[...selectedItems].reverse().map((item, reverseIndex) => (
            <DesktopItemRow
              key={item.product_id}
              item={item}
              onOpenComment={() => openCommentModal(item)}
              onUpdateQuantity={(qty) => updateItemQuantity(item.product_id, qty)}
              onUpdatePrice={(field, price) => updateItemPrice(item.product_id, field, price)}
              onRemove={() => removeItemFromSubmission(item.product_id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DesktopItemRow({ item, onOpenComment, onUpdateQuantity, onUpdatePrice, onRemove }) {
  return (
    <tr className="border-b border-yellow-100 hover:bg-yellow-50">
      <td className="p-2 font-mono text-xs">{item.product_id}</td>
      <td className="p-2">
        <div className="max-w-xs">
          <div className="font-medium text-gray-900 truncate">{item.description}</div>
          <div className="text-xs text-gray-500">{item.product_group} • {item.unit}</div>
          {item.comment && (
            <div className="text-xs text-blue-600 italic mt-1 truncate">
              💬 {item.comment}
            </div>
          )}
        </div>
      </td>
      <td className="p-2 text-center">
        <input
          type="number"
          step="0.1"
          min="0.1"
          value={item.quantity}
          onChange={(e) => {
            const value = e.target.value;
            if (value === '' || parseFloat(value) >= 0) {
              onUpdateQuantity(value);
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
          onChange={(e) => onUpdatePrice('selling_price', e.target.value)}
          className="w-20 text-right rounded border-green-300 text-sm focus:border-green-500 focus:ring-green-500"
        />
      </td>
      <td className="p-2 text-right">
        <input
          type="number"
          step="0.01"
          min="0"
          value={item.cost_price}
          onChange={(e) => onUpdatePrice('cost_price', e.target.value)}
          className="w-20 text-right rounded border-orange-300 text-sm focus:border-orange-500 focus:ring-orange-500"
        />
      </td>
      <td className="p-2 text-right font-medium text-green-700">
        {API.formatCurrency(item.selling_price * item.quantity)}
      </td>
      <td className="p-2 text-right font-medium text-orange-700">
        {API.formatCurrency(item.cost_price * item.quantity)}
      </td>
      <td className="p-2 text-center">
        <button
          type="button"
          onClick={onOpenComment}
          className={`px-2 py-1 rounded text-xs ${
            item.comment 
              ? 'bg-blue-100 text-blue-800 hover:bg-blue-200' 
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          title={item.comment ? 'Modifier commentaire' : 'Ajouter commentaire'}
        >
          <MessageSquare className="w-3 h-3" />
        </button>
      </td>
      <td className="p-2 text-center">
        <button
          type="button"
          onClick={onRemove}
          className="px-2 py-1 bg-red-100 text-red-800 rounded hover:bg-red-200 text-xs"
          title="Supprimer"
        >
          ❌
        </button>
      </td>
    </tr>
  );
}

function MobileItemsCards() {
  const { selectedItems, openCommentModal, updateItemQuantity, updateItemPrice, removeItemFromSubmission } = useSoumissions();

  return (
    <div className="sm:hidden space-y-3">
      {[...selectedItems].reverse().map((item) => (
        <MobileItemCard
          key={item.product_id}
          item={item}
          onOpenComment={() => openCommentModal(item)}
          onUpdateQuantity={(qty) => updateItemQuantity(item.product_id, qty)}
          onUpdatePrice={(field, price) => updateItemPrice(item.product_id, field, price)}
          onRemove={() => removeItemFromSubmission(item.product_id)}
        />
      ))}
    </div>
  );
}

function MobileItemCard({ item, onOpenComment, onUpdateQuantity, onUpdatePrice, onRemove }) {
  return (
    <div className="bg-white p-3 rounded-lg border border-yellow-200">
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          <h4 className="font-medium text-gray-900 text-sm">{item.product_id}</h4>
          <p className="text-xs text-gray-600">{item.description}</p>
          <p className="text-xs text-gray-500">{item.product_group} • {item.unit}</p>
          {item.comment && (
            <p className="text-xs text-blue-600 italic mt-1">💬 {item.comment}</p>
          )}
        </div>
        <div className="flex gap-1 ml-2">
          <button
            type="button"
            onClick={onOpenComment}
            className={`p-1 rounded ${
              item.comment 
                ? 'bg-blue-100 text-blue-800 hover:bg-blue-200' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            title={item.comment ? 'Modifier commentaire' : 'Ajouter commentaire'}
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="p-1 bg-red-100 text-red-800 rounded hover:bg-red-200"
            title="Supprimer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Quantité</label>
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={item.quantity}
            onChange={(e) => {
              const value = e.target.value;
              if (value === '' || parseFloat(value) >= 0) {
                onUpdateQuantity(value);
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
            onChange={(e) => onUpdatePrice('selling_price', e.target.value)}
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
            onChange={(e) => onUpdatePrice('cost_price', e.target.value)}
            className="w-full text-right rounded border-orange-300 text-sm focus:border-orange-500 focus:ring-orange-500 p-2"
          />
        </div>
      </div>
      
      <div className="mt-2 pt-2 border-t border-gray-200 flex justify-between text-sm">
        <span className="text-green-700 font-medium">
          Total vente: {API.formatCurrency(item.selling_price * item.quantity)}
        </span>
        <span className="text-orange-700 font-medium">
          Total coût: {API.formatCurrency(item.cost_price * item.quantity)}
        </span>
      </div>
    </div>
  );
}

function ItemsSummary() {
  const { selectedItems, submissionForm, calculatedCostTotal } = useSoumissions();

  return (
    <div className="mt-3 space-y-2">
      <div className="flex justify-between items-center text-sm">
        <span className="text-yellow-700">
          📊 {selectedItems.length} article(s) • 
          Total quantité: {selectedItems.reduce((sum, item) => sum + parseFloat(item.quantity), 0).toFixed(1)} unités
        </span>
        <div className="flex flex-col sm:flex-row sm:space-x-4">
          <span className="text-green-700 font-medium">
            💰 {API.formatCurrency(submissionForm.amount)}
          </span>
          <span className="text-orange-700 font-medium">
            🏷️ {API.formatCurrency(calculatedCostTotal)}
          </span>
        </div>
      </div>
      <div className="text-xs text-yellow-600 bg-yellow-200 p-2 rounded">
        💡 Utilisez ↑↓ pour naviguer, quantités décimales (0.1), prix modifiables, 💬 commentaires, 💱 USD→CAD, +15/20/25% profit
      </div>
    </div>
  );
}

// ===== MODALS =====
export function QuantityModal() {
  const {
    showQuantityInput,
    selectedProductForQuantity,
    tempQuantity,
    setTempQuantity,
    addItemToSubmission,
    closeQuantityModal,
    resetProductSearch,
    handleQuantityKeyDown
  } = useSoumissions();

  if (!showQuantityInput || !selectedProductForQuantity) return null;

  const handleAddItem = () => {
    if (tempQuantity && parseFloat(tempQuantity) > 0) {
      addItemToSubmission(selectedProductForQuantity, parseFloat(tempQuantity));
      closeQuantityModal();
      resetProductSearch();
    }
  };

  return (
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
                step="0.1"
                min="0.1"
                value={tempQuantity}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '' || parseFloat(value) >= 0) {
                    setTempQuantity(value);
                  }
                }}
                onKeyDown={handleQuantityKeyDown}
                onFocus={(e) => e.target.select()}
                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3"
                autoFocus
              />
            </div>
            <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
              <p>Prix vente: {API.formatCurrency(selectedProductForQuantity.selling_price)} / {selectedProductForQuantity.unit}</p>
              <p>Prix coût: {API.formatCurrency(selectedProductForQuantity.cost_price)} / {selectedProductForQuantity.unit}</p>
              <p className="font-medium text-green-700 mt-2">
                Total vente: {API.formatCurrency(selectedProductForQuantity.selling_price * parseFloat(tempQuantity || 0))}
              </p>
              <p className="font-medium text-orange-700">
                Total coût: {API.formatCurrency(selectedProductForQuantity.cost_price * parseFloat(tempQuantity || 0))}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={closeQuantityModal}
                className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleAddItem}
                className="w-full sm:flex-1 px-4 py-2 border border-transparent rounded-lg text-white bg-blue-600 hover:bg-blue-700"
              >
                Ajouter
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CommentModal() {
  const {
    showCommentModal,
    editingCommentItem,
    tempComment,
    setTempComment,
    saveComment,
    closeCommentModal
  } = useSoumissions();

  if (!showCommentModal || !editingCommentItem) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md">
        <div className="p-4 sm:p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <MessageSquare className="w-5 h-5 mr-2 text-blue-600" />
            Commentaire pour: {editingCommentItem.description}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Commentaire (optionnel)
              </label>
              <textarea
                value={tempComment}
                onChange={(e) => setTempComment(e.target.value)}
                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base p-3 h-24 resize-none"
                placeholder="Ajouter un commentaire pour ce produit..."
              />
              <p className="text-xs text-gray-500 mt-1">
                Ce commentaire apparaîtra sur la soumission imprimée
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={closeCommentModal}
                className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={saveComment}
                className="w-full sm:flex-1 px-4 py-2 border border-transparent rounded-lg text-white bg-blue-600 hover:bg-blue-700"
              >
                💾 Enregistrer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function QuickAddProductModal() {
  const {
    showQuickAddProduct,
    quickProductForm,
    setQuickProductForm,
    showUsdCalculator,
    setShowUsdCalculator,
    usdAmount,
    setUsdAmount,
    usdToCadRate,
    loadingExchangeRate,
    exchangeRateError,
    addNonInventoryProduct,
    closeQuickAddModal,
    applyProfitMargin,
    useConvertedAmount,
    loadExchangeRate
  } = useSoumissions();

  if (!showQuickAddProduct) return null;

  return (
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
                {API.DEFAULT_UNITS.map(unit => (
                  <option key={unit} value={unit}>{unit}</option>
                ))}
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
            
            {/* PRIX COÛT AVEC CALCULATEUR USD */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Prix Coût CAD *</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={quickProductForm.cost_price}
                  onChange={(e) => setQuickProductForm({...quickProductForm, cost_price: e.target.value})}
                  className="flex-1 rounded-lg border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 text-base p-3"
                  placeholder="0.00"
                  required
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowUsdCalculator(!showUsdCalculator);
                    if (!showUsdCalculator) {
                      loadExchangeRate();
                    }
                  }}
                  className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm font-medium flex items-center"
                  title="Convertir USD → CAD"
                >
                  <DollarSign className="w-4 h-4 mr-1" />
                  USD
                </button>
              </div>

              {/* MINI-CALCULATEUR USD INLINE */}
              {showUsdCalculator && (
                <UsdCalculatorInline
                  usdAmount={usdAmount}
                  setUsdAmount={setUsdAmount}
                  usdToCadRate={usdToCadRate}
                  loadingExchangeRate={loadingExchangeRate}
                  exchangeRateError={exchangeRateError}
                  onUseAmount={useConvertedAmount}
                  onClose={() => setShowUsdCalculator(false)}
                  onRefresh={loadExchangeRate}
                />
              )}
            </div>

            {/* PRIX VENTE AVEC BOUTONS DE PROFIT */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Prix Vente CAD *</label>
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
              
              {/* BOUTONS DE PROFIT */}
              {quickProductForm.cost_price && parseFloat(quickProductForm.cost_price) > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-gray-600 mb-2">Profit automatique:</p>
                  <div className="flex gap-1">
                    {API.PROFIT_MARGINS.map(margin => (
                      <button
                        key={margin.value}
                        type="button"
                        onClick={() => applyProfitMargin(margin.value)}
                        className={`flex-1 px-2 py-1 rounded text-xs hover:opacity-80 font-medium ${
                          margin.color === 'green' ? 'bg-green-100 text-green-700 hover:bg-green-200' :
                          margin.color === 'blue' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' :
                          'bg-purple-100 text-purple-700 hover:bg-purple-200'
                        }`}
                      >
                        {margin.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {quickProductForm.selling_price && quickProductForm.cost_price && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                💰 Marge: {API.formatCurrency(parseFloat(quickProductForm.selling_price || 0) - parseFloat(quickProductForm.cost_price || 0))} 
                ({((parseFloat(quickProductForm.selling_price || 0) - parseFloat(quickProductForm.cost_price || 0)) / parseFloat(quickProductForm.selling_price || 1) * 100).toFixed(1)}%)
              </p>
            </div>
          )}
          
          <div className="flex flex-col sm:flex-row gap-3 mt-6">
            <button
              type="button"
              onClick={closeQuickAddModal}
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
}

function UsdCalculatorInline({ 
  usdAmount, 
  setUsdAmount, 
  usdToCadRate, 
  loadingExchangeRate, 
  exchangeRateError, 
  onUseAmount, 
  onClose, 
  onRefresh 
}) {
  return (
    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-blue-800 flex items-center">
          <Calculator className="w-4 h-4 mr-1" />
          Convertir USD → CAD
        </h4>
        <button
          type="button"
          onClick={onClose}
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
            onClick={onRefresh}
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
            value={usdAmount}
            onChange={(e) => setUsdAmount(e.target.value)}
            placeholder="Montant USD"
            className="flex-1 rounded border-blue-300 text-sm p-2"
          />
          <span className="text-sm text-blue-700">USD</span>
          <span className="text-sm">=</span>
          <span className="font-medium text-green-700">
            {usdAmount ? (parseFloat(usdAmount) * usdToCadRate).toFixed(2) : '0.00'} CAD
          </span>
        </div>
        
        <button
          type="button"
          onClick={onUseAmount}
          disabled={!usdAmount || parseFloat(usdAmount) <= 0}
          className="w-full px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          ✅ Utiliser {usdAmount ? (parseFloat(usdAmount) * usdToCadRate).toFixed(2) : '0.00'} CAD
        </button>
      </div>
    </div>
  );
}
