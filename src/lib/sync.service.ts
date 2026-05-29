import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const DEFAULT_TIMEZONE = process.env.APP_TIMEZONE ?? "America/Sao_Paulo";
const DEFAULT_RETRY_ATTEMPTS = 3;
const MOTIVO_FERIAS = "Férias";

type DbClient = SupabaseClient<Database>;

export type SyncSummary = {
  promovidas: number;
  concluidas: number;
  reagendadas: number;
  criadasFerias: number;
  criadasLicenca: number;
  criadasAgendamento: number;
  criadasTotal: number;
};

type SyncLog = {
  target_date: string;
  status: "success" | "warning" | "failure";
  summary: SyncSummary;
  errors: { stage: string; message: string }[];
  attempts: number;
  duration_ms: number;
};

function getTodayISO(timeZone = DEFAULT_TIMEZONE) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone }).format(new Date());
}

function parseISODate(input: string) {
  return new Date(`${input}T12:00:00`);
}

function formatISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, offset: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + offset);
  return next;
}

function addYears(date: Date, offset: number) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + offset);
  return next;
}

function shiftToWeekday(date: Date) {
  const next = new Date(date);
  while (next.getDay() === 0 || next.getDay() === 6) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function bumpAquisitivo(periodoAquisitivo: string) {
  const match = periodoAquisitivo.match(/^(\d{4})\/(\d{4})$/);
  if (!match) return periodoAquisitivo;
  return `${Number(match[1]) + 1}/${Number(match[2]) + 1}`;
}

function motivoLicenca(tipo: string) {
  return tipo === "Maternidade"
    ? "Licença Maternidade"
    : tipo === "Paternidade"
    ? "Licença Paternidade"
    : tipo === "Saúde"
    ? "Afastamento Médico"
    : tipo === "Sem vencimentos"
    ? "Licença não Remunerada"
    : "Licença Remunerada";
}

function motivoAgendamento(tipo: string) {
  return tipo === "Aniversário"
    ? "Aniversário"
    : tipo === "Hora Extra"
    ? "Folga de Hora Extra"
    : "De Bem Com a Vida";
}

function getFaltaKey(item: { colaborador_id: string; data: string; motivo: string }) {
  return `${item.colaborador_id}|${item.data}|${item.motivo}`;
}

async function logSyncRun(db: DbClient, log: SyncLog) {
  try {
    await db.from("faltas_sync_logs").insert(log);
  } catch {
    // eslint-disable-next-line no-console
    console.warn("Falha ao gravar log de sincronização de faltas");
  }
}

async function retryOperation<T>(operation: () => Promise<T>, attempts = DEFAULT_RETRY_ATTEMPTS) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const waitMs = attempt * 250;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError;
}

export async function sincronizarFaltasDiaAtualComClient(db: DbClient): Promise<SyncSummary> {
  const targetDate = getTodayISO();
  const startTime = Date.now();
  const errors: { stage: string; message: string }[] = [];
  const summary: SyncSummary = {
    promovidas: 0,
    concluidas: 0,
    reagendadas: 0,
    criadasFerias: 0,
    criadasLicenca: 0,
    criadasAgendamento: 0,
    criadasTotal: 0,
  };

  async function run() {
    // 1. Promover férias aprovadas para "Em gozo" quando hoje está no intervalo.
    const { data: promovidas, error: promoteError } = await db
      .from("ferias")
      .select("id")
      .eq("status", "Aprovada")
      .lte("inicio", targetDate)
      .gte("fim", targetDate);

    if (promoteError) {
      throw new Error(`Falha ao consultar férias aprovadas: ${promoteError.message}`);
    }

    if ((promovidas ?? []).length > 0) {
      const ids = promovidas.map((item) => item.id);
      const { error: updateError } = await db.from("ferias").update({ status: "Em gozo" }).in("id", ids);
      if (updateError) {
        throw new Error(`Falha ao promover férias para Em gozo: ${updateError.message}`);
      }
      summary.promovidas = ids.length;
    }

    // 2. Concluir férias cujo fim já passou e reagendar novo ciclo.
    const { data: encerradas, error: encerradasError } = await db
      .from("ferias")
      .select(
        "id, colaborador_id, gestor_id, inicio, fim, periodo_aquisitivo, status"
      )
      .in("status", ["Em gozo", "Aprovada"])
      .lt("fim", targetDate);

    if (encerradasError) {
      throw new Error(`Falha ao consultar férias encerradas: ${encerradasError.message}`);
    }

    if ((encerradas ?? []).length > 0) {
      const ids = encerradas.map((item) => item.id);
      const { error: concluirError } = await db
        .from("ferias")
        .update({ status: "Concluída" })
        .in("id", ids);
      if (concluirError) {
        throw new Error(`Falha ao concluir férias: ${concluirError.message}`);
      }
      summary.concluidas = ids.length;

      for (const ferias of encerradas) {
        try {
          const inicioDate = parseISODate(ferias.inicio);
          const fimDate = parseISODate(ferias.fim);
          const duracao = Math.round((fimDate.getTime() - inicioDate.getTime()) / (1000 * 60 * 60 * 24));
          const novoInicio = shiftToWeekday(addYears(inicioDate, 1));
          const novoFim = addDays(novoInicio, duracao);
          const novoPeriodoAquisitivo = bumpAquisitivo(ferias.periodo_aquisitivo);

          const { data: existente, error: existenteError } = await db
            .from("ferias")
            .select("id")
            .eq("colaborador_id", ferias.colaborador_id)
            .eq("inicio", formatISODate(novoInicio))
            .eq("fim", formatISODate(novoFim))
            .eq("periodo_aquisitivo", novoPeriodoAquisitivo)
            .maybeSingle();

          if (existenteError) {
            throw new Error(`Falha ao verificar férias reagendadas: ${existenteError.message}`);
          }

          if (!existente) {
            const { error: insertError } = await db.from("ferias").insert({
              colaborador_id: ferias.colaborador_id,
              gestor_id: ferias.gestor_id,
              inicio: formatISODate(novoInicio),
              fim: formatISODate(novoFim),
              periodo_aquisitivo: novoPeriodoAquisitivo,
              status: "Pendente",
            });
            if (insertError) {
              throw new Error(`Falha ao reagendar férias: ${insertError.message}`);
            }
            summary.reagendadas += 1;
          }
        } catch (innerError) {
          errors.push({ stage: "reagendarFerias", message: (innerError as Error).message });
        }
      }
    }

    // 3. Buscar faltas automáticas de férias e licenças para hoje.
    const [feriasAtivas, licencasAtivas, agendamentosHoje] = await Promise.all([
      db
        .from("ferias")
        .select("colaborador_id")
        .in("status", ["Em gozo", "Aprovada"])
        .lte("inicio", targetDate)
        .gte("fim", targetDate),
      db
        .from("licencas")
        .select("colaborador_id, tipo")
        .eq("status", "Ativa")
        .lte("inicio", targetDate)
        .gte("fim", targetDate),
      db
        .from("agendamentos")
        .select("colaborador_id, tipo, titulo, hora")
        .eq("data", targetDate)
        .neq("status", "Cancelado"),
    ]);

    if (feriasAtivas.error) {
      throw new Error(`Falha ao consultar férias em curso: ${feriasAtivas.error.message}`);
    }
    if (licencasAtivas.error) {
      throw new Error(`Falha ao consultar licenças ativas: ${licencasAtivas.error.message}`);
    }
    if (agendamentosHoje.error) {
      throw new Error(`Falha ao consultar agendamentos do dia: ${agendamentosHoje.error.message}`);
    }

    const recordsMap = new Map<string, { record: unknown; source: "ferias" | "licenca" | "agendamento" }>();

    for (const ferias of feriasAtivas.data ?? []) {
      const record = {
        colaborador_id: ferias.colaborador_id,
        data: targetDate,
        motivo: MOTIVO_FERIAS,
        periodo: "Integral",
        observacao: "Registrado automaticamente (Em gozo)",
      };
      recordsMap.set(getFaltaKey(record), { record, source: "ferias" });
    }

    for (const licenca of licencasAtivas.data ?? []) {
      const motivo = motivoLicenca(licenca.tipo);
      const record = {
        colaborador_id: licenca.colaborador_id,
        data: targetDate,
        motivo,
        periodo: "Integral",
        observacao: `Registrado automaticamente (Licença ${licenca.tipo})`,
      };
      recordsMap.set(getFaltaKey(record), { record, source: "licenca" });
    }

    for (const agendamento of agendamentosHoje.data ?? []) {
      const motivo = motivoAgendamento(agendamento.tipo);
      const titulo = agendamento.titulo?.trim();
      const hora = agendamento.hora?.slice(0, 5);
      const detalhe = [titulo, hora].filter(Boolean).join(" às ");
      const observacao = detalhe
        ? `Registrado automaticamente (Agendamento: ${detalhe})`
        : `Registrado automaticamente (Agendamento: ${agendamento.tipo})`;
      const record = {
        colaborador_id: agendamento.colaborador_id,
        data: targetDate,
        motivo,
        periodo: "Integral",
        observacao,
      };
      recordsMap.set(getFaltaKey(record), { record, source: "agendamento" });
    }

    const records = Array.from(recordsMap.values()).map((item) => item.record as Record<string, unknown>);

    if (records.length > 0) {
      const colaboradores = Array.from(new Set(records.map((item) => item.colaborador_id as string)));
      const { data: existentes, error: existentesError } = await db
        .from("faltas")
        .select("colaborador_id, data, motivo")
        .in("colaborador_id", colaboradores)
        .eq("data", targetDate);

      if (existentesError) {
        throw new Error(`Falha ao consultar faltas existentes: ${existentesError.message}`);
      }

      const existenteKeys = new Set((existentes ?? []).map((item) => getFaltaKey(item)));
      const missing = records.filter((item) => !existenteKeys.has(getFaltaKey(item as { colaborador_id: string; data: string; motivo: string })));

      if (missing.length > 0) {
        const { error: insertError } = await db
          .from("faltas")
          .upsert(missing, { onConflict: "colaborador_id,data,motivo", ignoreDuplicates: true });

        if (insertError) {
          throw new Error(`Falha ao inserir faltas automáticas: ${insertError.message}`);
        }

        const insertedCount = missing.length;
        summary.criadasTotal = insertedCount;
        summary.criadasFerias = missing.filter((item) => item.motivo === MOTIVO_FERIAS).length;
        summary.criadasLicenca = missing.filter((item) => item.motivo !== MOTIVO_FERIAS && item.motivo !== motivoAgendamento("Aniversário") && item.motivo !== motivoAgendamento("Hora Extra")).length;
        summary.criadasAgendamento = missing.filter((item) => item.motivo === motivoAgendamento("Aniversário") || item.motivo === motivoAgendamento("Hora Extra") || item.motivo === motivoAgendamento("De bem com a vida")).length;
      }
    }

    return summary;
  }

  let attempts = 0;
  let resultSummary: SyncSummary = summary;

  try {
    await retryOperation(async () => {
      attempts += 1;
      resultSummary = await run();
      return resultSummary;
    });
  } catch (error) {
    errors.push({ stage: "syncOverall", message: (error as Error).message });
    const status: SyncLog["status"] = "failure";
    await logSyncRun(db, {
      target_date: targetDate,
      status,
      summary: resultSummary,
      errors,
      attempts,
      duration_ms: Date.now() - startTime,
    });
    throw error;
  }

  const status: SyncLog["status"] = errors.length > 0 ? "warning" : "success";
  await logSyncRun(db, {
    target_date: targetDate,
    status,
    summary: resultSummary,
    errors,
    attempts: Math.max(attempts, 1),
    duration_ms: Date.now() - startTime,
  });

  return resultSummary;
}
