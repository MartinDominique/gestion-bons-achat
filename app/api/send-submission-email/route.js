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

// SOLUTION 2: Alternative avec require() traditionnel
// Si la solution 1 ne fonctionne pas, essayez celle-ci :

export async function POST(request) {
  try {
    // Utiliser require de manière synchrone
    const createTransporter = require('nodemailer').createTransporter;
    
    const { to, subject, html, clientName, submissionNumber } = await request.json();

    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      return Response.json(
        { error: 'Configuration email manquante' },
        { status: 500 }
      );
    }

    console.log('createTransporter type:', typeof createTransporter);

    const transporter = createTransporter({
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

// SOLUTION 3: Utiliser Resend (puisque vous l'avez déjà)
// Cette solution pourrait être plus simple car vous utilisez déjà Resend

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request) {
  try {
    const { to, subject, html, clientName, submissionNumber } = await request.json();

    // Envoyer à vous-même avec instruction de transfert
    const emailData = await resend.emails.send({
      from: 'Services TMT <servicestmt@gmail.com>',
      to: ['info.servicestmt@gmail.com'], // Votre email vérifié
      subject: `TRANSFÉRER: ${subject}`,
      html: `
        <div style="background: #fffbeb; border: 2px solid #f59e0b; padding: 15px; margin-bottom: 20px;">
          <h3 style="color: #92400e; margin: 0;">🔄 À TRANSFÉRER À:</h3>
          <p><strong>Client:</strong> ${clientName}</p>
          <p><strong>Email:</strong> ${to}</p>
          <p><strong>Objet suggéré:</strong> ${subject}</p>
        </div>
        ${html}
      `
    });

    return Response.json({ 
      success: true,
      message: `Email envoyé pour transfert vers ${to}`,
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
