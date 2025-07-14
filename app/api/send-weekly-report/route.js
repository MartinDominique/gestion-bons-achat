// app/api/send-weekly-report/route.js
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    console.log('🕐 Envoi automatique du rapport hebdomadaire...');

    // Vérifier les variables d'environnement
    if (!process.env.RESEND_API_KEY) {
      console.error('❌ RESEND_API_KEY manquante !');
      return Response.json({ error: 'Configuration Resend manquante' }, { status: 500 });
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.error('❌ Variables Supabase manquantes !');
      return Response.json({ error: 'Configuration Supabase manquante' }, { status: 500 });
    }

    // Utiliser la même configuration Supabase que l'application principale
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

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

    // Calculer les statistiques
    const stats = {
      total: orders.length,
      enAttente: orders.filter(o => o.status === 'en_attente').length,
      approuve: orders.filter(o => o.status === 'approuve').length,
      refuse: orders.filter(o => o.status === 'refuse').length,
      montantTotal: orders.reduce((sum, o) => sum + parseFloat(o.amount || 0), 0)
    };

    // Créer le contenu HTML de l'email
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
        <h2 style="color: #1f2937;">📋 Rapport Hebdomadaire - Bons d'Achat</h2>
        <p><strong>Période:</strong> ${startDate} à ${new Date().toISOString().split('T')[0]}</p>
        <p><strong>Nombre total:</strong> ${orders.length} bon(s) d'achat</p>
        
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #374151; margin-top: 0;">📊 Résumé:</h3>
          <ul style="list-style: none; padding: 0;">
            <li style="margin: 8px 0;">⏳ <strong>En attente:</strong> ${stats.enAttente}</li>
            <li style="margin: 8px 0;">✅ <strong>Approuvés:</strong> ${stats.approuve}</li>
            <li style="margin: 8px 0;">❌ <strong>Refusés:</strong> ${stats.refuse}</li>
            <li style="margin: 8px 0;">💰 <strong>Montant total:</strong> ${stats.montantTotal.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</li>
          </ul>
        </div>
        
        <h3 style="color: #374151;">📋 Détails:</h3>
        <table style="border-collapse: collapse; width: 100%; border: 1px solid #d1d5db;">
          <thead>
            <tr style="background-color: #f9fafb;">
              <th style="padding: 12px; border: 1px solid #d1d5db; text-align: left;">Date</th>
              <th style="padding: 12px; border: 1px solid #d1d5db; text-align: left;">Client</th>
              <th style="padding: 12px; border: 1px solid #d1d5db; text-align: left;">PO</th>
              <th style="padding: 12px; border: 1px solid #d1d5db; text-align: left;">Soumission</th>
              <th style="padding: 12px; border: 1px solid #d1d5db; text-align: left;">Montant</th>
              <th style="padding: 12px; border: 1px solid #d1d5db; text-align: left;">Statut</th>
            </tr>
          </thead>
          <tbody>
            ${orders.map(order => `
              <tr>
                <td style="padding: 12px; border: 1px solid #d1d5db;">${new Date(order.date).toLocaleDateString('fr-CA')}</td>
                <td style="padding: 12px; border: 1px solid #d1d5db;">${order.client_name}</td>
                <td style="padding: 12px; border: 1px solid #d1d5db;">${order.client_po}</td>
                <td style="padding: 12px; border: 1px solid #d1d5db;">${order.submission_no}</td>
                <td style="padding: 12px; border: 1px solid #d1d5db;">${parseFloat(order.amount || 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</td>
                <td style="padding: 12px; border: 1px solid #d1d5db;">
                  ${order.status === 'approuve' ? '✅ Approuvé' : 
                    order.status === 'refuse' ? '❌ Refusé' : 
                    '⏳ En attente'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <p style="margin-top: 20px; font-size: 0.9em; color: #6b7280;">
          <em>Rapport généré automatiquement le ${new Date().toLocaleDateString('fr-CA')} à ${new Date().toLocaleTimeString('fr-CA')}</em>
        </p>
      </div>
    `;

    // Envoyer l'email
    const resend = new Resend(process.env.RESEND_API_KEY);
    
    // Email de destination
    const emailTo = process.env.WEEKLY_REPORT_EMAIL || 'servicestmt@gmail.com';
    
    const result = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: emailTo,
      subject: `📊 Rapport Hebdomadaire - ${orders.length} bon(s) d'achat (${stats.montantTotal.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })})`,
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
      totalAmount: stats.montantTotal,
      emailId: result.data?.id,
      message: `Rapport envoyé avec ${orders.length} bon(s) d'achat (${stats.montantTotal.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })})`
    });

  } catch (error) {
    console.error('❌ Erreur complète:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
}
