import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import Papa from 'papaparse';

export async function POST(req) {
  const supabase = createRouteHandlerClient({ cookies });

  // debug : vérifier la session
  const { data: dbg } = await supabase.auth.getUser();
  if (!dbg.user) {
    return Response.json({ error: 'not authenticated' }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!file) return Response.json({ error: 'missing file' }, { status: 400 });

  const csvText = await file.text();

  // parse CSV sans en‑têtes
  const { data: rows, errors } = Papa.parse(csvText, {
    header: false,
    skipEmptyLines: true,
  });
  if (errors.length) {
    return Response.json({ error: errors[0].message }, { status: 400 });
  }

  // mapping index -> champs
  const mapped = rows.map((c) => ({
    product_id:    c[1]?.trim(),                 // index 1
    description:   c[2]?.trim(),                 // index 2
    unit:          c[3]?.trim(),                 // index 3 (si ta table a 'unit')
    selling_price: parseFloat(c[4]) || 0,        // index 4
    cost_price:    parseFloat(c[5]) || 0,        // index 5
    stock_qty:     parseFloat(c[6]) || 0         // index 6 (si ta table a 'stock_qty')
  }));

  // upsert
  const { error } = await supabase
    .from('products')
    .upsert(mapped, { onConflict: 'product_id' });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ rows: mapped.length });
}
