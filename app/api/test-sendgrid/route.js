import sgMail from '@sendgrid/mail';

export async function GET() {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      return Response.json({ error: 'SENDGRID_API_KEY manquante' }, { status: 500 });
    }

    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    // Test simple
    const msg = {
      to: 'info.servicestmt@gmail.com', // Votre email pour tester
      from: 'servicestmt@gmail.com',
      subject: 'Test SendGrid - Services TMT',
      html: '<h2>✅ SendGrid fonctionne !</h2><p>Configuration réussie.</p>'
    };

    const response = await sgMail.send(msg);
    
    return Response.json({ 
      success: true,
      message: 'Test email envoyé',
      statusCode: response[0].statusCode
    });

  } catch (error) {
    return Response.json({ 
      error: error.message,
      code: error.code
    }, { status: 500 });
  }
}
