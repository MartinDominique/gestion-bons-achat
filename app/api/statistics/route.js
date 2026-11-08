/**
 * @file app/api/statistics/route.js
 * @description API endpoint pour les rapports et statistiques de ventes (BT, BL, Soumissions)
 *              - GET: documents agrégés + résumé, calcul délégué à lib/services/statistics-data.js
 *              - Filtres: type, dates, client, n° document, description, produit/item (code OU
 *                description, dans les matériaux ET les lignes de facture), facturé / non facturé
 *              - Tri + pagination côté serveur (limit jusqu'à 5000 pour l'export PDF complet)
 *              - La facture fait foi: BT/BL facturé → revenu = sous-total de la facture (M.O. +
 *                transport + matériaux + forfait); non facturé → estimation complète depuis le
 *                document (heures × taux client + déplacements + matériaux), drapeau `estimated`
 *              - Coûts: matériaux par product_id OU product_code (products puis
 *                non_inventory_items) + M.O. × coût horaire interne (Paramètres)
 *              - Soumissions listées mais exclues des totaux de ventes (summary.soumValue à part)
 * @version 2.0.0
 * @date 2026-11-08
 * @changelog
 *   2.0.0 - Refonte du calcul (bug: BT de ~3 500 $ affiché « Revenu 107 $, coûts 1 $ »):
 *           v1 ne comptait que les matériaux (M.O. et transport ignorés) et cherchait le coûtant
 *           par product_id seul (souvent NULL → 0). Désormais: facture liée si elle existe,
 *           sinon estimation complète; coûtant par code; ventilation revenu/coût; drapeaux
 *           source/estimated; factures + BA/soumission liés renvoyés pour consultation; filtre
 *           « Produit / Item » enfin fonctionnel; filtre facturé/non facturé; lecture paginée;
 *           erreurs Supabase remontées en 500 (plus de « succès » vide); limit max 5000
 *   1.1.0 - BT/BL: invoice_id lu + champ isDeduction (fermé par déduction « Varia », aucune
 *           facture) pour la mention dans le rapport; force-dynamic (règle routes GET)
 *   1.0.0 - Version initiale - Phase 1 MVP
 */

import { buildSalesStatistics } from '../../../lib/services/statistics-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const type = searchParams.get('type') || 'all';
    const types = type === 'all' ? ['bt', 'bl', 'soumission'] : type.split(',').map((t) => t.trim()).filter(Boolean);
    const page = Math.max(0, parseInt(searchParams.get('page') || '0', 10) || 0);
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50), 5000);

    const { documents, summary } = await buildSalesStatistics({
      types,
      dateFrom: searchParams.get('dateFrom') || null,
      dateTo: searchParams.get('dateTo') || null,
      clientId: searchParams.get('clientId') || null,
      documentNumber: searchParams.get('documentNumber') || null,
      search: searchParams.get('search') || null,
      productSearch: searchParams.get('productId') || null,
      invoiced: searchParams.get('invoiced') || 'all',
      sortBy: searchParams.get('sortBy') || 'date',
      sortOrder: searchParams.get('sortOrder') || 'desc',
    });

    const total = documents.length;
    return Response.json(
      {
        success: true,
        data: { documents: documents.slice(page * limit, (page + 1) * limit), summary },
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Erreur API Statistics:', error);
    return Response.json(
      { success: false, error: error.message || 'Erreur serveur lors de la récupération des statistiques' },
      { status: 500 }
    );
  }
}
