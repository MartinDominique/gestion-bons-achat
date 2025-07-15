import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/bons-achat');          // ou '/soumissions' si tu préfères
}
