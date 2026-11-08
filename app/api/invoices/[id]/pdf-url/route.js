/**
 * @file app/api/invoices/[id]/pdf-url/route.js
 * @description URL signée fraîche vers le PDF d'une facture stocké dans Supabase Storage
 *              (bucket 'invoices', chemin YYYY/MM/facture-{n}.pdf — même règle que send-email)
 *              - GET: { has_pdf, pdf_url, pdf_download_url, invoice_number }
 *              - has_pdf = false si le PDF n'a jamais été généré (facture brouillon jamais
 *                imprimée/envoyée) → le client peut alors appeler send-email en mode pdf_only
 *              - Utilisé par le module Statistiques (« voir la facture envoyée »)
 * @version 1.0.0
 * @date 2026-11-08
 * @changelog
 *   1.0.0 - Version initiale
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SIGNED_URL_TTL = 60 * 60 * 24; // 24 h

export async function GET(request, { params }) {
  try {
    const id = parseInt(params.id, 10);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ success: false, error: 'ID de facture invalide' }, { status: 400 });
    }

    const { data: invoice, error } = await supabaseAdmin
      .from('invoices')
      .select('id, invoice_number, invoice_date, status')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`Lecture facture: ${error.message}`);
    if (!invoice) {
      return NextResponse.json({ success: false, error: 'Facture introuvable' }, { status: 404 });
    }

    const invoiceDate = invoice.invoice_date || new Date().toISOString().split('T')[0];
    const [year, month] = String(invoiceDate).split('-');
    const storagePath = `${year}/${month}/facture-${invoice.invoice_number}.pdf`;
    const fileName = `Facture_${invoice.invoice_number}.pdf`;

    const { data: view, error: viewErr } = await supabaseAdmin.storage
      .from('invoices')
      .createSignedUrl(storagePath, SIGNED_URL_TTL);
    if (viewErr || !view?.signedUrl) {
      return NextResponse.json({
        success: true,
        has_pdf: false,
        pdf_url: null,
        pdf_download_url: null,
        invoice_number: invoice.invoice_number,
        status: invoice.status,
      });
    }
    const { data: dl } = await supabaseAdmin.storage
      .from('invoices')
      .createSignedUrl(storagePath, SIGNED_URL_TTL, { download: fileName });

    return NextResponse.json({
      success: true,
      has_pdf: true,
      pdf_url: view.signedUrl,
      pdf_download_url: dl?.signedUrl || view.signedUrl,
      invoice_number: invoice.invoice_number,
      status: invoice.status,
    });
  } catch (error) {
    console.error('Erreur GET /api/invoices/[id]/pdf-url:', error);
    return NextResponse.json({ success: false, error: error.message || 'Erreur' }, { status: 500 });
  }
}
