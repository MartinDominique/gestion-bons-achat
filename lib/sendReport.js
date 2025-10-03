// lib/sendReport.js
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendReportEmail({ to, pdfBuffer }) {
  const fileBase64 = pdfBuffer.toString('base64');

  return await resend.emails.send({
    from: 'noreply@servicestmt.ca', // domaine autorisé chez Resend
    to,
    subject: 'Rapport hebdomadaire des bons d’achat',
    html: `<p>Veuillez trouver ci-joint le rapport PDF des bons d'achat.</p>`,
    attachments: [
      {
        filename: 'rapport_bons_achat.pdf',
        content: fileBase64,
        type: 'application/pdf',
      }
    ]
  });
}
