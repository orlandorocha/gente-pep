import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const VALID_TABLES = [
  "ferias",
  "faltas",
  "colaboradores",
  "agendamentos",
  "escalas",
  "licencas",
  "tarefas",
] as const;

type ValidTableName = (typeof VALID_TABLES)[number];

interface DeleteAllInput {
  tableName: string;
  adminEmail: string;
}

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

export const deleteAllRecords = createServerFn({ method: "POST" }).handler(
  async (input: DeleteAllInput) => {
    // Validar tableName
    if (!input?.tableName || !VALID_TABLES.includes(input.tableName as ValidTableName)) {
      throw new Error(`Tabela inválida: ${input?.tableName}`);
    }

    // Validar email do admin
    if (!input?.adminEmail || typeof input.adminEmail !== "string") {
      throw new Error("Email do admin não fornecido");
    }

    // Verificar se é admin
    const adminEmail = import.meta.env.VITE_ADMIN_ACCESS_EMAIL;
    if (input.adminEmail !== adminEmail) {
      throw new Error("Acesso negado: apenas admin pode deletar");
    }

    // Obter cliente autenticado com o token da requisição
    const supabase = await getAuthenticatedClient();

    // Deletar todos os registros da tabela
    const { error, count } = await supabase
      .from(input.tableName as ValidTableName)
      .delete()
      .neq("id", "");

    if (error) {
      console.error(`[v0] Erro ao deletar ${input.tableName}:`, error);
      throw new Error(`Erro ao deletar registros: ${error.message}`);
    }

    return { success: true, deletedCount: count || 0 };
  }
);
