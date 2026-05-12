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
import { DataPagination, usePagination } from "@/components/DataPagination";
import { formatDateRangeBr } from "@/lib/date";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/licencas")({ component: LicencasPage });

type LicencaRow = { id: string; colaborador_id: string; tipo: string; inicio: string; fim: string; status: string; observacoes: string | null };
const TIPOS = ["Maternidade","Paternidade","Saúde","Sem vencimentos","Estudo"];

function LicencasPage() {
  const { data: colabs } = useColaboradores();
  const { data: licencas, reload } = useTable<LicencaRow>("licencas", "inicio", false);
  const colMap = useMemo(() => new Map(colabs.map((c) => [c.id, c])), [colabs]);
  const [editing, setEditing] = useState<LicencaRow | null>(null);
  const [q, setQ] = useState("");
  const [tipoFilter, setTipoFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredLicencas = useMemo(() => {
    const term = q.trim().toLowerCase();
    return licencas.filter((l) => {
      const c = colMap.get(l.colaborador_id);
      const matchesText = !term || [c?.nome, c?.gpid, c?.area, l.tipo, l.observacoes]
        .join(" ")
        .toLowerCase()
        .includes(term);
      const matchesTipo = tipoFilter === "all" || l.tipo === tipoFilter;
      const matchesStatus = statusFilter === "all" || l.status === statusFilter;
      return matchesText && matchesTipo && matchesStatus;
    });
  }, [licencas, colMap, q, tipoFilter, statusFilter]);

  const { paged, page, setPage, pageSize, setPageSize, total, totalPages } = usePagination(filteredLicencas, 10);

  return (
    <div className="space-y-6">
      <PageHeader title="Licenças" description="Afastamentos por tipo e período"
        actions={<FormSheet triggerLabel="Nova licença" title="Nova licença">
          {(close) => <LicencaForm colabs={colabs} onSaved={() => { reload(); close(); }} />}
        </FormSheet>} />
      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[260px] flex-1 space-y-2">
            <Label>Buscar</Label>
            <Input placeholder="Buscar por colaborador, GPID, tipo..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="w-[220px] space-y-2">
            <Label>Tipo</Label>
            <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value)}>
              <option value="all">Todos</option>
              {TIPOS.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
            </select>
          </div>
          <div className="w-[220px] space-y-2">
            <Label>Status</Label>
            <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Todos</option>
              {(["Ativa","Encerrada","Cancelada"] as const).map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
        </div>
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Colaborador</TableHead><TableHead>Tipo</TableHead>
              <TableHead>Período</TableHead><TableHead>Status</TableHead><TableHead>Observações</TableHead>
              <TableHead className="w-[100px] text-right">Ações</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {paged.map((l) => {
                const c = colMap.get(l.colaborador_id);
                return (
                  <TableRow key={l.id}>
                    <TableCell><div className="font-medium">{c?.nome}</div><div className="text-xs text-muted-foreground">{c?.area}</div></TableCell>
                    <TableCell><Badge variant="secondary">{l.tipo}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{formatDateRangeBr(l.inicio, l.fim)}</TableCell>
                    <TableCell><Badge variant={l.status === "Ativa" ? "default" : "outline"}>{l.status}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{l.observacoes ?? "—"}</TableCell>
                    <TableCell><RowActions table="licencas" id={l.id} label="licença" onChanged={reload} onEdit={() => setEditing(l)} /></TableCell>
                  </TableRow>
                );
              })}
              {filteredLicencas.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Nenhuma licença encontrada.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        <DataPagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} totalPages={totalPages} />
      </Card>

      <EditSheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title="Editar licença">
        {(close) => editing && (
          <LicencaForm colabs={colabs} initial={editing} onSaved={() => { reload(); setEditing(null); close(); }} />
        )}
      </EditSheet>
    </div>
  );
}

function LicencaForm({ colabs, onSaved, initial }: { colabs: any[]; onSaved: () => void; initial?: LicencaRow }) {
  const [colaboradorId, setColaboradorId] = useState(initial?.colaborador_id ?? "");
  const [tipo, setTipo] = useState(initial?.tipo ?? "Saúde");
  const [inicio, setInicio] = useState(initial?.inicio ?? "");
  const [fim, setFim] = useState(initial?.fim ?? "");
  const [status, setStatus] = useState(initial?.status ?? "Ativa");
  const [obs, setObs] = useState(initial?.observacoes ?? "");
  const [submitting, setSubmitting] = useState(false);

  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      if (!colaboradorId || !inicio || !fim) { toast.error("Preencha os campos"); return; }
      setSubmitting(true);
      const payload = { colaborador_id: colaboradorId, tipo: tipo as any, inicio, fim, observacoes: obs, status: status as any };
      const { error } = initial
        ? await supabase.from("licencas").update(payload).eq("id", initial.id)
        : await supabase.from("licencas").insert(payload);
      setSubmitting(false);
      if (error) { toast.error(error.message); return; }
      toast.success(initial ? "Licença atualizada" : "Licença registrada");
      onSaved();
    }}>
      <ColaboradorSelect value={colaboradorId} onChange={setColaboradorId} colaboradores={colabs} />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label>Tipo</Label>
          <Select value={tipo} onValueChange={setTipo}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TIPOS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><Label>Status</Label>
          <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["Ativa","Encerrada","Cancelada"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label>Início</Label><Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} required /></div>
        <div className="space-y-2"><Label>Fim</Label><Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} required /></div>
      </div>
      <div className="space-y-2"><Label>Observações</Label><Textarea value={obs ?? ""} onChange={(e) => setObs(e.target.value)} /></div>
      <SheetFooter className="mt-6">
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Salvando..." : initial ? "Salvar alterações" : "Registrar licença"}
        </Button>
      </SheetFooter>
    </form>
  );
}
