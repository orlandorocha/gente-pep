import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Users, CalendarX, Plane, BellRing, TrendingUp, Activity,
  CalendarClock, ClipboardList, FileWarning,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";
import { KpiCard } from "@/components/KpiCard";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useColaboradores, useTable } from "@/hooks/useData";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

const COLORS = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)"];

type FaltaR = { id: string; colaborador_id: string; data: string; motivo: string; periodo: string };
type FeriasR = { id: string; colaborador_id: string; inicio: string; fim: string; status: string };
type LicencaR = { id: string; colaborador_id: string; tipo: string; inicio: string; fim: string; status: string };
type AgR = { id: string; colaborador_id: string; titulo: string; tipo: string; data: string; hora: string; prioridade: string };
type TarefaR = { id: string; titulo: string; status: string; prioridade: string; prazo: string | null };

function Dashboard() {
  const { data: colaboradores } = useColaboradores();
  const { data: faltas } = useTable<FaltaR>("faltas", "data", false);
  const { data: ferias } = useTable<FeriasR>("ferias", "inicio", true);
  const { data: licencas } = useTable<LicencaR>("licencas", "inicio", false);
  const { data: agendamentos } = useTable<AgR>("agendamentos", "data", true);
  const { data: tarefas } = useTable<TarefaR>("tarefas", "created_at", false);

  const [periodo, setPeriodo] = useState<"7d" | "30d" | "90d">("30d");
  const [areaFiltro, setAreaFiltro] = useState<string>("all");
  const [turnoFiltro, setTurnoFiltro] = useState<string>("all");

  const colMap = useMemo(() => new Map(colaboradores.map(c => [c.id, c])), [colaboradores]);
  const areas = useMemo(() => Array.from(new Set(colaboradores.map(c => c.area))).sort(), [colaboradores]);

  const dias = periodo === "7d" ? 7 : periodo === "30d" ? 30 : 90;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - dias);
  const cutoffISO = cutoff.toISOString().slice(0, 10);

  // Filtra faltas por período + área/turno do colaborador
  const faltasFiltradas = useMemo(() => faltas.filter(f => {
    if (f.data < cutoffISO) return false;
    const c = colMap.get(f.colaborador_id);
    if (!c) return false;
    if (areaFiltro !== "all" && c.area !== areaFiltro) return false;
    if (turnoFiltro !== "all" && c.turno !== turnoFiltro) return false;
    return true;
  }), [faltas, cutoffISO, areaFiltro, turnoFiltro, colMap]);

  const colaboradoresFiltrados = useMemo(() => colaboradores.filter(c => {
    if (areaFiltro !== "all" && c.area !== areaFiltro) return false;
    if (turnoFiltro !== "all" && c.turno !== turnoFiltro) return false;
    return true;
  }), [colaboradores, areaFiltro, turnoFiltro]);

  const ativos = colaboradoresFiltrados.filter(c => c.status === "Ativo").length;
  const afastados = colaboradoresFiltrados.filter(c => c.status === "Afastado").length;
  const taxa = colaboradoresFiltrados.length > 0
    ? ((faltasFiltradas.length / (colaboradoresFiltrados.length * dias * (5/7))) * 100).toFixed(1)
    : "0.0";
  const hoje = new Date().toISOString().slice(0, 10);
  const proxLimite = new Date(); proxLimite.setDate(proxLimite.getDate() + 45);
  const proxLimiteISO = proxLimite.toISOString().slice(0, 10);
  const feriasProximas = ferias.filter(f => f.inicio >= hoje && f.inicio <= proxLimiteISO && (f.status === "Aprovada" || f.status === "Pendente")).length;
  const feriasEmGozo = ferias.filter(f => f.status === "Em gozo" || (f.status === "Aprovada" && f.inicio <= hoje && hoje <= f.fim)).length;
  const licencasAtivas = licencas.filter(l => l.status === "Ativa" && l.inicio <= hoje && hoje <= l.fim).length;
  const tarefasPendentes = tarefas.filter(t => t.status !== "Concluída").length;
  const tarefasAtrasadas = tarefas.filter(t => t.status !== "Concluída" && t.prazo && t.prazo < hoje).length;
  const agProximos = agendamentos.filter(a => a.data >= hoje && a.data <= proxLimiteISO).length;

  // Série temporal de absenteísmo (últimos 6 meses)
  const absenteismoSerie = useMemo(() => {
    const buckets: Record<string, { mes: string; faltas: number; baseDias: number }> = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pt-BR", { month: "short" });
      buckets[key] = { mes: label, faltas: 0, baseDias: 22 };
    }
    faltas.forEach(f => {
      const key = f.data.slice(0, 7);
      if (buckets[key]) {
        const c = colMap.get(f.colaborador_id);
        if (!c) return;
        if (areaFiltro !== "all" && c.area !== areaFiltro) return;
        if (turnoFiltro !== "all" && c.turno !== turnoFiltro) return;
        buckets[key].faltas += 1;
      }
    });
    const base = Math.max(1, colaboradoresFiltrados.length);
    return Object.values(buckets).map(b => ({
      mes: b.mes,
      taxa: Number(((b.faltas / (base * b.baseDias)) * 100).toFixed(2)),
    }));
  }, [faltas, colMap, areaFiltro, turnoFiltro, colaboradoresFiltrados.length]);

  // Absenteísmo por área (período filtrado)
  const absenteismoPorArea = useMemo(() => {
    const counts: Record<string, { faltas: number; colabs: number }> = {};
    colaboradoresFiltrados.forEach(c => {
      counts[c.area] = counts[c.area] ?? { faltas: 0, colabs: 0 };
      counts[c.area].colabs += 1;
    });
    faltasFiltradas.forEach(f => {
      const c = colMap.get(f.colaborador_id);
      if (c && counts[c.area]) counts[c.area].faltas += 1;
    });
    return Object.entries(counts).map(([area, v]) => ({
      area,
      taxa: v.colabs > 0 ? Number(((v.faltas / (v.colabs * dias * (5/7))) * 100).toFixed(2)) : 0,
    }));
  }, [colaboradoresFiltrados, faltasFiltradas, colMap, dias]);

  // Faltas por motivo
  const faltasPorMotivo = useMemo(() => {
    const m: Record<string, number> = {};
    faltasFiltradas.forEach(f => { m[f.motivo] = (m[f.motivo] ?? 0) + 1; });
    return Object.entries(m).map(([motivo, total]) => ({ motivo, total }));
  }, [faltasFiltradas]);

  // Alertas computados em tempo real
  const alertas = useMemo(() => {
    const out: { id: string; tipo: string; mensagem: string; criticidade: "Alta"|"Média"|"Baixa" }[] = [];
    // Colaboradores com 3+ faltas no período
    const porColab: Record<string, number> = {};
    faltasFiltradas.forEach(f => { porColab[f.colaborador_id] = (porColab[f.colaborador_id] ?? 0) + 1; });
    Object.entries(porColab).filter(([_, n]) => n >= 3).forEach(([id, n]) => {
      const c = colMap.get(id);
      out.push({ id: `falta-${id}`, tipo: "Absenteísmo elevado", mensagem: `${c?.nome ?? "Colaborador"} acumulou ${n} faltas`, criticidade: n >= 5 ? "Alta" : "Média" });
    });
    // Tarefas atrasadas
    if (tarefasAtrasadas > 0) {
      out.push({ id: "tar-atr", tipo: "Tarefas atrasadas", mensagem: `${tarefasAtrasadas} tarefa(s) com prazo vencido`, criticidade: tarefasAtrasadas >= 5 ? "Alta" : "Média" });
    }
    // Férias pendentes há mais de 5 dias
    const cincoDias = new Date(); cincoDias.setDate(cincoDias.getDate() - 5);
    const cincoISO = cincoDias.toISOString().slice(0, 10);
    const pendOld = ferias.filter(f => f.status === "Pendente" && f.inicio < cincoISO).length;
    if (pendOld > 0) out.push({ id: "fer-pend", tipo: "Férias pendentes", mensagem: `${pendOld} solicitação(ões) aguardando aprovação`, criticidade: "Média" });
    return out;
  }, [faltasFiltradas, tarefasAtrasadas, ferias, colMap]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visão executiva"
        description="Indicadores consolidados de absenteísmo, férias, licenças e alertas."
        actions={
          <>
            <Select value={periodo} onValueChange={(v) => setPeriodo(v as any)}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="90d">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
            <Select value={areaFiltro} onValueChange={setAreaFiltro}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Área" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as áreas</SelectItem>
                {areas.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={turnoFiltro} onValueChange={setTurnoFiltro}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Turno" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos turnos</SelectItem>
                <SelectItem value="Manhã">Manhã</SelectItem>
                <SelectItem value="Tarde">Tarde</SelectItem>
                <SelectItem value="Noite">Noite</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Colaboradores ativos" value={ativos} hint={`${colaboradoresFiltrados.length} cadastrados · ${afastados} afastados`} icon={Users} tone="primary" />
        <KpiCard label="Faltas no período" value={faltasFiltradas.length} hint={`últimos ${dias} dias`} icon={CalendarX} tone="destructive" />
        <KpiCard label="Taxa de absenteísmo" value={`${taxa}%`} hint="média do período" icon={Activity} tone="warning" />
        <KpiCard label="Férias próximas" value={feriasProximas} hint={`${feriasEmGozo} em gozo agora`} icon={Plane} tone="info" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Licenças ativas" value={licencasAtivas} hint="em curso hoje" icon={FileWarning} tone="info" />
        <KpiCard label="Agendamentos" value={agProximos} hint="próximos 45 dias" icon={CalendarClock} tone="primary" />
        <KpiCard label="Tarefas pendentes" value={tarefasPendentes} hint={`${tarefasAtrasadas} atrasada(s)`} icon={ClipboardList} tone={tarefasAtrasadas > 0 ? "destructive" : "info"} />
        <KpiCard label="Alertas" value={alertas.length} hint="detectados automaticamente" icon={BellRing} tone={alertas.some(a => a.criticidade === "Alta") ? "destructive" : "warning"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Absenteísmo ao longo do tempo</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={absenteismoSerie}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} unit="%" />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                <Area type="monotone" dataKey="taxa" stroke="var(--color-chart-1)" strokeWidth={2} fill="url(#g1)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Faltas por motivo</CardTitle>
          </CardHeader>
          <CardContent className="h-[360px]">
            {faltasPorMotivo.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem faltas no período</div>
            ) : (
              <div className="flex h-full flex-col">
                <div className="h-[190px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 12, right: 12, bottom: 12, left: 12 }}>
                      <Pie
                        data={faltasPorMotivo}
                        dataKey="total"
                        nameKey="motivo"
                        cx="50%"
                        cy="50%"
                        innerRadius={42}
                        outerRadius={76}
                        paddingAngle={3}
                      >
                        {faltasPorMotivo.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 flex-1 overflow-y-auto pr-1">
                  <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs">
                    {faltasPorMotivo.map((item, i) => (
                      <div key={item.motivo} className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: COLORS[i % COLORS.length] }}
                        />
                        <span className="text-muted-foreground">{item.motivo}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Absenteísmo por área</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            {absenteismoPorArea.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem dados</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={absenteismoPorArea}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="area" stroke="var(--color-muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} unit="%" />
                  <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                  <Bar dataKey="taxa" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Alertas ativos</CardTitle>
            <BellRing className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent className="space-y-3">
            {alertas.length === 0 && <p className="text-sm text-muted-foreground">Nenhum alerta no momento.</p>}
            {alertas.slice(0, 5).map((a) => (
              <div key={a.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{a.tipo}</span>
                  <Badge variant={a.criticidade === "Alta" ? "destructive" : a.criticidade === "Média" ? "default" : "secondary"} className="text-[10px]">
                    {a.criticidade}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{a.mensagem}</p>
              </div>
            ))}
            {alertas.length > 5 && (
              <p className="pt-1 text-xs text-muted-foreground">
                +{alertas.length - 5} alerta(s) adicional(is)
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
