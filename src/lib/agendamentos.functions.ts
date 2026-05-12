import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/custom-supabase/client.server";
import { sincronizarFaltasDiaAtual } from "@/lib/sync.functions";
import { formatLocalDateISO } from "@/lib/utils";

const TIPOS = ["De bem com a vida", "Aniversário", "Hora Extra"] as const;

const Schema = z.object({
  colaboradorId: z.string().uuid(),
  tipo: z.enum(TIPOS),
  titulo: z.string().min(2).max(120),
  data: z.string().min(10).max(10),
  hora: z.string().min(5).max(8),
  prioridade: z.enum(["Baixa", "Média", "Alta"]).default("Média"),
  observacao: z.string().max(500).optional(),
});

export const criarAgendamento = createServerFn({ method: "POST" })
  .inputValidator((d) => Schema.parse(d))
  .handler(async ({ data }) => {
    // Regras de limite
    if (data.tipo === "De bem com a vida" || data.tipo === "Aniversário") {
      const limite = data.tipo === "De bem com a vida" ? 3 : 1;
      const { count, error: cErr } = await supabaseAdmin
        .from("agendamentos")
        .select("id", { count: "exact", head: true })
        .eq("colaborador_id", data.colaboradorId)
        .eq("tipo", data.tipo)
        .neq("status", "Cancelado");
      if (cErr) throw new Error(cErr.message);
      if ((count ?? 0) >= limite) {
        const msg =
          data.tipo === "De bem com a vida"
            ? "Limite de 3 agendamentos de De bem com a vida atingido para este colaborador."
            : "Aniversário já agendado/gozado para este colaborador.";
        throw new Error(msg);
      }
    }

    const { data: row, error } = await supabaseAdmin
      .from("agendamentos")
      .insert({
        colaborador_id: data.colaboradorId,
        tipo: data.tipo,
        titulo: data.titulo,
        data: data.data,
        hora: data.hora,
        prioridade: data.prioridade,
        observacao: data.observacao ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (data.data === formatLocalDateISO()) {
      await sincronizarFaltasDiaAtual();
    }

    return { id: row.id };
  });
