// @ts-nocheck
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { downloadXlsx, readXlsxRows, processarComResiencia } from "@/lib/xlsx-utils";
import { supabase } from "@/integrations/custom-supabase/client";
import { CARGOS } from "@/data/cargos";
import { AREAS } from "@/data/areas";
import type { ColaboradorRow, GestorRow } from "@/hooks/useData";

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

type ImportRow = {
  nome: string;
  email: string | null;
  gpid: string;
  cargo: string | null;
  area: string | null;
  turno: "Manhã" | "Tarde" | "Noite" | null;
  status: "Ativo" | "Inativo" | "Afastado" | null;
  gestor_id: string | null;
  gestorMatched: boolean;
  hasGestorRef: boolean;
};

type ExistingImportRow = Pick<ColaboradorRow, "id" | "nome" | "email" | "gpid" | "cargo" | "area" | "turno" | "status" | "gestor_id">;
type DuplicateDecision = "atualizar" | "manter";

function formatValue(value: string | null | undefined) {
  return value && String(value).trim() ? value : "—";
}

function mergeImportRow(row: ImportRow, existing?: ExistingImportRow) {
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
}

function normalizeToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function ExportColaboradoresButton({
  colaboradores,
  area,
  turno,
}: {
  colaboradores: Pick<ColaboradorRow, "gpid" | "nome" | "turno" | "area" | "status">[];
  area: string;
  turno: string;
}) {
  function exportar() {
    const rows = colaboradores.map((colaborador) => ({
      GPID: colaborador.gpid,
      Colaborador: colaborador.nome,
      Turno: colaborador.turno,
      Área: colaborador.area,
      Status: colaborador.status,
    }));

    const suffixParts = [
      area !== "all" ? normalizeToken(area) : "",
      turno !== "all" ? normalizeToken(turno) : "",
    ].filter(Boolean);
    const suffix = suffixParts.length ? `-${suffixParts.join("-")}` : "";

    downloadXlsx(rows, "Colaboradores", `colaboradores${suffix}.xlsx`);
    toast.success(`${rows.length} colaborador(es) exportado(s)`);
  }

  return (
    <Button variant="outline" size="sm" onClick={exportar} disabled={colaboradores.length === 0}>
      <Download className="h-4 w-4 mr-1" />Exportar XLSX
    </Button>
  );
}

export function ImportColaboradoresButton({
  gestores, onDone,
}: { gestores: GestorRow[]; onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pendingRows, setPendingRows] = useState<ImportRow[]>([]);
  const [pendingErrors, setPendingErrors] = useState<string[]>([]);
  const [duplicateRows, setDuplicateRows] = useState<Array<{
    imported: ImportRow;
    existing: ExistingImportRow;
    decision: DuplicateDecision;
  }>>([]);

  const duplicateOpen = duplicateRows.length > 0;
  const duplicateCount = duplicateRows.length;
  const duplicateSummary = useMemo(() => ({
    atualizar: duplicateRows.filter((row) => row.decision === "atualizar").length,
    manter: duplicateRows.filter((row) => row.decision === "manter").length,
  }), [duplicateRows]);

  async function applyImport(rows: ImportRow[], baseErrors: string[], kept = 0) {
    const errors = [...baseErrors];
    let atualizados = 0;
    let inseridos = 0;
    const BATCH = 500;

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const gpids = batch.map((row) => row.gpid);
      const { data: existentes, error: readError } = await supabase
        .from("colaboradores")
        .select("id, nome, email, gpid, cargo, area, turno, status, gestor_id")
        .in("gpid", gpids);

      if (readError) {
        errors.push(`Lote ${i / BATCH + 1}: ${readError.message}`);
        continue;
      }

      const existingRows = new Map((existentes ?? []).map((row) => [row.gpid, row as ExistingImportRow]));
      const existingGpids = new Set(existingRows.keys());
      const mergedBatch = batch.map((row) => mergeImportRow(row, existingRows.get(row.gpid)));

      const { error: batchError } = await supabase
        .from("colaboradores")
        .upsert(mergedBatch, { onConflict: "gpid", ignoreDuplicates: false });

      if (!batchError) {
        for (const row of mergedBatch) {
          if (existingGpids.has(row.gpid)) atualizados += 1;
          else inseridos += 1;
        }
        continue;
      }

      // Se falhar o lote, processa cada registro individualmente com resiliência
      const resultado = await processarComResiencia(
        mergedBatch,
        async (row) => {
          const { error } = await supabase
            .from("colaboradores")
            .upsert(row, { onConflict: "gpid", ignoreDuplicates: false });
          if (error) throw new Error(`GPID ${row.gpid}: ${error.message}`);
        }
      );

      for (const row of mergedBatch) {
        if (existingGpids.has(row.gpid)) atualizados += 1;
        else inseridos += 1;
      }

      if (resultado.erros.length) {
        errors.push(...resultado.erros.map((e) => `Lote ${i / BATCH + 1}: ${e}`));
      }
    }

    const ok = atualizados + inseridos;

    setDuplicateRows([]);
    setPendingRows([]);
    setPendingErrors([]);

    if (ok) {
      const keptText = kept ? ` ${kept} duplicado(s) mantido(s) sem alteração.` : "";
      toast.success(`${ok} colaboradores processados: ${inseridos} novos e ${atualizados} atualizados.${keptText} ${errors.length} erros.`);
    } else {
      toast.error(`Nenhum colaborador importado. ${errors.length} erros.`);
    }
    if (errors.length) console.warn("Importação colaboradores — erros:", errors);
    onDone();
  }

  async function handle(file: File) {
    setBusy(true);
    try {
      const rows = await readXlsxRows(file);
      const inserts: ImportRow[] = []; const erros: string[] = [];
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
      const gpids = dedup.map((row) => row.gpid);
      const { data: existentes, error: duplicateReadError } = gpids.length
        ? await supabase
          .from("colaboradores")
          .select("id, nome, email, gpid, cargo, area, turno, status, gestor_id")
          .in("gpid", gpids)
        : { data: [], error: null };

      if (duplicateReadError) throw duplicateReadError;

      const existingRows = new Map((existentes ?? []).map((row) => [row.gpid, row as ExistingImportRow]));
      const duplicates = dedup
        .filter((row) => existingRows.has(row.gpid))
        .map((row) => ({
          imported: row,
          existing: existingRows.get(row.gpid) as ExistingImportRow,
          decision: "atualizar" as DuplicateDecision,
        }));

      if (duplicates.length) {
        setPendingRows(dedup);
        setPendingErrors(erros);
        setDuplicateRows(duplicates);
        setBusy(false);
        return;
      }

      await applyImport(dedup, erros);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }

  async function resolveDuplicates() {
    setBusy(true);
    try {
      const allowedGpids = new Set(
        duplicateRows
          .filter((row) => row.decision === "atualizar")
          .map((row) => row.imported.gpid),
      );
      const kept = duplicateRows.filter((row) => row.decision === "manter").length;
      const rowsToApply = pendingRows.filter((row) => {
        const duplicate = duplicateRows.find((item) => item.imported.gpid === row.gpid);
        return !duplicate || allowedGpids.has(row.gpid);
      });
      await applyImport(rowsToApply, pendingErrors, kept);
    } catch (error) {
      toast.error((error as Error).message);
    }
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

      <Dialog open={duplicateOpen} onOpenChange={(open) => {
        if (!open && !busy) {
          setDuplicateRows([]);
          setPendingRows([]);
          setPendingErrors([]);
        }
      }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Colaboradores duplicados na importação</DialogTitle>
            <DialogDescription>
              Encontramos {duplicateCount} colaborador(es) já cadastrado(s) na base com o mesmo GPID. Revise abaixo antes de concluir a importação.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
            {duplicateRows.map((row) => (
              <div key={row.imported.gpid} className="rounded-md border p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{row.imported.nome}</div>
                    <div className="text-xs text-muted-foreground">GPID {row.imported.gpid}</div>
                  </div>
                  <select
                    className="rounded-md border bg-background px-3 py-2 text-sm"
                    value={row.decision}
                    onChange={(e) => setDuplicateRows((items) => items.map((item) => item.imported.gpid === row.imported.gpid
                      ? { ...item, decision: e.target.value as DuplicateDecision }
                      : item))}
                  >
                    <option value="atualizar">Atualizar com os dados da planilha</option>
                    <option value="manter">Manter cadastro atual</option>
                  </select>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-md border bg-muted/20 p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Base atual</div>
                    <div className="space-y-1 text-sm">
                      <div><span className="font-medium">Nome:</span> {formatValue(row.existing.nome)}</div>
                      <div><span className="font-medium">Email:</span> {formatValue(row.existing.email)}</div>
                      <div><span className="font-medium">Cargo:</span> {formatValue(row.existing.cargo)}</div>
                      <div><span className="font-medium">Área:</span> {formatValue(row.existing.area)}</div>
                      <div><span className="font-medium">Turno:</span> {formatValue(row.existing.turno)}</div>
                      <div><span className="font-medium">Status:</span> {formatValue(row.existing.status)}</div>
                    </div>
                  </div>

                  <div className="rounded-md border bg-primary/5 p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Planilha importada</div>
                    <div className="space-y-1 text-sm">
                      <div><span className="font-medium">Nome:</span> {formatValue(row.imported.nome)}</div>
                      <div><span className="font-medium">Email:</span> {formatValue(row.imported.email)}</div>
                      <div><span className="font-medium">Cargo:</span> {formatValue(row.imported.cargo)}</div>
                      <div><span className="font-medium">Área:</span> {formatValue(row.imported.area)}</div>
                      <div><span className="font-medium">Turno:</span> {formatValue(row.imported.turno)}</div>
                      <div><span className="font-medium">Status:</span> {formatValue(row.imported.status)}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
            <div className="text-xs text-muted-foreground">
              {duplicateSummary.atualizar} para atualizar, {duplicateSummary.manter} para manter como está.
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setDuplicateRows([]);
                  setPendingRows([]);
                  setPendingErrors([]);
                }}
              >
                Cancelar importação
              </Button>
              <Button disabled={busy} onClick={resolveDuplicates}>
                {busy ? "Aplicando..." : "Aplicar decisões"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
