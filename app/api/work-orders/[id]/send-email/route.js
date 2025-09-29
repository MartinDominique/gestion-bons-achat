// ============================================
// API ROUTE - ENVOI EMAIL BONS DE TRAVAIL
// Fichier: app/api/work-orders/[id]/send-email/route.js
// ============================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { WorkOrderEmailService } from '../../../../../lib/services/email-service.js';

// Client Supabase avec clés service (pour contourner RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================
// POST - ENVOYER EMAIL POUR UN BT SPÉCIFIQUE
// ============================================

export async function POST(request, { params }) {
  try {
    const { id } = params;
    const body = await request.json();
    
    console.log('🚀 Envoi email BT:', id);

    // Validation des données
    if (!id) {
      return NextResponse.json(
        { error: 'ID du bon de travail requis' },
        { status: 400 }
      );
    }

    // Options d'envoi depuis le body
    const {
      clientEmail,
      ccEmails = [],
      customMessage,
      sendToBureau = true
    } = body;

    // 1. Récupérer le bon de travail complet
    const { data: workOrder, error: fetchError } = await supabaseAdmin
      .from('work_orders')
      .select(`
        *,
        client:clients(*),
        linked_po:purchase_orders(*),
        materials:work_order_materials(
          *,
          product:products(*)
        )
      `)
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('❌ Erreur récupération BT:', fetchError);
      return NextResponse.json(
        { error: 'Bon de travail introuvable' },
        { status: 404 }
      );
    }

    if (!workOrder) {
      return NextResponse.json(
        { error: 'Bon de travail introuvable' },
        { status: 404 }
      );
    }

    // 2. Vérifications avant envoi
    if (workOrder.status !== 'signed' && workOrder.status !== 'pending_send') {
      return NextResponse.json(
        { error: 'Le bon de travail doit être signé avant envoi' },
        { status: 400 }
      );
    }

    // Email du client
    const emailToSend = clientEmail || workOrder.client.email;
    if (!emailToSend) {
      return NextResponse.json(
        { error: 'Aucune adresse email disponible pour le client' },
        { status: 400 }
      );
    }

    console.log('📧 Email destinataire:', emailToSend);

    // 3. Mettre le statut en "pending_send" si pas déjà fait
    if (workOrder.status !== 'pending_send') {
      await supabaseAdmin
        .from('work_orders')
        .update({ status: 'pending_send' })
        .eq('id', id);
    }

    // 4. Préparer les emails CC
    const finalCcEmails = [...ccEmails];
    if (sendToBureau && process.env.COMPANY_EMAIL) {
      finalCcEmails.push(process.env.COMPANY_EMAIL);
    }

    // 5. Envoyer l'email
    const emailService = new WorkOrderEmailService();
    const result = await emailService.sendWorkOrderEmail(workOrder, {
      clientEmail: emailToSend,
      ccEmails: finalCcEmails,
      customMessage
    });

    if (!result.success) {
      console.error('❌ Erreur envoi email:', result.error);
      return NextResponse.json(
        { error: result.error || 'Erreur lors de l\'envoi' },
        { status: 500 }
      );
    }

    console.log('✅ Email envoyé avec succès:', result.messageId);

    // 6. Mettre à jour le statut en "sent"
    const { error: updateError } = await supabaseAdmin
      .from('work_orders')
      .update({ 
        status: 'sent',
        email_sent_at: new Date().toISOString(),
        email_sent_to: emailToSend,
        email_message_id: result.messageId
      })
      .eq('id', id);

    if (updateError) {
      console.error('⚠️ Erreur mise à jour statut:', updateError);
      // L'email est envoyé mais le statut pas mis à jour - pas critique
    }

    // 7. Réponse de succès
    return NextResponse.json({
      success: true,
      message: 'Email envoyé avec succès',
      messageId: result.messageId,
      sentTo: emailToSend,
      ccEmails: finalCcEmails
    });

  } catch (error) {
    console.error('💥 Erreur API envoi email:', error);
    return NextResponse.json(
      { 
        error: 'Erreur interne du serveur',
        details: error.message || 'Erreur inconnue'
      },
      { status: 500 }
    );
  }
}

// ============================================
// GET - STATUT D'ENVOI D'UN BT
// ============================================

export async function GET(request, { params }) {
  try {
    const { id } = params;

    const { data: workOrder, error } = await supabaseAdmin
      .from('work_orders')
      .select('id, bt_number, status, email_sent_at, email_sent_to, email_message_id')
      .eq('id', id)
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Bon de travail introuvable' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: workOrder.id,
      bt_number: workOrder.bt_number,
      status: workOrder.status,
      emailSent: workOrder.status === 'sent',
      emailSentAt: workOrder.email_sent_at,
      emailSentTo: workOrder.email_sent_to,
      messageId: workOrder.email_message_id
    });

  } catch (error) {
    console.error('💥 Erreur API statut email:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// ============================================
// FONCTION UTILITAIRE POUR ENVOI AUTOMATIQUE
// Utilisez cette fonction si vous voulez l'envoi automatique
// ============================================

export async function autoSendOnSignature(workOrderId) {
  try {
    console.log('🔄 Envoi automatique pour BT:', workOrderId);

    // Récupérer le BT
    const { data: workOrder, error } = await supabaseAdmin
      .from('work_orders')
      .select(`
        *,
        client:clients(*)
      `)
      .eq('id', workOrderId)
      .single();

    if (error || !workOrder) {
      console.error('BT introuvable pour envoi auto:', error);
      return { success: false, error: 'BT introuvable' };
    }

    // Vérifier si le client a un email
    if (!workOrder.client.email) {
      console.log('Pas d\'email client, passage en pending_send');
      await supabaseAdmin
        .from('work_orders')
        .update({ status: 'pending_send' })
        .eq('id', workOrderId);
      
      return { success: false, error: 'Pas d\'email client' };
    }

    // Envoyer automatiquement
    const emailService = new WorkOrderEmailService();
    const result = await emailService.sendWorkOrderEmail(workOrder, {
      sendToBureau: true
    });

    if (result.success) {
      // Mettre à jour le statut
      await supabaseAdmin
        .from('work_orders')
        .update({ 
          status: 'sent',
          email_sent_at: new Date().toISOString(),
          email_sent_to: workOrder.client.email,
          email_message_id: result.messageId
        })
        .eq('id', workOrderId);

      console.log('✅ Envoi automatique réussi');
      return { success: true, messageId: result.messageId };
    } else {
      console.error('❌ Échec envoi automatique:', result.error);
      return { success: false, error: result.error };
    }

  } catch (error) {
    console.error('💥 Erreur envoi automatique:', error);
    return { success: false, error: error.message };
  }
}
