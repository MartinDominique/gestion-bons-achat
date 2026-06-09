-- ============================================
-- Système de Notes — Table notes
-- Date: 2026-06-09
-- Description: Crée la table notes (notes globales + notes liées à un
--              document BT / BL / BA / Soumission). Tri par date d'échéance,
--              coloration selon urgence, masquage des notes complétées.
-- ============================================

-- 1. Table principale des notes
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  title TEXT NOT NULL,                    -- Titre (requis, min 3 caractères côté app)
  description TEXT,                       -- Description optionnelle

  -- Type de note: 'global' (indépendante) ou 'project' (liée à un document)
  note_type TEXT NOT NULL DEFAULT 'global' CHECK (note_type IN ('global', 'project')),

  -- Lien vers un document (uniquement si note_type = 'project')
  -- project_type correspond aux types du SplitView existant
  project_type TEXT CHECK (project_type IN ('work_order', 'delivery_note', 'purchase_order', 'submission')),
  project_id BIGINT,                      -- id du document lié (pas de FK: polymorphe sur 4 tables)
  project_number TEXT,                    -- Snapshot du numéro affiché (ex: 'BT-2606-012')

  -- Échéance optionnelle (sans date = trié par création, fond gris)
  due_date DATE,

  -- Complétion (les notes complétées disparaissent du tableau de bord)
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,

  user_id UUID REFERENCES auth.users(id), -- Créateur (métadonnée, partagé entre utilisateurs TMT)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Index pour performance
CREATE INDEX IF NOT EXISTS idx_notes_completed ON notes(completed);
CREATE INDEX IF NOT EXISTS idx_notes_due_date ON notes(due_date);
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_project ON notes(project_type, project_id);

-- 3. RLS (Row Level Security)
--    Modèle identique aux factures: visible/éditable par tout utilisateur
--    authentifié de TMT (Martin terrain + Dominique bureau coordonnent).
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read notes" ON notes
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert notes" ON notes
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update notes" ON notes
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete notes" ON notes
  FOR DELETE USING (auth.uid() IS NOT NULL);
