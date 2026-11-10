-- Migration: Option « poubelle » dans la fenêtre « Paiements » de l'onglet Factures
-- Date: 2026-11-10
-- Description:
--   Ajoute settings.allow_payment_delete_from_invoices (booléen, défaut false).
--   La fenêtre « Paiements » d'une facture (Facturation → Factures → pastille « Payée le … »)
--   est un écran de CONSULTATION. Le bouton de suppression d'un paiement (poubelle rouge)
--   n'y apparaît que si cette option est cochée dans Paramètres → Facturation.
--   Décochée (défaut): aucune suppression possible depuis cet écran; la correction d'un
--   paiement se fait dans l'état de compte du client (factures ouvertes seulement).

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS allow_payment_delete_from_invoices BOOLEAN NOT NULL DEFAULT false;

UPDATE settings SET allow_payment_delete_from_invoices = false WHERE allow_payment_delete_from_invoices IS NULL;
