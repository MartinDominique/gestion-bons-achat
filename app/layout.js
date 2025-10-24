// app/layout.js
import './globals.css';
import Navigation from '../components/Navigation';

export const metadata = {
  title: 'Gestion Bons d\'Achat',
  description: 'Application de gestion des bons d\'achat et soumissions',
  
  // 👇 AJOUT PWA - Début
  manifest: '/manifest.json',
  // ❌ themeColor retiré d'ici - déplacé vers viewport
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Gestion Bons d\'Achat'
  },
  icons: {
    icon: [
      { url: '/logo192.png', sizes: '192x192', type: 'image/png' },
      { url: '/logo512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: [
      { url: '/logo192.png', sizes: '192x192', type: 'image/png' }
    ]
  }
  // 👆 AJOUT PWA - Fin
};

// ✅ NOUVEAU: viewport séparé pour themeColor
export const viewport = {
  themeColor: '#1e40af'
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        {/* 👇 AJOUT PWA - Meta tags - Début */}
        <meta name="application-name" content="Gestion Bons d'Achat" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Gestion Bons d'Achat" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#1e40af" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/logo192.png" />
        <link rel="apple-touch-icon" href="/logo192.png" />
        {/* 👆 AJOUT PWA - Meta tags - Fin */}
      </head>
      <body className="bg-gray-100">
        <Navigation />
        <main className="max-w-6xl mx-auto p-6 bg-white rounded-lg shadow">
          {children}
        </main>
      </body>
    </html>
  );
}
