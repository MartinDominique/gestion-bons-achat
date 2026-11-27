-- ============================================================================
-- Compte payeur commun (regroupement de clients pour l'état de compte)
-- Date: 2026-11-27
--
-- Cas: « Tapis Venture U1 » et « Tapis Venture U2 » sont deux fiches client
-- (deux usines, contacts différents) mais UN seul payeur. Le client fait un
-- seul paiement pour les factures des deux usines.
--
-- billing_parent_id : sur la fiche « rattachée » (ex. U2) → id de la fiche
--                     « compte payeur » (ex. U1). NULL = client autonome.
--                     Référence souple (sans FK), comme les autres liens.
-- statement_name    : nom affiché sur l'état de compte (écran, PDF, courriel),
--                     ex. « Tapis Venture ». NULL = nom de la fiche.
--
-- Aucune donnée existante n'est modifiée: factures, paiements, BT/BL, BA et
-- statistiques restent rattachés à leur fiche client d'origine.
-- ============================================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS billing_parent_id BIGINT,
  ADD COLUMN IF NOT EXISTS statement_name TEXT;

CREATE INDEX IF NOT EXISTS idx_clients_billing_parent_id
  ON clients (billing_parent_id)
  WHERE billing_parent_id IS NOT NULL;

COMMENT ON COLUMN clients.billing_parent_id IS 'Compte payeur: id de la fiche client qui regroupe l''état de compte (NULL = autonome)';
COMMENT ON COLUMN clients.statement_name IS 'Nom affiché sur l''état de compte (NULL = nom de la fiche)';
