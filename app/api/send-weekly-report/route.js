// app/api/send-weekly-report/route.js - VERSION CORRIGÉE
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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // 💡 Période personnalisable - changez le nombre de jours ici
const periodInDays = 365; // 7 = semaine, 30 = mois, 90 = trimestre, 365 = année

const startPeriod = new Date();
startPeriod.setDate(startPeriod.getDate() - periodInDays);
const startDate = startPeriod.toISOString().split('T')[0];

// Déterminer le nom de la période pour l'affichage
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
// Après avoir récupéré les purchase_orders, ajoutez :
console.log('🔍 DEBUG - Analyse des statuts:');
finalPurchaseOrders.forEach((po, index) => {
  if (index < 10) { // Afficher les 10 premiers
    console.log(`ID: ${po.id}, Status: "${po.status}", Type: ${typeof po.status}`);
  }
});
    
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

    // Ajoutez ceci juste après avoir récupéré les purchase_orders
console.log('🔍 Statuts trouvés dans la base:');
const uniqueStatuses = [...new Set(finalPurchaseOrders.map(o => o.status))];
console.log('Statuts uniques:', uniqueStatuses);

// Afficher quelques exemples
console.log('Premiers bons d\'achat:', finalPurchaseOrders.slice(0, 3).map(o => ({ id: o.id, status: o.status, client: o.client_name })));

    // =============== CALCULER LES STATISTIQUES ===============
    
    // Stats bons d'achat
    const poStats = {
      total: finalPurchaseOrders.length,
      enAttente: finalPurchaseOrders.filter(o => o.status === 'en_attente').length,
      approuve: finalPurchaseOrders.filter(o => o.status === 'approuve').length,
      refuse: finalPurchaseOrders.filter(o => o.status === 'refuse').length,
      montantTotal: finalPurchaseOrders.reduce((sum, o) => sum + parseFloat(o.amount || 0), 0)
    };

    // Stats soumissions - CORRIGÉ
    const submissionStats = {
      total: submissions.length,
      draft: submissions.filter(s => s.status === 'draft').length,
      sent: submissions.filter(s => s.status === 'sent').length,
      accepted: submissions.filter(s => s.status === 'accepted').length,
      montantTotal: submissions.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0)
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
                <li>⏳ En attente: ${poStats.enAttente}</li>
                <li>✅ Approuvés: ${poStats.approuve}</li>
                <li>❌ Refusés: ${poStats.refuse}</li>
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
                        ${po.status === 'approuve' ? '✅' : po.status === 'refuse' ? '❌' : '⏳'}
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
              </ul>
            </div>
            <div>
              <p><strong>📋 Détails:</strong></p>
              ${submissions.length > 0 ? `
                <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
                  <tr style="background: #dbeafe;">
                    <th style="padding: 4px; border: 1px solid #93c5fd;">N° Soumission</th>
                    <th style="padding: 4px; border: 1px solid #93c5fd;">Client</th>
                    <th style="padding: 4px; border: 1px solid #93c5fd;">Total</th>
                  </tr>
                  ${submissions.slice(0, 5).map(submission => `
                    <tr>
                      <td style="padding: 4px; border: 1px solid #93c5fd;">${submission.submission_number || submission.id}</td>
                      <td style="padding: 4px; border: 1px solid #93c5fd;">${submission.client_name || 'N/A'}</td>
                      <td style="padding: 4px; border: 1px solid #93c5fd;">${parseFloat(submission.amount || 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</td>
                    </tr>
                  `).join('')}
                  ${submissions.length > 5 ? `<tr><td colspan="3" style="padding: 4px; text-align: center; font-style: italic;">... et ${submissions.length - 5} autres</td></tr>` : ''}
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
                <li>💰 Soumissions: ${submissionStats.montantTotal.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</li>
              </ul>
            </div>
            <div>
              <p><strong>Chiffres clés:</strong></p>
              <ul style="list-style: none; padding: 0;">
                <li>✅ Bons approuvés: ${poStats.approuve}</li>
                <li>📤 Soumissions envoyées: ${submissionStats.sent}</li>
                <li>💡 Conversion: ${submissionStats.total > 0 ? Math.round((poStats.approuve / submissionStats.total) * 100) : 0}%</li>
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
    
    const emailTo = process.env.WEEKLY_REPORT_EMAIL || 'servicestmt@gmail.com';
    
    const result = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: emailTo,
      subject: `📊 Rapport Hebdomadaire Services TMT - ${poStats.total + submissionStats.total} documents (${(poStats.montantTotal + submissionStats.montantTotal).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })})`,
      html: htmlContent
    });

    if (result.error) {
      console.error('❌ Erreur Resend:', result.error);
      return Response.json({ error: result.error }, { status: 400 });
    }

    console.log(`✅ Rapport envoyé avec succès ! ID: ${result.data?.id}`);

    return Response.json({ 
      success: true, 
      purchaseOrdersCount: poStats.total,
      submissionsCount: submissionStats.total,
      totalAmount: poStats.montantTotal + submissionStats.montantTotal,
      emailId: result.data?.id,
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
