import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/custom-supabase/client.server";

const todayISO = () => new Date().toISOString().slice(0, 10);

function parseISO(d: string) { return new Date(`${d}T12:00:00`); }
function toISO(d: Date) { return d.toISOString().slice(0, 10); }
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

/**
 * Registro automático diário de Faltas a partir de:
 *  - Férias com status "Em gozo" cujo período inclui hoje
 *  - Licenças com status "Ativa" cujo período inclui hoje
 *
 * Também promove "Aprovada" → "Em gozo" quando a data de início chega,
 * e "Em gozo" → "Concluída" quando o período termina.
 *
 * Idempotente: o índice único (colaborador_id, data, motivo) impede duplicatas.
 */
export const sincronizarFaltasDoDia = createServerFn({ method: "POST" })
  .handler(async () => {
    const hoje = todayISO();
    const summary = { promovidas: 0, concluidas: 0, reagendadas: 0, faltasFerias: 0, faltasLicenca: 0 };

    // 1. Promove Aprovada → Em gozo
    const { data: aprovadas } = await supabaseAdmin
      .from("ferias").select("id")
      .eq("status", "Aprovada").lte("inicio", hoje).gte("fim", hoje);
    for (const v of aprovadas ?? []) {
      await supabaseAdmin.from("ferias").update({ status: "Em gozo" }).eq("id", v.id);
      summary.promovidas++;
    }

    // 2. Conclui férias encerradas e agenda o próximo ciclo
    const { data: encerradas } = await supabaseAdmin
      .from("ferias").select("id, colaborador_id, gestor_id, inicio, fim, periodo_aquisitivo, status")
      .in("status", ["Em gozo", "Aprovada"]).lt("fim", hoje);
    for (const v of encerradas ?? []) {
      await supabaseAdmin.from("ferias").update({ status: "Concluída" }).eq("id", v.id);
      summary.concluidas++;

      const duracao = diffDays(parseISO(v.fim), parseISO(v.inicio));
      const novoInicio = shiftToWeekday(addYears(parseISO(v.inicio), 1));
      const novoFim = addDays(novoInicio, duracao);
      const novoPeriodoAquisitivo = bumpAquisitivo(v.periodo_aquisitivo);

      const { data: existente } = await supabaseAdmin
        .from("ferias")
        .select("id")
        .eq("colaborador_id", v.colaborador_id)
        .eq("inicio", toISO(novoInicio))
        .eq("fim", toISO(novoFim))
        .eq("periodo_aquisitivo", novoPeriodoAquisitivo)
        .maybeSingle();

      if (!existente) {
        const { error: insertError } = await supabaseAdmin.from("ferias").insert({
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

    // 3. Faltas a partir de Férias Em gozo (ativo hoje)
    const { data: emGozo } = await supabaseAdmin
      .from("ferias").select("colaborador_id")
      .eq("status", "Em gozo").lte("inicio", hoje).gte("fim", hoje);
    for (const f of emGozo ?? []) {
      const { error } = await supabaseAdmin.from("faltas").insert({
        colaborador_id: f.colaborador_id, data: hoje,
        motivo: "Férias", periodo: "Integral",
        observacao: "Registrado automaticamente (Em gozo)",
      });
      if (!error) summary.faltasFerias++;
    }

    // 4. Faltas a partir de Licenças Ativas
    const { data: licencas } = await supabaseAdmin
      .from("licencas").select("colaborador_id, tipo")
      .eq("status", "Ativa").lte("inicio", hoje).gte("fim", hoje);
    for (const l of licencas ?? []) {
      const motivo =
        l.tipo === "Maternidade" ? "Licença Maternidade" :
        l.tipo === "Paternidade" ? "Licença Paternidade" :
        l.tipo === "Saúde" ? "Afastamento Médico" :
        l.tipo === "Sem vencimentos" ? "Licença não Remunerada" :
        "Licença Remunerada";
      const { error } = await supabaseAdmin.from("faltas").insert({
        colaborador_id: l.colaborador_id, data: hoje,
        motivo, periodo: "Integral",
        observacao: `Registrado automaticamente (Licença ${l.tipo})`,
      });
      if (!error) summary.faltasLicenca++;
    }

    return summary;
  });
