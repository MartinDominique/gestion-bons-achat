-- Migration: Élargir total_hours sur work_orders (correction « numeric field overflow »)
-- Date: 2026-06-15
-- Description:
--   La colonne work_orders.total_hours était définie en numeric(4,2),
--   dont le maximum est 99,99 h. Sur un BT avec de nombreuses sessions de
--   travail, le cumul des heures finissait par dépasser ce plafond, ce qui
--   provoquait l'erreur PostgreSQL « numeric field overflow » au moment de
--   sauvegarder (constaté sur BT-2026-084, ~16 sessions, > 100 h cumulées).
--
--   Ce n'est PAS une limite du nombre de sessions : c'est un plafond d'heures
--   cumulées. On élargit la colonne en numeric(7,2) (max 99 999,99 h), ce qui
--   rend le plafond inatteignable dans la vraie vie.
--
--   Aucune perte de données : numeric(4,2) -> numeric(7,2) est une expansion
--   sûre (la précision et l'échelle augmentent, les valeurs existantes restent
--   valides).

ALTER TABLE work_orders
  ALTER COLUMN total_hours TYPE numeric(7,2);
