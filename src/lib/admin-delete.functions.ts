import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const DeleteAllSchema = z.object({
  tableName: z.enum([
    "ferias",
    "faltas",
    "colaboradores",
    "agendamentos",
    "escalas",
    "licencas",
    "tarefas",
  ]),
  adminEmail: z.string().email(),
});

// Helper para criar cliente Supabase autenticado no servidor
async function getAuthenticatedClient() {
  const request = getRequest();
  const authHeader = request?.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    throw new Error("Autenticação necessária");
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Variáveis Supabase não configuradas");
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export const deleteAllRecords = createServerFn({ method: "POST" })
  .inputValidator((d) => DeleteAllSchema.parse(d))
  .handler(async ({ data }) => {
    // Verificar se é admin
    const adminEmail = import.meta.env.VITE_ADMIN_ACCESS_EMAIL;
    if (data.adminEmail !== adminEmail) {
      throw new Error("Acesso negado: apenas admin pode deletar");
    }

    // Obter cliente autenticado com o token da requisição
    const supabase = await getAuthenticatedClient();

    // Deletar todos os registros da tabela
    const { error, count } = await supabase
      .from(data.tableName)
      .delete()
      .neq("id", "");

    if (error) {
      console.error(`[v0] Erro ao deletar ${data.tableName}:`, error);
      throw new Error(`Erro ao deletar registros: ${error.message}`);
    }

    return { success: true, deletedCount: count || 0 };
  });
