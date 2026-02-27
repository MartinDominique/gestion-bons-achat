/**
 * @file app/api/invoices/route.js
 * @description API CRUD pour les Factures (Phase B — Facturation MVP)
 *              - POST: Créer une nouvelle facture à partir d'un BT ou BL
 *              - GET: Lister les factures avec filtres, tri et pagination
 * @version 1.0.0
 * @date 2026-02-27
 * @changelog
 *   1.0.0 - Version initiale (Phase B Facturation MVP)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST /api/invoices
 * Crée une nouvelle facture à partir d'un BT ou BL signé
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      client_id,
      client_name,
      client_address,
      source_type,
      source_id,
      source_number,
      invoice_date,
      payment_terms,
      line_items = [],
      subtotal = 0,
      tps_rate = 5.0,
      tvq_rate = 9.975,
      tps_amount = 0,
      tvq_amount = 0,
      total = 0,
      total_materials = 0,
      total_labor = 0,
      total_transport = 0,
      is_prix_jobe = false,
      notes,
    } = body;

    // Validation
    if (!client_id || !source_type || !source_id || !source_number) {
      return NextResponse.json(
        { success: false, error: 'Champs requis manquants: client_id, source_type, source_id, source_number' },
        { status: 400 }
      );
    }

    if (!['work_order', 'delivery_note'].includes(source_type)) {
      return NextResponse.json(
        { success: false, error: 'source_type doit être work_order ou delivery_note' },
        { status: 400 }
      );
    }

    // Vérifier qu'une facture n'existe pas déjà pour ce BT/BL
    const { data: existingInvoice } = await supabaseAdmin
      .from('invoices')
      .select('id, invoice_number')
      .eq('source_type', source_type)
      .eq('source_id', source_id)
      .single();

    if (existingInvoice) {
      return NextResponse.json(
        { success: false, error: `Une facture existe déjà pour ce document: ${existingInvoice.invoice_number}` },
        { status: 409 }
      );
    }

    // Récupérer et incrémenter le numéro de facture
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('settings')
      .select('invoice_next_number')
      .eq('id', 1)
      .single();

    if (settingsError) {
      console.error('Erreur lecture settings:', settingsError);
      return NextResponse.json(
        { success: false, error: 'Erreur lecture paramètres de facturation' },
        { status: 500 }
      );
    }

    const invoiceNumber = String(settings.invoice_next_number || 1);

    // Calculer la date d'échéance
    let due_date = null;
    if (payment_terms === 'Net 30 jours' || payment_terms === '2% 10 Net 30 jours') {
      const date = new Date(invoice_date || new Date());
      date.setDate(date.getDate() + 30);
      due_date = date.toISOString().split('T')[0];
    } else if (payment_terms === 'Payable sur réception') {
      due_date = invoice_date || new Date().toISOString().split('T')[0];
    }

    // Créer la facture
    const invoiceData = {
      invoice_number: invoiceNumber,
      client_id: parseInt(client_id),
      client_name: client_name || '',
      client_address: client_address || '',
      source_type,
      source_id: parseInt(source_id),
      source_number,
      invoice_date: invoice_date || new Date().toISOString().split('T')[0],
      due_date,
      payment_terms: payment_terms || 'Net 30 jours',
      line_items,
      subtotal: parseFloat(subtotal) || 0,
      tps_rate: parseFloat(tps_rate) || 5.0,
      tvq_rate: parseFloat(tvq_rate) || 9.975,
      tps_amount: parseFloat(tps_amount) || 0,
      tvq_amount: parseFloat(tvq_amount) || 0,
      total: parseFloat(total) || 0,
      total_materials: parseFloat(total_materials) || 0,
      total_labor: parseFloat(total_labor) || 0,
      total_transport: parseFloat(total_transport) || 0,
      is_prix_jobe,
      notes: notes || null,
      status: 'draft',
    };

    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .insert([invoiceData])
      .select()
      .single();

    if (invoiceError) {
      console.error('Erreur création facture:', invoiceError);
      return NextResponse.json(
        { success: false, error: 'Erreur création facture', details: invoiceError.message },
        { status: 500 }
      );
    }

    // Incrémenter le numéro de facture dans settings
    await supabaseAdmin
      .from('settings')
      .update({
        invoice_next_number: (settings.invoice_next_number || 1) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    // Lier la facture au BT ou BL source
    const sourceTable = source_type === 'work_order' ? 'work_orders' : 'delivery_notes';
    await supabaseAdmin
      .from(sourceTable)
      .update({ invoice_id: invoice.id })
      .eq('id', source_id);

    return NextResponse.json({
      success: true,
      data: invoice,
      message: `Facture ${invoiceNumber} créée avec succès`,
    });

  } catch (error) {
    console.error('Erreur API invoices POST:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur serveur', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/invoices
 * Liste les factures avec filtres et pagination
 * Params: status, client_id, search, month (YYYY-MM), page, limit
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page')) || 0;
    const limit = parseInt(searchParams.get('limit')) || 50;
    const status = searchParams.get('status');
    const client_id = searchParams.get('client_id');
    const search = searchParams.get('search');
    const month = searchParams.get('month'); // Format: YYYY-MM

    let query = supabaseAdmin
      .from('invoices')
      .select(`
        id,
        invoice_number,
        client_id,
        client_name,
        source_type,
        source_id,
        source_number,
        invoice_date,
        due_date,
        payment_terms,
        subtotal,
        tps_amount,
        tvq_amount,
        total,
        total_materials,
        total_labor,
        total_transport,
        status,
        is_prix_jobe,
        notes,
        pdf_url,
        sent_at,
        paid_at,
        created_at
      `, { count: 'exact' })
      .order('invoice_number', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (client_id) {
      query = query.eq('client_id', parseInt(client_id));
    }

    if (search) {
      query = query.or(
        `invoice_number.ilike.%${search}%,client_name.ilike.%${search}%,source_number.ilike.%${search}%`
      );
    }

    if (month) {
      // Filtrer par mois: YYYY-MM
      const [year, mon] = month.split('-');
      const startDate = `${year}-${mon}-01`;
      const endDay = new Date(parseInt(year), parseInt(mon), 0).getDate();
      const endDate = `${year}-${mon}-${String(endDay).padStart(2, '0')}`;
      query = query.gte('invoice_date', startDate).lte('invoice_date', endDate);
    }

    const from = page * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('Erreur récupération factures:', error);
      return NextResponse.json(
        { success: false, error: 'Erreur récupération factures', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      pagination: {
        page,
        limit,
        total: count,
        hasMore: (count || 0) > (page + 1) * limit,
      },
    });

  } catch (error) {
    console.error('Erreur API invoices GET:', error);
    return NextResponse.json(
      { success: false, error: 'Erreur serveur', details: error.message },
      { status: 500 }
    );
  }
}
