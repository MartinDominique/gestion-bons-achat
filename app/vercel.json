// app/api/send-weekly-report/route.js
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET() {
  try {
    console.log('🕐 Envoi automatique du rapport hebdomadaire...');

    // Vérifier que les variables d'environnement existent
    if (!process.env.RESEND_API_KEY) {
      console.error('❌ RESEND_API_KEY manquante !');
      return Response.json({ error: 'Configuration manquante' }, { status: 500 });
    }

    // Calculer la date de la semaine dernière
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const startDate = oneWeekAgo.toISOString().split('T')[0];

    console.log(`📅 Récupération des données depuis le ${startDate}`);

    // Récupérer les bons d'achat de la semaine
    const { data: orders, error } = await supabase
      .from('purchase_orders')
      .select('*')
      .gte('date', startDate)
      .order('date', { ascending: false });

    if (error) {
      console.error('❌ Erreur Supabase:', error);
      return Response.json({ error: 'Erreur base de données' }, { status: 500 });
    }

    console.log(`📊 ${orders.length} bons d'achat trouvés`);

    // Si pas de données, ne pas envoyer d'email
    if (orders.length === 0) {
      console.log('📭 Aucun bon d\'achat cette semaine, pas d\'email envoyé');
      return Response.json({ 
        success: true, 
        message: 'Aucun bon d\'achat cette semaine' 
      });
    }

    // Créer le PDF (vous pouvez utiliser une méthode plus simple ici)
    const htmlContent = `
      <h2>📋 Rapport Hebdomadaire - Bons d'Achat</h2>
      <p><strong>Période:</strong> ${startDate} à aujourd'hui</p>
      <p><strong>Nombre total:</strong> ${orders.length} bon(s) d'achat</p>
      
      <h3>📊 Résumé:</h3>
      <ul>
        <li><strong>En attente:</strong> ${orders.filter(o => o.status === 'en_attente').length}</li>
        <li><strong>Approuvés:</strong> ${orders.filter(o => o.status === 'approuve').length}</li>
        <li><strong>Refusés:</strong> ${orders.filter(o => o.status === 'refuse').length}</li>
      </ul>
      
      <h3>📋 Détails:</h3>
      <table border="1" style="border-collapse: collapse; width: 100%;">
        <tr style="background-color: #f5f5f5;">
          <th style="padding: 8px;">Date</th>
          <th style="padding: 8px;">Client</th>
          <th style="padding: 8px;">PO</th>
          <th style="padding: 8px;">Soumission</th>
          <th style="padding: 8px;">Montant</th>
          <th style="padding: 8px;">Statut</th>
        </tr>
        ${orders.map(order => `
          <tr>
            <td style="padding: 8px;">${new Date(order.date).toLocaleDateString('fr-CA')}</td>
            <td style="padding: 8px;">${order.client_name}</td>
            <td style="padding: 8px;">${order.client_po}</td>
            <td style="padding: 8px;">${order.submission_no}</td>
            <td style="padding: 8px;">${parseFloat(order.amount || 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</td>
            <td style="padding: 8px;">
              ${order.status === 'approuve' ? '✅ Approuvé' : 
                order.status === 'refuse' ? '❌ Refusé' : 
                '⏳ En attente'}
            </td>
          </tr>
        `).join('')}
      </table>
      
      <p><em>Rapport généré automatiquement le ${new Date().toLocaleDateString('fr-CA')} à ${new Date().toLocaleTimeString('fr-CA')}</em></p>
    `;

    // Envoyer l'email
    const resend = new Resend(process.env.RESEND_API_KEY);
    
    // Email principal (remplacez par votre email)
    const emailTo = process.env.WEEKLY_REPORT_EMAIL || 'servicestmt@gmail.com';
    
    const result = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: emailTo,
      subject: `📊 Rapport Hebdomadaire - ${orders.length} bon(s) d'achat`,
      html: htmlContent
    });

    if (result.error) {
      console.error('❌ Erreur Resend:', result.error);
      return Response.json({ error: result.error }, { status: 400 });
    }

    console.log(`✅ Rapport envoyé avec succès ! ID: ${result.data?.id}`);

    return Response.json({ 
      success: true, 
      ordersCount: orders.length,
      emailId: result.data?.id,
      message: `Rapport envoyé avec ${orders.length} bon(s) d'achat`
    });

  } catch (error) {
    console.error('❌ Erreur complète:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
}
