-- Migration: Add backorder (BO) support to delivery notes
-- Date: 2026-03-03
-- Description: Adds parent/child BL linking and ordered/delivered tracking columns
--              to support partial deliveries and automatic follow-up BL creation.

-- 1. delivery_notes: parent/child linking for BO chain
ALTER TABLE delivery_notes ADD COLUMN parent_bl_id BIGINT REFERENCES delivery_notes(id) DEFAULT NULL;
ALTER TABLE delivery_notes ADD COLUMN child_bl_id BIGINT REFERENCES delivery_notes(id) DEFAULT NULL;

-- Indexes for lookups
CREATE INDEX idx_delivery_notes_parent ON delivery_notes(parent_bl_id);
CREATE INDEX idx_delivery_notes_child ON delivery_notes(child_bl_id);

-- 2. delivery_note_materials: ordered quantity and previously delivered tracking
ALTER TABLE delivery_note_materials ADD COLUMN ordered_quantity NUMERIC DEFAULT NULL;
-- Quantité commandée d'origine (soumission ou BA). NULL = pas de référence commande.

ALTER TABLE delivery_note_materials ADD COLUMN previously_delivered NUMERIC DEFAULT 0;
-- Quantité déjà livrée dans les BL précédents pour cet item.
-- BO = ordered_quantity - previously_delivered - quantity

-- Note: RLS policies on delivery_notes and delivery_note_materials already cover
-- all columns — no additional policies required for these new columns.
