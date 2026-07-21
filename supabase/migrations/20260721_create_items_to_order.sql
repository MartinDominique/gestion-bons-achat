-- ============================================
-- Liste « À Commander » — Table items_to_order
-- Date: 2026-07-21
-- Description: File d'attente de réapprovisionnement. Depuis un BT, un BL, une
--              soumission ou la page inventaire, l'utilisateur ajoute un produit
--              d'un tap (« + À commander »). Les items s'accumulent ici. Plus tard,
--              au bureau, l'utilisateur sélectionne des items et crée un Achat
--              Fournisseur (AF) pré-rempli. Une fois commandé, l'item passe en
--              statut 'ordered' (badge vert + lien vers l'AF) et reste visible dans
--              la vue « Commandés » (historique).
-- ============================================

-- 1. Table principale de la liste à commander
CREATE TABLE IF NOT EXISTS items_to_order (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identification du produit
  -- product_id peut être NULL (SKU texte non résolu) — on garde toujours product_code
  product_id TEXT,                        -- UUID/number du produit OU SKU texte, si connu
  product_code TEXT,                      -- Code produit affiché (ex: 'CI71')
  description TEXT NOT NULL,               -- Description du produit (requis)
  unit TEXT DEFAULT 'UN',                 -- Unité (UN, m, Lg, etc.)

  -- Quantité suggérée (tap direct = qté du document, ajustable au bureau)
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,

  -- Fournisseur suggéré (proposition souple, changeable à la commande)
  -- Vient de products.supplier au moment de l'ajout — peut être NULL (« À assigner »)
  suggested_supplier TEXT,

  -- Prix coûtant connu au moment de l'ajout (snapshot, aide à la commande)
  cost_price NUMERIC(12,2),

  -- Provenance de l'item (traçabilité : d'où vient la demande)
  source_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('work_order', 'delivery_note', 'submission', 'inventory', 'manual')),
  source_id BIGINT,                       -- id du document source (NULL pour inventory/manual)
  source_number TEXT,                     -- Snapshot du numéro (ex: 'BT-2607-012')
  client_name TEXT,                       -- Client associé au document source (optionnel)

  notes TEXT,                             -- Note libre optionnelle

  -- Cycle de vie
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ordered')),
  ordered_at TIMESTAMPTZ,                 -- Horodatage du passage en commande

  -- Lien vers l'AF créé (pas de FK : supprimable indépendamment)
  supplier_purchase_id BIGINT,            -- id du supplier_purchases (AF) créé
  supplier_purchase_number TEXT,          -- Snapshot du N° d'AF (ex: 'AF-2607-005')

  user_id UUID REFERENCES auth.users(id), -- Créateur (métadonnée, liste partagée TMT)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Index pour performance
CREATE INDEX IF NOT EXISTS idx_items_to_order_status ON items_to_order(status);
CREATE INDEX IF NOT EXISTS idx_items_to_order_supplier ON items_to_order(suggested_supplier);
CREATE INDEX IF NOT EXISTS idx_items_to_order_product ON items_to_order(product_id);
CREATE INDEX IF NOT EXISTS idx_items_to_order_af ON items_to_order(supplier_purchase_id);
CREATE INDEX IF NOT EXISTS idx_items_to_order_created ON items_to_order(created_at);

-- 3. RLS (Row Level Security)
--    Modèle identique aux notes/factures : liste partagée entre utilisateurs
--    authentifiés de TMT (capture terrain + commande bureau se coordonnent).
ALTER TABLE items_to_order ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read items_to_order" ON items_to_order
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert items_to_order" ON items_to_order
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update items_to_order" ON items_to_order
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete items_to_order" ON items_to_order
  FOR DELETE USING (auth.uid() IS NOT NULL);
