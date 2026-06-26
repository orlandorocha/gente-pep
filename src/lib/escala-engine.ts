// Motor de validação e cálculo da escala 6x1.
// Regras (CLT + acordo coletivo padrão):
// - Máx. 6 dias consecutivos de trabalho.
// - Pelo menos 1 folga em cada janela de 7 dias.
// - Domingo trabalhado só é permitido se o colaborador aceitar (aceitaDomingo).
// - Domingo trabalhado gera obrigatoriamente 1 folga compensatória dentro de 7 dias
//   (CLT art. 67 / Súmula 146 TST).
// - Alertas: 5d = amarelo, 6d = vermelho, 7d = crítico (bloqueado).

import type {
  ColaboradorStatus,
  DiaEscala,
  DiaTipo,
  EscalaColaborador,
  ValidationIssue,
} from "./escala-types";

export const HORAS_POR_DIA = 7.33; // 44h semanais / 6 dias

/**
 * Limite GLOBAL de colaboradores que podem folgar no MESMO dia.
 * Regra de negócio: no máximo 7 pessoas de folga por dia.
 */
export const LIMITE_FOLGA_DIA_GLOBAL = 7;

/**
 * Limites de folga por dia específicos por cargo (sobrepõem o global por cargo).
 * - Operador de produção II: no máximo 2 por dia.
 * - Auxiliar de produção: no máximo 6 por dia.
 */
export const LIMITE_FOLGA_POR_CARGO: Record<string, number> = {
  "OPERADOR DE PRODUÇÃO II": 2,
  "AUXILIAR DE PRODUÇÃO": 6,
};

/** Retorna o limite de folgas por dia para um cargo. */
export function limiteFolgaCargo(cargo: string): number {
  const key = (cargo ?? "").trim().toUpperCase();
  return LIMITE_FOLGA_POR_CARGO[key] ?? LIMITE_FOLGA_DIA_GLOBAL;
}

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
  if (colab && isDomingo(data) && !colab.aceitaDomingo) {
    return {
      ok: false,
      motivo:
        "Este colaborador não autorizou trabalho aos domingos. Edite o cadastro para habilitar horas extras dominicais.",
    };
  }
  const idx = indexarDias(dias);
  idx.set(`${colaboradorId}|${data}`, "trabalho");
  const antes = diasConsecutivosAte(idx, colaboradorId, addDays(data, -1));
  const depois = diasConsecutivosDe(idx, colaboradorId, addDays(data, 1));
  const total = antes + 1 + depois;
  if (total > 6) {
    return {
      ok: false,
      motivo:
        "Programação inválida. O colaborador excederia o limite legal de 6 dias consecutivos.",
    };
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
 * Gera AUTOMATICAMENTE a escala 6x1 de um colaborador recém-cadastrado,
 * distribuindo as folgas semanais de forma a respeitar os limites de
 * colaboradores em folga por dia (global e por cargo).
 *
 * Regras aplicadas (semanas alinhadas de SEGUNDA a DOMINGO):
 * - Trabalha 6 dias e folga 1 por semana.
 * - Quando NÃO aceita domingo: a folga semanal recai no domingo (nunca trabalha).
 * - Quando ACEITA domingo: o domingo é SEMPRE trabalhado e a folga da semana é
 *   marcada como "compensatória" e alocada OBRIGATORIAMENTE em um dia útil
 *   ANTES do domingo (segunda a sábado) — CLT art. 67 / Súmula 146 TST.
 * - A folga/compensatória é alocada no dia com MENOR ocupação que ainda respeite
 *   o limite global ({@link LIMITE_FOLGA_DIA_GLOBAL}) e o do cargo
 *   ({@link limiteFolgaCargo}). Se nenhum dia respeitar, escolhe o menos cheio.
 *
 * @param colab            colaborador para o qual gerar a escala
 * @param outrosColabs     demais colaboradores (para mapear cargo -> contagem)
 * @param diasExistentes   dias já programados de todos (para contar ocupação)
 * @param inicioISO        data inicial (ISO) — idealmente o 1º dia do mês
 * @param semanas          quantidade de semanas a gerar (padrão 9 ≈ 2 meses)
 */
export function gerarEscala6x1(
  colab: EscalaColaborador,
  outrosColabs: EscalaColaborador[],
  diasExistentes: DiaEscala[],
  inicioISO: string,
  semanas = 9,
): DiaEscala[] {
  const cargoDe = new Map(outrosColabs.map((c) => [c.id, (c.cargo ?? "").toUpperCase()]));
  const cargoUp = (colab.cargo ?? "").toUpperCase();
  const limCargo = limiteFolgaCargo(colab.cargo);

  // Ocupação de folgas por data: total e por cargo.
  const totalPorData = new Map<string, number>();
  const cargoPorData = new Map<string, Map<string, number>>();
  for (const d of diasExistentes) {
    if (d.tipo !== "folga" && d.tipo !== "compensatoria") continue;
    totalPorData.set(d.data, (totalPorData.get(d.data) ?? 0) + 1);
    const cg = cargoDe.get(d.colaboradorId) ?? "";
    let m = cargoPorData.get(d.data);
    if (!m) {
      m = new Map();
      cargoPorData.set(d.data, m);
    }
    m.set(cg, (m.get(cg) ?? 0) + 1);
  }

  const loadTotal = (data: string) => totalPorData.get(data) ?? 0;
  const loadCargo = (data: string) => cargoPorData.get(data)?.get(cargoUp) ?? 0;
  const registra = (data: string) => {
    totalPorData.set(data, loadTotal(data) + 1);
    let m = cargoPorData.get(data);
    if (!m) {
      m = new Map();
      cargoPorData.set(data, m);
    }
    m.set(cargoUp, loadCargo(data) + 1);
  };

  // Escolhe o melhor dia (menor ocupação respeitando limites) dentro de uma lista.
  const escolherDia = (dias: string[]): string => {
    const candidatas = dias.map((d) => ({
      d,
      total: loadTotal(d),
      cargo: loadCargo(d),
    }));
    const validas = candidatas.filter(
      (c) => c.total < LIMITE_FOLGA_DIA_GLOBAL && c.cargo < limCargo,
    );
    const pool = validas.length ? validas : candidatas;
    pool.sort(
      (a, b) => a.total - b.total || a.cargo - b.cargo || a.d.localeCompare(b.d),
    );
    return pool[0].d;
  };

  // Alinha o início na SEGUNDA-feira da semana de `inicioISO` (domingo = último dia).
  const diaSemanaInicio = parseISODate(inicioISO).getDay(); // 0=dom..6=sáb
  const offsetSegunda = diaSemanaInicio === 0 ? -6 : 1 - diaSemanaInicio;
  const primeiraSegunda = addDays(inicioISO, offsetSegunda);

  const result: DiaEscala[] = [];

  for (let w = 0; w < semanas; w++) {
    // semana[0..5] = seg..sáb, semana[6] = domingo
    const semana: string[] = [];
    for (let i = 0; i < 7; i++) semana.push(addDays(primeiraSegunda, w * 7 + i));
    const domingo = semana[6];
    const diasUteis = semana.slice(0, 6); // seg a sáb (todos antes do domingo)

    if (colab.aceitaDomingo) {
      // Domingo SEMPRE trabalhado → compensatória num dia útil ANTES do domingo.
      const compData = escolherDia(diasUteis);
      registra(compData);
      for (const d of semana) {
        if (d === compData) {
          result.push({ colaboradorId: colab.id, data: d, tipo: "compensatoria" });
        } else {
          result.push({ colaboradorId: colab.id, data: d, tipo: "trabalho" });
        }
      }
    } else {
      // Não trabalha domingo → folga semanal no próprio domingo.
      registra(domingo);
      for (const d of semana) {
        result.push({
          colaboradorId: colab.id,
          data: d,
          tipo: d === domingo ? "folga" : "trabalho",
        });
      }
    }
  }

  return result;
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
