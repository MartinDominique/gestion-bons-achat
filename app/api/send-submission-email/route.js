import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request) {
  try {
    const { to, subject, html, clientName, submissionNumber } = await request.json();

    // Envoyer à votre email avec instruction de transfert
    const emailData = await resend.emails.send({
      from: 'Services TMT <delivered@resend.dev>',
      to: ['info.servicestmt@gmail.com'], // Remplacez par votre email vérifié
      subject: `TRANSFÉRER: ${subject}`,
      html: `
        <div style="background: #fffbeb; border: 2px solid #f59e0b; padding: 15px; margin-bottom: 20px; border-radius: 8px;">
          <h3 style="color: #92400e; margin: 0 0 10px 0;">🔄 À TRANSFÉRER À:</h3>
          <p style="margin: 5px 0;"><strong>Client:</strong> ${clientName}</p>
          <p style="margin: 5px 0;"><strong>Email client:</strong> ${to}</p>
          <p style="margin: 5px 0;"><strong>Objet suggéré:</strong> ${subject}</p>
          <p style="margin: 10px 0 0 0; font-size: 14px; color: #92400e;">
            👆 Copiez l'email du client ci-dessus et transférez le contenu ci-dessous
          </p>
        </div>
        <hr style="margin: 20px 0; border: 1px solid #e5e5e5;">
        ${html}
      `
    });

    console.log('Email Resend envoyé:', emailData.id);
    
    return Response.json({ 
      success: true,
      message: `Email préparé pour transfert vers ${to}`,
      id: emailData.id
    });

  } catch (error) {
    console.error('Erreur Resend:', error);
    return Response.json(
      { error: 'Erreur lors de l\'envoi', details: error.message },
      { status: 500 }
    );
  }
}
