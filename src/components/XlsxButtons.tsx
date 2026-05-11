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

type Colab = { id: string; nome: string; gpid: string; area: string; turno: string; gestor_id?: string | null };
type Falta = { id: string; colaborador_id: string; data: string; motivo: string; periodo: string };
type Ferias = { id: string; colaborador_id: string; inicio: string; fim: string; periodo_aquisitivo: string; status: string };

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Importa Faltas a partir de .xlsx (colunas: data, colaborador_id (nome ou GPID), motivo, periodo, observacao) */
export function ImportFaltasButton({ colabs, onDone }: { colabs: Colab[]; onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handle(file: File) {
    setBusy(true);
    try {
      const rows = await readXlsxRows(file);
      const inserts: any[] = []; const erros: string[] = [];
      for (const [i, r] of rows.entries()) {
        const data = toISODate(r.data ?? r.Data);
        const ref = String(r.colaborador_id ?? r.colaborador ?? r.Colaborador ?? "").trim();
        const motivo = String(r.motivo ?? r.Motivo ?? "Falta").trim();
        const observacao = String(r.observacao ?? r.Observação ?? "").trim();
        if (!data) { erros.push(`Linha ${i + 2}: data inválida`); continue; }
        const c = findColaborador(colabs, ref);
        if (!c) { erros.push(`Linha ${i + 2}: colaborador "${ref}" não encontrado`); continue; }
        const periodo = String(r.periodo ?? r.Período ?? c.turno ?? "Integral").trim();
        inserts.push({ colaborador_id: c.id, data, motivo, periodo, observacao });
      }
      const dedup = Array.from(new Map(inserts.map((r) => [`${r.colaborador_id}|${r.data}|${r.motivo}`, r])).values());
      let ok = 0;
      for (const batch of chunk(dedup, 500)) {
        const { error } = await supabase
          .from("faltas")
          .upsert(batch, { onConflict: "colaborador_id,data,motivo", ignoreDuplicates: false });
        if (error) { erros.push(error.message); continue; }
        ok += batch.length;
      }
      toast.success(`${ok} faltas importadas/atualizadas. ${erros.length} erros.`);
      if (erros.length) console.warn("Importação faltas — erros:", erros);
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

/** Exporta Faltas filtradas para .xlsx */
export function ExportFaltasButton({ faltas, colabs }: { faltas: Falta[]; colabs: Colab[] }) {
  const colMap = new Map(colabs.map(c => [c.id, c]));
  function exportar() {
    const rows = faltas.map(f => {
      const c = colMap.get(f.colaborador_id);
      return {
        Colaborador: c?.nome ?? "—",
        Área: c?.area ?? "—",
        Motivo: f.motivo,
        Turno: c?.turno ?? "—",
        Data: f.data,
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
        .select("id, nome, area, turno, gestor_id")
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
        rows: Array<{ Colaborador: string; Área: string; Motivo: string; Turno: string; Data: string; Período: string }>;
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

  async function handle(file: File) {
    setBusy(true);
    try {
      const rows = await readXlsxRows(file);
      const inserts: any[] = []; const erros: string[] = [];
      for (const [i, r] of rows.entries()) {
        const inicio = toISODate(r.inicio ?? r.Início);
        const fim = toISODate(r.fim ?? r.Fim);
        const pa = String(r.periodo_aquisitivo ?? r["Período aquisitivo"] ?? "").trim();
        const ref = String(r.colaborador_id ?? r.colaborador ?? r.Colaborador ?? "").trim();
        if (!inicio || !fim || !pa) { erros.push(`Linha ${i + 2}: campos obrigatórios faltando`); continue; }
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
      if (erros.length) console.warn("Importação férias — erros:", erros);
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
        Início: f.inicio,
        Fim: f.fim,
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
