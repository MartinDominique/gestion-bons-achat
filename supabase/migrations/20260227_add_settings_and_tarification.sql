-- Migration: Phase A - Fondations pour Facturation
-- Date: 2026-02-27
-- Description:
--   1. Création table settings (taux horaires, taxes, facturation)
--   2. Ajout colonnes tarification dans clients
--   3. Ajout Contact #3 dans clients
--   4. email_admin devient optionnel

-- ============================================
-- 1. TABLE SETTINGS
-- ============================================

CREATE TABLE IF NOT EXISTS settings (
  id                        INTEGER PRIMARY KEY DEFAULT 1,

  -- Taux horaires
  default_hourly_rate       NUMERIC NOT NULL DEFAULT 0,
  -- Taux régulier (1x). 1.5x et 2x calculés automatiquement.

  hourly_rate_increase_pct  NUMERIC DEFAULT 0,
  -- % d'augmentation annuelle (ex: 3.5)

  hourly_rate_increase_date DATE DEFAULT NULL,
  -- Date prévue de l'augmentation

  -- Taxes (ajustables si les gouvernements changent les taux)
  tps_rate                  NUMERIC NOT NULL DEFAULT 5.0,
  tvq_rate                  NUMERIC NOT NULL DEFAULT 9.975,

  -- Facturation
  invoice_tps_number        TEXT DEFAULT '',
  invoice_tvq_number        TEXT DEFAULT '',

  default_payment_terms     TEXT DEFAULT 'Net 30 jours',
  -- Options: 'Net 30 jours', 'Payable sur réception', '2% 10 Net 30 jours'

  invoice_footer_note       TEXT DEFAULT '',

  invoice_next_number       INTEGER DEFAULT 1,
  -- Martin entre le numéro courant d'Acomba ici au départ
  -- S'incrémente automatiquement après chaque facture créée

  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

-- Insérer la ligne par défaut (singleton, id=1 toujours)
INSERT INTO settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read settings" ON settings
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update settings" ON settings
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- ============================================
-- 2. COLONNES TARIFICATION DANS CLIENTS
-- ============================================

-- Taux horaire spécial par client (NULL = utiliser default_hourly_rate)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS hourly_rate_regular NUMERIC DEFAULT NULL;

-- Frais de transport par client (NULL = aucun frais)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS transport_fee NUMERIC DEFAULT NULL;

-- Email de facturation (cascade: email_billing → email_admin → email → email_2)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email_billing TEXT DEFAULT NULL;

-- Conditions de paiement par client (NULL = utiliser settings.default_payment_terms)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS payment_terms TEXT DEFAULT NULL;

-- ============================================
-- 3. CONTACT #3
-- ============================================

ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_name_3 TEXT DEFAULT NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email_3 TEXT DEFAULT NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_3 TEXT DEFAULT NULL;

-- ============================================
-- 4. EMAIL_ADMIN OPTIONNEL
-- ============================================
-- Si email_admin a une contrainte NOT NULL, on la retire.
-- (ALTER COLUMN ... DROP NOT NULL est idempotent si pas de contrainte)
ALTER TABLE clients ALTER COLUMN email_admin DROP NOT NULL;
