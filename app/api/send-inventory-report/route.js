// app/api/send-inventory-report/route.js
// Rapport de variation d'inventaire HEBDOMADAIRE pour Dominique
// Appelé depuis send-weekly-report (vendredi 21h UTC)

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request) {
  try {
    // Calculer la période (7 derniers jours)
    const body = await request.json().catch(() => ({}));
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    
    const startOfWeek = startDate.toISOString();
    const endOfWeek = endDate.toISOString();
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    console.log(`📦 Génération rapport inventaire du ${startDateStr} au ${endDateStr}`);

    // Récupérer les mouvements de la semaine
    const { data: movements, error } = await supabaseAdmin
      .from('inventory_movements')
      .select('*')
      .gte('created_at', startOfWeek)
      .lte('created_at', endOfWeek)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Erreur récupération mouvements:', error);
      throw error;
    }

    // Si aucun mouvement, ne pas envoyer d'email
    if (!movements || movements.length === 0) {
      console.log('📭 Aucun mouvement d\'inventaire cette semaine - email non envoyé');
      return Response.json({ 
        success: true, 
        sent: false,
        message: 'Aucun mouvement cette semaine - email non envoyé' 
      });
    }

    // Séparer entrées et sorties
    const entries = movements.filter(m => m.movement_type === 'IN');
    const exits = movements.filter(m => m.movement_type === 'OUT');
    const adjustments = movements.filter(m => m.movement_type === 'ADJUST');

    // Calculer les totaux
    const totalIn = entries.reduce((sum, e) => sum + (parseFloat(e.total_cost) || 0), 0);
    const totalOut = exits.reduce((sum, e) => sum + (parseFloat(e.total_cost) || 0), 0);

    // Générer le HTML du rapport
    const html = generateReportHTML(startDateStr, endDateStr, entries, exits, adjustments, totalIn, totalOut);

    // Email destinataire
    const companyEmail = process.env.COMPANY_EMAIL || 'info.servicestmt@gmail.com';

    // Envoyer l'email
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'Services TMT <noreply@servicestmt.ca>',
      to: [COMPANY_EMAIL],
      subject: `📦 Rapport Inventaire Hebdo - ${startDateStr} au ${endDateStr} (${movements.length} mouvements)`,
      html: html
    });

    if (emailError) {
      console.error('Erreur envoi email:', emailError);
      throw emailError;
    }

    console.log(`✅ Rapport inventaire hebdo envoyé à ${companyEmail}`);
    console.log(`   - Période: ${startDateStr} au ${endDateStr}`);
    console.log(`   - Entrées: ${entries.length} (${totalIn.toFixed(2)}$)`);
    console.log(`   - Sorties: ${exits.length} (${totalOut.toFixed(2)}$)`);
    console.log(`   - Ajustements: ${adjustments.length}`);

    return Response.json({ 
      success: true,
      sent: true,
      period: `${startDateStr} au ${endDateStr}`,
      movementsCount: movements.length,
      entries: entries.length,
      exits: exits.length,
      adjustments: adjustments.length,
      totalIn: totalIn.toFixed(2),
      totalOut: totalOut.toFixed(2)
    });

  } catch (error) {
    console.error('❌ Erreur rapport inventaire:', error);
    return Response.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
}

// Permet aussi les appels GET (pour tests manuels)
export async function GET(request) {
  // Créer une fausse requête POST avec la date d'aujourd'hui
  const fakeRequest = {
    json: async () => ({})
  };
  return POST(fakeRequest);
}

function generateReportHTML(startDate, endDate, entries, exits, adjustments, totalIn, totalOut) {
  const formatMoney = (val) => `$${(parseFloat(val) || 0).toFixed(2)}`;
  const formatQty = (val) => {
    const num = parseFloat(val) || 0;
    return num % 1 === 0 ? num.toString() : num.toFixed(4).replace(/\.?0+$/, '');
  };

  // Formater les dates en français
  const startDateObj = new Date(startDate + 'T12:00:00');
  const endDateObj = new Date(endDate + 'T12:00:00');
  
  const options = { weekday: 'short', day: 'numeric', month: 'short' };
  const startFormatted = startDateObj.toLocaleDateString('fr-CA', options);
  const endFormatted = endDateObj.toLocaleDateString('fr-CA', options);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.5; color: #333; }
    .container { max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 24px; }
    .header p { margin: 5px 0 0; opacity: 0.9; }
    .summary { background: #f8fafc; padding: 15px 20px; border-left: 4px solid #1e40af; margin: 20px 0; }
    .summary-grid { display: flex; gap: 30px; flex-wrap: wrap; }
    .summary-item { }
    .summary-label { font-size: 12px; color: #666; text-transform: uppercase; }
    .summary-value { font-size: 24px; font-weight: bold; }
    .summary-value.green { color: #16a34a; }
    .summary-value.red { color: #dc2626; }
    .section { margin: 25px 0; }
    .section-title { font-size: 16px; font-weight: bold; padding: 10px 15px; border-radius: 4px; margin-bottom: 10px; }
    .section-title.in { background: #dcfce7; color: #166534; }
    .section-title.out { background: #fee2e2; color: #991b1b; }
    .section-title.adjust { background: #fef3c7; color: #92400e; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { background: #f1f5f9; text-align: left; padding: 10px 12px; border: 1px solid #e2e8f0; }
    td { padding: 10px 12px; border: 1px solid #e2e8f0; }
    tr:nth-child(even) { background: #f8fafc; }
    .qty-in { color: #16a34a; font-weight: bold; }
    .qty-out { color: #dc2626; font-weight: bold; }
    .money { text-align: right; }
    .center { text-align: center; }
    .date-col { font-size: 12px; color: #666; white-space: nowrap; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #666; }
    .empty { color: #666; font-style: italic; padding: 15px; background: #f8fafc; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📦 Rapport Hebdomadaire d'Inventaire</h1>
      <p>Période: ${startFormatted} au ${endFormatted}</p>
    </div>

    <div class="summary">
      <div class="summary-grid">
        <div class="summary-item">
          <div class="summary-label">Total mouvements</div>
          <div class="summary-value">${entries.length + exits.length + adjustments.length}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">Entrées (réceptions)</div>
          <div class="summary-value green">+${formatMoney(totalIn)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">Sorties (BT)</div>
          <div class="summary-value red">-${formatMoney(totalOut)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">Variation nette</div>
          <div class="summary-value ${totalIn - totalOut >= 0 ? 'green' : 'red'}">
            ${totalIn - totalOut >= 0 ? '+' : ''}${formatMoney(totalIn - totalOut)}
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title in">📥 ENTRÉES (Réceptions fournisseurs) - ${entries.length} items</div>
      ${entries.length > 0 ? `
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Produit</th>
              <th>Description</th>
              <th class="center">Qté</th>
              <th class="money">Total</th>
              <th>Référence</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map(e => `
              <tr>
                <td class="date-col">${new Date(e.created_at).toLocaleDateString('fr-CA')}</td>
                <td><strong>${e.product_id}</strong></td>
                <td>${e.product_description || '-'}</td>
                <td class="center qty-in">+${formatQty(e.quantity)} ${e.unit || ''}</td>
                <td class="money">${formatMoney(e.total_cost)}</td>
                <td>${e.reference_number || ''} ${e.notes ? `<br><small>${e.notes}</small>` : ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<div class="empty">Aucune entrée cette semaine</div>'}
    </div>

    <div class="section">
      <div class="section-title out">📤 SORTIES (Bons de Travail) - ${exits.length} items</div>
      ${exits.length > 0 ? `
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Produit</th>
              <th>Description</th>
              <th class="center">Qté</th>
              <th class="money">Total</th>
              <th>Référence</th>
            </tr>
          </thead>
          <tbody>
            ${exits.map(e => `
              <tr>
                <td class="date-col">${new Date(e.created_at).toLocaleDateString('fr-CA')}</td>
                <td><strong>${e.product_id}</strong></td>
                <td>${e.product_description || '-'}</td>
                <td class="center qty-out">-${formatQty(e.quantity)} ${e.unit || ''}</td>
                <td class="money">${formatMoney(e.total_cost)}</td>
                <td>${e.reference_number || ''} ${e.notes ? `<br><small>${e.notes}</small>` : ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<div class="empty">Aucune sortie cette semaine</div>'}
    </div>

    ${adjustments.length > 0 ? `
      <div class="section">
        <div class="section-title adjust">⚙️ AJUSTEMENTS MANUELS - ${adjustments.length} items</div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Produit</th>
              <th>Description</th>
              <th class="center">Qté</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${adjustments.map(e => `
              <tr>
                <td class="date-col">${new Date(e.created_at).toLocaleDateString('fr-CA')}</td>
                <td><strong>${e.product_id}</strong></td>
                <td>${e.product_description || '-'}</td>
                <td class="center">${e.quantity > 0 ? '+' : ''}${formatQty(e.quantity)} ${e.unit || ''}</td>
                <td>${e.notes || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}

    <div class="footer">
      <p>📧 Rapport généré automatiquement par Services TMT</p>
      <p>Généré le: ${new Date().toLocaleString('fr-CA')}</p>
    </div>
  </div>
</body>
</html>
  `;
}
