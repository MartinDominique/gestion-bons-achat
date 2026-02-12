/**
 * @file supabase/migrations/add_inventory_search_indexes.sql
 * @description Index pour accélérer la recherche serveur dans l'inventaire
 *              - Index sur product_id et description pour les deux tables
 *              - Index sur product_group pour le chargement par groupe
 * @version 1.0.0
 * @date 2026-02-12
 * @changelog
 *   1.0.0 - Version initiale — indexes recherche inventaire
 */

-- =============================================
-- INDEX POUR LA TABLE products
-- =============================================

-- Index sur product_id (recherche par code produit)
CREATE INDEX IF NOT EXISTS idx_products_product_id
  ON products(product_id);

-- Index sur description (recherche par description)
-- text_pattern_ops pour optimiser les recherches LIKE/ILIKE avec préfixe
CREATE INDEX IF NOT EXISTS idx_products_description
  ON products USING btree (description text_pattern_ops);

-- Index sur product_group (chargement par groupe)
CREATE INDEX IF NOT EXISTS idx_products_group
  ON products(product_group);

-- =============================================
-- INDEX POUR LA TABLE non_inventory_items
-- =============================================

-- Index sur product_id (recherche par code produit)
CREATE INDEX IF NOT EXISTS idx_non_inv_product_id
  ON non_inventory_items(product_id);

-- Index sur description (recherche par description)
CREATE INDEX IF NOT EXISTS idx_non_inv_description
  ON non_inventory_items USING btree (description text_pattern_ops);
