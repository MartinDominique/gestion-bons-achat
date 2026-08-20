-- ============================================
-- Mode de paiement habituel du client + mode Interac
-- Date: 2026-08-20
-- Description: Ajoute clients.preferred_payment_method (mode de paiement habituel)
--              et autorise le mode 'interac' sur invoice_payments.
-- ============================================

-- 1. Mode de paiement habituel du client (informatif, affiché à l'état de compte)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS preferred_payment_method TEXT;

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_preferred_payment_method_check;
ALTER TABLE clients ADD CONSTRAINT clients_preferred_payment_method_check
  CHECK (
    preferred_payment_method IS NULL
    OR preferred_payment_method = ''
    OR preferred_payment_method IN ('cheque', 'virement', 'interac', 'comptant')
  );

-- 2. Nouveau mode de paiement 'interac' sur les paiements de factures
ALTER TABLE invoice_payments DROP CONSTRAINT IF EXISTS invoice_payments_method_check;
ALTER TABLE invoice_payments ADD CONSTRAINT invoice_payments_method_check
  CHECK (method IN ('cheque', 'virement', 'interac', 'comptant', 'autre'));
