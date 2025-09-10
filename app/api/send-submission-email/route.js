const nodemailer = require('nodemailer');

export async function POST(request) {
  try {
    const { to, subject, html, clientName, submissionNumber } = await request.json();

      // 1. Console.log pour vérifier les variables d'environnement
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

      // 2. Console.log pour vérifier que nodemailer fonctionne
    console.log('nodemailer type:', typeof nodemailer);
    console.log('createTransporter type:', typeof nodemailer.createTransporter);

    const transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });

      // 3. Console.log pour vérifier les données reçues
    console.log('Envoi email vers:', to);
    console.log('Sujet:', subject);

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

      // 4. Console.log pour confirmer l'envoi
    console.log('Email envoyé avec succès, messageId:', info.messageId);
    
    return Response.json({ 
      success: true,
      message: `Email envoyé avec succès à ${to}`,
      messageId: info.messageId
    });

  } catch (error) {
     // 5. Console.log pour voir l'erreur complète
    console.error('Erreur complète Gmail SMTP:', error);
    console.error('Type erreur:', error.name);
    console.error('Message erreur:', error.message);
    return Response.json(
      { error: 'Erreur lors de l\'envoi', details: error.message },
      { status: 500 }
    );
  }
}
