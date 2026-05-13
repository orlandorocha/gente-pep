import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/custom-supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { formatLocalDateISO } from "@/lib/utils";

const todayISO = () => formatLocalDateISO();
const MOTIVO_FERIAS = "Férias";

function motivoLicenca(tipo: string) {
  return tipo === "Maternidade" ? "Licença Maternidade" :
    tipo === "Paternidade" ? "Licença Paternidade" :
    tipo === "Saúde" ? "Afastamento Médico" :
    tipo === "Sem vencimentos" ? "Licença não Remunerada" :
    "Licença Remunerada";
}

function motivoAgendamento(tipo: string) {
  return tipo === "Aniversário" ? "Aniversário" :
    tipo === "Hora Extra" ? "Folga de Hora Extra" :
    "De Bem Com a Vida";
}

function parseISO(d: string) { return new Date(`${d}T12:00:00`); }
function toISO(d: Date) { return formatLocalDateISO(d); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addYears(d: Date, n: number) { const x = new Date(d); x.setFullYear(x.getFullYear() + n); return x; }
function diffDays(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}
function shiftToWeekday(d: Date) {
  const x = new Date(d);
  while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() + 1);
  return x;
}
function bumpAquisitivo(pa: string) {
  const m = pa.match(/^(\d{4})\/(\d{4})$/);
  if (!m) return pa;
  return `${Number(m[1]) + 1}/${Number(m[2]) + 1}`;
}

type DbClient = SupabaseClient<Database>;

/**
 * Registro automático diário de Faltas a partir de:
 *  - Férias com status "Em gozo" cujo período inclui hoje
 *  - Licenças com status "Ativa" cujo período inclui hoje
 *  - Agendamentos ativos na data de hoje
 *
 * Também promove "Aprovada" → "Em gozo" quando a data de início chega,
 * e "Em gozo" → "Concluída" quando o período termina.
 *
 * Idempotente: o índice único (colaborador_id, data, motivo) impede duplicatas.
 */
async function sincronizarFaltasDiaAtualComClient(db: DbClient) {
  const hoje = todayISO();
  const summary = { promovidas: 0, concluidas: 0, reagendadas: 0, faltasFerias: 0, faltasLicenca: 0, faltasAgendamento: 0 };

  // 1. Promove Aprovada → Em gozo
  const { data: aprovadas } = await db
    .from("ferias").select("id")
    .eq("status", "Aprovada").lte("inicio", hoje).gte("fim", hoje);
  for (const v of aprovadas ?? []) {
    await db.from("ferias").update({ status: "Em gozo" }).eq("id", v.id);
    summary.promovidas++;
  }

  // 2. Conclui férias encerradas e agenda o próximo ciclo
  const { data: encerradas } = await db
    .from("ferias").select("id, colaborador_id, gestor_id, inicio, fim, periodo_aquisitivo, status")
    .in("status", ["Em gozo", "Aprovada"]).lt("fim", hoje);
  for (const v of encerradas ?? []) {
    await db.from("ferias").update({ status: "Concluída" }).eq("id", v.id);
    summary.concluidas++;

    const duracao = diffDays(parseISO(v.fim), parseISO(v.inicio));
    const novoInicio = shiftToWeekday(addYears(parseISO(v.inicio), 1));
    const novoFim = addDays(novoInicio, duracao);
    const novoPeriodoAquisitivo = bumpAquisitivo(v.periodo_aquisitivo);

    const { data: existente } = await db
      .from("ferias")
      .select("id")
      .eq("colaborador_id", v.colaborador_id)
      .eq("inicio", toISO(novoInicio))
      .eq("fim", toISO(novoFim))
      .eq("periodo_aquisitivo", novoPeriodoAquisitivo)
      .maybeSingle();

    if (!existente) {
      const { error: insertError } = await db.from("ferias").insert({
        colaborador_id: v.colaborador_id,
        gestor_id: v.gestor_id,
        inicio: toISO(novoInicio),
        fim: toISO(novoFim),
        periodo_aquisitivo: novoPeriodoAquisitivo,
        status: "Pendente",
      });
      if (!insertError) summary.reagendadas++;
    }
  }

  // 3. Faltas a partir de Férias em curso hoje.
  // Inclui "Aprovada" para não depender apenas da promoção de status acontecer antes.
  const { data: emGozo } = await db
    .from("ferias").select("colaborador_id")
    .in("status", ["Em gozo", "Aprovada"]).lte("inicio", hoje).gte("fim", hoje);
  for (const f of emGozo ?? []) {
    const { error } = await db.from("faltas").insert({
      colaborador_id: f.colaborador_id, data: hoje,
      motivo: MOTIVO_FERIAS, periodo: "Integral",
      observacao: "Registrado automaticamente (Em gozo)",
    });
    if (!error) summary.faltasFerias++;
  }

  // 4. Faltas a partir de Licenças Ativas
  const { data: licencas } = await db
    .from("licencas").select("colaborador_id, tipo")
    .eq("status", "Ativa").lte("inicio", hoje).gte("fim", hoje);
  for (const l of licencas ?? []) {
    const motivo = motivoLicenca(l.tipo);
    const { error } = await db.from("faltas").insert({
      colaborador_id: l.colaborador_id, data: hoje,
      motivo, periodo: "Integral",
      observacao: `Registrado automaticamente (Licença ${l.tipo})`,
    });
    if (!error) summary.faltasLicenca++;
  }

  // 5. Faltas a partir de Agendamentos do dia
  const { data: agendamentos } = await db
    .from("agendamentos")
    .select("colaborador_id, tipo, titulo, hora")
    .eq("data", hoje)
    .neq("status", "Cancelado");
  for (const a of agendamentos ?? []) {
    const motivo = motivoAgendamento(a.tipo);
    const titulo = a.titulo?.trim();
    const hora = a.hora?.slice(0, 5);
    const detalhe = [titulo, hora].filter(Boolean).join(" às ");
    const { error } = await db.from("faltas").insert({
      colaborador_id: a.colaborador_id,
      data: hoje,
      motivo,
      periodo: "Integral",
      observacao: detalhe
        ? `Registrado automaticamente (Agendamento: ${detalhe})`
        : `Registrado automaticamente (Agendamento: ${a.tipo})`,
    });
    if (!error) summary.faltasAgendamento++;
  }

  return summary;
}

export async function sincronizarFaltasDiaAtual() {
  return sincronizarFaltasDiaAtualComClient(supabaseAdmin);
}

export const sincronizarFaltasDoDia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => sincronizarFaltasDiaAtualComClient(context.supabase));
