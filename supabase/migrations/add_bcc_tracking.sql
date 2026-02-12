-- Migration: Ajouter le suivi des envois BCC (Bon de Confirmation de Commande)
-- Date: 2026-02-12
-- Description: Ajoute les colonnes bcc_sent_count et bcc_history à purchase_orders
--              pour tracer les envois de confirmations de commande client

-- Compteur d'envois BCC
ALTER TABLE purchase_orders
ADD COLUMN IF NOT EXISTS bcc_sent_count INTEGER DEFAULT 0;

-- Historique détaillé des envois BCC (JSONB array)
-- Format: [{sent_at, recipients, items_count, total, notes, message_id}]
ALTER TABLE purchase_orders
ADD COLUMN IF NOT EXISTS bcc_history JSONB DEFAULT '[]'::jsonb;

-- Index pour filtrage rapide des BAs avec BCC envoyés
CREATE INDEX IF NOT EXISTS idx_purchase_orders_bcc_sent_count
ON purchase_orders (bcc_sent_count)
WHERE bcc_sent_count > 0;
