import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
…
export async function POST(req) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: dbg } = await supabase.auth.getUser();
  if (!dbg.user) {
    return Response.json({ error: 'not authenticated' }, { status: 401 });
  }
  …
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
  // c[0] = numéro de ligne (ignoré)
  product_id:    c[1]?.trim(),          // index 1
  description:   c[2]?.trim(),          // index 2
  selling_price: parseFloat(c[4]) || 0, // index 4
  cost_price:    parseFloat(c[5]) || 0  // index 5
  // si ta table a d'autres colonnes (unit, stock_qty),
  // ajoute-les ici et dans la table
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
