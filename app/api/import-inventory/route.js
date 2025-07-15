import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import Papa from 'papaparse';

export async function POST(req) {
  /* ---------- client Supabase avec session ---------- */
  const supabase = createRouteHandlerClient({ cookies });

  // DEBUG : vérifier l’UID
  const { data: dbg } = await supabase.auth.getUser();
  console.log('import-inventory | uid =', dbg.user?.id ?? 'null');
  if (!dbg.user) {
    return Response.json({ error: 'not authenticated' }, { status: 401 });
  }

  /* ---------- récupérer le fichier CSV ---------- */
  const form = await req.formData();
  const file = form.get('file');
  if (!file) {
    return Response.json({ error: 'missing file' }, { status: 400 });
  }
  const csvText = await file.text();

  /* ---------- parser CSV (sans en‑têtes) ---------- */
  const { data: rows, errors } = Papa.parse(csvText, {
    header: false,
    skipEmptyLines: true,
  });
  if (errors.length) {
    return Response.json({ error: errors[0].message }, { status: 400 });
  }

  /* ---------- mapping colonnes -> champs ---------- */
  const mapped = rows.map((c) => ({
  product_id:    c[1]?.trim(),
  description:   c[2]?.trim(),
  selling_price: parseFloat(c[4]) || 0,
  cost_price:    parseFloat(c[5]) || 0,
  created_by:    dbg.user.id        // ← important si tu gardes la policy ALL
}));

  /* ---------- UPSERT dans products ---------- */
  const { error } = await supabase
    .from('products')
    .upsert(mapped, { onConflict: 'product_id' });

  if (error) {
    console.error('upsert error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ rows: mapped.length });   // succès
}
