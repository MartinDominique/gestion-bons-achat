import { supabase } from '../../../../lib/supabase';
import Papa from 'papaparse';

export async function POST(req) {
  try {
    // ------- lire le fichier --------
    const data = await req.formData();
    const file = data.get('file');
    if (!file) {
      return Response.json({ error: 'missing file' }, { status: 400 });
    }

    const text = await file.text();

    // ------- parser CSV --------
    const { data: rows, errors } = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
    });

    if (errors.length) {
      return Response.json({ error: errors[0].message }, { status: 400 });
    }

    // ------- upsert dans Supabase --------
    const { error } = await supabase.from('products').upsert(rows, {
      onConflict: 'product_id', // ajuste selon ta clé unique
    });

    if (error) {
      return Response.json({ error }, { status: 500 });
    }

    return Response.json({ rows: rows.length });
  } catch (err) {
    console.error(err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
