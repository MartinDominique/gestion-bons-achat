-- Migration: ajout d'un 2e et 3e contact aux fournisseurs
-- Date: 2026-07-13
-- Contexte: permettre de choisir le destinataire (parmi plusieurs contacts)
--           lors de l'envoi d'un achat fournisseur (AF) par courriel.
-- Chaque contact: nom + email + téléphone (téléphone optionnel).

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS contact_name_2 text,
  ADD COLUMN IF NOT EXISTS email_2        text,
  ADD COLUMN IF NOT EXISTS phone_2        text,
  ADD COLUMN IF NOT EXISTS contact_name_3 text,
  ADD COLUMN IF NOT EXISTS email_3        text,
  ADD COLUMN IF NOT EXISTS phone_3        text;
