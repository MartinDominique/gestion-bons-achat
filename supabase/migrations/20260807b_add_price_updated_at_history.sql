-- Migration: Historique des dates de changement de prix (3 niveaux)
-- Date: 2026-08-07
-- Description: Ajoute price_updated_at_1st/2nd/3rd sur products et non_inventory_items.
--              Ces colonnes sont décalées (shift) en parallèle des prix historiques
--              (cost_price_1st/2nd/3rd) par lib/utils/priceShift.js, afin d'afficher
--              la date à laquelle chaque prix précédent était en vigueur dans
--              l'onglet « Hist. Prix » de l'inventaire.
--              Complète 20260807_add_price_updated_at.sql (price_updated_at = date du
--              prix courant).

-- ============================================================
-- TABLE: products
-- ============================================================
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS price_updated_at_1st TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS price_updated_at_2nd TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS price_updated_at_3rd TIMESTAMPTZ;

-- ============================================================
-- TABLE: non_inventory_items
-- ============================================================
ALTER TABLE non_inventory_items
  ADD COLUMN IF NOT EXISTS price_updated_at_1st TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS price_updated_at_2nd TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS price_updated_at_3rd TIMESTAMPTZ;
