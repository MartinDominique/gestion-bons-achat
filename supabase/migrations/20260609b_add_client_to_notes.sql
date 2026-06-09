-- ============================================
-- Système de Notes — Ajout du client à une note
-- Date: 2026-06-09
-- Description: Permet d'associer un client à une note (optionnel). Le client
--              sert aussi à filtrer le sélecteur de document (BT/BL/BA/Soumission)
--              dans le formulaire de note. client_id est la référence officielle,
--              client_name est conservé comme snapshot pour l'affichage.
-- ============================================

ALTER TABLE notes ADD COLUMN IF NOT EXISTS client_id BIGINT REFERENCES clients(id);
ALTER TABLE notes ADD COLUMN IF NOT EXISTS client_name TEXT;

CREATE INDEX IF NOT EXISTS idx_notes_client_id ON notes(client_id);
