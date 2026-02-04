# Gestion Bons d'Achat - Services TMT Inc.

Application web de gestion opérationnelle pour Services TMT Inc., une entreprise de services techniques, maintenance industrielle et fabrication de panneaux d'automatisation basée à Saint-Georges, Québec.

## Apercu

Cette application gère le cycle complet des opérations:
- **Bons de Travail (BT)** - Suivi du temps, matériaux, signatures clients
- **Bons d'Achat Client (BA)** - Commandes/PO reçus des clients
- **Achats Fournisseurs (AF)** - Commandes auprès des fournisseurs
- **Inventaire** - Gestion des produits et matériaux
- **Soumissions** - Devis et propositions clients

---

## Stack Technique

| Composant | Technologie |
|-----------|-------------|
| **Framework** | Next.js 14.2 (App Router) |
| **Frontend** | React 18.3, Tailwind CSS 3.4 |
| **Base de données** | Supabase (PostgreSQL) |
| **Authentification** | Supabase Auth |
| **Email** | Resend API |
| **PDF** | jsPDF + jspdf-autotable |
| **Hebergement** | Vercel |
| **CI/CD** | GitHub Actions |

---

## Structure du Projet

```
gestion-bons-achat/
├── app/                          # Next.js App Router
│   ├── (protected)/              # Routes protegees (auth requise)
│   │   ├── bons-achat/           # Gestion BA Client
│   │   ├── soumissions/          # Gestion des soumissions
│   │   ├── inventaire/           # Gestion inventaire
│   │   └── achat-materiels/      # Achats fournisseurs (AF)
│   │
│   ├── api/                      # Endpoints API
│   │   ├── clients/              # CRUD clients
│   │   ├── products/             # CRUD produits
│   │   ├── purchase-orders/      # CRUD bons d'achat
│   │   ├── work-orders/          # CRUD bons de travail
│   │   │   └── [id]/
│   │   │       ├── send-email/   # Envoi email BT
│   │   │       ├── signature/    # Capture signature
│   │   │       └── public/       # Vue publique BT
│   │   ├── cron/
│   │   │   ├── backup/           # Backup quotidien
│   │   │   └── check-long-sessions/
│   │   ├── send-daily-report/    # Rapport quotidien
│   │   ├── send-weekly-report/   # Rapport hebdomadaire
│   │   └── import-inventory/     # Import CSV inventaire
│   │
│   ├── bons-travail/             # Pages Bons de Travail
│   │   ├── page.js               # Liste des BT
│   │   ├── nouveau/page.js       # Nouveau BT
│   │   └── [id]/
│   │       ├── modifier/page.js  # Modifier BT
│   │       └── client/page.js    # Vue client (signature)
│   │
│   ├── login/page.js             # Page connexion
│   └── layout.js                 # Layout principal + navigation
│
├── components/                   # Composants React reutilisables
│   ├── work-orders/              # Composants BT
│   │   ├── WorkOrderForm.js      # Formulaire BT
│   │   ├── WorkOrderList.js      # Liste BT
│   │   ├── TimeTracker.js        # Suivi temps
│   │   ├── MaterialSelector.js   # Selection materiaux
│   │   └── ClientSelect.js       # Selection client
│   │
│   ├── PurchaseOrder/            # Composants BA
│   │   ├── PurchaseOrderForm.js
│   │   ├── PurchaseOrderList.js
│   │   └── hooks/
│   │
│   ├── ClientManager.js          # Gestion clients
│   ├── InventoryManager.js       # Gestion inventaire
│   ├── SoumissionsManager.js     # Gestion soumissions
│   ├── SupplierPurchaseManager.js # Achats fournisseurs
│   └── Navigation.js             # Barre navigation
│
├── lib/                          # Utilitaires et services
│   ├── supabase.js               # Client Supabase (browser)
│   ├── supabaseAdmin.js          # Client Supabase (server/admin)
│   └── services/
│       ├── email-service.js      # Generation PDF + envoi email
│       ├── client-signature.js   # Service signature
│       └── auto-send.js          # Envoi automatique
│
├── .github/workflows/            # Automatisations GitHub
│   ├── weekly-backup.yml         # Backup quotidien 15h Quebec
│   ├── check-long-sessions.yml   # Verification sessions
│   └── weekly-bt-report.yml      # Rapport hebdomadaire
│
└── public/                       # Assets statiques
    ├── logo.png                  # Logo entreprise
    └── manifest.json             # PWA manifest
```

---

## Modules Fonctionnels

### 1. Bons de Travail (BT)

Le coeur de l'application. Un BT documente une intervention chez un client.

**Cycle de vie:**
```
Brouillon → En cours → Signe → Envoye → Complete
```

**Fonctionnalites:**
- Suivi du temps avec arrondi au quart d'heure
- Liste des materiaux utilises (avec ou sans prix)
- Liaison avec un BA Client (PO du client)
- Capture de signature sur tablette
- Generation PDF automatique
- Envoi par email au client + copie bureau

**Mode Prix Jobe:**
Tarification forfaitaire (materiaux + main d'oeuvre inclus). Le client recoit un PDF simplifie sans detail des heures/materiaux. Le bureau recoit le PDF complet.

### 2. Bons d'Achat Client (BA)

Gestion des commandes/PO recus des clients.

**Fonctionnalites:**
- Creation/modification BA
- Liaison avec soumissions
- Liaison avec BT (travaux relies)
- Suivi des livraisons
- Historique par client

### 3. Achats Fournisseurs (AF)

Gestion des commandes passees aux fournisseurs.

**Statuts:**
```
Brouillon → Commande → Partiel → Recu → Annule
```

**Fonctionnalites:**
- Gestion des fournisseurs (Canada/USA)
- Adresses de livraison multiples
- Calcul taxes (TPS/TVQ)
- Reception partielle/complete
- Liaison avec BA Client

### 4. Inventaire

Gestion des produits et materiaux.

**Deux types de produits:**
- `products` - Produits en inventaire (suivi stock)
- `non_inventory_items` - Articles hors inventaire

**Fonctionnalites:**
- Import CSV en masse
- Mouvements de stock (IN/OUT/ADJUST)
- Prix coutant et prix vente
- Groupes de produits

### 5. Soumissions

Devis et propositions pour les clients.

**Statuts:**
```
Brouillon → Envoye → Accepte
```

---

## Base de Donnees (Supabase)

### Tables Principales

| Table | Description |
|-------|-------------|
| `clients` | Clients avec contacts multiples et signataires |
| `work_orders` | Bons de travail |
| `work_order_materials` | Materiaux par BT |
| `purchase_orders` | Bons d'achat client |
| `supplier_purchases` | Achats fournisseurs |
| `suppliers` | Fournisseurs |
| `shipping_addresses` | Adresses livraison |
| `products` | Produits inventaire |
| `non_inventory_items` | Articles hors inventaire |
| `submissions` | Soumissions |
| `inventory_movements` | Mouvements stock |
| `delivery_slips` | Bons de livraison |

### Schema Relationnel

```
clients
  └── work_orders (client_id)
        └── work_order_materials (work_order_id)
  └── purchase_orders (client_id)
        └── delivery_slips (purchase_order_id)
  └── submissions (client_name)

suppliers
  └── shipping_addresses (supplier_id)
  └── supplier_purchases (supplier_id)
        └── supplier_purchase_receipts (supplier_purchase_id)

products / non_inventory_items
  └── work_order_materials (product_id)
  └── inventory_movements (product_id)
```

### Structure Table `clients`

```sql
id              INTEGER PRIMARY KEY
name            TEXT
company         TEXT
address         TEXT
travel_minutes  INTEGER          -- Temps de deplacement en minutes

-- Contact principal
contact_name    TEXT
email           TEXT
phone           TEXT

-- Contact #2
contact_name_2  TEXT
email_2         TEXT
contact_2       TEXT

-- Contact Administration
contact_name_admin  TEXT
email_admin         TEXT
contact_admin       TEXT

-- Signataires autorises (jusqu'a 5)
signatory_1 ... signatory_5  TEXT
```

### Structure Table `work_orders`

```sql
id                    INTEGER PRIMARY KEY
bt_number             TEXT              -- Ex: BT-2501-001
client_id             INTEGER REFERENCES clients(id)
linked_po_id          INTEGER REFERENCES purchase_orders(id)
work_date             DATE
time_entries          JSONB             -- [{start_time, end_time, pause_minutes, total_hours}]
total_hours           NUMERIC
work_description      TEXT
additional_notes      TEXT
status                TEXT              -- draft, signed, pending_send, completed
recipient_emails      JSONB             -- Liste emails destinataires
include_travel_time   BOOLEAN
is_prix_jobe          BOOLEAN           -- Mode forfaitaire
signature_data        TEXT              -- Base64 de la signature
signature_timestamp   TIMESTAMP
client_signature_name TEXT
```

---

## Configuration

### Variables d'Environnement

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Email (Resend)
RESEND_API_KEY=re_xxxxx
RESEND_FROM_EMAIL=noreply@servicestmt.com
COMPANY_EMAIL=info.servicestmt@gmail.com

# Vercel
VERCEL_URL=https://gestion-bons-achat.vercel.app

# Cron Jobs
CRON_SECRET=secret-pour-cron-jobs
```

### Secrets GitHub Actions

Pour les workflows automatises:
- `VERCEL_URL` - URL de l'application Vercel
- `CRON_SECRET` - Secret pour authentifier les cron jobs

---

## Installation Locale

```bash
# Cloner le repo
git clone https://github.com/MartinDominique/gestion-bons-achat.git
cd gestion-bons-achat

# Installer les dependances
npm install

# Configurer les variables d'environnement
cp .env.example .env.local
# Editer .env.local avec vos valeurs

# Lancer en developpement
npm run dev
```

L'application sera disponible sur `http://localhost:3000`

---

## Deploiement

### Vercel

L'application est deployee automatiquement sur Vercel a chaque push sur `main`.

**Cron Jobs Vercel** (configures dans `vercel.json`):
- Rapport quotidien: Lundi-Vendredi a 12h UTC (8h Quebec)
- Rapport hebdomadaire: Vendredi a 21h UTC (17h Quebec)

### GitHub Actions

**Workflows automatises:**

| Workflow | Schedule | Description |
|----------|----------|-------------|
| `weekly-backup.yml` | Tous les jours 20h UTC | Backup base de donnees |
| `check-long-sessions.yml` | Tous les jours | Verification sessions actives |
| `weekly-bt-report.yml` | Hebdomadaire | Rapport BT |

---

## Fonctionnalites Email

### Types d'emails

1. **Email BT** - Bon de travail complete avec PDF
2. **Email Prix Jobe** - 2 emails separes (client simplifie + bureau complet)
3. **Rapport quotidien** - Resume des AF, BT, BA en cours
4. **Rapport hebdomadaire** - Synthese de la semaine
5. **Notifications inventaire** - Changements de stock

### Generation PDF

Le service `email-service.js` genere des PDF professionnels:
- Logo entreprise en en-tete
- Informations client
- Tableau des materiaux (optionnel selon show_price)
- Section signature
- Formatage Quebec (fuseau horaire America/Toronto)

---

## Glossaire

| Terme | Signification |
|-------|---------------|
| **BT** | Bon de Travail - Document d'intervention |
| **BA** | Bon d'Achat Client - Commande/PO du client |
| **AF** | Achat Fournisseur - Commande aux fournisseurs |
| **PO** | Purchase Order - Bon de commande |
| **Prix Jobe** | Tarification forfaitaire (materiaux + travail inclus) |
| **TPS** | Taxe sur les Produits et Services (federale) |
| **TVQ** | Taxe de Vente du Quebec (provinciale) |

---

## Problemes Connus / A Faire

- [ ] Ameliorer le systeme de sauvegarde/restauration
- [ ] Bon de livraison digital sur tablette
- [ ] Repenser le workflow "Prix Jobe" (simplification)
- [ ] Tester la fonctionnalite de restauration (`/api/admin/restore`)

---

## Support

**Entreprise:** Services TMT Inc.
**Adresse:** 3195 42e Rue Nord, Saint-Georges, QC, G5Z 0V9
**Telephone:** (418) 225-3875
**Email:** info.servicestmt@gmail.com

---

*Application developpee avec l'assistance de Claude AI*
