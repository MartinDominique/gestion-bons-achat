# CLAUDE.md - Guide pour Claude AI

Ce fichier contient les informations essentielles pour comprendre et modifier cette application.

## Contexte Rapide

**Application:** Gestion operationnelle pour Services TMT Inc. (services techniques + panneaux d'automatisation)
**Utilisateur principal:** Martin Dominique (seul utilisateur actuellement)
**Localisation:** Saint-Georges, Quebec, Canada
**Stack:** Next.js 14 + Supabase + Resend + Vercel

---

## Terminologie Metier IMPORTANTE

| Abreviation | Terme Complet | Description |
|-------------|---------------|-------------|
| **BT** | Bon de Travail | Document d'intervention chez un client (work order) |
| **BA** | Bon d'Achat Client | Commande/PO RECU d'un client |
| **AF** | Achat Fournisseur | Commande PASSEE a un fournisseur |
| **Prix Jobe** | Prix forfaitaire | Prix fixe incluant materiaux + main d'oeuvre |

**Attention aux confusions:**
- "Bon d'achat" peut etre CLIENT (BA) ou FOURNISSEUR (AF) - toujours clarifier
- `purchase_orders` dans le code = BA (bons d'achat CLIENT)
- `supplier_purchases` dans le code = AF (achats FOURNISSEURS)

---

## Architecture Fichiers Cles

### Pages Principales
```
/bons-travail              → Liste BT (WorkOrderList)
/bons-travail/nouveau      → Nouveau BT (WorkOrderForm)
/bons-travail/[id]/modifier → Modifier BT
/bons-travail/[id]/client  → Vue signature client (public)

/(protected)/bons-achat    → Gestion BA Client
/(protected)/achat-materiels → Achats Fournisseurs (AF)
/(protected)/inventaire    → Gestion inventaire
/(protected)/soumissions   → Soumissions/devis
```

### API Endpoints Critiques
```
/api/work-orders           → CRUD BT
/api/work-orders/[id]/send-email → Envoi email BT
/api/work-orders/[id]/signature  → Capture signature
/api/purchase-orders       → CRUD BA Client
/api/clients               → CRUD clients
/api/products              → CRUD produits
/api/cron/backup           → Backup quotidien
```

### Services Importants
```
lib/services/email-service.js    → Generation PDF + envoi email (800+ lignes)
lib/services/client-signature.js → Gestion signatures
lib/supabase.js                  → Client Supabase (browser)
lib/supabaseAdmin.js             → Client Supabase (server, bypass RLS)
```

### Composants Principaux
```
components/work-orders/WorkOrderForm.js   → Formulaire BT complet
components/work-orders/TimeTracker.js     → Suivi temps (arrondi quart heure)
components/work-orders/MaterialSelector.js → Selection materiaux
components/SupplierPurchaseManager.js     → Gestion AF
components/ClientManager.js               → Gestion clients
```

---

## Base de Donnees - Tables Principales

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

### products / non_inventory_items
```sql
product_id, description, unit, cost_price, selling_price, stock_qty
```

---

## Workflow Prix Jobe (Important)

Quand `is_prix_jobe = true` sur un BT:
1. **Email client:** PDF simplifie (pas d'heures, pas de materiaux)
2. **Email bureau:** PDF complet (heures + materiaux + mention "PRIX JOBE")

Code: `lib/services/email-service.js` lignes 634-730

Le workflow actuel est considere comme "a ameliorer" par l'utilisateur.

---

## Calcul du Temps

Arrondi au quart d'heure SUPERIEUR avec regles:
- < 1h = minimum 1h
- Minutes <=6 → 0
- Minutes 7-21 → 15
- Minutes 22-36 → 30
- Minutes 37-51 → 45
- Minutes >51 → heure suivante

Code: `lib/services/email-service.js` fonction `toQuarterHourUp()`

---

## Variables d'Environnement

```
NEXT_PUBLIC_SUPABASE_URL      # URL Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY # Cle publique Supabase
SUPABASE_SERVICE_ROLE_KEY     # Cle admin (server-side)
RESEND_API_KEY                # API Resend pour emails
RESEND_FROM_EMAIL             # noreply@servicestmt.com
COMPANY_EMAIL                 # info.servicestmt@gmail.com (CC bureau)
VERCEL_URL                    # URL production
CRON_SECRET                   # Auth pour cron jobs
```

---

## Points d'Attention / Problemes Connus

### A faire (priorite utilisateur)
1. **Backup/Restauration** - `/api/admin/restore` jamais teste
2. **Bon de livraison digital** - Pour tablette, a implementer
3. **Workflow Prix Jobe** - A simplifier

### Bugs potentiels
- Code duplique dans `email-service.js` (fonction `formatQuebecDateTime` apparait 2 fois)
- Certaines tables ont des champs redondants (ex: `client_name` + `client_id`)

### Conventions
- Fuseau horaire: `America/Toronto` (Quebec)
- Format date: `fr-CA` (YYYY-MM-DD)
- Arrondi temps: Quart d'heure superieur
- Taxes: TPS (5%) + TVQ (9.975%)

---

## Commandes Utiles

```bash
# Dev local
npm run dev

# Build production
npm run build

# Verifier TypeScript (partiel)
npx tsc --noEmit

# Tester backup manuellement
curl -H "Authorization: Bearer $CRON_SECRET" $VERCEL_URL/api/cron/backup
```

---

## Patterns de Code Frequents

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

## Structure d'un BT Complet (pour reference)

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
  work_description: "Description du travail effectue",
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

## Contact

**Utilisateur:** Martin Dominique
**Entreprise:** Services TMT Inc.
**Email rapports:** servicestmt@gmail.com
**Email bureau:** info.servicestmt@gmail.com
