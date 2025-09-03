import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request) {
  console.log('🔧 API route appelée');
  
  try {
    // Vérification clé API avec plus de détails
    const apiKey = process.env.RESEND_API_KEY;
    console.log('Clé API présente:', !!apiKey);
    console.log('Début de la clé:', apiKey ? apiKey.substring(0, 8) : 'MANQUANTE');
    
    if (!apiKey) {
      return Response.json({ 
        success: false, 
        error: 'RESEND_API_KEY manquante' 
      }, { status: 500 });
    }

    const body = await request.json();
    console.log('Données reçues:', {
      hasPurchase: !!body.purchase,
      hasPdfBase64: !!body.pdfBase64,
      purchaseNumber: body.purchase?.purchase_number
    });

    // TEST SIMPLE D'ABORD - Sans PDF ni destinataire complexe
    console.log('📧 Test email simple...');
    
    const testEmailData = {
      from: 'delivered@resend.dev',
      to: ['test@resend.dev'], // Adresse de test Resend
      subject: 'Test simple',
      html: '<p>Test basique</p>'
    };

    const result = await resend.emails.send(testEmailData);
    console.log('Résultat Resend:', result);
    
    if (result.error) {
      console.error('Erreur Resend détaillée:', JSON.stringify(result.error, null, 2));
      return Response.json({ 
        success: false, 
        error: `Resend error: ${JSON.stringify(result.error)}` 
      }, { status: 400 });
    }

    console.log('✅ Email envoyé:', result.data?.id);
    return Response.json({ 
      success: true, 
      messageId: result.data?.id,
      debug: result
    });

  } catch (error) {
    console.error('❌ Exception:', error);
    console.error('Stack:', error.stack);
    return Response.json({ 
      success: false, 
      error: `Exception: ${error.message}`,
      stack: error.stack
    }, { status: 500 });
  }
}
