// app/api/send-report/route.js
import { Resend } from 'resend';

export async function POST(request) {
  const body = await request.json();

  const resend = new Resend(process.env.RESEND_API_KEY);

  const result = await resend.emails.send({
    from: 'noreply@tondomaine.com',
    to: body.to,
    subject: 'Rapport hebdomadaire des bons d’achat',
    html: '<p>Voici le rapport de la semaine.</p>',
    attachments: [
      {
        filename: 'rapport_bons_achat.pdf',
        content: body.fileBase64,
        type: 'application/pdf',
      }
    ]
  });

  return Response.json({ success: true });
}
