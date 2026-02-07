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

### 1. Code Duplique (Priorite: Haute)

**Probleme:** Dans `lib/services/email-service.js`, la fonction `formatQuebecDateTime` est definie deux fois (lignes 80-127).

**Solution:**
```javascript
// Supprimer la deuxieme definition (lignes 104-127)
```

### 2. Terminologie Confuse (Priorite: Moyenne)

**Probleme:** Le terme "Bon d'Achat" est utilise pour deux concepts differents:
- BA Bons d'achat Clients (purchase_orders)
- AF  Achats Fournisseurs (supplier_purchases)

**Solution:** Renommer dans l'interface:
- "Bons d'Achat" → "Commandes Client" ou "BA Client"  //Martin t. : Dans la page principal, il est nommé : Clients. Ne pas le changer dans la page!
- Page `/achat-materiels` → garder mais clarifier le titre

### 3. Champs Redondants en BD (Priorite: Basse)

**Probleme:** Plusieurs tables stockent des donnees denormalisees:
- `purchase_orders.client_name` ET `client_id`
- `supplier_purchases.supplier_name` ET `supplier_id`

**Impact:** Risque d'inconsistance si le nom client change.

**Solution:** Garder les deux pour la performance mais s'assurer de les synchroniser lors des updates.

### 4. Gestion d'Erreurs (Priorite: Moyenne)

**Probleme:** Certains endpoints API ne gèrent pas toutes les erreurs de manière uniforme.

**Solution:** Standardiser les reponses d'erreur:
```javascript
// Pattern recommande
return NextResponse.json(
  { success: false, error: 'Message explicite' },
  { status: 400 }
);
```

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

### 2. Simplification Prix Jobe (Priorite: Haute - demande utilisateur)

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

### 3. Systeme de Restauration (Priorite: Moyenne)

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

### 4. Dashboard/Tableau de Bord (Priorite: Moyenne)

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

### Phase 1 - Corrections Immediates (1-2 jours)
- [ ] Supprimer le code duplique `formatQuebecDateTime`
- [ ] Tester manuellement `/api/admin/restore`
- [ ] Documenter les resultats du test restore

### Phase 2 - Ameliorations Court Terme (1-2 semaines)
- [ ] Simplifier le workflow Prix Jobe (Option A)
- [ ] Ajouter validation emails cotes serveur
- [ ] Clarifier la terminologie BA/AF dans l'interface

### Phase 3 - Bon de Livraison (BL) - Fonctionnalite principale
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

### Phase 4 - Ameliorations post-BL
- [ ] Deprecier l'ancien modal `DeliverySlipModal.js` dans BA
- [ ] Page admin backup/restore
- [ ] Dashboard complet (si le bandeau alertes ne suffit pas)

### Phase 5 - Qualite Long Terme (ongoing)
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

Basees sur les reponses et decisions:

1. **Bon de Livraison (BL) integre dans BT** - Priorite #1 (decision 2026-02-07, Option A)
2. **Optimisation mobile BT/BL** - Le module est utilise a 95% sur mobile
3. **Systeme permissions** - Preparer pour multi-utilisateurs
4. **Revoir rapport hebdomadaire** - Format actuel pas satisfaisant

---

## Decisions Architecturales

### 2026-02-07 - Bon de Livraison (BL)
- **Decision:** Option A - BL integre dans la page BT
- **Raison:** Martin oublierait les livraisons si BL est sur une page separee
- **Architecture:** Nouvelle table `delivery_notes` + composants separes dans `components/delivery-notes/`
- **UI:** Liste unifiee BT+BL avec filtre type, boutons +Nouveau BT et +Nouveau BL
- **Mini-dashboard:** Bandeau alertes BA orphelins/AF recus integre dans la liste
- **Ancien modal:** `DeliverySlipModal.js` garde fonctionnel, deprecie progressivement

---

*Document genere le 2026-02-05, mis a jour le 2026-02-07 par Claude AI*
