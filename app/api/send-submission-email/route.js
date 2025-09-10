dimport sgMail from '@sendgrid/mail';

export async function POST(request) {
  try {
    const { to, subject, html, clientName, submissionNumber } = await request.json();

    // Vérification de la clé API
    if (!process.env.SENDGRID_API_KEY) {
      console.error('SENDGRID_API_KEY manquante');
      return Response.json({ 
        error: 'Configuration email manquante',
        details: 'SENDGRID_API_KEY non définie'
      }, { status: 500 });
    }

    console.log('Configuration SendGrid...');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const msg = {
      to: to,
      from: {
        email: 'servicestmt@gmail.com',
        name: 'Services TMT Inc.'
      },
      subject: subject,
      html: html,
      text: `Soumission ${submissionNumber} de Services TMT Inc. pour ${clientName}.`
    };

    console.log('Envoi email vers:', to);
    console.log('Depuis:', msg.from.email);

    const response = await sgMail.send(msg);
    console.log('SendGrid response:', response[0].statusCode);

    return Response.json({ 
      success: true,
      message: `Email envoyé avec succès à ${to}`,
      statusCode: response[0].statusCode
    });

  } catch (error) {
    console.error('Erreur SendGrid:', error);
    
    // Messages d'erreur détaillés
    let errorMessage = 'Erreur lors de l\'envoi';
    if (error.code === 401) {
      errorMessage = 'Clé API SendGrid invalide';
    } else if (error.code === 403) {
      errorMessage = 'Email expéditeur non vérifié dans SendGrid';
    } else if (error.message?.includes('does not contain a valid address')) {
      errorMessage = 'Adresse email destinataire invalide';
    }

    return Response.json({ 
      error: errorMessage,
      details: error.message,
      code: error.code
    }, { status: 500 });
  }
}
