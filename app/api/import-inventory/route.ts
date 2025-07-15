import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get('file') as File;

  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const text = await file.text();
  const { data } = Papa.parse(text.trim(), { header: false });

  const rows = data.map((r: any[]) => ({
    product_group : r[0]?.toString(),
    product_id    : r[1]?.toString(),
    description   : r[2],
    unit_code     : r[3],
    selling_price : parseFloat(r[4]),
    cost_price    : parseFloat(r[5]),
    qty_stock     : parseInt(r[6] ?? 0),
    last_updated  : new Date().toISOString()
  }));

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!
  );

  const { error } = await supabase.from('products').upsert(rows, { onConflict: 'product_id' });
  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({ rows: rows.length });
}
