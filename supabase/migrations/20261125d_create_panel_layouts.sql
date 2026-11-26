-- ============================================
-- Panneau virtuel (PR 2) — Table panel_layouts (dispositions)
-- Date: 2026-11-25
-- Description: Une disposition = un fond de panneau (backplate) avec ses pièces,
--              rails DIN et goulottes placés à l'échelle, plus les réglages qui
--              servent à choisir le boîtier.
--              - Les pièces sont dans `items` (JSONB, tableau), comme les articles
--                d'une soumission (`submissions.items`): la sauvegarde automatique
--                écrit toute la disposition d'un coup (jamais à moitié), et
--                « Dupliquer » copie une seule ligne. Chaque pièce porte `product_id`
--                (code produit texte, ou null pour un rail, une goulotte ou une
--                pièce libre « gabarit »). Le renommage et la fusion d'un produit
--                cascadent via /api/products/rename et /merge.
--              - Toutes les mesures sont en millimètres. Origine = coin haut-gauche
--                du fond, tel qu'installé.
-- ============================================

CREATE TABLE IF NOT EXISTS panel_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL,
  project_code TEXT,                                -- ex. 'PGF2701'
  client_name TEXT,
  submission_id BIGINT,                             -- soumission liée (référence souple, sans FK)
  submission_number TEXT,
  work_order_id INTEGER,                            -- BT lié (référence souple, sans FK)
  work_order_number TEXT,

  enclosure_code TEXT,                              -- boîtier retenu (panel_specs.product_code)
  orientation TEXT NOT NULL DEFAULT 'portrait'
    CHECK (orientation IN ('portrait', 'landscape', 'side_left', 'side_right')),

  plate_width_mm NUMERIC(9,2) NOT NULL DEFAULT 600,
  plate_height_mm NUMERIC(9,2) NOT NULL DEFAULT 600,

  -- Réglages du calcul
  margin_mm NUMERIC(9,2) NOT NULL DEFAULT 15,       -- marge au bord
  spare_percent NUMERIC(5,2) NOT NULL DEFAULT 0,    -- réserve d'expansion (sur la largeur)
  door_rear_depth_mm NUMERIC(9,2) NOT NULL DEFAULT 0, -- ce qui rentre derrière la porte (ex. HMI)
  avail_width_mm NUMERIC(9,2),                      -- espace disponible sur la machine (optionnel)
  avail_height_mm NUMERIC(9,2),
  avail_depth_mm NUMERIC(9,2),
  delta_t NUMERIC(5,2),                             -- ΔT cible pour l'estimation de ventilation
  snap_mm NUMERIC(5,2) NOT NULL DEFAULT 5,          -- aimantation

  items JSONB NOT NULL DEFAULT '[]'::jsonb,         -- pièces, rails, goulottes
  import_report JSONB,                              -- classement des lignes à l'import (hors fond, dim. manquantes, ignorées)

  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  version INTEGER NOT NULL DEFAULT 1,               -- incrémenté à chaque sauvegarde
  notes TEXT,

  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_panel_layouts_updated ON panel_layouts(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_panel_layouts_submission ON panel_layouts(submission_id);

ALTER TABLE panel_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read panel_layouts" ON panel_layouts
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert panel_layouts" ON panel_layouts
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update panel_layouts" ON panel_layouts
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete panel_layouts" ON panel_layouts
  FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION set_panel_layouts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_panel_layouts_updated_at ON panel_layouts;
CREATE TRIGGER trg_panel_layouts_updated_at
  BEFORE UPDATE ON panel_layouts
  FOR EACH ROW EXECUTE FUNCTION set_panel_layouts_updated_at();

COMMENT ON TABLE panel_layouts IS 'Panneau virtuel: dispositions (fond de panneau + pièces en JSONB). Mesures en mm.';
