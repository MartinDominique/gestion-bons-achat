import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import Papa from 'papaparse';

export async function POST(req) {
  const supabase = createRouteHandlerClient({ cookies });

  const data = await req.formData();
  
  const file = data.get('file');
  if (!file) return Response.json({ error: 'missing file' }, { status: 400 });

  const csvText = await file.text();

  // --- parse sans en‑têtes ---
  const { data: rows, errors } = Papa.parse(csvText, { header: false, skipEmptyLines: true });
  if (errors.length) return Response.json({ error: errors[0].message }, { status: 400 });

  // --- mapper positions -> champs ---
  const mapped = rows.map((cols) => ({
    product_id: cols[0]?.trim(),
    description: cols[1]?.trim(),
    selling_price: parseFloat(cols[2]) || 0,
    cost_price:   parseFloat(cols[3]) || 0
    // ajoute d'autres positions si besoin
  }));

  const { error } = await supabase.from('products').upsert(mapped, {
    onConflict: 'product_id',
  });
  if (error) return Response.json({ error }, { status: 500 });

  return Response.json({ rows: mapped.length });
}
