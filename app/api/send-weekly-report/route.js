// app/api/send-weekly-report/route.js - VERSION AVEC RAPPORT INVENTAIRE
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function GET() {
  try {
    console.log('🚀 Envoi automatique du rapport hebdomadaire...');

    // Vérifier les variables d'environnement
    if (!process.env.RESEND_API_KEY) {
      console.error('❌ RESEND_API_KEY manquante !');
      return Response.json({ error: 'Configuration Resend manquante' }, { status: 500 });
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.error('❌ Variables Supabase manquantes !');
      return Response.json({ error: 'Configuration Supabase manquante' }, { status: 500 });
    }

    // Période personnalisable
    const periodInDays = 365;
    const startPeriod = new Date();
    startPeriod.setDate(startPeriod.getDate() - periodInDays);
    const startDate = startPeriod.toISOString().split('T')[0];

    // Déterminer le nom de la période
    let periodName = 'Personnalisé';
    if (periodInDays === 7) periodName = 'Hebdomadaire';
    else if (periodInDays === 30) periodName = 'Mensuel';
    else if (periodInDays === 90) periodName = 'Trimestriel';
    else if (periodInDays === 365) periodName = 'Annuel';

    console.log(`📅 Récupération des données depuis le ${startDate} (${periodInDays} jours - ${periodName})`);

    // =============== RÉCUPÉRER LES BONS D'ACHAT ===============
    const { data: purchaseOrders, error: poError } = await supabase
      .from('purchase_orders')
      .select('*')
      .gte('created_at', startDate)
      .order('created_at', { ascending: false });

    if (poError) {
      console.error('❌ Erreur Supabase purchase_orders:', poError);
      return Response.json({ error: 'Erreur base de données purchase_orders' }, { status: 500 });
    }

    console.log(`📊 ${purchaseOrders?.length || 0} bons d'achat trouvés`);
    const finalPurchaseOrders = purchaseOrders || [];

    // =============== RÉCUPÉRER LES SOUMISSIONS ===============
    const { data: submissions, error: submissionsError } = await supabase
      .from('submissions')
      .select('*')
      .gte('created_at', startDate)
      .order('created_at', { ascending: false });

    if (submissionsError) {
      console.error('❌ Erreur Supabase submissions:', submissionsError);
      return Response.json({ error: 'Erreur base de données submissions' }, { status: 500 });
    }

    console.log(`📊 ${submissions?.length || 0} soumissions trouvées`);
    const finalSubmissions = submissions || [];

    // =============== CALCULER LES STATISTIQUES ===============
    
    // Stats bons d'achat avec les 3 statuts
    const poStats = {
      total: finalPurchaseOrders.length,
      inProgress: finalPurchaseOrders.filter(o => o.status === 'in_progress').length,
      partial: finalPurchaseOrders.filter(o => o.status === 'partial').length,
      completed: finalPurchaseOrders.filter(o => o.status === 'completed').length,
      montantTotal: finalPurchaseOrders.reduce((sum, o) => sum + parseFloat(o.amount || 0), 0)
    };

    // Stats soumissions avec montant accepté séparé
    const submissionStats = {
      total: finalSubmissions.length,
      draft: finalSubmissions.filter(s => s.status === 'draft').length,
      sent: finalSubmissions.filter(s => s.status === 'sent').length,
      accepted: finalSubmissions.filter(s => s.status === 'accepted').length,
      montantTotal: finalSubmissions.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0),
      montantAccepted: finalSubmissions
        .filter(s => s.status === 'accepted')
        .reduce((sum, s) => sum + parseFloat(s.amount || 0), 0)
    };

    // =============== CRÉER LE CONTENU EMAIL ===============
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
        <h2 style="color: #1f2937;">📋 Rapport Hebdomadaire - Services TMT</h2>
        <p><strong>Période:</strong> ${startDate} à ${new Date().toISOString().split('T')[0]}</p>
        
        <!-- SECTION BONS D'ACHAT -->
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #374151; margin-top: 0;">💰 Bons d'Achat (${poStats.total})</h3>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
            <div>
              <p><strong>📊 Résumé:</strong></p>
              <ul style="list-style: none; padding: 0;">
                <li>🔵 En cours: ${poStats.inProgress}</li>
                <li>🚚 Partiellement livré: ${poStats.partial}</li>
                <li>✅ Complété: ${poStats.completed}</li>
                <li>💰 Montant total: ${poStats.montantTotal.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</li>
              </ul>
            </div>
            <div>
              <p><strong>📋 Détails:</strong></p>
              ${finalPurchaseOrders.length > 0 ? `
                <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
                  <tr style="background: #e5e7eb;">
                    <th style="padding: 4px; border: 1px solid #d1d5db;">Date</th>
                    <th style="padding: 4px; border: 1px solid #d1d5db;">Client</th>
                    <th style="padding: 4px; border: 1px solid #d1d5db;">Montant</th>
                    <th style="padding: 4px; border: 1px solid #d1d5db;">Statut</th>
                  </tr>
                  ${finalPurchaseOrders.slice(0, 5).map(po => `
                    <tr>
                      <td style="padding: 4px; border: 1px solid #d1d5db;">${new Date(po.created_at).toLocaleDateString('fr-CA')}</td>
                      <td style="padding: 4px; border: 1px solid #d1d5db;">${po.client_name || 'N/A'}</td>
                      <td style="padding: 4px; border: 1px solid #d1d5db;">${parseFloat(po.amount || 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</td>
                      <td style="padding: 4px; border: 1px solid #d1d5db;">
                        ${po.status === 'completed' ? '✅' : 
                          po.status === 'partial' ? '🚚' : '🔵'}
                      </td>
                    </tr>
                  `).join('')}
                  ${finalPurchaseOrders.length > 5 ? `<tr><td colspan="4" style="padding: 4px; text-align: center; font-style: italic;">... et ${finalPurchaseOrders.length - 5} autres</td></tr>` : ''}
                </table>
              ` : '<p style="color: #6b7280; font-style: italic;">Aucun bon d\'achat cette semaine</p>'}
            </div>
          </div>
        </div>

        <!-- SECTION SOUMISSIONS -->
        <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #1e40af; margin-top: 0;">📄 Soumissions (${submissionStats.total})</h3>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
            <div>
              <p><strong>📊 Résumé:</strong></p>
              <ul style="list-style: none; padding: 0;">
                <li>📝 Brouillons: ${submissionStats.draft}</li>
                <li>📤 Envoyées: ${submissionStats.sent}</li>
                <li>✅ Acceptées: ${submissionStats.accepted}</li>
                <li>💰 Montant total: ${submissionStats.montantTotal.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</li>
                <li>💚 Montant accepté: ${submissionStats.montantAccepted.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</li>
              </ul>
            </div>
            <div>
              <p><strong>📋 Détails:</strong></p>
              ${finalSubmissions.length > 0 ? `
                <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
                  <tr style="background: #dbeafe;">
                    <th style="padding: 4px; border: 1px solid #93c5fd;">N° Soumission</th>
                    <th style="padding: 4px; border: 1px solid #93c5fd;">Client</th>
                    <th style="padding: 4px; border: 1px solid #93c5fd;">Total</th>
                  </tr>
                  ${finalSubmissions.slice(0, 5).map(submission => `
                    <tr>
                      <td style="padding: 4px; border: 1px solid #93c5fd;">${submission.submission_number || submission.id}</td>
                      <td style="padding: 4px; border: 1px solid #93c5fd;">${submission.client_name || 'N/A'}</td>
                      <td style="padding: 4px; border: 1px solid #93c5fd;">${parseFloat(submission.amount || 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</td>
                    </tr>
                  `).join('')}
                  ${finalSubmissions.length > 5 ? `<tr><td colspan="3" style="padding: 4px; text-align: center; font-style: italic;">... et ${finalSubmissions.length - 5} autres</td></tr>` : ''}
                </table>
              ` : '<p style="color: #6b7280; font-style: italic;">Aucune soumission cette semaine</p>'}
            </div>
          </div>
        </div>

        <!-- RÉSUMÉ GLOBAL -->
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #166534; margin-top: 0;">📈 Résumé Global</h3>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
            <div>
              <p><strong>Activité:</strong></p>
              <ul style="list-style: none; padding: 0;">
                <li>📋 Total documents: ${poStats.total + submissionStats.total}</li>
                <li>💰 Bons d'achat: ${poStats.montantTotal.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</li>
                <li>💰 Soumissions (total): ${submissionStats.montantTotal.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</li>
                <li>💚 Soumissions acceptées: ${submissionStats.montantAccepted.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</li>
              </ul>
            </div>
            <div>
              <p><strong>Chiffres clés:</strong></p>
              <ul style="list-style: none; padding: 0;">
                <li>✅ Bons complétés: ${poStats.completed}</li>
                <li>📤 Soumissions envoyées: ${submissionStats.sent}</li>
                <li>🎯 Taux acceptation: ${submissionStats.sent > 0 ? Math.round((submissionStats.accepted / submissionStats.sent) * 100) : 0}%</li>
              </ul>
            </div>
          </div>
        </div>
        
        <p style="margin-top: 20px; font-size: 0.9em; color: #6b7280;">
          <em>Rapport généré automatiquement le ${new Date().toLocaleDateString('fr-CA')} à ${new Date().toLocaleTimeString('fr-CA')}</em><br>
          <em>📧 Envoyé automatiquement tous les vendredis à 17h</em>
        </p>
      </div>
    `;

    // =============== ENVOYER L'EMAIL ===============
    const resend = new Resend(process.env.RESEND_API_KEY);
    
    const emailTo = process.env.WEEKLY_REPORT_EMAIL || process.env.COMPANY_EMAIL || 'servicestmt@gmail.com';
    
    const result = await resend.emails.send({
      from: 'Services TMT <noreply@servicestmt.ca>',
      to: emailTo,
      subject: `📊 Rapport Hebdomadaire Services TMT - ${poStats.total + submissionStats.total} documents (${(poStats.montantTotal + submissionStats.montantTotal).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })})`,
      html: htmlContent
    });

    if (result.error) {
      console.error('❌ Erreur Resend:', result.error);
      return Response.json({ error: result.error }, { status: 400 });
    }

    console.log(`✅ Rapport hebdo envoyé avec succès ! ID: ${result.data?.id}`);

    // =============== RAPPORT D'INVENTAIRE HEBDOMADAIRE ===============
    console.log('📦 Génération du rapport d\'inventaire hebdomadaire...');
    
    let inventoryResult = { sent: false, message: 'Non exécuté' };
    
    try {
      // Période: 7 derniers jours
      const endDate = new Date();
      const startDateInv = new Date();
      startDateInv.setDate(startDateInv.getDate() - 7);
      
      const startOfWeek = startDateInv.toISOString();
      const endOfWeek = endDate.toISOString();
      
      const startDateStr = startDateInv.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      console.log(`📅 Période inventaire: ${startDateStr} au ${endDateStr}`);

      // Récupérer les mouvements de la semaine
      const { data: movements, error: movError } = await supabase
        .from('inventory_movements')
        .select('*')
        .gte('created_at', startOfWeek)
        .lte('created_at', endOfWeek)
        .order('created_at', { ascending: true });

      if (movError) {
        console.error('❌ Erreur récupération mouvements:', movError);
        throw movError;
      }

      // Si aucun mouvement, ne pas envoyer d'email
      if (!movements || movements.length === 0) {
        console.log('📭 Aucun mouvement d\'inventaire cette semaine');
        inventoryResult = { sent: false, message: 'Aucun mouvement cette semaine' };
      } else {
        // Séparer entrées et sorties
        const entries = movements.filter(m => m.movement_type === 'IN');
        const exits = movements.filter(m => m.movement_type === 'OUT');
        const adjustments = movements.filter(m => m.movement_type === 'ADJUST');

        // Calculer les totaux
        const totalIn = entries.reduce((sum, e) => sum + (parseFloat(e.total_cost) || 0), 0);
        const totalOut = exits.reduce((sum, e) => sum + (parseFloat(e.total_cost) || 0), 0);

        // Générer le HTML du rapport inventaire
        const inventoryHtml = generateInventoryReportHTML(startDateStr, endDateStr, entries, exits, adjustments, totalIn, totalOut);

        // Email destinataire
        const companyEmail = process.env.COMPANY_EMAIL || 'info.servicestmt@gmail.com';

        // Envoyer l'email d'inventaire
        const { error: emailError } = await resend.emails.send({
          from: 'Services TMT <noreply@servicestmt.ca>',
          to: [companyEmail],
          subject: `📦 Rapport Inventaire Hebdo - ${startDateStr} au ${endDateStr} (${movements.length} mouvements)`,
          html: inventoryHtml
        });

        if (emailError) {
          console.error('❌ Erreur envoi email inventaire:', emailError);
          throw emailError;
        }

        console.log(`✅ Rapport inventaire hebdo envoyé à ${companyEmail}`);
        console.log(`   - Entrées: ${entries.length} (${totalIn.toFixed(2)}$)`);
        console.log(`   - Sorties: ${exits.length} (${totalOut.toFixed(2)}$)`);
        console.log(`   - Ajustements: ${adjustments.length}`);

        inventoryResult = {
          sent: true,
          period: `${startDateStr} au ${endDateStr}`,
          movementsCount: movements.length,
          entries: entries.length,
          exits: exits.length,
          adjustments: adjustments.length,
          totalIn: totalIn.toFixed(2),
          totalOut: totalOut.toFixed(2)
        };
      }
    } catch (inventoryError) {
      console.error('⚠️ Erreur rapport inventaire (non bloquant):', inventoryError.message);
      inventoryResult = { sent: false, error: inventoryError.message };
    }

    // =============== RETOUR FINAL ===============
    return Response.json({ 
      success: true, 
      purchaseOrdersCount: poStats.total,
      submissionsCount: submissionStats.total,
      totalAmount: poStats.montantTotal + submissionStats.montantTotal,
      emailId: result.data?.id,
      poStats,
      submissionStats,
      inventoryReport: inventoryResult,
      message: `Rapport envoyé avec ${poStats.total} bon(s) d'achat et ${submissionStats.total} soumission(s)`
    });

  } catch (error) {
    console.error('❌ Erreur complète:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
}

// Fonction POST pour les appels manuels
export async function POST(request) {
  try {
    console.log('📧 Envoi manuel du rapport...');
    return await GET();
  } catch (error) {
    console.error('❌ Erreur POST:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
}

// =============== FONCTION GÉNÉRATION HTML INVENTAIRE ===============
function generateInventoryReportHTML(startDate, endDate, entries, exits, adjustments, totalIn, totalOut) {
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
