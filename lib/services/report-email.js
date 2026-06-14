/**
 * @file lib/services/report-email.js
 * @description Helper d'envoi des rapports comptables (ventes/paiements) au comptable.
 *              - Détermine les destinataires (courriel comptant ou liste personnalisée)
 *              - Upload du PDF dans Supabase Storage (bucket 'invoices', préfixe reports/)
 *              - Envoi via Resend avec CC au bureau (COMPANY_EMAIL) + avis no-reply
 * @version 1.0.0
 * @date 2026-06-14
 * @changelog
 *   1.0.0 - Version initiale (rapports comptables ventes/paiements)
 */

const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');
const pdfCommon = require('./pdf-common');

const resend = new Resend(process.env.RESEND_API_KEY);

// Charger le logo une fois (serveur)
let LOGO_BASE64 = null;
try {
  const logoPath = path.join(process.cwd(), 'public', 'logo.png');
  const logoBuffer = fs.readFileSync(logoPath);
  LOGO_BASE64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
} catch (error) {
  console.warn('Logo non trouvé (rapports):', error.message);
}

function getServerLogo() {
  return LOGO_BASE64;
}

/**
 * Construit le HTML du courriel (carte blanche centrée + avis no-reply + pied).
 */
function buildReportEmailHTML({ title, intro, summaryRows = [] }) {
  const rows = summaryRows
    .map(([label, value]) => `<tr><td style="padding:2px 12px 2px 0;color:#555;">${label}</td><td style="padding:2px 0;font-weight:bold;color:#333;">${value}</td></tr>`)
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; padding: 30px; border-radius: 8px;">
    <h2 style="color: #333; margin-bottom: 20px;">${title}</h2>
    <p style="color: #333; line-height: 1.5; margin: 0 0 16px;">${intro}</p>
    <table style="border-collapse: collapse; font-size: 14px; margin-bottom: 8px;">${rows}</table>
    <p style="color: #333; line-height: 1.5; margin: 16px 0 0;">Le rapport détaillé est joint en format PDF.</p>
    <p style="color: #999; font-size: 13px; font-style: italic; margin: 20px 0 0;">
      Ne pas répondre à ce courriel.<br>
      Pour nous contacter, utilisez le lien ci-dessous.
    </p>
    <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
    <p style="color: #666; font-size: 13px;">
      ${pdfCommon.COMPANY.name}<br>
      ${pdfCommon.COMPANY.address}, ${pdfCommon.COMPANY.city}<br>
      Tél: ${pdfCommon.COMPANY.phone}<br>
      <a href="mailto:${pdfCommon.COMPANY.email}" style="color: #2563eb;">${pdfCommon.COMPANY.email}</a>
    </p>
  </div>
</body>
</html>`;
}

/**
 * Envoie un rapport PDF au comptable (CC bureau) et l'archive dans Storage.
 *
 * @param {Object} opts
 * @param {Buffer} opts.pdfBuffer
 * @param {string} opts.filename - Nom du fichier PDF joint
 * @param {string} opts.storagePath - Chemin Storage (ex: reports/2026/06/...)
 * @param {string[]} opts.recipients - Destinataires (déjà résolus, non vides)
 * @param {string} opts.subject
 * @param {string} opts.title
 * @param {string} opts.intro
 * @param {Array<[string,string]>} opts.summaryRows
 * @param {string} [supabaseAdmin] - client supabaseAdmin (passé pour upload)
 * @returns {Promise<{ pdfUrl: string|null, sentTo: string[], cc: string|null }>}
 */
async function sendReportEmail(opts, supabaseAdmin) {
  const { pdfBuffer, filename, storagePath, recipients, subject, title, intro, summaryRows } = opts;

  // Upload dans Storage (non bloquant)
  let pdfUrl = null;
  try {
    const { error: uploadError } = await supabaseAdmin
      .storage.from('invoices')
      .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true });
    if (uploadError) {
      console.error('Erreur upload rapport:', uploadError.message);
    } else {
      const { data: urlData } = await supabaseAdmin
        .storage.from('invoices')
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10);
      pdfUrl = urlData?.signedUrl || null;
    }
  } catch (e) {
    console.error('Erreur Storage rapport (non bloquante):', e.message);
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@servicestmt.com';
  const emailConfig = {
    from: `${pdfCommon.COMPANY.name} <${fromEmail}>`,
    to: recipients,
    subject,
    html: buildReportEmailHTML({ title, intro, summaryRows }),
    attachments: [{ filename, content: pdfBuffer, contentType: 'application/pdf' }],
  };

  if (process.env.COMPANY_EMAIL) {
    emailConfig.cc = [process.env.COMPANY_EMAIL];
  }

  const result = await resend.emails.send(emailConfig);
  if (result.error) {
    throw new Error(result.error.message || 'Erreur envoi courriel');
  }

  return { pdfUrl, sentTo: recipients, cc: process.env.COMPANY_EMAIL || null };
}

/**
 * Résout les destinataires: liste personnalisée sinon courriel du comptable (settings).
 * @returns {Promise<{ ok: boolean, recipients?: string[], error?: string }>}
 */
async function resolveAccountantRecipients(customEmails, supabaseAdmin) {
  if (Array.isArray(customEmails) && customEmails.filter(Boolean).length > 0) {
    return { ok: true, recipients: customEmails.filter(Boolean) };
  }
  const { data: settings } = await supabaseAdmin
    .from('settings')
    .select('accountant_email')
    .eq('id', 1)
    .single();
  const email = settings?.accountant_email;
  if (!email) {
    return {
      ok: false,
      error: 'Aucun courriel de comptable configuré. Ajoutez-le dans Paramètres > Facturation, ou utilisez l\'aperçu PDF.',
    };
  }
  return { ok: true, recipients: [email] };
}

module.exports = {
  getServerLogo,
  sendReportEmail,
  resolveAccountantRecipients,
};
