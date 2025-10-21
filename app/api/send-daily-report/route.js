import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

// Fonction pour calculer la couleur de la ligne selon la date
function getRowColor(deliveryDate) {
  if (!deliveryDate) return '';
  
  const today = new Date();
  const delivery = new Date(deliveryDate);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  
  // Normaliser les dates pour comparer seulement jour/mois/année
  today.setHours(0, 0, 0, 0);
  delivery.setHours(0, 0, 0, 0);
  tomorrow.setHours(0, 0, 0, 0);
  
  // Rouge : aujourd'hui ou passé
  if (delivery <= today) {
    return 'background-color: #ff4444; color: #ffffff; font-weight: bold;'; // Rouge clair avec texte rouge foncé
  }
  
  // Orange : demain (1 jour avant)
  if (delivery.getTime() === tomorrow.getTime()) {
    return 'background-color: #ff8c00; color: #ffffff; font-weight: bold;'; // Orange clair avec texte orange foncé
  }
  
  return '';
}

// Fonction pour formater la date en français
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-CA'); // Format YYYY-MM-DD
}

// Fonction pour formater le montant
function formatAmount(amount) {
  if (!amount) return '0,00 $';
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD'
  }).format(amount);
}

// Fonction pour traduire le statut
function translateStatus(status) {
  const statusMap = {
    'in_order': 'En commande',
    'ordered': 'Commandé'
  };
  return statusMap[status] || status;
}

export async function POST(request) {
  try {
    console.log('🚀 Début envoi rapport quotidien des achats fournisseurs');
    
    // Récupérer les achats en cours (draft et ordered) triés par date de création
    const { data: purchases, error } = await supabase
      .from('supplier_purchases')
      .select(`
        id,
        purchase_number,
        supplier_name,
        ba_acomba,
        linked_po_number,
        created_at,
        delivery_date,
        total_amount,
        status
      `)
      .in('status', ['in_order', 'ordered'])
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ Erreur Supabase:', error);
      return NextResponse.json({ error: 'Erreur Supabase', details: error }, { status: 500 });
    }

    console.log(`📊 ${purchases?.length || 0} achat(s) en cours trouvés`);

    // Si aucun achat, on envoie quand même un email pour confirmer
    const purchaseRows = purchases && purchases.length > 0 
      ? purchases.map(purchase => {
          const rowStyle = getRowColor(purchase.delivery_date);
          return `
            <tr style="${rowStyle}">
              <td style="padding: 12px; border: 1px solid #e5e7eb;">${purchase.purchase_number || 'N/A'}</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb;">${purchase.supplier_name || 'N/A'}</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb;">${purchase.ba_acomba || 'N/A'}</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb;">${purchase.linked_po_number || 'N/A'}</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb;">${formatDate(purchase.created_at)}</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb;">${formatDate(purchase.delivery_date)}</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb;">${formatAmount(purchase.total_amount)}</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb;">${translateStatus(purchase.status)}</td>
            </tr>
          `;
        }).join('')
      : `
        <tr>
          <td colspan="8" style="padding: 20px; text-align: center; font-style: italic; color: #6b7280;">
            Aucun achat en cours aujourd'hui
          </td>
        </tr>
      `;

    const currentDate = new Date().toLocaleDateString('fr-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rapport quotidien des achats fournisseurs</title>
  <style>
    /* CSS responsive pour mobile */
    @media only screen and (max-width: 600px) {
      .container {
        width: 100% !important;
        padding: 10px !important;
      }
      .header {
        padding: 20px !important;
      }
      .content {
        padding: 15px !important;
      }
      .desktop-table {
        display: none !important;
      }
      .mobile-card {
        display: block !important;
      }
      .mobile-card-item {
        margin-bottom: 15px !important;
        border: 1px solid #e5e7eb !important;
        border-radius: 8px !important;
        padding: 12px !important;
        background: white !important;
      }
      .mobile-label {
        font-size: 11px !important;
        color: #6b7280 !important;
        font-weight: 600 !important;
        text-transform: uppercase !important;
      }
      .mobile-value {
        font-size: 14px !important;
        margin-top: 2px !important;
        margin-bottom: 8px !important;
      }
      h1 {
        font-size: 20px !important;
      }
    }
    /* Desktop par défaut */
    .mobile-card {
      display: none;
    }
  </style>
</head>
<body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f9fafb;">
  <div class="container" style="max-width: 1200px; margin: 0 auto; background-color: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    
    <!-- En-tête -->
    <div class="header" style="padding: 30px; background-color: #1f2937; color: white; border-radius: 8px 8px 0 0;">
      <h1 style="margin: 0; font-size: 24px;">📋 Rapport quotidien des achats fournisseurs</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">${currentDate}</p>
    </div>

    <!-- Contenu -->
    <div class="content" style="padding: 30px;">
      
      <!-- Légende des couleurs -->
      <div style="margin-bottom: 20px; padding: 15px; background-color: #f3f4f6; border-radius: 6px;">
        <h3 style="margin: 0 0 10px 0; font-size: 16px;">Légende des alertes :</h3>
        <div style="display: flex; gap: 20px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 20px; height: 20px; background-color: #ff8c00; border: 1px solid #ff8c00; border-radius: 3px;"></div>
            <span style="font-size: 14px;">Orange vif : Livraison demain</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 20px; height: 20px; background-color: #ff4444; border: 1px solid #ff4444; border-radius: 3px;"></div>
            <span style="font-size: 14px;">Rouge vif : Livraison aujourd'hui/retard</span>
          </div>
        </div>
      </div>

      <!-- Version DESKTOP - Tableau -->
      <div class="desktop-table">
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <thead>
            <tr style="background-color: #f9fafb;">
              <th style="padding: 15px 12px; border: 1px solid #e5e7eb; text-align: left; font-weight: 600; color: #374151; font-size: 12px;">#Commande</th>
              <th style="padding: 15px 12px; border: 1px solid #e5e7eb; text-align: left; font-weight: 600; color: #374151; font-size: 12px;">Fournisseur</th>
              <th style="padding: 15px 12px; border: 1px solid #e5e7eb; text-align: left; font-weight: 600; color: #374151; font-size: 12px;">BA Acomba</th>
              <th style="padding: 15px 12px; border: 1px solid #e5e7eb; text-align: left; font-weight: 600; color: #374151; font-size: 12px;">PO Client</th>
              <th style="padding: 15px 12px; border: 1px solid #e5e7eb; text-align: left; font-weight: 600; color: #374151; font-size: 12px;">Date Création</th>
              <th style="padding: 15px 12px; border: 1px solid #e5e7eb; text-align: left; font-weight: 600; color: #374151; font-size: 12px;">Date prévue</th>
              <th style="padding: 15px 12px; border: 1px solid #e5e7eb; text-align: left; font-weight: 600; color: #374151; font-size: 12px;">Montant</th>
              <th style="padding: 15px 12px; border: 1px solid #e5e7eb; text-align: left; font-weight: 600; color: #374151; font-size: 12px;">Statut</th>
            </tr>
          </thead>
          <tbody>
            ${purchaseRows}
          </tbody>
        </table>
      </div>

      <!-- Version MOBILE - Cartes -->
      <div class="mobile-card">
        ${purchases && purchases.length > 0 
          ? purchases.map(purchase => {
              const rowStyle = getRowColor(purchase.delivery_date);
              return `
                <div class="mobile-card-item" style="${rowStyle}">
                  <div class="mobile-label">#Commande</div>
                  <div class="mobile-value" style="font-weight: bold;">${purchase.purchase_number || 'N/A'}</div>
                  
                  <div class="mobile-label">Fournisseur</div>
                  <div class="mobile-value">${purchase.supplier_name || 'N/A'}</div>
                  
                  <div style="display: flex; gap: 15px; margin-bottom: 8px;">
                    <div style="flex: 1;">
                      <div class="mobile-label">BA Acomba</div>
                      <div class="mobile-value">${purchase.ba_acomba || 'N/A'}</div>
                    </div>
                    <div style="flex: 1;">
                      <div class="mobile-label">PO Client</div>
                      <div class="mobile-value">${purchase.linked_po_number || 'N/A'}</div>
                    </div>
                  </div>
                  
                  <div style="display: flex; gap: 15px; margin-bottom: 8px;">
                    <div style="flex: 1;">
                      <div class="mobile-label">Date Création</div>
                      <div class="mobile-value">${formatDate(purchase.created_at)}</div>
                    </div>
                    <div style="flex: 1;">
                      <div class="mobile-label">Date prévue</div>
                      <div class="mobile-value">${formatDate(purchase.delivery_date)}</div>
                    </div>
                  </div>
                  
                  <div style="display: flex; gap: 15px;">
                    <div style="flex: 1;">
                      <div class="mobile-label">Montant</div>
                      <div class="mobile-value" style="color: #059669; font-weight: bold;">${formatAmount(purchase.total_amount)}</div>
                    </div>
                    <div style="flex: 1;">
                      <div class="mobile-label">Statut</div>
                      <div class="mobile-value">${translateStatus(purchase.status)}</div>
                    </div>
                  </div>
                </div>
              `;
            }).join('')
          : `
            <div class="mobile-card-item">
              <div style="text-align: center; padding: 20px; font-style: italic; color: #6b7280;">
                Aucun achat en cours aujourd'hui
              </div>
            </div>
          `
        }
      </div>

      <!-- Résumé -->
      <div style="margin-top: 30px; padding: 20px; background-color: #f9fafb; border-radius: 6px;">
        <h3 style="margin: 0 0 10px 0; color: #374151;">Résumé :</h3>
        <p style="margin: 5px 0; color: #6b7280;">
          📦 <strong>${purchases?.length || 0}</strong> achat(s) en cours
        </p>
        <p style="margin: 5px 0; color: #6b7280;">
          🔄 Statuts inclus : En commande, Commandé
        </p>
      </div>

      <!-- Pied de page -->
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">
        <p style="margin: 0;">Ce rapport est généré automatiquement tous les jours à 8h00 (heure de l'Est).</p>
        <p style="margin: 5px 0 0 0;">Système de gestion des achats fournisseurs - Services TMT Inc.</p>
      </div>

    </div>
  </div>
</body>
</html>
`;

    // Envoyer l'email avec le domaine vérifié
    console.log('📧 Envoi email depuis: noreply@servicestmt.ca');
    console.log('📧 Destinataires:', ['servicestmt@gmail.com', 'info.servicestmt@gmail.com']);
    
    const { data, error: resendError } = await resend.emails.send({
      from: 'Système TMT <noreply@servicestmt.ca>',
      to: ['servicestmt@gmail.com', 'info.servicestmt@gmail.com'],
      subject: `📋 Rapport quotidien - ${purchases?.length || 0} achat(s) en cours`,
      html: emailHtml,
      reply_to: 'info.servicestmt@gmail.com',
    });

    if (resendError) {
      console.error('❌ Erreur Resend:', resendError);
      return NextResponse.json({ 
        error: 'Erreur envoi email', 
        details: resendError 
      }, { status: 500 });
    }

    console.log('✅ Email envoyé avec succès! ID:', data?.id);
    
    return NextResponse.json({ 
      success: true, 
      message: `Email envoyé avec succès. ${purchases?.length || 0} achat(s) traités.`,
      emailId: data?.id,
      purchaseCount: purchases?.length || 0
    });

  } catch (error) {
    console.error('💥 Erreur générale:', error);
    return NextResponse.json({ 
      error: 'Erreur serveur', 
      details: error.message 
    }, { status: 500 });
  }
}
