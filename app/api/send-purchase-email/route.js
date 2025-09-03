// app/api/send-purchase-email/route.js
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request) {
  try {
    const { purchase, pdfBase64 } = await request.json();
    
    // Vérifier que la clé API existe
    if (!process.env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY manquante !');
      return Response.json({ 
        success: false, 
        error: 'Configuration manquante' 
      }, { status: 500 });
    }

    const isApproved = purchase.status === 'ordered' || purchase.status === 'approved';
    
    const emailData = {
      from: 'noreply@onboard.resend.dev',
      to: ['info.servicestmt@gmail.com'],
      subject: `🛒 ${isApproved ? 'Achat Fournisseur Approuvé' : 'Nouvel Achat Fournisseur'} - #${purchase.purchase_number}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">
              ${isApproved ? '✅ Achat Approuvé' : '📋 Nouvel Achat Créé'}
            </h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">
              Achat Fournisseur #${purchase.purchase_number}
            </p>
          </div>
          
          <div style="background: white; padding: 20px; border: 1px solid #e0e0e0; border-top: none;">
            <h2 style="color: #333; margin-top: 0;">Détails de l'achat</h2>
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Fournisseur:</strong></td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${purchase.supplier_name}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Date création:</strong></td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${new Date(purchase.created_at).toLocaleDateString('fr-FR')}</td>
              </tr>
              ${purchase.supplier_quote_reference ? `
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Réf. Soumission:</strong></td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${purchase.supplier_quote_reference}</td>
              </tr>
              ` : ''}
              ${purchase.delivery_date ? `
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Date livraison:</strong></td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${new Date(purchase.delivery_date).toLocaleDateString('fr-FR')}</td>
              </tr>
              ` : ''}
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Statut:</strong></td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee;">
                  <span style="background: ${isApproved ? '#d4edda' : '#fff3cd'}; 
                               color: ${isApproved ? '#155724' : '#856404'}; 
                               padding: 4px 8px; border-radius: 4px; font-size: 12px;">
                    ${purchase.status.toUpperCase()}
                  </span>
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0;"><strong>Montant total:</strong></td>
                <td style="padding: 8px 0; font-size: 18px; font-weight: bold; color: #28a745;">
                  $${parseFloat(purchase.total_amount || 0).toFixed(2)}
                </td>
              </tr>
            </table>
            
            ${purchase.linked_po_number ? `
            <div style="background: #e7f3ff; border-left: 4px solid #0066cc; padding: 15px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #0066cc;">🔗 Lié au Bon d'Achat Client</h3>
              <p style="margin: 0;">N° Bon d'achat: <strong>${purchase.linked_po_number}</strong></p>
            </div>
            ` : ''}
            
            ${purchase.notes ? `
            <div style="background: #f8f9fa; padding: 15px; border-radius: 4px; margin-top: 20px;">
              <h4 style="margin: 0 0 10px 0; color: #333;">📝 Notes</h4>
              <p style="margin: 0; color: #666;">${purchase.notes}</p>
            </div>
            ` : ''}
          </div>
          
          <div style="background: #f8f9fa; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; border: 1px solid #e0e0e0; border-top: none;">
            <p style="margin: 0; color: #666; font-size: 12px;">
              Document PDF joint • Système de Gestion des Achats Fournisseurs
            </p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `Achat_Fournisseur_${purchase.purchase_number}.pdf`,
          content: pdfBase64,
          type: 'application/pdf',
          disposition: 'attachment'
        }
      ]
    };

    const { data, error } = await resend.emails.send(emailData);

    if (error) {
      console.error('❌ Erreur Resend:', error);
      return Response.json({ 
        success: false, 
        error: error.message 
      }, { status: 400 });
    }

    console.log('✅ Email envoyé avec succès:', data.id);
    return Response.json({ 
      success: true, 
      messageId: data.id 
    });

  } catch (error) {
    console.error('❌ Erreur API:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}
