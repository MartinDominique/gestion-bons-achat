-- Migration: Ajouter colonne invoice_ownership_note à la table settings
-- Date: 2026-03-12
-- Description: Message de propriété des marchandises affiché au bas des factures PDF

ALTER TABLE settings
ADD COLUMN IF NOT EXISTS invoice_ownership_note TEXT DEFAULT '';
