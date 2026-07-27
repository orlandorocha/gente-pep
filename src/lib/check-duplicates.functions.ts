import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

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

export interface FeriaAVerificar {
  colaborador_id: string;
  inicio: string;
  fim: string;
  periodo_aquisitivo: string;
}

export interface FeriaDuplicada {
  id: string;
  status: string;
  inicio: string;
  fim: string;
  periodo_aquisitivo: string;
}

export interface VerificacaoDuplicatas {
  registroId: string;
  temDuplicata: boolean;
  duplicatas: FeriaDuplicada[];
}

/**
 * Verifica se uma féria já existe na base de dados
 * Considera duplicata se tiver:
 * - Mesmo colaborador
 * - Mesma data de início
 * - Mesma data de fim
 * (Período aquisitivo é informativo)
 */
export const verificarFeriasDuplicadas = createServerFn({ method: "POST" }).handler(
  async (ferias: FeriaAVerificar[]): Promise<VerificacaoDuplicatas[]> => {
    if (!ferias || ferias.length === 0) {
      return [];
    }

    try {
      const supabase = await getAuthenticatedClient();

      const resultados: VerificacaoDuplicatas[] = [];

      // Para cada féria, verificar se existe uma igual na base
      for (const feria of ferias) {
        const { data: existentes, error } = await supabase
          .from("ferias")
          .select("id, status, inicio, fim, periodo_aquisitivo")
          .eq("colaborador_id", feria.colaborador_id)
          .eq("inicio", feria.inicio)
          .eq("fim", feria.fim);

        if (error) {
          console.error("[v0] Erro ao verificar duplicatas:", error);
          resultados.push({
            registroId: `${feria.colaborador_id}|${feria.inicio}|${feria.fim}`,
            temDuplicata: false,
            duplicatas: [],
          });
          continue;
        }

        resultados.push({
          registroId: `${feria.colaborador_id}|${feria.inicio}|${feria.fim}`,
          temDuplicata: (existentes?.length ?? 0) > 0,
          duplicatas: existentes ?? [],
        });
      }

      return resultados;
    } catch (err) {
      console.error("[v0] Erro verificarFeriasDuplicadas:", err);
      throw err;
    }
  }
);
