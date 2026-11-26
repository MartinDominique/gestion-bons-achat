-- ============================================
-- Panneau virtuel (PR 3) — côté de la charnière du boîtier
-- Date: 2026-11-26
-- Description: `hinge_side` = côté de la charnière quand le boîtier est DEBOUT
--              ('left' | 'right'). Le bord réel une fois installé dépend de
--              `orientation` (boîtier couché sur le côté gauche ou droit: la
--              charnière se retrouve en haut ou en bas). Sert au pictogramme.
--              Les pièces de porte vivent dans `items` (zone = 'door'): aucune
--              autre colonne n'est nécessaire.
-- ============================================

ALTER TABLE panel_layouts
  ADD COLUMN IF NOT EXISTS hinge_side TEXT NOT NULL DEFAULT 'left' CHECK (hinge_side IN ('left', 'right'));

COMMENT ON COLUMN panel_layouts.hinge_side IS 'Côté de la charnière quand le boîtier est debout (le bord réel dépend de l''orientation)';
