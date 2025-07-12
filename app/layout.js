import './globals.css'

export const metadata = {
  title: 'Gestion des Bons d\'Achat',
  description: 'Application de gestion des bons d\'achat et soumissions',
}

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
