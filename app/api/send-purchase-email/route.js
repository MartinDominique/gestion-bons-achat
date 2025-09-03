import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request) {
  console.log('🔧 API route appelée pour débogage');
  
  try {
    const apiKey = process.env.RESEND_API_KEY;
    
    if (!apiKey) {
      return Response.json({ 
        success: false, 
        error: 'RESEND_API_KEY manquante' 
      }, { status: 500 });
    }

    // ÉTAPE 1: Vérifier les données reçues
    let body;
    try {
      body = await request.json();
      console.log('✅ Données JSON parsées');
      console.log('Structure:', Object.keys(body));
      console.log('Purchase keys:', Object.keys(body.purchase || {}));
      console.log('PDF présent:', !!body.pdfBase64);
    } catch (e) {
      console.error('❌ Erreur parsing JSON:', e);
      return Response.json({ 
        success: false, 
        error: 'Données JSON invalides' 
      }, { status: 400 });
    }

    // ÉTAPE 2: Test email sans PDF d'abord
    console.log('📧 Test email sans PDF...');
    
    const simpleEmailData = {
      from: 'delivered@resend.dev',
      to: ['info.servicestmt@gmail.com'],
      subject: `Test - ${body.purchase?.purchase_number || 'N/A'}`,
      html: '<p>Test simple sans PDF</p>'
    };

    const { data, error } = await resend.emails.send(simpleEmailData);
    
    if (error) {
      console.error('❌ Erreur Resend:', JSON.stringify(error, null, 2));
      return Response.json({ 
        success: false, 
        error: `Resend: ${JSON.stringify(error)}` 
      }, { status: 400 });
    }

    console.log('✅ Email simple envoyé:', data.id);
    return Response.json({ 
      success: true, 
      messageId: data.id,
      debug: {
        purchaseNumber: body.purchase?.purchase_number,
        hasPdf: !!body.pdfBase64
      }
    });

  } catch (error) {
    console.error('❌ Exception générale:', error);
    return Response.json({ 
      success: false, 
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
