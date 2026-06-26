// @ts-nocheck
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Download, Mail } from "lucide-react";
import { toast } from "sonner";
import { readXlsxRows, downloadXlsx, findColaborador, toISODate } from "@/lib/xlsx-utils";
import { supabase } from "@/integrations/custom-supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { enviarFaltasParaGestores } from "@/lib/email-faltas.functions";
import { formatDateBr } from "@/lib/date";

type Colab = { id: string; nome: string; gpid: string; area: string; turno: string; gestor_id?: string | null };
type Falta = { id: string; colaborador_id: string; data: string; motivo: string; periodo: string };
type Ferias = { id: string; colaborador_id: string; inicio: string; fim: string; periodo_aquisitivo: string; status: string };
type FaltaImportRow = {
  line: number;
  record: {
    colaborador_id: string;
    data: string;
    motivo: string;
    periodo: string;
    observacao: string;
  };
};

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function normalizeToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFaltaMotivo(value: string) {
  const normalized = normalizeToken(value);
  if (!normalized) return "Falta";

  const aliases: Record<string, string> = {
    "falta": "Falta",
    "falta injustificada": "Falta",
    "falta justificada": "Falta",
    "afastamento medico": "Afastamento Médico",
    "atestado medico": "Afastamento Médico",
    "licenca maternidade": "Licença Maternidade",
    "lisenca maternidade": "Licença Maternidade",
    "licenca paternidade": "Licença Paternidade",
    "licenca paternidadade": "Licença Paternidade",
  };

  return aliases[normalized] ?? value.trim();
}

function normalizeFaltaPeriodo(value: string) {
  const normalized = normalizeToken(value);
  if (!normalized) return "Integral";

  const aliases: Record<string, string> = {
    integral: "Integral",
    dia: "Integral",
    "dia todo": "Integral",
    manha: "Manhã",
    tarde: "Tarde",
    noite: "Noite",
  };

  return aliases[normalized] ?? value.trim();
}

async function upsertFaltasBatch(batch: FaltaImportRow[], erros: string[]) {
  const records = batch.map((row) => row.record);
  const { error } = await supabase
    .from("faltas")
    .upsert(records, { onConflict: "colaborador_id,data,motivo", ignoreDuplicates: false });

  if (!error) return batch.length;

  let ok = 0;
  for (const row of batch) {
    const { error: rowError } = await supabase
      .from("faltas")
      .upsert(row.record, { onConflict: "colaborador_id,data,motivo", ignoreDuplicates: false });

    if (rowError) {
      erros.push(`Linha ${row.line}: ${rowError.message}`);
      continue;
    }

    ok += 1;
  }

  return ok;
}

/** Importa Faltas a partir de .xlsx (colunas: data, colaborador_id (nome ou GPID), motivo, periodo, observacao) */
export function ImportFaltasButton({ colabs, onDone }: { colabs: Colab[]; onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [errorRows, setErrorRows] = useState<string[]>([]);
  const [showErrorDialog, setShowErrorDialog] = useState(false);

  async function handle(file: File) {
    setBusy(true);
    try {
      const rows = await readXlsxRows(file);
      const inserts: FaltaImportRow[] = []; const erros: string[] = [];
      for (const [i, r] of rows.entries()) {
        const data = toISODate(r.data ?? r.Data);
        const ref = String(r.colaborador_id ?? r.colaborador ?? r.Colaborador ?? r.gpid ?? r.GPID ?? "").trim();
        const motivo = normalizeFaltaMotivo(String(r.motivo ?? r.Motivo ?? "Falta"));
        const observacao = String(r.observacao ?? r.Observacao ?? r.Observação ?? "").trim();
        if (!data) { erros.push(`Linha ${i + 2}: data inválida`); continue; }
        const c = findColaborador(colabs, ref);
        if (!c) { erros.push(`Linha ${i + 2}: colaborador "${ref}" não encontrado`); continue; }
        const periodo = normalizeFaltaPeriodo(String(r.periodo ?? r.Período ?? ""));
        inserts.push({
          line: i + 2,
          record: { colaborador_id: c.id, data, motivo, periodo, observacao },
        });
      }
      const dedup = Array.from(new Map(inserts.map((r) => [`${r.record.colaborador_id}|${r.record.data}|${r.record.motivo}`, r])).values());
      let ok = 0;
      for (const batch of chunk(dedup, 500)) {
        ok += await upsertFaltasBatch(batch, erros);
      }
      toast.success(`${ok} faltas importadas/atualizadas. ${erros.length} erros.`);
      if (erros.length) {
        console.warn("Importação faltas — erros:", erros);
        setErrorRows(erros);
        setShowErrorDialog(true);
      } else {
        setErrorRows([]);
        setShowErrorDialog(false);
      }
      onDone();
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }

  return (
    <>
      <input ref={ref} type="file" accept=".xlsx" hidden onChange={(e) => {
        const f = e.target.files?.[0]; if (f) handle(f); e.target.value = "";
      }} />
      <Dialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Erros na importação de faltas</DialogTitle>
            <DialogDescription>
              Apenas os colaboradores com erro de importação foram listados abaixo. Revise os itens e tente novamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto rounded-md border border-secondary p-4 text-sm">
            {errorRows.length ? (
              errorRows.map((error, index) => (
                <div key={index} className="break-words">{error}</div>
              ))
            ) : (
              <div>Nenhum erro registrado.</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowErrorDialog(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => ref.current?.click()}>
        <Upload className="h-4 w-4 mr-1" />{busy ? "Importando..." : "Importar XLSX"}
      </Button>
    </>
  );
}

/** Exporta Faltas filtradas para .xlsx */
export function ExportFaltasButton({ faltas, colabs }: { faltas: Falta[]; colabs: Colab[] }) {
  const colMap = new Map(colabs.map(c => [c.id, c]));
  function exportar() {
    const rows = faltas.map(f => {
      const c = colMap.get(f.colaborador_id);
      return {
        GPID: c?.gpid ?? "—",
        Colaborador: c?.nome ?? "—",
        Área: c?.area ?? "—",
        Motivo: f.motivo,
        Turno: c?.turno ?? "—",
        Data: formatDateBr(f.data),
      };
    });
    downloadXlsx(rows, "Faltas", `faltas-${new Date().toISOString().slice(0,10)}.xlsx`);
    toast.success(`${rows.length} registros exportados`);
  }
  return (
    <Button variant="outline" size="sm" onClick={exportar}>
      <Download className="h-4 w-4 mr-1" />Exportar XLSX
    </Button>
  );
}

/** Envia email para cada gestor por turno com as faltas no período */
export function EmailGestoresButton() {
  const [open, setOpen] = useState(false);
  const [inicio, setInicio] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10);
  });
  const [fim, setFim] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const enviar = useServerFn(enviarFaltasParaGestores);

  async function go() {
    setBusy(true);
    try {
      const { data: faltas, error: faltasError } = await supabase
        .from("faltas")
        .select("data, motivo, periodo, colaborador_id")
        .eq("motivo", "Falta")
        .gte("data", inicio)
        .lte("data", fim)
        .order("data", { ascending: true });
      if (faltasError) throw new Error(`Falha ao buscar faltas: ${faltasError.message}`);

      if (!faltas || faltas.length === 0) {
        toast.success("Nenhuma falta no período.");
        setOpen(false);
        return;
      }

      const colabIds = [...new Set(faltas.map((f) => f.colaborador_id))];
      const { data: colabs, error: colabsError } = await supabase
        .from("colaboradores")
        .select("id, nome, gpid, area, turno, gestor_id")
        .in("id", colabIds);
      if (colabsError) throw new Error(`Falha ao buscar colaboradores: ${colabsError.message}`);

      const colMap = new Map((colabs ?? []).map((c) => [c.id, c]));
      const gestorIds = [...new Set((colabs ?? []).map((c) => c.gestor_id).filter(Boolean) as string[])];
      const { data: gestores, error: gestoresError } = gestorIds.length
        ? await supabase.from("gestores").select("id, nome, email").in("id", gestorIds)
        : { data: [], error: null };
      if (gestoresError) throw new Error(`Falha ao buscar gestores: ${gestoresError.message}`);

      const gestoresById = new Map((gestores ?? []).map((g) => [g.id, g]));
      const grupos = new Map<string, {
        gestorNome: string;
        gestorEmail: string;
        turno: string;
        rows: Array<{ Gpid: string; Colaborador: string; Área: string; Motivo: string; Turno: string; Data: string; Período: string }>;
      }>();

      for (const falta of faltas) {
        const c = colMap.get(falta.colaborador_id);
        if (!c || !c.gestor_id) continue;
        const g = gestoresById.get(c.gestor_id);
        if (!g) continue;
        const key = `${g.id}|${c.turno}`;
        if (!grupos.has(key)) {
          grupos.set(key, {
            gestorNome: g.nome,
            gestorEmail: g.email,
            turno: c.turno,
            rows: [],
          });
        }
        grupos.get(key)?.rows.push({
          Gpid: c.gpid,
          Colaborador: c.nome,
          Área: c.area,
          Motivo: falta.motivo,
          Turno: c.turno,
          Data: falta.data,
          Período: falta.periodo,
        });
      }

      const r = await enviar({ data: { inicio, fim, grupos: Array.from(grupos.values()) } });
      const erros = r.erros ?? [];
      if (!r.ok || erros.length) {
        toast.error(`${r.sent} enviado(s), ${erros.length} pendência(s). Verifique os emails dos gestores.`, {
          description: erros[0],
        });
        console.warn("Envio de faltas — pendências:", erros, r.detalhes);
        return;
      }
      if (r.previewMode) {
        const previewFiles = (r.detalhes ?? [])
          .map((item: any) => item.previewFile)
          .filter(Boolean);
        toast.success(`Preview gerado para ${r.sent} gestor(es)`, {
          description: previewFiles[0] ? `Arquivos salvos em: ${previewFiles[0]}` : ".mail-preview",
        });
      } else {
        toast.success(`${r.sent} email(s) enviado(s) para ${r.grupos ?? 0} gestor(es)`);
      }
      setOpen(false);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Mail className="h-4 w-4 mr-1" />Enviar para gestores
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar faltas por email</DialogTitle>
            <DialogDescription>Envia os relatórios de faltas para os emails cadastrados dos gestores.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div><Label>Início</Label><Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
            <div><Label>Fim</Label><Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} /></div>
          </div>
          <p className="text-xs text-muted-foreground">
            Envia um email por gestor + turno, com as faltas (motivo "Falta") no período.
            Inclui corpo HTML e anexo .xlsx.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={go} disabled={busy}>{busy ? "Enviando..." : "Enviar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Importa Férias a partir de .xlsx (colunas: periodo_aquisitivo, colaborador_id (nome/gpid), inicio, fim) */
export function ImportFeriasButton({ colabs, onDone }: { colabs: Colab[]; onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [errorRows, setErrorRows] = useState<string[]>([]);
  const [showErrorDialog, setShowErrorDialog] = useState(false);

  async function handle(file: File) {
    setBusy(true);
    try {
      const rows = await readXlsxRows(file);
      const inserts: any[] = []; const erros: string[] = [];
      for (const [i, r] of rows.entries()) {
        const inicio = toISODate(r.inicio ?? r.Início ?? r.Inicio ?? r["Data início"] ?? r["Data inicio"]);
        const fim = toISODate(r.fim ?? r.Fim ?? r["Data fim"]);
        const pa = String(
          r.periodo_aquisitivo
          ?? r["Período aquisitivo"]
          ?? r["Periodo aquisitivo"]
          ?? r["PERIODO AQUISITIVO"]
          ?? "",
        ).trim();
        const ref = String(
          r.colaborador_id
          ?? r.colaborador
          ?? r.Colaborador
          ?? r.gpid
          ?? r.GPID
          ?? r.Gpid
          ?? "",
        ).trim();
        if (!inicio || !fim || !pa) { erros.push(`Linha ${i + 2}: campos obrigatórios faltando (colaborador: "${ref || "não informado"}")`); continue; }
        const c = findColaborador(colabs, ref);
        if (!c) { erros.push(`Linha ${i + 2}: colaborador "${ref}" não encontrado`); continue; }
        inserts.push({
          colaborador_id: c.id, gestor_id: c.gestor_id ?? null,
          inicio, fim, periodo_aquisitivo: pa, status: "Pendente",
        });
      }
      const dedup = Array.from(new Map(inserts.map((r) => [`${r.colaborador_id}|${r.inicio}|${r.fim}|${r.periodo_aquisitivo}`, r])).values());
      const colabIds = Array.from(new Set(dedup.map((r) => r.colaborador_id)));
      const { data: existentes, error: readError } = colabIds.length
        ? await supabase
          .from("ferias")
          .select("id, colaborador_id, inicio, fim, periodo_aquisitivo")
          .in("colaborador_id", colabIds)
        : { data: [], error: null };
      if (readError) throw readError;

      const existingMap = new Map((existentes ?? []).map((f) => [`${f.colaborador_id}|${f.inicio}|${f.fim}|${f.periodo_aquisitivo}`, f.id]));
      let ok = 0;
      for (const batch of chunk(dedup, 200)) {
        const novos = batch.filter((r) => !existingMap.has(`${r.colaborador_id}|${r.inicio}|${r.fim}|${r.periodo_aquisitivo}`));
        const atualizaveis = batch.filter((r) => existingMap.has(`${r.colaborador_id}|${r.inicio}|${r.fim}|${r.periodo_aquisitivo}`));
        if (novos.length) {
          const { error } = await supabase.from("ferias").insert(novos);
          if (error) erros.push(error.message); else ok += novos.length;
        }
        for (const r of atualizaveis) {
          const id = existingMap.get(`${r.colaborador_id}|${r.inicio}|${r.fim}|${r.periodo_aquisitivo}`);
          if (!id) continue;
          const { error } = await supabase.from("ferias").update(r).eq("id", id);
          if (error) erros.push(error.message); else ok += 1;
        }
      }
      toast.success(`${ok} férias importadas/atualizadas. ${erros.length} erros.`);
      if (erros.length) {
        console.warn("Importação férias — erros:", erros);
        setErrorRows(erros);
        setShowErrorDialog(true);
      } else {
        setErrorRows([]);
        setShowErrorDialog(false);
      }
      onDone();
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }

  return (
    <>
      <input ref={ref} type="file" accept=".xlsx" hidden onChange={(e) => {
        const f = e.target.files?.[0]; if (f) handle(f); e.target.value = "";
      }} />
      <Dialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Erros na importação de férias</DialogTitle>
            <DialogDescription>
              Apenas os colaboradores com erro de importação foram listados abaixo. Revise cada item e tente novamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto rounded-md border border-secondary p-4 text-sm">
            {errorRows.length ? (
              errorRows.map((error, index) => (
                <div key={index} className="break-words">{error}</div>
              ))
            ) : (
              <div>Nenhum erro registrado.</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowErrorDialog(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => ref.current?.click()}>
        <Upload className="h-4 w-4 mr-1" />{busy ? "Importando..." : "Importar XLSX"}
      </Button>
    </>
  );
}

export function ExportFeriasButton({
  ferias,
  colabs,
  area,
  turno,
}: {
  ferias: Ferias[];
  colabs: Colab[];
  area: string;
  turno: string;
}) {
  const colMap = new Map(colabs.map((c) => [c.id, c]));

  function exportar() {
    const rows = ferias.map((f) => {
      const c = colMap.get(f.colaborador_id);
      return {
        Colaborador: c?.nome ?? "—",
        GPID: c?.gpid ?? "—",
        Área: c?.area ?? "—",
        Turno: c?.turno ?? "—",
        Início: formatDateBr(f.inicio),
        Fim: formatDateBr(f.fim),
        "Período aquisitivo": f.periodo_aquisitivo,
        Status: f.status,
      };
    });

    const suffixParts = [area !== "all" ? area : "", turno !== "all" ? turno : ""].filter(Boolean);
    const suffix = suffixParts.length ? `-${suffixParts.join("-").toLowerCase().replace(/\s+/g, "-")}` : "";
    downloadXlsx(rows, "Ferias", `ferias${suffix}.xlsx`);
    toast.success(`${rows.length} registro(s) exportado(s)`);
  }

  return (
    <Button variant="outline" size="sm" onClick={exportar} disabled={ferias.length === 0}>
      <Download className="h-4 w-4 mr-1" />Exportar XLSX
    </Button>
  );
}
