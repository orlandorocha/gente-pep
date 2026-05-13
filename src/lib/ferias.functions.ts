import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/custom-supabase/client.server";
import { notifyVacationRequest } from "./notifications.server";
import { sincronizarFaltasDiaAtual } from "./sync.functions";

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
