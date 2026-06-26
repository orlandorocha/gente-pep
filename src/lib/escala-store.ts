// Store do módulo 6x1.
// API síncrona apoiada em cache local + sincronização com Supabase em segundo plano.
// - Lê/escreve imediatamente em localStorage (UX rápida + offline).
// - Hidrata em background a partir de Supabase (escala_colaboradores, escala_dias,
//   escala_feriados). Replicação fire-and-forget em cada escrita.
// - Se as tabelas não existirem, continua via cache local + seed de demonstração.
// - Permite IMPORTAR colaboradores do sistema principal (tabela `colaboradores`).

import { supabase } from "@/integrations/supabase/client";
import type { DiaEscala, DiaTipo, EscalaColaborador } from "./escala-types";
import { addDays, toISODate } from "./escala-engine";

const KEY_COLAB = "escala6x1.colaboradores";
const KEY_DIAS = "escala6x1.dias";
const KEY_FERIADOS = "escala6x1.feriados";
const EVT = "escala:updated";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function emit() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVT));
}

function seed(): {
  colaboradores: EscalaColaborador[];
  dias: DiaEscala[];
  feriados: string[];
} {
  const colaboradores: EscalaColaborador[] = [
    { id: "c1", nome: "Ana Beatriz Souza",     matricula: "0001", cargo: "Atendente",  setor: "Loja A",    supervisor: "Marcos Pereira", admissao: "2023-04-15", escala: "6x1", aceitaDomingo: true  },
    { id: "c2", nome: "Carlos Henrique Lima",  matricula: "0002", cargo: "Caixa",      setor: "Loja A",    supervisor: "Marcos Pereira", admissao: "2022-09-01", escala: "6x1", aceitaDomingo: false },
    { id: "c3", nome: "Daniela Martins",       matricula: "0003", cargo: "Estoquista", setor: "Logística", supervisor: "Renata Alves",   admissao: "2024-01-10", escala: "6x1", aceitaDomingo: true  },
    { id: "c4", nome: "Eduardo Nunes",         matricula: "0004", cargo: "Atendente",  setor: "Loja B",    supervisor: "Felipe Castro",  admissao: "2021-11-22", escala: "6x1", aceitaDomingo: true  },
    { id: "c5", nome: "Fernanda Oliveira",     matricula: "0005", cargo: "Caixa",      setor: "Loja B",    supervisor: "Felipe Castro",  admissao: "2023-07-05", escala: "6x1", aceitaDomingo: false },
  ];

  const dias: DiaEscala[] = [];
  const hoje = new Date();
  hoje.setDate(1);
  for (const c of colaboradores) {
    const offset = parseInt(c.matricula, 10) % 7;
    for (let i = 0; i < 60; i++) {
      const data = toISODate(new Date(hoje.getFullYear(), hoje.getMonth(), 1 + i));
      const ciclo = (i + offset) % 7;
      let tipo: DiaTipo = "trabalho";
      if (ciclo === 6) tipo = "folga";
      dias.push({ colaboradorId: c.id, data, tipo });
    }
  }
  return { colaboradores, dias, feriados: [] };
}

function ensureSeed() {
  const existing = read<EscalaColaborador[] | null>(KEY_COLAB, null);
  if (existing && existing.length) {
    // Migração: garante o campo aceitaDomingo
    if (existing.some((c) => typeof c.aceitaDomingo !== "boolean")) {
      const migrated = existing.map((c) => ({ ...c, aceitaDomingo: c.aceitaDomingo ?? false }));
      write(KEY_COLAB, migrated);
    }
    return;
  }
  const s = seed();
  write(KEY_COLAB, s.colaboradores);
  write(KEY_DIAS, s.dias);
  write(KEY_FERIADOS, s.feriados);
}

// ====================== Hidratação Supabase ======================
let hydratePromise: Promise<void> | null = null;

async function hydrateFromSupabase(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const [colabRes, diasRes, ferRes] = await Promise.all([
      (supabase as any).from("escala_colaboradores").select("*"),
      (supabase as any).from("escala_dias").select("*"),
      (supabase as any).from("escala_feriados").select("data"),
    ]);

    if (colabRes.error || diasRes.error || ferRes.error) {
      console.warn("[escala] Hidratação Supabase indisponível, usando cache local.", {
        colab: colabRes.error?.message,
        dias: diasRes.error?.message,
        feriados: ferRes.error?.message,
      });
      return;
    }

    const colaboradores: EscalaColaborador[] = (colabRes.data ?? []).map((r: any) => ({
      id: r.id,
      nome: r.nome,
      matricula: r.matricula,
      cargo: r.cargo ?? "",
      setor: r.setor ?? "",
      supervisor: r.supervisor ?? "",
      admissao: r.admissao,
      escala: "6x1",
      aceitaDomingo: !!r.aceita_domingo,
    }));
    const dias: DiaEscala[] = (diasRes.data ?? []).map((r: any) => ({
      colaboradorId: r.colaborador_id,
      data: r.data,
      tipo: r.tipo,
    }));
    const feriados: string[] = (ferRes.data ?? []).map((r: any) => r.data);

    if (colaboradores.length > 0) {
      write(KEY_COLAB, colaboradores);
      write(KEY_DIAS, dias);
      write(KEY_FERIADOS, feriados);
      emit();
    }
  } catch (err) {
    console.warn("[escala] Hidratação Supabase falhou:", err);
  }
}

export function syncEscala(): Promise<void> {
  if (!hydratePromise) hydratePromise = hydrateFromSupabase();
  return hydratePromise;
}

if (typeof window !== "undefined") {
  ensureSeed();
  setTimeout(() => void syncEscala(), 50);
}

export function subscribeEscala(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVT, cb);
  return () => window.removeEventListener(EVT, cb);
}

// ====================== Leitura ======================
export function loadColaboradores(): EscalaColaborador[] {
  ensureSeed();
  return read<EscalaColaborador[]>(KEY_COLAB, []);
}

export function loadDias(): DiaEscala[] {
  ensureSeed();
  return read<DiaEscala[]>(KEY_DIAS, []);
}

export function loadFeriados(): string[] {
  ensureSeed();
  return read<string[]>(KEY_FERIADOS, []);
}

// ====================== Escrita (cache + Supabase) ======================
export function saveColaboradores(list: EscalaColaborador[]) {
  write(KEY_COLAB, list);
  emit();
  void (async () => {
    try {
      const payload = list.map((c) => ({
        id: c.id,
        nome: c.nome,
        matricula: c.matricula,
        cargo: c.cargo,
        setor: c.setor,
        supervisor: c.supervisor,
        admissao: c.admissao,
        aceita_domingo: c.aceitaDomingo,
      }));
      await (supabase as any).from("escala_colaboradores").upsert(payload, { onConflict: "id" });
    } catch (err) {
      console.warn("[escala] upsert colaboradores falhou:", err);
    }
  })();
}

export function saveDias(list: DiaEscala[]) {
  write(KEY_DIAS, list);
  emit();
}

export function saveFeriados(list: string[]) {
  write(KEY_FERIADOS, list);
  emit();
  void (async () => {
    try {
      await (supabase as any).from("escala_feriados").delete().neq("data", "0001-01-01");
      if (list.length > 0) {
        await (supabase as any).from("escala_feriados").insert(list.map((d) => ({ data: d })));
      }
    } catch (err) {
      console.warn("[escala] sync feriados falhou:", err);
    }
  })();
}

export function upsertDia(d: DiaEscala) {
  const all = loadDias();
  const i = all.findIndex(
    (x) => x.colaboradorId === d.colaboradorId && x.data === d.data,
  );
  if (i >= 0) all[i] = d;
  else all.push(d);
  write(KEY_DIAS, all);
  emit();
  void (async () => {
    try {
      await (supabase as any).from("escala_dias").upsert(
        { colaborador_id: d.colaboradorId, data: d.data, tipo: d.tipo },
        { onConflict: "colaborador_id,data" },
      );
    } catch (err) {
      console.warn("[escala] upsert dia falhou:", err);
    }
  })();
}

/** Insere/atualiza vários dias de uma só vez (1 escrita local + 1 evento). */
export function upsertDias(novos: DiaEscala[]) {
  if (!novos.length) return;
  const all = loadDias();
  const idx = new Map(all.map((x, i) => [`${x.colaboradorId}|${x.data}`, i] as const));
  for (const d of novos) {
    const k = `${d.colaboradorId}|${d.data}`;
    const i = idx.get(k);
    if (i !== undefined) all[i] = d;
    else {
      idx.set(k, all.length);
      all.push(d);
    }
  }
  write(KEY_DIAS, all);
  emit();
  void (async () => {
    try {
      await (supabase as any).from("escala_dias").upsert(
        novos.map((d) => ({
          colaborador_id: d.colaboradorId,
          data: d.data,
          tipo: d.tipo,
        })),
        { onConflict: "colaborador_id,data" },
      );
    } catch (err) {
      console.warn("[escala] upsert dias (lote) falhou:", err);
    }
  })();
}

/** Remove um colaborador do módulo 6x1 e todos os seus dias programados. */
export function removerColaborador(colaboradorId: string) {
  const colabs = loadColaboradores().filter((c) => c.id !== colaboradorId);
  const dias = loadDias().filter((d) => d.colaboradorId !== colaboradorId);
  write(KEY_COLAB, colabs);
  write(KEY_DIAS, dias);
  emit();
  void (async () => {
    try {
      await (supabase as any)
        .from("escala_dias")
        .delete()
        .eq("colaborador_id", colaboradorId);
      await (supabase as any)
        .from("escala_colaboradores")
        .delete()
        .eq("id", colaboradorId);
    } catch (err) {
      console.warn("[escala] remover colaborador falhou:", err);
    }
  })();
}

export function removerDia(colaboradorId: string, data: string) {
  const all = loadDias().filter(
    (x) => !(x.colaboradorId === colaboradorId && x.data === data),
  );
  write(KEY_DIAS, all);
  emit();
  void (async () => {
    try {
      await (supabase as any)
        .from("escala_dias")
        .delete()
        .eq("colaborador_id", colaboradorId)
        .eq("data", data);
    } catch (err) {
      console.warn("[escala] delete dia falhou:", err);
    }
  })();
}

export function novoColaboradorId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function novaMatricula(existentes: EscalaColaborador[]): string {
  const max = existentes.reduce(
    (acc, c) => Math.max(acc, parseInt(c.matricula, 10) || 0),
    0,
  );
  return String(max + 1).padStart(4, "0");
}

export function resetarDemo() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY_COLAB);
  window.localStorage.removeItem(KEY_DIAS);
  window.localStorage.removeItem(KEY_FERIADOS);
  hydratePromise = null;
  // Limpa também os dados remotos do módulo 6x1 para evitar que
  // colaboradores antigos voltem na próxima hidratação.
  void (async () => {
    try {
      await (supabase as any).from("escala_dias").delete().neq("data", "0001-01-01");
      await (supabase as any).from("escala_colaboradores").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    } catch (err) {
      console.warn("[escala] reset remoto falhou:", err);
    }
  })();
  ensureSeed();
  emit();
}

/**
 * Importa colaboradores ATIVOS do sistema principal (`colaboradores` + `gestores`)
 * para o módulo 6x1. Faz match por `gpid` (usado como matrícula). Não duplica
 * registros já existentes — apenas adiciona novos.
 * Retorna { importados, jaExistiam }.
 */
export async function importarDoSistemaPrincipal(): Promise<{
  importados: number;
  jaExistiam: number;
}> {
  const [colabRes, gestRes] = await Promise.all([
    (supabase as any)
      .from("colaboradores")
      .select("id, nome, gpid, cargo, area, turno, status, gestor_id")
      .eq("status", "Ativo"),
    (supabase as any).from("gestores").select("id, nome"),
  ]);
  if (colabRes.error) throw colabRes.error;
  const gestores: Record<string, string> = {};
  for (const g of gestRes.data ?? []) gestores[g.id] = g.nome;

  const atuais = loadColaboradores();
  const porMatricula = new Map(atuais.map((c) => [c.matricula, c]));
  const porId = new Map(atuais.map((c) => [c.id, c]));

  let importados = 0;
  let jaExistiam = 0;
  const next: EscalaColaborador[] = [...atuais];

  for (const r of colabRes.data ?? []) {
    const matricula = String(r.gpid ?? "").trim() || String(r.id).slice(0, 8);
    if (porMatricula.has(matricula) || porId.has(r.id)) {
      jaExistiam++;
      continue;
    }
    next.push({
      id: r.id,
      nome: r.nome,
      matricula,
      cargo: r.cargo ?? "",
      setor: r.area ?? "",
      supervisor: gestores[r.gestor_id] ?? "",
      admissao: toISODate(new Date()),
      escala: "6x1",
      aceitaDomingo: false,
    });
    importados++;
  }
  if (importados > 0) saveColaboradores(next);
  return { importados, jaExistiam };
}

export { addDays };

/** Item da base principal usado nos dropdowns do módulo 6x1. */
export type ColaboradorBase = {
  id: string;
  nome: string;
  matricula: string;
  cargo: string;
  setor: string;
  supervisor: string;
};

/**
 * Lê a base principal de colaboradores ATIVOS para popular o dropdown
 * "Nome" no cadastro do módulo 6x1.
 */
export async function fetchColaboradoresBase(): Promise<ColaboradorBase[]> {
  try {
    const [colabRes, gestRes] = await Promise.all([
      (supabase as any)
        .from("colaboradores")
        .select("id, nome, gpid, cargo, area, status, gestor_id")
        .eq("status", "Ativo")
        .order("nome", { ascending: true }),
      (supabase as any).from("gestores").select("id, nome"),
    ]);
    if (colabRes.error) throw colabRes.error;
    const gestores: Record<string, string> = {};
    for (const g of gestRes.data ?? []) gestores[g.id] = g.nome;
    return (colabRes.data ?? []).map((r: any) => ({
      id: r.id,
      nome: r.nome,
      matricula: String(r.gpid ?? "").trim() || String(r.id).slice(0, 8),
      cargo: r.cargo ?? "",
      setor: r.area ?? "",
      supervisor: gestores[r.gestor_id] ?? "",
    }));
  } catch (err) {
    console.warn("[escala] fetchColaboradoresBase falhou:", err);
    return [];
  }
}
