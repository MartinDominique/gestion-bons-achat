# Facturation, Taux Horaires & Statistiques Avancées - Plan d'implantation

**Date:** 2026-02-26
**Statut:** Plan initial - En attente d'approbation Martin
**Modules concernés:** Nouveau module "Facturation" + Paramètres + Statistiques (Phase 2)

---

## 1. Vue d'ensemble

### Contexte

La Phase 1 des Statistiques est complétée. Pour avoir des rapports de ventes fiables, il manque deux données critiques :

1. **Les taux horaires** — aucun taux n'est stocké dans la BD. Les BT ont des heures avec mentions de surcharge, mais pas de valeur monétaire.
2. **Les frais de transport** — le champ `include_transport_fee` (booléen) existe dans les `time_entries`, mais aucun montant $ n'est associé par client.

Ce document couvre :
- Taux horaires dans Paramètres + dossier client individuel
- Frais de transport $ dans le dossier client
- Nouveau module de Facturation complet
- Rapport comptabilité mensuel (pour saisie dans Acomba)
- Statistiques Phase 2 basées sur les factures
- Standards globaux (auto-select, numéros cliquables)

### Décision Acomba

Import automatique non disponible sans plan de service payant (non retenu). Approche retenue :
- L'app génère les factures PDF et les envoie aux clients
- Dominique saisit dans Acomba avec le rapport mensuel de l'app sous les yeux
- L'app élimine tous les calculs manuels (TPS/TVQ, totaux, ventilation)
- Paiements, escomptes et grand livre restent dans Acomba

| Dans l'app | Dans Acomba |
|------------|-------------|
| Génération factures PDF | Paiements partiels |
| Envoi email au client | Escomptes |
| Calcul TPS/TVQ automatique | Grand livre |
| Numérotation séquentielle (ex: 100245) | Comptes à recevoir |
| Rapport mensuel comptabilité | Rapports financiers officiels |
| Statut payée/non payée (simple) | Relances clients |

---

## 2. Standards globaux à ajouter dans CLAUDE.md

### 2.1 Auto-sélection des champs (onFocus select)

**Principe "Auto-select on focus":** quand l'utilisateur clique sur un champ, le contenu se sélectionne automatiquement au complet. Évite d'effacer manuellement avant de taper.

Déjà documenté dans CLAUDE.md pour les champs numériques. À étendre à **tous les champs** du module Facturation et Paramètres.

```javascript
<input onFocus={(e) => e.target.select()} />
```

**À ajouter dans CLAUDE.md:** Étendre la règle à tous les champs éditables (pas seulement numériques) dans Facturation et Paramètres.

### 2.2 Numéros de référence cliquables (SplitView)

**Règle:** Dans toute l'application, tout numéro de référence (BT-XXXX, BL-XXXX, BA-XXXX, N° Soumission) doit être **cliquable** et ouvrir le document en consultation dans le panneau SplitView existant.

Utiliser le composant `ReferenceLink.js` existant (`components/SplitView/`).

**À ajouter dans CLAUDE.md et RECOMMANDATIONS.md (Points à améliorer) :**
```
### Numéros de référence cliquables (SplitView) — À implémenter progressivement
Tout numéro de référence affiché dans l'app doit être cliquable via ReferenceLink.js.
S'applique à: listes BT/BL, page Facturation, page Statistiques,
dossier client, tout endroit où un numéro BT/BL/BA/Soumission est affiché.
```

---

## 3. Taux horaires & frais de transport

### 3.1 Taux horaires — 3 niveaux

| Type | Multiplicateur | Quand | Minimum |
|------|---------------|-------|---------|
| Régulier | 1× | Lundi-Vendredi jour | 1h |
| Temps et demi | 1.5× | Soirs (début après 17h) + Samedis | 2h soirs / 3h samedis |
| Temps double | 2× | Jours fériés | 3h |

**Confirmé (2026-02-27):** Dimanches = 1.5×, Fériés = 2×. CLAUDE.md mis à jour.

Le `TimeTracker.js` gère déjà la détection automatique via `surcharge_type` dans les `time_entries`. Les taux en $ sont la seule donnée manquante.

### 3.2 Modifications table `clients`

```sql
ALTER TABLE clients ADD COLUMN hourly_rate_regular NUMERIC DEFAULT NULL;
-- NULL = utiliser le taux par défaut dans settings

ALTER TABLE clients ADD COLUMN transport_fee NUMERIC DEFAULT NULL;
-- Varie entre 5$ et 250$ selon la distance
-- NULL = aucun frais de transport pour ce client

ALTER TABLE clients ADD COLUMN email_billing TEXT DEFAULT NULL;
-- NULL = utiliser la cascade: email_admin → email → email_2 → impression

ALTER TABLE clients ADD COLUMN contact_name_3 TEXT DEFAULT NULL;
ALTER TABLE clients ADD COLUMN email_3        TEXT DEFAULT NULL;
ALTER TABLE clients ADD COLUMN contact_3      TEXT DEFAULT NULL;
-- Contact 3, même pattern que Contact 2

ALTER TABLE clients ADD COLUMN payment_terms TEXT DEFAULT NULL;
-- NULL = utiliser settings.default_payment_terms
-- Valeurs: 'Net 30 jours', 'Payable sur réception', '2% 10 Net 30 jours'

-- Rendre email_admin NON obligatoire (retirer NOT NULL si existant)
-- À vérifier dans Supabase avant d'exécuter
```

**Cascade email de facturation:**
1. `email_billing` si défini
2. `email_admin` si défini
3. `email` (contact principal) si défini
4. `email_2` si défini
5. Aucun email → facture sauvegardée dans DB, impression manuelle

### 3.3 Nouvelle table `settings`

```sql
CREATE TABLE settings (
  id                       INTEGER PRIMARY KEY DEFAULT 1,

  -- Taux horaires
  default_hourly_rate      NUMERIC NOT NULL DEFAULT 0,
  -- Taux régulier (1×). Les taux 1.5× et 2× calculés automatiquement.

  hourly_rate_increase_pct  NUMERIC DEFAULT 0,
  -- % d'augmentation annuelle (ex: 3.5)

  hourly_rate_increase_date DATE DEFAULT NULL,
  -- Date prévue de l'augmentation (ex: 2026-04-01)

  -- Taxes (ajustables si les gouvernements changent les taux)
  tps_rate                 NUMERIC NOT NULL DEFAULT 5.0,
  tvq_rate                 NUMERIC NOT NULL DEFAULT 9.975,

  -- Facturation
  invoice_tps_number       TEXT DEFAULT '',
  invoice_tvq_number       TEXT DEFAULT '',

  default_payment_terms    TEXT DEFAULT 'Net 30 jours',

  invoice_footer_note      TEXT DEFAULT '',

  invoice_next_number      INTEGER DEFAULT 1,
  -- Martin entre le numéro courant d'Acomba ici au départ
  -- S'incrémente automatiquement après chaque facture créée
  -- Format sur la facture: le nombre brut (ex: 100245)

  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO settings (id) VALUES (1);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read settings" ON settings
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update settings" ON settings
  FOR UPDATE USING (auth.uid() IS NOT NULL);
```

### 3.4 Page Paramètres — Sections à ajouter

La page Paramètres existe (Dark mode). Ajouter :

#### Section "Taux & Tarifs horaires"

```
┌──────────────────────────────────────────────────────┐
│  TAUX & TARIFS HORAIRES                              │
│                                                       │
│  Taux horaire régulier (1×):   [ 95.00 ] $/h        │
│  Taux et demi calculé (1.5×):  142.50 $/h (lecture) │
│  Temps double calculé (2×):    190.00 $/h (lecture)  │
│                                                       │
│  AUGMENTATION ANNUELLE                               │
│  Augmentation prévue:    [ 3.50 ] %                  │
│  Date d'application:     [ 2026-04-01 ]              │
│  Aperçu: 95.00 $ → 98.33 $/h (+3.33 $)             │
│                                                       │
│  [Appliquer l'augmentation à tous les clients]       │
│  ⚠️ Applique le % au taux par défaut ET au taux      │
│     individuel de chaque client. Modifier ensuite    │
│     les exceptions dans le dossier client.           │
└──────────────────────────────────────────────────────┘
```

#### Section "Facturation"

```
┌──────────────────────────────────────────────────────┐
│  FACTURATION                                         │
│                                                       │
│  Numéro TPS:    [ 123456789 RT0001   ]               │
│  Numéro TVQ:    [ 1234567890 TQ0001  ]               │
│                                                       │
│  Taux TPS:      [ 5.000 ] %  (ajustable)             │
│  Taux TVQ:      [ 9.975 ] %  (ajustable)             │
│                                                       │
│  Conditions de paiement par défaut:                  │
│  [ Net 30 jours ▼ ]                                  │
│  Options: Net 30 jours / Payable sur réception /   │
│           2% 10 Net 30 jours                │
│                                                       │
│  Note pied de facture:                               │
│  [ Merci de votre confiance!          ]              │
│                                                       │
│  Prochain numéro de facture: [ 100245 ]              │
│  (Entrer le numéro courant d'Acomba. Auto-increment) │
└──────────────────────────────────────────────────────┘
```

### 3.5 Section "Tarification" dans le dossier client

```
┌──────────────────────────────────────────────────────┐
│  TARIFICATION                                        │
│                                                       │
│  Taux horaire spécial:  [ _______ ] $/h              │
│  Vide = taux par défaut (95.00 $/h)                  │
│                                                       │
│  Frais de transport:    [ _______ ] $                │
│  Vide = aucun frais de transport facturé             │
│                                                       │
│  Conditions de paiement:                             │
│  [ Net 30 jours ▼ ]                                  │
└──────────────────────────────────────────────────────┘
```

Ajouter aussi **Contact 3** (même structure que Contact 2) et rendre **Administration** non obligatoire.

---

## 4. Module Facturation

### 4.1 Flux complet

```
BT signé ou BL signé → indicateur ● rouge (non facturé)
        ↓
Page "Facturation" — liste "À facturer"
        ↓
[Créer facture] → InvoiceEditor avec lignes pré-remplies:
  • 1 ligne par session de travail (time_entry)
  • Heures normales et surcharges séparées
  • Frais transport par session (si include_transport_fee = true)
  • Matériaux × prix de vente
  • Tout est modifiable
        ↓
Numéro attribué automatiquement (ex: 100245)
TPS et TVQ calculées automatiquement
        ↓
Prévisualisation PDF → Envoi au client
(cascade email: email_billing → email_admin → email → email_2 → impression)
        ↓
Facture sauvegardée dans DB
BT/BL → indicateur ● vert (facturé)
```

### 4.2 Prix Jobe

La facture Prix Jobe contient **une seule ligne** :
```
[Description forfaitaire]   |  2 500,00 $
```
Dominique peut modifier la description. Pas de détail heures/matériaux.

### 4.3 Nouvelle table `invoices`

```sql
CREATE TABLE invoices (
  id                BIGSERIAL PRIMARY KEY,
  invoice_number    TEXT UNIQUE NOT NULL,
  -- Numéro séquentiel simple (ex: '100245')

  client_id         BIGINT REFERENCES clients(id),
  client_name       TEXT NOT NULL,
  client_address    TEXT,
  -- Snapshot au moment de la facture (historique permanent)

  source_type       TEXT NOT NULL CHECK (source_type IN ('work_order', 'delivery_note')),
  source_id         BIGINT NOT NULL,
  source_number     TEXT NOT NULL,
  -- Numéro BT ou BL (ex: 'BT-2602-010') — affiché sur la facture

  invoice_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date          DATE,
  payment_terms     TEXT,

  line_items        JSONB NOT NULL DEFAULT '[]',

  subtotal          NUMERIC NOT NULL DEFAULT 0,
  tps_rate          NUMERIC NOT NULL DEFAULT 5.0,
  tvq_rate          NUMERIC NOT NULL DEFAULT 9.975,
  tps_amount        NUMERIC NOT NULL DEFAULT 0,
  tvq_amount        NUMERIC NOT NULL DEFAULT 0,
  total             NUMERIC NOT NULL DEFAULT 0,

  -- Ventilation pour rapport Acomba
  total_materials   NUMERIC DEFAULT 0,
  total_labor       NUMERIC DEFAULT 0,
  total_transport   NUMERIC DEFAULT 0,

  status            TEXT DEFAULT 'draft'
                    CHECK (status IN ('draft', 'sent', 'paid')),

  is_prix_jobe      BOOLEAN DEFAULT FALSE,
  notes             TEXT,
  pdf_url           TEXT,

  sent_at           TIMESTAMPTZ,
  paid_at           TIMESTAMPTZ,

  user_id           UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoices_client ON invoices(client_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_date   ON invoices(invoice_date);
CREATE INDEX idx_invoices_source ON invoices(source_type, source_id);
CREATE INDEX idx_invoices_number ON invoices(invoice_number);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view"   ON invoices FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert" ON invoices FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update" ON invoices FOR UPDATE USING (auth.uid() = user_id);
```

### 4.4 Colonnes à ajouter aux BT et BL

```sql
ALTER TABLE work_orders    ADD COLUMN invoice_id BIGINT REFERENCES invoices(id) DEFAULT NULL;
ALTER TABLE delivery_notes ADD COLUMN invoice_id BIGINT REFERENCES invoices(id) DEFAULT NULL;
```

Indicateur: `invoice_id IS NULL` → ● rouge | `invoice_id IS NOT NULL` → ● vert

### 4.5 Structure `line_items` (JSONB)

```json
[
  {
    "id": "labor-2026-02-20-08:00",
    "type": "labor",
    "description": "Main d'œuvre — Régulier",
    "detail": "4.25h × 95,00 $/h",
    "quantity": 4.25,
    "unit_price": 95.00,
    "total": 403.75,
    "session_date": "2026-02-20"
  },
  {
    "id": "transport-2026-02-20",
    "type": "transport",
    "description": "Frais de déplacement",
    "quantity": 1,
    "unit_price": 45.00,
    "total": 45.00,
    "session_date": "2026-02-20"
  },
  {
    "id": "labor-2026-02-22-08:00",
    "type": "labor",
    "description": "Main d'œuvre — Samedi (1.5×)",
    "detail": "3.0h × 142,50 $/h",
    "quantity": 3.0,
    "unit_price": 142.50,
    "total": 427.50,
    "session_date": "2026-02-22"
  },
  {
    "id": "mat-PROD-001",
    "type": "material",
    "description": "Disjoncteur 20A",
    "detail": "PROD-001",
    "quantity": 3,
    "unit_price": 28.50,
    "total": 85.50
  }
]
```

**Types:** `labor` / `transport` / `material` / `forfait` (Prix Jobe) / `other` (ajout manuel)

**Règles:** 1 ligne par session, surcharges séparées, transport après la ligne labor de sa session.

### 4.6 Nouveaux fichiers

```
src/app/(protected)/facturation/page.js
src/app/api/invoices/route.js
src/app/api/invoices/[id]/route.js
src/app/api/invoices/[id]/send-email/route.js
src/app/api/invoices/report/route.js
src/components/invoices/InvoiceManager.js
src/components/invoices/InvoiceEditor.js
src/components/invoices/InvoicePDF.js
```

### 4.7 Fichiers à modifier

```
src/components/Navigation.js       → Onglet "Facturation"
src/components/ClientManager.js    → Tarification + Contact 3 + email_admin optionnel
src/app/(protected)/parametres/    → Sections Taux et Facturation
```

---

## 5. Interface Facturation

### 5.1 Onglet "À facturer"

```
┌──────┬──────────────┬────────────┬───────────────┬──────────────┐
│ Type │ N°           │ Date       │ Client        │ Montant est. │
├──────┼──────────────┼────────────┼───────────────┼──────────────┤
│ ● BT │ BT-2602-010  │ 24 fév.   │ Acier Mégo   │  ~1 850 $    │
│ ● BL │ BL-2602-009  │ 22 fév.   │ ABC Inc.      │   ~340 $     │
└──────┴──────────────┴────────────┴───────────────┴──────────────┘
```
N° cliquable → SplitView. Bouton [Créer facture] par ligne.

### 5.2 Onglet "Factures"

```
Filtre: [Toutes ▼] [Non payées ▼]  Période: [fév. 2026 ▼]
[Rapport Acomba]  [Export CSV]

┌───────────┬────────────┬───────────────┬──────────┬─────────────┐
│ N° Fact.  │ Date       │ Client        │ Total    │ Statut      │
├───────────┼────────────┼───────────────┼──────────┼─────────────┤
│ 100245   │ 24 fév.   │ Acier Mégo   │ 2 156,75$│ ● vert Payée│
│ 100244   │ 20 fév.   │ ABC Inc.      │  407,53 $│ ● rouge Att.│
└───────────┴────────────┴───────────────┴──────────┴─────────────┘
```
Boutons: [Voir] [Renvoyer] [Marquer payée]

### 5.3 Éditeur de facture

```
┌──────────────────────────────────────────────────────────────────┐
│  NOUVELLE FACTURE — BT-2602-010 — Acier Mégo                    │
│                                                                   │
│  LIGNES                                      [+ Ajouter ligne]   │
│  ┌──────────────────┬──────────────┬──────┬───────┬──────────┐  │
│  │ Description      │ Date/Détail  │ Qté  │ Prix  │ Total    │  │
│  ├──────────────────┼──────────────┼──────┼───────┼──────────┤  │
│  │[M.O. Régulier  ] │ 20 fév. 4.25h│[4.25]│[95.00]│ 403,75 $│  │
│  │[Transport      ] │ 20 fév.      │[ 1 ] │[45.00]│  45,00 $│  │
│  │[M.O. Samedi 1.5×]│ 22 fév. 3.0h │[3.0] │[142.5]│ 427,50 $│  │
│  │[Disjoncteur 20A] │ PROD-001     │[ 3 ] │[28.50]│  85,50 $│  │
│  └──────────────────┴──────────────┴──────┴───────┴──────────┘  │
│                                                                   │
│                    Sous-total:             1 006,75 $             │
│                    TPS (5%):                  50,34 $             │
│                    TVQ (9.975%):             100,42 $             │
│                    ─────────────────────────────────              │
│                    TOTAL:                  1 157,51 $             │
│                                                                   │
│  Conditions: [Net 30 jours]    Notes: [            ]             │
│  [Prévisualiser PDF]   [Envoyer au client]   [Annuler]           │
└──────────────────────────────────────────────────────────────────┘
```
Tous les champs [ ] sont éditables avec auto-select au clic. Totaux en temps réel.

---

## 6. Navigation mobile — 3 options

### Option A — Menu "Plus" (recommandée v1)
```
[BT/BL]  [BA]  [AF]  [Inventaire]  [···]
                                     ↓ Soumissions / Stats / Facturation / Paramètres
```
Simple, modules terrain accessibles d'un toucher, modules bureau dans le menu.

### Option B — Barre inférieure mobile
```
Desktop: barre top complète
Mobile:  barre bas: [🔧BT] [📦BA] [🛒AF] [📊Stats] [≡ Plus]
```
Optimal mais plus de développement.

### Option C — Scroll horizontal
Scroll gauche-droite sur la barre actuelle. Minimal mais mauvaise découvrabilité.

**Recommandation: Option A pour v1.** Onglet Facturation en dernier, avant Paramètres.

---

## 7. PDF Facture — Structure technique

Utiliser `pdf-common.js` (v1.1.0) existant. Solution multi-pages avec hook `didDrawPage` de jspdf-autotable :

```javascript
doc.autoTable({
  startY: y,
  head: [['Description', 'Date', 'Qté', 'Prix unit.', 'Total']],
  body: invoice.line_items.map(line => [...]),
  didDrawPage: (data) => {
    if (data.pageNumber > 1) renderHeader(); // En-tête répété sur chaque page
  },
  margin: { top: 52 } // Espace pour l'en-tête répété
});

// Totaux APRÈS fin du tableau = automatiquement sur la dernière page
let finalY = doc.lastAutoTable.finalY + 5;
drawTotals(doc, finalY, { subtotal, tps, tvq, total, ... });
drawFooter(doc); // Footer sur toutes les pages
```

Structure page 1: En-tête + "Facturer à" + "Conditions" + tableau
Structure page 2+: En-tête répété + suite tableau
Dernière page: Fin tableau + Totaux + Note pied + Footer

**Note:** Tests visuels nécessaires pour valider le rendu.

---

## 8. Rapport Acomba mensuel

Bouton **[Rapport Acomba]** dans l'onglet Factures, sélection du mois.

| N° Facture | Date | Client | Référence | Vente mat. | Vente temps | Vente dépl. | Sous-total | TPS | TVQ | Total |
|---|---|---|---|---|---|---|---|---|---|---|
| 100243 | 2026-02-18 | XYZ Ltée | BT-2602-008 | 85,50 $ | 831,25 $ | 90,00 $ | 1 006,75 $ | 50,34 $ | 100,42 $ | 1 157,51 $ |

Ligne TOTAUX en bas. Exports: PDF imprimable + CSV.

---

## 9. Statistiques Phase 2

Ajouter sous-onglets dans la page Statistiques existante :
```
[Opérationnel (BT/BL)]  [Financier (Factures)]
```

Nouveaux rapports financiers : revenus par mois, par client, factures en attente, comparaison facturé vs réalisé.

---

## 10. Plan d'implantation

**Phase A — Fondations**
1. Créer table `settings`
2. Ajouter colonnes dans `clients`
3. Rendre `email_admin` optionnel
4. Mettre à jour page Paramètres (sections Taux + Facturation)
5. Mettre à jour ClientManager (Tarification + Contact 3)

**Phase B — Facturation MVP**
6. Créer table `invoices`
7. Ajouter `invoice_id` dans work_orders et delivery_notes
8. Créer API /api/invoices (CRUD)
9. InvoiceManager (2 onglets)
10. InvoiceEditor (lignes modifiables + calculs auto)
11. InvoicePDF (multi-pages via pdf-common.js)
12. API send-email
13. Onglet Navigation + indicateurs ●rouge/●vert BT/BL

**Phase C — Rapport Acomba**
14. API /api/invoices/report
15. Export PDF mensuel
16. Export CSV mensuel

**Phase D — Statistiques Phase 2**
17. Sous-onglet "Financier" dans Statistiques

**Phase E — Améliorations globales (continu)**
18. Numéros cliquables (SplitView) dans toute l'app
19. Mise à jour CLAUDE.md et RECOMMANDATIONS.md

---

## 11. Calcul automatique des lignes

```javascript
function getRate(baseRate, surchargeType) {
  switch (surchargeType) {
    case 'holiday':  return baseRate * 2.0;  // Fériés = 2x (confirmé 2026-02-27)
    case 'sunday':
    case 'saturday':
    case 'evening':  return baseRate * 1.5;  // Dim/Sam/Soir = 1.5x
    default:         return baseRate;
  }
}

// TPS/TVQ depuis settings (ajustables si gouvernement change les taux)
const tps = Math.round(subtotal * (settings.tps_rate / 100) * 100) / 100;
const tvq = Math.round(subtotal * (settings.tvq_rate / 100) * 100) / 100;
```

---

## 12. ~~Questions ouvertes~~ ✅ RÉSOLUES (2026-02-27)

1. **Taux dimanches/fériés** — ✅ **Dimanche 1.5×, Fériés 2×** — CLAUDE.md mis à jour
2. **Navigation mobile** — ✅ **Option A** (menu "Plus") retenue
3. **Transport sans montant client** — ✅ **Ligne à 0$** que Dominique remplit manuellement dans l'éditeur de facture
4. **Conditions de paiement** — ✅ Corrigées selon Acomba:
   - `Net 30 jours`
   - `2% 10 Net 30 jours` (pas 10%, c'est 2%)
   - `Payable sur réception`

---

## 13. Suivi d'implantation

### ~~Phase A — Fondations~~ ✅ COMPLÉTÉE (2026-02-27)
1. ✅ `supabase/migrations/20260227_add_settings_and_tarification.sql` — Table settings + colonnes clients
2. ✅ `app/api/settings/route.js` — API GET/PUT paramètres globaux
3. ✅ `app/(protected)/parametres/page.js` v2.0.0 — Sections Taux & Tarifs + Facturation
4. ✅ `components/ClientModal.js` v2.0.0 — Tarification + Contact #3 + email_admin optionnel
5. ✅ CLAUDE.md mis à jour (taux fériés 2x, roadmap, endpoints)

**Note:** La migration SQL doit être exécutée manuellement dans Supabase Dashboard avant utilisation.

### Phase B — Facturation MVP (en attente)
### Phase C — Rapport Acomba (en attente)
### Phase D — Statistiques Phase 2 (en attente)
### Phase E — Améliorations globales (en attente)

---

*Document créé le 2026-02-26 — Révision 3 avec réponses confirmées et Phase A complétée.*
*Prochaine étape: Exécuter la migration SQL, puis Phase B (Facturation MVP).*
