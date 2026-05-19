-- Migration: Retirer la contrainte FK sur work_orders.invoice_id et delivery_notes.invoice_id
-- Date: 2026-05-19
-- Description:
--   Permet d'utiliser la valeur sentinelle -1 pour marquer un BT/BL comme
--   "facturé externement" (via Acomba), via /api/invoices/mark-external.
--   Avec la contrainte FK active, l'UPDATE invoice_id = -1 était rejeté
--   silencieusement (violation de FK invoices.id), donc le bouton "Acomba"
--   n'avait aucun effet sur les données.
--
-- Conventions des valeurs:
--   invoice_id IS NULL → BT/BL non facturé (apparaît dans "À facturer")
--   invoice_id = -1    → BT/BL facturé externement (Acomba), pastille ambre
--   invoice_id > 0     → BT/BL facturé via une facture interne, pastille verte
--
-- Note: aucune règle ON DELETE CASCADE n'était définie, donc retirer la FK
-- n'a aucun impact en cascade. Les jointures via Supabase devront tenir compte
-- que invoice_id = -1 ne référence aucune ligne.

ALTER TABLE work_orders
  DROP CONSTRAINT IF EXISTS work_orders_invoice_id_fkey;

ALTER TABLE delivery_notes
  DROP CONSTRAINT IF EXISTS delivery_notes_invoice_id_fkey;
