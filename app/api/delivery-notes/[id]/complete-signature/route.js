/**
 * @file app/api/delivery-notes/[id]/complete-signature/route.js
 * @description Signature complète + envoi automatique du BL + création BL suivi backorder
 * @version 1.5.0
 * @date 2026-04-13
 * @changelog
 *   1.5.0 - Fix mouvement inventaire: colonne 'name' → 'reference_number' (BL number)
 *           + vérification erreur INSERT inventory_movements
 *   1.4.0 - Fix BO: inclure TOUS les items dans le BL de suivi (pas seulement les BO),
 *           items complétés avec quantity=0 pour vue complète commande côté client
 *   1.3.0 - Ajout gestion backorder (BO): après signature, si des items ont ordered_quantity
 *           et qu'il reste des quantités non livrées, crée automatiquement un BL de suivi
 *           en brouillon avec les quantités restantes et lie parent↔child
 *   1.2.0 - Inventaire déduit à la signature (avant envoi email), pas seulement si email réussit
 *           Protection anti-doublon via vérification inventory_movements existants
 *   1.1.0 - Ajout mise à jour delivered_quantity dans client_po_items (cohérence avec send-email)
 *   1.0.2 - Filtrer metadata __fields: dans recipient_emails (sélection checkboxes)
 *   1.0.1 - Fix: vérification erreur sur toutes les mises à jour DB,
 *           fallback sans colonnes optionnelles si update échoue
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

    // 2b. Déduire l'inventaire À LA SIGNATURE (indépendant de l'envoi email)
    if (deliveryNote.materials && deliveryNote.materials.length > 0) {
      // Vérifier si l'inventaire a déjà été déduit pour ce BL (protection anti-doublon)
      const { data: existingMovements } = await supabaseAdmin
        .from('inventory_movements')
        .select('id')
        .eq('reference_type', 'delivery_note')
        .eq('reference_number', deliveryNote.bl_number)
        .limit(1);

      if (existingMovements && existingMovements.length > 0) {
        console.log('📦 Inventaire déjà déduit pour BL', deliveryNote.bl_number, '- skip');
      } else {
        console.log('📦 Traitement inventaire pour', deliveryNote.materials.length, 'matériaux');

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

              console.log(`✅ Stock ${isCredit ? 'ajouté' : 'déduit'}: ${material.product_id}: ${currentStock} → ${roundedStock}`);
            }

            const unitCost = Math.abs(parseFloat(material.unit_price) || 0);
            const totalCost = Math.round(absQty * unitCost * 100) / 100;

            const { error: mvtError } = await supabaseAdmin
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
                reference_id: null,
                reference_number: deliveryNote.bl_number,
                notes: `BL ${deliveryNote.bl_number}${isCredit ? ' (CRÉDIT)' : ''} - ${deliveryNote.client?.name || deliveryNote.client_name || 'Client'}`,
                created_at: new Date().toISOString()
              });

            if (mvtError) {
              console.error(`⚠️ Erreur mouvement inventaire pour ${material.product_id}:`, mvtError);
            }

          } catch (invError) {
            console.error(`⚠️ Erreur inventaire pour ${material.product_id}:`, invError);
          }
        }
      }

      // 2c. Mettre à jour delivered_quantity dans client_po_items si BL lié à un BA
      if (deliveryNote.linked_po_id) {
        try {
          const { data: poItems } = await supabaseAdmin
            .from('client_po_items')
            .select('id, product_id, quantity, delivered_quantity')
            .eq('purchase_order_id', deliveryNote.linked_po_id);

          if (poItems && poItems.length > 0) {
            for (const material of deliveryNote.materials) {
              if (!material.product_id || !material.quantity) continue;

              const matchingPoItem = poItems.find(pi => pi.product_id === material.product_id);
              if (matchingPoItem) {
                const currentDelivered = parseFloat(matchingPoItem.delivered_quantity) || 0;
                const deliveredQty = parseFloat(material.quantity) || 0;
                const newDelivered = currentDelivered + deliveredQty;

                await supabaseAdmin
                  .from('client_po_items')
                  .update({
                    delivered_quantity: newDelivered,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', matchingPoItem.id);
              }
            }
          }
        } catch (err) {
          console.error('Erreur mise à jour delivered_quantity:', err);
        }
      }
    }

    // 2d. Gestion Backorder (BO): créer BL de suivi si quantités restantes
    let backorderResult = null;
    if (deliveryNote.materials && deliveryNote.materials.length > 0) {
      // Filtrer les items qui ont un suivi BO (ordered_quantity défini)
      const trackedItems = deliveryNote.materials.filter(m => m.ordered_quantity);
      const boItems = trackedItems.filter(m => {
        const totalDelivered = (parseFloat(m.previously_delivered) || 0) + (parseFloat(m.quantity) || 0);
        return totalDelivered < parseFloat(m.ordered_quantity);
      });

      if (boItems.length > 0) {
        try {
          console.log(`📦 BO détecté: ${boItems.length} item(s) en backorder pour BL ${deliveryNote.bl_number}`);

          // Créer le BL de suivi en brouillon
          const followUpData = {
            client_id: deliveryNote.client_id,
            client_name: deliveryNote.client_name,
            linked_po_id: deliveryNote.linked_po_id || null,
            delivery_date: new Date().toISOString().split('T')[0],
            delivery_description: `SUITE ${deliveryNote.bl_number} — BACKORDER`,
            status: 'draft',
            is_prix_jobe: deliveryNote.is_prix_jobe || false,
            recipient_emails: deliveryNote.recipient_emails || [],
            parent_bl_id: deliveryNoteId,
          };

          const { data: followUpBL, error: followUpError } = await supabaseAdmin
            .from('delivery_notes')
            .insert([followUpData])
            .select()
            .single();

          if (followUpError) {
            console.error('Erreur création BL suivi BO:', followUpError);
          } else {
            console.log(`✅ BL suivi créé: ${followUpBL.bl_number} (id: ${followUpBL.id})`);

            // Inclure TOUS les items avec ordered_quantity (pas seulement les BO)
            // Items complétés auront quantity=0, ce qui permet de voir la commande complète
            const followUpMaterials = trackedItems.map(m => {
              const prevDelivered = parseFloat(m.previously_delivered) || 0;
              const currentDelivered = parseFloat(m.quantity) || 0;
              const orderedQty = parseFloat(m.ordered_quantity);
              const remainingQty = Math.max(0, orderedQty - prevDelivered - currentDelivered);

              return {
                delivery_note_id: followUpBL.id,
                product_id: m.product_id || null,
                product_code: m.product_code || null,
                description: m.description || null,
                quantity: remainingQty,
                unit: m.unit || 'UN',
                unit_price: parseFloat(m.unit_price) || 0,
                show_price: m.show_price || false,
                notes: m.notes || null,
                ordered_quantity: orderedQty,
                previously_delivered: prevDelivered + currentDelivered,
              };
            });

            const { error: matError } = await supabaseAdmin
              .from('delivery_note_materials')
              .insert(followUpMaterials);

            if (matError) {
              console.error('Erreur création matériaux BL suivi:', matError);
            }

            // Lier parent → child
            await supabaseAdmin
              .from('delivery_notes')
              .update({ child_bl_id: followUpBL.id })
              .eq('id', deliveryNoteId);

            backorderResult = {
              followUpBlId: followUpBL.id,
              followUpBlNumber: followUpBL.bl_number,
              boItemCount: boItems.length,
            };
          }
        } catch (boError) {
          console.error('Erreur gestion backorder:', boError);
        }
      }
    }

    // 3. Vérifier si envoi automatique possible
    const autoSendCheck = checkCanAutoSend(deliveryNote);

    if (!autoSendCheck.canSend) {
      const { error: pendErr1 } = await supabaseAdmin
        .from('delivery_notes')
        .update({ status: 'pending_send', auto_send_success: false })
        .eq('id', deliveryNoteId);
      if (pendErr1) {
        await supabaseAdmin.from('delivery_notes').update({ status: 'pending_send' }).eq('id', deliveryNoteId);
      }

      return NextResponse.json({
        signatureSaved: true,
        autoSendResult: {
          success: false,
          needsManualSend: true,
          reason: autoSendCheck.reason
        },
        status: 'pending_send',
        backorder: backorderResult
      });
    }

    // 4. Préparer les emails destinataires
    let recipientEmails = [];

    if (deliveryNote.recipient_emails && Array.isArray(deliveryNote.recipient_emails) && deliveryNote.recipient_emails.length > 0) {
      // Filtrer metadata __fields: (utilisé pour restauration checkboxes côté client)
      recipientEmails = deliveryNote.recipient_emails.filter(e => !e.startsWith('__fields:'));
    }

    if (process.env.COMPANY_EMAIL) {
      if (!recipientEmails.includes(process.env.COMPANY_EMAIL)) {
        recipientEmails.push(process.env.COMPANY_EMAIL);
      }
    }

    if (recipientEmails.length === 0) {
      const { error: pendErr2 } = await supabaseAdmin
        .from('delivery_notes')
        .update({ status: 'pending_send', auto_send_success: false })
        .eq('id', deliveryNoteId);
      if (pendErr2) {
        await supabaseAdmin.from('delivery_notes').update({ status: 'pending_send' }).eq('id', deliveryNoteId);
      }

      return NextResponse.json({
        signatureSaved: true,
        autoSendResult: {
          success: false,
          needsManualSend: true,
          reason: 'Aucun email configuré'
        },
        status: 'pending_send',
        backorder: backorderResult
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
      const { error: updateSentError } = await supabaseAdmin
        .from('delivery_notes')
        .update({
          status: 'sent',
          email_sent_at: new Date().toISOString(),
          email_sent_to: recipientEmails.join(', '),
          email_message_id: result.messageId,
          auto_send_success: true
        })
        .eq('id', deliveryNoteId);

      // Fallback: si l'update échoue (colonnes manquantes), mettre au moins le statut à jour
      if (updateSentError) {
        console.error('Erreur update complet vers sent:', updateSentError.message);
        const { error: fallbackError } = await supabaseAdmin
          .from('delivery_notes')
          .update({ status: 'sent' })
          .eq('id', deliveryNoteId);

        if (fallbackError) {
          console.error('Erreur fallback update statut sent:', fallbackError.message);
        }
      }

      // 7. Ajouter le PDF au BA si lié
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
        status: 'sent',
        backorder: backorderResult
      });
    } else {
      const { error: pendErr3 } = await supabaseAdmin
        .from('delivery_notes')
        .update({ status: 'pending_send', auto_send_success: false })
        .eq('id', deliveryNoteId);
      if (pendErr3) {
        await supabaseAdmin.from('delivery_notes').update({ status: 'pending_send' }).eq('id', deliveryNoteId);
      }

      return NextResponse.json({
        signatureSaved: true,
        autoSendResult: {
          success: false,
          needsManualSend: true,
          error: result.error
        },
        status: 'pending_send',
        backorder: backorderResult
      });
    }

  } catch (error) {
    console.error('Erreur API signature + envoi auto BL:', error);

    try {
      const { error: pendErrCatch } = await supabaseAdmin
        .from('delivery_notes')
        .update({ status: 'pending_send', auto_send_success: false })
        .eq('id', parseInt(params.id));
      if (pendErrCatch) {
        await supabaseAdmin.from('delivery_notes').update({ status: 'pending_send' }).eq('id', parseInt(params.id));
      }
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
  // Filtrer metadata __fields: avant validation
  const cleanEmails = (deliveryNote.recipient_emails || []).filter(e => !e.startsWith('__fields:'));
  const hasClientEmails = cleanEmails.length > 0;
  const hasBureauEmail = !!process.env.COMPANY_EMAIL;

  if (!hasClientEmails && !hasBureauEmail) {
    return { canSend: false, reason: 'Aucune adresse email configurée' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  let emailsToValidate = [];
  if (hasClientEmails) emailsToValidate = [...cleanEmails];
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
