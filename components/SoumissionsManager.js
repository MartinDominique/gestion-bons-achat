
import { useState } from 'react';
import { Search, MoreVertical, Edit, Trash2 } from 'lucide-react';
import { useSoumissions } from './SoumissionsHooks';
import { SoumissionForm } from './SoumissionsForms';
import * as API from './SoumissionsServices';

export default function SoumissionsManager() {
  const {
    // États principaux
    loading,
    showForm,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    sendingReport,
    
    // Données
    filteredSoumissions,
    stats,
    
    // Handlers
    handleNewSubmission,
    handleEditSubmission,
    handleDeleteSubmission,
    handleSendReport
  } = useSoumissions();

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        <p className="ml-4 text-purple-600 font-medium">Chargement des soumissions...</p>
      </div>
    );
  }

  // Affichage du formulaire
  if (showForm) {
    return <SoumissionForm />;
  }

  // Affichage de la liste principale
  return (
    <div className="space-y-6 p-4">
      
      {/* En-tête avec statistiques */}
      <HeaderWithStats 
        stats={stats}
        sendingReport={sendingReport}
        onSendReport={handleSendReport}
        onNewSubmission={handleNewSubmission}
      />

      {/* Info système */}
      <SystemInfo />

      {/* Filtres de recherche */}
      <SearchFilters 
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />

      {/* Liste des soumissions */}
      <SoumissionsList 
        soumissions={filteredSoumissions}
        onEdit={handleEditSubmission}
        onDelete={handleDeleteSubmission}
      />
    </div>
  );
}

// ===== COMPOSANTS HEADER ET STATS =====
function HeaderWithStats({ stats, sendingReport, onSendReport, onNewSubmission }) {
  return (
    <div className="bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 rounded-xl shadow-lg p-4 sm:p-6 text-white">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold">📝 Gestion des Soumissions</h2>
          <p className="text-white/90 text-sm sm:text-base mt-1">
            Créez et gérez vos soumissions avec calculateur USD→CAD et marges automatiques
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <button
            onClick={onSendReport}
            disabled={sendingReport}
            className="w-full sm:w-auto px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-sm font-medium hover:bg-white/20 backdrop-blur-sm"
          >
            📧 {sendingReport ? 'Envoi...' : 'Rapport'}
          </button>
          <button
            onClick={onNewSubmission}
            className="w-full sm:w-auto px-4 py-2 bg-white text-purple-600 rounded-lg hover:bg-gray-100 font-medium text-sm"
          >
            ➕ Nouvelle Soumission
          </button>
        </div>
      </div>

      {/* Statistiques responsive */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          icon="📊"
          label="Total"
          value={stats.total}
        />
        <StatCard 
          icon="📝"
          label="Brouillons"
          value={stats.drafts}
        />
        <StatCard 
          icon="📤"
          label="Envoyées"
          value={stats.sent}
        />
        <StatCard 
          icon="✅"
          label="Total Accepté"
          value={API.formatCurrency(stats.acceptedTotal)}
          subtitle={`${stats.accepted.length} soumissions`}
        />
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, subtitle }) {
  return (
    <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
      <div className="flex items-center">
        <span className="text-2xl sm:text-3xl mr-3">{icon}</span>
        <div>
          <p className="text-xs sm:text-sm font-medium text-white/90">{label}</p>
          <p className="text-xl sm:text-2xl font-bold">{value}</p>
          {subtitle && (
            <p className="text-xs text-white/70">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== COMPOSANT INFO SYSTÈME =====
function SystemInfo() {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <p className="text-sm text-gray-600">
        📊 6718 produits • 💱 USD→CAD (Taux: 1.3500) • 🎯 Marges auto
      </p>
    </div>
  );
}

// ===== COMPOSANTS FILTRES =====
function SearchFilters({ searchTerm, onSearchChange, statusFilter, onStatusFilterChange }) {
  return (
    <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="🔍 Rechercher par client ou description..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="block w-full pl-10 pr-4 py-3 rounded-lg border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-base"
            />
          </div>
        </div>
        <div className="w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
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
  );
}

// ===== COMPOSANT LISTE SOUMISSIONS =====
function SoumissionsList({ soumissions, onEdit, onDelete }) {
  if (soumissions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-8 text-center">
        <span className="text-6xl mb-4 block">📝</span>
        <p className="text-gray-500 text-lg">Aucune soumission trouvée</p>
      </div>
    );
  }

  return (
    <>
      {/* DESKTOP VIEW - Table */}
      <DesktopSoumissionsTable 
        soumissions={soumissions}
        onEdit={onEdit}
        onDelete={onDelete}
      />

      {/* MOBILE VIEW - Cards */}
      <MobileSoumissionsCards 
        soumissions={soumissions}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </>
  );
}

// ===== DESKTOP TABLE =====
function DesktopSoumissionsTable({ soumissions, onEdit, onDelete }) {
  return (
    <div className="hidden lg:block bg-white shadow-lg rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Soumission
            </th>
            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Client & Description
            </th>
            <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Montant
            </th>
            <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Statut
            </th>
            <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Date
            </th>
            <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {soumissions.map((submission) => (
            <DesktopSoumissionRow
              key={submission.id}
              submission={submission}
              onEdit={() => onEdit(submission)}
              onDelete={() => onDelete(submission.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DesktopSoumissionRow({ submission, onEdit, onDelete }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-3 py-4 whitespace-nowrap">
        <div className="text-sm space-y-1">
          {submission.submission_number && (
            <div className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs font-medium inline-block">
              N°: {submission.submission_number}
            </div>
          )}
          {submission.items?.some(item => item.comment) && (
            <div className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium inline-block ml-1">
              💬
            </div>
          )}
        </div>
      </td>
      <td className="px-3 py-4">
        <div className="text-sm">
          <div className="font-medium text-gray-900">{submission.client_name}</div>
          <div className="text-gray-500 truncate max-w-xs" title={submission.description}>
            {submission.description}
          </div>
        </div>
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-center">
        <div className="text-sm font-medium text-green-600">
          {API.formatCurrency(submission.amount)}
        </div>
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-center">
        <StatusBadge status={submission.status} />
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-center text-sm text-gray-500">
        {API.formatDate(submission.created_at)}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-center">
        <ActionButtons onEdit={onEdit} onDelete={onDelete} />
      </td>
    </tr>
  );
}

// ===== MOBILE CARDS =====
function MobileSoumissionsCards({ soumissions, onEdit, onDelete }) {
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(null);

  return (
    <div className="lg:hidden space-y-4">
      {soumissions.map((submission) => (
        <MobileSoumissionCard
          key={submission.id}
          submission={submission}
          isMenuOpen={selectedSubmissionId === submission.id}
          onToggleMenu={() => setSelectedSubmissionId(
            selectedSubmissionId === submission.id ? null : submission.id
          )}
          onEdit={() => {
            onEdit(submission);
            setSelectedSubmissionId(null);
          }}
          onDelete={() => {
            onDelete(submission.id);
            setSelectedSubmissionId(null);
          }}
        />
      ))}
    </div>
  );
}

function MobileSoumissionCard({ submission, isMenuOpen, onToggleMenu, onEdit, onDelete }) {
  const costTotal = submission.items?.reduce((sum, item) => 
    sum + ((item.cost_price || 0) * (item.quantity || 0)), 0
  ) || 0;

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
      
      {/* En-tête de la card */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <StatusIcon status={submission.status} />
            <div>
              <h3 className="font-semibold text-gray-900 text-base">
                👤 {submission.client_name}
              </h3>
              <div className="flex items-center gap-2">
                {submission.submission_number && (
                  <p className="text-sm text-purple-600">N°: {submission.submission_number}</p>
                )}
                {submission.items?.some(item => item.comment) && (
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
                    💬 Commentaires
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {/* Menu actions mobile */}
          <MobileActionMenu 
            isOpen={isMenuOpen}
            onToggle={onToggleMenu}
            onEdit={onEdit}
            onDelete={onDelete}
          />
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
            <span className="font-bold text-green-600 text-base">{API.formatCurrency(submission.amount)}</span>
          </div>
          <div>
            <span className="text-gray-500 block">📅 Date</span>
            <span className="font-medium text-gray-900">{API.formatDate(submission.created_at)}</span>
          </div>
        </div>

        {/* Statut */}
        <div className="flex items-center justify-between">
          <span className="text-gray-500 text-sm">Statut</span>
          <StatusBadge status={submission.status} />
        </div>

        {/* Marge et coût */}
        {submission.items && submission.items.length > 0 && (
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-orange-600 font-medium">
                  🏷️ Coût: {API.formatCurrency(costTotal)}
                </span>
              </div>
              <div>
                <span className="text-blue-600 font-medium">
                  📈 Marge: {API.formatCurrency(submission.amount - costTotal)}
                </span>
              </div>
            </div>
            <div className="mt-1 text-xs text-gray-600 flex justify-between">
              <span>📦 {submission.items.length} item(s)</span>
              {submission.items.some(item => item.comment) && (
                <span className="text-blue-600">💬 {submission.items.filter(item => item.comment).length} commentaire(s)</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Actions rapides en bas */}
      <div className="bg-gray-50 px-4 py-3 flex gap-2">
        <button
          onClick={onEdit}
          className="flex-1 bg-purple-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
        >
          ✏️ Modifier
        </button>
        <button
          onClick={onDelete}
          className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
        >
          🗑️ Supprimer
        </button>
      </div>
    </div>
  );
}

// ===== COMPOSANTS COMMUNS =====
function StatusBadge({ status }) {
  const config = {
    sent: { bg: 'bg-blue-100', text: 'text-blue-800', icon: '📤' },
    draft: { bg: 'bg-gray-100', text: 'text-gray-800', icon: '📝' },
    accepted: { bg: 'bg-green-100', text: 'text-green-800', icon: '✅' }
  };

  const style = config[status] || config.draft;

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      {style.icon}
    </span>
  );
}

function StatusIcon({ status }) {
  const icons = {
    sent: '📤',
    draft: '📝',
    accepted: '✅'
  };

  return (
    <span className="text-2xl">
      {icons[status] || icons.draft}
    </span>
  );
}

function ActionButtons({ onEdit, onDelete }) {
  return (
    <div className="flex justify-center space-x-1">
      <button
        onClick={onEdit}
        className="bg-purple-100 text-purple-700 hover:bg-purple-200 p-2 rounded-lg transition-colors"
        title="Modifier"
      >
        <Edit className="w-4 h-4" />
      </button>
      <button
        onClick={onDelete}
        className="bg-red-100 text-red-700 hover:bg-red-200 p-2 rounded-lg transition-colors"
        title="Supprimer"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function MobileActionMenu({ isOpen, onToggle, onEdit, onDelete }) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-white/50"
      >
        <MoreVertical className="w-5 h-5" />
      </button>
      
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
          <div className="py-1">
            <button
              onClick={onEdit}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
            >
              <Edit className="w-4 h-4 mr-2" />
              Modifier
            </button>
            <hr className="my-1" />
            <button
              onClick={onDelete}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Supprimer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
