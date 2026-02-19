# Rapports & Statistiques de Ventes - Plan d'implantation

**Date:** 2026-02-19
**Statut:** Plan initial - En attente d'approbation
**Module:** Nouvel onglet "Statistiques" dans la navigation principale

---

## 1. Vue d'ensemble

### Objectif

Créer un module de rapports et statistiques permettant de visualiser les **coûts**, **prix de vente** et **marges de profit** pour chaque document (BT, BL, Soumissions). Le module offrira des capacités de recherche avancée, une visualisation à l'écran et l'impression en PDF.

### Utilisateurs cibles

- **Martin (terrain):** Consultation rapide sur tablette/mobile
- **Dominique (bureau):** Analyse détaillée sur desktop, impression PDF

### Données sources

| Source | Table(s) | Données disponibles |
|--------|----------|---------------------|
| **BT** | `work_orders` + `work_order_materials` | Heures (time_entries), matériaux (unit_price, quantity), client, date |
| **BL** | `delivery_notes` + `delivery_note_materials` | Matériaux (unit_price, quantity), client, date |
| **Soumissions** | `submissions` + `submission_items` | Items (selling_price, cost_price), client, statut |
| **Produits** | `products` + `non_inventory_items` | cost_price, selling_price, historique prix |

---

## 2. Architecture technique

### Nouveaux fichiers à créer

```
src/app/(protected)/statistiques/page.js          → Page principale du module
src/app/api/statistics/route.js                    → API endpoint pour les données agrégées
src/components/statistics/StatisticsManager.js     → Composant principal (onglets + filtres)
src/components/statistics/SalesReport.js           → Rapport ventes (BT/BL/Soumissions)
src/components/statistics/StatisticsFilters.js     → Composant filtres de recherche
src/components/statistics/StatisticsPDFExport.js   → Génération PDF des rapports
```

### Fichiers à modifier

```
src/components/Navigation.js                       → Ajouter onglet "Statistiques"
```

### Endpoint API

```
GET /api/statistics?type=bt|bl|soumission|all
                   &dateFrom=YYYY-MM-DD
                   &dateTo=YYYY-MM-DD
                   &clientId=123
                   &search=terme
                   &documentNumber=BT-2602-001
                   &productId=PROD-001
                   &sortBy=date|margin|total
                   &sortOrder=asc|desc
                   &page=0
                   &limit=50
```

**Réponse type:**
```json
{
  "success": true,
  "data": {
    "documents": [...],
    "summary": {
      "totalRevenue": 0,
      "totalCost": 0,
      "totalMargin": 0,
      "marginPercent": 0,
      "documentCount": 0
    }
  },
  "pagination": { "page": 0, "limit": 50, "total": 120 }
}
```

---

## 3. Fonctionnalités - Phase 1 (MVP)

### 3.1 Rapport de ventes par document

Vue tableau listant chaque BT, BL et Soumission avec:

| Colonne | Description |
|---------|-------------|
| Type | BT / BL / Soum. |
| N° Document | BT-2602-001, BL-2602-003, etc. |
| Date | Date du document |
| Client | Nom du client |
| Description | Description du travail/livraison |
| Revenus (vente) | Total prix de vente (matériaux + heures si BT) |
| Coûts | Total prix coûtant des matériaux |
| Marge ($) | Revenus - Coûts |
| Marge (%) | (Marge / Revenus) × 100 |
| Statut | Statut du document |

**Calcul des revenus et coûts:**

- **BT:** Revenus = somme(matériaux × unit_price) + (heures × taux horaire si applicable). Coûts = somme(matériaux × cost_price du produit au moment de la création).
- **BL:** Revenus = somme(matériaux × unit_price). Coûts = somme(matériaux × cost_price du produit).
- **Soumissions:** Revenus = somme(items × selling_price). Coûts = somme(items × cost_price).

**Note importante sur le cost_price des BT/BL:**
Actuellement, les tables `work_order_materials` et `delivery_note_materials` ne stockent que le `unit_price` (prix de vente). Le `cost_price` n'est pas capturé au moment de la création du document. Deux options:

1. **Option A (recommandée pour MVP):** Joindre la table `products` pour obtenir le `cost_price` actuel. Limitation: si le prix coûtant a changé depuis, la marge sera approximative.
2. **Option B (amélioration future):** Ajouter une colonne `cost_price` aux tables `work_order_materials` et `delivery_note_materials` pour capturer le coût au moment exact de la création. Nécessite une migration SQL.

### 3.2 Filtres de recherche

Barre de filtres en haut du rapport:

- **Type de document:** Checkboxes (BT / BL / Soumissions) - multi-sélection
- **Période:** Date début + Date fin (défaut: mois en cours)
- **Client:** Dropdown recherchable (autocomplete)
- **N° Document:** Champ texte libre (recherche partielle)
- **Description:** Champ texte libre (recherche dans work_description / delivery_description)
- **Item/Produit:** Champ texte libre (recherche dans les matériaux par product_id ou description)

**Comportement:**
- Les filtres se combinent (AND)
- Un bouton "Réinitialiser" remet les filtres par défaut
- Les résultats se mettent à jour automatiquement (ou bouton "Rechercher")
- Pagination: 50 résultats par page

### 3.3 Résumé / Totaux

Bandeau en haut (ou en bas) affichant les totaux **de la sélection filtrée**:

```
┌─────────────────────────────────────────────────────────────┐
│  Documents: 45  │  Revenus: 125 430 $  │  Coûts: 78 200 $  │
│  Marge: 47 230 $  │  Marge moyenne: 37.7%                   │
└─────────────────────────────────────────────────────────────┘
```

### 3.4 Export PDF

Bouton "Imprimer PDF" générant un rapport avec:

- **En-tête:** Logo Services TMT + titre "Rapport de Ventes" + période sélectionnée
- **Filtres appliqués:** Résumé des filtres actifs
- **Tableau:** Même colonnes que l'affichage écran
- **Totaux:** Bandeau résumé en bas
- **Footer:** Standard pdf-common.js (pagination, coordonnées)

**Méthode:** Utiliser `pdf-common.js` avec jsPDF + autoTable (cohérent avec les autres PDF du système).

### 3.5 Navigation

Ajout dans `Navigation.js`:
```javascript
{ id: 'statistiques', name: 'Statistiques', shortName: "Stats", icon: BarChart3 }
```

Route: `/(protected)/statistiques`

---

## 4. Fonctionnalités - Phase 2 (Améliorations)

### 4.1 Détail par document (drill-down)

Cliquer sur une ligne du rapport ouvre un panneau latéral (style SplitView existant) montrant:

- Détail complet du document (matériaux ligne par ligne)
- Coût vs vente par item
- Marge par item
- Lien vers le document original (modifier/consulter)

### 4.2 Ajout colonne `cost_price` aux matériaux BT/BL

Migration SQL pour ajouter `cost_price` aux tables:
- `work_order_materials`
- `delivery_note_materials`

Modifier `WorkOrderForm.js` et `DeliveryNoteForm.js` pour capturer le `cost_price` du produit au moment de l'ajout d'un matériau. Cela permettra des marges exactes historiques.

### 4.3 Graphiques visuels

Ajouter des graphiques optionnels (bibliothèque légère type Recharts ou Chart.js):

- **Revenus vs Coûts par mois** (barres empilées)
- **Évolution de la marge (%)** (ligne temporelle)
- **Répartition par client** (camembert/donut)
- **Top 10 clients par revenus** (barres horizontales)

### 4.4 Amélioration filtres

- Filtre par **BA (Bon d'Achat)** lié
- Filtre par **statut** du document
- Filtre par **Prix Jobe** (oui/non)
- Sauvegarde des filtres favoris (localStorage)

---

## 5. Fonctionnalités - Phase 3 (Futures)

### 5.1 Rapport par produit

Nouveau sous-onglet "Produits" dans le module Statistiques:

| Colonne | Description |
|---------|-------------|
| Code produit | product_id |
| Description | Description du produit |
| Groupe | product_group |
| Qté vendue | Somme des quantités dans BT + BL |
| Revenus | Somme (qté × unit_price) |
| Coûts | Somme (qté × cost_price) |
| Marge ($) | Revenus - Coûts |
| Marge (%) | Pourcentage |

**Filtres spécifiques:**
- Par groupe de produits (dropdown)
- Par produit individuel (recherche)
- Par période
- Par client

**Drill-down:** Cliquer sur un produit montre la liste des documents où il apparaît.

### 5.2 Rapport heures travaillées

Nouveau sous-onglet "Heures" dans le module Statistiques:

| Colonne | Description |
|---------|-------------|
| Date | Date de l'entrée de temps |
| N° BT | Numéro du bon de travail |
| Client | Nom du client |
| Description | Description du travail |
| Heures brutes | Heures réelles travaillées |
| Heures facturées | Heures après arrondi quart d'heure |
| Surcharge | Type (Soir, Samedi, Dimanche, Férié) |
| Taux | 1x ou 1.5x |
| Déplacement | Minutes de déplacement |

**Résumé:**
- Total heures facturées par période
- Répartition normal vs surcharge
- Heures par client
- Heures par jour/semaine/mois

### 5.3 Tableau de bord (Dashboard)

Vue résumé avec widgets:

- Revenus du mois / trimestre / année
- Marge moyenne
- Nombre de BT/BL/Soumissions
- Top clients
- Alertes (marges faibles, documents non envoyés)

---

## 6. Considérations techniques

### 6.1 Performance

- **Pagination côté serveur** (max 50 résultats par requête)
- **Indexes SQL** sur: `work_date`, `delivery_date`, `client_id`, `status`
- **Calculs agrégés** faits côté serveur (Supabase) et non côté client
- **Cache:** Envisager un cache léger (localStorage ou SWR) pour les données déjà chargées

### 6.2 Sécurité

- **RLS:** L'endpoint API utilise `supabaseAdmin` (server-side) car les statistiques nécessitent un accès cross-tables
- **Auth:** Vérifier `auth.uid()` dans l'API route avant d'exécuter les requêtes
- **Pas d'accès public:** Module protégé sous `(protected)/`

### 6.3 Responsive

- **Desktop:** Tableau complet avec toutes les colonnes
- **Tablette:** Colonnes réduites (masquer Description, garder l'essentiel)
- **Mobile:** Vue carte (card) au lieu du tableau, avec les infos clés empilées

### 6.4 Taxes

Les montants affichés dans les rapports sont **avant taxes** (sous-totaux). Les taxes TPS/TVQ ne sont pas incluses dans les calculs de marge car elles ne représentent pas un revenu réel.

### 6.5 Migration SQL nécessaire (Phase 2)

```sql
-- Ajouter cost_price aux matériaux BT
ALTER TABLE work_order_materials ADD COLUMN cost_price NUMERIC DEFAULT 0;

-- Ajouter cost_price aux matériaux BL
ALTER TABLE delivery_note_materials ADD COLUMN cost_price NUMERIC DEFAULT 0;

-- Index pour performance des requêtes statistiques
CREATE INDEX idx_work_orders_work_date ON work_orders(work_date);
CREATE INDEX idx_delivery_notes_delivery_date ON delivery_notes(delivery_date);
CREATE INDEX idx_work_order_materials_work_order_id ON work_order_materials(work_order_id);
CREATE INDEX idx_delivery_note_materials_delivery_note_id ON delivery_note_materials(delivery_note_id);
```

---

## 7. Plan d'implantation par phases

### Phase 1 - MVP (Priorité haute)

1. Créer la page `/(protected)/statistiques/page.js`
2. Créer l'API `/api/statistics/route.js` avec requêtes agrégées
3. Créer `StatisticsManager.js` avec tableau de ventes
4. Implémenter les filtres de base (type, date, client, n° document, description, item)
5. Ajouter le bandeau résumé (totaux, marge)
6. Ajouter l'onglet dans `Navigation.js`
7. Implémenter l'export PDF via `pdf-common.js`

### Phase 2 - Améliorations

8. Ajouter `cost_price` aux tables matériaux (migration SQL)
9. Modifier les formulaires BT/BL pour capturer le cost_price
10. Implémenter le drill-down (détail par document)
11. Ajouter les filtres avancés (BA lié, statut, Prix Jobe)
12. Ajouter les graphiques (Recharts ou Chart.js)

### Phase 3 - Rapports avancés

13. Sous-onglet "Produits" (rapport par produit/groupe)
14. Sous-onglet "Heures" (rapport heures travaillées)
15. Tableau de bord (Dashboard) avec widgets résumé

---

## 8. Questions ouvertes / Décisions à prendre

1. **Taux horaire pour les BT:** Quel est le taux horaire standard à utiliser pour calculer le revenu des heures dans les BT? Est-ce un taux fixe ou variable par client?

2. **Coût des heures:** Quel est le coût interne d'une heure de travail (salaire + charges) pour le calcul de la marge sur les heures?

3. **Soumissions non acceptées:** Faut-il inclure toutes les soumissions ou seulement celles avec statut "acceptée" / "envoyée"?

4. **Bibliothèque graphiques:** Préférence entre Recharts (plus léger, React-native) ou Chart.js (plus mature, plus d'options)?

5. **Accès:** Est-ce que Martin et Dominique ont tous les deux accès aux statistiques, ou seulement Dominique (bureau)?

---

*Document créé le 2026-02-19 - À réviser par Martin/Dominique avant implantation.*
