// Feriados nacionais brasileiros (fixos + móveis baseados na Páscoa).
// Usado para identificar automaticamente dias não úteis no calendário 6x1.

import { toISODate } from "./escala-engine";

/** Calcula a data da Páscoa (domingo) de um ano — algoritmo de Meeus/Butcher. */
export function domingoDePascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

function addDias(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

export interface FeriadoBR {
  data: string; // ISO yyyy-mm-dd
  nome: string;
}

/**
 * Retorna os feriados nacionais brasileiros de um ano.
 * Inclui feriados fixos e móveis (Carnaval, Sexta-feira Santa, Corpus Christi).
 */
export function feriadosNacionais(ano: number): FeriadoBR[] {
  const pascoa = domingoDePascoa(ano);

  const fixos: FeriadoBR[] = [
    { data: `${ano}-01-01`, nome: "Confraternização Universal" },
    { data: `${ano}-04-21`, nome: "Tiradentes" },
    { data: `${ano}-05-01`, nome: "Dia do Trabalho" },
    { data: `${ano}-09-07`, nome: "Independência do Brasil" },
    { data: `${ano}-10-12`, nome: "Nossa Senhora Aparecida" },
    { data: `${ano}-11-02`, nome: "Finados" },
    { data: `${ano}-11-15`, nome: "Proclamação da República" },
    { data: `${ano}-11-20`, nome: "Consciência Negra" },
    { data: `${ano}-12-25`, nome: "Natal" },
  ];

  const moveis: FeriadoBR[] = [
    { data: toISODate(addDias(pascoa, -47)), nome: "Carnaval" },
    { data: toISODate(addDias(pascoa, -2)), nome: "Sexta-feira Santa" },
    { data: toISODate(addDias(pascoa, 60)), nome: "Corpus Christi" },
  ];

  return [...fixos, ...moveis].sort((a, b) => a.data.localeCompare(b.data));
}

/** Conjunto (Set) de datas ISO de feriados nacionais para 1+ anos. */
export function feriadosNacionaisSet(...anos: number[]): Set<string> {
  const set = new Set<string>();
  for (const ano of anos) {
    for (const f of feriadosNacionais(ano)) set.add(f.data);
  }
  return set;
}

/** Mapa data ISO -> nome do feriado, para exibição em tooltips. */
export function mapaFeriados(...anos: number[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const ano of anos) {
    for (const f of feriadosNacionais(ano)) map.set(f.data, f.nome);
  }
  return map;
}
