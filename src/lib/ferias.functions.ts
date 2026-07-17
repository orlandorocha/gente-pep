import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/custom-supabase/client.server";
import { notifyVacationRequest } from "./notifications.server";
import { sincronizarFaltasDiaAtual } from "./sync.functions";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type FeriasExistente = {
  id: string;
  inicio: string;
  fim: string;
  status: string;
  periodo_aquisitivo: string;
};

export type ValidarFeriasResult = {
  existe: boolean;
  ferias: FeriasExistente[];
  colaboradorId?: string;
};

export type FeriaDuplicada = {
  id: string;
  colaborador_id: string;
  colaborador_nome: string;
  inicio: string;
  fim: string;
  status: string;
  periodo_aquisitivo: string;
  ano: number;
};

export type GrupoFeriasDuplicadas = {
  colaborador_id: string;
  colaborador_nome: string;
  ano: number;
  periodo_aquisitivo: string;
  ferias: FeriaDuplicada[];
};

export type DetectarDuplicatasResult = {
  total: number;
  grupos: GrupoFeriasDuplicadas[];
};

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

export const detectarFeriasDuplicadas = createServerFn({ method: "POST" })
  .handler(async (): Promise<DetectarDuplicatasResult> => {
    try {
      // Usa cliente com contexto de autenticação (token do header)
      const supabase = await getAuthenticatedClient();

      // Busca todas as férias ativas do usuário autenticado
      // RLS garante que só vê o que tem permissão
      const { data: todasFerias, error: feriasError } = await supabase
        .from("ferias")
        .select("id, colaborador_id, inicio, fim, status, periodo_aquisitivo")
        .in("status", ["Pendente", "Aprovada", "Em gozo", "Concluída"])
        .order("colaborador_id, inicio");

      if (feriasError) {
        console.error("[v0] Erro ao buscar férias:", feriasError);
        throw new Error(`Erro ao buscar férias: ${feriasError.message}`);
      }

      if (!todasFerias || todasFerias.length === 0) {
        return { total: 0, grupos: [] };
      }

      // Busca nomes dos colaboradores
      const colabIds = Array.from(new Set(todasFerias.map((f) => f.colaborador_id)));
      const { data: colaboradores, error: colabError } = await supabase
        .from("colaboradores")
        .select("id, nome")
        .in("id", colabIds);

      if (colabError) {
        console.error("[v0] Erro ao buscar colaboradores:", colabError);
        throw new Error(`Erro ao buscar colaboradores: ${colabError.message}`);
      }

      const colabMap = new Map(colaboradores?.map((c) => [c.id, c.nome]) ?? []);

      // Agrupar por colaborador + periodo_aquisitivo para detectar duplicatas
      const grupos = new Map<string, GrupoFeriasDuplicadas>();

      for (const feria of todasFerias) {
        const anoInicio = new Date(feria.inicio).getFullYear();
        const chave = `${feria.colaborador_id}|${feria.periodo_aquisitivo}|${anoInicio}`;

        if (!grupos.has(chave)) {
          grupos.set(chave, {
            colaborador_id: feria.colaborador_id,
            colaborador_nome: colabMap.get(feria.colaborador_id) ?? "Desconhecido",
            ano: anoInicio,
            periodo_aquisitivo: feria.periodo_aquisitivo,
            ferias: [],
          });
        }

        grupos.get(chave)!.ferias.push({
          id: feria.id,
          colaborador_id: feria.colaborador_id,
          colaborador_nome: colabMap.get(feria.colaborador_id) ?? "Desconhecido",
          inicio: feria.inicio,
          fim: feria.fim,
          status: feria.status,
          periodo_aquisitivo: feria.periodo_aquisitivo,
          ano: anoInicio,
        });
      }

      // Filtrar apenas grupos com duplicatas (mais de 1 féria)
      const duplicatas = Array.from(grupos.values()).filter((g) => g.ferias.length > 1);

      return {
        total: duplicatas.reduce((sum, g) => sum + (g.ferias.length - 1), 0),
        grupos: duplicatas,
      };
    } catch (error) {
      console.error("[v0] Erro detectarFeriasDuplicadas:", error);
      throw error;
    }
  });

const DeletarFeriasSchema = z.object({
  feriaIds: z.array(z.string().uuid()).min(1, "Selecione pelo menos uma féria"),
});

export const deletarFeriasDuplicadas = createServerFn({ method: "POST" })
  .inputValidator((d) => DeletarFeriasSchema.parse(d))
  .handler(async ({ data }) => {
    try {
      // Usa cliente com contexto de autenticação
      const supabase = await getAuthenticatedClient();

      // Deleta apenas as férias especificadas
      // RLS garante que só pode deletar o que tem permissão
      const { error } = await supabase
        .from("ferias")
        .delete()
        .in("id", data.feriaIds);

      if (error) {
        console.error("[v0] Erro ao deletar férias:", error);
        throw new Error(`Erro ao deletar férias: ${error.message}`);
      }

      // Re-sincroniza jornadas após deleção
      await sincronizarFaltasDiaAtual();

      return { ok: true, deletadas: data.feriaIds.length };
    } catch (error) {
      console.error("[v0] Erro deletarFeriasDuplicadas:", error);
      throw error;
    }
  });

const ValidarFeriasSchema = z.object({
  gpid: z.string().min(1, "GPID obrigatório"),
  nome: z.string().min(1, "Nome obrigatório"),
});

export const validarFeriasExistente = createServerFn({ method: "POST" })
  .inputValidator((d) => ValidarFeriasSchema.parse(d))
  .handler(async ({ data }): Promise<ValidarFeriasResult> => {
    try {
      // Busca colaborador por GPID e nome
      const { data: colaboradores, error: colabError } = await supabaseAdmin
        .from("colaboradores")
        .select("id, gpid, nome")
        .eq("gpid", data.gpid)
        .ilike("nome", `%${data.nome}%`)
        .limit(1);

      if (colabError) throw new Error(colabError.message);

      if (!colaboradores || colaboradores.length === 0) {
        return { existe: false, ferias: [] };
      }

      const colaboradorId = colaboradores[0].id;

      // Busca férias do colaborador (exceto Recusada)
      const { data: ferias, error: feriasError } = await supabaseAdmin
        .from("ferias")
        .select("id, inicio, fim, status, periodo_aquisitivo")
        .eq("colaborador_id", colaboradorId)
        .in("status", ["Pendente", "Aprovada", "Em gozo", "Concluída"])
        .order("inicio", { ascending: true });

      if (feriasError) throw new Error(feriasError.message);

      return {
        existe: (ferias ?? []).length > 0,
        ferias: ferias ?? [],
        colaboradorId,
      };
    } catch (error) {
      console.error("[v0] Erro validarFeriasExistente:", error);
      throw error;
    }
  });

const SolicitarSchema = z.object({
  colaboradorNome: z.string().min(1),
  gestorNome: z.string().min(1),
  gestorEmail: z.string().email(),
  gestorTeamsUserId: z.string().nullable().optional(),
  inicio: z.string().min(10).max(10),
  fim: z.string().min(10).max(10),
  periodoAquisitivo: z.string().min(4).max(20),
  token: z.string().uuid(),
});

export const solicitarFerias = createServerFn({ method: "POST" })
  .inputValidator((d) => SolicitarSchema.parse(d))
  .handler(async ({ data }) => {
    const notify = await notifyVacationRequest({
      colaboradorNome: data.colaboradorNome,
      gestorNome: data.gestorNome,
      gestorEmail: data.gestorEmail,
      gestorTeamsUserId: data.gestorTeamsUserId,
      inicio: data.inicio,
      fim: data.fim,
      periodoAquisitivo: data.periodoAquisitivo,
      token: data.token,
    });

    return { ok: true, notify };
  });

const DecideSchema = z.object({
  feriasId: z.string().uuid(),
  acao: z.enum(["aprovar", "recusar"]),
  motivo: z.string().max(500).optional(),
});

const AtualizarSchema = z.object({
  feriasId: z.string().uuid(),
  inicio: z.string().min(10).max(10),
  fim: z.string().min(10).max(10),
  periodoAquisitivo: z.string().min(4).max(20),
  status: z.enum(["Pendente", "Aprovada", "Recusada", "Em gozo", "Concluída"]),
});

export const decidirFerias = createServerFn({ method: "POST" })
  .inputValidator((d) => DecideSchema.parse(d))
  .handler(async ({ data }) => {
    const novo = data.acao === "aprovar" ? "Aprovada" : "Recusada";
    const { error } = await supabaseAdmin
      .from("ferias")
      .update({
        status: novo,
        decidido_em: new Date().toISOString(),
        decidido_por: "in-app",
        motivo_recusa: data.acao === "recusar" ? data.motivo ?? null : null,
      })
      .eq("id", data.feriasId)
      .eq("status", "Pendente");
    if (error) throw new Error(error.message);
    await sincronizarFaltasDiaAtual();
    return { ok: true, status: novo };
  });

export const atualizarFerias = createServerFn({ method: "POST" })
  .inputValidator((d) => AtualizarSchema.parse(d))
  .handler(async ({ data }) => {
    if (data.fim < data.inicio) {
      throw new Error("Fim deve ser após o início");
    }

    const { error } = await supabaseAdmin
      .from("ferias")
      .update({
        inicio: data.inicio,
        fim: data.fim,
        periodo_aquisitivo: data.periodoAquisitivo,
        status: data.status,
      })
      .eq("id", data.feriasId);

    if (error) throw new Error(error.message);
    await sincronizarFaltasDiaAtual();
    return { ok: true };
  });
