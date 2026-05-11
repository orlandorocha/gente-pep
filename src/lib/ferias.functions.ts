import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/custom-supabase/client.server";
import { notifyVacationRequest } from "./notifications.server";

const SolicitarSchema = z.object({
  colaboradorId: z.string().uuid(),
  inicio: z.string().min(10).max(10),
  fim: z.string().min(10).max(10),
  periodoAquisitivo: z.string().min(4).max(20),
});

export const solicitarFerias = createServerFn({ method: "POST" })
  .inputValidator((d) => SolicitarSchema.parse(d))
  .handler(async ({ data }) => {
    const { data: colab, error: cErr } = await supabaseAdmin
      .from("colaboradores")
      .select("id, nome, gestor_id")
      .eq("id", data.colaboradorId)
      .maybeSingle();
    if (cErr || !colab) throw new Error("Colaborador não encontrado");

    const { data: ferias, error } = await supabaseAdmin
      .from("ferias")
      .insert({
        colaborador_id: data.colaboradorId,
        gestor_id: colab.gestor_id,
        inicio: data.inicio,
        fim: data.fim,
        periodo_aquisitivo: data.periodoAquisitivo,
        status: "Pendente",
      })
      .select("id, token_aprovacao")
      .single();
    if (error) throw new Error(error.message);

    let notify: { email?: any; teams?: any; skipped?: string } = {};
    if (colab.gestor_id) {
      const { data: gestor } = await supabaseAdmin
        .from("gestores")
        .select("nome, email, teams_user_id")
        .eq("id", colab.gestor_id)
        .maybeSingle();
      if (gestor) {
        notify = await notifyVacationRequest({
          colaboradorNome: colab.nome,
          gestorNome: gestor.nome,
          gestorEmail: gestor.email,
          gestorTeamsUserId: gestor.teams_user_id,
          inicio: data.inicio,
          fim: data.fim,
          periodoAquisitivo: data.periodoAquisitivo,
          token: ferias.token_aprovacao,
        });
      } else {
        notify.skipped = "Gestor não encontrado";
      }
    } else {
      notify.skipped = "Colaborador sem gestor cadastrado";
    }

    return { id: ferias.id, notify };
  });

const DecideSchema = z.object({
  feriasId: z.string().uuid(),
  acao: z.enum(["aprovar", "recusar"]),
  motivo: z.string().max(500).optional(),
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
    return { ok: true, status: novo };
  });
