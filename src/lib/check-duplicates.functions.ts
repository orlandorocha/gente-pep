import { createServerFn } from "@tanstack/react-start";
import type { Database } from "@/integrations/supabase/types";

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
      const { supabaseAdmin } = await import("@/integrations/custom-supabase/client.server");

      const resultados: VerificacaoDuplicatas[] = [];

      // Para cada féria, verificar se existe uma igual na base
      for (const feria of ferias) {
        const { data: existentes, error } = await supabaseAdmin
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
