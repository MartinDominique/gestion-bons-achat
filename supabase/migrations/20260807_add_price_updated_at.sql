-- Migration: Ajouter la date du dernier changement de prix
-- Date: 2026-08-07
-- Description: Ajoute la colonne `price_updated_at` (timestamp) sur products et
--              non_inventory_items. Elle est renseignée côté application
--              (lib/utils/priceShift.js) chaque fois qu'un coûtant ou un vendant
--              change, et affichée dans l'onglet « Hist. Prix » de l'inventaire.

-- ============================================================
-- TABLE: products
-- ============================================================
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS price_updated_at TIMESTAMPTZ;

-- ============================================================
-- TABLE: non_inventory_items
-- ============================================================
ALTER TABLE non_inventory_items
  ADD COLUMN IF NOT EXISTS price_updated_at TIMESTAMPTZ;
