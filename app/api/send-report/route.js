// app/api/send-report/route.js
import { Resend } from 'resend';

export async function POST(request) {
  try {
    const body = await request.json();
    
    // Vérifier que la clé API existe
    if (!process.env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY manquante !');
      return Response.json({ 
        success: false, 
        error: 'Configuration manquante' 
      }, { status: 500 });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    
    console.log('Envoi email à:', body.to);
    
    const result = await resend.emails.send({
      from: 'onboarding@resend.dev', // Domaine par défaut de Resend
      to: body.to,
      subject: 'Rapport hebdomadaire des bons d\'achat',
      html: '<p>Voici le rapport de la semaine en pièce jointe.</p>',
      attachments: [
        {
          filename: 'rapport_bons_achat.pdf',
          content: body.fileBase64,
          type: 'application/pdf',
        }
      ]
    });

    console.log('Résultat Resend:', result);
    
    if (result.error) {
      console.error('Erreur Resend:', result.error);
      return Response.json({ 
        success: false, 
        error: result.error 
      }, { status: 400 });
    }

    return Response.json({ 
      success: true, 
      id: result.data?.id 
    });

  } catch (error) {
    console.error('Erreur complète:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}
