import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,       // ← URL publique
  process.env.SUPABASE_SERVICE_ROLE_KEY,      // ← clé service_role (privée)
  { auth: { persistSession: false } }
);
