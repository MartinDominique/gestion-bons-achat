-- ============================================================
-- Migration : Achats en devise américaine (USD -> CAD)
-- Date       : 2026-08-27
-- Description : Permet de saisir un coûtant en USD et de le convertir en CAD.
--               Le coûtant CAD reste TOUJOURS dans cost_price (aucun autre module
--               n'a à connaître le USD). Les colonnes ci-dessous ne servent qu'à
--               se souvenir de l'origine du prix et à pouvoir le recalculer quand
--               le taux de change bouge.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Produits d'inventaire
-- ------------------------------------------------------------
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS purchase_currency TEXT NOT NULL DEFAULT 'CAD',
  ADD COLUMN IF NOT EXISTS cost_price_usd NUMERIC(12, 4),
  ADD COLUMN IF NOT EXISTS fx_rate_used NUMERIC(12, 6),
  ADD COLUMN IF NOT EXISTS fx_fee_percent_used NUMERIC(6, 3),
  ADD COLUMN IF NOT EXISTS fx_converted_at TIMESTAMPTZ;

DO $$
BEGIN
  ALTER TABLE products
    ADD CONSTRAINT products_purchase_currency_check
    CHECK (purchase_currency IN ('CAD', 'USD'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN products.purchase_currency IS
  'Devise dans laquelle ce produit est ACHETÉ chez le fournisseur (CAD par défaut, USD si acheté en dollars américains). cost_price reste toujours en CAD.';
COMMENT ON COLUMN products.cost_price_usd IS
  'Coûtant tel que facturé par le fournisseur en USD. Sert à recalculer cost_price quand le taux change.';
COMMENT ON COLUMN products.fx_rate_used IS
  'Taux USD->CAD utilisé lors de la dernière conversion (taux du marché, avant frais bancaires).';
COMMENT ON COLUMN products.fx_fee_percent_used IS
  'Frais bancaires en % appliqués par-dessus le taux du marché lors de la dernière conversion.';
COMMENT ON COLUMN products.fx_converted_at IS
  'Date/heure de la dernière conversion USD -> CAD.';

-- ------------------------------------------------------------
-- 2. Items non-inventaire
-- ------------------------------------------------------------
ALTER TABLE non_inventory_items
  ADD COLUMN IF NOT EXISTS purchase_currency TEXT NOT NULL DEFAULT 'CAD',
  ADD COLUMN IF NOT EXISTS cost_price_usd NUMERIC(12, 4),
  ADD COLUMN IF NOT EXISTS fx_rate_used NUMERIC(12, 6),
  ADD COLUMN IF NOT EXISTS fx_fee_percent_used NUMERIC(6, 3),
  ADD COLUMN IF NOT EXISTS fx_converted_at TIMESTAMPTZ;

DO $$
BEGIN
  ALTER TABLE non_inventory_items
    ADD CONSTRAINT non_inventory_items_purchase_currency_check
    CHECK (purchase_currency IN ('CAD', 'USD'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN non_inventory_items.purchase_currency IS
  'Devise d''achat de l''item (CAD ou USD). cost_price reste toujours en CAD.';

-- Retrouver rapidement tous les items achetés en USD (bouton « Recalculer les coûts USD »)
CREATE INDEX IF NOT EXISTS idx_products_purchase_currency
  ON products (purchase_currency) WHERE purchase_currency <> 'CAD';
CREATE INDEX IF NOT EXISTS idx_non_inventory_items_purchase_currency
  ON non_inventory_items (purchase_currency) WHERE purchase_currency <> 'CAD';

-- ------------------------------------------------------------
-- 3. Paramètres globaux : frais bancaires + dernier taux connu
-- ------------------------------------------------------------
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS usd_fx_fee_percent NUMERIC(6, 3) DEFAULT 3.5,
  ADD COLUMN IF NOT EXISTS usd_cad_rate NUMERIC(12, 6),
  ADD COLUMN IF NOT EXISTS usd_cad_rate_date DATE,
  ADD COLUMN IF NOT EXISTS usd_cad_rate_source TEXT;

COMMENT ON COLUMN settings.usd_fx_fee_percent IS
  'Frais bancaires (%) ajoutés par-dessus le taux du marché lors d''une conversion USD -> CAD. BMO applique généralement 2,5 % à 3,5 %.';
COMMENT ON COLUMN settings.usd_cad_rate IS
  'Dernier taux USD -> CAD connu (mis en cache pour fonctionner même si la source est injoignable).';
COMMENT ON COLUMN settings.usd_cad_rate_date IS
  'Date d''observation du taux mis en cache.';
COMMENT ON COLUMN settings.usd_cad_rate_source IS
  'Source du taux mis en cache (ex: Banque du Canada).';
