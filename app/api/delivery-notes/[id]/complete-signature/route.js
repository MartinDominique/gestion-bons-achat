/**
 * @file app/api/delivery-notes/[id]/complete-signature/route.js
 * @description Signature complète + envoi automatique du BL
 * @version 1.0.0
 * @date 2026-02-12
 * @changelog
 *   1.0.0 - Version initiale
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DeliveryNoteEmailService } from '../../../../../lib/services/email-service.js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request, { params }) {
  try {
    const { id } = params;
    const body = await request.json();

    console.log('Signature + envoi auto pour BL:', id);

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json({ error: 'ID invalide' }, { status: 400 });
    }

    const deliveryNoteId = parseInt(id);

    const {
      signature_data,
      client_signature_name,
      signature_timestamp
    } = body;

    if (!signature_data) {
      return NextResponse.json({ error: 'Données de signature requises' }, { status: 400 });
    }

    // 1. Sauvegarder la signature
    const { error: signatureError } = await supabaseAdmin
      .from('delivery_notes')
      .update({
        signature_data,
        signature_timestamp: signature_timestamp || new Date().toISOString(),
        client_signature_name,
        status: 'signed'
      })
      .eq('id', deliveryNoteId);

    if (signatureError) {
      console.error('Erreur sauvegarde signature BL:', signatureError);
      return NextResponse.json({ error: 'Erreur sauvegarde signature' }, { status: 500 });
    }

    // 2. Récupérer le BL complet
    const { data: deliveryNote, error: fetchError } = await supabaseAdmin
      .from('delivery_notes')
      .select(`
        *,
        client:clients(*),
        linked_po:purchase_orders(*),
        materials:delivery_note_materials(*)
      `)
      .eq('id', deliveryNoteId)
      .single();

    // Enrichir les matériaux
    if (!fetchError && deliveryNote && deliveryNote.materials) {
      for (let material of deliveryNote.materials) {
        if (material.product_id) {
          const { data: product } = await supabaseAdmin
            .from('products')
            .select('*')
            .eq('product_id', material.product_id)
            .single();

          if (product) {
            material.product = product;
          } else {
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

    if (fetchError || !deliveryNote) {
      return NextResponse.json({
        signatureSaved: true,
        autoSendResult: { success: false, needsManualSend: true, reason: 'BL introuvable' },
        status: 'signed'
      });
    }

    // 3. Vérifier si envoi automatique possible
    const autoSendCheck = checkCanAutoSend(deliveryNote);

    if (!autoSendCheck.canSend) {
      await supabaseAdmin
        .from('delivery_notes')
        .update({
          status: 'pending_send',
          auto_send_success: false
        })
        .eq('id', deliveryNoteId);

      return NextResponse.json({
        signatureSaved: true,
        autoSendResult: {
          success: false,
          needsManualSend: true,
          reason: autoSendCheck.reason
        },
        status: 'pending_send'
      });
    }

    // 4. Préparer les emails destinataires
    let recipientEmails = [];

    if (deliveryNote.recipient_emails && Array.isArray(deliveryNote.recipient_emails) && deliveryNote.recipient_emails.length > 0) {
      recipientEmails = [...deliveryNote.recipient_emails];
    }

    if (process.env.COMPANY_EMAIL) {
      if (!recipientEmails.includes(process.env.COMPANY_EMAIL)) {
        recipientEmails.push(process.env.COMPANY_EMAIL);
      }
    }

    if (recipientEmails.length === 0) {
      await supabaseAdmin
        .from('delivery_notes')
        .update({
          status: 'pending_send',
          auto_send_success: false
        })
        .eq('id', deliveryNoteId);

      return NextResponse.json({
        signatureSaved: true,
        autoSendResult: {
          success: false,
          needsManualSend: true,
          reason: 'Aucun email configuré'
        },
        status: 'pending_send'
      });
    }

    // 5. Envoyer l'email
    const emailService = new DeliveryNoteEmailService();
    const result = await emailService.sendDeliveryNoteEmail(deliveryNote, {
      sendToBureau: true,
      clientEmail: recipientEmails
    });

    if (result.success) {
      // 6. Mettre à jour statut vers "sent"
      await supabaseAdmin
        .from('delivery_notes')
        .update({
          status: 'sent',
          email_sent_at: new Date().toISOString(),
          email_sent_to: recipientEmails.join(', '),
          email_message_id: result.messageId,
          auto_send_success: true
        })
        .eq('id', deliveryNoteId);

      // 7. Déduire l'inventaire
      if (deliveryNote.materials && deliveryNote.materials.length > 0) {
        for (const material of deliveryNote.materials) {
          if (!material.product_id || !material.quantity) continue;

          const qty = parseFloat(material.quantity) || 0;
          if (qty === 0) continue;

          const isCredit = qty < 0;
          const absQty = Math.abs(qty);
          const movementType = isCredit ? 'IN' : 'OUT';

          const isNonInventory = material.product?.is_non_inventory || false;
          const tableName = isNonInventory ? 'non_inventory_items' : 'products';

          try {
            const { data: product } = await supabaseAdmin
              .from(tableName)
              .select('stock_qty')
              .eq('product_id', material.product_id)
              .single();

            if (product) {
              const currentStock = parseFloat(product.stock_qty) || 0;
              const newStock = isCredit ? currentStock + absQty : currentStock - absQty;
              const roundedStock = Math.round(newStock * 10000) / 10000;

              await supabaseAdmin
                .from(tableName)
                .update({ stock_qty: roundedStock.toString() })
                .eq('product_id', material.product_id);
            }

            const unitCost = Math.abs(parseFloat(material.unit_price) || 0);
            const totalCost = Math.round(absQty * unitCost * 100) / 100;

            await supabaseAdmin
              .from('inventory_movements')
              .insert({
                product_id: material.product_id,
                product_description: material.description || material.product?.description || '',
                product_group: material.product?.product_group || '',
                unit: material.unit || 'UN',
                movement_type: movementType,
                quantity: absQty,
                unit_cost: unitCost,
                total_cost: totalCost,
                reference_type: 'delivery_note',
                reference_id: deliveryNote.id.toString(),
                name: `${deliveryNote.bl_number}.pdf`,
                notes: `BL ${deliveryNote.bl_number}${isCredit ? ' (CRÉDIT)' : ''} - ${deliveryNote.client?.name || deliveryNote.client_name || 'Client'}`,
                created_at: new Date().toISOString()
              });
          } catch (invError) {
            console.error(`Erreur inventaire pour ${material.product_id}:`, invError);
          }
        }
      }

      // 8. Ajouter le PDF au BA si lié
      if (deliveryNote.linked_po_id && result.pdfBase64) {
        try {
          const { data: purchaseOrder } = await supabaseAdmin
            .from('purchase_orders')
            .select('files')
            .eq('id', deliveryNote.linked_po_id)
            .single();

          const newFile = {
            id: Date.now(),
            name: `BL-${deliveryNote.bl_number}.pdf`,
            data: result.pdfBase64,
            type: 'application/pdf',
            size: result.pdfBase64.length,
            uploadDate: new Date().toISOString()
          };

          const existingFiles = purchaseOrder?.files || [];
          const updatedFiles = [...existingFiles, newFile];

          await supabaseAdmin
            .from('purchase_orders')
            .update({ files: updatedFiles })
            .eq('id', deliveryNote.linked_po_id);
        } catch (err) {
          console.error('Erreur ajout PDF au BA:', err);
        }
      }

      return NextResponse.json({
        signatureSaved: true,
        autoSendResult: {
          success: true,
          messageId: result.messageId,
          sentTo: recipientEmails.join(', ')
        },
        status: 'sent'
      });
    } else {
      await supabaseAdmin
        .from('delivery_notes')
        .update({
          status: 'pending_send',
          auto_send_success: false
        })
        .eq('id', deliveryNoteId);

      return NextResponse.json({
        signatureSaved: true,
        autoSendResult: {
          success: false,
          needsManualSend: true,
          error: result.error
        },
        status: 'pending_send'
      });
    }

  } catch (error) {
    console.error('Erreur API signature + envoi auto BL:', error);

    try {
      await supabaseAdmin
        .from('delivery_notes')
        .update({ status: 'pending_send', auto_send_success: false })
        .eq('id', parseInt(params.id));
    } catch (updateError) {
      console.error('Erreur mise à jour statut:', updateError);
    }

    return NextResponse.json(
      {
        signatureSaved: false,
        error: error.message,
        autoSendResult: { success: false, needsManualSend: true }
      },
      { status: 500 }
    );
  }
}

function checkCanAutoSend(deliveryNote) {
  const hasClientEmails = (deliveryNote.recipient_emails && deliveryNote.recipient_emails.length > 0);
  const hasBureauEmail = !!process.env.COMPANY_EMAIL;

  if (!hasClientEmails && !hasBureauEmail) {
    return { canSend: false, reason: 'Aucune adresse email configurée' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  let emailsToValidate = [];
  if (hasClientEmails) emailsToValidate = [...deliveryNote.recipient_emails];
  if (hasBureauEmail) emailsToValidate.push(process.env.COMPANY_EMAIL);

  if (!emailsToValidate.some(email => email && emailRegex.test(email))) {
    return { canSend: false, reason: 'Aucun email valide trouvé' };
  }

  if (!deliveryNote.signature_data) {
    return { canSend: false, reason: 'Aucune signature trouvée' };
  }

  if (!deliveryNote.delivery_date || !deliveryNote.client_id) {
    return { canSend: false, reason: 'Données BL incomplètes' };
  }

  if (!process.env.RESEND_API_KEY) {
    return { canSend: false, reason: 'Service email non configuré' };
  }

  return { canSend: true, reason: 'Prêt pour envoi automatique' };
}
