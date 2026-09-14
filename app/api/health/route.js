/**
 * @file app/api/health/route.js
 * @description Vérification de santé de la base de données (Supabase)
 *              - GET: exécute une lecture minimale (settings id=1) avec chronométrage
 *                et délai maximal, puis renvoie ok / latence / message d'erreur.
 *              - Sert au voyant « Base de données » de la navigation (DbStatusBadge)
 *                pour distinguer un Supabase lent/indisponible d'un problème local.
 * @version 1.0.0
 * @date 2026-09-14
 * @changelog
 *   1.0.0 - Version initiale (diagnostic DB lente / 500 en cascade)
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Au-delà de cette latence, la base est considérée « lente » (voyant orange)
const SLOW_MS = 1500;
// Délai maximal d'attente avant de déclarer la base injoignable
const TIMEOUT_MS = 8000;

/**
 * GET /api/health
 * Ping de la base de données. Toujours 200 (le contenu porte le diagnostic),
 * sauf 503 si la base ne répond pas — pratique pour un moniteur externe.
 */
export async function GET() {
  const started = Date.now();
  let dbOk = false;
  let dbError = null;

  try {
    const probe = supabaseAdmin
      .from('settings')
      .select('id')
      .eq('id', 1)
      .maybeSingle();

    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Aucune réponse de la base après ${TIMEOUT_MS / 1000} s`)), TIMEOUT_MS)
    );

    const { error } = await Promise.race([probe, timeout]);
    if (error) {
      dbError = error.message;
    } else {
      dbOk = true;
    }
  } catch (err) {
    dbError = err.message;
  }

  const latency = Date.now() - started;
  const status = !dbOk ? 'down' : latency > SLOW_MS ? 'slow' : 'ok';

  return NextResponse.json(
    {
      success: true,
      status,
      db: { ok: dbOk, latency_ms: latency, error: dbError, slow_threshold_ms: SLOW_MS },
      checked_at: new Date().toISOString(),
    },
    { status: dbOk ? 200 : 503 }
  );
}
