import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const { backupData, selectedTables } = await request.json();

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const details: string[] = [];
    const restored: string[] = [];

    // 1. CRÉER UN BACKUP DE SÉCURITÉ AVANT DE RESTAURER
    const safetyBackup: any = {
      date: new Date().toISOString(),
      project: 'Services TMT - Backup avant restauration',
      tables: {}
    };

    for (const tableName of selectedTables) {
      const { data, error } = await supabase
        .from(tableName)
        .select('*');

      if (!error && data) {
        safetyBackup.tables[tableName] = {
          count: data.length,
          data: data
        };
      }
    }

    // Envoyer le backup de sécurité par email
    const safetyBackupJson = JSON.stringify(safetyBackup, null, 2);
    const backupDate = new Date().toISOString().split('T')[0];
    
    await resend.emails.send({
      from: 'Services TMT <noreply@servicestmt.ca>', // Ajuste
      to: 'servicestmt@gmail.com', // Ajuste
      subject: `⚠️ BACKUP DE SÉCURITÉ avant restauration - ${backupDate}`,
      text: `Backup automatique créé AVANT la restauration.

Date: ${safetyBackup.date}
Tables sauvegardées: ${selectedTables.join(', ')}

Ce backup contient les données qui existaient AVANT la restauration.`,
      attachments: [
        {
          filename: `safety-backup-${backupDate}.json`,
          content: Buffer.from(safetyBackupJson).toString('base64'),
        },
      ],
    });

    details.push('✅ Backup de sécurité créé et envoyé par email');

    // 2. RESTAURER LES TABLES SÉLECTIONNÉES
    for (const tableName of selectedTables) {
      const tableData = backupData.tables[tableName];
      
      if (!tableData || !tableData.data || tableData.data.length === 0) {
        details.push(`⚠️ ${tableName}: Aucune donnée à restaurer`);
        continue;
      }

      // Supprimer les données existantes
      const { error: deleteError } = await supabase
        .from(tableName)
        .delete()
        .neq('id', 0); // Supprime tout sauf id=0 (qui n'existe pas)

      if (deleteError) {
        details.push(`❌ ${tableName}: Erreur lors de la suppression - ${deleteError.message}`);
        continue;
      }

      // Insérer les nouvelles données
      const { error: insertError } = await supabase
        .from(tableName)
        .insert(tableData.data);

      if (insertError) {
        details.push(`❌ ${tableName}: Erreur lors de l'insertion - ${insertError.message}`);
      } else {
        details.push(`✅ ${tableName}: ${tableData.count} enregistrements restaurés`);
        restored.push(tableName);
      }
    }

    return NextResponse.json({
      success: true,
      restored,
      details
    });

  } catch (error: any) {
    console.error('Erreur restauration:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
