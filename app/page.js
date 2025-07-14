// Remplacez TOUT le contenu de votre fichier app/page.js par ce code corrigé :

'use client';
import { useState, useEffect } from 'react';

export default function Home() {
  const [orders, setOrders] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    montant: '',
    nomClient: '',
    emailClient: '',
    dateCommande: '',
    produits: ''
  });

  // Charger les commandes au démarrage
  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = () => {
    const savedOrders = localStorage.getItem('orders');
    if (savedOrders) {
      setOrders(JSON.parse(savedOrders));
    }
  };

  const saveOrders = (newOrders) => {
    localStorage.setItem('orders', JSON.stringify(newOrders));
    setOrders(newOrders);
  };

  const resetForm = () => {
    setFormData({
      montant: '',
      nomClient: '',
      emailClient: '',
      dateCommande: '',
      produits: ''
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Générer un ID unique
      const newOrder = {
        ...formData,
        id: Date.now(),
        dateCreation: new Date().toISOString()
      };

      // Ajouter à la liste
      const updatedOrders = [...orders, newOrder];
      saveOrders(updatedOrders);

      // Envoyer le rapport par email
      const response = await fetch('/api/send-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderData: newOrder,
          allOrders: updatedOrders
        }),
      });

      if (!response.ok) {
        throw new Error('Erreur lors de l\'envoi du rapport');
      }

      alert("Rapport envoyé avec succès !");
      resetForm();
      setShowForm(false);

    } catch (error) {
      alert('Erreur: ' + error.message);
      console.error('Erreur détaillée:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce bon d\'achat?')) return;
    
    const updatedOrders = orders.filter(order => order.id !== id);
    saveOrders(updatedOrders);
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Gestion des Bons d'Achat</h1>
      
      <button 
        onClick={() => setShowForm(!showForm)}
        className="bg-blue-500 text-white px-4 py-2 rounded mb-4"
      >
        {showForm ? 'Annuler' : 'Nouveau Bon d\'Achat'}
      </button>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-100 p-6 rounded mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-2">Montant (€)</label>
              <input
                type="number"
                name="montant"
                value={formData.montant}
                onChange={handleInputChange}
                required
                className="w-full p-2 border rounded"
              />
            </div>
            
            <div>
              <label className="block mb-2">Nom du Client</label>
              <input
                type="text"
                name="nomClient"
                value={formData.nomClient}
                onChange={handleInputChange}
                required
                className="w-full p-2 border rounded"
              />
            </div>
            
            <div>
              <label className="block mb-2">Email du Client</label>
              <input
                type="email"
                name="emailClient"
                value={formData.emailClient}
                onChange={handleInputChange}
                required
                className="w-full p-2 border rounded"
              />
            </div>
            
            <div>
              <label className="block mb-2">Date de Commande</label>
              <input
                type="date"
                name="dateCommande"
                value={formData.dateCommande}
                onChange={handleInputChange}
                required
                className="w-full p-2 border rounded"
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="block mb-2">Produits</label>
              <textarea
                name="produits"
                value={formData.produits}
                onChange={handleInputChange}
                required
                className="w-full p-2 border rounded"
                rows="3"
              />
            </div>
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="bg-green-500 text-white px-6 py-2 rounded mt-4"
          >
            {loading ? 'Envoi en cours...' : 'Créer le Bon d\'Achat'}
          </button>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border">
          <thead>
            <tr className="bg-gray-200">
              <th className="border p-2">Date</th>
              <th className="border p-2">Client</th>
              <th className="border p-2">Email</th>
              <th className="border p-2">Montant</th>
              <th className="border p-2">Produits</th>
              <th className="border p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td className="border p-2">{order.dateCommande}</td>
                <td className="border p-2">{order.nomClient}</td>
                <td className="border p-2">{order.emailClient}</td>
                <td className="border p-2">{order.montant}€</td>
                <td className="border p-2">{order.produits}</td>
                <td className="border p-2">
                  <button 
                    onClick={() => handleDelete(order.id)}
                    className="bg-red-500 text-white px-2 py-1 rounded"
                  >
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
