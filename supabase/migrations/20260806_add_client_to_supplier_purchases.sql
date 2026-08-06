-- Ajout des colonnes client à supplier_purchases (AF)
-- But: permettre d'associer un client à un Achat Fournisseur même lorsqu'aucun
--      Bon d'Achat client (BA) n'est lié — pour savoir « pour qui » la commande
--      est passée. Remplace visuellement le champ « BA Acomba » (retiré du formulaire
--      et de la liste) par un champ « Client » dans le cadre « Bon d'achat client lié ».
-- Note: pas de contrainte FK (référence souple, cohérent avec le reste de l'app).

ALTER TABLE supplier_purchases
  ADD COLUMN IF NOT EXISTS client_id BIGINT,
  ADD COLUMN IF NOT EXISTS client_name TEXT;
