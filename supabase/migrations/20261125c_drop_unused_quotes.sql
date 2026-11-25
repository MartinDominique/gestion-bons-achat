-- ============================================
-- Nettoyage — tables quotes / quote_items jamais utilisées
-- Date: 2026-11-25
-- Description: Ces deux tables datent du tout début du projet. Aucun code ne les
--              lit ni ne les écrit (les soumissions vivent dans `submissions`), et
--              elles sont vides. Le script REFUSE de s'exécuter si une ligne existe.
-- ============================================

DO $$
BEGIN
  IF (SELECT count(*) FROM quote_items) > 0 OR (SELECT count(*) FROM quotes) > 0 THEN
    RAISE EXCEPTION 'quotes / quote_items ne sont pas vides: suppression annulée';
  END IF;
END $$;

DROP TABLE IF EXISTS quote_items;
DROP TABLE IF EXISTS quotes;
