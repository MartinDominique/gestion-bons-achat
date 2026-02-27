/**
 * @file app/api/statistics/route.js
 * @description API endpoint pour les rapports et statistiques de ventes
 *              - GET: Récupérer les données agrégées (BT, BL, Soumissions)
 *              - Filtres: type, dates, client, n° document, description, produit
 *              - Calculs: revenus, coûts, marges par document
 *              - Pagination côté serveur (max 50 résultats)
 * @version 1.0.0
 * @date 2026-02-24
 * @changelog
 *   1.0.0 - Version initiale - Phase 1 MVP
 */

import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    // Paramètres de filtrage
    const type = searchParams.get('type') || 'all'; // bt, bl, soumission, all
    const dateFrom = searchParams.get('dateFrom') || null;
    const dateTo = searchParams.get('dateTo') || null;
    const clientId = searchParams.get('clientId') || null;
    const search = searchParams.get('search') || null;
    const documentNumber = searchParams.get('documentNumber') || null;
    const productSearch = searchParams.get('productId') || null;
    const sortBy = searchParams.get('sortBy') || 'date';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const page = parseInt(searchParams.get('page') || '0', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

    const types = type === 'all' ? ['bt', 'bl', 'soumission'] : type.split(',');
    const documents = [];

    // ============================================
    // 1. BONS DE TRAVAIL (BT)
    // ============================================
    if (types.includes('bt')) {
      let btQuery = supabaseAdmin
        .from('work_orders')
        .select(`
          id, bt_number, client_id, work_date, work_description, status,
          is_prix_jobe, total_hours, time_entries,
          client:clients(id, name),
          materials:work_order_materials(id, product_id, description, quantity, unit, unit_price)
        `)
        .not('status', 'eq', 'draft');

      if (dateFrom) btQuery = btQuery.gte('work_date', dateFrom);
      if (dateTo) btQuery = btQuery.lte('work_date', dateTo);
      if (clientId) btQuery = btQuery.eq('client_id', parseInt(clientId));
      if (documentNumber) btQuery = btQuery.ilike('bt_number', `%${documentNumber}%`);
      if (search) btQuery = btQuery.ilike('work_description', `%${search}%`);

      const { data: btData, error: btError } = await btQuery;

      if (btError) {
        console.error('Erreur requête BT:', btError);
      } else if (btData) {
        // Pour chaque BT, chercher le cost_price des produits
        const productIds = [];
        btData.forEach(bt => {
          (bt.materials || []).forEach(m => {
            if (m.product_id) productIds.push(m.product_id);
          });
        });

        let productCosts = {};
        if (productIds.length > 0) {
          const uniqueIds = [...new Set(productIds)];
          const { data: products } = await supabaseAdmin
            .from('products')
            .select('product_id, cost_price')
            .in('product_id', uniqueIds);

          if (products) {
            products.forEach(p => {
              productCosts[p.product_id] = parseFloat(p.cost_price) || 0;
            });
          }
        }

        btData.forEach(bt => {
          const materials = bt.materials || [];
          let revenue = 0;
          let cost = 0;

          materials.forEach(m => {
            const qty = parseFloat(m.quantity) || 0;
            const unitPrice = parseFloat(m.unit_price) || 0;
            const costPrice = m.product_id ? (productCosts[m.product_id] || 0) : 0;

            revenue += qty * unitPrice;
            cost += qty * costPrice;
          });

          documents.push({
            type: 'BT',
            id: bt.id,
            documentNumber: bt.bt_number,
            date: bt.work_date,
            clientId: bt.client_id,
            clientName: bt.client?.name || 'N/A',
            description: bt.work_description || '',
            revenue: Math.round(revenue * 100) / 100,
            cost: Math.round(cost * 100) / 100,
            margin: Math.round((revenue - cost) * 100) / 100,
            marginPercent: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 10000) / 100 : 0,
            status: bt.status,
            isPrixJobe: bt.is_prix_jobe,
            materialCount: materials.length,
            totalHours: bt.total_hours || 0,
          });
        });
      }
    }

    // ============================================
    // 2. BONS DE LIVRAISON (BL)
    // ============================================
    if (types.includes('bl')) {
      let blQuery = supabaseAdmin
        .from('delivery_notes')
        .select(`
          id, bl_number, client_id, client_name, delivery_date, delivery_description, status,
          is_prix_jobe,
          materials:delivery_note_materials(id, product_id, description, quantity, unit, unit_price)
        `)
        .not('status', 'eq', 'draft');

      if (dateFrom) blQuery = blQuery.gte('delivery_date', dateFrom);
      if (dateTo) blQuery = blQuery.lte('delivery_date', dateTo);
      if (clientId) blQuery = blQuery.eq('client_id', parseInt(clientId));
      if (documentNumber) blQuery = blQuery.ilike('bl_number', `%${documentNumber}%`);
      if (search) blQuery = blQuery.ilike('delivery_description', `%${search}%`);

      const { data: blData, error: blError } = await blQuery;

      if (blError) {
        console.error('Erreur requête BL:', blError);
      } else if (blData) {
        // Chercher les cost_price des produits BL
        const productIds = [];
        blData.forEach(bl => {
          (bl.materials || []).forEach(m => {
            if (m.product_id) productIds.push(m.product_id);
          });
        });

        let productCosts = {};
        if (productIds.length > 0) {
          const uniqueIds = [...new Set(productIds)];
          const { data: products } = await supabaseAdmin
            .from('products')
            .select('product_id, cost_price')
            .in('product_id', uniqueIds);

          if (products) {
            products.forEach(p => {
              productCosts[p.product_id] = parseFloat(p.cost_price) || 0;
            });
          }
        }

        blData.forEach(bl => {
          const materials = bl.materials || [];
          let revenue = 0;
          let cost = 0;

          materials.forEach(m => {
            const qty = parseFloat(m.quantity) || 0;
            const unitPrice = parseFloat(m.unit_price) || 0;
            const costPrice = m.product_id ? (productCosts[m.product_id] || 0) : 0;

            revenue += qty * unitPrice;
            cost += qty * costPrice;
          });

          documents.push({
            type: 'BL',
            id: bl.id,
            documentNumber: bl.bl_number,
            date: bl.delivery_date,
            clientId: bl.client_id,
            clientName: bl.client_name || 'N/A',
            description: bl.delivery_description || '',
            revenue: Math.round(revenue * 100) / 100,
            cost: Math.round(cost * 100) / 100,
            margin: Math.round((revenue - cost) * 100) / 100,
            marginPercent: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 10000) / 100 : 0,
            status: bl.status,
            isPrixJobe: bl.is_prix_jobe,
            materialCount: materials.length,
          });
        });
      }
    }

    // ============================================
    // 3. SOUMISSIONS
    // ============================================
    if (types.includes('soumission')) {
      let soumQuery = supabaseAdmin
        .from('submissions')
        .select('*');

      if (dateFrom) soumQuery = soumQuery.gte('created_at', dateFrom);
      if (dateTo) soumQuery = soumQuery.lte('created_at', dateTo + 'T23:59:59');
      if (documentNumber) soumQuery = soumQuery.ilike('submission_number', `%${documentNumber}%`);
      if (search) soumQuery = soumQuery.ilike('description', `%${search}%`);

      const { data: soumData, error: soumError } = await soumQuery;

      if (soumError) {
        console.error('Erreur requête Soumissions:', soumError);
      } else if (soumData) {
        soumData.forEach(soum => {
          const items = soum.items || [];
          let revenue = 0;
          let cost = 0;

          // Filtre par client si applicable
          if (clientId) {
            // Les soumissions utilisent client_name, pas client_id numérique
            // On va filtrer côté serveur si possible
          }

          items.forEach(item => {
            const qty = parseFloat(item.quantity) || 0;
            const sellingPrice = parseFloat(item.selling_price) || 0;
            const costPrice = parseFloat(item.cost_price) || 0;

            revenue += qty * sellingPrice;
            cost += qty * costPrice;
          });

          documents.push({
            type: 'Soum.',
            id: soum.id,
            documentNumber: soum.submission_number,
            date: soum.created_at ? soum.created_at.split('T')[0] : null,
            clientId: null,
            clientName: soum.client_name || 'N/A',
            description: soum.description || '',
            revenue: Math.round(revenue * 100) / 100,
            cost: Math.round(cost * 100) / 100,
            margin: Math.round((revenue - cost) * 100) / 100,
            marginPercent: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 10000) / 100 : 0,
            status: soum.status,
            isPrixJobe: false,
            materialCount: items.length,
          });
        });
      }
    }

    // ============================================
    // 4. FILTRE PAR PRODUIT (post-traitement)
    // ============================================
    let filteredDocuments = documents;

    if (productSearch) {
      const searchLower = productSearch.toLowerCase();
      // On filtre les documents qui ont ce produit - nécessite de re-vérifier
      // Pour le MVP, on filtre les BT/BL par product_id dans les matériaux
      // et les soumissions par item description
      filteredDocuments = documents.filter(doc => {
        // Le filtrage par produit est fait après car on ne peut pas facilement
        // filtrer les JSONB côté Supabase pour les soumissions
        return true; // TODO Phase 2: implémenter le filtrage par produit détaillé
      });
    }

    // Filtre soumissions par client si clientId fourni
    if (clientId) {
      // Pour les soumissions, on doit chercher le nom du client
      const { data: clientData } = await supabaseAdmin
        .from('clients')
        .select('name')
        .eq('id', parseInt(clientId))
        .single();

      if (clientData) {
        filteredDocuments = filteredDocuments.filter(doc => {
          if (doc.type === 'Soum.') {
            return doc.clientName.toLowerCase().includes(clientData.name.toLowerCase());
          }
          return true; // BT et BL sont déjà filtrés par la requête SQL
        });
      }
    }

    // ============================================
    // 5. TRI
    // ============================================
    const sortFn = (a, b) => {
      let valA, valB;
      switch (sortBy) {
        case 'date':
          valA = a.date || '';
          valB = b.date || '';
          break;
        case 'margin':
          valA = a.margin;
          valB = b.margin;
          break;
        case 'revenue':
          valA = a.revenue;
          valB = b.revenue;
          break;
        case 'cost':
          valA = a.cost;
          valB = b.cost;
          break;
        case 'marginPercent':
          valA = a.marginPercent;
          valB = b.marginPercent;
          break;
        case 'client':
          valA = a.clientName || '';
          valB = b.clientName || '';
          break;
        default:
          valA = a.date || '';
          valB = b.date || '';
      }

      if (typeof valA === 'string') {
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    };

    filteredDocuments.sort(sortFn);

    // ============================================
    // 6. RÉSUMÉ / TOTAUX (avant pagination)
    // ============================================
    const summary = {
      totalRevenue: 0,
      totalCost: 0,
      totalMargin: 0,
      marginPercent: 0,
      documentCount: filteredDocuments.length,
      btCount: filteredDocuments.filter(d => d.type === 'BT').length,
      blCount: filteredDocuments.filter(d => d.type === 'BL').length,
      soumCount: filteredDocuments.filter(d => d.type === 'Soum.').length,
    };

    filteredDocuments.forEach(doc => {
      summary.totalRevenue += doc.revenue;
      summary.totalCost += doc.cost;
      summary.totalMargin += doc.margin;
    });

    summary.totalRevenue = Math.round(summary.totalRevenue * 100) / 100;
    summary.totalCost = Math.round(summary.totalCost * 100) / 100;
    summary.totalMargin = Math.round(summary.totalMargin * 100) / 100;
    summary.marginPercent = summary.totalRevenue > 0
      ? Math.round((summary.totalMargin / summary.totalRevenue) * 10000) / 100
      : 0;

    // ============================================
    // 7. PAGINATION
    // ============================================
    const total = filteredDocuments.length;
    const paginatedDocuments = filteredDocuments.slice(page * limit, (page + 1) * limit);

    return Response.json({
      success: true,
      data: {
        documents: paginatedDocuments,
        summary,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Erreur API Statistics:', error);
    return Response.json(
      { success: false, error: 'Erreur serveur lors de la récupération des statistiques' },
      { status: 500 }
    );
  }
}
