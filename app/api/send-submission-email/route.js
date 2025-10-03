import sgMail from '@sendgrid/mail';

export async function POST(request) {
  try {
    const { to, clientName, submissionNumber, submissionData, pdfBase64, fileName } = await request.json();

    if (!process.env.SENDGRID_API_KEY) {
      console.error('SENDGRID_API_KEY manquante');
      return Response.json({ 
        error: 'Configuration email manquante'
      }, { status: 500 });
    }

    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const msg = {
      to: to,
      from: {
        email: 'servicestmt@gmail.com',
        name: 'Services TMT Inc.'
      },
      subject: `Soumission ${submissionNumber} - Services TMT Inc.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 20px;">
          <div style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            
            <div style="text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #6b46c1;">
              <h1 style="color: #6b46c1; margin: 0; font-size: 24px;">Services TMT Inc.</h1>
              <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">
                3195, 42e Rue Nord, Saint-Georges, QC G5Z 0V9<br>
                Tél: (418) 225-3875 | servicestmt@gmail.com
              </p>
            </div>
            
            <div style="margin-bottom: 30px;">
              <h2 style="color: #333; margin-bottom: 20px;">Bonjour,</h2>
              
              <p style="color: #555; line-height: 1.6; margin-bottom: 15px;">
                Veuillez trouver ci-joint notre soumission <strong>${submissionNumber}</strong> 
                pour les services demandés.
              </p>
              
              <div style="background: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0;">
                <h3 style="margin: 0 0 15px 0; color: #333; font-size: 16px;">📋 Détails de la soumission :</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 5px 0; color: #666; font-weight: bold;">Client :</td>
                    <td style="padding: 5px 0; color: #333;">${clientName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 5px 0; color: #666; font-weight: bold;">Numéro :</td>
                    <td style="padding: 5px 0; color: #333;">${submissionNumber}</td>
                  </tr>
                  <tr>
                    <td style="padding: 5px 0; color: #666; font-weight: bold;">Date :</td>
                    <td style="padding: 5px 0; color: #333;">${new Date().toLocaleDateString('fr-CA')}</td>
                  </tr>
                  <tr>
                    <td style="padding: 5px 0; color: #666; font-weight: bold;">Description :</td>
                    <td style="padding: 5px 0; color: #333;">${submissionData.description}</td>
                  </tr>
                  <tr>
                    <td style="padding: 5px 0; color: #666; font-weight: bold;">Montant total :</td>
                    <td style="padding: 5px 0; color: #059669; font-weight: bold; font-size: 16px;">
                      ${new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(submissionData.amount)}
                    </td>
                  </tr>
                </table>
              </div>
              
              <p style="color: #555; line-height: 1.6; margin-bottom: 15px;">
                📎 <strong>La soumission complète est disponible en format PDF en pièce jointe.</strong>
              </p>
              
              <p style="color: #555; line-height: 1.6; margin-bottom: 20px;">
                Cette soumission est valide pour <strong>30 jours</strong> à compter de la date d'émission.
              </p>
            </div>
            
            <div style="background: #e7f3ff; padding: 20px; border-radius: 6px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #1e40af; font-size: 16px;">💬 Questions ou précisions ?</h3>
              <p style="margin: 0; color: #555; line-height: 1.6;">
                N'hésitez pas à nous contacter pour toute question concernant cette soumission :
              </p>
              <ul style="color: #555; margin: 10px 0 0 0; padding-left: 20px;">
                <li><strong>Téléphone :</strong> (418) 225-3875</li>
                <li><strong>Email :</strong> servicestmt@gmail.com</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e5e5;">
              <p style="color: #888; font-size: 12px; margin: 0;">
                Merci de votre confiance !<br>
                <strong>Services TMT Inc.</strong> - Votre partenaire de confiance
              </p>
            </div>
          </div>
        </div>
      `,
      attachments: [
        {
          content: pdfBase64,
          filename: `SOU-${submissionNumber}.pdf`,
          type: 'application/pdf',
          disposition: 'attachment'
        }
      ]
    };

    console.log('Envoi email avec PDF vers:', to);
    const response = await sgMail.send(msg);
    console.log('SendGrid response:', response[0].statusCode);

    return Response.json({ 
      success: true,
      message: `Soumission PDF envoyée avec succès à ${to}`,
      statusCode: response[0].statusCode
    });

  } catch (error) {
    console.error('Erreur SendGrid:', error);
    
    let errorMessage = 'Erreur lors de l\'envoi';
    if (error.code === 401) {
      errorMessage = 'Clé API SendGrid invalide';
    } else if (error.code === 403) {
      errorMessage = 'Email expéditeur non vérifié dans SendGrid';
    } else if (error.message?.includes('PDF trop volumineux')) {
      errorMessage = 'PDF trop volumineux pour l\'envoi par email';
    }

    return Response.json({ 
      error: errorMessage,
      details: error.message,
      code: error.code
    }, { status: 500 });
  }
}
