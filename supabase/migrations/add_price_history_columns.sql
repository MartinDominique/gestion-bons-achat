-- Migration: Ajouter les colonnes d'historique de prix (shift)
-- Date: 2026-02-11
-- Description: Ajoute 6 colonnes pour garder l'historique des 3 derniers prix
--              (coûtant et vendant) sur products et non_inventory_items.
--              Le décalage (shift) se fait côté application quand un prix change.

-- ============================================================
-- TABLE: products
-- ============================================================
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS cost_price_1st DECIMAL,
  ADD COLUMN IF NOT EXISTS cost_price_2nd DECIMAL,
  ADD COLUMN IF NOT EXISTS cost_price_3rd DECIMAL,
  ADD COLUMN IF NOT EXISTS selling_price_1st DECIMAL,
  ADD COLUMN IF NOT EXISTS selling_price_2nd DECIMAL,
  ADD COLUMN IF NOT EXISTS selling_price_3rd DECIMAL;

-- ============================================================
-- TABLE: non_inventory_items
-- ============================================================
ALTER TABLE non_inventory_items
  ADD COLUMN IF NOT EXISTS cost_price_1st DECIMAL,
  ADD COLUMN IF NOT EXISTS cost_price_2nd DECIMAL,
  ADD COLUMN IF NOT EXISTS cost_price_3rd DECIMAL,
  ADD COLUMN IF NOT EXISTS selling_price_1st DECIMAL,
  ADD COLUMN IF NOT EXISTS selling_price_2nd DECIMAL,
  ADD COLUMN IF NOT EXISTS selling_price_3rd DECIMAL;
