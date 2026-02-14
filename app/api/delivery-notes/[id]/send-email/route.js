/**
 * @file app/api/delivery-notes/[id]/send-email/route.js
 * @description API pour envoyer un BL par email (envoi manuel)
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

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json({ error: 'ID du bon de livraison requis' }, { status: 400 });
    }

    const deliveryNoteId = parseInt(id);

    const {
      clientEmail,
      ccEmails = [],
      customMessage,
      sendToBureau = true
    } = body;

    // 1. Récupérer le BL complet
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
      return NextResponse.json({ error: 'Bon de livraison introuvable' }, { status: 404 });
    }

    // 2. Vérifications avant envoi
    if (deliveryNote.status !== 'signed' && deliveryNote.status !== 'pending_send') {
      return NextResponse.json(
        { error: 'Le bon de livraison doit être signé avant envoi' },
        { status: 400 }
      );
    }

    const emailToSend = clientEmail || deliveryNote.client?.email;
    if (!emailToSend) {
      return NextResponse.json(
        { error: 'Aucune adresse email disponible pour le client' },
        { status: 400 }
      );
    }

    // 3. Mettre le statut en "pending_send"
    if (deliveryNote.status !== 'pending_send') {
      await supabaseAdmin
        .from('delivery_notes')
        .update({ status: 'pending_send' })
        .eq('id', deliveryNoteId);
    }

    // 4. Préparer les CC
    const finalCcEmails = [...ccEmails];
    if (sendToBureau && process.env.COMPANY_EMAIL) {
      finalCcEmails.push(process.env.COMPANY_EMAIL);
    }

    // 5. Envoyer l'email
    const emailService = new DeliveryNoteEmailService();
    const result = await emailService.sendDeliveryNoteEmail(deliveryNote, {
      clientEmail: emailToSend,
      ccEmails: finalCcEmails,
      customMessage
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Erreur lors de l\'envoi' }, { status: 500 });
    }

    // 6. Mettre à jour le statut
    await supabaseAdmin
      .from('delivery_notes')
      .update({
        status: 'sent',
        email_sent_at: new Date().toISOString(),
        email_sent_to: emailToSend,
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

    // 8. Ajouter PDF au BA si lié
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
        await supabaseAdmin
          .from('purchase_orders')
          .update({ files: [...existingFiles, newFile] })
          .eq('id', deliveryNote.linked_po_id);
      } catch (err) {
        console.error('Erreur ajout PDF au BA:', err);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Email envoyé avec succès',
      messageId: result.messageId,
      sentTo: emailToSend,
      ccEmails: finalCcEmails
    });

  } catch (error) {
    console.error('Erreur API envoi email BL:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur', details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request, { params }) {
  try {
    const { id } = params;

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json({ error: 'ID invalide' }, { status: 400 });
    }

    const { data: deliveryNote, error } = await supabaseAdmin
      .from('delivery_notes')
      .select('id, bl_number, status, email_sent_at, email_sent_to, email_message_id, auto_send_success')
      .eq('id', parseInt(id))
      .single();

    if (error) {
      return NextResponse.json({ error: 'Bon de livraison introuvable' }, { status: 404 });
    }

    return NextResponse.json({
      id: deliveryNote.id,
      bl_number: deliveryNote.bl_number,
      status: deliveryNote.status,
      emailSent: deliveryNote.status === 'sent',
      emailSentAt: deliveryNote.email_sent_at,
      emailSentTo: deliveryNote.email_sent_to,
      messageId: deliveryNote.email_message_id,
      autoSendSuccess: deliveryNote.auto_send_success
    });

  } catch (error) {
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}
