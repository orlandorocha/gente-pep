// Custom Supabase admin client — service role do banco PRÓPRIO.
// Lê de secrets do servidor: CUSTOM_SUPABASE_URL e
// CUSTOM_SUPABASE_SERVICE_ROLE_KEY. NUNCA importar em código de cliente.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const FALLBACK_CUSTOM_SUPABASE_URL = "https://vhgbtofajpxcdwvkymxr.supabase.co";

function createCustomAdminClient() {
  const URL = process.env.CUSTOM_SUPABASE_URL
    || process.env.SUPABASE_URL
    || FALLBACK_CUSTOM_SUPABASE_URL;
  const KEY = process.env.CUSTOM_SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !KEY) {
    const missing = [
      ...(!URL ? ["CUSTOM_SUPABASE_URL ou SUPABASE_URL"] : []),
      ...(!KEY ? ["CUSTOM_SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SERVICE_ROLE_KEY"] : []),
    ];
    throw new Error(
      `Custom Supabase admin client missing secret(s): ${missing.join(", ")}`,
    );
  }
  return createClient<Database>(URL, KEY, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _admin: ReturnType<typeof createCustomAdminClient> | undefined;

export const supabaseAdmin = new Proxy(
  {} as ReturnType<typeof createCustomAdminClient>,
  {
    get(_, prop, receiver) {
      if (!_admin) _admin = createCustomAdminClient();
      return Reflect.get(_admin, prop, receiver);
    },
  },
);
