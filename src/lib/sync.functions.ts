import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/custom-supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { formatLocalDateISO } from "@/lib/utils";

const todayISO = () => formatLocalDateISO();
const MOTIVO_FERIAS = "Férias";

// Quantidade de dias retroativos que a sincronização recupera automaticamente.
// Garante que, mesmo se ninguém acessar o sistema ou o cron falhar por alguns
// dias, todas as ausências (férias/licenças/agendamentos) sejam registradas.
const JANELA_BACKFILL_DIAS = 31;

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

/** Retorna a lista de datas ISO (YYYY-MM-DD) entre start e end, inclusivo. */
function rangeISO(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  let cur = parseISO(startISO);
  const end = parseISO(endISO);
  while (cur.getTime() <= end.getTime()) {
    out.push(toISO(cur));
    cur = addDays(cur, 1);
  }
  return out;
}

/** Recorta um intervalo [inicio, fim] pela janela [janelaInicio, janelaFim]. */
function clampRange(inicio: string, fim: string, janelaInicio: string, janelaFim: string) {
  const start = inicio < janelaInicio ? janelaInicio : inicio;
  const end = fim > janelaFim ? janelaFim : fim;
  if (start > end) return null;
  return rangeISO(start, end);
}

type DbClient = SupabaseClient<Database>;

type FaltaRow = Database["public"]["Tables"]["faltas"]["Insert"];

/**
 * Registro automático de Faltas a partir de:
 *  - Férias com status "Em gozo"/"Aprovada" que se sobrepõem à janela
 *  - Licenças com status "Ativa" que se sobrepõem à janela
 *  - Agendamentos ativos dentro da janela
 *
 * Diferente da versão anterior (que processava apenas "hoje"), esta versão
 * processa uma JANELA de dias retroativa (backfill). Assim, sempre que o dia
 * vira após 24h — ou quando ninguém acessou o sistema por vários dias — todos
 * os dias pendentes são registrados de uma só vez.
 *
 * Também promove "Aprovada" → "Em gozo" quando a data de início chega,
 * e "Em gozo" → "Concluída" quando o período termina.
 *
 * Idempotente: usa upsert com ignoreDuplicates sobre o índice único
 * (colaborador_id, data, motivo), portanto não cria duplicatas.
 */
async function sincronizarFaltasComClient(db: DbClient, dias = JANELA_BACKFILL_DIAS) {
  const hoje = todayISO();
  const janelaInicio = toISO(addDays(parseISO(hoje), -Math.max(0, dias - 1)));
  const summary = {
    janelaInicio,
    janelaFim: hoje,
    promovidas: 0,
    concluidas: 0,
    reagendadas: 0,
    faltasFerias: 0,
    faltasLicenca: 0,
    faltasAgendamento: 0,
  };

  // 1. Promove Aprovada → Em gozo (período inclui hoje)
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

  // Coleta todas as faltas a inserir (toda a janela) e faz upsert idempotente.
  const rows: FaltaRow[] = [];

  // 3. Faltas a partir de Férias que se sobrepõem à janela.
  // Inclui "Aprovada" para não depender da promoção de status acontecer antes.
  const { data: ferias } = await db
    .from("ferias").select("colaborador_id, inicio, fim")
    .in("status", ["Em gozo", "Aprovada", "Concluída"])
    .lte("inicio", hoje).gte("fim", janelaInicio);
  for (const f of ferias ?? []) {
    const dias = clampRange(f.inicio, f.fim, janelaInicio, hoje);
    if (!dias) continue;
    for (const data of dias) {
      rows.push({
        colaborador_id: f.colaborador_id, data,
        motivo: MOTIVO_FERIAS, periodo: "Integral",
        observacao: "Registrado automaticamente (Férias)",
      });
      summary.faltasFerias++;
    }
  }

  // 4. Faltas a partir de Licenças que se sobrepõem à janela
  const { data: licencas } = await db
    .from("licencas").select("colaborador_id, tipo, inicio, fim")
    .in("status", ["Ativa", "Encerrada"])
    .lte("inicio", hoje).gte("fim", janelaInicio);
  for (const l of licencas ?? []) {
    const dias = clampRange(l.inicio, l.fim, janelaInicio, hoje);
    if (!dias) continue;
    const motivo = motivoLicenca(l.tipo);
    for (const data of dias) {
      rows.push({
        colaborador_id: l.colaborador_id, data,
        motivo, periodo: "Integral",
        observacao: `Registrado automaticamente (Licença ${l.tipo})`,
      });
      summary.faltasLicenca++;
    }
  }

  // 5. Faltas a partir de Agendamentos dentro da janela
  const { data: agendamentos } = await db
    .from("agendamentos")
    .select("colaborador_id, tipo, titulo, hora, data")
    .gte("data", janelaInicio)
    .lte("data", hoje)
    .neq("status", "Cancelado");
  for (const a of agendamentos ?? []) {
    const motivo = motivoAgendamento(a.tipo);
    const titulo = a.titulo?.trim();
    const hora = a.hora?.slice(0, 5);
    const detalhe = [titulo, hora].filter(Boolean).join(" às ");
    rows.push({
      colaborador_id: a.colaborador_id,
      data: a.data,
      motivo,
      periodo: "Integral",
      observacao: detalhe
        ? `Registrado automaticamente (Agendamento: ${detalhe})`
        : `Registrado automaticamente (Agendamento: ${a.tipo})`,
    });
    summary.faltasAgendamento++;
  }

  // Upsert idempotente em lote: o índice único impede duplicatas e
  // ignoreDuplicates evita erros ao reprocessar dias já registrados.
  if (rows.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await db
        .from("faltas")
        .upsert(rows.slice(i, i + CHUNK), {
          onConflict: "colaborador_id,data,motivo",
          ignoreDuplicates: true,
        });
    }
  }

  return summary;
}

export async function sincronizarFaltasDiaAtual(dias = JANELA_BACKFILL_DIAS) {
  return sincronizarFaltasComClient(supabaseAdmin, dias);
}

export const sincronizarFaltasDoDia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => sincronizarFaltasComClient(context.supabase));
