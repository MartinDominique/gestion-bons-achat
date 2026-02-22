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
```

### API Endpoints Critiques
```
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
components/SplitView/                         → Panneau latéral (BA/AF/Soumission inline)
components/ClientManager.js                   → Gestion clients
```

---

## Base de Données - Tables Principales

### work_orders (BT)
```sql
id, bt_number, client_id, linked_po_id,
work_date, time_entries (JSONB), total_hours,
work_description, status, is_prix_jobe,
signature_data, signature_timestamp, client_signature_name
```
**Statuts:** draft, signed, pending_send, completed

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
id, bl_number, client_id, client_name, linked_po_id,
delivery_date, delivery_description, status,
is_prix_jobe, signature_data, signature_timestamp,
client_signature_name, recipient_emails (JSONB),
user_id, created_at, updated_at
```
**Statuts:** draft, ready_for_signature, signed, pending_send, sent
**Matériaux:** Table séparée `delivery_note_materials` (product_id, quantity, unit, unit_price, etc.)

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
| Jour férié (Québec) | 3h | 1.5x | "Jour férié" |

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
   8. ~~**Mode Sombre (Dark Mode)**~~ - ✅ COMPLÉTÉ 2026-02-22 (branche `claude/add-dark-mode-support-RevPQ`)
   - `tailwind.config.js` — `darkMode: 'class'`
   - `components/ThemeProvider.js` — wrapper next-themes
   - `app/layout.js` — ThemeProvider intégré
   - `app/(protected)/parametres/page.js` — sélecteur Système/Clair/Sombre
   - Composants migrés: Navigation, SplitViewPanel, login, bons-travail, ClientManager, InventoryManager, SupplierPurchaseManager, SupplierPurchaseForms
   - **Non migrés encore:** WorkOrderForm, WorkOrderList, SoumissionsManager, ClientModal, DeliverySlipModal
   - Pattern: `bg-white dark:bg-gray-800` / `text-gray-900 dark:text-gray-100`

### À faire (priorité utilisateur)
1. **Statut soumissions** - Import partiel + changement auto "Acceptée" + ref croisée BA
2. **Standardisation PDF** - En-tête uniforme tous documents (module `pdf-common.js`)
3. **Simplifier workflow Prix Jobe** - Trop complexe actuellement
4. **Bandeau alertes** - BA orphelins / AF reçus sans livraison (reste Phase 3)
5. **Optimisation mobile BT/BL** - 95% usage mobile
6. **Rapport hebdomadaire** - Format à revoir (rapport Achats est OK)
7. **Multi-utilisateurs** - Préparer système permissions/RLS
8. **Compléter Dark Mode** - Migrer WorkOrderForm, WorkOrderList, SoumissionsManager, ClientModal, DeliverySlipModal

### Bugs connus (corrigés)
- ~~Code dupliqué dans `email-service.js` (formatQuebecDateTime)~~ → Corrigé (2026-02-07)
- ~~Champs redondants non synchronisés (client_name + client_id)~~ → Sync automatique ajoutée (2026-02-07)
- ~~Bug `COMPANY_EMAIL` dans send-inventory-report~~ → Corrigé (2026-02-07)
- ~~Code mort dans work-orders GET (double return)~~ → Supprimé (2026-02-07)
- ~~Statut BL reste 'signed' au lieu de 'sent' après envoi email~~ → Corrigé (2026-02-17, PR #51)
- ~~Caractères Unicode échappés dans DirectReceiptModal~~ → Corrigé (2026-02-18)

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
      notes: "Note optionnelle"
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
