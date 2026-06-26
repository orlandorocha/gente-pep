// Cliente Supabase unificado — aponta para a base de dados oficial do projeto.
// Reaproveita o mesmo cliente de `@/integrations/supabase/client` para evitar
// múltiplas instâncias e divergências de configuração.
export { supabase } from "@/integrations/supabase/client";

export async function ensureAuthSessionReady() {
  if (typeof window === "undefined") return;
  const { supabase } = await import("@/integrations/supabase/client");
  await supabase.auth.getSession();
}
