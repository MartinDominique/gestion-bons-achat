import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request) {
  try {
    const { productId, description, changes, type } = await request.json();

    const changesHtml = changes.map(c => `<li>${c}</li>`).join('');

    await resend.emails.send({
      from: 'Services TMT <noreply@servicestmt.ca>',
      to: ['info.servicestmt@gmail.com']
      subject: `📦 Modification inventaire - ${productId}`,
      html: `
        <h2>Modification d'inventaire</h2>
        <p><strong>Produit:</strong> ${productId}</p>
        <p><strong>Description:</strong> ${description}</p>
        <p><strong>Type:</strong> ${type}</p>
        <h3>Changements:</h3>
        <ul>${changesHtml}</ul>
        <p style="color: #666; font-size: 12px;">
          Modifié le ${new Date().toLocaleString('fr-CA')}
        </p>
      `
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Erreur envoi email:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
