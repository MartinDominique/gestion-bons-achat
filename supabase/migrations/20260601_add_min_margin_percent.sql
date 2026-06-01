-- Migration: Marge de profit minimale (alerte facturation)
-- Date: 2026-06-01
-- Description:
--   Ajoute une colonne min_margin_percent à la table settings.
--   Utilisée dans l'éditeur de facture pour signaler (voyant rouge)
--   les articles dont la marge de profit (vendant vs coûtant) est sous le seuil.
--   Purement interne : n'apparaît JAMAIS sur la facture client (PDF).

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS min_margin_percent NUMERIC NOT NULL DEFAULT 10;
-- Seuil de marge minimale en % (ex: 10 = alerte si marge < 10%)

-- S'assurer que la ligne singleton existante a une valeur
UPDATE settings SET min_margin_percent = 10 WHERE min_margin_percent IS NULL;
