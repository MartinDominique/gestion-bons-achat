// pages/api/cron/weekly-report.js
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Clé service pour accès complet
);

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // Vérifier que c'est bien un cron job de Vercel
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Récupérer tous les BT avec statut brouillon avec JOIN sur clients
    const { data: draftWorkOrders, error } = await supabase
      .from('work_orders')
      .select(`
        *,
        client:clients(name)
      `)
      .eq('status', 'draft')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Si aucun BT en brouillon, pas besoin d'envoyer d'email
    if (!draftWorkOrders || draftWorkOrders.length === 0) {
      return res.status(200).json({ 
        message: 'Aucun BT en brouillon', 
        count: 0 
      });
    }

    // Calculer l'âge et catégoriser les BT
    const now = new Date();
    const categorizedBT = draftWorkOrders.map(bt => {
      const createdDate = new Date(bt.created_at);
      const ageInDays = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
      
      let colorCategory = 'normal'; // 0-7 jours
      if (ageInDays >= 14) {
        colorCategory = 'red'; // 14+ jours
      } else if (ageInDays >= 7) {
        colorCategory = 'yellow'; // 7-13 jours
      }

      return {
        ...bt,
        ageInDays,
        colorCategory
      };
    });

    // Générer l'email HTML
    const emailHtml = generateEmailHtml(categorizedBT);

    // Envoyer l'email
    await resend.emails.send({
      from: 'Services TMT <noreply@servicestmt.ca>',
      to: process.env.WEEKLY_REPORT_EMAIL,
      subject: `📋 Rapport Hebdomadaire - ${draftWorkOrders.length} BT en Brouillon`,
      html: emailHtml
    });

    return res.status(200).json({ 
      success: true, 
      message: 'Rapport envoyé avec succès',
      count: draftWorkOrders.length,
      breakdown: {
        normal: categorizedBT.filter(bt => bt.colorCategory === 'normal').length,
        yellow: categorizedBT.filter(bt => bt.colorCategory === 'yellow').length,
        red: categorizedBT.filter(bt => bt.colorCategory === 'red').length
      }
    });

  } catch (error) {
    console.error('Erreur génération rapport:', error);
    return res.status(500).json({ 
      error: 'Erreur lors de la génération du rapport',
      details: error.message 
    });
  }
}

function generateEmailHtml(workOrders) {
  const rows = workOrders.map(bt => {
    const bgColor = 
      bt.colorCategory === 'red' ? '#FEE2E2' : // Rouge clair
      bt.colorCategory === 'yellow' ? '#FEF3C7' : // Jaune clair
      '#FFFFFF'; // Blanc

    const textColor = 
      bt.colorCategory === 'red' ? '#991B1B' : // Rouge foncé
      bt.colorCategory === 'yellow' ? '#92400E' : // Jaune foncé
      '#1F2937'; // Gris foncé

    const formatDate = (dateString) => {
      return new Date(dateString).toLocaleDateString('fr-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    };

    return `
      <tr style="background-color: ${bgColor}; color: ${textColor};">
        <td style="padding: 12px; border: 1px solid #E5E7EB; font-weight: bold;">
          ${bt.bt_number || 'N/A'}
        </td>
        <td style="padding: 12px; border: 1px solid #E5E7EB;">
          ${formatDate(bt.created_at)}
        </td>
        <td style="padding: 12px; border: 1px solid #E5E7EB;">
          ${bt.client?.name || 'N/A'}
        </td>
        <td style="padding: 12px; border: 1px solid #E5E7EB;">
          ${bt.work_description || 'Aucune description'}
        </td>
        <td style="padding: 12px; border: 1px solid #E5E7EB; text-align: center; font-weight: bold;">
          ${bt.total_hours || '0'} h
        </td>
        <td style="padding: 12px; border: 1px solid #E5E7EB; text-align: center; font-size: 12px;">
          ${bt.ageInDays} jour${bt.ageInDays > 1 ? 's' : ''}
        </td>
      </tr>
    `;
  }).join('');

  const stats = {
    total: workOrders.length,
    normal: workOrders.filter(bt => bt.colorCategory === 'normal').length,
    yellow: workOrders.filter(bt => bt.colorCategory === 'yellow').length,
    red: workOrders.filter(bt => bt.colorCategory === 'red').length
  };

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Rapport Hebdomadaire BT</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 1200px; margin: 0 auto; padding: 20px;">
      
      <!-- En-tête -->
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; margin-bottom: 30px;">
        <h1 style="margin: 0 0 10px 0; font-size: 28px;">📋 Rapport Hebdomadaire</h1>
        <p style="margin: 0; font-size: 16px; opacity: 0.9;">
          Bons de Travail en Brouillon - ${new Date().toLocaleDateString('fr-CA', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}
        </p>
      </div>

      <!-- Statistiques -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px;">
        <div style="background: #F3F4F6; padding: 20px; border-radius: 8px; text-align: center;">
          <div style="font-size: 32px; font-weight: bold; color: #667eea;">${stats.total}</div>
          <div style="font-size: 14px; color: #6B7280; margin-top: 5px;">Total BT</div>
        </div>
        <div style="background: #F3F4F6; padding: 20px; border-radius: 8px; text-align: center;">
          <div style="font-size: 32px; font-weight: bold; color: #059669;">${stats.normal}</div>
          <div style="font-size: 14px; color: #6B7280; margin-top: 5px;">Récents (0-7j)</div>
        </div>
        <div style="background: #FEF3C7; padding: 20px; border-radius: 8px; text-align: center;">
          <div style="font-size: 32px; font-weight: bold; color: #D97706;">${stats.yellow}</div>
          <div style="font-size: 14px; color: #92400E; margin-top: 5px;">⚠️ 1-2 semaines</div>
        </div>
        <div style="background: #FEE2E2; padding: 20px; border-radius: 8px; text-align: center;">
          <div style="font-size: 32px; font-weight: bold; color: #DC2626;">${stats.red}</div>
          <div style="font-size: 14px; color: #991B1B; margin-top: 5px;">🚨 2+ semaines</div>
        </div>
      </div>

      <!-- Légende -->
      <div style="background: #F9FAFB; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #667eea;">
        <strong style="color: #374151;">Légende des couleurs:</strong>
        <div style="margin-top: 10px; font-size: 14px;">
          <span style="display: inline-block; width: 20px; height: 20px; background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 3px; margin-right: 8px; vertical-align: middle;"></span>
          <span style="color: #6B7280;">Récent (0-7 jours)</span>
          <span style="margin: 0 15px;">•</span>
          <span style="display: inline-block; width: 20px; height: 20px; background: #FEF3C7; border: 1px solid #FDE68A; border-radius: 3px; margin-right: 8px; vertical-align: middle;"></span>
          <span style="color: #92400E;">⚠️ Attention (7-13 jours)</span>
          <span style="margin: 0 15px;">•</span>
          <span style="display: inline-block; width: 20px; height: 20px; background: #FEE2E2; border: 1px solid #FECACA; border-radius: 3px; margin-right: 8px; vertical-align: middle;"></span>
          <span style="color: #991B1B;">🚨 Urgent (14+ jours)</span>
        </div>
      </div>

      <!-- Tableau -->
      <div style="overflow-x: auto; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <table style="width: 100%; border-collapse: collapse; background: white;">
          <thead>
            <tr style="background: #667eea; color: white;">
              <th style="padding: 15px; text-align: left; border: 1px solid #5568d3; font-weight: 600; min-width: 120px;">BT #</th>
              <th style="padding: 15px; text-align: left; border: 1px solid #5568d3; font-weight: 600; min-width: 110px;">Date Création</th>
              <th style="padding: 15px; text-align: left; border: 1px solid #5568d3; font-weight: 600; min-width: 150px;">Client</th>
              <th style="padding: 15px; text-align: left; border: 1px solid #5568d3; font-weight: 600; min-width: 300px;">Description</th>
              <th style="padding: 15px; text-align: center; border: 1px solid #5568d3; font-weight: 600; min-width: 80px;">Heures</th>
              <th style="padding: 15px; text-align: center; border: 1px solid #5568d3; font-weight: 600; min-width: 90px;">Âge</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>

      <!-- Footer -->
      <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #E5E7EB; text-align: center; color: #6B7280; font-size: 14px;">
        <p style="margin: 5px 0;">
          <strong>Services TMT Inc.</strong>
        </p>
        <p style="margin: 5px 0;">
          Ce rapport est généré automatiquement tous les lundis matin
        </p>
        <p style="margin: 5px 0;">
          📞 (418) 225-3875 • ✉️ info.servicestmt@gmail.com
        </p>
      </div>

    </body>
    </html>
  `;
}
