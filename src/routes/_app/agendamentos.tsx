import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SheetFooter } from "@/components/ui/sheet";
import { FormSheet, EditSheet } from "@/components/forms/FormSheet";
import { ColaboradorSelect } from "@/components/forms/ColaboradorSelect";
import { RowActions } from "@/components/RowActions";
import { ExportAgendamentosButton, ImportAgendamentosButton } from "@/components/AgendamentosXlsxButtons";
import { useColaboradores, useTable } from "@/hooks/useData";
import { supabase } from "@/integrations/custom-supabase/client";
import { sincronizarFaltasDoDia } from "@/lib/sync.functions";
import { formatLocalDateISO } from "@/lib/utils";
import { formatDateBr } from "@/lib/date";
import { DataPagination, usePagination } from "@/components/DataPagination";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/agendamentos")({ component: AgendamentosPage });

type AgRow = {
  id: string; colaborador_id: string; tipo: string; titulo: string;
  data: string; hora: string; prioridade: string; status: string; observacao: string | null;
};

function AgendamentosPage() {
  const { data: colabs } = useColaboradores();
  const { data: ags, reload } = useTable<AgRow>("agendamentos", "data", true);
  const colMap = useMemo(() => new Map(colabs.map((c) => [c.id, c])), [colabs]);
  const [editing, setEditing] = useState<AgRow | null>(null);
  const [q, setQ] = useState("");
  const [tipoFilter, setTipoFilter] = useState("all");
  const [prioridadeFilter, setPrioridadeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
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

  const filteredAgs = useMemo(() => {
    const term = q.trim().toLowerCase();
    return ags.filter((a) => {
      const c = colMap.get(a.colaborador_id);
      const matchesText = !term || [c?.nome, c?.gpid, c?.area, c?.turno, a.tipo, a.titulo, a.observacao]
        .join(" ")
        .toLowerCase()
        .includes(term);
      const matchesTipo = tipoFilter === "all" || a.tipo === tipoFilter;
      const matchesPrioridade = prioridadeFilter === "all" || a.prioridade === prioridadeFilter;
      const matchesStatus = statusFilter === "all" || a.status === statusFilter;
      const matchesArea = areaFilter === "all" || c?.area === areaFilter;
      const matchesTurno = turnoFilter === "all" || c?.turno === turnoFilter;
      return matchesText && matchesTipo && matchesPrioridade && matchesStatus && matchesArea && matchesTurno;
    });
  }, [ags, colMap, q, tipoFilter, prioridadeFilter, statusFilter, areaFilter, turnoFilter]);

  const { paged, page, setPage, pageSize, setPageSize, total, totalPages } = usePagination(filteredAgs, 10);

  return (
    <div className="space-y-6">
      <PageHeader title="Agendamentos" description="Compromissos e acompanhamentos"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ImportAgendamentosButton colabs={colabs as any} agendamentos={ags as any} onDone={reload} />
            <ExportAgendamentosButton agendamentos={filteredAgs as any} colabs={colabs as any} tipo={tipoFilter} />
            <FormSheet triggerLabel="Novo agendamento" title="Novo agendamento">
              {(close) => <AgendamentoForm colabs={colabs} onSaved={() => { reload(); close(); }} />}
            </FormSheet>
          </div>
        } />
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[260px] flex-1 space-y-2">
            <Label>Buscar</Label>
            <Input placeholder="Buscar por colaborador, GPID, título..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="w-[220px] space-y-2">
            <Label>Tipo</Label>
            <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value)}>
              <option value="all">Todos</option>
              {TIPOS.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
            </select>
          </div>
          <div className="w-[220px] space-y-2">
            <Label>Prioridade</Label>
            <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={prioridadeFilter} onChange={(e) => setPrioridadeFilter(e.target.value)}>
              <option value="all">Todas</option>
              {(["Baixa","Média","Alta"] as const).map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </select>
          </div>
          <div className="w-[220px] space-y-2">
            <Label>Status</Label>
            <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Todos</option>
              {(["Agendado","Realizado","Cancelado"] as const).map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
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
        <p className="mt-3 text-xs text-muted-foreground">A exportação XLSX respeita os filtros atuais da tela, inclusive o tipo de agendamento.</p>
      </Card>
      <div className="grid gap-3">
        {paged.map((a) => {
          const c = colMap.get(a.colaborador_id);
          return (
            <Card key={a.id}>
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <CalendarClock className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-medium">{a.titulo}</div>
                    <div className="text-xs text-muted-foreground">{c?.nome} · {c?.area}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <Badge variant="outline" className="text-[10px]">{a.tipo}</Badge>
                      <Badge variant={a.status === "Cancelado" ? "destructive" : a.status === "Realizado" ? "secondary" : "outline"} className="text-[10px]">{a.status}</Badge>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right text-sm">
                    <div className="font-mono">{formatDateBr(a.data)}</div>
                  </div>
                  <Badge variant={a.prioridade === "Alta" ? "destructive" : a.prioridade === "Média" ? "default" : "secondary"}>{a.prioridade}</Badge>
                  <RowActions table="agendamentos" id={a.id} label="agendamento" onChanged={reload} onEdit={() => setEditing(a)} />
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filteredAgs.length === 0 && <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhum agendamento encontrado.</CardContent></Card>}
      </div>
      <DataPagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} totalPages={totalPages} />

      <EditSheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title="Editar agendamento">
        {(close) => editing && (
          <AgendamentoForm colabs={colabs} initial={editing} onSaved={() => { reload(); setEditing(null); close(); }} />
        )}
      </EditSheet>
    </div>
  );
}

const TIPOS = ["De bem com a vida","Aniversário","Hora Extra"] as const;
const TITULO_PADRAO_AGENDAMENTO = "Agendamento";
const HORA_PADRAO_AGENDAMENTO = "09:00";
const HINTS: Record<typeof TIPOS[number], string> = {
  "De bem com a vida": "Limite de 3 agendamentos por colaborador.",
  "Aniversário": "Permitido apenas 1 agendamento por colaborador.",
  "Hora Extra": "Sem limite de agendamentos.",
};

async function criarAgendamentoManual({
  colaboradorId,
  tipo,
  data,
  prioridade,
  observacao,
}: {
  colaboradorId: string;
  tipo: (typeof TIPOS)[number];
  data: string;
  prioridade: "Baixa" | "Média" | "Alta";
  observacao: string;
}) {
  if (tipo === "De bem com a vida" || tipo === "Aniversário") {
    const limite = tipo === "De bem com a vida" ? 3 : 1;
    const { count, error: countError } = await supabase
      .from("agendamentos")
      .select("id", { count: "exact", head: true })
      .eq("colaborador_id", colaboradorId)
      .eq("tipo", tipo)
      .neq("status", "Cancelado");

    if (countError) throw new Error(countError.message);
    if ((count ?? 0) >= limite) {
      throw new Error(
        tipo === "De bem com a vida"
          ? "Limite de 3 agendamentos de De bem com a vida atingido para este colaborador."
          : "Aniversário já agendado/gozado para este colaborador.",
      );
    }
  }

  const { error } = await supabase.from("agendamentos").insert({
    colaborador_id: colaboradorId,
    tipo,
    titulo: TITULO_PADRAO_AGENDAMENTO,
    data,
    hora: HORA_PADRAO_AGENDAMENTO,
    prioridade,
    observacao: observacao.trim() || null,
  });

  if (error) throw new Error(error.message);
}

function AgendamentoForm({ colabs, onSaved, initial }: { colabs: any[]; onSaved: () => void; initial?: AgRow }) {
  const [colaboradorId, setColaboradorId] = useState(initial?.colaborador_id ?? "");
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]>((initial?.tipo as any) ?? "De bem com a vida");
  const [data, setData] = useState(initial?.data ?? "");
  const [prioridade, setPrioridade] = useState<"Baixa"|"Média"|"Alta">((initial?.prioridade as any) ?? "Média");
  const [obs, setObs] = useState(initial?.observacao ?? "");
  const [submitting, setSubmitting] = useState(false);
  const sincronizar = useServerFn(sincronizarFaltasDoDia);

  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      if (!colaboradorId || !data) { toast.error("Preencha os campos"); return; }

      const titulo = TITULO_PADRAO_AGENDAMENTO;
      const hora = HORA_PADRAO_AGENDAMENTO;
      setSubmitting(true);
      try {
        if (initial) {
          const { error } = await supabase.from("agendamentos").update({
            colaborador_id: colaboradorId, tipo: tipo as any, titulo, data, hora,
            prioridade: prioridade as any, observacao: obs,
          }).eq("id", initial.id);
          if (error) throw new Error(error.message);
          if (data === formatLocalDateISO() || initial.data === formatLocalDateISO()) {
            await sincronizar();
          }
          toast.success("Agendamento atualizado");
        } else {
          await criarAgendamentoManual({
            colaboradorId,
            tipo,
            data,
            prioridade,
            observacao: obs,
          });

          if (data === formatLocalDateISO()) {
            try {
              await sincronizar();
            } catch (syncError) {
              console.warn("Falha ao sincronizar faltas após criar agendamento", syncError);
            }
          }

          toast.success("Agendamento criado");
        }
        onSaved();
      } catch (err) { toast.error((err as Error).message); }
      setSubmitting(false);
    }}>
      <ColaboradorSelect value={colaboradorId} onChange={setColaboradorId} colaboradores={colabs} />
      <div className="space-y-2"><Label>Tipo de agendamento</Label>
        <Select value={tipo} onValueChange={(v) => setTipo(v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{HINTS[tipo]}</p>
      </div>
      <div className="space-y-2"><Label>Data</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} required /></div>
      <div className="space-y-2">
        <Label>Título</Label>
        <Input value={TITULO_PADRAO_AGENDAMENTO} disabled readOnly />
      </div>
      <div className="space-y-2"><Label>Prioridade</Label>
        <Select value={prioridade} onValueChange={(v) => setPrioridade(v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{["Baixa","Média","Alta"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-2"><Label>Observação</Label><Textarea value={obs ?? ""} onChange={(e) => setObs(e.target.value)} /></div>
      <SheetFooter className="mt-6">
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Salvando..." : initial ? "Salvar alterações" : "Criar agendamento"}
        </Button>
      </SheetFooter>
    </form>
  );
}
