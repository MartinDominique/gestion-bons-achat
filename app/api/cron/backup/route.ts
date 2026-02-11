import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import pako from 'pako';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(request: Request) {
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
    const tables = [
      'backup_purchase_orders',
      'client_po_items',
      'client_purchase_orders',
      'clients',
      'delivery_slip_items',
      'delivery_slips',
      'non_inventory_items',
      'purchase_order_files',
      'purchase_orders',
      'quote_items',
      'quotes',
      'shipping_addresses',
      'submissions',
      'supplier_documents',
      'supplier_purchases',
      'suppliers',
      'work_order_materials',
      'work_orders'
    ];

    const backup: any = {
      date: new Date().toISOString(),
      project: 'Services TMT',
      tables: {}
    };

    // Récupérer les données de chaque table
    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error(`Erreur sur table ${table}:`, error);
        backup.tables[table] = { error: error.message, count: 0 };
      } else {
        backup.tables[table] = {
          count: data?.length || 0,
          data: data
        };
      }
    }

    // Créer le fichier JSON
    const backupJson = JSON.stringify(backup, null, 2);
    const backupDate = new Date().toISOString().split('T')[0];
    
    // Calculer la taille
    const sizeInMB = (new TextEncoder().encode(backupJson).length / (1024 * 1024)).toFixed(2);

    // Préparer le résumé
    const summary = Object.entries(backup.tables)
      .map(([table, info]: [string, any]) => 
        `${table}: ${info.count} enregistrements${info.error ? ` (ERREUR: ${info.error})` : ''}`
      )
      .join('\n');

    // Compresser le JSON en gzip pour respecter la limite de 40 MB de Resend
    const compressed = pako.gzip(backupJson);
    const compressedSizeMB = (compressed.length / (1024 * 1024)).toFixed(2);

    // Envoyer par email avec Resend
    const { data: emailResult, error: emailError } = await resend.emails.send({
      from: 'Services TMT <noreply@servicestmt.ca>',
      to: 'servicestmt@gmail.com',
      subject: `💾 Backup Services TMT - ${backupDate}`,
      text: `Backup hebdomadaire de la base de données Services TMT

Date: ${backup.date}
Taille originale: ${sizeInMB} MB
Taille compressée: ${compressedSizeMB} MB

Résumé:
${summary}

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
        tables: Object.keys(backup.tables).length,
        size: `${sizeInMB} MB`,
        compressedSize: `${compressedSizeMB} MB`,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      date: backup.date,
      tables: Object.keys(backup.tables).length,
      size: `${sizeInMB} MB`,
      compressedSize: `${compressedSizeMB} MB`,
      summary
    });

  } catch (error: any) {
    console.error('Erreur backup:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
