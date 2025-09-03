import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request) {
  console.log('🔧 API route appelée');
  
  try {
    const apiKey = process.env.RESEND_API_KEY;
    
    if (!apiKey) {
      return Response.json({ 
        success: false, 
        error: 'RESEND_API_KEY manquante' 
      }, { status: 500 });
    }

    const body = await request.json();
    console.log('Données reçues pour achat:', body.purchase?.purchase_number);

    // REMPLACEZ LA SECTION emailData PAR CECI :
    const emailData = {
      from: 'delivered@resend.dev',
      to: ['info.servicestmt@gmail.com'],
      subject: `🛒 Achat Fournisseur Approuvé - #${body.purchase.purchase_number}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">✅ Achat Approuvé</h1>
            <p style="margin: 10px 0 0 0;">Achat Fournisseur #${body.purchase.purchase_number}</p>
          </div>
          <div style="background: white; padding: 20px; border: 1px solid #e0e0e0;">
            <h2>Détails de l'achat</h2>
            <p><strong>Fournisseur:</strong> ${body.purchase.supplier_name}</p>
            <p><strong>Montant total:</strong> $${parseFloat(body.purchase.total_amount || 0).toFixed(2)}</p>
            <p><strong>Statut:</strong> ${body.purchase.status.toUpperCase()}</p>
            ${body.purchase.linked_po_number ? `<p><strong>Bon d'achat lié:</strong> ${body.purchase.linked_po_number}</p>` : ''}
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `Achat_Fournisseur_${body.purchase.purchase_number}.pdf`,
          content: body.pdfBase64,
          type: 'application/pdf'
        }
      ]
    };

    const { data, error } = await resend.emails.send(emailData);
    
    if (error) {
      console.error('Erreur Resend:', error);
      return Response.json({ 
        success: false, 
        error: error.message 
      }, { status: 400 });
    }

    console.log('✅ Email envoyé:', data.id);
    return Response.json({ 
      success: true, 
      messageId: data.id
    });

  } catch (error) {
    console.error('❌ Exception:', error);
    return Response.json({ 
      success: false, 
      error: error.message
    }, { status: 500 });
  }
}
