/**
 * @file app/api/cron/backup/route.ts
 * @description Backup quotidien de la base de données Supabase (envoi email gzip via Resend).
 *              - Sauvegarde TOUTES les tables applicatives (voir liste `tables` ci-dessous)
 *              - IMPORTANT: toute nouvelle table Supabase DOIT être ajoutée à `tables`
 *                (voir CLAUDE.md > "Backup base de données")
 *              - Lecture PAGINÉE (1000 lignes par requête) : aucune table n'est coupée au
 *                plafond « max rows » de Supabase
 *              - Colonnes lourdes exclues par table (`EXCLUDED_COLUMNS`) : les PDF joints aux BA
 *                (`purchase_orders.files`, base64) faisaient expirer la requête et saturaient
 *                l'instance gratuite → BA jamais sauvegardés pendant 2 mois
 *              - Vérification d'intégrité : nombre de lignes lues comparé au compte exact
 *              - Une table en erreur ou incomplète ⇒ courriel « INCOMPLET » + HTTP 500 (le workflow
 *                GitHub passe au rouge au lieu d'un faux « succès »)
 *              - Tri par created_at avec repli automatique pour les tables sans cette colonne (ex: settings)
 * @version 3.0.0
 * @date 2026-09-21
 * @changelog
 *   3.0.0 - Pagination (fin de la coupure à 1000 lignes: products, work_order_materials,
 *           inventory_movements), exclusion de purchase_orders.files (fin du « statement timeout »
 *           sur les BA), lecture par lots de 3 tables, contrôle d'intégrité (lu vs compte exact),
 *           échec explicite (HTTP 500 + sujet « INCOMPLET ») si une table manque, maxDuration 300 s
 *   2.2.0 - Ajout de la table product_associations (items associés « As »)
 *   2.1.0 - Ajout de la table items_to_order (liste À Commander)
 *   2.0.0 - Ajout des tables manquantes (products, inventory_movements, delivery_notes,
 *           delivery_note_materials, invoices, invoice_payments, notes, settings,
 *           supplier_purchase_receipts) + tri résilient (repli sans order si created_at absent)
 *   1.0.0 - Version initiale
 */
import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import pako from 'pako';

// Vercel: durée maximale de la fonction (Fluid compute). Le workflow attend jusqu'à 7 min.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const resend = new Resend(process.env.RESEND_API_KEY);

/** Taille d'une page (= plafond « max rows » par défaut de Supabase). */
const PAGE_SIZE = 1000;
/** Nombre de tables lues en parallèle (instance gratuite: rester modeste). */
const CONCURRENCY = 3;

/**
 * Colonnes EXCLUES du backup, par table (trop lourdes pour une lecture complète).
 * - purchase_orders.files : PDF joints aux BA stockés en base64 (jusqu'à 10 Mo chacun).
 *   Leur lecture dépassait le délai Supabase (« canceling statement due to statement timeout »)
 *   et saturait la mémoire de l'instance → la table BA était ABSENTE de chaque backup.
 *   Les PDF ne sont donc pas sauvegardés ici (à migrer vers Supabase Storage).
 */
const EXCLUDED_COLUMNS: Record<string, string[]> = {
  purchase_orders: ['files'],
};

/**
 * Repli si la découverte des colonnes échoue (ex: table vide ou 1re ligne illisible).
 * Colonnes connues de purchase_orders (PurchaseOrderModal / PurchaseOrderManager), sans `files`.
 */
const FALLBACK_COLUMNS: Record<string, string[]> = {
  purchase_orders: [
    'id', 'po_number', 'client_id', 'client_name', 'client_email', 'client_phone',
    'client_address', 'description', 'date', 'delivery_date', 'payment_terms',
    'special_instructions', 'submission_no', 'amount', 'total_amount', 'status',
    'bcc_sent_count', 'created_at', 'updated_at',
  ],
};

type OrderStrategy = 'created_at_id' | 'created_at' | 'id' | 'none';

interface TableResult {
  count: number;           // lignes réellement sauvegardées
  expected: number | null; // compte exact côté serveur (null si indisponible)
  data?: any[];
  error?: string;
  excluded_columns?: string[];
  complete: boolean;       // false si erreur ou count < expected
}

function applyOrder(query: any, strategy: OrderStrategy) {
  switch (strategy) {
    case 'created_at_id':
      return query.order('created_at', { ascending: false }).order('id', { ascending: true });
    case 'created_at':
      return query.order('created_at', { ascending: false });
    case 'id':
      return query.order('id', { ascending: true });
    default:
      return query;
  }
}

/** Découvre les colonnes d'une table (via la 1re ligne) et retire les colonnes exclues. */
async function resolveSelect(supabase: SupabaseClient, table: string): Promise<string> {
  const excluded = EXCLUDED_COLUMNS[table];
  if (!excluded || excluded.length === 0) return '*';

  const { data, error } = await supabase.from(table).select('*').range(0, 0);
  let columns: string[] | null = null;
  if (!error && data && data.length > 0) {
    columns = Object.keys(data[0]);
  } else if (FALLBACK_COLUMNS[table]) {
    columns = FALLBACK_COLUMNS[table];
  }
  if (!columns) return '*';
  const kept = columns.filter((c) => !excluded.includes(c));
  return kept.length > 0 ? kept.join(',') : '*';
}

/** Lit une table au complet, page par page, avec contrôle du nombre de lignes. */
async function fetchTable(supabase: SupabaseClient, table: string): Promise<TableResult> {
  const selectCols = await resolveSelect(supabase, table);
  const excluded = EXCLUDED_COLUMNS[table];
  const strategies: OrderStrategy[] = ['created_at_id', 'created_at', 'id', 'none'];

  let strategy: OrderStrategy | null = null;
  let expected: number | null = null;
  const rows: any[] = [];
  let from = 0;
  let lastError: string | null = null;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    let page: any[] | null = null;

    // 1re page: on trouve la stratégie de tri qui fonctionne + le compte exact
    const candidates = strategy ? [strategy] : strategies;
    for (const s of candidates) {
      const base = supabase
        .from(table)
        .select(selectCols, from === 0 ? { count: 'exact' } : undefined);
      const { data, error, count } = await applyOrder(base, s).range(from, to);
      if (error) {
        lastError = error.message;
        continue;
      }
      strategy = s;
      if (from === 0 && typeof count === 'number') expected = count;
      page = data || [];
      lastError = null;
      break;
    }

    if (page === null) {
      // Toutes les stratégies ont échoué sur cette page
      return {
        count: rows.length,
        expected,
        data: rows.length > 0 ? rows : undefined,
        error: lastError || 'Lecture impossible',
        excluded_columns: excluded,
        complete: false,
      };
    }

    rows.push(...page);
    from += page.length;

    // Fin: page vide, page partielle, ou tout lu selon le compte exact
    if (page.length === 0) break;
    if (expected !== null && from >= expected) break;
    if (expected === null && page.length < PAGE_SIZE) break;
  }

  const complete = expected === null ? true : rows.length >= expected;
  return {
    count: rows.length,
    expected,
    data: rows,
    excluded_columns: excluded,
    complete,
    ...(complete ? {} : { error: `incomplet: ${rows.length}/${expected} lignes lues` }),
  };
}

/** Exécute `worker` sur chaque item avec au plus `limit` exécutions simultanées. */
async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  try {
    // Vérifier l'autorisation
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    // Créer le client Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Liste des tables à sauvegarder
    // ⚠️ IMPORTANT: toute NOUVELLE table Supabase doit être ajoutée ici (voir CLAUDE.md).
    const tables = [
      'backup_purchase_orders',
      'client_po_items',
      'client_purchase_orders',
      'clients',
      'delivery_note_materials',   // BL - matériaux livrés
      'delivery_notes',            // BL - bons de livraison
      'delivery_slip_items',
      'delivery_slips',
      'inventory_movements',       // Mouvements de stock (IN/OUT)
      'items_to_order',            // Liste À Commander (réapprovisionnement)
      'invoice_payments',          // Paiements de factures (état de compte)
      'invoices',                  // Factures
      'non_inventory_items',
      'notes',                     // Système de notes (page d'ouverture)
      'product_associations',      // Items associés (« As »), sens unique parent → enfant
      'products',                  // Inventaire (produits)
      'purchase_order_files',
      'purchase_orders',           // BA clients — colonne `files` (PDF base64) EXCLUE, voir EXCLUDED_COLUMNS
      'quote_items',
      'quotes',
      'settings',                  // Paramètres globaux (singleton id=1, PAS de created_at)
      'shipping_addresses',
      'submissions',
      'supplier_documents',
      'supplier_purchase_receipts',// Réceptions AF (partielles/complètes)
      'supplier_purchases',
      'suppliers',
      'work_order_materials',
      'work_orders'
    ];

    const backup: any = {
      date: new Date().toISOString(),
      project: 'Services TMT',
      version: '3.0.0',
      tables: {}
    };

    // Récupérer les données de chaque table (paginé, quelques tables à la fois)
    const results: Record<string, TableResult> = {};
    await runPool(tables, CONCURRENCY, async (table) => {
      try {
        results[table] = await fetchTable(supabase, table);
      } catch (e: any) {
        results[table] = { count: 0, expected: null, error: e?.message || String(e), complete: false };
      }
      if (results[table].error) {
        console.error(`Erreur sur table ${table}:`, results[table].error);
      }
    });

    // Conserver l'ordre de la liste dans le fichier
    for (const table of tables) {
      const r = results[table];
      backup.tables[table] = {
        count: r.count,
        expected: r.expected,
        complete: r.complete,
        ...(r.excluded_columns ? { excluded_columns: r.excluded_columns } : {}),
        ...(r.error ? { error: r.error } : {}),
        data: r.data || [],
      };
    }

    const problems = tables.filter((t) => !results[t].complete);
    const totalRows = tables.reduce((sum, t) => sum + results[t].count, 0);

    // Créer le fichier JSON
    const backupJson = JSON.stringify(backup, null, 2);
    const backupDate = new Date().toISOString().split('T')[0];

    // Calculer la taille
    const sizeInMB = (new TextEncoder().encode(backupJson).length / (1024 * 1024)).toFixed(2);

    // Préparer le résumé
    const summary = tables
      .map((table) => {
        const r = results[table];
        const parts = [`${table}: ${r.count} enregistrements`];
        if (r.expected !== null && r.expected !== r.count) parts.push(`sur ${r.expected} attendus`);
        if (r.excluded_columns?.length) parts.push(`(colonnes exclues: ${r.excluded_columns.join(', ')})`);
        if (r.error) parts.push(`(ERREUR: ${r.error})`);
        return parts.join(' ');
      })
      .join('\n');

    // Compresser le JSON en gzip pour respecter la limite de 40 MB de Resend
    const compressed = pako.gzip(backupJson);
    const compressedSizeMB = (compressed.length / (1024 * 1024)).toFixed(2);
    const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);

    const incomplete = problems.length > 0;
    const subject = incomplete
      ? `⚠️ Backup Services TMT INCOMPLET - ${backupDate} (${problems.length} table(s) en erreur)`
      : `💾 Backup Services TMT - ${backupDate}`;

    const warning = incomplete
      ? `⚠️ ATTENTION: ce backup est INCOMPLET. Tables en erreur ou partielles:\n  - ${problems.join('\n  - ')}\n\n`
      : '';

    // Envoyer par email avec Resend (même incomplet: un backup partiel vaut mieux qu'aucun)
    const { error: emailError } = await resend.emails.send({
      from: 'Services TMT <noreply@servicestmt.ca>',
      to: 'servicestmt@gmail.com',
      subject,
      text: `Backup quotidien de la base de données Services TMT

${warning}Date: ${backup.date}
Durée: ${durationSec} s
Tables: ${tables.length} — Lignes: ${totalRows}
Taille originale: ${sizeInMB} MB
Taille compressée: ${compressedSizeMB} MB

Résumé:
${summary}

Note: les PDF joints aux BA (purchase_orders.files) ne sont pas inclus (trop volumineux).

Le fichier JSON compressé (gzip) est en pièce jointe.
Pour décompresser: gunzip backup-services-tmt-${backupDate}.json.gz`,
      attachments: [
        {
          filename: `backup-services-tmt-${backupDate}.json.gz`,
          content: Buffer.from(compressed).toString('base64'),
        },
      ],
    });

    if (emailError) {
      console.error('Erreur envoi email backup:', emailError);
      return NextResponse.json({
        success: false,
        error: `Backup OK mais email échoué: ${emailError.message}`,
        tables: tables.length,
        rows: totalRows,
        size: `${sizeInMB} MB`,
        compressedSize: `${compressedSizeMB} MB`,
        duration: `${durationSec} s`,
      }, { status: 500 });
    }

    if (incomplete) {
      // Courriel envoyé, mais le workflow doit passer au rouge: une table manque.
      return NextResponse.json({
        success: false,
        error: `Backup INCOMPLET: ${problems.length} table(s) en erreur ou partielle(s): ${problems.join(', ')}`,
        problems,
        date: backup.date,
        tables: tables.length,
        rows: totalRows,
        size: `${sizeInMB} MB`,
        compressedSize: `${compressedSizeMB} MB`,
        duration: `${durationSec} s`,
        summary
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      date: backup.date,
      tables: tables.length,
      rows: totalRows,
      size: `${sizeInMB} MB`,
      compressedSize: `${compressedSizeMB} MB`,
      duration: `${durationSec} s`,
      summary
    });

  } catch (error: any) {
    console.error('Erreur backup:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
