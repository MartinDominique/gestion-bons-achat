-- ============================================
-- Panneau virtuel (PR 4) — Table panel_layout_versions (historique de versions)
-- Date: 2026-11-26
-- Description: Copie complète d'une disposition, prise automatiquement quand elle
--              passe à « approuvé » et à la demande (« Enregistrer une version »).
--              Permet de revenir à la dernière version approuvée. `snapshot`
--              contient les réglages et les pièces (jamais de photo ni de fichier).
--              Les 20 versions les plus récentes de chaque disposition sont gardées.
--              Supprimer une disposition supprime ses versions (ON DELETE CASCADE).
-- ============================================

CREATE TABLE IF NOT EXISTS panel_layout_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id UUID NOT NULL REFERENCES panel_layouts(id) ON DELETE CASCADE,
  layout_version INTEGER NOT NULL,                 -- panel_layouts.version au moment de la copie
  reason TEXT NOT NULL DEFAULT 'manual' CHECK (reason IN ('approved', 'manual')),
  label TEXT,                                      -- note libre (version manuelle)
  snapshot JSONB NOT NULL,                         -- réglages + pièces
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_panel_layout_versions_layout ON panel_layout_versions(layout_id, created_at DESC);

ALTER TABLE panel_layout_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read panel_layout_versions" ON panel_layout_versions
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert panel_layout_versions" ON panel_layout_versions
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update panel_layout_versions" ON panel_layout_versions
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete panel_layout_versions" ON panel_layout_versions
  FOR DELETE USING (auth.uid() IS NOT NULL);

COMMENT ON TABLE panel_layout_versions IS 'Panneau virtuel: copies d''une disposition (à l''approbation ou à la demande), pour revenir en arrière.';
