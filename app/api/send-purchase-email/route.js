import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request) {
  console.log('🔧 API route send-purchase-email appelée');
  
  try {
    // Vérifier la clé API
    if (!process.env.RESEND_API_KEY) {
      console.error('❌ RESEND_API_KEY manquante côté serveur');
      return Response.json({ 
        success: false, 
        error: 'Configuration API manquante' 
      }, { status: 500 });
    }

    console.log('✅ Clé API présente côté serveur');

    const { purchase, pdfBase64 } = await request.json();
    
    if (!purchase || !pdfBase64) {
      console.error('❌ Données manquantes:', { purchase: !!purchase, pdf: !!pdfBase64 });
      return Response.json({ 
        success: false, 
        error: 'Données manquantes' 
      }, { status: 400 });
    }

    console.log('✅ Données reçues:', purchase.purchase_number);

    // Email simple d'abord (sans PDF pour tester)
    const emailData = {
      from: 'noreply@onboard.resend.dev',
      to: ['info.servicestmt@gmail.com'],
      subject: `🛒 Achat Fournisseur - ${purchase.purchase_number}`,
      html: `
        <h2>Nouvel Achat Fournisseur</h2>
        <p><strong>Numéro:</strong> ${purchase.purchase_number}</p>
        <p><strong>Fournisseur:</strong> ${purchase.supplier_name}</p>
        <p><strong>Total:</strong> ${purchase.total_amount} CAD</p>
        <p>PDF joint.</p>
      `,
      attachments: [
        {
          filename: `Achat_${purchase.purchase_number}.pdf`,
          content: pdfBase64,
          type: 'application/pdf'
        }
      ]
    };

    console.log('📧 Envoi email via Resend...');
    const { data, error } = await resend.emails.send(emailData);

    if (error) {
      console.error('❌ Erreur Resend:', error);
      return Response.json({ 
        success: false, 
        error: `Resend: ${error.message}` 
      }, { status: 400 });
    }

    console.log('✅ Email envoyé:', data.id);
    return Response.json({ 
      success: true, 
      messageId: data.id 
    });

  } catch (error) {
    console.error('❌ Erreur API route:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}
