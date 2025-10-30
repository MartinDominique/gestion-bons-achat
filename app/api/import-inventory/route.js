import { supabaseAdmin as supabase } from '../../../lib/supabaseAdmin';
import Papa from 'papaparse';

export async function POST(req) {
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
    skipEmptyLines: true
  });
  // Fonction pour parser les nombres avec virgule OU point
const parsePrice = (value) => {
  if (!value) return 0;
  const str = value.toString().trim();
  // Remplacer virgule par point pour parseFloat
  const normalized = str.replace(',', '.');
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
};
  if (errors.length) {
    return Response.json({ error: errors[0].message }, { status: 400 });
  }

  /* ---------- mapping colonnes -> champs ---------- */
  const mapped = rows.map((c) => ({
    product_group:  c[0]?.trim(),             // ← retire si ta table n’a pas cette colonne
    product_id:     c[1]?.trim(),             // ← clé unique
    description:    c[2]?.trim(),
    unit:           c[3]?.trim(),             // ← retire si ta table n’a pas 'unit'
    selling_price:  parsePrice(c[4]),
    cost_price:     parsePrice(c[5]),
    stock_qty:      parsePrice(c[6])     // ← retire si ta table n’a pas 'stock_qty'
  }));
  
/* ---- dé‑duplication par product_id ---- */
const uniqueById = new Map();
for (const row of mapped) {
  if (!uniqueById.has(row.product_id)) {
    uniqueById.set(row.product_id, row);   // garde la 1ʳᵉ occurrence
  }
}
const deduped = [...uniqueById.values()];

  /* ---------- UPSERT dans products ---------- */
  const { error } = await supabase
    .from('products')
    .upsert(deduped, { onConflict: 'product_id' });

  if (error) {
    console.error('upsert error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  /* ---------- succès ---------- */
  return Response.json({ rows: mapped.length });
}
