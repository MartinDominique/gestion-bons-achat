
import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, User, MapPin, Mail, Phone, X } from 'lucide-react';

export default function ClientSelect({ 
  selectedClient, 
  onClientSelect, 
  error,
  required = false,
  disabled = false 
}) {
  const [clients, setClients] = useState([]);
  const [filteredClients, setFilteredClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Cache intelligent (pattern de votre InventoryManager)
  const [cachedClients, setCachedClients] = useState([]);
  const [lastFetchTime, setLastFetchTime] = useState(null);
  
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  // Fermer dropdown si click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Chargement initial des clients avec cache
  useEffect(() => {
    loadClients();
  }, []);

  // Filtrage des clients
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredClients(clients);
    } else {
      const searchLower = searchTerm.toLowerCase();
      const safeClients = Array.isArray(clients) ? clients : [];
      const filtered = safeClients.filter(client => 
        client.name && client.name.toLowerCase().includes(searchLower) ||
        (client.address && client.address.toLowerCase().includes(searchLower)) ||
        (client.email && client.email.toLowerCase().includes(searchLower))
      );
      setFilteredClients(filtered);
    }
  }, [searchTerm, clients]);

  const loadClients = async (forceReload = false) => {
    try {
      const now = Date.now();
      const fiveMinutesAgo = now - (5 * 60 * 1000);
      
      // Cache intelligent - Même pattern que InventoryManager
      if (!forceReload && cachedClients && cachedClients.length > 0 && lastFetchTime && lastFetchTime > fiveMinutesAgo) {
        console.log("✅ Cache clients utilisé - Chargement instantané");
        setClients(cachedClients);
        return;
      }
      
      console.log("🔄 Chargement clients depuis Supabase");
      setLoading(true);
      
      // Appel API - Adapter selon votre structure
      const response = await fetch('/api/clients');
      if (!response.ok) throw new Error('Erreur chargement clients');
      
      const responseData = await response.json();
      console.log('Réponse API clients:', responseData);
      
      // Gérer différents formats de réponse
      let clientsData;
      if (Array.isArray(responseData)) {
        clientsData = responseData;
      } else if (responseData.data && Array.isArray(responseData.data)) {
        clientsData = responseData.data;
      } else {
        console.error('Format de réponse clients inattendu:', responseData);
        clientsData = [];
      }
      
      // Sauvegarder en cache
      setCachedClients(clientsData);
      setLastFetchTime(now);
      setClients(clientsData);
      
      console.log(`✅ ${clientsData.length} clients chargés et mis en cache`);
      
    } catch (error) {
      console.error('Erreur chargement clients:', error);
      // Fallback - utiliser le cache même expiré si disponible
      if (cachedClients && cachedClients.length > 0) {
        console.log("⚠️ Utilisation cache expiré comme fallback");
        setClients(cachedClients);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClientSelect = (client) => {
    onClientSelect(client);
    setIsOpen(false);
    setSearchTerm('');
  };

  const clearSelection = () => {
    onClientSelect(null);
    setSearchTerm('');
  };

  const openDropdown = () => {
    if (disabled) return;
    setIsOpen(true);
    setSearchTerm('');
    // Focus sur l'input de recherche
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 100);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bouton de sélection */}
      <button
        type="button"
        onClick={openDropdown}
        disabled={disabled}
        className={`w-full px-3 py-2 text-left border rounded-lg focus:ring-2 focus:ring-blue-500 flex items-center justify-between ${
          error ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'
        } ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'hover:bg-gray-50 cursor-pointer'}
        ${isOpen ? 'ring-2 ring-blue-500' : ''}`}
      >
        <div className="flex items-center flex-1 min-w-0">
          <User className="mr-2 text-gray-400 flex-shrink-0" size={16} />
          {selectedClient ? (
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 truncate">
                {selectedClient.name}
              </div>
              {selectedClient.address && (
                <div className="text-xs text-gray-500 truncate">
                  {selectedClient.address}
                </div>
              )}
            </div>
          ) : (
            <span className="text-gray-500">
              Sélectionner un client{required ? ' *' : ''}
            </span>
          )}
        </div>
        
        <div className="flex items-center ml-2">
          {selectedClient && !disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clearSelection();
              }}
              className="mr-1 p-1 text-gray-400 hover:text-gray-600 rounded"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown 
            className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
            size={16} 
          />
        </div>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-80 flex flex-col">
          {/* Barre de recherche */}
          <div className="p-3 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
              <input
                ref={inputRef}
                type="text"
                placeholder="Rechercher par nom, adresse, email..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Liste des clients */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-sm text-gray-500 mt-2">Chargement...</p>
              </div>
            ) : (filteredClients || []).length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                {searchTerm ? (
                  <>
                    <Search className="mx-auto mb-2 text-gray-300" size={24} />
                    <p>Aucun client trouvé pour "{searchTerm}"</p>
                  </>
                ) : (
                  <>
                    <User className="mx-auto mb-2 text-gray-300" size={24} />
                    <p>Aucun client disponible</p>
                  </>
                )}
              </div>
            ) : (
              <div className="py-1">
                {(filteredClients || []).map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => handleClientSelect(client)}
                    className={`w-full px-3 py-2 text-left hover:bg-blue-50 focus:bg-blue-50 focus:outline-none ${
                      selectedClient?.id === client.id ? 'bg-blue-100 text-blue-900' : 'text-gray-900'
                    }`}
                  >
                    <div className="font-medium truncate">{client.name}</div>
                    {client.address && (
                      <div className="flex items-center text-xs text-gray-500 mt-1">
                        <MapPin className="mr-1 flex-shrink-0" size={10} />
                        <span className="truncate">{client.address}</span>
                      </div>
                    )}
                    {(client.email || client.phone) && (
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                        {client.email && (
                          <div className="flex items-center">
                            <Mail className="mr-1" size={10} />
                            <span className="truncate">{client.email}</span>
                          </div>
                        )}
                        {client.phone && (
                          <div className="flex items-center">
                            <Phone className="mr-1" size={10} />
                            <span>{client.phone}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer avec actions */}
          {!loading && (
            <div className="p-3 border-t border-gray-200 bg-gray-50 text-xs text-gray-600 flex justify-between">
              <span>{(filteredClients || []).length} client(s) trouvé(s)</span>
              <button
                type="button"
                onClick={() => loadClients(true)}
                className="text-blue-600 hover:text-blue-800"
              >
                Actualiser
              </button>
            </div>
          )}
        </div>
      )}

      {/* Message d'erreur */}
      {error && (
        <p className="text-red-500 text-sm mt-1 flex items-center">
          <X className="mr-1" size={14} />
          {error}
        </p>
      )}
    </div>
  );
}
