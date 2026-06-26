// Tipos do módulo de Controle de Folgas e Escala 6x1

export type DiaTipo =
  | "trabalho"      // Verde: trabalhando
  | "folga"         // Azul: folga semanal
  | "compensatoria" // Laranja: folga compensatória de domingo
  | "feriado"       // Cinza
  | "vazio";        // não programado

export interface EscalaColaborador {
  id: string;
  nome: string;
  matricula: string;
  cargo: string;
  setor: string;
  supervisor: string;
  admissao: string; // ISO date
  escala: "6x1";
  /**
   * Indica se o colaborador concorda em realizar horas extras aos domingos.
   * Quando false, o sistema bloqueia qualquer marcação de "trabalho" em domingos.
   * Quando true, cada domingo trabalhado gera obrigatoriamente 1 folga
   * compensatória dentro de 7 dias (CLT art. 67 e Súmula 146 TST).
   */
  aceitaDomingo: boolean;
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
  /** Data limite (ISO) para conceder a próxima folga compensatória pendente. */
  proximoVencimentoCompensatoria: string | null;
  domingosTrabalhadosMes: number;
  diasTrabalhadosMes: number;
  folgasSemanaisMes: number;
  totalHorasMes: number;
  irregularidades: ValidationIssue[];
  alertNivel: "ok" | "amarelo" | "vermelho" | "critico";
}
