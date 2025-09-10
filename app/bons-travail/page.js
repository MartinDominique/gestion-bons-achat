import Link from 'next/link';
import { Plus } from 'lucide-react';

export default function BonsTravailPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Bons de Travail</h1>
        <Link 
          href="/bons-travail/nouveau"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center"
        >
          <Plus className="mr-2" size={20} />
          Nouveau BT
        </Link>
      </div>
      
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-600">
          Liste des bons de travail à venir dans la prochaine conversation...
        </p>
        <p className="text-sm text-gray-500 mt-2">
          Pour l'instant, vous pouvez créer un nouveau bon de travail.
        </p>
      </div>
    </div>
  );
}
