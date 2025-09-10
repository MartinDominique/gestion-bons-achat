import nodemailer from 'nodemailer';

export async function POST(request) {
  try {
    const { to, subject, html, clientName, submissionNumber } = await request.json();

    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      return Response.json(
        { error: 'Configuration email manquante' },
        { status: 500 }
      );
    }

    const transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });

    const mailOptions = {
      from: {
        name: 'Services TMT Inc.',
        address: process.env.GMAIL_USER
      },
      to: to,
      subject: subject,
      html: html,
      text: `Soumission ${submissionNumber} de Services TMT Inc. pour ${clientName}.`
    };

    const info = await transporter.sendMail(mailOptions);
    
    return Response.json({ 
      success: true,
      message: `Email envoyé avec succès à ${to}`,
      messageId: info.messageId
    });

  } catch (error) {
    console.error('Erreur Gmail SMTP:', error);
    return Response.json(
      { error: 'Erreur lors de l\'envoi', details: error.message },
      { status: 500 }
    );
  }
}
