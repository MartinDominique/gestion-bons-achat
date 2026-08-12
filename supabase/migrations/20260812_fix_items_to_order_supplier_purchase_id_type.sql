-- ============================================
-- Fix type de items_to_order.supplier_purchase_id  (bigint -> uuid)
-- Date: 2026-08-12
-- Description: La colonne supplier_purchase_id avait été créée en BIGINT (migration
--              20260721_create_items_to_order.sql), alors que l'id d'un AF
--              (supplier_purchases.id) est un UUID (confirmé via information_schema).
--              Écrire l'id de l'AF faisait donc échouer TOUT l'UPDATE de marquage
--              « commandé » -> les items restaient dans la liste « À Commander »
--              (voir CLAUDE.md, bug corrigé 2026-08-11).
--
--              La route mark-ordered v1.2.0 contourne déjà le problème (le retrait de
--              l'item ne dépend plus de cette colonne). Cette migration ré-active en
--              plus le LIEN AF cliquable depuis la vue « Commandés » en alignant le
--              type de la colonne sur celui de supplier_purchases.id.
--
-- Sûreté: toutes les valeurs actuelles sont NULL (les écritures bigint échouaient),
--         il n'y a donc rien à convertir. USING NULL::uuid met explicitement la
--         colonne à NULL (aucune donnée réelle perdue). L'index idx_items_to_order_af
--         est reconstruit automatiquement par PostgreSQL lors du changement de type.
-- ============================================

ALTER TABLE items_to_order
  ALTER COLUMN supplier_purchase_id TYPE uuid
  USING NULL::uuid;
