-- ============================================
-- Items associés — Table product_associations
-- Date: 2026-09-10
-- Description: Lien « quand j'ajoute A, propose-moi aussi B ». Un lien est à
--              SENS UNIQUE (parent → enfant). Exemple: Disjoncteur → Rail DIN.
--              - Un petit carré « As » apparaît sur les lignes de BT/BL/Soumission/AF
--                dont le produit a des associés; un tap ouvre la liste des associés
--                (cases décochées par défaut, quantité = défaut × qté du parent,
--                modifiable) et l'utilisateur coche ce qu'il veut ajouter.
--              - Les liens se gèrent dans l'Inventaire (onglet « Associés ») ou
--                directement depuis la fenêtre « As » des modules.
--              - Référence par CODE produit texte (products.product_id ou
--                non_inventory_items.product_id), sans FK: même convention que
--                items_to_order / work_order_materials. Le renommage d'un code
--                cascade via /api/products/rename.
-- ============================================

-- 1. Table principale
CREATE TABLE IF NOT EXISTS product_associations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  parent_code TEXT NOT NULL,                       -- Produit qui suggère (ex: 'DISJ-20A')
  child_code TEXT NOT NULL,                        -- Produit suggéré (ex: 'RAIL-DIN-1M')

  -- Quantité suggérée PAR UNITÉ du parent (multipliée par la qté du parent au moment
  -- de la suggestion, puis modifiable avant l'ajout)
  default_quantity NUMERIC(12,2) NOT NULL DEFAULT 1,

  notes TEXT,                                      -- Note libre optionnelle (ex: « si montage mural »)

  user_id UUID REFERENCES auth.users(id),          -- Créateur (métadonnée, liste partagée TMT)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT product_associations_unique UNIQUE (parent_code, child_code),
  CONSTRAINT product_associations_not_self CHECK (parent_code <> child_code)
);

-- 2. Index
CREATE INDEX IF NOT EXISTS idx_product_associations_parent ON product_associations(parent_code);
CREATE INDEX IF NOT EXISTS idx_product_associations_child ON product_associations(child_code);

-- 3. RLS — liste partagée entre utilisateurs authentifiés (même modèle que items_to_order)
ALTER TABLE product_associations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read product_associations" ON product_associations
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert product_associations" ON product_associations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update product_associations" ON product_associations
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete product_associations" ON product_associations
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- 4. Trigger updated_at
CREATE OR REPLACE FUNCTION set_product_associations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_product_associations_updated_at ON product_associations;
CREATE TRIGGER trg_product_associations_updated_at
  BEFORE UPDATE ON product_associations
  FOR EACH ROW EXECUTE FUNCTION set_product_associations_updated_at();

COMMENT ON TABLE product_associations IS 'Items associés (sens unique parent → enfant), suggérés via le carré « As » dans BT/BL/Soumission/AF';
