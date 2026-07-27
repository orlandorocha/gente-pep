import { createServerFn } from "@tanstack/react-start";

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

    // Usar supabaseAdmin que já tem autenticação de servidor
    const { supabaseAdmin } = await import("@/integrations/custom-supabase/client.server");

    // Deletar todos os registros da tabela
    const { error, count } = await supabaseAdmin
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
