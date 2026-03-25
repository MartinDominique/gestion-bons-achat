-- ============================================
-- Phase B: Stockage PDF Factures — Supabase Storage
-- Date: 2026-02-27
-- Description: Crée le bucket 'invoices' pour stocker les PDF de factures
--              Accès privé — utilisateurs authentifiés seulement
-- ============================================

-- 1. Créer le bucket 'invoices' (privé, pas public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Policy: les utilisateurs authentifiés peuvent uploader des factures
CREATE POLICY "Authenticated users can upload invoices" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'invoices'
    AND auth.uid() IS NOT NULL
  );

-- 3. Policy: les utilisateurs authentifiés peuvent lire les factures
CREATE POLICY "Authenticated users can read invoices" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'invoices'
    AND auth.uid() IS NOT NULL
  );

-- 4. Policy: les utilisateurs authentifiés peuvent mettre à jour (upsert)
CREATE POLICY "Authenticated users can update invoices" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'invoices'
    AND auth.uid() IS NOT NULL
  );

-- 5. Policy: les utilisateurs authentifiés peuvent supprimer
CREATE POLICY "Authenticated users can delete invoices" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'invoices'
    AND auth.uid() IS NOT NULL
  );

-- NOTE: Ce script doit être exécuté dans Supabase Dashboard (SQL Editor)
-- Le bucket 'invoices' est PRIVÉ — accessible uniquement via signed URLs
-- Structure des fichiers: invoices/YYYY/MM/facture-{numero}.pdf
