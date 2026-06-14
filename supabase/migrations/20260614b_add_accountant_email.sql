-- ============================================================
-- Migration : Ajout du courriel du comptable (rapports comptables)
-- Date       : 2026-06-14
-- Description : Adresse courriel du comptable pour l'envoi des rapports
--               mensuels/annuels de ventes et de paiements (CC bureau).
-- ============================================================

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS accountant_email TEXT DEFAULT '';

COMMENT ON COLUMN settings.accountant_email IS
  'Adresse courriel du comptable destinataire des rapports de ventes et de paiements (CC bureau via COMPANY_EMAIL).';
