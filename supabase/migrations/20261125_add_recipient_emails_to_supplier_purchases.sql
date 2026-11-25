-- Destinataires courriel mémorisés sur l'Achat Fournisseur (AF)
-- But: se rappeler quel(s) contact(s) du fournisseur (principal, #2, #3) étaient cochés
--      à l'envoi de l'AF, pour que la réouverture du formulaire et la réimpression du PDF
--      montrent le bon contact au lieu de revenir au contact principal.
-- Format: JSONB, tableau d'adresses courriel, ex. ["achats@fournisseur.com"].
--         NULL = jamais choisi → contact principal par défaut.
-- Aucune nouvelle table (backup inchangé).

ALTER TABLE supplier_purchases
  ADD COLUMN IF NOT EXISTS recipient_emails JSONB;
