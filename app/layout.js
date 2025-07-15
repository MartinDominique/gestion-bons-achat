import './globals.css';
import Navigation from '../components/Navigation';

export const metadata = {
  title: 'Gestion Bons d\'Achat',
  description: 'Application interne'
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body className="bg-gray-100">
        {/* barre de navigation en haut */}
        <Navigation />

        {/* zone de contenu centrée */}
        <main className="max-w-6xl mx-auto p-6 bg-white rounded-lg shadow">
          {children}
        </main>
      </body>
    </html>
  );
}
