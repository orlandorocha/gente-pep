import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SheetFooter } from "@/components/ui/sheet";
import { FormSheet, EditSheet } from "@/components/forms/FormSheet";
import { ColaboradorSelect } from "@/components/forms/ColaboradorSelect";
import { RowActions } from "@/components/RowActions";
import { useColaboradores, useTable } from "@/hooks/useData";
import { supabase } from "@/integrations/custom-supabase/client";
import { MOTIVOS } from "@/data/motivos";
import { toast } from "sonner";
import { ImportFaltasButton, ExportFaltasButton, EmailGestoresButton } from "@/components/XlsxButtons";
import { DataPagination, usePagination } from "@/components/DataPagination";
import { formatDateBr } from "@/lib/date";

export const Route = createFileRoute("/_app/faltas")({ component: FaltasPage });

type FaltaRow = { id: string; colaborador_id: string; data: string; motivo: string; periodo: string; observacao: string | null };

function getOrigemInfo(observacao: string | null) {
  if (!observacao?.startsWith("Registrado automaticamente")) {
    return { label: "Manual", detail: observacao || "Lançamento manual" };
  }

  if (observacao.includes("Em gozo")) {
    return { label: "Automático", detail: "Férias" };
  }

  if (observacao.includes("Licença")) {
    return { label: "Automático", detail: "Licença" };
  }

  if (observacao.includes("Agendamento")) {
    return { label: "Automático", detail: "Agendamento" };
  }

  return { label: "Automático", detail: "Rotina diária" };
}

function FaltasPage() {
  const { data: colabs } = useColaboradores();
  const { data: faltas, reload } = useTable<FaltaRow>("faltas", "data", false);
  const colMap = useMemo(() => new Map(colabs.map((c) => [c.id, c])), [colabs]);
  const [editing, setEditing] = useState<FaltaRow | null>(null);
  const [q, setQ] = useState("");
  const [areaFilter, setAreaFilter] = useState("all");
  const [turnoFilter, setTurnoFilter] = useState("all");

  const areasDisponiveis = useMemo(
    () => Array.from(new Set(colabs.map((c) => c.area).filter(Boolean))).sort(),
    [colabs],
  );
  const turnosDisponiveis = useMemo(
    () => Array.from(new Set(colabs.map((c) => c.turno).filter(Boolean))).sort(),
    [colabs],
  );

  const filteredFaltas = useMemo(() => {
    const term = q.trim().toLowerCase();
    return faltas.filter((f) => {
      const c = colMap.get(f.colaborador_id);
      const matchesText = !term || [
        f.data,
        c?.nome,
        c?.gpid,
        c?.area,
        c?.turno,
        f.motivo,
        f.periodo,
        f.observacao,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
      const matchesArea = areaFilter === "all" || c?.area === areaFilter;
      const matchesTurno = turnoFilter === "all" || c?.turno === turnoFilter;
      return matchesText && matchesArea && matchesTurno;
    });
  }, [faltas, colMap, q, areaFilter, turnoFilter]);

  const { paged, page, setPage, pageSize, setPageSize, total, totalPages } = usePagination(filteredFaltas, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Faltas e absenteísmo"
        description={`${faltas.length} ocorrências registradas`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ImportFaltasButton colabs={colabs as any} onDone={reload} />
            <ExportFaltasButton faltas={filteredFaltas as any} colabs={colabs as any} />
            <EmailGestoresButton />
            <FormSheet triggerLabel="Registrar ausência" title="Registrar ausência">
              {(close) => <FaltaForm colabs={colabs} onSaved={() => { reload(); close(); }} />}
            </FormSheet>
          </div>
        }
      />
      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[260px] flex-1 space-y-2">
            <Label>Buscar</Label>
            <Input
              placeholder="Buscar por colaborador, GPID, área, motivo..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="w-[220px] space-y-2">
            <Label>Área</Label>
            <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
              <option value="all">Todas</option>
              {areasDisponiveis.map((area) => <option key={area} value={area}>{area}</option>)}
            </select>
          </div>
          <div className="w-[220px] space-y-2">
            <Label>Turno</Label>
            <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={turnoFilter} onChange={(e) => setTurnoFilter(e.target.value)}>
              <option value="all">Todos</option>
              {turnosDisponiveis.map((turno) => <option key={turno} value={turno}>{turno}</option>)}
            </select>
          </div>
        </div>
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead><TableHead>Colaborador</TableHead>
                <TableHead>Área</TableHead><TableHead>Motivo</TableHead><TableHead>Origem</TableHead><TableHead>Período</TableHead>
                <TableHead className="w-[100px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((f) => {
                const c = colMap.get(f.colaborador_id);
                const origem = getOrigemInfo(f.observacao);
                return (
                  <TableRow key={f.id}>
                    <TableCell className="font-mono text-xs">{formatDateBr(f.data)}</TableCell>
                    <TableCell><div className="font-medium">{c?.nome}</div><div className="text-xs text-muted-foreground">{c?.gpid}</div></TableCell>
                    <TableCell>{c?.area}</TableCell>
                    <TableCell><Badge variant={f.motivo === "Falta" ? "destructive" : "secondary"}>{f.motivo}</Badge></TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge variant={origem.label === "Automático" ? "outline" : "secondary"}>{origem.label}</Badge>
                        <div className="text-xs text-muted-foreground">{origem.detail}</div>
                      </div>
                    </TableCell>
                    <TableCell>{f.periodo}</TableCell>
                    <TableCell><RowActions table="faltas" id={f.id} label="ausência" onChanged={reload} onEdit={() => setEditing(f)} /></TableCell>
                  </TableRow>
                );
              })}
              {filteredFaltas.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Nenhuma ausência encontrada.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        <DataPagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} totalPages={totalPages} />
      </Card>

      <EditSheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title="Editar ausência">
        {(close) => editing && (
          <FaltaForm colabs={colabs} initial={editing} onSaved={() => { reload(); setEditing(null); close(); }} />
        )}
      </EditSheet>
    </div>
  );
}

function FaltaForm({ colabs, onSaved, initial }: { colabs: any[]; onSaved: () => void; initial?: FaltaRow }) {
  const [colaboradorId, setColaboradorId] = useState(initial?.colaborador_id ?? "");
  const [data, setData] = useState(initial?.data ?? new Date().toISOString().slice(0, 10));
  const [motivo, setMotivo] = useState(initial?.motivo ?? MOTIVOS[0].descricao);
  const [periodo, setPeriodo] = useState(initial?.periodo ?? "Integral");
  const [observacao, setObs] = useState(initial?.observacao ?? "");
  const [submitting, setSubmitting] = useState(false);
  const periodos = ["Integral", "Manhã", "Tarde", "Noite"];

  function handleColaboradorChange(id: string) {
    setColaboradorId(id);
    const turno = colabs.find((c) => c.id === id)?.turno;
    if (turno && periodos.includes(turno)) setPeriodo(turno);
  }

  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      if (!colaboradorId) { toast.error("Selecione o colaborador"); return; }
      setSubmitting(true);
      const payload = { colaborador_id: colaboradorId, data, motivo: motivo as any, periodo: periodo as any, observacao };
      const { error } = initial
        ? await supabase.from("faltas").update(payload).eq("id", initial.id)
        : await supabase.from("faltas").insert(payload);
      setSubmitting(false);
      if (error) { toast.error(error.message); return; }
      toast.success(initial ? "Ausência atualizada" : "Ausência registrada");
      onSaved();
    }}>
      <ColaboradorSelect value={colaboradorId} onChange={handleColaboradorChange} colaboradores={colabs} />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label>Data</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} required /></div>
        <div className="space-y-2"><Label>Período</Label>
          <Select value={periodo} onValueChange={setPeriodo}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{periodos.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2"><Label>Motivo</Label>
        <Select value={motivo} onValueChange={setMotivo}><SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-72">
            {MOTIVOS.map((m) => <SelectItem key={m.id} value={m.descricao}>{m.descricao}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2"><Label>Observação</Label><Textarea value={observacao ?? ""} onChange={(e) => setObs(e.target.value)} /></div>
      <SheetFooter className="mt-6">
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Salvando..." : initial ? "Salvar alterações" : "Registrar"}
        </Button>
      </SheetFooter>
    </form>
  );
}
