# CLAUDE.md - Guide pour Claude AI

Ce fichier contient les informations essentielles pour comprendre et modifier cette application.

## Contexte Rapide

**Application:** Gestion opérationnelle pour Services TMT Inc. (services techniques + panneaux d'automatisation)
**Utilisateur principal:** Martin et/ou (Martin seul utilisateur sur le terrin actuellement, Dominique au bureau seulement sur Desktop, multi-utilisateurs prévu)
**Localisation:** Saint-Georges, Québec, Canada
**Stack:** Next.js 14 + Supabase + Resend + Vercel

---

## Usage Mobile vs Desktop (CRITIQUE)

| Module | Desktop | Mobile | Appareil Mobile |
|--------|---------|--------|-----------------|
| Clients | 20% | **80%** | - |
| Soumissions | 95% | 5% | - |
| Inventaire | 95% | 5% | - |
| Achats (AF) | 95% | 5% | - |
| **Bons de Travail (BT)** | 5% | **95%** | 75% Tablette, 25% Pixel 8 |
| **Bons de Livraison (BL)** | 5% | **95%** | 75% Tablette, 25% Pixel 8 |
| Gestion Client | 50% | 50% | - |

**CRITIQUE:** Les modules BT et BL sont utilisés à 95% sur mobile/tablette.
Toute modification aux composants BT ou BL doit être testée en responsive.

---

## Terminologie Métier IMPORTANTE

| Abréviation | Terme Complet | Description |
|-------------|---------------|-------------|
| **BT** | Bon de Travail | Document d'intervention chez un client (work order) |
| **BL** | Bon de Livraison | Document de livraison de matériels chez un client (delivery note) |
| **BA** | Bon d'Achat Client | Commande/PO REÇU d'un client |
| **AF** | Achat Fournisseur | Commande PASSÉE à un fournisseur |
| **BCC** | Bon de Confirmation de Commande | Confirmation au client que son matériel est en commande |
| **Prix Jobe** | Prix forfaitaire | Prix fixe incluant matériaux + main d'œuvre |

**Attention aux confusions:**
- "Bon d'achat" peut être CLIENT (BA) ou FOURNISSEUR (AF) - toujours clarifier
- `purchase_orders` dans le code = BA (bons d'achat CLIENT)
- `supplier_purchases` dans le code = AF (achats FOURNISSEURS)
- `delivery_notes` dans le code = BL (bons de livraison)
- **BT vs BL:** BT = travail effectué (heures + matériaux), BL = livraison matériels uniquement (pas d'heures)

---

## Standards de Code OBLIGATOIRES

### En-têtes de fichiers

Chaque fichier TypeScript/JavaScript DOIT avoir cet en-tête:

```javascript
/**
 * @file [chemin complet depuis src/]
 * @description [description claire, peut être multi-lignes]
 *              - Point 1
 *              - Point 2
 * @version X.Y.Z
 * @date YYYY-MM-DD
 * @changelog
 *   X.Y.Z - Description du changement
 *   X.Y.W - Changement précédent
 *   1.0.0 - Version initiale
 */
```

**Règles de versionnage:**
- MAJOR (X): Changement breaking ou refonte majeure
- MINOR (Y): Nouvelle fonctionnalité
- PATCH (Z): Fix de bug, correction

**Lors d'une modification:**
1. Incrémenter la version appropriée
2. Mettre à jour la date
3. Ajouter une ligne au changelog (en haut de la liste)
4. Le changelog garde l'historique complet

### Mise à jour RECOMMANDATIONS.md (OBLIGATOIRE)

Après chaque modification de code liée à une fonctionnalité ou un item du plan d'action dans `RECOMMANDATIONS.md`:

1. **Rayer l'item complété** avec `~~texte~~` et ajouter `✅ COMPLETE (YYYY-MM-DD)`
2. **Cocher les checkboxes** correspondantes: `- [ ]` → `- [x]`
3. **Ajouter un résumé** des fichiers modifiés/créés sous l'item complété
4. **Mettre à jour la date** du document en bas de RECOMMANDATIONS.md
5. **Mettre à jour la roadmap** dans CLAUDE.md (section "Points d'Attention / Roadmap") pour refléter les items complétés

**Exemple:**
```markdown
### 2. ~~Nom de la fonctionnalité~~ ✅ COMPLETE (2026-02-10)
**Implementation completee (2026-02-10):**
- `fichier1.js` - Description du changement
- `fichier2.js` - Description du changement
```

Cette règle assure la traçabilité des modifications et permet de savoir rapidement ce qui reste à faire.

### Dates et Heures

| Type | Format | Exemple |
|------|--------|---------|
| Affichage utilisateur | JJ MMM YYYY | 05 fév. 2026 |
| Base de données | YYYY-MM-DD | 2026-02-05 |
| Timestamp | ISO 8601 | 2026-02-05T14:30:00Z |

- **Fuseau horaire:** America/Toronto (Québec)
- **Locale:** fr-CA
- **Fonction existante:** `formatQuebecDateTime()` dans email-service.js

### Supabase - Row Level Security (RLS)

Chaque nouvelle table DOIT avoir:

```sql
-- 1. Activer RLS
ALTER TABLE nom_table ENABLE ROW LEVEL SECURITY;

-- 2. Policy SELECT (lecture)
CREATE POLICY "Users can view own data" ON nom_table
  FOR SELECT USING (auth.uid() = user_id);

-- 3. Policy INSERT (création)
CREATE POLICY "Users can insert own data" ON nom_table
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 4. Policy UPDATE (modification)
CREATE POLICY "Users can update own data" ON nom_table
  FOR UPDATE USING (auth.uid() = user_id);

-- 5. Policy DELETE (suppression)
CREATE POLICY "Users can delete own data" ON nom_table
  FOR DELETE USING (auth.uid() = user_id);
```

**Note:** Pour les tables partagées (ex: products), adapter les policies selon le besoin.

### Génération PDF (jsPDF)

**RÈGLE ABSOLUE — Couleurs dans les PDF clients :**
Tout texte dans un PDF destiné au client (factures, BT, BL) DOIT être en **noir pur `[0, 0, 0]`**.
Le gris (`[100, 100, 100]` ou toute autre valeur) est **INTERDIT** pour le contenu visible —
il s'imprime très mal, voire invisible sur papier. Seul le pied de page discret (numéro de page,
coordonnées entreprises) peut rester en gris, car c'est intentionnellement effacé.

Standards visuels pour tous les PDF générés avec jsPDF:

```javascript
// Logo
doc.addImage(logoBase64, 'PNG', 15, 10, 40, 15);

// Police
doc.setFont('Helvetica');

// Couleurs
const TITLE_COLOR = [51, 51, 51];      // RGB gris foncé
const TEXT_COLOR = [0, 0, 0];          // Noir

// Marges
const MARGIN = 20; // mm

// Footer avec numéro de page
doc.setFontSize(10);
doc.text(`Page ${pageNumber}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
```

### Génération PDF (window.print / CSS @media print)

Standards pour les PDF générés via impression CSS (Soumissions, etc.):

**Structure multi-pages obligatoire:**
- **Header répété** sur chaque page via `<table class="print-wrapper">` avec `<thead>` (logo, infos entreprise, N° document, client, description)
- **Footer fixe** au bas de chaque page via `position: fixed; bottom: 0` (conditions générales + totaux avec les 2 lignes noires)
- **Spacer** via `<tfoot>` avec hauteur fixe (~1.4in) pour réserver l'espace du footer et éviter chevauchement

**Pagination obligatoire:**
```css
@page {
  size: letter;
  margin: 0.4in 0.6in 0.5in 0.6in;
  @bottom-center {
    content: "Pour toute question: (418) 225-3875 \\2022  Services TMT Inc. \\2022  info.servicestmt@gmail.com";
    font-size: 9px;
    color: #666;
  }
  @bottom-right {
    content: "Page " counter(page) "/" counter(pages);
    font-size: 10px;
    color: #333;
  }
}
```

**Structure HTML type:**
```html
<div class="print-area">
  <table class="print-wrapper">
    <thead><tr><td><!-- Header: logo + company + N° + client --></td></tr></thead>
    <tbody><tr><td><!-- Contenu: tableau items --></td></tr></tbody>
    <tfoot><tr><td><div class="print-footer-spacer"></div></td></tr></tfoot>
  </table>
  <div class="print-page-footer"><!-- Footer fixe: conditions + totaux --></div>
</div>
```

### Mobile / Responsive (CRITIQUE pour BT et BL)

Les modules Bons de Travail et Bons de Livraison sont utilisés à 95% sur tablette/mobile.

**Règles obligatoires:**
- Touch targets minimum **44px** (boutons, liens, inputs)
- Tester sur tablette avant chaque merge
- Utiliser `inputmode` approprié pour les claviers mobiles:
  - `inputmode="numeric"` pour les nombres
  - `inputmode="decimal"` pour les prix
  - `inputmode="tel"` pour les téléphones
  - `inputmode="email"` pour les emails

**Composants critiques à tester:**
- `WorkOrderForm.js`
- `DeliveryNoteForm.js`
- `TimeTracker.js`
- `MaterialSelector.js`
- Pages signature client (BT et BL)

### Auto-sélection des champs numériques (OBLIGATOIRE)

Tous les champs `<input>` de type nombre (prix, quantités, pourcentages) DOIVENT sélectionner automatiquement leur contenu au clic/focus pour faciliter la saisie, surtout sur mobile/tablette.

```javascript
// Pattern obligatoire pour tout input numérique éditable
<input
  type="number"
  onFocus={(e) => e.target.select()}
  // ... autres props
/>
```

**Déjà appliqué dans:**
- `DirectReceiptModal.js` (coûtant, vendant, %, quantité)
- `InventoryManager.js` (coûtant, vendant, %, quantité en stock)

**À appliquer progressivement dans:**
- `WorkOrderForm.js` / `TimeTracker.js`
- `DeliveryNoteForm.js`
- `MaterialSelector.js`
- `SupplierPurchaseManager.js` / `SupplierReceiptModal.js`
- Tout autre formulaire avec des champs numériques

### Attributs des champs texte (OBLIGATOIRE)

Tous les champs `<input>` et `<textarea>` DOIVENT avoir les attributs appropriés selon leur type de contenu.

**Champs texte libre** (descriptions, noms, adresses, notes, commentaires, instructions) :
```javascript
<input
  type="text"
  autoCorrect="on"
  autoCapitalize="sentences"
  spellCheck={true}
  // ... autres props
/>
```

**Champs codes/références/montants** (codes produits, numéros, emails, téléphones, recherche, mots de passe, codes postaux, prix) :
```javascript
<input
  type="text"
  autoCorrect="off"
  autoCapitalize="off"
  spellCheck={false}
  // ... autres props
/>
```

**Note:** Les champs `type="number"`, `type="email"`, `type="tel"`, `type="password"` sont toujours CODE/REFERENCE.
Les champs `type="date"`, `type="time"`, `type="checkbox"`, `type="radio"`, `type="file"`, `readOnly` sont exemptés.

### Gestion d'Erreurs

Pattern standard pour les réponses API:

```javascript
// Succès
return NextResponse.json({ success: true, data: result });

// Erreur
return NextResponse.json(
  { success: false, error: 'Message explicite pour l\'utilisateur' },
  { status: 400 }
);
```

### Courriels (Resend / no-reply) — OBLIGATOIRE

Tous les courriels sont envoyés depuis une adresse **no-reply** de Resend
(`noreply@servicestmt.ca`). Le client ne peut donc PAS répondre directement.

**Règle 1 — Avis no-reply obligatoire:** Chaque courriel envoyé au client
(BT, BL, Factures) DOIT contenir l'avis suivant, juste avant le pied de page :

```html
<p style="color: #999; font-size: 13px; font-style: italic;">
  Ne pas répondre à ce courriel.<br>
  Pour nous contacter, utilisez le lien ci-dessous.
</p>
```

Dans le courriel de **facture**, cet avis se place sous la ligne
« N'hésitez pas à nous contacter pour toute question. »

**Règle 2 — Lien de contact cliquable:** Le « lien ci-dessous » est l'adresse
courriel de l'entreprise dans le pied de page, rendue cliquable via `mailto:` :

```html
<a href="mailto:info.servicestmt@gmail.com">info.servicestmt@gmail.com</a>
```

**Règle 3 — Format visuel unifié:** Les courriels BT, BL et Factures partagent
le même gabarit visuel (carte blanche centrée, max 600px, en-tête + corps +
avis no-reply + pied de page). Pour BT/BL, utiliser le helper
`buildStandardEmailHTML()` dans `lib/services/email-service.js`. Le courriel de
facture (`app/api/invoices/[id]/send-email/route.js`) suit le même format.

### Taxes Québec

```javascript
const TPS = 0.05;      // 5% fédérale
const TVQ = 0.09975;   // 9.975% provinciale

const subtotal = 100.00;
const tps = subtotal * TPS;
const tvq = subtotal * TVQ;
const total = subtotal + tps + tvq;
```

---

## Architecture Fichiers Clés

### Pages Principales
```
/bons-travail                    → Liste unifiée BT + BL
/bons-travail/nouveau            → Nouveau BT (WorkOrderForm)
/bons-travail/nouveau-bl         → Nouveau BL (DeliveryNoteForm)
/bons-travail/[id]/modifier      → Modifier BT
/bons-travail/bl/[id]/modifier   → Modifier BL
/bons-travail/[id]/client        → Vue signature client BT (public)
/bons-travail/bl/[id]/client     → Vue signature client BL (public)

/(protected)/bons-achat          → Gestion BA Client
/(protected)/achat-materiels     → Achats Fournisseurs (AF)
/(protected)/inventaire          → Gestion inventaire
/(protected)/soumissions         → Soumissions/devis
/(protected)/statistiques        → Rapports & Statistiques de Ventes
/(protected)/facturation         → Module Facturation (À facturer + Factures)
/(protected)/notes               → Tableau de bord Notes (PAGE D'OUVERTURE, racine → /notes)
```

### API Endpoints Critiques
```
/api/notes                             → CRUD Notes (GET liste + POST création)
/api/notes/[id]                        → GET/PUT (édition + toggle complété)/DELETE note
/api/notes/projects                    → Liste BT/BL/BA/Soumission pour sélecteur de note (filtrée: brouillons BT/BL, BA en cours, soum. envoyées/acceptées + filtre client + description du doc)
/api/work-orders                       → CRUD BT
/api/work-orders/[id]/send-email       → Envoi email BT
/api/work-orders/[id]/signature        → Capture signature BT
/api/delivery-notes                    → CRUD BL (GET liste + POST création)
/api/delivery-notes/[id]              → GET/PUT/DELETE BL individuel
/api/delivery-notes/[id]/send-email    → Envoi email BL + inventaire OUT + suivi BA
/api/delivery-notes/[id]/signature     → Capture signature BL
/api/delivery-notes/[id]/complete-signature → Complétion signature + changement statut
/api/delivery-notes/[id]/public        → Accès public BL (vue client sans auth)
/api/purchase-orders                   → CRUD BA Client
/api/purchase-orders/[id]/send-confirmation → Envoi BCC (confirmation commande)
/api/clients                           → CRUD clients
/api/products                          → CRUD produits
/api/products/search                   → Recherche serveur inventaire (modes: search, all, group)
/api/products/groups                   → Groupes de produits distincts
/api/inventory/reservations            → En commande (AF) + Réservé (BT/BL non signés) + détail par doc
/api/statistics                        → Rapports & Statistiques de ventes (GET avec filtres)
/api/statistics/financial              → Statistiques financières (GET: par mois, par client, en attente)
/api/settings                          → Paramètres globaux (GET + PUT, singleton id=1)
/api/invoices                          → CRUD Factures (GET liste + POST création)
/api/invoices/[id]                     → GET/PUT/DELETE facture individuelle
/api/invoices/[id]/send-email          → Envoi facture PDF par email au client
/api/reports/sales                     → Rapport de ventes comptable (GET: mois/année/plage)
/api/reports/sales/send-email          → Envoi rapport de ventes PDF au comptable (CC bureau)
/api/reports/payments                  → Rapport de paiements comptable (GET: mois/année/plage)
/api/reports/payments/send-email       → Envoi rapport de paiements PDF au comptable (CC bureau)
/api/cron/backup                       → Backup quotidien
```

### Services Importants
```
lib/services/email-service.js       → Génération PDF + envoi email (BT + BL + rapports)
lib/services/pdf-common.js          → En-tête/footer PDF standardisé
lib/services/client-signature.js    → Gestion signatures (BT + BL)
lib/utils/holidays.js               → Jours fériés Québec (calcul dynamique)
lib/utils/priceShift.js             → Décalage historique prix (3 niveaux)
lib/supabase.js                     → Client Supabase (browser)
lib/supabaseAdmin.js                → Client Supabase (server, bypass RLS)
```

### Composants Principaux
```
components/work-orders/WorkOrderForm.js       → Formulaire BT complet
components/work-orders/TimeTracker.js         → Suivi temps (arrondi quart heure + surcharges)
components/work-orders/MaterialSelector.js    → Sélection matériaux (partagé BT+BL)
components/delivery-notes/DeliveryNoteForm.js → Formulaire BL (livraison matériels)
components/delivery-notes/DeliveryNoteClientView.js → Vue client + signature BL (page publique)
components/SupplierPurchaseManager.js         → Gestion AF + bouton Réception directe
components/SupplierPurchaseServices.js        → Services recherche produits, hooks AF
components/SupplierReceiptModal.js            → Réception AF (partielle/complète)
components/DirectReceiptModal.js              → Réception directe sans AF + ajustement inventaire
components/InventoryManager.js                → Gestion inventaire (recherche serveur, modal unifié)
components/PurchaseOrder/BCCConfirmationModal.js → Modal BCC (confirmation commande client)
components/SplitView/                         → Panneau latéral (BA/AF/Soumission/BT/BL inline)
components/ClientManager.js                   → Gestion clients
components/statistics/StatisticsManager.js    → Composant principal Statistiques (2 sous-onglets: Opérationnel + Financier)
components/statistics/StatisticsFilters.js    → Filtres de recherche opérationnel (type, dates, client, etc.)
components/statistics/SalesReport.js          → Tableau ventes + bandeau résumé + pagination
components/statistics/StatisticsPDFExport.js  → Export PDF rapport de ventes opérationnel
components/statistics/FinancialStatistics.js  → Orchestrateur sous-onglet Financier (factures)
components/statistics/FinancialFilters.js     → Filtres financiers (période, client, statut, vue)
components/statistics/FinancialReport.js      → Rapport financier (par mois, par client, en attente)
components/statistics/FinancialPDFExport.js   → Export PDF rapport financier
components/invoices/InvoiceManager.js         → Module Facturation (2 onglets: À facturer + Factures + Rapport Acomba)
components/invoices/InvoiceEditor.js          → Éditeur facture (lignes éditables + calculs auto TPS/TVQ + badges BA/Soumission cliquables)
components/invoices/InvoiceReferencePanel.js  → Panneau lecture seule BA/Soumission liés (consultation prix de vente client)
components/invoices/AccountingReports.js      → Onglet Rapports compta (ventes + paiements, PDF + envoi comptable)
components/notes/NotesManager.js              → Tableau de bord Notes (page d'ouverture, recherche, filtre, CRUD)
components/notes/NoteCard.js                  → Carte note (couleur urgence, checkbox, badge projet cliquable)
components/notes/NoteForm.js                  → Modal créer/éditer note + sélecteur document (BT/BL/BA/Soum.)
```

---

## Base de Données - Tables Principales

### work_orders (BT)
```sql
id, bt_number, client_id, linked_po_id, invoice_id,
work_date, time_entries (JSONB), total_hours,
work_description, status, is_prix_jobe,
signature_data, signature_timestamp, client_signature_name
```
**Statuts:** draft, signed, pending_send, completed
**Indicateur facture:** `invoice_id IS NULL` → non facturé (rouge) | `invoice_id IS NOT NULL` → facturé (vert)

### clients
```sql
id, name, company, address, travel_minutes,
contact_name, email, phone,
contact_name_2, email_2, contact_2,
contact_name_admin, email_admin, contact_admin,
signatory_1..signatory_5
```

### purchase_orders (BA Client)
```sql
id, po_number, client_id, client_name,
submission_no, status, amount, total_amount
```
**Statuts:** in_progress, partial, completed

### supplier_purchases (AF)
```sql
id, purchase_number, supplier_id, linked_po_id,
items (JSONB), subtotal, tps, tvq, total_amount, status
```
**Statuts:** draft, in_order, ordered, partial, received, cancelled

### delivery_notes (BL)
```sql
id, bl_number, client_id, client_name, linked_po_id, invoice_id,
delivery_date, delivery_description, status,
is_prix_jobe, signature_data, signature_timestamp,
client_signature_name, recipient_emails (JSONB),
parent_bl_id, child_bl_id,
user_id, created_at, updated_at
```
**Statuts:** draft, ready_for_signature, signed, pending_send, sent
**Matériaux:** Table séparée `delivery_note_materials` (product_id, quantity, unit, unit_price, ordered_quantity, previously_delivered, etc.)
**Indicateur facture:** `invoice_id IS NULL` → non facturé (rouge) | `invoice_id IS NOT NULL` → facturé (vert)
**Backorder:** `parent_bl_id` = BL d'origine (si suivi), `child_bl_id` = BL de suivi (si BO créé)

### invoices (Factures)
```sql
id, invoice_number, client_id, client_name, client_address,
source_type ('work_order'|'delivery_note'), source_id, source_number,
invoice_date, due_date, payment_terms,
line_items (JSONB), subtotal, tps_rate, tvq_rate, tps_amount, tvq_amount, total,
total_materials, total_labor, total_transport,
status, is_prix_jobe, notes, pdf_url,
sent_at, paid_at, user_id, created_at, updated_at
```
**Statuts:** draft, sent, paid
**Line items types:** labor, transport, material, forfait, other

### notes (Notes)
```sql
id (UUID), title, description,
note_type ('global'|'project'),
project_type ('work_order'|'delivery_note'|'purchase_order'|'submission'), project_id, project_number,
client_id, client_name,
due_date, completed, completed_at,
user_id, created_at, updated_at
```
**Tri:** échéance croissante d'abord, puis notes sans date par création.
**Urgence (couleur):** 🔴 0-1 j ou en retard · 🟠 2-7 j · ⚪ 8+ j ou sans date.
**Complétées:** masquées du tableau de bord (jamais supprimées par la complétion).
**Lien projet:** `project_id` polymorphe (pas de FK), badge cliquable → panneau SplitView.

### products / non_inventory_items
```sql
product_id, description, unit, cost_price, selling_price, stock_qty,
cost_price_1st, cost_price_2nd, cost_price_3rd,
selling_price_1st, selling_price_2nd, selling_price_3rd,
supplier, product_group
```
**Historique des prix:** Lors d'une réception (AF ou directe), si le cost_price change, les anciens prix sont décalés (shift) dans les colonnes `_1st`, `_2nd`, `_3rd`. Voir `lib/utils/priceShift.js`.

---

## Workflow Prix Jobe (Important)

Quand `is_prix_jobe = true` sur un BT:
1. **Email client:** PDF simplifié (pas d'heures, pas de matériaux)
2. **Email bureau:** PDF complet (heures + matériaux + mention "PRIX JOBE")

Code: `lib/services/email-service.js` lignes 634-730

**Note:** Le workflow actuel est considéré comme "à améliorer" - simplification prévue.

---

## Calcul du Temps

Arrondi au quart d'heure SUPÉRIEUR avec règles:

| Minutes | Arrondi |
|---------|---------|
| < 1h total | minimum 1h |
| ≤6 min | 0 |
| 7-21 min | 15 |
| 22-36 min | 30 |
| 37-51 min | 45 |
| >51 min | heure suivante |

Code: `lib/services/email-service.js` fonction `toQuarterHourUp()`

### Tarifs spéciaux (soirs/fins de semaine/fériés) - ✅ Implémenté (2026-02-10)

| Situation | Minimum | Taux | Mention |
|-----------|---------|------|---------|
| Normal (lun-ven jour) | 1h | 1x | - |
| Soir (début après 17h, nouvelle job) | 2h | 1.5x | "Soir" |
| Samedi | 3h | 1.5x | "Samedi" |
| Dimanche | 3h | 1.5x | "Dimanche" |
| Jour férié (Québec) | 3h | 2x | "Jour férié" |

**Règle soir:** S'applique UNIQUEMENT si la job débute après 17h (pas une continuité de jour).
**Checkbox:** Optionnel par BT via `work_orders.apply_surcharge` (boolean).
**Jours fériés:** Calculés dynamiquement dans `lib/utils/holidays.js`.
**Détails:** Voir RECOMMANDATIONS.md section 2.

---

## Variables d'Environnement

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL      # URL Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY # Clé publique Supabase
SUPABASE_SERVICE_ROLE_KEY     # Clé admin (server-side)

# Email (Resend)
RESEND_API_KEY                # API Resend pour emails
RESEND_FROM_EMAIL             # noreply@servicestmt.ca
COMPANY_EMAIL                 # info.servicestmt@gmail.com (CC bureau)

# Vercel
VERCEL_URL                    # URL production

# Sécurité
CRON_SECRET                   # Auth pour cron jobs
```

---

## Points d'Attention / Roadmap

### Complété
1. ~~**Bon de Livraison (BL)**~~ - ✅ QUASI-COMPLÉTÉ 2026-02-17 (PR #42-#51) - reste bandeau alertes
2. ~~**TimeTracker surcharges**~~ - ✅ COMPLÉTÉ 2026-02-10 (holidays.js, TimeTracker v2.0.0, PDF, API)
3. ~~**BCC Confirmation commande**~~ - ✅ COMPLÉTÉ 2026-02-09, mis à jour 2026-02-16 (historique détaillé articles, bouton Renvoyer)
4. ~~**Panneau latéral Split View**~~ - ✅ COMPLÉTÉ 2026-02-16 (PR #48) - BA/AF/Soumission inline
5. ~~**Réception directe + Ajustement inventaire**~~ - ✅ COMPLÉTÉ 2026-02-18 (PR #52) - DirectReceiptModal
6. ~~**Historique des prix produits**~~ - ✅ COMPLÉTÉ 2026-02-11 (PR #36-#39) - 3 niveaux prix + fournisseur
7. ~~**Recherche serveur inventaire**~~ - ✅ COMPLÉTÉ 2026-02-12 (PR #37) - max 50 résultats, par groupe
8. ~~**Mode Sombre (Dark Mode)**~~ - ✅ COMPLÉTÉ 2026-02-22 (branche `claude/add-dark-mode-support-FvcFv`)
   - `tailwind.config.js` — `darkMode: 'class'` activé
   - `app/globals.css` — `color-scheme: dark` ajouté
   - `components/ThemeProvider.js` — wrapper `next-themes` (nouveau)
   - `app/layout.js` — ThemeProvider + classes `dark:` sur body
   - `app/(protected)/parametres/page.js` — page sélecteur Système/Clair/Sombre (nouveau)
   - Tous les composants migrés avec classes Tailwind `dark:` :
     Navigation, ClientManager, InventoryManager, SupplierPurchaseManager, SupplierPurchaseForms,
     WorkOrderForm, TimeTracker, MaterialSelector, DeliveryNoteForm, DeliveryNoteClientView,
     DirectReceiptModal, SupplierReceiptModal, BCCConfirmationModal, ClientModal, PurchaseOrderModal,
     SoumissionsManager, DeliverySlipModal, ClientPOManager, SplitViewPanel, bons-travail page, login
   - Pattern: `bg-white dark:bg-gray-900` / `text-gray-900 dark:text-gray-100` / inputs: `dark:bg-gray-800 dark:border-gray-600`
   - **Reste à faire:** Tester visuellement sur tablette + ajuster si couleurs incorrectes

9. ~~**Rapports & Statistiques de Ventes - Phase 1 MVP**~~ - ✅ COMPLÉTÉ 2026-02-24
   - `app/api/statistics/route.js` — API GET avec filtres, tri, pagination, agrégation BT/BL/Soumissions
   - `components/statistics/StatisticsManager.js` — Composant principal (orchestration)
   - `components/statistics/StatisticsFilters.js` — Filtres: type, dates, client, N° doc, description, produit, tri
   - `components/statistics/SalesReport.js` — Tableau desktop + cartes mobile + bandeau résumé + pagination
   - `components/statistics/StatisticsPDFExport.js` — Export PDF via pdf-common.js + jsPDF autoTable
   - `app/(protected)/statistiques/page.js` — Page protégée
   - `components/Navigation.js` — Ajout onglet Statistiques (icône BarChart3)
   - Note: Coûts BT/BL basés sur cost_price actuel des produits (approximatif si prix changé)

10. ~~**Phase A Fondations — Taux horaires, Tarification, Settings**~~ - ✅ COMPLÉTÉ 2026-02-27
    - `supabase/migrations/20260227_add_settings_and_tarification.sql` — Table settings + colonnes clients
    - `app/api/settings/route.js` — API GET/PUT paramètres globaux (nouveau)
    - `app/(protected)/parametres/page.js` — Sections Taux & Tarifs + Facturation (v2.0.0)
    - `components/ClientModal.js` — Tarification + Contact #3 + email_admin optionnel (v2.0.0)
    - Décisions confirmées: Dimanche 1.5x, Fériés 2x, Navigation Option A, Transport ligne 0$
    - Conditions paiement: Net 30 jours / 2% 10 Net 30 jours / Payable sur réception

11. ~~**Facturation MVP (Phase B)**~~ - ✅ COMPLÉTÉ 2026-02-27
    - `supabase/migrations/20260227_create_invoices.sql` — Table invoices + invoice_id sur BT/BL
    - `supabase/migrations/20260227_create_invoices_storage.sql` — Bucket Supabase Storage 'invoices' (privé)
    - `app/api/invoices/route.js` — API GET (liste) + POST (création avec auto-numéro)
    - `app/api/invoices/[id]/route.js` — API GET/PUT/DELETE facture individuelle
    - `app/api/invoices/[id]/send-email/route.js` — Envoi PDF + upload Storage + sauvegarde pdf_url
    - `components/invoices/InvoiceManager.js` — 2 onglets: "À facturer" + "Factures" + bouton Télécharger PDF
    - `components/invoices/InvoiceEditor.js` — Éditeur lignes (M.O., transport, matériaux, forfait)
    - `app/(protected)/facturation/page.js` — Page protégée Facturation
    - `components/Navigation.js` — Ajout onglet Facturation (icône Receipt)
    - `app/bons-travail/page.js` — Indicateurs rouge/vert facturé sur BT/BL
    - `app/api/work-orders/route.js` + `delivery-notes/route.js` — Ajout invoice_id au SELECT
    - **Stockage PDF:** Lors de l'envoi, le PDF est uploadé dans `invoices/YYYY/MM/facture-{numero}.pdf`
      et l'URL signée est sauvegardée dans `invoices.pdf_url` pour téléchargement ultérieur
    - Note: Les 2 migrations SQL doivent être exécutées manuellement dans Supabase Dashboard

12. ~~**Rapport Acomba (Phase C)**~~ - ✅ COMPLÉTÉ 2026-02-27 — ❌ RETIRÉ 2026-06-14
    - Retiré à la demande de Martin (remplacé par l'onglet « Rapports compta » — item 21).
    - Supprimés: `app/api/invoices/report/route.js`, `components/invoices/AcombaReportExport.js`,
      et le bloc « Rapport Acomba » (sélecteur mois + boutons PDF/CSV) de `InvoiceManager.js`.
    - Note: le bouton « Marquer facturé (Acomba) » de l'onglet « À facturer » (mark-external) reste, c'est une autre fonctionnalité.

13. ~~**Statistiques Phase 2 (Phase D)**~~ - ✅ COMPLÉTÉ 2026-02-27
    - `app/api/statistics/financial/route.js` — API GET statistiques financières (résumé, par mois, par client, en attente)
    - `components/statistics/FinancialStatistics.js` — Orchestrateur sous-onglet Financier
    - `components/statistics/FinancialFilters.js` — Filtres: période, client, statut, vue (Par mois/Par client/En attente)
    - `components/statistics/FinancialReport.js` — 3 vues: revenus par mois, revenus par client, factures en attente
    - `components/statistics/FinancialPDFExport.js` — Export PDF rapport financier (3 modes)
    - `components/statistics/StatisticsManager.js` v2.0.0 — 2 sous-onglets: Opérationnel (BT/BL) + Financier (Factures)
    - Bandeau résumé: total facturé, payé, en attente, brouillon, ventilation matériaux/M.O./transport
    - Vue En attente: suivi échéances, détection retards

14. ~~**Numéros cliquables SplitView (Phase E)**~~ - ✅ COMPLÉTÉ 2026-02-27
    - `components/SplitView/PanelWorkOrder.js` — Panneau lecture BT (nouveau)
    - `components/SplitView/PanelDeliveryNote.js` — Panneau lecture BL (nouveau)
    - `components/SplitView/SplitViewPanel.js` v1.1.0 — Support types work-order et delivery-note
    - `components/invoices/InvoiceManager.js` v1.4.0 — ReferenceLink sur N° BT/BL (À facturer + Factures)
    - `components/statistics/SalesReport.js` v1.1.0 — ReferenceLink sur N° documents (BT/BL/Soumission)
    - `components/statistics/FinancialReport.js` v1.1.0 — ReferenceLink sur N° référence (vue En attente)
    - Pattern: clic sur un N° BT/BL/Soumission ouvre le panneau latéral SplitView en lecture

15. ~~**Navigation mobile Option A + SplitView tablette**~~ - ✅ COMPLÉTÉ 2026-03-01
    - `components/Navigation.js` v2.0.0 — Mobile: BA + BT + Clients + bouton "Plus" (bottom sheet)
    - `components/SplitView/ClientSplitViewWrapper.js` v2.0.0 — Overlay mode tablette/mobile
    - `tailwind.config.js` — Animations slide-up + slide-in-right
    - Fix: panneau SplitView invisible sur tablette → mode overlay avec backdrop

16. ~~**Gestion Backorder (BO) dans les Bons de Livraison**~~ - ✅ COMPLÉTÉ 2026-03-03, corrigé 2026-03-06
    - `supabase/migrations/20260303_add_backorder_columns.sql` — parent_bl_id, child_bl_id, ordered_quantity, previously_delivered
    - `app/api/delivery-notes/route.js` v1.2.0 — POST accepte parent_bl_id + BO fields, GET inclut parent/child, DELETE nettoie child_bl_id
    - `app/api/delivery-notes/[id]/route.js` v1.1.0 — GET charge parent/child bl_number, PUT accepte BO fields
    - `app/api/delivery-notes/[id]/complete-signature/route.js` v1.3.0 — Détection BO, création auto BL suivi brouillon, lien parent↔child
    - `components/delivery-notes/DeliveryNoteForm.js` v3.0.0 — Tableau compact BO unifié (Code/Desc/U/M/Commandé/Expédié/B/O), cartes MaterialSelector pour items manuels
    - `components/delivery-notes/DeliveryNoteClientView.js` v2.6.0 — Colonnes Reçu/À suivre, colonne masquée si aucun BO restant
    - `app/bons-travail/page.js` v2.3.0 — Badge "BO" orange, indicateur "Suite" pour BL de suivi
    - `lib/services/email-service.js` v3.2.0 — PDF BL avec colonnes Code/Desc/U/M/Commandé/Expédié/B/O conditionnelles
    - Note: Migration SQL à exécuter manuellement dans Supabase Dashboard

17. ~~**Voyant marge faible (Facturation)**~~ - ✅ COMPLÉTÉ 2026-06-01
    - `supabase/migrations/20260601_add_min_margin_percent.sql` — Colonne `min_margin_percent` (défaut 10)
    - `app/api/settings/route.js` v1.2.0 — Champ `min_margin_percent` (défaut + validation)
    - `app/(protected)/parametres/page.js` v2.2.0 — Champ "Marge de profit minimale" (section Facturation)
    - `components/invoices/InvoiceEditor.js` v2.5.0 — Carré du prix vendant en rouge + icône ⚠️ + bandeau récapitulatif quand marge < seuil
    - Alerte 100% interne (écran de saisie), jamais sur la facture client (PDF sans coûtant/marge)
    - Note: Migration SQL à exécuter manuellement dans Supabase Dashboard

18. ~~**Consultation BA / Soumission depuis l'éditeur de facture**~~ - ✅ COMPLÉTÉ (2026-06-04)
    - `components/invoices/InvoiceReferencePanel.js` v1.0.0 — Panneau lecture seule (BA via
      purchase_orders + client_po_items, Soumission via submissions), met l'accent sur les prix de vente
    - `components/invoices/InvoiceEditor.js` v2.7.0 — Badges cliquables `BA {po_number}` / `Soumission
      {submission_no}` dans l'entête → panneau côte-à-côte (desktop) ou superposition (mobile/tablette)
    - But: vérifier les prix de vente déjà donnés au client pendant la révision de facture
    - Note: l'éditeur étant une modale plein écran, panneau dédié (le SplitView global serait masqué)

19. ~~**Système de Notes (page d'ouverture)**~~ - ✅ COMPLÉTÉ (2026-06-09)
    - `supabase/migrations/20260609_create_notes.sql` — Table `notes` + RLS (authenticated) + index
    - `lib/utils/notes.js` — Tri par échéance, urgence/couleurs (🔴 0-1j / 🟠 2-7j / ⚪ 8+j ou sans date), format fr-CA, lien SplitView
    - `app/api/notes/route.js` — GET liste (filtres) + POST création
    - `app/api/notes/[id]/route.js` — GET/PUT (édition + toggle complété)/DELETE
    - `app/api/notes/projects/route.js` — Liste BT/BL/BA/Soumission pour le sélecteur du formulaire
    - `components/notes/NotesManager.js` + `NoteCard.js` + `NoteForm.js` — Dashboard + carte + modal
    - `app/(protected)/notes/page.js` — Page tableau de bord
    - `app/page.js` — Redirige vers `/notes` (nouvelle page d'ouverture)
    - `components/Navigation.js` v2.1.0 — Onglet Notes (1er) + badge urgent
    - Notes globales OU liées à un document; complétées masquées; lien projet ouvre le SplitView
    - Décisions: `.js` (pas TS), en ligne simple (pas d'offline-first), échéance optionnelle, sans priorité/tags
    - **Amélioration (2026-06-09):** Client associable à une note (optionnel) + filtrage du sélecteur de document
      - `supabase/migrations/20260609b_add_client_to_notes.sql` — colonnes `client_id` + `client_name`
      - `app/api/notes/projects/route.js` v2.1.0 — n'affiche que: BT/BL `draft` (Brouillons), BA `in_progress` (En cours), Soumissions `sent`/`accepted` (Envoyée/Acceptée); filtre par client (client_id BT/BL, client_name BA/Soum.); inclut la description du document
      - `NoteForm.js` v1.2.0 (sélecteur client + description du doc dans la liste + bouton Supprimer) + `NoteCard.js` v1.1.0 (badge client) + API notes route/[id] v1.1.0
    - **Reste:** exécuter les migrations SQL (`20260609_create_notes.sql` + `20260609b_add_client_to_notes.sql`) dans Supabase Dashboard

20. ~~**État de compte client (Facturation)**~~ - ✅ COMPLÉTÉ (2026-06-14)
    - `supabase/migrations/20260614_create_invoice_payments.sql` — Table `invoice_payments` + RLS,
      `invoices.amount_paid`, statut `'partial'`, `settings.late_interest_annual_rate` + `statement_footer_note`
    - `lib/services/invoice-payments.js` — Recalcul statut, intérêts, vieillissement (aging)
    - `app/api/invoice-payments/route.js` + `[id]/route.js` — CRUD paiements (partiels/multi-factures)
    - `app/api/statements/route.js` + `[clientId]/route.js` + `[clientId]/send-email/route.js` — Liste, détail, PDF/envoi
    - `components/invoices/StatementManager.js` + `ClientStatementView.js` — Onglet + vue détaillée (saisie paiements, escompte 2 %, aperçu, envoi)
    - `components/invoices/InvoiceManager.js` v2.0.0 — 3e onglet, badge Partielle, rond vert = indicateur cliquable → état de compte
    - `app/api/settings/route.js` v1.3.0 + `parametres/page.js` v2.3.0 — Taux d'intérêt configurable + note pied de relevé
    - Escompte 2 % sur sous-total (taxes complètes — Revenu Québec); intérêt = solde × taux × jours/365; relevé open-item; aging Courant/1-30/31-60/61-90/90+
    - **Reste:** exécuter la migration SQL `20260614_create_invoice_payments.sql` dans Supabase Dashboard

21. ~~**Rapports comptables (Ventes + Paiements)**~~ - ✅ COMPLÉTÉ (2026-06-14)
    - `supabase/migrations/20260614b_add_accountant_email.sql` — colonne `settings.accountant_email`
    - `app/api/settings/route.js` v1.4.0 + `parametres/page.js` v2.4.0 — champ Courriel du comptable
    - `lib/utils/report-period.js` — résolution période mois/année/personnalisé + libellés fr-CA
    - `lib/services/report-data.js` — agrégation ventes + paiements (réutilisé GET + send-email)
    - `lib/services/report-pdf.js` — constructeurs PDF partagés client/serveur (jsPDF + pdf-common)
    - `lib/services/report-email.js` — envoi Resend (comptable + CC bureau) + upload Storage `reports/`
    - `app/api/reports/sales/route.js` + `sales/send-email/route.js` — rapport de ventes (factures émises)
    - `app/api/reports/payments/route.js` + `payments/send-email/route.js` — rapport de paiements (encaissements)
    - `components/invoices/AccountingReports.js` + `InvoiceManager.js` v2.1.0 — 4e onglet « Rapports compta »
    - Ventes: 1 ligne/facture (mat./M.O./dépl./**Forfait·Autre**/TPS/TVQ/Total) + TOTAUX. Paiements: 1 ligne/paiement (date, mode, facture, montant, escompte) + TOTAUX + sommaire par mode
    - Ventilation des ventes calculée depuis `line_items` (pas les colonnes stockées) → le prix forfaitaire (Jobe) + lignes « autre » tombent dans la colonne Forfait/Autre, et la ligne TOTAUX réconcilie toujours avec le sous-total (corrige les factures Jobe qui affichaient 0 partout)
    - Période: Mois / Année (année civile) / Personnalisé. Envoi au courriel comptable (Paramètres) + CC bureau
    - **Statistiques financières** (`app/api/statistics/financial/route.js` v1.1.0 + `FinancialReport.js` + `FinancialPDFExport.js`): même ventilation depuis `line_items` + colonne/ligne **Forfait/Autre** (résumé, par mois, par client, PDF). Réutilise `salesBreakdown` exporté de `report-data.js`
    - **Reste:** exécuter la migration SQL `20260614b_add_accountant_email.sql` dans Supabase Dashboard

22. ~~**Contacts fournisseurs #2/#3 + choix destinataire courriel (AF)**~~ - ✅ COMPLÉTÉ (2026-07-13)
    - `supabase/migrations/20260713_add_supplier_contacts.sql` — colonnes `contact_name_2/email_2/phone_2` + `contact_name_3/email_3/phone_3` sur `suppliers`
    - `components/SupplierPurchaseHooks.js` — `supplierForm` (défauts + `resetSupplierForm`) incluent les 6 nouveaux champs
    - `components/SupplierPurchaseForms.js` v1.4.0 — SupplierFormModal: sections Contact #2 et #3 (nom + email + téléphone optionnel, formatage tél. réutilisé); liste fournisseurs affiche les contacts 2/3; bouton Modifier initialise les nouveaux champs
    - Envoi AF par courriel: sélecteur **Destinataire(s) courriel** (cases à cocher — contact principal + #2 + #3 ayant un email) sous le sélecteur de fournisseur; le `mailto:` envoie à tous les contacts cochés (défaut = principal)
    - Aussi: `MaterialSelector.js` v1.7.0 — affichage « En main » (stock) dans le modal d'ajout, le modal d'édition et la liste des matériaux (BT + BL)
    - **Reste:** exécuter la migration SQL `20260713_add_supplier_contacts.sql` dans Supabase Dashboard (sinon création/màj fournisseur échoue: colonnes manquantes)

23. ~~**Inventaire: édition complète (Code + Unité) + unité « Longueur »**~~ - ✅ COMPLÉTÉ (2026-07-14)
    - `lib/constants/units.js` (nouveau) — liste d'unités partagée avec ajout de « Longueur » (Lg) + helper `unitOptionsWith()`
    - `components/InventoryManager.js` v3.10.0 — Code (product_id) et Unité modifiables dans le modal d'édition + avertissement au changement de code
    - `app/api/products/rename/route.js` (nouveau) — renommage du code avec cascade (inventory_movements, work_order_materials, delivery_note_materials via supabaseAdmin) + contrôle d'unicité
    - `components/DirectReceiptModal.js` v1.5.0 — création de produit utilise la liste d'unités partagée
    - Aucune migration SQL requise

### À faire (priorité utilisateur)
6. **Statut soumissions** - Import partiel + changement auto "Acceptée" + ref croisée BA
7. **Bandeau alertes** - BA orphelins / AF reçus sans livraison (reste Phase 3)
8. **Multi-utilisateurs** - Préparer système permissions/RLS
9. **Ajustements visuels Dark Mode** - Tester sur tablette, corriger couleurs si besoin

### Bugs connus (corrigés)
- ~~BT sans total (0h) sur le PDF client quand le chrono n'est pas arrêté~~ → Corrigé (2026-07-15)
  - Symptôme: session non arrêtée (chrono oublié) → à la signature, le PDF affichait les heures travaillées (ex. `08:22-11:35`) mais le total tombait à `0h` (par ligne + grand total), car la session était enregistrée avec une heure de fin mais `total_hours: 0`. Le rattrapage à la signature (`complete-signature`, auto-terminaison des sessions `in_progress`) ne couvrait pas tous les cas.
  - Correctif à la source: `WorkOrderForm.js` v1.5.0 — la présentation client (« Présenter au client » → `ready_for_signature`) est **bloquée** tant que le chronomètre tourne (`trackerIsWorking`). L'utilisateur doit appuyer sur « Terminer » d'abord (fige l'heure de fin, calcule le total, permet de vérifier les cases Retour/Transport). Aucune migration requise.
- ~~Pull-to-refresh natif perd les données en cours (BT/BL/Facture) sur mobile/tablette~~ → Corrigé (2026-06-22)
  - `components/DisablePullToRefresh.js` (nouveau) — Composant qui applique `overscroll-behavior-y: contain` sur `<html>`/`<body>` **uniquement** pendant qu'un formulaire de saisie est monté, puis restaure la valeur au démontage. Monté dans `WorkOrderForm.js` (v1.4.0), `DeliveryNoteForm.js` (v3.4.0) et `InvoiceEditor.js` (v2.8.0).
  - **Ciblé volontairement** : le pull-to-refresh reste actif sur les pages de liste (BT/BL) où il sert à voir un document punché depuis un autre appareil. Une règle globale `html, body` casserait ce besoin.
  - `app/bons-travail/page.js` (v2.6.0) — En complément, la liste se rafraîchit automatiquement au retour en avant-plan (`visibilitychange`/`focus`), donc un BT/BL créé sur un autre appareil apparaît sans pull-to-refresh manuel. Aucune migration requise.
- ~~« numeric field overflow » en sauvegardant un BT avec beaucoup de sessions~~ → Corrigé (2026-06-15)
  - `work_orders.total_hours` était en `numeric(4,2)` (max 99,99 h). Sur un BT à nombreuses sessions, le cumul des heures dépassait 100 h → erreur PostgreSQL au moment de sauvegarder (constaté sur BT-2026-084, ~16 sessions). Ce n'est PAS une limite du nombre de sessions, mais un plafond d'heures cumulées.
  - `supabase/migrations/20260615_widen_work_order_total_hours.sql` — Élargit `total_hours` en `numeric(7,2)` (max 99 999,99 h). Expansion sûre, aucune perte de données.
  - **Migration SQL à exécuter manuellement dans Supabase Dashboard** (sinon le BT-2026-084 reste bloqué)
- ~~Bouton "Acomba" (mark-external) sans effet — FK invoice_id bloquait l'UPDATE silencieusement~~ → Corrigé (2026-05-19)
  - `supabase/migrations/20260519_drop_invoice_id_fk.sql` — Retire la contrainte FK sur `work_orders.invoice_id` et `delivery_notes.invoice_id` pour autoriser la valeur sentinelle `-1` (facturé externement Acomba). Aucun CASCADE défini, retrait sans impact en cascade.
  - `app/api/invoices/mark-external/route.js` v1.1.0 — Remonte les erreurs DB au client (retourne `success: false` au lieu de masquer l'échec)
  - **Migration SQL à exécuter manuellement dans Supabase Dashboard**
- ~~Code dupliqué dans `email-service.js` (formatQuebecDateTime)~~ → Corrigé (2026-02-07)
- ~~Champs redondants non synchronisés (client_name + client_id)~~ → Sync automatique ajoutée (2026-02-07)
- ~~Bug `COMPANY_EMAIL` dans send-inventory-report~~ → Corrigé (2026-02-07)
- ~~Code mort dans work-orders GET (double return)~~ → Supprimé (2026-02-07)
- ~~Statut BL reste 'signed' au lieu de 'sent' après envoi email~~ → Corrigé (2026-02-17, PR #51)
- ~~Caractères Unicode échappés dans DirectReceiptModal~~ → Corrigé (2026-02-18)
- ~~Double-compte "Réservé (BT/BL/Soum.)" dans l'inventaire après signature~~ → Corrigé (2026-04-21, branche `claude/fix-inventory-shipment-sync-cI0hb`)
  - `InventoryManager.js` v3.6.0 — BT réservé: `draft` + `ready_for_signature`; BL réservé: `draft` + `ready_for_signature`; soumissions retirées du calcul
  - Raison: inventaire décrémenté à la signature (`complete-signature` v1.2.0+), donc les statuts `signed`/`pending_send` ne doivent plus compter en "Réservé"
  - Labels UI mis à jour: "Réservé (BT/BL non signés)" au lieu de "Réservé (BT/BL/Soum.)"
  - v3.7.0 (2026-04-21) — Outils de diagnostic ajoutés:
    - Bouton "Voir détail" dans modal édition → popup listant les BT/BL qui réservent l'item (N°, statut, client, qté)
    - Bouton "Avec réservé" dans barre d'outils → charge uniquement les items avec réservations actives
  - v3.7.1 (2026-04-21) — Fix: ajout statut `ready_for_signature` pour BT (un BT ouvert via URL publique passe de draft → ready_for_signature, doit rester compté en réservé jusqu'à signature)
  - v3.7.2 (2026-04-21) — Fix: fallback sur `product_code` quand `product_id` est NULL. WorkOrderForm normalise product_id à NULL si ce n'est ni UUID ni number (voir WorkOrderForm.js:1135-1159). Les SKU texte ("CI71") sont alors stockés uniquement dans product_code. Le calcul "Réservé" utilise maintenant `product_id || product_code` pour BT et BL
  - v3.8.0 (2026-04-21) — Calcul déplacé côté serveur: nouveau endpoint `GET /api/inventory/reservations` (supabaseAdmin bypass RLS). Raison: la table `work_order_materials` a une RLS SELECT qui bloque les lectures client-side (confirmé via logs: 0 matériaux retournés pour 12 BTs draft existants)
- ~~Décrément d'inventaire manquant sur BT signés (product_id NULL)~~ → Corrigé (2026-04-21)
  - Les BT signés avec des SKU texte (ex: "CI71") ne décrémentaient PAS le stock ni ne créaient de mouvement `inventory_movements`
  - Cause: `WorkOrderForm.js:1135-1159` normalise `product_id` à NULL pour les codes non-UUID/non-number si `findExistingProduct` échoue. Les routes `complete-signature` et `send-email` faisaient `if (!material.product_id) continue` → matériau skippé silencieusement
  - Fix: fallback `pid = material.product_id || material.product_code` dans les 4 routes + script de rattrapage
  - Fichiers: `app/api/work-orders/[id]/complete-signature/route.js` v1.4.0, `app/api/work-orders/[id]/send-email/route.js` v1.2.0, `app/api/delivery-notes/[id]/complete-signature/route.js` v1.6.0, `app/api/delivery-notes/[id]/send-email/route.js` v1.3.0, `app/api/admin/backfill-movements/route.js` v1.1.0 (+ décrémente aussi stock_qty)

### Session 22 avril 2026 — Refonte complète des mouvements d'inventaire BT/BL
**Branche** : `claude/fix-inventory-shipment-sync-cI0hb`

**Contexte** : Martin a constaté que des items signés dans des BT apparaissaient encore en "Réservé" et que le stock ne se décrémentait pas après signature de BT (les BL fonctionnaient). Investigation a révélé une cascade de 4 bugs liés.

**Bugs identifiés et corrigés (par ordre de découverte)** :

1. **Double-compte "Réservé"** — Statuts `signed`/`pending_send` étaient comptés en réservé alors que le stock était déjà sorti depuis `complete-signature` v1.2.0 (13 avril). Fix : filtrer par statut `draft` + `ready_for_signature` uniquement, et retirer les soumissions du calcul.

2. **BT en `ready_for_signature` non comptés** — Quand un BT est ouvert via URL publique, son statut passe automatiquement de `draft` à `ready_for_signature` (voir `app/api/work-orders/[id]/public/route.js:64`). Le filtre initial ne prenait que `draft`. Ajouté.

3. **RLS bloquait `work_order_materials` côté client** — La table avait RLS activée sans policy SELECT, contrairement à `delivery_note_materials` qui en a une (migration `20260212_create_delivery_notes.sql:121`). Confirmé via logs : 12 BTs draft retournés, 0 matériaux. Fix : déplacé tout le calcul vers `/api/inventory/reservations` qui utilise `supabaseAdmin` (bypass RLS).

4. **BT signés ne décrémentaient pas le stock** (LE plus impactant) — `WorkOrderForm.js:1135-1159` normalise `material.product_id` à NULL pour les SKU texte (ex: "CI71") qui ne sont ni UUID ni number et que `findExistingProduct` ne trouve pas dans le cache. Le SKU est alors stocké uniquement dans `product_code`. Les 4 endpoints de déduction faisaient `if (!material.product_id) continue` → matériau skippé. Fix : fallback `pid = material.product_id || material.product_code` partout.

**Outils de diagnostic ajoutés** (InventoryManager v3.7.0+) :
- Bouton **"Voir détail"** à côté de "Réservé" dans le modal édition → popup listant les BT/BL qui réservent (N°, statut, client, qté)
- Bouton **"Avec réservé"** dans la barre d'outils → charge uniquement les items avec réservations actives

**Rattrapage des données historiques** (exécuté le 22 avril 2026) :
- Endpoint `/api/admin/backfill-movements?dryrun=false` (auth `Bearer $CRON_SECRET`)
- 50 BT rattrapés → 166 mouvements créés
- 5 BL rattrapés → 7 mouvements créés
- `products.stock_qty` décrémenté en conséquence
- Anti-doublon vérifié post-exécution (86 BT + 20 BL protégés via `inventory_movements.reference_number`)

**Cas limites résiduels (rares mais possibles)** :
- Matériau créé sans `product_id` ET sans `product_code` (les deux NULL) → skippé silencieusement, pas de décrément
- Produit supprimé après création du BT → mouvement créé mais `stock_qty` non mis à jour (la ligne n'existe plus dans `products`)
- **Root cause non résolue** : `WorkOrderForm.js:1135-1159` continue de mettre `product_id` à NULL pour les SKU texte non résolus. À nettoyer un jour pour éliminer la dépendance au fallback `product_code`.

**Architecture cible long terme (optionnel)** :
- Corriger `WorkOrderForm.js` pour qu'il garde le SKU dans `product_id` directement (comme le fait `DeliveryNoteForm`)
- Ajouter une RLS SELECT policy sur `work_order_materials` (rendrait l'API serveur optionnelle)

### Backup/Restauration
- `/api/admin/restore` existe mais jamais testé
- Backup quotidien par email fonctionne

---

## Patterns de Code Fréquents

### Lecture Supabase (client)
```javascript
import { supabase } from '@/lib/supabase';

const { data, error } = await supabase
  .from('table_name')
  .select('*')
  .eq('field', value);
```

### Lecture Supabase (server avec admin)
```javascript
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const { data, error } = await supabaseAdmin
  .from('table_name')
  .select('*');
```

### Envoi email avec PDF
```javascript
const { WorkOrderEmailService } = require('@/lib/services/email-service');

const emailService = new WorkOrderEmailService();
await emailService.sendWorkOrderEmail(workOrder, { clientEmail: emails });
```

---

## Structure d'un BT Complet (référence)

```javascript
{
  id: 123,
  bt_number: "BT-2501-001",
  client_id: 1,
  client: {
    name: "Nom Client",
    address: "123 Rue...",
    email: "client@email.com",
    email_admin: "admin@email.com",
    travel_minutes: 30
  },
  linked_po_id: 456,
  linked_po: { po_number: "PO-2024-001" },
  work_date: "2025-01-15",
  time_entries: [
    {
      date: "2025-01-15",
      start_time: "08:00",
      end_time: "12:00",
      pause_minutes: 15,
      total_hours: 3.75,
      include_travel: true,
      include_transport_fee: false
    }
  ],
  total_hours: 3.75,
  work_description: "Description du travail effectué",
  materials: [
    {
      product_id: "PROD-001",
      code: "PROD-001",
      description: "Description produit",
      quantity: 2,
      unit: "UN",
      unit_price: 50.00,
      show_price: true,
      notes: "Note optionnelle"
    }
  ],
  status: "completed",
  is_prix_jobe: false,
  recipient_emails: ["client@email.com"],
  signature_data: "data:image/png;base64,...",
  signature_timestamp: "2025-01-15T16:30:00Z",
  client_signature_name: "Jean Tremblay"
}
```

---

## Structure d'un BL Complet (référence)

```javascript
{
  id: 456,
  bl_number: "BL-2602-001",
  client_id: 1,
  client_name: "Nom Client",
  client: {
    name: "Nom Client",
    address: "123 Rue...",
    email: "client@email.com",
    email_admin: "admin@email.com"
  },
  linked_po_id: 789,
  linked_po: { po_number: "PO-2026-001" },
  parent_bl_id: null,        // Réf. BL parent (si c'est un suivi BO)
  child_bl_id: null,         // Réf. BL de suivi (si BO créé après signature)
  delivery_date: "2026-02-07",
  delivery_description: "Livraison matériels électriques - Phase 1",
  materials: [
    {
      product_id: "PROD-001",
      description: "Description produit",
      quantity: 5,
      unit: "UN",
      unit_price: 50.00,
      show_price: true,
      notes: "Note optionnelle",
      ordered_quantity: 10,     // Qté commandée d'origine (null si ajout manuel)
      previously_delivered: 0   // Qté déjà livrée dans BL précédents
    }
  ],
  status: "sent",
  is_prix_jobe: false,
  recipient_emails: ["client@email.com"],
  signature_data: "data:image/png;base64,...",
  signature_timestamp: "2026-02-07T14:30:00Z",
  client_signature_name: "Jean Tremblay"
}
```

**Différences clés BL vs BT:**
- Pas de `time_entries` ni `total_hours` (pas de suivi temps)
- Pas de `work_description` → `delivery_description` à la place
- Pas de `work_date` → `delivery_date` à la place
- Numérotation BL-YYMM-### au lieu de BT-YYMM-###
- Support backorder (BO) via `ordered_quantity`, `previously_delivered`, `parent_bl_id`, `child_bl_id`

---

## Flux Inventaire (BT, BL, AF et Réception directe)

```
AF Réception       → stock_qty += quantité reçue     (mouvement IN)
Réception directe  → stock_qty += quantité reçue     (mouvement IN, sans AF)
Ajustement inv.    → stock_qty += ou -= quantité      (mouvement IN ou OUT, prise d'inventaire)
BT Envoi email     → stock_qty -= quantité matériaux  (mouvement OUT)
BL Envoi email     → stock_qty -= quantité livrée     (mouvement OUT)
```

Les mouvements sont enregistrés dans `inventory_movements`:
- `reference_type`: 'work_order', 'delivery_note', 'supplier_purchase', ou 'direct_receipt'
- `movement_type`: 'IN' ou 'OUT'

---

## Commandes Utiles

```bash
# Dev local
npm run dev

# Build production
npm run build

# Vérifier TypeScript (partiel)
npx tsc --noEmit

# Tester backup manuellement
curl -H "Authorization: Bearer $CRON_SECRET" $VERCEL_URL/api/cron/backup
```

---

## Contact

**Utilisateur:** Martin et/ou Dominique
**Entreprise:** Services TMT Inc.
**Adresse:** 3195 42e Rue Nord, Saint-Georges, QC, G5Z 0V9
**Téléphone:** (418) 225-3875
**Email rapports:** servicestmt@gmail.com
**Email bureau:** info.servicestmt@gmail.com


---

Ajout par MArtin T. (propriétaire/user/programmer)

## Attributs des champs texte
- Champs texte libre : `autoCorrect="on" autoCapitalize="sentences" spellCheck={true}`
- Champs codes/références/montants : `autoCorrect="off" autoCapitalize="off" spellCheck={false}`

## Feedback visuel des actions async
Toujours afficher un état de chargement (spinner, bouton désactivé) pendant les appels API 
pour éviter les double-soumissions sur mobile.

## Sauvegarde avant navigation
Avertir l'utilisateur s'il tente de quitter une page avec des modifications non sauvegardées 
(utiliser `beforeunload` ou équivalent Next.js avec `useRouter`).

## Confirmation avant action destructive
Toujours afficher une confirmation explicite avant toute suppression ou action irréversible.
Ne jamais supprimer directement au premier clic/tap.

## Locale et timezone
Toujours utiliser la locale `fr-CA` et le timezone `America/Toronto` pour tous 
les formats de date, heure et nombres.

## Champs numériques - Auto-select au focus
Toujours ajouter `onFocus={(e) => e.target.select()}` sur tous les champs `<input>` 
de type numérique pour sélectionner automatiquement le contenu au clic/tap (mobile-first).

## Comportement mobile - Pull-to-refresh
Toujours inclure `overscroll-behavior-y: contain` sur `html, body` dans `globals.css` 
pour désactiver le pull-to-refresh natif du navigateur (perte de données en cours).

## Curseur textarea - Stabilité du curseur
Ne jamais utiliser `value={state}` directement sur un `<textarea>` sans gérer la position 
du curseur. Utiliser `defaultValue` pour les champs non-contrôlés, ou s'assurer que le 
state update ne force pas un re-render inutile du composant parent.
Si le curseur saute à la fin après chaque frappe, vérifier :
1. Que le `<textarea>` n'est pas recréé à chaque render (éviter les composants inline)
2. Utiliser `useCallback` sur le handler `onChange`
3. En dernier recours, utiliser une ref pour sauvegarder/restaurer la position du curseur
