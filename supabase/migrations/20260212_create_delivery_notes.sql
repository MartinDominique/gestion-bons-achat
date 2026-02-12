-- ============================================
-- Migration: Création des tables delivery_notes et delivery_note_materials
-- Date: 2026-02-12
-- Description: Tables pour les Bons de Livraison (BL)
-- ============================================

-- ============================================
-- 1. Table principale: delivery_notes
-- ============================================
CREATE TABLE IF NOT EXISTS delivery_notes (
  id BIGSERIAL PRIMARY KEY,
  bl_number TEXT UNIQUE NOT NULL,
  client_id BIGINT REFERENCES clients(id),
  client_name TEXT,
  linked_po_id BIGINT REFERENCES purchase_orders(id),
  delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  is_prix_jobe BOOLEAN DEFAULT FALSE,
  signature_data TEXT,
  signature_timestamp TIMESTAMPTZ,
  client_signature_name TEXT,
  recipient_emails JSONB DEFAULT '[]'::jsonb,
  email_sent_at TIMESTAMPTZ,
  email_sent_to TEXT,
  email_message_id TEXT,
  auto_send_success BOOLEAN,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_delivery_notes_client_id ON delivery_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_status ON delivery_notes(status);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_bl_number ON delivery_notes(bl_number);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_delivery_date ON delivery_notes(delivery_date);

-- Trigger pour updated_at automatique
CREATE OR REPLACE FUNCTION update_delivery_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_delivery_notes_updated_at
  BEFORE UPDATE ON delivery_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_delivery_notes_updated_at();

-- Fonction pour générer le bl_number automatiquement (BL-YYMM-###)
CREATE OR REPLACE FUNCTION generate_bl_number()
RETURNS TRIGGER AS $$
DECLARE
  prefix TEXT;
  next_seq INT;
BEGIN
  prefix := 'BL-' || TO_CHAR(NOW(), 'YYMM') || '-';

  SELECT COALESCE(MAX(
    CAST(SUBSTRING(bl_number FROM LENGTH(prefix) + 1) AS INTEGER)
  ), 0) + 1
  INTO next_seq
  FROM delivery_notes
  WHERE bl_number LIKE prefix || '%';

  NEW.bl_number := prefix || LPAD(next_seq::TEXT, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_bl_number
  BEFORE INSERT ON delivery_notes
  FOR EACH ROW
  WHEN (NEW.bl_number IS NULL OR NEW.bl_number = '')
  EXECUTE FUNCTION generate_bl_number();

-- ============================================
-- 2. Table des matériaux: delivery_note_materials
-- ============================================
CREATE TABLE IF NOT EXISTS delivery_note_materials (
  id BIGSERIAL PRIMARY KEY,
  delivery_note_id BIGINT NOT NULL REFERENCES delivery_notes(id) ON DELETE CASCADE,
  product_id TEXT,
  product_code TEXT,
  description TEXT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'UN',
  unit_price NUMERIC DEFAULT 0,
  show_price BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_note_materials_note_id ON delivery_note_materials(delivery_note_id);

-- ============================================
-- 3. Row Level Security (RLS)
-- ============================================

-- delivery_notes
ALTER TABLE delivery_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own delivery notes" ON delivery_notes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own delivery notes" ON delivery_notes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own delivery notes" ON delivery_notes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own delivery notes" ON delivery_notes
  FOR DELETE USING (auth.uid() = user_id);

-- delivery_note_materials (via join avec delivery_notes.user_id)
ALTER TABLE delivery_note_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own delivery note materials" ON delivery_note_materials
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM delivery_notes
      WHERE delivery_notes.id = delivery_note_materials.delivery_note_id
      AND delivery_notes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own delivery note materials" ON delivery_note_materials
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM delivery_notes
      WHERE delivery_notes.id = delivery_note_materials.delivery_note_id
      AND delivery_notes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own delivery note materials" ON delivery_note_materials
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM delivery_notes
      WHERE delivery_notes.id = delivery_note_materials.delivery_note_id
      AND delivery_notes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own delivery note materials" ON delivery_note_materials
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM delivery_notes
      WHERE delivery_notes.id = delivery_note_materials.delivery_note_id
      AND delivery_notes.user_id = auth.uid()
    )
  );
