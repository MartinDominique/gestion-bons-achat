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

    // Calculer la date de la semaine dernière (7 jours)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const startDate = oneWeekAgo.toISOString().split('T')[0];

    console.log(`📅 Récupération des données depuis le ${startDate}`);

    // =============== RÉCUPÉRER LES BONS D'ACHAT ===============
    const { data: purchaseOrders, error: poError } = await supabase
      .from('purchase_orders')
      .select(`
        *,
        clients!client_id (name, company)
      `)
      .gte('date', startDate)
      .order('date', { ascending: false });

    if (poError) {
      console.error('❌ Erreur Supabase purchase_orders:', poError);
      // Essayer sans jointure
      const { data: poSimple, error: poSimpleError } = await supabase
        .from('purchase_orders')
        .select('*')
        .gte('date', startDate)
        .order('date', { ascending: false });
        
      if (poSimpleError) {
        console.error('❌ Erreur même en simple:', poSimpleError);
        return Response.json({ error: 'Erreur base de données purchase_orders' }, { status: 500 });
      }
      
      console.log(`📊 ${poSimple?.length || 0} bons d'achat trouvés (sans jointure)`);
      // Utiliser les données simples
      var finalPurchaseOrders = poSimple || [];
    } else {
      console.log(`📊 ${purchaseOrders?.length || 0} bons d'achat trouvés (avec jointure)`);
      var finalPurchaseOrders = purchaseOrders || [];
    }

    // =============== RÉCUPÉRER LES SOUMISSIONS ===============
    const { data: quotes, error: quotesError } = await supabase
      .from('quotes')
      .select(`
        *,
        clients (name, company)
      `)
      .gte('created_at', startDate)
      .order('created_at', { ascending: false });

    if (quotesError) {
      console.error('❌ Erreur Supabase quotes:', quotesError);
      return Response.json({ error: 'Erreur base de données quotes' }, { status: 500 });
    }

    console.log(`📊 ${quotes?.length || 0} soumissions trouvées`);

    // =============== CALCULER LES STATISTIQUES ===============
    
    // Stats bons d'achat
    const poStats = {
      total: finalPurchaseOrders.length,
      enAttente: finalPurchaseOrders.filter(o => o.status === 'en_attente').length,
      approuve: finalPurchaseOrders.filter(o => o.status === 'approuve').length,
      refuse: finalPurchaseOrders.filter(o => o.status === 'refuse').length,
      montantTotal: finalPurchaseOrders.reduce((sum, o) => sum + parseFloat(o.amount || 0), 0)
    };

    // Stats soumissions
    const quoteStats = {
      total: quotes.length,
      draft: quotes.filter(q => q.status === 'draft').length,
      sent: quotes.filter(q => q.status === 'sent').length,
      accepted: quotes.filter(q => q.status === 'accepted').length,
      montantTotal: quotes.reduce((sum, q) => sum + parseFloat(q.total || 0), 0)
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
                      <td style="padding: 4px; border: 1px solid #d1d5db;">${new Date(po.date || po.created_at).toLocaleDateString('fr-CA')}</td>
                      <td style="padding: 4px; border: 1px solid #d1d5db;">${po.client_name || po.clients?.name || 'N/A'}</td>
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
          <h3 style="color: #1e40af; margin-top: 0;">📄 Soumissions (${quoteStats.total})</h3>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
            <div>
              <p><strong>📊 Résumé:</strong></p>
              <ul style="list-style: none; padding: 0;">
                <li>📝 Brouillons: ${quoteStats.draft}</li>
                <li>📤 Envoyées: ${quoteStats.sent}</li>
                <li>✅ Acceptées: ${quoteStats.accepted}</li>
                <li>💰 Montant total: ${quoteStats.montantTotal.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</li>
              </ul>
            </div>
            <div>
              <p><strong>📋 Détails:</strong></p>
              ${quotes.length > 0 ? `
                <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
                  <tr style="background: #dbeafe;">
                    <th style="padding: 4px; border: 1px solid #93c5fd;">N° Soumission</th>
                    <th style="padding: 4px; border: 1px solid #93c5fd;">Client</th>
                    <th style="padding: 4px; border: 1px solid #93c5fd;">Total</th>
                  </tr>
                  ${quotes.slice(0, 5).map(quote => `
                    <tr>
                      <td style="padding: 4px; border: 1px solid #93c5fd;">${quote.id}</td>
                      <td style="padding: 4px; border: 1px solid #93c5fd;">${quote.clients?.name || 'N/A'}</td>
                      <td style="padding: 4px; border: 1px solid #93c5fd;">${parseFloat(quote.total || 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</td>
                    </tr>
                  `).join('')}
                  ${quotes.length > 5 ? `<tr><td colspan="3" style="padding: 4px; text-align: center; font-style: italic;">... et ${quotes.length - 5} autres</td></tr>` : ''}
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
                <li>📋 Total documents: ${poStats.total + quoteStats.total}</li>
                <li>💰 Bons d'achat: ${poStats.montantTotal.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</li>
                <li>💰 Soumissions: ${quoteStats.montantTotal.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</li>
              </ul>
            </div>
            <div>
              <p><strong>Chiffres clés:</strong></p>
              <ul style="list-style: none; padding: 0;">
                <li>✅ Bons approuvés: ${poStats.approuve}</li>
                <li>📤 Soumissions envoyées: ${quoteStats.sent}</li>
                <li>💡 Conversion: ${quoteStats.total > 0 ? Math.round((poStats.approuve / quoteStats.total) * 100) : 0}%</li>
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
      subject: `📊 Rapport Hebdomadaire Services TMT - ${poStats.total + quoteStats.total} documents (${(poStats.montantTotal + quoteStats.montantTotal).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })})`,
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
      quotesCount: quoteStats.total,
      totalAmount: poStats.montantTotal + quoteStats.montantTotal,
      emailId: result.data?.id,
      message: `Rapport envoyé avec ${poStats.total} bon(s) d'achat et ${quoteStats.total} soumission(s)`
    });

  } catch (error) {
    console.error('❌ Erreur complète:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
}
