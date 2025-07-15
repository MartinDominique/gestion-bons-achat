import './globals.css';
import Navigation from '../components/Navigation';

export const metadata = { /* … */ };

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body className="bg-gray-100">
        <Navigation />
        <main className="p-6">{children}</main>
      </body>
    </html>
  );
}
