export async function POST(request) {
  try {
    // Import dynamique de nodemailer
    const nodemailer = await import('nodemailer');
    
    const { to, subject, html, clientName, submissionNumber } = await request.json();

    console.log('Variables env:', {
      user: process.env.GMAIL_USER,
      passwordExists: !!process.env.GMAIL_APP_PASSWORD
    });

    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      return Response.json(
        { error: 'Configuration email manquante' },
        { status: 500 }
      );
    }

    // IMPORTANT: Utiliser nodemailer.default pour App Router
    console.log('nodemailer.default type:', typeof nodemailer.default);
    console.log('createTransporter type:', typeof nodemailer.default.createTransporter);

    const transporter = nodemailer.default.createTransporter({
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
      html: html
    };

    console.log('Envoi vers:', to);
    const info = await transporter.sendMail(mailOptions);
    console.log('Email envoyé, messageId:', info.messageId);
    
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
