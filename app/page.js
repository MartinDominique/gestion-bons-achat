import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/notes');               // Page d'ouverture: tableau de bord des Notes
}
