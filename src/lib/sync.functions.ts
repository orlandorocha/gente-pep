import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/custom-supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { sincronizarFaltasDiaAtualComClient } from "@/lib/sync.service";

type DbClient = SupabaseClient<Database>;

export async function sincronizarFaltasDiaAtual() {
  return sincronizarFaltasDiaAtualComClient(supabaseAdmin);
}

export const sincronizarFaltasDoDia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => sincronizarFaltasDiaAtualComClient(context.supabase as DbClient));
