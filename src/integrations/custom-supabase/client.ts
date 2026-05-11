// Custom Supabase client — aponta para o banco PRÓPRIO do usuário
// (não gerenciado pelo Lovable Cloud). Os valores abaixo são publicáveis
// (URL + chave anônima) — seguros para o bundle do navegador.
//
// Para apontar para outro projeto no futuro, basta editar as constantes
// CUSTOM_SUPABASE_URL e CUSTOM_SUPABASE_PUBLISHABLE_KEY abaixo.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const CUSTOM_SUPABASE_URL = "https://vhgbtofajpxcdwvkymxr.supabase.co";
const CUSTOM_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_4WxZjxZOLLdDf_mh0yOwfg_5EA0TK9y";

function createCustomClient() {
  return createClient<Database>(
    CUSTOM_SUPABASE_URL,
    CUSTOM_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        storage: typeof window !== "undefined" ? localStorage : undefined,
        persistSession: true,
        autoRefreshToken: true,
      },
    },
  );
}

let _client: ReturnType<typeof createCustomClient> | undefined;
let _sessionReady: Promise<void> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createCustomClient>, {
  get(_, prop, receiver) {
    if (!_client) _client = createCustomClient();
    return Reflect.get(_client, prop, receiver);
  },
});

export async function ensureAuthSessionReady() {
  if (typeof window === "undefined") return;
  if (!_sessionReady) {
    _sessionReady = supabase.auth.getSession().then(() => undefined);
  }
  await _sessionReady;
}
