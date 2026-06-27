// Tipos do módulo de Controle de Jornada Contínua

export type DiaTipo =
  | "trabalho"      // Verde: trabalhando
  | "folga"         // Azul: folga semanal
  | "compensatoria" // Laranja: folga compensatória de domingo
  | "feriado"       // Cinza
  | "vazio";        // não programado

export type Turno = "Manhã" | "Tarde" | "Noite";

export interface EscalaColaborador {
  id: string;
  nome: string;
  matricula: string;
  cargo: string;
  setor: string;
  supervisor: string;
  turno: Turno;
  admissao: string; // ISO date
  escala: string;
  /**
   * Indica se o colaborador concorda em realizar trabalho aos domingos.
   * Quando false, o sistema bloqueia qualquer marcação de "trabalho" em domingos.
   */
  aceitaDomingo: boolean;
}

export interface ColaboradorBase {
  id: string;
  nome: string;
  matricula: string;
  cargo: string;
  setor: string;
  supervisor: string;
  turno: Turno;
}

export interface DiaEscala {
  data: string;          // YYYY-MM-DD
  colaboradorId: string;
  tipo: DiaTipo;
}

export interface ValidationIssue {
  level: "info" | "warn" | "error";
  data: string;
  colaboradorId: string;
  message: string;
}

export interface ColaboradorStatus {
  colaboradorId: string;
  diasConsecutivos: number;
  ultimaFolga: string | null;
  proximaFolgaObrigatoria: string | null;
  compensatoriasPendentes: number;
  compensatoriasGeradas: number;
  compensatoriasUtilizadas: number;
  impedidoProximoDomingo: boolean;
  /** Data limite (ISO) para conceder a próxima folga compensatória pendente. */
  proximoVencimentoCompensatoria: string | null;
  domingosTrabalhadosMes: number;
  diasTrabalhadosMes: number;
  folgasSemanaisMes: number;
  totalHorasMes: number;
  irregularidades: ValidationIssue[];
  alertNivel: "ok" | "amarelo" | "vermelho" | "critico";
}
