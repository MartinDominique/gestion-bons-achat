-- ============================================
-- Phase B: Facturation MVP — Table invoices
-- Date: 2026-02-27
-- Description: Crée la table invoices et ajoute invoice_id aux BT/BL
-- ============================================

-- 1. Table principale des factures
CREATE TABLE IF NOT EXISTS invoices (
  id BIGSERIAL PRIMARY KEY,
  invoice_number TEXT UNIQUE NOT NULL,  -- Numéro séquentiel simple (ex: '100245')

  client_id BIGINT REFERENCES clients(id),
  client_name TEXT NOT NULL,
  client_address TEXT,
  -- Snapshot au moment de la facturation (historique permanent)

  source_type TEXT NOT NULL CHECK (source_type IN ('work_order', 'delivery_note')),
  source_id BIGINT NOT NULL,
  source_number TEXT NOT NULL,  -- Numéro BT ou BL (ex: 'BT-2602-010')

  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  payment_terms TEXT,

  line_items JSONB NOT NULL DEFAULT '[]',

  subtotal NUMERIC NOT NULL DEFAULT 0,
  tps_rate NUMERIC NOT NULL DEFAULT 5.0,
  tvq_rate NUMERIC NOT NULL DEFAULT 9.975,
  tps_amount NUMERIC NOT NULL DEFAULT 0,
  tvq_amount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,

  -- Ventilation pour rapport Acomba
  total_materials NUMERIC DEFAULT 0,
  total_labor NUMERIC DEFAULT 0,
  total_transport NUMERIC DEFAULT 0,

  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid')),

  is_prix_jobe BOOLEAN DEFAULT FALSE,
  notes TEXT,
  pdf_url TEXT,

  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,

  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Index pour performance
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date ON invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_source ON invoices(source_type, source_id);

-- 3. RLS (Row Level Security)
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read invoices" ON invoices
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert invoices" ON invoices
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update invoices" ON invoices
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete invoices" ON invoices
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- 4. Ajouter invoice_id aux BT et BL
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS invoice_id BIGINT REFERENCES invoices(id) DEFAULT NULL;
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS invoice_id BIGINT REFERENCES invoices(id) DEFAULT NULL;

-- 5. Index sur invoice_id pour les jointures
CREATE INDEX IF NOT EXISTS idx_work_orders_invoice_id ON work_orders(invoice_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_invoice_id ON delivery_notes(invoice_id);
