-- Migration: Coût horaire interne de la main d'oeuvre (Facturation Prix Jobé)
-- Date: 2026-09-17
-- Description:
--   Ajoute settings.labor_cost_hourly_rate — ce qu'une heure de main d'oeuvre
--   COÛTE à l'entreprise (salaire + charges), en $ CAD / h. Utilisé par le
--   « Détail du forfait (interne) » de l'éditeur de facture pour calculer le
--   coûtant M.O., le coûtant total et la marge estimée d'une job Prix Jobé.
--   Purement interne : n'apparaît JAMAIS sur la facture client (PDF).
--   0 = non configuré (le coûtant M.O. est alors affiché comme inconnu).

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS labor_cost_hourly_rate NUMERIC NOT NULL DEFAULT 0;

UPDATE settings SET labor_cost_hourly_rate = 0 WHERE labor_cost_hourly_rate IS NULL;
