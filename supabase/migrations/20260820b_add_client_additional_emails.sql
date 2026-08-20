-- ============================================
-- Adresses courriel supplémentaires par client
-- Date: 2026-08-20
-- Description: Permet d'enregistrer plus d'une adresse « administration » (ou toute autre
--              adresse additionnelle) dans le dossier client, sans multiplier les colonnes.
--              Alimenté automatiquement quand on ajoute un destinataire à la volée lors de
--              l'envoi d'un état de compte, et modifiable dans la fiche client.
-- Format: [{ "email": "compta@client.com", "label": "Administration" }, ...]
-- ============================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS additional_emails JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN clients.additional_emails IS
  'Adresses courriel supplémentaires: [{email, label}]. Complète email, email_2, email_3, email_admin et email_billing.';

-- Sécurité: normaliser d'éventuelles valeurs NULL héritées
UPDATE clients SET additional_emails = '[]'::jsonb WHERE additional_emails IS NULL;
