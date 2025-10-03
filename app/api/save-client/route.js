//gestion-bons-achat/app/api/save-client/route.js

import { supabaseAdmin as supabase } from '../../../lib/supabaseAdmin';

export async function POST(req) {
  const body = await req.json();             // { name, company, email, phone, id? }

  const { error } = await supabase
    .from('clients')
    .upsert(body)                            // service_role → ignore RLS
    .select();                               // retourne la ligne insérée

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
