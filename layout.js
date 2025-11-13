// app/layout.js
import './globals.css';
import Navigation from '../components/Navigation';

export const metadata = {
  title: 'Gestion Bons d\'Achat',
  description: 'Application de gestion des bons d\'achat et soumissions',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body className="bg-gray-100">
        <Navigation />
        <main className="max-w-6xl mx-auto p-6 bg-white rounded-lg shadow">
          {children}
        </main>
      </body>
    </html>
  );
}
