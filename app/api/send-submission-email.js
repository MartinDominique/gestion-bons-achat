import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to, subject, html, clientName, submissionNumber } = req.body;

  const transporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });

  try {
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
    
    res.status(200).json({ 
      success: true,
      message: `Email envoyé avec succès à ${to}`,
      messageId: info.messageId
    });

  } catch (error) {
    console.error('Erreur Gmail SMTP:', error);
    res.status(500).json({ 
      error: 'Erreur lors de l\'envoi',
      details: error.message
    });
  }
}
