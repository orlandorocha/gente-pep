// Motor de validação e cálculo do Monitor de Jornada Contínua.
// Regras implementadas:
// - Controle de dias consecutivos de trabalho.
// - Trabalho em domingo exige folga registrada antes do domingo.
// - Cada domingo trabalhado gera folga compensatória pendente.
// - Não é permitido novo domingo antes de utilizar a folga compensatória anterior.
// - A partir de 5 dias consecutivos há alerta amarelo.
// - 6 dias consecutivos → alerta laranja.
// - 7 dias consecutivos → alerta vermelho.
// - Acima de 7 dias → bloqueio de nova marcação de trabalho.

import type {
  ColaboradorStatus,
  DiaEscala,
  DiaTipo,
  EscalaColaborador,
  ValidationIssue,
} from "./escala-types";

export const HORAS_POR_DIA = 7.33; // 44h semanais / 6 dias

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Diferença em dias entre duas datas ISO (b - a). */
export function diffDias(a: string, b: string): number {
  const da = parseISODate(a).getTime();
  const db = parseISODate(b).getTime();
  return Math.round((db - da) / 86400000);
}

export function isDomingo(s: string): boolean {
  return parseISODate(s).getDay() === 0;
}

export function isDescanso(tipo: DiaTipo): boolean {
  return tipo === "folga" || tipo === "compensatoria" || tipo === "feriado";
}

export function temFolgaAntes(
  idx: Map<string, DiaTipo>,
  colaboradorId: string,
  data: string,
): boolean {
  let cur = addDays(data, -1);
  const limite = 30; // busca até 30 dias anteriores
  let volta = 0;
  while (volta < limite) {
    const tipo = idx.get(`${colaboradorId}|${cur}`);
    if (tipo && isDescanso(tipo)) return true;
    cur = addDays(cur, -1);
    volta++;
  }
  return false;
}

export function hasPendingDomingoCompensatoria(
  idx: Map<string, DiaTipo>,
  colaboradorId: string,
  data: string,
): boolean {
  const dias: string[] = [];
  idx.forEach((tipo, key) => {
    const [colabId, d] = key.split("|");
    if (colabId === colaboradorId) dias.push(d);
  });
  dias.sort();
  let pending = false;
  for (const d of dias) {
    if (d >= data) break;
    const tipo = idx.get(`${colaboradorId}|${d}`);
    if (tipo === "trabalho" && isDomingo(d)) {
      if (pending) return true;
      pending = true;
    }
    if (tipo === "compensatoria" && pending) {
      pending = false;
    }
  }
  return pending;
}

export function diasDoMes(ano: number, mes: number): string[] {
  const dias: string[] = [];
  const total = new Date(ano, mes, 0).getDate();
  for (let d = 1; d <= total; d++) {
    dias.push(`${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return dias;
}

/** Mapa rápido (colabId|data) -> tipo */
export function indexarDias(dias: DiaEscala[]): Map<string, DiaTipo> {
  const m = new Map<string, DiaTipo>();
  for (const d of dias) m.set(`${d.colaboradorId}|${d.data}`, d.tipo);
  return m;
}

export function getTipo(
  idx: Map<string, DiaTipo>,
  colaboradorId: string,
  data: string,
): DiaTipo {
  return idx.get(`${colaboradorId}|${data}`) ?? "vazio";
}

export function isSabado(s: string): boolean {
  return parseISODate(s).getDay() === 6;
}

export function gerarEscalaPadraoParaColaborador(
  colaborador: EscalaColaborador,
  datas: string[],
  feriados: Set<string>,
): DiaEscala[] {
  const saturdays = datas.filter((data) => isSabado(data) && !feriados.has(data));
  const saturdayFolga = saturdays[Math.floor((saturdays.length - 1) / 2)] ?? null;

  return datas
    .filter((data) => !isDomingo(data) && !feriados.has(data))
    .map((data) => {
      const tipo: DiaTipo = isSabado(data)
        ? data === saturdayFolga
          ? "folga"
          : "trabalho"
        : "trabalho";
      return {
        colaboradorId: colaborador.id,
        data,
        tipo,
      };
    });
}

/** Conta dias consecutivos de trabalho terminando em `data` (inclusiva). */
export function diasConsecutivosAte(
  idx: Map<string, DiaTipo>,
  colaboradorId: string,
  data: string,
): number {
  let count = 0;
  let cur = data;
  while (true) {
    const tipo = getTipo(idx, colaboradorId, cur);
    if (tipo === "trabalho") {
      count++;
      cur = addDays(cur, -1);
    } else {
      break;
    }
  }
  return count;
}

function diasConsecutivosDe(
  idx: Map<string, DiaTipo>,
  colaboradorId: string,
  data: string,
): number {
  let count = 0;
  let cur = data;
  while (getTipo(idx, colaboradorId, cur) === "trabalho") {
    count++;
    cur = addDays(cur, 1);
  }
  return count;
}

/**
 * Valida se MARCAR `data` como trabalho para `colaboradorId` é permitido.
 * Considera consentimento de domingo e limite de 6 dias consecutivos.
 */
export function podeMarcarTrabalho(
  colaboradores: EscalaColaborador[] | null,
  dias: DiaEscala[],
  colaboradorId: string,
  data: string,
): { ok: boolean; motivo?: string } {
  const colab = colaboradores?.find((c) => c.id === colaboradorId);
  if (!colab) return { ok: true };
  const idx = indexarDias(dias);
  idx.set(`${colaboradorId}|${data}`, "trabalho");

  if (isDomingo(data) && !colab.aceitaDomingo) {
    return {
      ok: false,
      motivo:
        "Este colaborador não autorizou trabalho aos domingos. Edite o cadastro para habilitar horas extras dominicais.",
    };
  }

  if (isDomingo(data)) {
    if (!temFolgaAntes(idx, colaboradorId, data)) {
      return {
        ok: false,
        motivo:
          "Não é permitido trabalhar no domingo sem ter usufruído de uma folga antes deste domingo.",
      };
    }
    if (hasPendingDomingoCompensatoria(idx, colaboradorId, data)) {
      return {
        ok: false,
        motivo:
          "Já existe um domingo anterior com folga compensatória pendente. Use a compensatória antes de escalar outro domingo.",
      };
    }
  }
  return { ok: true };
}

/** Valida toda a escala e retorna issues + status por colaborador. */
export function avaliarMes(
  colaboradores: EscalaColaborador[],
  dias: DiaEscala[],
  ano: number,
  mes: number,
): { status: ColaboradorStatus[]; issues: ValidationIssue[] } {
  const idx = indexarDias(dias);
  const datasMes = diasDoMes(ano, mes);
  const allIssues: ValidationIssue[] = [];
  const status: ColaboradorStatus[] = [];

  for (const c of colaboradores) {
    const issues: ValidationIssue[] = [];
    let consecutivos = 0;
    let ultimaFolga: string | null = null;
    let domingosTrab = 0;
    let diasTrab = 0;
    let folgasSemanais = 0;
    let compensatoriasUsadas = 0;
    let compensatoriasGeradas = 0;
    // Pendências de domingos trabalhados aguardando compensação
    const pendentes: { domingo: string; prazo: string }[] = [];
    // Créditos de compensatórias programadas ANTES de um domingo trabalhado
    const creditos: string[] = [];

    for (const d of datasMes) {
      const tipo = getTipo(idx, c.id, d);

      // Vence pendências cujo prazo já passou (7 dias após o domingo)
      while (pendentes.length && pendentes[0].prazo < d) {
        const venc = pendentes.shift()!;
        issues.push({
          level: "error",
          data: venc.prazo,
          colaboradorId: c.id,
          message: `Folga compensatória do domingo ${venc.domingo} não concedida em até 7 dias (CLT art. 67).`,
        });
      }

      if (tipo === "trabalho") {
        consecutivos++;
        diasTrab++;
        if (isDomingo(d)) {
          domingosTrab++;
          if (!c.aceitaDomingo) {
            issues.push({
              level: "error",
              data: d,
              colaboradorId: c.id,
              message:
                "Trabalho em domingo sem autorização do colaborador (cadastro não aceita horas extras dominicais).",
            });
          }
          // Consome um crédito de compensatória já registrado dentro dos 6 dias anteriores
          const idxCredito = creditos.findIndex(
            (cred) => Math.abs(diffDias(cred, d)) <= 6,
          );
          if (idxCredito >= 0) {
            creditos.splice(idxCredito, 1);
            compensatoriasUsadas++;
          } else {
            pendentes.push({ domingo: d, prazo: addDays(d, 7) });
          }
        }
        if (consecutivos === 5) {
          issues.push({
            level: "warn",
            data: d,
            colaboradorId: c.id,
            message: "5 dias consecutivos — atenção (amarelo).",
          });
        } else if (consecutivos === 6) {
          issues.push({
            level: "warn",
            data: d,
            colaboradorId: c.id,
            message: "6 dias consecutivos — limite (vermelho).",
          });
        } else if (consecutivos >= 7) {
          issues.push({
            level: "error",
            data: d,
            colaboradorId: c.id,
            message:
              "Excedeu 6 dias consecutivos. Programação inválida — folga obrigatória.",
          });
        }
      } else if (tipo === "folga") {
        consecutivos = 0;
        ultimaFolga = d;
        folgasSemanais++;
      } else if (tipo === "compensatoria") {
        consecutivos = 0;
        ultimaFolga = d;
        compensatoriasGeradas++;
        // Prioriza quitar uma pendência aberta (compensação posterior ao domingo)
        if (pendentes.length) {
          pendentes.shift();
          compensatoriasUsadas++;
        } else {
          // Caso contrário, vira crédito para um domingo trabalhado nos próximos 6 dias
          creditos.push(d);
        }
      } else if (tipo === "feriado") {
        consecutivos = 0;
        ultimaFolga = d;
      }
    }

    // janelas de 7 dias sem folga (incluindo dias do mês)
    for (let i = 0; i + 7 <= datasMes.length; i++) {
      const janela = datasMes.slice(i, i + 7);
      const temFolga = janela.some((d) => {
        const t = getTipo(idx, c.id, d);
        return t === "folga" || t === "compensatoria" || t === "feriado";
      });
      if (!temFolga) {
        issues.push({
          level: "error",
          data: janela[6],
          colaboradorId: c.id,
          message: "Janela de 7 dias sem nenhuma folga registrada.",
        });
        break;
      }
    }


    const alertNivel: ColaboradorStatus["alertNivel"] =
      issues.some((i) => i.level === "error")
        ? "critico"
        : consecutivos >= 6
          ? "vermelho"
          : consecutivos >= 5
            ? "amarelo"
            : "ok";

    const proximaFolgaObrigatoria = ultimaFolga ? addDays(ultimaFolga, 7) : null;
    const proximoVencimentoCompensatoria = pendentes[0]?.prazo ?? null;

    status.push({
      colaboradorId: c.id,
      diasConsecutivos: consecutivos,
      ultimaFolga,
      proximaFolgaObrigatoria,
      compensatoriasPendentes: pendentes.length,
      compensatoriasGeradas,
      compensatoriasUtilizadas: compensatoriasUsadas,
      impedidoProximoDomingo: pendentes.length > 0,
      proximoVencimentoCompensatoria,
      domingosTrabalhadosMes: domingosTrab,
      diasTrabalhadosMes: diasTrab,
      folgasSemanaisMes: folgasSemanais,
      totalHorasMes: diasTrab * HORAS_POR_DIA,
      irregularidades: issues,
      alertNivel,
    });
    allIssues.push(...issues);
    void compensatoriasUsadas;
  }

  return { status, issues: allIssues };
}

/**
 * Sugere automaticamente a melhor data para conceder folga compensatória,
 * priorizando: (1) evitar 7 dias consecutivos; (2) manter cobertura do setor;
 * (3) respeitar prazo legal de 7 dias após o domingo trabalhado.
 */
export function sugerirFolgaCompensatoria(
  colaboradores: EscalaColaborador[],
  dias: DiaEscala[],
  colaboradorId: string,
  apartirDe: string,
  janelaDias = 7,
): string | null {
  const idx = indexarDias(dias);
  const colab = colaboradores.find((c) => c.id === colaboradorId);
  if (!colab) return null;

  const candidatas: { data: string; score: number }[] = [];
  for (let i = 0; i < janelaDias; i++) {
    const d = addDays(apartirDe, i);
    const tipo = getTipo(idx, colaboradorId, d);
    if (tipo !== "trabalho" && tipo !== "vazio") continue;
    if (isDomingo(d)) continue; // não compensa em domingo

    const folgaSetor = colaboradores.filter(
      (c) =>
        c.setor === colab.setor &&
        c.id !== colaboradorId &&
        (getTipo(idx, c.id, d) === "folga" || getTipo(idx, c.id, d) === "compensatoria"),
    ).length;

    const consecutivos = diasConsecutivosAte(idx, colaboradorId, addDays(d, -1));
    const score = consecutivos * 10 - folgaSetor * 3 - i;
    candidatas.push({ data: d, score });
  }
  candidatas.sort((a, b) => b.score - a.score);
  return candidatas[0]?.data ?? null;
}


/**
 * Sugere a melhor data para programar a folga compensatória ANTES de um
 * domingo a ser trabalhado, buscando nos 6 dias anteriores e priorizando o
 * dia mais próximo ao domingo que ainda não exceda o limite de 6 consecutivos
 * e que preserve cobertura mínima do setor.
 */
export function sugerirFolgaCompensatoriaAntes(
  colaboradores: EscalaColaborador[],
  dias: DiaEscala[],
  colaboradorId: string,
  domingo: string,
): string | null {
  const idx = indexarDias(dias);
  const colab = colaboradores.find((c) => c.id === colaboradorId);
  if (!colab) return null;

  const candidatas: { data: string; score: number }[] = [];
  for (let i = 1; i <= 6; i++) {
    const d = addDays(domingo, -i);
    if (isDomingo(d)) continue;
    const tipo = getTipo(idx, colaboradorId, d);
    if (tipo === "folga" || tipo === "compensatoria" || tipo === "feriado") {
      // já existe folga nesse dia — nada a fazer
      return d;
    }
    if (tipo !== "trabalho" && tipo !== "vazio") continue;

    const folgaSetor = colaboradores.filter(
      (c) =>
        c.setor === colab.setor &&
        c.id !== colaboradorId &&
        (getTipo(idx, c.id, d) === "folga" ||
          getTipo(idx, c.id, d) === "compensatoria"),
    ).length;
    // Quanto mais perto do domingo, melhor (i menor = score maior)
    const score = (7 - i) * 10 - folgaSetor * 3;
    candidatas.push({ data: d, score });
  }
  candidatas.sort((a, b) => b.score - a.score);
  return candidatas[0]?.data ?? null;
}
