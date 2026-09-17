-- ============================================
-- Facturation: détail interne du forfait (Prix Jobé)
-- Date: 2026-09-17
-- Description: Ajoute invoices.jobe_detail_items — les composantes internes
--              (main d'oeuvre, transport, matériaux avec vendant/coûtant) qui ont
--              servi à établir le prix forfaitaire d'une facture « Prix Jobé ».
--              Ce détail est 100 % interne: il n'apparaît JAMAIS sur la facture
--              client (PDF/courriel), ni dans les rapports comptables.
-- ============================================

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS jobe_detail_items JSONB;

COMMENT ON COLUMN invoices.jobe_detail_items IS
  'Détail interne du forfait (Prix Jobé): lignes M.O./transport/matériaux (qté, vendant, coûtant) ayant servi à fixer le prix forfaitaire. Jamais montré au client.';

-- Aucune modification RLS: mêmes policies que la table invoices.
-- Backup: la table invoices est déjà sauvegardée (colonne incluse automatiquement).
