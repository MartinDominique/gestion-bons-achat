# Recommandations et Analyse - Gestion Bons d'Achat

Document d'analyse technique et recommandations pour l'amelioration de l'application.

---

## Points Positifs

### Architecture
- **Stack moderne et coherent**: Next.js 14 + Supabase + Vercel est un excellent choix pour une application de ce type
- **Separation claire**: Les composants, services et API sont bien organises
- **App Router**: Utilisation du nouveau App Router de Next.js (meilleure performance)

### Fonctionnalites
- **Workflow BT complet**: Cycle de vie bien pense (brouillon → signe → envoye)
- **Signature digitale**: Fonctionnalite pratique pour le travail sur le terrain
- **Generation PDF**: PDFs professionnels avec logo et mise en page soignee
- **Emails automatiques**: Bon systeme de notifications et rapports

### Operations
- **Backup automatique**: GitHub Actions pour backup quotidien
- **Cron jobs**: Rapports automatises bien configures
- **Double email Prix Jobe**: Bonne idee de separer client/bureau

---

## Points a Ameliorer

### 1. ~~Code Duplique~~ ✅ CORRIGE (2026-02-07)

~~**Probleme:** Dans `lib/services/email-service.js`, la fonction `formatQuebecDateTime` est definie deux fois (lignes 80-127).~~

**Correction:** Premiere definition dupliquee supprimee. Une seule definition reste (lignes 80-102).

### 2. ~~Terminologie Confuse~~ ✅ CORRIGE (2026-02-07)

~~**Probleme:** Le terme "Bon d'Achat" est utilise pour deux concepts differents.~~

**Correction:** Bouton "Nouvel Achat" dans SupplierPurchaseManager clarifie en "Nouvel Achat Fourn."
**Note Martin:** La page principale reste "Clients" - ne pas changer.

### 3. ~~Champs Redondants en BD~~ ✅ CORRIGE (2026-02-07)

~~**Probleme:** Risque d'inconsistance si le nom client/fournisseur change.~~

**Correction:** Synchronisation automatique ajoutee:
- `save-client/route.js`: Met a jour `purchase_orders.client_name` apres modification client
- `SupplierPurchaseServices.js`: Met a jour `supplier_purchases.supplier_name` apres modification fournisseur
- Les champs denormalises restent pour la performance (recherche rapide)

### 4. ~~Gestion d'Erreurs~~ ✅ PARTIELLEMENT CORRIGE (2026-02-07)

**Corrections effectuees (sans risque):**
- `save-client/route.js`: `ok: true` → `success: true` (frontend ne lisait pas ce champ)
- `work-orders/route.js` GET: Code duplique supprime (error check + return en double)
- `work-orders/route.js` GET: Ajout `success: false` aux reponses d'erreur
- `send-inventory-report/route.js`: Bug critique corrige (`COMPANY_EMAIL` → `companyEmail`)

**Non corrige (risque de casser le frontend):**
- `/purchase-orders` GET, `/clients` GET, `/products` GET retournent des arrays bruts
- Changer le format casserait les composants frontend qui consomment ces APIs
- A corriger plus tard lors d'une refonte coordonnee frontend+API

### 5. TypeScript Partiel (Priorite: Basse)

**Probleme:** Le projet utilise TypeScript mais la majorite des fichiers sont en `.js`.

**Solution a long terme:** Migrer progressivement vers `.tsx`/`.ts` pour une meilleure maintenabilite.

---

## Fonctionnalites a Developper

### 1. Bon de Livraison Digital - BL (Priorite: Haute - demande utilisateur)

**Objectif:** Creer des bons de livraison (BL) sur tablette lors de la livraison de materiels chez le client.

**Decision (2026-02-07):** Option A retenue - BL integre dans l'app BT.

**Probleme actuel:**
- Le modal `DeliverySlipModal.js` dans BA existe mais n'est pas pratique
- Il ne gere pas bien l'inventaire (+/-)
- Pas de signature client
- Pas d'envoi email
- Martin utilise actuellement un BT pour livrer du materiel, ce qui surcharge le BT

**Analyse des options:**

| Critere | Option A (BL dans BT) | Option B (Dashboard separé) |
|---------|----------------------|---------------------------|
| Risque d'oubli | Faible (meme page) | Eleve (page separee) |
| Usage mobile | Herite du 95% mobile BT | Necessiterait optimisation separee |
| Infrastructure partagee | Signature, email, PDF reutilises | Duplication necessaire |
| Complexite dev | Moderee | Elevee |
| Separation code | Code separe, UI integree | Tout separe |

**Recommandation:** Option A - Le BL est integre dans la page BT pour que Martin ne l'oublie pas.
Elements utiles de l'Option B (bandeau alertes BA orphelins) incorpores dans la liste.

---

#### 1.1 Architecture BL - Separation des responsabilites

| Aspect | BT (Bon de Travail) | BL (Bon de Livraison) |
|--------|---------------------|----------------------|
| **Objectif** | Documenter travail effectue | Documenter livraison materiel |
| **Time entries** | Oui (TimeTracker) | Non |
| **Materiaux** | Optionnel (utilises sur site) | Principal (livres au client) |
| **Signature client** | Oui | Oui |
| **Email + PDF** | Oui | Oui |
| **Inventaire OUT** | Oui (a l'envoi email) | Oui (a l'envoi email) |
| **Lie a BA** | Optionnel | Recommande |
| **Numerotation** | BT-YYMM-### | BL-YYMM-### |
| **Usage mobile** | 95% | 95% (meme page) |

#### 1.2 Base de donnees

**Nouvelle table: `delivery_notes`**
```sql
CREATE TABLE delivery_notes (
  id BIGSERIAL PRIMARY KEY,
  bl_number TEXT UNIQUE NOT NULL,        -- BL-YYMM-### (auto-genere)
  client_id BIGINT REFERENCES clients(id),
  client_name TEXT,                       -- Denormalise pour performance
  linked_po_id BIGINT REFERENCES purchase_orders(id), -- Lien vers BA
  delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_description TEXT,              -- Notes generales
  status TEXT DEFAULT 'draft',            -- draft, ready_for_signature, signed, pending_send, sent
  is_prix_jobe BOOLEAN DEFAULT FALSE,
  signature_data TEXT,
  signature_timestamp TIMESTAMPTZ,
  client_signature_name TEXT,
  recipient_emails JSONB DEFAULT '[]',
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS obligatoire
ALTER TABLE delivery_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own data" ON delivery_notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own data" ON delivery_notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own data" ON delivery_notes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own data" ON delivery_notes FOR DELETE USING (auth.uid() = user_id);

-- Index
CREATE INDEX idx_delivery_notes_client ON delivery_notes(client_id);
CREATE INDEX idx_delivery_notes_status ON delivery_notes(status);
CREATE INDEX idx_delivery_notes_date ON delivery_notes(delivery_date);
CREATE INDEX idx_delivery_notes_po ON delivery_notes(linked_po_id);
```

**Nouvelle table: `delivery_note_materials`**
```sql
CREATE TABLE delivery_note_materials (
  id BIGSERIAL PRIMARY KEY,
  delivery_note_id BIGINT REFERENCES delivery_notes(id) ON DELETE CASCADE,
  product_id TEXT,                        -- Ref vers products ou non_inventory_items
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'UN',
  unit_price NUMERIC DEFAULT 0,
  show_price BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE delivery_note_materials ENABLE ROW LEVEL SECURITY;
-- Policies via delivery_notes.user_id (join)
CREATE POLICY "Users can manage via delivery_note" ON delivery_note_materials
  FOR ALL USING (
    EXISTS (SELECT 1 FROM delivery_notes dn WHERE dn.id = delivery_note_id AND dn.user_id = auth.uid())
  );
```

**Tables existantes conservees:**
- `delivery_slips` et `delivery_slip_items` restent pour l'ancien modal BA (backward compatible)
- Migration progressive: les nouveaux BL utilisent `delivery_notes`, l'ancien modal reste fonctionnel

#### 1.3 UI - Liste unifiee BT + BL

**Page `/bons-travail` (modifiee):**
```
┌──────────────────────────────────────────────────────────┐
│  [+Nouveau BT]  [+Nouveau BL]                           │
│                                                           │
│  ⚠️ 2 BA sans commande AF (bandeau alerte, clicable)     │
│                                                           │
│  Filtre type: [Tous] [BT seulement] [BL seulement]      │
│                                                           │
│  Tous (87) | ✏️ Brouillon (3) | ✍️ A signer (1)          │
│  | ✅ Signe (0) | ⏳ En attente (0) | 📧 Envoye (83)    │
│                                                           │
│  📋 BT-2602-005 - Client ABC - 07 fev 2026              │
│  📦 BL-2602-003 - Client XYZ - 06 fev 2026              │
│  📋 BT-2602-004 - Client DEF - 05 fev 2026              │
│  ...                                                      │
└──────────────────────────────────────────────────────────┘
```

- Icone 📋 pour BT, 📦 pour BL (distinction visuelle rapide)
- Tri chronologique mixte BT + BL
- Le filtre type permet de voir seulement BT ou BL
- Les compteurs de statut comptent BT + BL (ou filtres selon le type selectionne)
- Bandeau alertes en haut: BA orphelins (sans AF), AF recus sans livraison

#### 1.4 Routes et Pages

```
/bons-travail                         → Liste unifiee BT + BL (modifiee)
/bons-travail/nouveau                 → Nouveau BT (existant, inchange)
/bons-travail/nouveau-bl              → Nouveau BL (NOUVEAU)
/bons-travail/[id]/modifier           → Modifier BT (existant, inchange)
/bons-travail/bl/[id]/modifier        → Modifier BL (NOUVEAU)
/bons-travail/bl/[id]/client          → Signature client BL (NOUVEAU, page publique)
```

#### 1.5 Composants

```
components/
├── work-orders/
│   ├── WorkOrderForm.js              (existant - INCHANGE)
│   ├── TimeTracker.js                (existant - INCHANGE)
│   └── MaterialSelector.js           (existant - reutilise par BL)
├── delivery-notes/                    (NOUVEAU dossier)
│   ├── DeliveryNoteForm.js           (formulaire BL, plus simple que WorkOrderForm)
│   │   ├── Selection client (ClientSelect reutilise)
│   │   ├── Lien BA optionnel
│   │   ├── Date de livraison
│   │   ├── Import materiaux depuis BA / soumission
│   │   ├── Ajout materiaux inventaire / non-inventaire
│   │   ├── Description/notes
│   │   └── Pas de TimeTracker (pas de time entries)
│   └── DeliveryNotePDF.js            (generation PDF specifique BL)
```

#### 1.6 API Endpoints

```
/api/delivery-notes                    → GET (liste) + POST (creation)
/api/delivery-notes/[id]              → GET + PUT + DELETE
/api/delivery-notes/[id]/signature     → GET + POST (signature client)
/api/delivery-notes/[id]/send-email    → POST (envoi email + PDF + inventaire OUT)
/api/delivery-notes/[id]/public        → GET (vue publique pour signature)
```

#### 1.7 Import materiaux dans BL

Le formulaire BL offre 3 sources de materiaux:

1. **Import depuis BA** (principal)
   - Charge les `client_po_items` du BA lie
   - Affiche: quantite commandee, deja livree, restante
   - L'utilisateur selectionne les items et quantites a livrer
   - Met a jour `client_po_items.delivered_quantity` a l'envoi

2. **Import depuis Soumission**
   - Meme mecanisme que dans AF (`fetchAvailableSubmissions`)
   - Filtre par client

3. **Ajout manuel**
   - Produit inventaire (recherche dans `products`)
   - Produit non-inventaire (recherche dans `non_inventory_items`)
   - Nouveau produit ponctuel

#### 1.8 Flux inventaire BL

```
BL creation  → Aucun impact inventaire (brouillon)
BL signature → Aucun impact inventaire
BL envoi email → Pour chaque materiau:
  ├── quantity > 0: stock_qty -= quantity (mouvement OUT)
  ├── quantity < 0: stock_qty += |quantity| (retour, mouvement IN)
  └── Cree un record dans inventory_movements:
      {movement_type: 'OUT'/'IN', reference_type: 'delivery_note', reference_id: bl.id}
```

**Pattern identique au BT** (voir `send-email/route.js` lignes 175-245).

#### 1.9 PDF Bon de Livraison

Format adapte (different du BT):
- En-tete: Logo + info entreprise + "BON DE LIVRAISON" (titre)
- Reference: BL-YYMM-### + date + BA lie (si applicable)
- Info client: nom, adresse
- Tableau materiaux: Code | Description | Unite | Qte Commandee | Qte Livree
- Pas de colonne heures/temps
- Section signature client
- Footer: 2 copies (client + entreprise)

#### 1.10 Bandeau alertes (mini-dashboard)

En haut de la liste `/bons-travail`, affichage conditionnel:

```javascript
// Requete: BA sans AF lie
const orphanBAs = await supabase
  .from('purchase_orders')
  .select('id, po_number, client_name')
  .eq('status', 'in_progress')
  .is('linked_af_count', null);  // ou requete custom

// Requete: AF recus sans BL
const receivedWithoutDelivery = await supabase
  .from('supplier_purchases')
  .select('id, purchase_number')
  .eq('status', 'received');
```

Affichage:
- "⚠️ X BA en cours sans commande fournisseur" → clic ouvre liste filtree
- "📦 X commandes recues a livrer" → rappel des AF recus
- Masquable par l'utilisateur (localStorage)
- Ne s'affiche que si > 0

#### 1.11 Migration de l'ancien modal DeliverySlipModal

L'ancien `DeliverySlipModal.js` dans BA:
- **Phase 1**: Garder fonctionnel (backward compatible)
- **Phase 2**: Ajouter un lien "Creer un BL complet" qui redirige vers `/bons-travail/nouveau-bl?po_id=XXX`
- **Phase 3**: Deprecier l'ancien modal une fois le BL stabilise

#### 1.12 Considerations techniques

- **Mobile first**: Le BL est utilise a 95% sur tablette comme le BT
- **Touch targets**: Minimum 44px sur tous les boutons/inputs du BL
- **Offline**: Considerer un mode offline basique (localStorage draft) pour les chantiers sans connexion
- **Performance**: Lazy load des materiaux BA/soumission (ne pas charger au mount)
- **Email**: Meme pattern que BT (client + CC bureau), avec PDF BL attache

### 2. TimeTracker - Tarifs soirs/fins de semaine/jours feries (Priorite: Haute - demande utilisateur)

**Demande (2026-02-07):** Gerer les surcharges horaires pour le travail en dehors des heures normales.

**Regles de l'entreprise Services TMT:**

| Situation | Minimum | Taux | Mention sur BT |
|-----------|---------|------|----------------|
| Lundi-Vendredi jour | 1h | 1x (normal) | - |
| **Soir** (debut apres 17h, nouvelle job seulement) | **2h** | **1.5x** | "Soir" |
| **Samedi** | **3h** | **1.5x** | "Samedi" |
| **Dimanche** | **3h** | **1.5x** | "Dimanche" |
| **Jour ferie** (Quebec) | **3h** | **1.5x** | "Jour ferie" |

**IMPORTANT - Regle du soir:**
- S'applique UNIQUEMENT si la job **debute** apres 17h
- Ne s'applique PAS si c'est la continuation d'un travail de jour qui depasse 17h
- Exemple: 14:00-18:30 = normal (continuité de jour)
- Exemple: 18:00-20:00 = soir (nouvelle job, minimum 2h a 1.5x)

**Exemple concret (samedi 2026-02-07):**
- Actuel incorrect: `08:24 → 10:32 = 2h30 (arrondi quart d'heure)`
- Correct: `08:24 → 10:32 = 3h Samedi (minimum 3h applique)`

#### 2.1 Plan d'implementation

**Etape #1 - Checkbox optionnel dans TimeTracker**
- Ajouter une checkbox "Appliquer tarifs speciaux (soir/weekend/ferie)" par BT
- Par defaut: active (pour ne pas oublier)
- Quand desactive: comportement actuel (arrondi quart d'heure, minimum 1h)
- Stocke dans `work_orders.apply_surcharge` (nouveau champ boolean)

**Etape #2 - Detection automatique du type de surcharge**
```javascript
const getSurchargeType = (date, startTime) => {
  const d = new Date(date);
  const dayOfWeek = d.getDay(); // 0=dimanche, 6=samedi

  // Verifier jour ferie Quebec
  if (isQuebecHoliday(date)) return 'holiday';  // "Jour ferie"

  // Verifier fin de semaine
  if (dayOfWeek === 0) return 'sunday';   // "Dimanche"
  if (dayOfWeek === 6) return 'saturday'; // "Samedi"

  // Verifier soir (debut >= 17:00, pas de session precedente ce jour)
  const [h] = startTime.split(':').map(Number);
  if (h >= 17) return 'evening'; // "Soir"

  return 'normal'; // Pas de surcharge
};
```

**Etape #3 - Application des minimums**
```javascript
const applyMinimum = (hours, surchargeType) => {
  switch (surchargeType) {
    case 'saturday':
    case 'sunday':
    case 'holiday':
      return Math.max(hours, 3.0);  // Minimum 3h
    case 'evening':
      return Math.max(hours, 2.0);  // Minimum 2h
    default:
      return Math.max(hours, 1.0);  // Minimum 1h (existant)
  }
};
```

**Etape #4 - Modification du time_entry**
```javascript
// Nouveau format time_entry avec surcharge
{
  date: "2026-02-07",
  start_time: "08:24",
  end_time: "10:32",
  pause_minutes: 0,
  actual_hours: 2.25,          // Heures reelles (arrondi quart heure)
  total_hours: 3.0,            // Heures facturees (avec minimum applique)
  surcharge_type: "saturday",  // NOUVEAU: null, 'evening', 'saturday', 'sunday', 'holiday'
  surcharge_rate: 1.5,         // NOUVEAU: 1.0 ou 1.5
  include_travel: true,
  include_transport_fee: false
}
```

**Etape #5 - Affichage dans TimeTracker**
- Badge colore a cote des heures: "Samedi" (orange), "Dimanche" (rouge), "Soir" (bleu), "Jour ferie" (violet)
- Affichage: `3h Samedi` au lieu de `2h30`
- Si l'utilisateur desactive la checkbox, revient a `2h30` normal

**Etape #6 - Affichage PDF**
- Dans le tableau des heures: colonne "Mention" avec le badge
- Ou: mention entre parentheses apres les heures
- Exemple: `08:24 - 10:32 | 3h (Samedi - min. 3h)`

#### 2.2 Jours feries Quebec

Liste des jours feries a verifier dynamiquement:

| Jour ferie | Date | Calcul |
|------------|------|--------|
| Jour de l'An | 1er janvier | Fixe |
| Vendredi Saint ou Lundi de Paques | Variable | Calcul Paques |
| Journee des Patriotes | Lundi precedant le 25 mai | Calcul |
| Fete nationale (St-Jean) | 24 juin | Fixe |
| Fete du Canada | 1er juillet | Fixe |
| Fete du Travail | 1er lundi de septembre | Calcul |
| Action de Grace | 2e lundi d'octobre | Calcul |
| Noel | 25 decembre | Fixe |

```javascript
// Fonction utilitaire a creer dans lib/utils/holidays.js
const getQuebecHolidays = (year) => {
  const holidays = [];
  holidays.push(new Date(year, 0, 1));   // Jour de l'An
  // ... calcul Paques (algorithme de Gauss)
  holidays.push(new Date(year, 5, 24));  // St-Jean
  holidays.push(new Date(year, 6, 1));   // Fete du Canada
  // ... Fete du Travail (1er lundi sept)
  // ... Action de Grace (2e lundi oct)
  holidays.push(new Date(year, 11, 25)); // Noel
  return holidays;
};
```

#### 2.3 Impact sur les fichiers existants

| Fichier | Modification |
|---------|-------------|
| `components/work-orders/TimeTracker.js` | Checkbox surcharge, detection auto, affichage badges |
| `lib/services/email-service.js` | Affichage mention surcharge dans PDF |
| `work_orders` table | Nouveau champ `apply_surcharge` (boolean) |
| `lib/utils/holidays.js` | NOUVEAU - fonction jours feries Quebec |

---

### 3. BCC - Bon de Confirmation de Commande Client (Priorite: Haute - demande utilisateur)

**Demande (2026-02-07):** Envoyer au client une confirmation que le materiel demande par son BA est bien en commande.

**Contexte:**
Quand un client envoie un BA, Martin cree un ou plusieurs AF pour commander le materiel. Le client n'a actuellement aucune visibilite sur l'etat de sa commande. Le BCC permet de lui envoyer un recapitulatif.

#### 3.1 Contenu du BCC

**Tableau principal:**

| Colonne | Description | Source |
|---------|-------------|--------|
| Code | Code produit | `products.product_id` |
| Description | Description item | `products.description` |
| Qte Cmd | Quantite commandee par le client | BA items |
| Prix unitaire | Prix de vente | `selling_price` |
| Prix ligne | Qte x Prix unitaire | Calcule |
| Qte B/O | Backorder (commande mais pas encore recu) | AF items - received |
| Qte Livree | Deja livree au client | `delivered_quantity` via BL |
| Delai livraison | Estimation par item | Saisie manuelle |

**Resume financier:**
- Sous-total
- TPS (5%)
- TVQ (9.975%)
- Total

#### 3.2 Sources d'items pour le BCC

1. **Import depuis inventaire** (produits en main)
   - Recherche dans `products` et `non_inventory_items`
   - Ajout direct avec quantite et prix

2. **Import depuis AF** (achats fournisseurs)
   - Selectionner un ou plusieurs AF lies au meme BA
   - Importer les items avec les quantites commandees
   - Recuperer automatiquement les quantites recues vs en attente

#### 3.3 Architecture technique

**Option A - Module dans BA (recommande):**
- Bouton "Envoyer confirmation" dans le detail du BA
- Modal ou page dedie pour composer le BCC
- Pas de nouvelle table: le BCC est un "snapshot" genere a la volee

**Option B - Nouveau document:**
- Nouvelle table `order_confirmations`
- Workflow similaire au BL (brouillon, envoye)
- Plus de tracabilite mais plus complexe

**Recommandation:** Option A est plus rapide. Si besoin d'historique, migrer vers Option B plus tard.

#### 3.4 Generation et envoi

- PDF genere avec jsPDF (meme pattern que BT/BL)
- En-tete standardise (voir section 5 - Standardisation PDF)
- Titre: "CONFIRMATION DE COMMANDE"
- Reference: BA numero + date
- Envoi par email au client (Resend, meme pattern)
- CC bureau (info.servicestmt@gmail.com)

#### 3.5 Plan d'implementation

**Etape #1 - Formulaire BCC dans BA**
- Bouton "Confirmation commande" dans `PurchaseOrderModal.js`
- Modal avec liste d'items provenant du BA + AF lies
- Champs editables: delai livraison, notes par item

**Etape #2 - Import depuis AF**
- Charger les AF lies au BA (`linked_po_id`)
- Croiser items AF vs items BA
- Calculer B/O: qte commandee AF - qte recue

**Etape #3 - PDF BCC**
- En-tete standardise
- Tableau avec les colonnes decrites en 3.1
- Resume taxes TPS/TVQ
- Footer avec conditions

**Etape #4 - Envoi email**
- Endpoint API: `/api/purchase-orders/[id]/send-confirmation`
- Selection destinataires (contacts client)
- PDF en piece jointe

---

### 4. Standardisation des formulaires PDF (Priorite: Moyenne - demande utilisateur)

**Demande (2026-02-07):** Uniformiser l'en-tete et la presentation de tous les PDFs.

**Etat actuel:**

| Document | Methode | En-tete | Style |
|----------|---------|---------|-------|
| BT (Bon de Travail) | jsPDF | Logo + titre + ref | Professionnel |
| BL (ancien modal) | HTML + print | Logo + titre + ref | Correct mais different |
| Soumission | HTML + print | Basique | Minimal |
| AF (Achat Fournisseur) | HTML + print | Logo + titre | Correct |
| BCC (nouveau) | jsPDF (a creer) | A definir | - |

#### 4.1 En-tete standardise (commun a tous les documents)

```
┌──────────────────────────────────────────────────────┐
│  [LOGO]              SERVICES TMT INC.               │
│                 3195 42e Rue Nord                     │
│             Saint-Georges, QC G5Z 0V9                │
│               Tel: (418) 225-3875                    │
│         info.servicestmt@gmail.com                   │
│──────────────────────────────────────────────────────│
│  [TITRE DU DOCUMENT]            No: XX-YYMM-###     │
│  Date: JJ MMM YYYY              Ref BA: PO-XXXX     │
│  Client: Nom du client                               │
│  Adresse: Adresse complete                           │
└──────────────────────────────────────────────────────┘
```

#### 4.2 Documents concernes

| Document | Titre PDF | Numero | Particularites corps |
|----------|-----------|--------|---------------------|
| **BT** | BON DE TRAVAIL | BT-YYMM-### | Heures + materiaux + description |
| **BL** | BON DE LIVRAISON | BL-YYMM-### | Materiaux livres (qte cmd vs qte livree) |
| **BCC** | CONFIRMATION DE COMMANDE | BCC-YYMM-### (ou ref BA) | Items + B/O + delai + taxes |
| **Soumission** | SOUMISSION | YYMM-### | Items + prix + taxes |
| **AF** | BON DE COMMANDE FOURNISSEUR | AF-YYMM-### | Items commandes au fournisseur |

**Note:** Le BT a un corps tres different (heures, description travail) - l'en-tete sera standardise mais le corps reste specifique. A discuter pour les details.

#### 4.3 Approche technique recommandee

**Option A - Migrer tout vers jsPDF (recommande):**
- Creer un module partage `lib/services/pdf-common.js` avec:
  - `addStandardHeader(doc, title, docNumber, date, client)`
  - `addStandardFooter(doc, pageNumber, totalPages)`
  - Constantes: couleurs, polices, marges
- Chaque document specialise son corps
- Plus de controle sur le rendu

**Option B - Template HTML unifie:**
- Template HTML partage pour l'en-tete
- Chaque document injecte son contenu
- Moins de controle, depend du navigateur

#### 4.4 Plan d'implementation

**Etape #1 - Creer module partage**
- `lib/services/pdf-common.js` avec fonctions d'en-tete/footer standardisees
- Extraire la logique d'en-tete existante de `email-service.js`

**Etape #2 - Migrer BT vers le module partage**
- Refactorer `email-service.js` pour utiliser `pdf-common.js`
- Verifier que le PDF BT reste identique visuellement

**Etape #3 - Creer PDF BL avec module partage**
- Le nouveau BL utilise directement `pdf-common.js`
- Plus besoin de HTML+print

**Etape #4 - Migrer Soumission et AF**
- Remplacer HTML+print par jsPDF + module partage
- Adapter le corps de chaque document

---

### 5. Changement automatique de statut des soumissions (Priorite: Haute - demande utilisateur)

**Demande (2026-02-07):** Quand un BA est associe a une soumission, le statut de la soumission doit changer automatiquement.

**Situation actuelle:**
- Statuts soumission: `draft`, `accepted`, `rejected`
- Le lien BA ↔ soumission est via `purchase_orders.submission_no` (texte)
- L'import de soumission dans un BA importe TOUS les items (pas de selection)
- Le statut soumission ne change pas automatiquement
- Pas de reference croisee BA dans la soumission

#### 5.1 Changements demandes

1. **Import partiel**: Pouvoir selectionner SEULEMENT certains items de la soumission
2. **Changement auto de statut**: Soumission → "Acceptee" apres import dans un BA
3. **Reference croisee**: Voir le numero de BA dans le formulaire soumission

#### 5.2 Plan d'implementation

**Etape #1 - Import partiel des items de soumission dans BA**

Modifier le modal d'import de soumission dans BA:
- Afficher tous les items de la soumission avec checkboxes
- L'utilisateur coche les items a importer
- Champ quantite modifiable par item (import partiel de quantite aussi)
- Bouton "Importer les items selectionnes"

```javascript
// Modal d'import ameliore
items.map(item => ({
  ...item,
  selected: false,        // Checkbox
  import_quantity: item.quantity  // Quantite a importer (modifiable)
}))
```

**Etape #2 - Changement automatique du statut soumission**

Apres l'import dans un BA:
```javascript
// Apres import reussi des items
await supabase
  .from('submissions')
  .update({ status: 'accepted' })
  .eq('submission_number', submissionNumber);
```

**Quand changer le statut:**
- Des qu'au moins 1 item est importe → statut = "accepted"
- Optionnel: statut "partially_accepted" si seulement certains items importes

**Etape #3 - Reference croisee BA dans la soumission**

**Nouveau champ dans la table `submissions`:**
```sql
ALTER TABLE submissions ADD COLUMN linked_po_numbers TEXT[];
-- Ou JSONB: ["PO-2026-001", "PO-2026-003"]
```

**Affichage dans SoumissionsManager.js:**
- Nouveau champ en lecture seule: "BA associe(s): PO-2026-001"
- Clicable pour naviguer vers le BA
- Rempli automatiquement lors de l'import

```javascript
// Lors de l'import dans BA
await supabase
  .from('submissions')
  .update({
    status: 'accepted',
    linked_po_numbers: [...existing, poNumber]
  })
  .eq('submission_number', submissionNumber);
```

#### 5.3 Impact sur les fichiers existants

| Fichier | Modification |
|---------|-------------|
| `components/PurchaseOrderModal.js` | Modal import avec selection partielle |
| `components/SoumissionsManager.js` | Afficher BA associe(s), lien clicable |
| `submissions` table | Nouveau champ `linked_po_numbers` (JSONB ou TEXT[]) |
| `components/SupplierPurchaseHooks.js` | Mise a jour du import dans AF aussi |

---

### 6. Simplification Prix Jobe (Priorite: Haute - demande utilisateur)

**Probleme actuel:** Le workflow Prix Jobe est complexe et genere deux PDFs differents.

**Propositions:**

**Option A - Checkbox simple:**
- Ajouter une checkbox "Masquer details au client" sur le BT
- Un seul email, le PDF client est simplifie
- Le PDF complet reste accessible dans l'app

**Option B - Mode "Forfait":**
- Nouveau type de BT: "Forfait"
- Interface simplifiee: juste titre + montant forfaitaire
- Pas de suivi temps/materiaux (ou optionnel en interne)
- PDF minimaliste pour le client

**Recommandation:** Option A est plus simple a implementer et garde la flexibilite.

### 7. Systeme de Restauration (Priorite: Moyenne)

**Etat actuel:** L'endpoint `/api/admin/restore` existe mais n'a jamais ete teste.

**Recommandations:**
1. **Tester le restore** sur un environnement de test
2. **Creer une page admin** `/admin/backup` avec:
   - Liste des backups disponibles
   - Bouton "Restaurer" avec confirmation
   - Log des restaurations

3. **Ameliorer le backup:**
   - Stocker les backups dans Supabase Storage (pas juste email)
   - Retention: garder 30 jours de backups
   - Verification d'integrite

### 8. Dashboard/Tableau de Bord (Priorite: Moyenne)

**Decision (2026-02-07):** Integrer un mini-dashboard (bandeau alertes) dans la page BT/BL plutot qu'une page separee.

**Elements integres dans la liste BT/BL:**
- BA en cours sans commande AF (orphelins)
- AF recus sans livraison (materiel en attente)
- BT/BL en brouillon depuis longtemps

**Dashboard complet (futur, si besoin):**
- Page d'accueil avec raccourcis: +Nouveau BT, +Nouveau BL, +Nouveau BA
- BT/BL en cours (non signes)
- AF en attente de reception
- Alertes stock bas
- Statistiques du mois (heures, revenus)

---

## Securite

### Points OK
- Authentification Supabase fonctionnelle
- Middleware de protection des routes
- Client admin separe pour server-side

### A Verifier/Ameliorer

1. **RLS Supabase:** Verifier que les Row Level Security policies sont actives sur toutes les tables.

2. **Validation des entrees:** Ajouter une validation cote serveur pour:
   - Emails (format valide)
   - Numeros de telephone
   - Montants (nombres positifs)

3. **CRON_SECRET:** S'assurer que ce secret est different en production et dev.

---

## Performance

### Optimisations Suggérées

1. **Pagination:** Ajouter de la pagination pour les listes longues (BT, BA, AF)

2. **Indexes BD:** Verifier que les colonnes frequemment recherchees ont des indexes:
   - `work_orders.client_id`
   - `work_orders.status`
   - `work_orders.work_date`
   - `purchase_orders.client_id`

3. **Cache logo:** Le logo est deja cache en base64 au demarrage - c'est bien.

4. **Lazy loading:** Pour les listes avec beaucoup d'items, considerer le virtual scrolling.

---

## Tests

### Etat Actuel
Pas de tests automatises detectes.

### Recommandations

1. **Tests Critiques a Ajouter:**
   - Generation PDF (format correct, logo present)
   - Calcul arrondi quart d'heure
   - Envoi email (mock Resend)
   - Workflow signature

2. **Outils Suggeres:**
   - Jest + React Testing Library pour les composants
   - Playwright pour les tests E2E (workflow BT complet)

---

## Plan d'Action Suggere

### Phase 1 - Corrections Immediates ✅ COMPLETE (2026-02-07)
- [x] Supprimer le code duplique `formatQuebecDateTime`
- [x] Clarifier la terminologie BA/AF dans l'interface ("Nouvel Achat Fourn.")
- [x] Synchroniser champs redondants client_name/supplier_name
- [x] Corriger bug `COMPANY_EMAIL` dans send-inventory-report
- [x] Supprimer code duplique dans work-orders GET (double error check + double return)
- [x] Standardiser `ok: true` → `success: true` dans save-client
- [ ] Tester manuellement `/api/admin/restore`
- [ ] Documenter les resultats du test restore

### Phase 2 - Ameliorations Court Terme (1-2 semaines)
- [ ] Simplifier le workflow Prix Jobe (Option A)
- [ ] Ajouter validation emails cotes serveur
- [ ] Standardiser gestion erreurs API pour routes retournant arrays bruts (purchase-orders, clients, products)

### Phase 3 - Bon de Livraison (BL) - Fonctionnalite principale (Section 1)
- [ ] Creer table `delivery_notes` + `delivery_note_materials` (SQL + RLS)
- [ ] Creer API CRUD `/api/delivery-notes` + `/api/delivery-notes/[id]`
- [ ] Creer composant `DeliveryNoteForm.js` (formulaire BL)
- [ ] Integrer import materiaux depuis BA (client_po_items)
- [ ] Integrer import materiaux depuis soumission
- [ ] Modifier la page liste `/bons-travail` (bouton +Nouveau BL, filtre type, icones)
- [ ] Creer pages: `/bons-travail/nouveau-bl`, `/bons-travail/bl/[id]/modifier`
- [ ] Creer API signature: `/api/delivery-notes/[id]/signature`
- [ ] Creer page publique signature: `/bons-travail/bl/[id]/client`
- [ ] Creer API envoi email + PDF + inventaire OUT: `/api/delivery-notes/[id]/send-email`
- [ ] Generer PDF bon de livraison (format specifique BL)
- [ ] Ajouter bandeau alertes (BA orphelins, AF recus sans livraison)
- [ ] Tester sur tablette et mobile (responsive critique)

### Phase 4 - TimeTracker surcharges (Section 2)
- [ ] #1: Ajouter checkbox "Appliquer tarifs speciaux" dans TimeTracker
- [ ] #2: Creer `lib/utils/holidays.js` (jours feries Quebec)
- [ ] #3: Implementer detection auto (samedi/dimanche/soir/ferie)
- [ ] #4: Appliquer minimums (3h weekend/ferie, 2h soir)
- [ ] #5: Afficher badges dans TimeTracker (Samedi, Dimanche, Soir, Jour ferie)
- [ ] #6: Mettre a jour le PDF BT pour afficher les mentions de surcharge

### Phase 5 - Statut soumissions + import partiel (Section 5)
- [ ] #1: Modal import soumission avec selection partielle (checkboxes par item)
- [ ] #2: Changement auto statut soumission → "Acceptee" apres import
- [ ] #3: Ajouter champ `linked_po_numbers` dans table `submissions`
- [ ] #4: Afficher BA associe(s) dans le formulaire soumission

### Phase 6 - BCC Confirmation de commande client (Section 3)
- [ ] #1: Bouton "Confirmation commande" dans PurchaseOrderModal
- [ ] #2: Modal/formulaire BCC avec import items depuis BA + AF
- [ ] #3: Calcul B/O, qte livree, delai par item
- [ ] #4: Generation PDF BCC (en-tete standardise)
- [ ] #5: API envoi email confirmation au client

### Phase 7 - Standardisation PDF (Section 4)
- [ ] #1: Creer module partage `lib/services/pdf-common.js`
- [ ] #2: Migrer BT pour utiliser le module partage (en-tete)
- [ ] #3: Creer PDF BL avec module partage
- [ ] #4: Creer PDF BCC avec module partage
- [ ] #5: Migrer Soumission HTML→jsPDF
- [ ] #6: Migrer AF HTML→jsPDF

### Phase 8 - Ameliorations post
- [ ] Deprecier l'ancien modal `DeliverySlipModal.js` dans BA
- [ ] Page admin backup/restore
- [ ] Dashboard complet (si le bandeau alertes ne suffit pas)

### Phase 9 - Qualite Long Terme (ongoing)
- [ ] Migration progressive vers TypeScript
- [ ] Ajout de tests automatises
- [ ] Documentation API (Swagger/OpenAPI)

---

## Reponses de l'Utilisateur (2026-02-05)

### 1. Stockage backups
**Reponse:** Email (garder le systeme actuel)

### 2. Multi-utilisateurs
**Reponse:** Oui, prevu a l'avenir

**Impact:** Necessitera:
- Systeme de permissions/roles (admin, technicien, bureau)
- RLS Supabase par utilisateur
- Audit trail (qui a modifie quoi)

### 3. Usage Mobile vs Desktop

| Module | Desktop | Mobile | Details Mobile |
|--------|---------|--------|----------------|
| Clients | 20% | 80% | - |
| Soumissions | 95% | 5% | - |
| Inventaire | 95% | 5% | - |
| Achats (AF) | 95% | 5% | - |
| **Bons de Travail** | **5%** | **95%** | 75% Tablette, 25% Pixel 8 |
| Gestion Client | 50% | 50% | - |

**Impact:** Le module **Bons de Travail est critique pour mobile/tablette**.
Priorite a l'optimisation responsive pour:
- WorkOrderForm.js
- TimeTracker.js
- MaterialSelector.js
- Page signature client

### 4. Rapports
**Reponse:**
- Rapport Achats: OK
- Rapport hebdomadaire: A modifier

**Action:** Revoir le format du rapport hebdomadaire dans une future session.

### 5. Historique
**Reponse:** Garder tout l'historique si possible

**Impact:**
- Pas de purge automatique
- Prevoir archivage si volume important (>10 000 BT)
- Pagination obligatoire pour les listes

---

## Prochaines Actions Prioritaires

Basees sur les reponses et decisions (2026-02-07):

1. **Bon de Livraison (BL) integre dans BT** - Phase 3 (decision 2026-02-07, Option A)
2. **TimeTracker surcharges soir/weekend/ferie** - Phase 4 (demande 2026-02-07)
3. **Statut soumissions + import partiel** - Phase 5 (demande 2026-02-07)
4. **BCC Confirmation de commande client** - Phase 6 (demande 2026-02-07)
5. **Standardisation PDF** - Phase 7 (demande 2026-02-07)
6. **Optimisation mobile BT/BL** - Continue (95% mobile)
7. **Systeme permissions** - Futur (multi-utilisateurs)
8. **Revoir rapport hebdomadaire** - Futur

---

## Decisions Architecturales

### 2026-02-07 - Bon de Livraison (BL)
- **Decision:** Option A - BL integre dans la page BT
- **Raison:** Martin oublierait les livraisons si BL est sur une page separee
- **Architecture:** Nouvelle table `delivery_notes` + composants separes dans `components/delivery-notes/`
- **UI:** Liste unifiee BT+BL avec filtre type, boutons +Nouveau BT et +Nouveau BL
- **Mini-dashboard:** Bandeau alertes BA orphelins/AF recus integre dans la liste
- **Ancien modal:** `DeliverySlipModal.js` garde fonctionnel, deprecie progressivement

### 2026-02-07 - Nouvelles fonctionnalites demandees
- **TimeTracker surcharges:** Checkbox optionnel, detection auto, minimums 2h/3h, jours feries QC
- **BCC:** Confirmation commande client, integre dans BA, envoi email+PDF
- **PDF standardise:** Module partage `pdf-common.js`, migration progressive vers jsPDF
- **Statut soumissions:** Import partiel, changement auto "Acceptee", reference croisee BA

---

*Document genere le 2026-02-05, mis a jour le 2026-02-07 par Claude AI*
