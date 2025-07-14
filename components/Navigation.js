// components/Navigation.js
'use client'
import { useState } from 'react';
import { FileText, Calculator, LogOut } from 'lucide-react';

export default function Navigation({ currentPage, onPageChange, user, onLogout }) {
  const pages = [
    { id: 'bons-achat', name: 'Bons d\'Achat', icon: FileText },
    { id: 'soumissions', name: 'Soumissions', icon: Calculator }
  ];

  return (
    <div className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center space-x-8">
            {/* Logo */}
            <div className="flex items-center space-x-3">
              <img 
                src="/logo.png" 
                alt="Logo" 
                className="h-10 w-auto"
              />
              <h1 className="text-2xl font-bold text-gray-900">Gestionnaire d'Entreprise</h1>
            </div>

            {/* Navigation */}
            <nav className="flex space-x-4">
              {pages.map((page) => {
                const Icon = page.icon;
                const isActive = currentPage === page.id;
                
                return (
                  <button
                    key={page.id}
                    onClick={() => onPageChange(page.id)}
                    className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-5 h-5 mr-2" />
                    {page.name}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* User info & logout */}
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">
              Connecté: {user?.email}
            </span>
            <button
              onClick={onLogout}
              className="inline-flex items-center px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Déconnexion
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
