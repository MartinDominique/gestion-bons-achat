// ============================================
// API ROUTE CORRIGÉE - ENVOI EMAIL BONS DE TRAVAIL
// Fichier: app/api/work-orders/[id]/send-email/route.js
// Structure: id=integer, client_id=integer, user_id=uuid
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
    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json(
        { error: 'ID du bon de travail requis et doit être un nombre' },
        { status: 400 }
      );
    }

    const workOrderId = parseInt(id);

    // Options d'envoi depuis le body
    const {
      clientEmail,
      ccEmails = [],
      customMessage,
      sendToBureau = true
    } = body;

     // 1. Récupérer le bon de travail complet AVEC enrichissement manuel
    const { data: workOrder, error: fetchError } = await supabaseAdmin
      .from('work_orders')
      .select(`
        *,
        client:clients(*),
        linked_po:purchase_orders(*),
        materials:work_order_materials(*)
      `)
      .eq('id', workOrderId)
      .single();

    // Enrichir manuellement les matériaux
    if (!fetchError && workOrder && workOrder.materials) {
      for (let material of workOrder.materials) {
        if (material.product_id) {
          // Essayer products
          const { data: product } = await supabaseAdmin
            .from('products')
            .select('*')
            .eq('product_id', material.product_id)
            .single();
          
          if (product) {
            material.product = product;
          } else {
            // Essayer non_inventory_items
            const { data: nonInvProduct } = await supabaseAdmin
              .from('non_inventory_items')
              .select('*')
              .eq('product_id', material.product_id)
              .single();
            
            if (nonInvProduct) {
              material.product = nonInvProduct;
            }
          }
        }
        
        // Créer un objet virtuel si pas de product trouvé
        if (!material.product && (material.product_code || material.description)) {
          material.product = {
            product_id: material.product_code || material.product_id,
            description: material.description,
            unit: material.unit,
            selling_price: material.unit_price
          };
        }
      }
    }

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
        .eq('id', workOrderId);
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
        email_message_id: result.messageId,
        auto_send_success: true
      })
      .eq('id', workOrderId);

      // 7. Ajouter le PDF au bon d'achat si lié
        if (workOrder.linked_po_id && result.pdfBase64) {
          try {
            // Récupérer les fichiers existants du BA
            const { data: purchaseOrder } = await supabaseAdmin
              .from('purchase_orders')
              .select('files')
              .eq('id', workOrder.linked_po_id)
              .single();
        
            // Préparer le nouveau fichier
            const newFile = {
              id: Date.now(),
              name: `BT-${workOrder.bt_number}.pdf`,
              data: result.pdfBase64
            };
        
            // Combiner avec fichiers existants
            const existingFiles = purchaseOrder?.files || [];
            const updatedFiles = [...existingFiles, newFile];
        
            // Mettre à jour le BA
            await supabaseAdmin
              .from('purchase_orders')
              .update({ files: updatedFiles })
              .eq('id', workOrder.linked_po_id);
        
            console.log('✅ PDF ajouté au BA:', workOrder.linked_po_id);
          } catch (error) {
            console.error('⚠️ Erreur ajout PDF au BA:', error);
            // Non bloquant - l'email est déjà envoyé
          }
        }

    if (updateError) {
      console.error('⚠️ Erreur mise à jour statut:', updateError);
      // L'email est envoyé mais le statut pas mis à jour - pas critique
    }
    
    // 7. Ajouter le PDF au bon d'achat si lié
    if (workOrder.linked_po_id && result.pdfBase64) {
      try {
        // Récupérer les fichiers existants du BA
        const { data: purchaseOrder } = await supabaseAdmin
          .from('purchase_orders')
          .select('files')
          .eq('id', workOrder.linked_po_id)
          .single();
    
        // Préparer le nouveau fichier
        const newFile = {
          id: Date.now(),
          name: `BT-${workOrder.bt_number}.pdf`,
          data: result.pdfBase64
        };
    
        // Combiner avec fichiers existants
        const existingFiles = purchaseOrder?.files || [];
        const updatedFiles = [...existingFiles, newFile];
    
        // Mettre à jour le BA
        await supabaseAdmin
          .from('purchase_orders')
          .update({ files: updatedFiles })
          .eq('id', workOrder.linked_po_id);
    
        console.log('✅ PDF du BT ajouté au BA:', workOrder.linked_po_id);
      } catch (error) {
        console.error('⚠️ Erreur ajout PDF au BA:', error);
        // Non bloquant - l'email est déjà envoyé
      }
    }
    
    // 8. Réponse de succès
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

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json(
        { error: 'ID invalide' },
        { status: 400 }
      );
    }

    const workOrderId = parseInt(id);

    const { data: workOrder, error } = await supabaseAdmin
      .from('work_orders')
      .select('id, bt_number, status, email_sent_at, email_sent_to, email_message_id, auto_send_success')
      .eq('id', workOrderId)
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
      messageId: workOrder.email_message_id,
      autoSendSuccess: workOrder.auto_send_success
    });

  } catch (error) {
    console.error('💥 Erreur API statut email:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
