import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { readXlsxRows } from "@/lib/xlsx-utils";
import { supabase } from "@/integrations/custom-supabase/client";
import { CARGOS } from "@/data/cargos";
import { AREAS } from "@/data/areas";
import type { GestorRow } from "@/hooks/useData";

const TURNO_MAP: Record<string, "Manhã" | "Tarde" | "Noite"> = {
  "1": "Manhã", "1º": "Manhã", "1° TURNO": "Manhã", "1º TURNO": "Manhã", "1 TURNO": "Manhã",
  "MANHÃ": "Manhã", "MANHA": "Manhã",
  "2": "Tarde", "2º": "Tarde", "2° TURNO": "Tarde", "2º TURNO": "Tarde", "2 TURNO": "Tarde",
  "TARDE": "Tarde",
  "3": "Noite", "3º": "Noite", "3° TURNO": "Noite", "3º TURNO": "Noite", "3 TURNO": "Noite",
  "NOITE": "Noite",
};

function parseTurno(v: any): "Manhã" | "Tarde" | "Noite" {
  const s = String(v ?? "").trim().toUpperCase();
  return TURNO_MAP[s] ?? (s.includes("1") ? "Manhã" : s.includes("2") ? "Tarde" : s.includes("3") ? "Noite" : "Manhã");
}

function matchFromList(list: readonly string[], v: string): string | null {
  const n = v.trim().toLowerCase();
  if (!n) return null;
  return list.find((x) => x.toLowerCase() === n)
      ?? list.find((x) => x.toLowerCase().includes(n) || n.includes(x.toLowerCase()))
      ?? null;
}

export function ImportColaboradoresButton({
  gestores, onDone,
}: { gestores: GestorRow[]; onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handle(file: File) {
    setBusy(true);
    try {
      const rows = await readXlsxRows(file);
      const inserts: any[] = []; const erros: string[] = [];
      const gMap = new Map(gestores.map((g) => [g.nome.trim().toLowerCase(), g.id]));

      for (const [i, r] of rows.entries()) {
        const nome = String(r.nome ?? r.Nome ?? "").trim();
        const gpid = String(r.gpid ?? r.GPID ?? r.Gpid ?? "").trim();
        if (!nome || !gpid) { erros.push(`Linha ${i + 2}: nome/gpid obrigatórios`); continue; }

        const cargoRaw = String(r.cargo ?? r.Cargo ?? "").trim();
        const areaRaw = String(r.area ?? r.Area ?? r.Área ?? "").trim();
        const cargo = cargoRaw ? (matchFromList(CARGOS, cargoRaw) ?? cargoRaw) : null;
        const area = areaRaw ? (matchFromList(AREAS, areaRaw) ?? areaRaw) : null;

        const turnoRaw = r.turno ?? r.Turno;
        const turno = String(turnoRaw ?? "").trim() ? parseTurno(turnoRaw) : null;
        const statusRaw = String(r.stats ?? r.status ?? r.Status ?? "").trim();
        const status = statusRaw
          ? (["Ativo", "Inativo", "Afastado"].find((s) => s.toLowerCase() === statusRaw.toLowerCase()) ?? "Ativo")
          : null;

        const gestorRef = String(r.gestor_id ?? r.gestor ?? r.Gestor ?? "").trim().toLowerCase();
        let gestor_id: string | null = null;
        let gestorMatched = false;
        if (gestorRef) {
          gestor_id = gMap.get(gestorRef) ?? null;
          if (!gestor_id) {
            // tenta primeiro nome
            const first = gestorRef.split(/\s+/)[0];
            for (const [k, v] of gMap) if (k.startsWith(first)) { gestor_id = v; break; }
          }
          gestorMatched = !!gestor_id;
          if (!gestorMatched) erros.push(`Linha ${i + 2}: gestor "${gestorRef}" não encontrado. O vínculo atual será preservado, se existir.`);
        }

        const email = String(r.email ?? r.Email ?? "").trim() || null;

        inserts.push({
          nome, email, gpid, cargo, area, turno, status, gestor_id, gestorMatched, hasGestorRef: !!gestorRef,
        });
      }

      // dedupe por gpid dentro do próprio arquivo (mantém o último)
      const dedup = Array.from(new Map(inserts.map((r) => [r.gpid, r])).values());
      let ok = 0;
      let atualizados = 0;
      let inseridos = 0;
      const BATCH = 500;
      for (let i = 0; i < dedup.length; i += BATCH) {
        const batch = dedup.slice(i, i + BATCH);
        const gpids = batch.map((row) => row.gpid);
        const { data: existentes, error: readError } = await supabase
          .from("colaboradores")
          .select("gpid, email, cargo, area, turno, status, gestor_id")
          .in("gpid", gpids);

        if (readError) {
          erros.push(`Lote ${i / BATCH + 1}: ${readError.message}`);
          continue;
        }

        const existingRows = new Map((existentes ?? []).map((row) => [row.gpid, row]));
        const existingGpids = new Set(existingRows.keys());
        const mergedBatch = batch.map((row) => {
          const existing = existingRows.get(row.gpid);
          if (!existing) {
            return {
              nome: row.nome,
              gpid: row.gpid,
              email: row.email ?? `${row.gpid}@empresa.local`,
              cargo: row.cargo ?? "",
              area: row.area ?? "",
              turno: row.turno ?? "Manhã",
              status: row.status ?? "Ativo",
              gestor_id: row.gestorMatched ? row.gestor_id : null,
            };
          }

          return {
            nome: row.nome,
            gpid: row.gpid,
            email: row.email ?? existing.email ?? `${row.gpid}@empresa.local`,
            cargo: row.cargo ?? existing.cargo ?? "",
            area: row.area ?? existing.area ?? "",
            turno: row.turno ?? existing.turno ?? "Manhã",
            status: row.status ?? existing.status ?? "Ativo",
            gestor_id: row.hasGestorRef
              ? (row.gestorMatched ? row.gestor_id : existing.gestor_id ?? null)
              : (existing.gestor_id ?? null),
          };
        });
        const { error: batchError } = await supabase
          .from("colaboradores")
          .upsert(mergedBatch, { onConflict: "gpid", ignoreDuplicates: false });

        if (!batchError) {
          for (const row of mergedBatch) {
            if (existingGpids.has(row.gpid)) atualizados += 1;
            else inseridos += 1;
          }
          ok += mergedBatch.length;
          continue;
        }

        for (const row of mergedBatch) {
          const existed = existingGpids.has(row.gpid);
          const { error } = await supabase
            .from("colaboradores")
            .upsert(row, { onConflict: "gpid", ignoreDuplicates: false });

          if (error) {
            erros.push(`Lote ${i / BATCH + 1} / GPID ${row.gpid}: ${error.message}`);
            continue;
          }

          if (existed) atualizados += 1;
          else inseridos += 1;
          ok += 1;
        }
      }
      if (ok) toast.success(`${ok} colaboradores processados: ${inseridos} novos e ${atualizados} atualizados. ${erros.length} erros.`);
      else toast.error(`Nenhum colaborador importado. ${erros.length} erros.`);
      if (erros.length) console.warn("Importação colaboradores — erros:", erros);
      onDone();
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }

  return (
    <>
      <input ref={ref} type="file" accept=".xlsx" hidden onChange={(e) => {
        const f = e.target.files?.[0]; if (f) handle(f); e.target.value = "";
      }} />
      <Button variant="outline" size="sm" disabled={busy} onClick={() => ref.current?.click()}>
        <Upload className="h-4 w-4 mr-1" />{busy ? "Importando..." : "Importar XLSX"}
      </Button>
    </>
  );
}
