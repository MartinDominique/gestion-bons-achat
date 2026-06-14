-- ============================================
-- État de compte client — Table invoice_payments + paiements partiels
-- Date: 2026-06-14
-- Description: Suivi des paiements (partiels/complets) par facture, escompte 2%,
--              intérêts de retard configurables, statut 'partial' sur invoices.
-- ============================================

-- 1. Table des paiements appliqués aux factures
--    Une facture peut recevoir plusieurs paiements (partiels).
CREATE TABLE IF NOT EXISTS invoice_payments (
  id BIGSERIAL PRIMARY KEY,

  invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  client_id BIGINT REFERENCES clients(id),

  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC NOT NULL DEFAULT 0,              -- Montant réellement reçu (cash/chèque/virement)
  discount_applied NUMERIC NOT NULL DEFAULT 0,    -- Escompte 2% accordé (crédité à la facture, non encaissé)

  method TEXT DEFAULT 'cheque' CHECK (method IN ('cheque', 'virement', 'comptant', 'autre')),
  reference TEXT,                                 -- N° de chèque / virement / référence
  notes TEXT,

  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Index pour performance
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice_id ON invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_client_id ON invoice_payments(client_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_payment_date ON invoice_payments(payment_date);

-- 3. RLS (Row Level Security) — cohérent avec invoices (authenticated)
ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read invoice_payments" ON invoice_payments
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert invoice_payments" ON invoice_payments
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update invoice_payments" ON invoice_payments
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete invoice_payments" ON invoice_payments
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- 4. Colonne cache du montant crédité sur la facture (= Σ amount + Σ discount_applied)
--    Permet d'afficher le solde (total - amount_paid) sans jointure.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_paid NUMERIC NOT NULL DEFAULT 0;

-- 5. Nouveau statut 'partial' (facture partiellement payée)
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('draft', 'sent', 'partial', 'paid'));

-- 6. Paramètres globaux: taux d'intérêt annuel sur retard + note pied de relevé
ALTER TABLE settings ADD COLUMN IF NOT EXISTS late_interest_annual_rate NUMERIC NOT NULL DEFAULT 18;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS statement_footer_note TEXT;
