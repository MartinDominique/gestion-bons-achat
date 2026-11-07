/**
 * @file app/api/purchase-orders/[id]/invoices/route.js
 * @description Factures liées à un Bon d'Achat client (BA) — pour l'onglet « Docs » du dossier BA
 *              - GET: trouve les BT et BL dont linked_po_id = BA, puis les factures créées depuis
 *                ces documents (invoices.source_type/source_id) OU référencées par leur invoice_id
 *                (union, donc robuste même si un lien invoice_id est resté NULL — bug relink)
 *              - Pour chaque facture: nouvelle URL signée vers le PDF stocké dans Supabase
 *                Storage (bucket 'invoices', chemin YYYY/MM/facture-{n}.pdf) si le fichier existe
 *                → has_pdf, pdf_url (voir) et pdf_download_url (téléchargement forcé)
 *              - Les BT/BL marqués « facturés dans Acomba » (invoice_id = -1) sont listés dans
 *                `external` (aucun PDF dans l'app)
 *              - Les factures DÉJÀ existantes apparaissent automatiquement: aucune migration ni
 *                rattachement manuel (dès que le BT/BL est lié au BA)
 *              - Les BT/BL fermés par déduction « Varia » (invoice_id = -2, aucune facture) sont
 *                listés dans `deductions`
 * @version 1.1.0
 * @date 2026-11-07
 * @changelog
 *   1.1.0 - Liste `deductions` (BT/BL fermés par déduction « Varia »); sentinelles centralisées
 *   1.0.0 - Version initiale
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';
import { isExternalInvoice, isDeduction, DEDUCTION_LABEL } from '../../../../../lib/constants/deduction';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SIGNED_URL_TTL = 60 * 60 * 24; // 24 h (regénérée à chaque ouverture du dossier BA)

/**
 * Chemin Storage du PDF d'une facture (même règle que send-email/route.js)
 */
function invoiceStoragePath(invoice) {
  const invoiceDate = invoice.invoice_date || new Date().toISOString().split('T')[0];
  const [year, month] = String(invoiceDate).split('-');
  return `${year}/${month}/facture-${invoice.invoice_number}.pdf`;
}

/**
 * URL signée (voir + télécharger) si le PDF existe dans le bucket, sinon null
 */
async function signInvoicePdf(invoice) {
  const storagePath = invoiceStoragePath(invoice);
  const fileName = `Facture_${invoice.invoice_number}.pdf`;
  try {
    const { data, error } = await supabaseAdmin
      .storage
      .from('invoices')
      .createSignedUrl(storagePath, SIGNED_URL_TTL);
    if (error || !data?.signedUrl) return { has_pdf: false, pdf_url: null, pdf_download_url: null };

    const { data: dl } = await supabaseAdmin
      .storage
      .from('invoices')
      .createSignedUrl(storagePath, SIGNED_URL_TTL, { download: fileName });

    return {
      has_pdf: true,
      pdf_url: data.signedUrl,
      pdf_download_url: dl?.signedUrl || data.signedUrl,
      pdf_file_name: fileName,
    };
  } catch (e) {
    console.warn(`PDF facture ${invoice.invoice_number} introuvable (${storagePath}):`, e.message);
    return { has_pdf: false, pdf_url: null, pdf_download_url: null };
  }
}

// GET - Factures liées au BA
export async function GET(request, { params }) {
  try {
    const poId = parseInt(params.id);
    if (isNaN(poId)) {
      return NextResponse.json({ success: false, error: 'ID de BA invalide' }, { status: 400 });
    }

    // 1. BT et BL rattachés à ce BA
    const [{ data: bts, error: btErr }, { data: bls, error: blErr }] = await Promise.all([
      supabaseAdmin
        .from('work_orders')
        .select('id, bt_number, invoice_id, status, work_date')
        .eq('linked_po_id', poId),
      supabaseAdmin
        .from('delivery_notes')
        .select('id, bl_number, invoice_id, status, delivery_date')
        .eq('linked_po_id', poId),
    ]);
    if (btErr) throw new Error(`Lecture BT: ${btErr.message}`);
    if (blErr) throw new Error(`Lecture BL: ${blErr.message}`);

    const btIds = (bts || []).map(d => d.id);
    const blIds = (bls || []).map(d => d.id);
    const linkedInvoiceIds = [...(bts || []), ...(bls || [])]
      .map(d => d.invoice_id)
      .filter(v => v !== null && v !== undefined && Number(v) > 0);

    // 2. Factures: créées depuis ces BT/BL OU référencées par invoice_id (union)
    const orParts = [];
    if (btIds.length > 0) orParts.push(`and(source_type.eq.work_order,source_id.in.(${btIds.join(',')}))`);
    if (blIds.length > 0) orParts.push(`and(source_type.eq.delivery_note,source_id.in.(${blIds.join(',')}))`);
    if (linkedInvoiceIds.length > 0) orParts.push(`id.in.(${[...new Set(linkedInvoiceIds)].join(',')})`);

    let invoices = [];
    if (orParts.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('invoices')
        .select('id, invoice_number, invoice_date, due_date, total, amount_paid, status, source_type, source_id, source_number, client_name, is_prix_jobe, sent_at, pdf_url')
        .or(orParts.join(','))
        .order('invoice_date', { ascending: false })
        .order('invoice_number', { ascending: false });
      if (error) throw new Error(`Lecture factures: ${error.message}`);
      invoices = data || [];
    }

    // 3. PDF: URL signée fraîche (celle stockée dans pdf_url peut être absente ou périmée)
    const enriched = await Promise.all(invoices.map(async (inv) => {
      const pdf = await signInvoicePdf(inv);
      return { ...inv, ...pdf, storage_path: invoiceStoragePath(inv) };
    }));

    // 4. Documents facturés à l'externe (Acomba): invoice_id = -1
    const external = [
      ...(bts || []).filter(d => isExternalInvoice(d.invoice_id)).map(d => ({
        source_type: 'work_order', source_id: d.id, source_number: d.bt_number, date: d.work_date,
      })),
      ...(bls || []).filter(d => isExternalInvoice(d.invoice_id)).map(d => ({
        source_type: 'delivery_note', source_id: d.id, source_number: d.bl_number, date: d.delivery_date,
      })),
    ];

    // 5. Documents fermés par déduction « Varia » (invoice_id = -2): aucune facture, aucun PDF
    const deductions = [
      ...(bts || []).filter(d => isDeduction(d.invoice_id)).map(d => ({
        source_type: 'work_order', source_id: d.id, source_number: d.bt_number, date: d.work_date,
      })),
      ...(bls || []).filter(d => isDeduction(d.invoice_id)).map(d => ({
        source_type: 'delivery_note', source_id: d.id, source_number: d.bl_number, date: d.delivery_date,
      })),
    ];

    return NextResponse.json({
      success: true,
      data: enriched,
      external,
      deductions,
      deduction_label: DEDUCTION_LABEL,
      linked_documents: {
        work_orders: (bts || []).map(d => ({ id: d.id, number: d.bt_number, status: d.status, invoice_id: d.invoice_id })),
        delivery_notes: (bls || []).map(d => ({ id: d.id, number: d.bl_number, status: d.status, invoice_id: d.invoice_id })),
      },
    });
  } catch (error) {
    console.error('Erreur GET /api/purchase-orders/[id]/invoices:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur chargement des factures du BA' },
      { status: 500 }
    );
  }
}
