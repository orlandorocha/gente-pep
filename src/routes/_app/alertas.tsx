import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, BellRing, CalendarX, ClipboardList, Plane } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useColaboradores, useTable } from "@/hooks/useData";
import { DataPagination, usePagination } from "@/components/DataPagination";
import { formatDateBr } from "@/lib/date";

export const Route = createFileRoute("/_app/alertas")({ component: AlertasPage });

type FaltaR = { id: string; colaborador_id: string; data: string; motivo: string };
type FeriasR = { id: string; colaborador_id: string; inicio: string; fim: string; status: string };
type TarefaR = { id: string; titulo: string; status: string; prazo: string | null };

type Alerta = {
  id: string;
  tipo: string;
  mensagem: string;
  criticidade: "Alta" | "Média" | "Baixa";
  data: string;
  acao: string;
  icon: typeof AlertTriangle;
  area?: string | null;
  turno?: string | null;
};

function AlertasPage() {
  const { data: colabs } = useColaboradores();
  const { data: faltas } = useTable<FaltaR>("faltas", "data", false);
  const { data: ferias } = useTable<FeriasR>("ferias", "inicio", true);
  const { data: tarefas } = useTable<TarefaR>("tarefas", "created_at", false);
  const colMap = useMemo(() => new Map(colabs.map(c => [c.id, c])), [colabs]);
  const [q, setQ] = useState("");
  const [tipoFilter, setTipoFilter] = useState("all");
  const [criticidadeFilter, setCriticidadeFilter] = useState("all");
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

  const alertas = useMemo<Alerta[]>(() => {
    const out: Alerta[] = [];
    const hoje = new Date().toISOString().slice(0, 10);
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const cutoffISO = cutoff.toISOString().slice(0, 10);

    // Absenteísmo elevado por colaborador (últimos 30 dias)
    const motivosAbsenteismo = new Set([
      "Falta",
      "Atraso",
      "Atestado médico",
      "Falta injustificada",
      "Falta justificada",
      "Afastamento Médico",
    ]);
    const porColab: Record<string, number> = {};
    faltas.filter(f => f.data >= cutoffISO && motivosAbsenteismo.has(f.motivo)).forEach(f => {
      porColab[f.colaborador_id] = (porColab[f.colaborador_id] ?? 0) + 1;
    });
    Object.entries(porColab).filter(([_, n]) => n >= 3).forEach(([id, n]) => {
      const c = colMap.get(id);
      out.push({
        id: `falta-${id}`,
        tipo: "Absenteísmo elevado",
        mensagem: `${c?.nome ?? "Colaborador"} (${c?.area ?? "—"}) acumulou ${n} ocorrências de faltas nos últimos 30 dias`,
        criticidade: n >= 5 ? "Alta" : "Média",
        data: hoje,
        acao: "Abrir registro",
        icon: CalendarX,
        area: c?.area ?? null,
        turno: c?.turno ?? null,
      });
    });

    // Tarefas atrasadas
    const atrasadas = tarefas.filter(t => t.status !== "Concluída" && t.prazo && t.prazo < hoje);
    atrasadas.forEach(t => out.push({
      id: `tar-${t.id}`,
      tipo: "Tarefa atrasada",
      mensagem: `"${t.titulo}" venceu em ${t.prazo}`,
      criticidade: "Média",
      data: t.prazo!,
      acao: "Ver tarefa",
      icon: ClipboardList,
      area: null,
      turno: null,
    }));

    // Férias pendentes há mais de 5 dias
    const cinco = new Date(); cinco.setDate(cinco.getDate() - 5);
    const cincoISO = cinco.toISOString().slice(0, 10);
    ferias.filter(f => f.status === "Pendente" && f.inicio < cincoISO).forEach(f => {
      const c = colMap.get(f.colaborador_id);
      out.push({
        id: `fer-${f.id}`,
        tipo: "Férias pendentes",
        mensagem: `Solicitação de ${c?.nome ?? "colaborador"} aguardando aprovação`,
        criticidade: "Média",
        data: f.inicio,
        acao: "Aprovar agora",
        icon: Plane,
        area: c?.area ?? null,
        turno: c?.turno ?? null,
      });
    });

    return out.sort((a, b) => {
      const ord = { Alta: 0, Média: 1, Baixa: 2 };
      return ord[a.criticidade] - ord[b.criticidade];
    });
  }, [faltas, ferias, tarefas, colMap]);

  const tiposDisponiveis = useMemo(() => Array.from(new Set(alertas.map((alerta) => alerta.tipo))), [alertas]);
  const filteredAlertas = useMemo(() => {
    const term = q.trim().toLowerCase();
    return alertas.filter((alerta) => {
      const matchesText = !term || [alerta.tipo, alerta.mensagem, alerta.acao, alerta.data, alerta.area, alerta.turno]
        .join(" ")
        .toLowerCase()
        .includes(term);
      const matchesTipo = tipoFilter === "all" || alerta.tipo === tipoFilter;
      const matchesCriticidade = criticidadeFilter === "all" || alerta.criticidade === criticidadeFilter;
      const matchesArea = areaFilter === "all" || alerta.area === areaFilter;
      const matchesTurno = turnoFilter === "all" || alerta.turno === turnoFilter;
      return matchesText && matchesTipo && matchesCriticidade && matchesArea && matchesTurno;
    });
  }, [alertas, q, tipoFilter, criticidadeFilter, areaFilter, turnoFilter]);

  const { paged, page, setPage, pageSize, setPageSize, total, totalPages } = usePagination(filteredAlertas, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alertas"
        description={`${alertas.length} sinais críticos detectados automaticamente`}
      />
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[260px] flex-1 space-y-2">
            <Label>Buscar</Label>
            <Input placeholder="Buscar por tipo, mensagem ou data..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="w-[220px] space-y-2">
            <Label>Tipo de alerta</Label>
            <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value)}>
              <option value="all">Todos</option>
              {tiposDisponiveis.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
            </select>
          </div>
          <div className="w-[220px] space-y-2">
            <Label>Criticidade</Label>
            <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={criticidadeFilter} onChange={(e) => setCriticidadeFilter(e.target.value)}>
              <option value="all">Todas</option>
              {(["Alta","Média","Baixa"] as const).map((criticidade) => <option key={criticidade} value={criticidade}>{criticidade}</option>)}
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
      </Card>
      <div className="grid gap-3">
        {paged.map((a) => {
          const tone = a.criticidade === "Alta" ? "destructive" : a.criticidade === "Média" ? "warning" : "muted";
          const Icon = a.icon;
          return (
            <Card key={a.id} className="overflow-hidden">
              <CardContent className="flex items-start justify-between gap-4 p-4">
                <div className="flex items-start gap-4">
                  <div className={
                    tone === "destructive" ? "flex h-10 w-10 items-center justify-center rounded-md bg-destructive/10 text-destructive" :
                    tone === "warning" ? "flex h-10 w-10 items-center justify-center rounded-md bg-warning/15 text-warning-foreground" :
                    "flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground"
                  }>
                    {a.criticidade === "Alta" ? <AlertTriangle className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{a.tipo}</span>
                      <Badge variant={a.criticidade === "Alta" ? "destructive" : "secondary"}>{a.criticidade}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{a.mensagem}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Detectado em {formatDateBr(a.data)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filteredAlertas.length === 0 && (
          <Card><CardContent className="py-10 text-center text-muted-foreground"><BellRing className="mx-auto mb-2 h-6 w-6" />Nenhum alerta no momento.</CardContent></Card>
        )}
      </div>
      <DataPagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} totalPages={totalPages} />
    </div>
  );
}
