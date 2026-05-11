import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SheetFooter } from "@/components/ui/sheet";
import { FormSheet, FormFooter, EditSheet } from "@/components/forms/FormSheet";
import { ColaboradorSelect } from "@/components/forms/ColaboradorSelect";
import { RowActions } from "@/components/RowActions";
import { useColaboradores, useTable } from "@/hooks/useData";
import { supabase } from "@/integrations/custom-supabase/client";
import { solicitarFerias } from "@/lib/ferias.functions";
import { toast } from "sonner";
import { Check, X, CalendarRange } from "lucide-react";
import { ExportFeriasButton, ImportFeriasButton } from "@/components/XlsxButtons";
import { DataPagination, usePagination } from "@/components/DataPagination";

export const Route = createFileRoute("/_app/ferias")({ component: FeriasPage });

type FeriasRow = {
  id: string; colaborador_id: string; inicio: string; fim: string;
  gestor_id?: string | null;
  periodo_aquisitivo: string;
  status: "Pendente" | "Aprovada" | "Recusada" | "Em gozo" | "Concluída";
};

// ---------- Helpers de data ----------
const todayISO = () => new Date().toISOString().slice(0, 10);

function parseISO(d: string) { return new Date(d + "T12:00:00"); }
function toISO(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addYears(d: Date, n: number) { const x = new Date(d); x.setFullYear(x.getFullYear() + n); return x; }
function diffDays(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}
/** Empurra a data para frente até cair em dia útil (seg–sex). */
function shiftToWeekday(d: Date) {
  const x = new Date(d);
  while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() + 1);
  return x;
}
function bumpAquisitivo(pa: string) {
  const m = pa.match(/^(\d{4})\/(\d{4})$/);
  if (!m) return pa;
  return `${Number(m[1]) + 1}/${Number(m[2]) + 1}`;
}

function FeriasPage() {
  const { data: colabs } = useColaboradores();
  const { data: ferias, reload } = useTable<FeriasRow>("ferias", "inicio", true);
  const colMap = useMemo(() => new Map(colabs.map((c) => [c.id, c])), [colabs]);
  const reagendouRef = useRef(false);
  const [editing, setEditing] = useState<FeriasRow | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [turnoFilter, setTurnoFilter] = useState("all");
  const [grupoEmGozoAberto, setGrupoEmGozoAberto] = useState<string | null>(null);

  // Auto-reagendamento ao detectar férias encerradas
  useEffect(() => {
    if (reagendouRef.current || ferias.length === 0) return;
    const hoje = todayISO();
    const encerradas = ferias.filter(
      (v) => (v.status === "Aprovada" || v.status === "Em gozo") && v.fim < hoje,
    );
    if (encerradas.length === 0) return;
    reagendouRef.current = true;
    (async () => {
      for (const v of encerradas) {
        const dur = diffDays(parseISO(v.fim), parseISO(v.inicio));
        const novoInicio = shiftToWeekday(addYears(parseISO(v.inicio), 1));
        const novoFim = addDays(novoInicio, dur);
        const novoPeriodoAquisitivo = bumpAquisitivo(v.periodo_aquisitivo);

        const { data: existente } = await supabase
          .from("ferias")
          .select("id")
          .eq("colaborador_id", v.colaborador_id)
          .eq("inicio", toISO(novoInicio))
          .eq("fim", toISO(novoFim))
          .eq("periodo_aquisitivo", novoPeriodoAquisitivo)
          .maybeSingle();

        await supabase.from("ferias").update({ status: "Concluída" }).eq("id", v.id);
        if (!existente) {
          await supabase.from("ferias").insert({
            colaborador_id: v.colaborador_id,
            gestor_id: v.gestor_id ?? null,
            inicio: toISO(novoInicio),
            fim: toISO(novoFim),
            periodo_aquisitivo: novoPeriodoAquisitivo,
            status: "Pendente",
          });
        }
      }
      toast.success(`${encerradas.length} férias reagendadas para o próximo ano`);
      reload();
    })();
  }, [ferias, reload]);

  // Promove "Aprovada" → "Em gozo" quando entra no período
  useEffect(() => {
    const hoje = todayISO();
    const emCurso = ferias.filter(
      (v) => v.status === "Aprovada" && v.inicio <= hoje && hoje <= v.fim,
    );
    if (emCurso.length === 0) return;
    (async () => {
      for (const v of emCurso) {
        await supabase.from("ferias").update({ status: "Em gozo" }).eq("id", v.id);
      }
      reload();
    })();
  }, [ferias, reload]);

  const emGozo = useMemo(() => {
    const hoje = todayISO();
    return ferias.filter(
      (v) => (v.status === "Em gozo" || v.status === "Aprovada") &&
             v.inicio <= hoje && hoje <= v.fim,
    );
  }, [ferias]);

  const gruposEmGozo = useMemo(() => {
    const grupos = new Map<string, {
      key: string;
      area: string;
      turno: string;
      items: Array<{ ferias: FeriasRow; colaborador: NonNullable<ReturnType<typeof colMap.get>> }>;
    }>();

    for (const item of emGozo) {
      const colaborador = colMap.get(item.colaborador_id);
      if (!colaborador) continue;
      const area = colaborador.area || "Sem área";
      const turno = colaborador.turno || "Sem turno";
      const key = `${area}|${turno}`;
      if (!grupos.has(key)) {
        grupos.set(key, { key, area, turno, items: [] });
      }
      grupos.get(key)?.items.push({ ferias: item, colaborador });
    }

    return Array.from(grupos.values()).sort((a, b) => {
      if (a.area === b.area) return a.turno.localeCompare(b.turno);
      return a.area.localeCompare(b.area);
    });
  }, [emGozo, colMap]);

  const grupoEmGozoSelecionado = useMemo(
    () => gruposEmGozo.find((grupo) => grupo.key === grupoEmGozoAberto) ?? null,
    [gruposEmGozo, grupoEmGozoAberto],
  );

  const filteredFerias = useMemo(() => {
    const term = q.trim().toLowerCase();
    return ferias.filter((v) => {
      const c = colMap.get(v.colaborador_id);
      const matchesText = !term || [c?.nome, c?.gpid, c?.area, v.periodo_aquisitivo, v.inicio, v.fim]
        .join(" ")
        .toLowerCase()
        .includes(term);
      const matchesStatus = statusFilter === "all" || v.status === statusFilter;
      const matchesArea = areaFilter === "all" || c?.area === areaFilter;
      const matchesTurno = turnoFilter === "all" || c?.turno === turnoFilter;
      return matchesText && matchesStatus && matchesArea && matchesTurno;
    });
  }, [ferias, colMap, q, statusFilter, areaFilter, turnoFilter]);

  const areasDisponiveis = useMemo(
    () => Array.from(new Set(colabs.map((c) => c.area).filter(Boolean))).sort(),
    [colabs],
  );
  const turnosDisponiveis = useMemo(
    () => Array.from(new Set(colabs.map((c) => c.turno).filter(Boolean))).sort(),
    [colabs],
  );

  const { paged, page, setPage, pageSize, setPageSize, total, totalPages } = usePagination(filteredFerias, 10);

  async function decidir(id: string, acao: "aprovar" | "recusar") {
    try {
      const novo = acao === "aprovar" ? "Aprovada" : "Recusada";
      const { error } = await supabase
        .from("ferias")
        .update({
          status: novo,
          decidido_em: new Date().toISOString(),
          decidido_por: "in-app",
          motivo_recusa: null,
        })
        .eq("id", id)
        .eq("status", "Pendente");
      if (error) throw error;
      toast.success(acao === "aprovar" ? "Férias aprovadas" : "Férias recusadas");
      reload();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Férias" description="Planejamento, aprovação e gozo"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ImportFeriasButton colabs={colabs as any} onDone={reload} />
            <ExportFeriasButton ferias={filteredFerias as any} colabs={colabs as any} area={areaFilter} turno={turnoFilter} />
            <FormSheet triggerLabel="Solicitar férias" title="Solicitar férias">
              {(close) => <FeriasForm colabs={colabs} onSaved={() => { reload(); close(); }} />}
            </FormSheet>
          </div>
        } />

      {emGozo.length > 0 && (
        <Card className="p-4">
          <div className="mb-4 flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Colaboradores em férias</h3>
            <Badge variant="secondary" className="ml-auto">{emGozo.length}</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {gruposEmGozo.map((grupo) => (
              <Button
                key={grupo.key}
                variant="outline"
                className="h-auto items-start justify-between gap-3 px-4 py-3 text-left"
                onClick={() => setGrupoEmGozoAberto(grupo.key)}
              >
                <div>
                  <div className="font-medium">{grupo.area}</div>
                  <div className="text-xs text-muted-foreground">{grupo.turno}</div>
                </div>
                <Badge variant="secondary">{grupo.items.length}</Badge>
              </Button>
            ))}
          </div>
        </Card>
      )}

      <Dialog open={!!grupoEmGozoSelecionado} onOpenChange={(open) => !open && setGrupoEmGozoAberto(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Colaboradores em férias</DialogTitle>
            <DialogDescription>
              {grupoEmGozoSelecionado ? `${grupoEmGozoSelecionado.area} · ${grupoEmGozoSelecionado.turno}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            {grupoEmGozoSelecionado?.items.map(({ ferias: v, colaborador: c }) => {
              const ini = parseISO(v.inicio);
              const fim = parseISO(v.fim);
              const today = parseISO(todayISO());
              const total = Math.max(1, diffDays(fim, ini) + 1);
              const passados = Math.min(total, Math.max(0, diffDays(today, ini) + 1));
              const restantes = Math.max(0, diffDays(fim, today));
              const pct = Math.round((passados / total) * 100);
              return (
                <div key={v.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <div className="font-medium">{c.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.area} · {c.turno} · GPID {c.gpid}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {restantes === 0 ? "Encerra hoje" : `${restantes} dia${restantes > 1 ? "s" : ""} restante${restantes > 1 ? "s" : ""}`}
                    </div>
                  </div>
                  <div className="mt-3 space-y-1">
                    <Progress value={pct} className="h-2" />
                    <div className="flex justify-between text-[11px] font-mono text-muted-foreground">
                      <span>{v.inicio}</span>
                      <span>Dia {passados} de {total} · {pct}%</span>
                      <span>{v.fim}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[260px] flex-1 space-y-2">
            <Label>Buscar</Label>
            <Input placeholder="Buscar por colaborador, GPID, área..." value={q} onChange={(e) => setQ(e.target.value)} />
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
          <div className="w-[220px] space-y-2">
            <Label>Status</Label>
            <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Todos</option>
              {(["Pendente","Aprovada","Recusada","Em gozo","Concluída"] as const).map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
        </div>
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Colaborador</TableHead><TableHead>Período</TableHead>
              <TableHead>Aquisitivo</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {paged.map((v) => {
                const c = colMap.get(v.colaborador_id);
                return (
                  <TableRow key={v.id}>
                    <TableCell><div className="font-medium">{c?.nome}</div><div className="text-xs text-muted-foreground">{c?.area}</div></TableCell>
                    <TableCell className="font-mono text-xs">{v.inicio} → {v.fim}</TableCell>
                    <TableCell>{v.periodo_aquisitivo}</TableCell>
                    <TableCell>
                      <Badge variant={v.status === "Em gozo" ? "default" : v.status === "Aprovada" ? "secondary" : v.status === "Recusada" ? "destructive" : "outline"}>{v.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {v.status === "Pendente" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => decidir(v.id, "aprovar")}><Check className="h-3.5 w-3.5 mr-1" />Aprovar</Button>
                            <Button size="sm" variant="outline" onClick={() => decidir(v.id, "recusar")}><X className="h-3.5 w-3.5 mr-1" />Recusar</Button>
                          </>
                        )}
                        <RowActions table="ferias" id={v.id} label="solicitação de férias" onChanged={reload} onEdit={() => setEditing(v)} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredFerias.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Nenhuma solicitação encontrada.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        <DataPagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} totalPages={totalPages} />
      </Card>

      <EditSheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title="Editar férias">
        {(close) => editing && (
          <FeriasEditForm initial={editing} onSaved={() => { reload(); setEditing(null); close(); }} />
        )}
      </EditSheet>
    </div>
  );
}

function FeriasEditForm({ initial, onSaved }: { initial: FeriasRow; onSaved: () => void }) {
  const [inicio, setInicio] = useState(initial.inicio);
  const [fim, setFim] = useState(initial.fim);
  const [pa, setPa] = useState(initial.periodo_aquisitivo);
  const [status, setStatus] = useState<FeriasRow["status"]>(initial.status);
  const [submitting, setSubmitting] = useState(false);
  const totalDias = useMemo(() => {
    if (!inicio || !fim || fim < inicio) return null;
    return diffDays(parseISO(fim), parseISO(inicio)) + 1;
  }, [inicio, fim]);

  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      if (fim < inicio) { toast.error("Fim deve ser após o início"); return; }
      const dia = parseISO(inicio).getDay();
      if (dia === 0 || dia === 6) { toast.error("Início não pode cair em sábado ou domingo"); return; }
      setSubmitting(true);
      const { error } = await supabase.from("ferias").update({
        inicio, fim, periodo_aquisitivo: pa, status: status as any,
      }).eq("id", initial.id);
      setSubmitting(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Férias atualizadas");
      onSaved();
    }}>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label>Início</Label><Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} required /></div>
        <div className="space-y-2"><Label>Fim</Label><Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} required /></div>
      </div>
      {totalDias !== null && (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Total de dias: <span className="font-medium text-foreground">{totalDias}</span>
        </div>
      )}
      <div className="space-y-2"><Label>Período aquisitivo</Label><Input value={pa} onChange={(e) => setPa(e.target.value)} required /></div>
      <div className="space-y-2"><Label>Status</Label>
        <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as any)}>
          {(["Pendente","Aprovada","Recusada","Em gozo","Concluída"] as const).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <SheetFooter className="mt-6">
        <Button type="submit" className="w-full" disabled={submitting}>{submitting ? "Salvando..." : "Salvar alterações"}</Button>
      </SheetFooter>
    </form>
  );
}

function FeriasForm({ colabs, onSaved }: { colabs: any[]; onSaved: () => void }) {
  const [colaboradorId, setColaboradorId] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [periodoAquisitivo, setPa] = useState("2025/2026");
  const [submitting, setSubmitting] = useState(false);
  const solicitar = useServerFn(solicitarFerias);
  const totalDias = useMemo(() => {
    if (!inicio || !fim || fim < inicio) return null;
    return diffDays(parseISO(fim), parseISO(inicio)) + 1;
  }, [inicio, fim]);

  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      if (!colaboradorId || !inicio || !fim) { toast.error("Preencha todos os campos"); return; }
      if (fim < inicio) { toast.error("Fim deve ser após o início"); return; }
      const dia = parseISO(inicio).getDay();
      if (dia === 0 || dia === 6) {
        toast.error("O início das férias não pode cair em sábado ou domingo");
        return;
      }
      setSubmitting(true);
      try {
        const r = await solicitar({ data: { colaboradorId, inicio, fim, periodoAquisitivo } });
        const okEmail = r.notify?.email?.ok;
        const okTeams = r.notify?.teams?.ok;
        const canais = [okEmail && "email", okTeams && "Teams"].filter(Boolean).join(" + ");
        toast.success(canais ? `Solicitação enviada ao gestor (${canais})` : "Solicitação criada — gestor será notificado quando os canais estiverem configurados");
        onSaved();
      } catch (err) { toast.error((err as Error).message); }
      setSubmitting(false);
    }}>
      <ColaboradorSelect value={colaboradorId} onChange={setColaboradorId} colaboradores={colabs} />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label>Início</Label><Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} required /></div>
        <div className="space-y-2"><Label>Fim</Label><Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} required /></div>
      </div>
      {totalDias !== null && (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Total de dias: <span className="font-medium text-foreground">{totalDias}</span>
        </div>
      )}
      <div className="space-y-2"><Label>Período aquisitivo</Label><Input value={periodoAquisitivo} onChange={(e) => setPa(e.target.value)} required /></div>
      <p className="text-xs text-muted-foreground">A solicitação será enviada ao gestor para <b>aprovação</b> por email e Microsoft Teams. O início não pode cair em fim de semana.</p>
      <FormFooter submitting={submitting} label="Enviar solicitação" />
    </form>
  );
}
