-- ============================================
-- Panneau virtuel — forme ronde (boutons, voyants, arrêts d'urgence)
-- Date: 2026-11-26
-- Description: `shape` = forme de la pièce vue de face: 'rect' (défaut) ou 'round'.
--              Pour une pièce ronde, la largeur sert de diamètre. La forme est
--              copiée dans la pièce de la disposition (items[].shape) et reste
--              modifiable pièce par pièce. Les conflits se calculent toujours sur
--              le carré qui entoure le rond (marge de sécurité).
-- ============================================

ALTER TABLE panel_specs
  ADD COLUMN IF NOT EXISTS shape TEXT NOT NULL DEFAULT 'rect' CHECK (shape IN ('rect', 'round'));

COMMENT ON COLUMN panel_specs.shape IS 'Forme vue de face: rect (rectangle) ou round (rond: bouton, voyant, arrêt d''urgence). La largeur sert de diamètre.';
