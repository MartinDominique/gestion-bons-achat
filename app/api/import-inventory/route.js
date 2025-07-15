import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import Papa from 'papaparse';

export async function POST(req) {
  // --- client Supabase AVEC session (cookies) ---
  const supabase = createRouteHandlerClient({ cookies });

  // --- Vérifier la session (debug) -------------
  const { data: dbg } = await supabase.auth.getUser();
  console.log('import-inventory | uid =', dbg.user?.id ?? 'null');
  if (!dbg.user) {
    return Response.json({ error: 'not authenticated' }, { status: 401 });
  }

  // --- Récupérer le fichier --------------------
  const form = await req.formData();
  const file = form.get('file');
  if (!file) {
    return Response.json({ error: 'missing file' }, { status: 400 });
  }
  const csvText = await file.text();

  // --- Parser CSV (sans en‑têtes) --------------
  const { data: rows, errors } = Papa.parse(csvText, {
    header: false,
    skipEmptyLines: true,
  });
  if (errors.length) {
    return Response.json({ error: errors[0].message }, { status: 400 });
  }

  // --- Mapper colonnes -> champs ---------------
  const mapped = rows.map((c) => ({
    product_id:    c[0]?.trim(),
    description:   c[1]?.trim(),
    selling_price: parseFloat(c[2]) || 0,
    cost_price:    parseFloat(c[3]) || 0,
  }));

  // --- Upsert dans la table 'products' ---------
  const { error } = await supabase.from('products')
    .upsert(mapped, { onConflict: 'product_id' });

  if (error) {
    console.error('upsert error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ rows: mapped.length });   // ← succès 200
}
