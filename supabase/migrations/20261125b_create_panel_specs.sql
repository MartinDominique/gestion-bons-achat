-- ============================================
-- Panneau virtuel (PR 1) — Table panel_specs + bucket panel-photos
-- Date: 2026-11-25
-- Description: Fiche technique « panneau » d'un produit (dimensions, montage,
--              dégagements, chaleur…) ou d'un boîtier (extérieur, fond de panneau,
--              profondeur utile). Sert au module « Panneau virtuel ».
--              - AUCUNE colonne de `products` / `non_inventory_items` n'est touchée:
--                tout est dans cette table à part.
--              - Référence par CODE produit texte (products.product_id ou
--                non_inventory_items.product_id), sans FK: même convention que
--                product_associations / items_to_order. Une seule fiche par code,
--                peu importe la table où vit le produit. Le renommage, la fusion et
--                la suppression d'un produit cascadent via /api/products/*.
--              - `active` = la case « Panneau virtuel ». Décocher ne supprime rien.
--              - Toutes les mesures sont en millimètres.
-- ============================================

CREATE TABLE IF NOT EXISTS panel_specs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  product_code TEXT NOT NULL UNIQUE,               -- Code produit exact (ex: 'GS23-55P0')
  active BOOLEAN NOT NULL DEFAULT TRUE,            -- Case « Panneau virtuel »
  kind TEXT NOT NULL DEFAULT 'component'
    CHECK (kind IN ('component', 'enclosure')),

  -- Dimensions (mm). Composant: corps de la pièce (profondeur = ce qui dépasse du
  -- fond de panneau). Boîtier: dimensions EXTÉRIEURES.
  width_mm NUMERIC(9,2),
  height_mm NUMERIC(9,2),
  depth_mm NUMERIC(9,2),

  -- ----- Composant -----
  mounting TEXT
    CHECK (mounting IS NULL OR mounting IN ('din', 'backplate', 'door', 'wall', 'field', 'accessory')),
  clearance_top_mm NUMERIC(9,2) NOT NULL DEFAULT 0,
  clearance_bottom_mm NUMERIC(9,2) NOT NULL DEFAULT 0,
  clearance_left_mm NUMERIC(9,2) NOT NULL DEFAULT 0,
  clearance_right_mm NUMERIC(9,2) NOT NULL DEFAULT 0,
  must_stay_vertical BOOLEAN NOT NULL DEFAULT FALSE,   -- ex. VFD, alimentations
  stack_group TEXT,                                    -- ex. 'P1000' (pièces qui se collent)
  is_repeated BOOLEAN NOT NULL DEFAULT FALSE,          -- borniers, disjoncteurs…
  unit_width_mm NUMERIC(9,2),                          -- largeur par unité si répétée
  default_quantity INTEGER,                            -- quantité par défaut si répétée
  heat_loss_w NUMERIC(9,2),                            -- pertes (W)
  visual_category TEXT NOT NULL DEFAULT 'control'
    CHECK (visual_category IN ('power', 'control')),
  rear_depth_mm NUMERIC(9,2),                          -- pièces de porte: ce qui rentre dans le boîtier
  source TEXT NOT NULL DEFAULT 'approx'
    CHECK (source IN ('datasheet', 'approx', 'template')),

  -- ----- Boîtier -----
  backplate_width_mm NUMERIC(9,2),                     -- fond de panneau utile (L)
  backplate_height_mm NUMERIC(9,2),                    -- fond de panneau utile (H)
  usable_depth_mm NUMERIC(9,2),                        -- du fond de panneau à la porte
  unusable_margin_mm NUMERIC(9,2),                     -- marge non utilisable (bords, charnières)
  rating TEXT,                                         -- NEMA / IP
  material TEXT,
  allow_portrait BOOLEAN NOT NULL DEFAULT TRUE,        -- installation normale
  allow_landscape BOOLEAN NOT NULL DEFAULT TRUE,       -- couché sur le côté

  -- ----- Commun -----
  datasheet_url TEXT,
  photo_front_path TEXT,                               -- photo de face (vue sur le fond de panneau)
  photo_iso_path TEXT,                                 -- photo 3 faces (sélection visuelle)
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_panel_specs_active_kind ON panel_specs(active, kind);
CREATE INDEX IF NOT EXISTS idx_panel_specs_mounting ON panel_specs(mounting);

-- RLS — liste partagée entre utilisateurs authentifiés (même modèle que product_associations)
ALTER TABLE panel_specs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read panel_specs" ON panel_specs
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert panel_specs" ON panel_specs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update panel_specs" ON panel_specs
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete panel_specs" ON panel_specs
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION set_panel_specs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_panel_specs_updated_at ON panel_specs;
CREATE TRIGGER trg_panel_specs_updated_at
  BEFORE UPDATE ON panel_specs
  FOR EACH ROW EXECUTE FUNCTION set_panel_specs_updated_at();

COMMENT ON TABLE panel_specs IS 'Panneau virtuel: fiche technique (composant ou boîtier) par code produit. Mesures en mm.';

-- Bucket PRIVÉ pour les photos (2 par produit: face + 3 faces).
-- Aucune policy: lecture/écriture seulement par le serveur (service role),
-- affichage par URL signée — comme les PDF de factures.
INSERT INTO storage.buckets (id, name, public)
VALUES ('panel-photos', 'panel-photos', false)
ON CONFLICT (id) DO NOTHING;
