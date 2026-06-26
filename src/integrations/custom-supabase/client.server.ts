// Admin server client — reutiliza a instância oficial em
// `@/integrations/supabase/client.server` para garantir uma única configuração
// de service role.
export { supabaseAdmin } from "@/integrations/supabase/client.server";
