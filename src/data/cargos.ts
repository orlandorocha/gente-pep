export const CARGOS = [
  "OPERADOR DE PRODUÇÃO I",
  "OPERADOR DE PRODUÇÃO II",
  "AUXILIAR DE PRODUÇÃO",
] as const;

export type Cargo = (typeof CARGOS)[number];
