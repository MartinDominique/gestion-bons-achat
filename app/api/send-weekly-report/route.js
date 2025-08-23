// app/api/send-weekly-report/route.js - VERSION DEBUG COMPLÈTE
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    console.log('🚀 DÉBUT - Envoi automatique du rapport hebdomadaire...');

    // Vérifier les variables d'environnement
    console.log('🔍 Vérification des variables d\'environnement...');
    if (!process.env.RESEND_API_KEY) {
      console.error('❌ RESEND_API_KEY manquante !');
      return Response.json({ error: 'Configuration Resend manquante' }, { status: 500 });
    }
    console.log('✅ RESEND_API_KEY présente');

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.error('❌ Variables Supabase manquantes !');
      return Response.json({ error: 'Configuration Supabase manquante' }, { status: 500 });
    }
    console.log('✅ Variables Supabase présentes');

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    console.log('✅ Client Supabase créé');

    // Période
    const periodInDays = 365;
    const startPeriod = new Date();
    startPeriod.setDate(startPeriod.getDate() - periodInDays);
    const startDate = startPeriod.toISOString().split('T')[0];

    console.log(`📅 Période: depuis le ${startDate} (${periodInDays} jours)`);

    // =============== RÉCUPÉRER LES BONS D'ACHAT ===============
    console.log('🔄 Récupération des bons d\'achat...');
    
    const { data: purchaseOrders, error: poError } = await supabase
      .from('purchase_orders')
      .select('*')
      .gte('created_at', startDate)
      .order('created_at', { ascending: false });

    if (poError) {
      console.error('❌ Erreur Supabase purchase_orders:', poError);
      return Response.json({ 
        error: 'Erreur base de données purchase_orders', 
        details: poError 
      }, { status: 500 });
    }

    console.log(`📊 ${purchaseOrders?.length || 0} bons d'achat trouvés`);
    const finalPurchaseOrders = purchaseOrders || [];

    // DEBUG: Analyser les statuts
    if (finalPurchaseOrders.length > 0) {
      console.log('🔍 ANALYSE DES STATUTS:');
      const statusCounts = {};
      finalPurchaseOrders.forEach(po => {
        const status = po.status;
        statusCounts[status] = (statusCounts[status] || 0) + 1;
        if (Object.keys(statusCounts).length <= 3) { // Afficher les 3 premiers exemples
          console.log(`  Exemple: ID ${po.id}, Status: "${status}" (type: ${typeof status}), Client: ${po.client_name}`);
        }
      });
      console.log('📋 Répartition des statuts:', statusCounts);
    }

    // =============== RÉCUPÉRER LES SOUMISSIONS ===============
    console.log('🔄 Récupération des soumissions...');
    
    const { data: submissions, error: submissionsError } = await supabase
      .from('submissions')
      .select('*')
      .gte('created_at', startDate)
      .order('created_at', { ascending: false });

    if (submissionsError) {
      console.error('❌ Erreur Supabase submissions:', submissionsError);
      return Response.json({ 
        error: 'Erreur base de données submissions',
        details: submissionsError 
      }, { status: 500 });
    }

    console.log(`📊 ${submissions?.length || 0} soumissions trouvées`);

    // =============== CALCULER LES STATISTIQUES ===============
    console.log('🧮 Calcul des statistiques...');
    
    // Stats bons d'achat avec debug
    const poStats = {
      total: finalPurchaseOrders.length,
      enAttente: finalPurchaseOrders.filter(o => o.status === 'en_attente').length,
      approuve: finalPurchaseOrders.filter(o => o.status === 'approuve').length,
      refuse: finalPurchaseOrders.filter(o => o.status === 'refuse').length,
      montantTotal: finalPurchaseOrders.reduce((sum, o) => {
        const amount = parseFloat(o.amount || 0);
        if (isNaN(amount)) {
          console.warn(`⚠️ Montant invalide pour PO ${o.id}: ${o.amount}`);
          return sum;
        }
        return sum + amount;
      }, 0)
    };

    console.log('📈 Stats bons d\'achat:', poStats);

    // Stats soumissions
    const submissionStats = {
      total: submissions.length,
      draft: submissions.filter(s => s.status === 'draft').length,
      sent: submissions.filter(s => s.status === 'sent').length,
      accepted: submissions.filter(s => s.status === 'accepted').length,
      montantTotal: submissions.reduce((sum, s) => {
        const amount = parseFloat(s.amount || 0);
        if (isNaN(amount)) {
          console.warn(`⚠️ Montant invalide pour submission ${s.id}: ${s.amount}`);
          return sum;
        }
        return sum + amount;
      }, 0)
    };

    console.log('📈 Stats soumissions:', submissionStats);

    // Test création email sans l'envoyer
    console.log('📧 Préparation du contenu email...');
    const htmlContent = `<h1>Test Email Content</h1><p>PO: ${poStats.total}, Soumissions: ${submissionStats.total}</p>`;
    
    console.log('✅ Contenu email créé, longueur:', htmlContent.length);

    // Test temporaire - retourner les données sans envoyer l'email
    return Response.json({ 
      success: true, 
      debug: true,
      purchaseOrdersCount: poStats.total,
      submissionsCount: submissionStats.total,
      totalAmount: poStats.montantTotal + submissionStats.montantTotal,
      poStats,
      submissionStats,
      message: 'Debug - données récupérées avec succès (email non envoyé)'
    });

  } catch (error) {
    console.error('❌ ERREUR COMPLÈTE:', error);
    console.error('Stack trace:', error.stack);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
} // ← Cette accolade ferme la fonction GET()

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
} // ← Cette accolade ferme la fonction POST()
