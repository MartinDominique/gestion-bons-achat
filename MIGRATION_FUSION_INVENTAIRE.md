# MIGRATION — Fusion `non_inventory_items` → `products`

> **But du document :** notes complètes pour exécuter, plus tard (semaine prochaine),
> la fusion de la table `non_inventory_items` dans `products`, ET l'unification du
> formulaire d'ajout rapide de produit. Rédigé pour être repris à froid, sans
> reperdre le contexte.
>
> **Statut :** 📋 PLAN — rien n'est codé ni déployé. Préparé le 2026-06-12.
> **Auteur du contexte :** session Claude Code (bugs inventaire BT/BL + en commande).
> **Branche de travail :** `claude/exciting-thompson-406769`

---

## 0. TL;DR (résumé en 30 secondes)

- Aujourd'hui l'inventaire est éclaté en **2 tables** : `products` (suivi en stock) et
  `non_inventory_items` (items ad-hoc). Cette dualité est la **cause directe** des bugs
  corrigés cette semaine (stock affiché à 0, listes fusionnées, double traitement).
- **Décision Martin :** tout consolider dans `products`, **tout suivre en stock**
  (pas de flag « non suivi »).
- **Risque maîtrisé :** 27 codes existent dans les 2 tables → réconciliation triviale
  (voir §4), seuls **2 items** ont besoin d'un micro-ajustement de stock.
- **Bonus demandé :** unifier l'ajout rapide de produit pour qu'on puisse saisir
  **coûtant + vendant + quantité de départ** partout (manque actuellement dans BT/BL),
  et renommer le bouton **« Produit Non-Inventaire » → « Nouveau Produit »**.
- **Sûr pour la production quotidienne** : additif, réversible (on garde la table en
  filet), aucune donnée transactionnelle touchée, déploiement le soir.

---

## 1. Contexte & décisions prises

### Historique
Au début de l'app, Martin a importé l'inventaire d'Acomba (ancien logiciel) dans
`products`. Les items ponctuels non présents dans l'inventaire étaient créés « à la
volée » dans `non_inventory_items`. **Aujourd'hui l'app est la source de vérité à
100% de l'inventaire de l'entreprise** → la séparation n'a plus de raison d'être.

### Décisions confirmées avec Martin
1. ✅ **Fusionner** `non_inventory_items` dans `products`.
2. ✅ **Tout suivre en stock** — pas de colonne « is_inventory / track_stock ».
   Conséquence acceptée : un item créé à 0 et utilisé avant réception ira en stock
   **négatif** (comme ça arrive déjà aujourd'hui dans `products`).
3. ✅ **Réconciliation** : `products` est la référence (prix + data). On additionne
   seulement le stock pour les rares doublons qui en ont.
4. ✅ **Garder `non_inventory_items` en filet** quelques jours après la bascule, puis
   `DROP TABLE`.
5. ✅ **Migration SQL exécutée manuellement** par Martin dans Supabase Dashboard
   (comme toutes les migrations du projet).
6. ✅ **Unifier l'ajout rapide** (coûtant/vendant/quantité) + **renommer** le bouton
   en « Nouveau Produit ».

---

## 2. État actuel du code (CE QU'ON DOIT CHANGER)

### 2.1 Schémas des 2 tables
Les colonnes sont quasi identiques (les migrations de prix ont été appliquées aux DEUX
tables — voir `supabase/migrations/add_price_history_columns.sql`).

| Colonne | products | non_inventory_items |
|---|---|---|
| `product_id` (PK, SKU texte) | ✅ | ✅ |
| `description` | ✅ | ✅ |
| `unit` | ✅ | ✅ |
| `cost_price` / `selling_price` | ✅ | ✅ |
| `cost_price_1st/2nd/3rd` | ✅ | ✅ (migration prix) |
| `selling_price_1st/2nd/3rd` | ✅ | ✅ (migration prix) |
| `stock_qty` | ✅ | ✅ (oui ! mise à jour par DirectReceiptModal) |
| `product_group` | ✅ | ✅ |
| `supplier` | ✅ | ✅ |
| `is_non_inventory` | ❓ (à vérifier) | ✅ (utilisé par AF/Soumission) |

> ⚠️ **À VÉRIFIER avant la migration** : la liste exacte des colonnes de `products`
> (via `SELECT column_name FROM information_schema.columns WHERE table_name='products'`)
> et le **type** de `stock_qty` (numeric vs text — le code fait `.toString()` et
> `parseFloat`, donc probablement `numeric` ou `text`; les valeurs vues : `1.83`, `-1`).

### 2.2 Les 4 endroits qui CRÉENT un produit ad-hoc (à unifier)
| Module | Fichier:ligne | Champs actuels | Table cible |
|---|---|---|---|
| **AF** | `components/SupplierPurchaseHooks.js:706-764` (`addNonInventoryProduct`) | code, desc, **coûtant, vendant**, unité, fournisseur, groupe, qté=1 | `non_inventory_items` (avec `is_non_inventory:true`) |
| **Soumission** | `components/SoumissionsManager.js:~905-960` (`quickProductForm`) | code, desc, **coûtant, vendant**, unité, groupe (+ calc marge %, calc USD) | `non_inventory_items` |
| **BT / BL** | `components/work-orders/MaterialSelector.js:478-527` (`quickAddForm`) | code, desc, unité **(PAS de prix, PAS de qté)** ❌ | `non_inventory_items` |

Le `quickAddForm` de MaterialSelector ne capture que `{product_id, description, unit}`
(state défini ~`MaterialSelector.js:165-170`). **C'est le gap principal à combler.**

### 2.3 Les 7 branchements dynamiques de table (`is_non_inventory ? non_inventory_items : products`)
À remplacer par `'products'` :
1. `components/DirectReceiptModal.js:356`
2. `components/SupplierReceiptModal.js:292`
3. `components/SupplierPurchaseHooks.js:604` (mise à jour de prix)
4. `app/api/work-orders/[id]/complete-signature/route.js:229`
5. `app/api/work-orders/[id]/send-email/route.js:205`
6. `app/api/delivery-notes/[id]/complete-signature/route.js:158`
7. `app/api/delivery-notes/[id]/send-email/route.js:174`

### 2.4 Les requêtes qui interrogent / fusionnent LES DEUX tables
À ramener à une seule requête sur `products` :
- `app/api/products/route.js` — modes `inventory_only` + `non_inventory_only` + fusion.
  Le mode non-inventaire forçait `stock_qty:0` (déjà corrigé cette semaine, v1.1.0).
- `app/api/products/search/route.js` — requêtes `products` + `non_inventory_items`.
- `app/api/products/groups/route.js` — groupes des 2 tables.
- `components/InventoryManager.js` — séparation `_source` (`products` / `non_inventory`),
  compteurs `itemCount.nonInventory`, `loadReservedOnly` interroge les 2 tables (lignes ~310-313).
- `components/work-orders/MaterialSelector.js` — `loadProducts()` fait 2 fetch puis merge
  `[...inventoryProducts, ...nonInventoryProducts]` (~lignes 200-243).
- `components/SoumissionsManager.js` — recherche produits dans les 2 tables (~ligne 529-534).

### 2.5 Autres fichiers référençant `non_inventory_items` (À RELIRE pendant l'implémentation)
Liste exhaustive (issue d'un grep complet) — vérifier chacun pour des lectures/jointures
ou des affichages de badge « Non-inventaire » :
- `components/PurchaseOrder/BCCConfirmationModal.js`
- `components/work-orders/WorkOrderForm.js`
- `components/invoices/InvoiceEditor.js`
- `components/SupplierPurchaseServices.js`
- `components/DeliverySlipModal.js`
- `app/api/work-orders/[id]/route.js`
- `app/api/work-orders/[id]/public/route.js`
- `app/api/delivery-notes/[id]/route.js`
- `app/api/delivery-notes/[id]/public/route.js`
- `app/api/cron/backup/route.ts` ⚠️ (le backup quotidien sauvegarde probablement
  `non_inventory_items` — à ajuster pour ne plus dépendre de la table après suppression)
- Affichages de badge `is_non_inventory` : ex. `SoumissionsManager.js:2322`,
  badge « Non-inventaire » dans InventoryManager → deviennent inutiles (à retirer).

> 📌 **Total estimé : ~14-16 fichiers de code**, tous des changements mécaniques
> (pas de logique métier nouvelle, sauf l'unification du formulaire d'ajout rapide).

---

## 3. NOUVELLE EXIGENCE — Unifier l'ajout rapide de produit

**Objectif :** dans **tous** les modules (Soumission, AF, BT, BL), pouvoir saisir à la
création rapide : **code, description, unité, coûtant, vendant, quantité de départ**.
Aujourd'hui BT/BL ne permettent ni prix ni quantité.

### À faire dans `MaterialSelector.js` (BT + BL — composant partagé)
1. Étendre `quickAddForm` :
   ```js
   const [quickAddForm, setQuickAddForm] = useState({
     product_id: '', description: '', unit: 'UN',
     cost_price: '', selling_price: '', stock_qty: ''  // NOUVEAUX
   });
   ```
2. Ajouter les champs UI (coûtant, vendant, quantité de départ) dans le modal d'ajout
   rapide. Respecter les standards CLAUDE.md :
   - `inputmode="decimal"` pour prix, `inputmode="numeric"` pour quantité.
   - `onFocus={(e) => e.target.select()}` (auto-sélection mobile).
   - Touch targets ≥ 44px (BT/BL = 95% tablette).
   - Optionnel : calculateur de marge % (déjà présent dans Soumission/AF — réutiliser le pattern).
3. À la sauvegarde (remplacer le bloc `MaterialSelector.js:480-527`) :
   - `INSERT`/`UPDATE` dans **`products`** (plus `non_inventory_items`).
   - Inclure `cost_price`, `selling_price`, `stock_qty` (défaut 0 si vide).
   - Conserver le `toUpperCase()` sur code + description (standard projet).
4. **Renommer le bouton** « Produit Non-Inventaire » → **« Nouveau Produit »** (chercher
   le libellé dans MaterialSelector + SupplierPurchaseForms + SoumissionsManager).

### À faire dans AF & Soumission
- Ils ont déjà coûtant/vendant. **Ajouter le champ « quantité de départ »** si souhaité
  par cohérence (AF a déjà qté=1 par défaut).
- Rediriger leurs `INSERT` de `non_inventory_items` vers `products`.
- Retirer `is_non_inventory: true` des objets créés (ou le laisser inoffensif si la
  colonne reste; mais cible = ne plus l'utiliser).
- Renommer le bouton en « Nouveau Produit ».

---

## 4. Réconciliation des 27 doublons (DONNÉES RÉELLES)

Requête de détection exécutée le 2026-06-12 → **27 `product_id` présents dans les 2 tables**.
Comparaison stock/prix : **`stock_non_inv = 0` pour 25 items**. Seuls 2 ont du stock côté
non-inventaire :

| product_id | stock_products | stock_non_inv | **stock réconcilié** |
|---|---|---|---|
| **L7PA004U-AD** | -2 | 1 | **-1** (additionner) |
| **USCC3** | -1 | 1 | **0** (additionner) |

Les 25 autres : garder `products` tel quel (rien à faire).
Les **prix** qui diffèrent côté non-inventaire sont périmés → **on garde ceux de `products`**.

**Liste complète des 27 codes** (pour référence) :
`0803876, 1110R, 1600.32.05F, 1605.32.0500.01.MH, 2103523, 8018102, 9007AO2,
APC-VSCN1T-AD, APCS-PN05LS-AD, B11D411000000, BG5933-22-61-24, CHI16LS, D7MMT44,
HBL2311ST, HBL2313ST, HBL2410ST, HBL2620ST, L7PA004U-AD, L7PA010U-AD, MHO16L32,
P1-540, P150, SLB50S, TA30, TED136030, USCC3, VH363GL`

> ℹ️ **Note (hors migration)** : plusieurs lignes `products` sont DÉJÀ en stock négatif
> aujourd'hui (`-1`, `-2`, `-3`...). La migration n'en crée pas. À nettoyer lors d'une
> prise d'inventaire, indépendamment.

---

## 5. SCRIPT SQL DE MIGRATION (BROUILLON — à valider avant exécution)

> ⚠️ Tous ces SQL sont des **brouillons**. Avant de lancer : (a) faire un backup/snapshot,
> (b) vérifier la liste exacte des colonnes de `products`, (c) confirmer le type de `stock_qty`.

```sql
-- ============================================================
-- ÉTAPE 0 — Sécurité : re-vérifier les collisions (doit donner 27)
-- ============================================================
SELECT n.product_id
FROM non_inventory_items n
JOIN products p ON p.product_id = n.product_id;

-- ============================================================
-- ÉTAPE 1 — Réconcilier le stock des 2 doublons qui en ont
--   (additionner le +1 du non-inventaire). Adapter le cast au type réel de stock_qty.
-- ============================================================
UPDATE products p
SET stock_qty = (COALESCE(p.stock_qty::numeric,0) + COALESCE(n.stock_qty::numeric,0))::text
FROM non_inventory_items n
WHERE n.product_id = p.product_id
  AND n.product_id IN ('L7PA004U-AD','USCC3');
-- (Si stock_qty est de type numeric, retirer les ::text.)

-- ============================================================
-- ÉTAPE 2 — Copier dans products les items non-inventaire NON présents dans products
--   ⚠️ Ajuster la liste des colonnes après vérification du schéma réel de products.
-- ============================================================
INSERT INTO products (
  product_id, description, unit,
  cost_price, selling_price, stock_qty,
  product_group, supplier,
  cost_price_1st, cost_price_2nd, cost_price_3rd,
  selling_price_1st, selling_price_2nd, selling_price_3rd
)
SELECT
  n.product_id, n.description, n.unit,
  n.cost_price, n.selling_price, COALESCE(n.stock_qty, 0),
  COALESCE(n.product_group, 'Divers'), n.supplier,
  n.cost_price_1st, n.cost_price_2nd, n.cost_price_3rd,
  n.selling_price_1st, n.selling_price_2nd, n.selling_price_3rd
FROM non_inventory_items n
WHERE NOT EXISTS (
  SELECT 1 FROM products p WHERE p.product_id = n.product_id
);

-- ============================================================
-- ÉTAPE 3 — Vérification post-migration
-- ============================================================
-- Tous les items non-inventaire doivent maintenant exister dans products :
SELECT n.product_id
FROM non_inventory_items n
LEFT JOIN products p ON p.product_id = n.product_id
WHERE p.product_id IS NULL;   -- doit retourner 0 ligne

-- ============================================================
-- ÉTAPE 4 — (PLUS TARD, après validation de plusieurs jours)
-- ============================================================
-- DROP TABLE non_inventory_items;   -- NE PAS exécuter avant validation complète
```

---

## 6. SÉQUENCE DE DÉPLOIEMENT SANS GLITCH (un soir, faible activité)

L'ordre est important pour éviter qu'un item « disparaisse » ou apparaisse en double.

1. **Backup** Supabase (snapshot / export).
2. **Exécuter le SQL** Étapes 0→3 (copie des données dans `products`).
   - Fenêtre transitoire : avec l'ANCIEN code encore en ligne, les items migrés peuvent
     apparaître **en double** dans les recherches (products + non_inventory). C'est
     **cosmétique**, aucune perte ni blocage.
3. **Déployer le nouveau code** (lecture/écriture `products` uniquement) immédiatement après.
   → les doublons d'affichage disparaissent.
4. **Tester** le lendemain (voir §7).
5. **Plus tard** (quelques jours OK) : `DROP TABLE non_inventory_items` + nettoyer
   `app/api/cron/backup/route.ts`.

> Pourquoi c'est sûr : les BT/BL/AF/factures référencent les items par `product_id`
> (inchangé). Aucune donnée transactionnelle n'est modifiée. La table source reste en
> filet jusqu'au DROP.

---

## 7. CHECKLIST DE TESTS (après déploiement)

- [ ] **Recherche inventaire** : un ancien item non-inventaire apparaît une seule fois,
      avec son vrai stock.
- [ ] **Recherche matériaux BT** : item trouvé, stock + « En commande » corrects.
- [ ] **Recherche matériaux BL** : idem.
- [ ] **Recherche produits AF** : idem.
- [ ] **Recherche produits Soumission** : idem.
- [ ] **Nouveau Produit (BT)** : créer avec code/desc/unité/**coûtant/vendant/qté** → sauvé
      dans products, ajouté au BT.
- [ ] **Nouveau Produit (BL)** : idem.
- [ ] **Nouveau Produit (AF)** : idem (+ quantité de départ).
- [ ] **Nouveau Produit (Soumission)** : idem.
- [ ] **Réception directe** (DirectReceiptModal) sur un ancien item non-inventaire → stock monte.
- [ ] **Réception AF** (SupplierReceiptModal) → stock monte.
- [ ] **Signature BT** avec un ancien item non-inventaire → stock décrémente (mouvement OUT).
- [ ] **Signature BL** → idem.
- [ ] **Facturation** : un BT/BL avec ancien item non-inventaire se facture correctement.
- [ ] **Statistiques / Export Acomba** : pas d'item manquant.
- [ ] **Backup quotidien** (`/api/cron/backup`) : fonctionne sans la table (après DROP).
- [ ] **Vérifier les 2 réconciliés** : `L7PA004U-AD` = -1, `USCC3` = 0.

---

## 8. ROLLBACK

Tant que `non_inventory_items` n'est PAS supprimée :
- **Annuler le code** : redéployer la version précédente (revert du commit/branche).
- **Annuler les données** : les lignes copiées dans `products` peuvent être retirées via
  une liste des `product_id` migrés (les conserver dans une table temp ou un export avant
  l'INSERT pour faciliter le rollback). Les 2 ajustements de stock sont réversibles
  (-1 sur L7PA004U-AD et USCC3).
- L'app fonctionnait avec les 2 tables → revenir en arrière est sans risque tant que le
  DROP n'est pas fait.

---

## 9. RÉCAP DES BUGS DÉJÀ CORRIGÉS CETTE SEMAINE (contexte connexe)

Branche `claude/exciting-thompson-406769` :
1. **Stock 0 des items non-inventaire dans la recherche BT/BL** — `app/api/products/route.js`
   v1.1.0 : le mode non-inventaire forçait `stock_qty:0`; il lit maintenant la vraie valeur.
   (Cette migration rend ce correctif caduc puisque tout sera dans `products`.)
2. **Badge stock périmé** — `MaterialSelector.js` v1.5.0 : rafraîchissement du cache.
3. **« En commande » affichait +0 dans l'inventaire** — `InventoryManager.js` v3.9.0 :
   `loadQuantities()` rafraîchi à chaque chargement (avant : seulement au montage).
   La donnée serveur (`/api/inventory/reservations`) était correcte.
4. **« En commande » absent de la recherche BT/BL** — `MaterialSelector.js` v1.6.0 :
   affiche maintenant « En commande: +X » à côté du stock.

> Rappel : « En commande » = AF aux statuts `ordered` + `partial` uniquement
> (PAS `in_order`). À revisiter si Martin veut compter aussi `in_order`.

---

*Document à mettre à jour au fil de l'implémentation. Une fois la migration faite,
cocher §7, mettre à jour CLAUDE.md (retirer les références à `non_inventory_items`) et
RECOMMANDATIONS.md.*
