import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Download,
  Edit3,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColaboradorSelect } from "@/components/forms/ColaboradorSelect";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { AdminDeleteButton } from "@/components/AdminDeleteButton";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDateBr } from "@/lib/date";
import {
  avaliarMes,
  diasDoMes,
  gerarEscalaPadraoParaColaborador,
  isDomingo,
  podeMarcarTrabalho,
  sugerirFolgaCompensatoria,
  sugerirFolgaCompensatoriaAntes,
  toISODate,
} from "@/lib/escala-engine";
import {
  feriadosNacionaisSet,
  mapaFeriados,
} from "@/lib/feriados-brasil";
import {
  fetchColaboradoresBase,
  loadColaboradores,
  loadDias,
  loadFeriados,
  novoColaboradorId,
  novaMatricula,
  removerColaborador,
  removerDia,
  subscribeEscala,
  upsertColaborador,
  upsertDia,
  upsertDias,
} from "@/lib/escala-store";
import { downloadXlsx } from "@/lib/xlsx-utils";
import type { ColaboradorBase, DiaTipo, EscalaColaborador } from "@/lib/escala-types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_app/escalas")({
  head: () => ({
    meta: [
      { title: "Monitor de Jornada Contínua — Guardião de Gente" },
      {
        name: "description",
        content:
          "Controle moderno de jornadas contínuas com alertas de dias consecutivos e compensação dominical.",
      },
    ],
  }),
  component: EscalasPage,
});

const TIPO_LABEL: Record<DiaTipo, string> = {
  trabalho: "Trabalhando",
  folga: "Folga semanal",
  compensatoria: "Folga compensatória",
  feriado: "Feriado",
  vazio: "Não programado",
};

const TIPO_CLASS: Record<DiaTipo, string> = {
  trabalho:
    "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/25",
  folga: "bg-sky-500/15 text-sky-700 border-sky-500/30 hover:bg-sky-500/25",
  compensatoria:
    "bg-orange-500/15 text-orange-700 border-orange-500/30 hover:bg-orange-500/25",
  feriado: "bg-muted text-muted-foreground border-border hover:bg-muted",
  vazio: "bg-muted/30 text-muted-foreground border-border/60 hover:bg-muted/50",
};

function EscalasPage() {
  const hoje = new Date();
  const { user } = useAuth();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [tick, setTick] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return subscribeEscala(() => setTick((value) => value + 1));
  }, []);

  const colaboradores = useMemo(() => (mounted ? loadColaboradores() : []), [tick, mounted]);
  const dias = useMemo(() => (mounted ? loadDias() : []), [tick, mounted]);
  const feriados = useMemo(() => {
    const set = feriadosNacionaisSet(ano);
    if (mounted) {
      for (const data of loadFeriados()) set.add(data);
    }
    return set;
  }, [tick, ano, mounted]);
  const nomesFeriados = useMemo(() => mapaFeriados(ano), [ano]);
  const datas = useMemo(() => diasDoMes(ano, mes), [ano, mes]);

  const diasComFeriado = useMemo(() => {
    const merged = [...dias];
    const existing = new Set(merged.map((item) => `${item.colaboradorId}|${item.data}`));

    for (const data of datas) {
      if (!feriados.has(data)) continue;
      for (const colaborador of colaboradores) {
        const key = `${colaborador.id}|${data}`;
        if (!existing.has(key)) {
          merged.push({ colaboradorId: colaborador.id, data, tipo: "feriado" });
        }
      }
    }

    return merged;
  }, [dias, datas, colaboradores, feriados]);

  const { status, issues } = useMemo(
    () => avaliarMes(colaboradores, diasComFeriado, ano, mes),
    [colaboradores, diasComFeriado, ano, mes],
  );

  const statusMap = useMemo(
    () => new Map(status.map((item) => [item.colaboradorId, item] as const)),
    [status],
  );

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    | "all"
    | "ok"
    | "amarelo"
    | "vermelho"
    | "critico"
  >("all");
  const [baseColaboradores, setBaseColaboradores] = useState<ColaboradorBase[]>([]);
  const [selectedBaseId, setSelectedBaseId] = useState("");
  const [sortBy, setSortBy] = useState<
    | "alerta"
    | "nome"
    | "consecutivos"
    | "pendentes"
  >("alerta");

  // Novos filtros avançados
  const [gpidFilter, setGpidFilter] = useState("");
  const [setorFilter, setSetorFilter] = useState("");
  const [turnoFilter, setTurnoFilter] = useState("");
  const [periodoFilter, setPeriodoFilter] = useState<"mes" | "7dias" | "30dias">("mes");
  const [apenasComAlertas, setApenasComAlertas] = useState(false);

  // Extrair setores e turnos únicos dos colaboradores
  const setoresDisponiveis = useMemo(() => {
    const setores = new Set(colaboradores.map((c) => c.setor).filter(Boolean));
    return Array.from(setores).sort();
  }, [colaboradores]);

  const turnosDisponiveis = useMemo(() => {
    const turnos = new Set(colaboradores.map((c) => c.turno).filter(Boolean));
    return Array.from(turnos).sort();
  }, [colaboradores]);

  const filteredColaboradores = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return colaboradores.filter((colaborador) => {
      const text = [
        colaborador.nome,
        colaborador.matricula,
        colaborador.cargo,
        colaborador.setor,
        colaborador.supervisor,
      ]
        .join(" ")
        .toLowerCase();

      const matchesText = text.includes(normalized);
      const matchesGpid =
        !gpidFilter.trim() || colaborador.matricula.includes(gpidFilter.trim());
      const matchesSetor =
        !setorFilter || colaborador.setor === setorFilter;
      const matchesTurno =
        !turnoFilter || colaborador.turno === turnoFilter;
      const matchesStatus =
        statusFilter === "all" ||
        statusMap.get(colaborador.id)?.alertNivel === statusFilter;

      const temAlertas =
        statusMap.get(colaborador.id)?.alertNivel !== "ok";
      const matchesAlertas = !apenasComAlertas || temAlertas;

      return (
        matchesText &&
        matchesGpid &&
        matchesSetor &&
        matchesTurno &&
        matchesStatus &&
        matchesAlertas
      );
    });
  }, [colaboradores, query, gpidFilter, setorFilter, turnoFilter, statusFilter, statusMap, apenasComAlertas]);

  const sortedColaboradores = useMemo(() => {
    return [...filteredColaboradores].sort((a, b) => {
      const aStatus = statusMap.get(a.id);
      const bStatus = statusMap.get(b.id);

      if (sortBy === "nome") {
        return a.nome.localeCompare(b.nome, "pt-BR");
      }

      if (sortBy === "consecutivos") {
        return (
          (bStatus?.diasConsecutivos ?? 0) -
          (aStatus?.diasConsecutivos ?? 0)
        );
      }

      if (sortBy === "pendentes") {
        return (
          (bStatus?.compensatoriasPendentes ?? 0) -
          (aStatus?.compensatoriasPendentes ?? 0)
        );
      }

      const order = { critico: 0, vermelho: 1, amarelo: 2, ok: 3 } as const;
      return (
        (order[aStatus?.alertNivel ?? "ok"] ?? 4) -
        (order[bStatus?.alertNivel ?? "ok"] ?? 4) ||
        a.nome.localeCompare(b.nome, "pt-BR")
      );
    });
  }, [filteredColaboradores, sortBy, statusMap]);

  const hojeISO = toISODate(hoje);
  const trabalhandoHoje = colaboradores.filter((colaborador) =>
    diasComFeriado.some(
      (dia) =>
        dia.colaboradorId === colaborador.id &&
        dia.data === hojeISO &&
        dia.tipo === "trabalho",
    ),
  ).length;
  const folgaHoje = colaboradores.filter((colaborador) =>
    diasComFeriado.some(
      (dia) =>
        dia.colaboradorId === colaborador.id &&
        dia.data === hojeISO &&
        (dia.tipo === "folga" || dia.tipo === "compensatoria"),
    ),
  ).length;
  const totalPendencias = status.reduce(
    (acc, item) => acc + item.compensatoriasPendentes,
    0,
  );
  const totalDomingos = status.reduce(
    (acc, item) => acc + item.domingosTrabalhadosMes,
    0,
  );
  const totalErros = issues.filter((issue) => issue.level === "error").length;
  const totalAvisos = issues.filter((issue) => issue.level === "warn").length;

  const [colaboradorDialogOpen, setColaboradorDialogOpen] = useState(false);
  const [colaboradorDraft, setColaboradorDraft] = useState<EscalaColaborador | null>(null);

  useEffect(() => {
    fetchColaboradoresBase().then(setBaseColaboradores).catch(() => setBaseColaboradores([]));
  }, []);

  const reload = () => setTick((value) => value + 1);

  const abrirNovoColaborador = () => {
    setSelectedBaseId("");
    setColaboradorDraft({
      id: novoColaboradorId(),
      nome: "",
      matricula: novaMatricula(colaboradores),
      cargo: "",
      setor: "",
      supervisor: "",
      turno: "Manhã",
      admissao: hojeISO,
      escala: "jornada",
      aceitaDomingo: false,
    });
    setColaboradorDialogOpen(true);
  };

  const handleEditColaborador = (colaborador: EscalaColaborador) => {
    setSelectedBaseId(colaborador.id);
    setColaboradorDraft({ ...colaborador });
    setColaboradorDialogOpen(true);
  };

  const gerarEscalaPadrao = (colaborador: EscalaColaborador) => {
    const novosDias = gerarEscalaPadraoParaColaborador(colaborador, datas, feriados);
    if (novosDias.length) {
      upsertDias(novosDias);
      toast.success(
        `Escala padrão gerada para ${colaborador.nome} (${novosDias.length} dias).`,
      );
    }
  };

  const exportDomingosXlsx = () => {
    const domingos = diasComFeriado.filter(
      (dia) => isDomingo(dia.data) && dia.tipo === "trabalho",
    );
    if (domingos.length === 0) {
      toast.error("Nenhum domingo escalado para exportar.");
      return;
    }

    const rows = domingos
      .map((dia) => {
        const colaborador = colaboradores.find((c) => c.id === dia.colaboradorId);
        if (!colaborador) return null;
        return {
          Nome: colaborador.nome,
          GPID: colaborador.matricula,
          Cargo: colaborador.cargo,
          Setor: colaborador.setor,
          Turno: colaborador.turno,
          Data: formatDateBr(dia.data),
        };
      })
      .filter(Boolean) as Record<string, any>[];

    downloadXlsx(
      rows,
      "Domingos",
      `domingos-escalados-${ano}-${String(mes).padStart(2, "0")}.xlsx`,
    );
  };

  const exportDomingosPdf = () => {
    const domingos = diasComFeriado.filter(
      (dia) => isDomingo(dia.data) && dia.tipo === "trabalho",
    );
    if (domingos.length === 0) {
      toast.error("Nenhum domingo escalado para imprimir.");
      return;
    }

    const rows = domingos
      .map((dia) => {
        const colaborador = colaboradores.find((c) => c.id === dia.colaboradorId);
        if (!colaborador) return null;
        return {
          nome: colaborador.nome,
          gpid: colaborador.matricula,
          cargo: colaborador.cargo,
          setor: colaborador.setor,
          turno: colaborador.turno,
          data: formatDateBr(dia.data),
        };
      })
      .filter(Boolean) as Array<{
        nome: string;
        gpid: string;
        cargo: string;
        setor: string;
        turno: string;
        data: string;
      }>;

    const win = window.open("", "_blank", "width=1024,height=768");
    if (!win) {
      toast.error("Permita pop-ups para gerar o PDF.");
      return;
    }

    const titulo = `Domingos escalados — ${new Date().toLocaleString("pt-BR", {
      month: "long",
      year: "numeric",
    })}`;
    const emitidoEm = new Date().toLocaleString("pt-BR");
    const linhas = rows
      .map(
        (row) => `
          <tr>
            <td>${row.nome}</td>
            <td>${row.gpid}</td>
            <td>${row.cargo}</td>
            <td>${row.setor}</td>
            <td>${row.turno}</td>
            <td>${row.data}</td>
          </tr>`,
      )
      .join("");

    win.document.write(`<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>${titulo}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 24px; }
      h1 { font-size: 18px; margin-bottom: 8px; }
      .meta { font-size: 12px; color: #555; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
      thead th { background: #f3f4f6; }
      tbody tr:nth-child(even) { background: #fafafa; }
      .total { margin-top: 12px; font-size: 12px; color: #555; }
      @media print { body { margin: 12mm; } }
    </style>
  </head>
  <body>
    <h1>${titulo}</h1>
    <div class="meta">
      <div><strong>Emitido em:</strong> ${emitidoEm}</div>
      <div><strong>Total de domingos:</strong> ${rows.length}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Colaborador</th>
          <th>GPID</th>
          <th>Cargo</th>
          <th>Setor</th>
          <th>Turno</th>
          <th>Data</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>
    <div class="total">Total de registros: ${rows.length}</div>
    <script>
      window.onload = function () { window.focus(); window.print(); };
    </script>
  </body>
</html>`);
    win.document.close();
  };

  const handleDeleteColaborador = (colaboradorId: string, nome: string) => {
    if (!window.confirm(`Remover ${nome} do módulo de jornada?`)) return;
    removerColaborador(colaboradorId);
    toast.success(`${nome} removido.`);
    reload();
  };

  const handleSaveColaborador = () => {
    if (!colaboradorDraft) return;
    if (!colaboradorDraft.nome.trim()) {
      toast.error("Nome do colaborador é obrigatório.");
      return;
    }
    if (!colaboradorDraft.matricula.trim()) {
      toast.error("Matrícula é obrigatória.");
      return;
    }
    const isNew = !colaboradores.some((item) => item.id === colaboradorDraft.id);
    upsertColaborador(colaboradorDraft);
    if (isNew) {
      gerarEscalaPadrao(colaboradorDraft);
    }
    toast.success(`Colaborador ${colaboradorDraft.nome} salvo.`);
    setColaboradorDialogOpen(false);
    setColaboradorDraft(null);
    reload();
  };

  const selectBaseColaborador = (id: string) => {
    setSelectedBaseId(id);
    const base = baseColaboradores.find((item) => item.id === id);
    if (!base || !colaboradorDraft) return;
    setColaboradorDraft({
      ...colaboradorDraft,
      id: base.id,
      nome: base.nome,
      matricula: base.matricula,
      cargo: base.cargo,
      setor: base.setor,
      supervisor: base.supervisor,
      turno: base.turno,
    });
  };

  const showAlertDetails = () => {
    if (!issues.length) {
      toast.success("Nenhuma irregularidade detectada.");
      return;
    }
    const topIssues = issues.slice(0, 3).map((issue) => `• ${issue.data} – ${issue.message}`).join("\n");
    toast(`Alertas detectados:\n${topIssues}${issues.length > 3 ? `\n+ ${issues.length - 3} restantes` : ""}`);
  };

  function handleToggleDia(colaborador: EscalaColaborador, data: string) {
    const atual = diasComFeriado.find(
      (dia) => dia.colaboradorId === colaborador.id && dia.data === data,
    );
    const atualTipo: DiaTipo = atual?.tipo ?? "vazio";
    const proximo: DiaTipo =
      atualTipo === "vazio"
        ? "trabalho"
        : atualTipo === "trabalho"
        ? "folga"
        : atualTipo === "folga"
        ? "compensatoria"
        : "vazio";

    if (proximo === "trabalho") {
      const validacao = podeMarcarTrabalho(
        colaboradores,
        diasComFeriado,
        colaborador.id,
        data,
      );
      if (!validacao.ok) {
        toast.error(validacao.motivo ?? "Operação não permitida.");
        return;
      }
    }

    if (proximo === "vazio") {
      removerDia(colaborador.id, data);
    } else {
      upsertDia({ colaboradorId: colaborador.id, data, tipo: proximo });
    }

    if (
      proximo === "trabalho" &&
      isDomingo(data) &&
      colaborador.aceitaDomingo
    ) {
      const sugestao = sugerirFolgaCompensatoriaAntes(
        colaboradores,
        diasComFeriado,
        colaborador.id,
        data,
      );
      if (sugestao) {
        upsertDia({
          colaboradorId: colaborador.id,
          data: sugestao,
          tipo: "compensatoria",
        });
        toast.success(
          `Folga compensatória sugerida para ${colaborador.nome} em ${sugestao}.`,
        );
      } else {
        toast.warning(
          "Domingo registrado. Avalie uma compensatória dentro do prazo legal.",
        );
      }
    }

    reload();
  }

  function sugerirComp(colaborador: EscalaColaborador) {
    const data = sugerirFolgaCompensatoria(
      colaboradores,
      diasComFeriado,
      colaborador.id,
      hojeISO,
      14,
    );

    if (!data) {
      toast.error("Sem janela ideal nos próximos 14 dias.");
      return;
    }

    upsertDia({ colaboradorId: colaborador.id, data, tipo: "compensatoria" });
    toast.success(`Folga compensatória sugerida para ${colaborador.nome} em ${data}.`);
    reload();
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6">
        <PageHeader
          title="Monitor de Jornada Contínua"
          description="Controle de escalas com validação de dias consecutivos, domingos e folgas compensatórias."
  actions={
  <div className="flex flex-wrap items-center gap-2">
  <AdminDeleteButton tableName="escalas" label="Deletar Todos" description="Todas as escalas serão removidas permanentemente" />
  <Select value={String(mes)} onValueChange={(value) => setMes(Number(value))}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {new Date(2000, value - 1, 1).toLocaleString("pt-BR", {
                        month: "long",
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(ano)} onValueChange={(value) => setAno(Number(value))}>
                <SelectTrigger className="w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[ano - 1, ano, ano + 1].map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={abrirNovoColaborador}>
                <Edit3 className="mr-2 h-4 w-4" />
                Novo colaborador
              </Button>
              <Button variant="outline" size="sm" onClick={exportDomingosXlsx}>
                <Download className="mr-2 h-4 w-4" />
                Domingos XLSX
              </Button>
              <Button variant="outline" size="sm" onClick={exportDomingosPdf}>
                <Printer className="mr-2 h-4 w-4" />
                Domingos PDF
              </Button>
              <Button variant="ghost" size="sm" onClick={reload}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar
              </Button>
            </div>
          }
        />

        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Colaboradores" value={colaboradores.length} />
          <Kpi label="Trabalhando hoje" value={trabalhandoHoje} tone="emerald" />
          <Kpi label="Em folga hoje" value={folgaHoje} tone="sky" />
          <Kpi
            label="Folgas comp. pendentes"
            value={totalPendencias}
            tone={totalPendencias ? "orange" : "default"}
          />
          <Kpi label="Domingos trabalhados" value={totalDomingos} />
          <Kpi
            label="Alertas"
            value={totalErros + totalAvisos}
            tone={totalErros ? "red" : totalAvisos ? "amber" : "default"}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Button variant="ghost" size="sm" onClick={showAlertDetails}>
            <AlertTriangle className="mr-2 h-4 w-4 text-amber-500" />
            Ver alertas
          </Button>
          <span className="rounded-full border border-border px-2 py-1 text-xs font-medium text-foreground">
            {totalErros} erros · {totalAvisos} avisos
          </span>
        </div>

        <Card className="p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(240px,_1fr)_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10"
                placeholder="Buscar colaborador, matrícula, cargo..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Filtrar status
              </Label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="ok">OK</SelectItem>
                  <SelectItem value="amarelo">5 dias</SelectItem>
                  <SelectItem value="vermelho">6 dias</SelectItem>
                  <SelectItem value="critico">Crítico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Ordenar por
              </Label>
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Alerta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alerta">Alerta</SelectItem>
                  <SelectItem value="nome">Nome</SelectItem>
                  <SelectItem value="consecutivos">Dias seguidos</SelectItem>
                  <SelectItem value="pendentes">Pendências</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* Filtros Avançados */}
        <Card className="p-4">
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Filtros Avançados
            </Label>
            <div className="grid gap-3 md:grid-cols-5 lg:grid-cols-6">
              <div>
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  GPID / Matrícula
                </Label>
                <Input
                  placeholder="Filtrar GPID"
                  value={gpidFilter}
                  onChange={(e) => setGpidFilter(e.target.value)}
                  className="mt-1 h-9 text-xs"
                />
              </div>
              <div>
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Setor
                </Label>
                <Select value={setorFilter} onValueChange={setSetorFilter}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos os setores</SelectItem>
                    {setoresDisponiveis.map((setor) => (
                      <SelectItem key={setor} value={setor}>
                        {setor}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Turno
                </Label>
                <Select value={turnoFilter} onValueChange={setTurnoFilter}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos os turnos</SelectItem>
                    {turnosDisponiveis.map((turno) => (
                      <SelectItem key={turno} value={turno}>
                        {turno}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Período
                </Label>
                <Select value={periodoFilter} onValueChange={(value) => setPeriodoFilter(value as any)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mes">Mês inteiro</SelectItem>
                    <SelectItem value="7dias">Próx. 7 dias</SelectItem>
                    <SelectItem value="30dias">Próx. 30 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer h-9">
                  <Checkbox
                    checked={apenasComAlertas}
                    onCheckedChange={(checked) => setApenasComAlertas(checked as boolean)}
                  />
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    Apenas alertas
                  </span>
                </label>
              </div>
              {(gpidFilter || setorFilter || turnoFilter || apenasComAlertas) && (
                <div className="flex items-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setGpidFilter("");
                      setSetorFilter("");
                      setTurnoFilter("");
                      setApenasComAlertas(false);
                    }}
                    className="text-xs h-9"
                  >
                    Limpar filtros
                  </Button>
                </div>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              Exibindo <strong>{filteredColaboradores.length}</strong> de <strong>{colaboradores.length}</strong> colaboradores
            </div>
          </div>
        </Card>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <Legend cls={TIPO_CLASS.trabalho} label="Trabalho" />
          <Legend cls={TIPO_CLASS.folga} label="Folga semanal" />
          <Legend cls={TIPO_CLASS.compensatoria} label="Folga compensatória" />
          <Legend cls="bg-red-500/20 text-red-700 border-red-500/40" label="Irregularidade" />
          <span className="ml-2">
            Clique em um dia para alternar entre Trabalho, Folga, Compensatória e Limpar.
          </span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Calendário mensal
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-auto">
            <table className="w-full min-w-[1000px] border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-[240px] bg-card px-3 py-2 text-left font-medium">
                    Colaborador
                  </th>
                  {datas.map((data) => {
                    const dia = parseInt(data.slice(-2), 10);
                    const domingo = isDomingo(data);
                    const nomeFeriado = nomesFeriados.get(data);
                    const ehFeriado = Boolean(nomeFeriado);
                    return (
                      <th
                        key={data}
                        className={cn(
                          "w-9 px-1 py-2 text-center font-medium",
                          domingo && "bg-red-500/10 text-red-600",
                          ehFeriado && "bg-violet-500/10 text-violet-700",
                        )}
                      >
                        <div className="flex flex-col items-center text-[10px] uppercase">
                          <div>{new Date(data).toLocaleString("pt-BR", { weekday: "narrow" })}</div>
                          <div>{dia}</div>
                          {(domingo || ehFeriado) && <div className="mt-0.5 h-1 w-1 rounded-full bg-current" />}
                        </div>
                      </th>
                    );
                  })}
                  <th className="sticky right-0 z-10 min-w-[110px] bg-card px-2 py-2 text-center font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedColaboradores.map((colaborador) => {
                  const statusItem = statusMap.get(colaborador.id);
                  return (
                    <tr key={colaborador.id} className="border-t align-middle">
                      <td className="sticky left-0 z-10 h-12 bg-card px-3 py-2 align-middle">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 font-medium text-foreground">
                            {colaborador.nome}
                            {colaborador.aceitaDomingo && (
                              <Badge className="gap-1 border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[10px] text-amber-700">
                                <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
                                Dom
                              </Badge>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {colaborador.matricula} · {colaborador.cargo} · {colaborador.setor} · {colaborador.turno}
                          </div>
                        </div>
                      </td>
                      {datas.map((data) => {
                        const dia = diasComFeriado.find(
                          (item) => item.colaboradorId === colaborador.id && item.data === data,
                        );
                        const tipo: DiaTipo = dia?.tipo ?? "vazio";
                        const irregular = statusItem?.irregularidades.some(
                          (issue) => issue.data === data && issue.level === "error",
                        );
                        return (
                          <td key={data} className="px-0.5 py-0.5">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => handleToggleDia(colaborador, data)}
                                  className={cn(
                                    "h-9 w-9 rounded-md border text-[10px] font-semibold transition-colors",
                                    TIPO_CLASS[tipo],
                                    irregular &&
                                      "ring-2 ring-red-500 ring-offset-1 bg-red-500/20 text-red-700 border-red-500/40",
                                  )}
                                >
                                  {tipo === "trabalho"
                                    ? "T"
                                    : tipo === "folga"
                                    ? "F"
                                    : tipo === "compensatoria"
                                    ? "FC"
                                    : tipo === "feriado"
                                    ? "H"
                                    : ""}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="text-xs">
                                  <div className="font-medium">{data}</div>
                                  <div>{TIPO_LABEL[tipo]}</div>
                                  {irregular && (
                                    <div className="text-red-500">Irregularidade detectada</div>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </td>
                        );
                      })}
                      <td className="sticky right-0 z-10 bg-card px-2 py-2 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <StatusBadge nivel={statusItem?.alertNivel ?? "ok"} />
                          {statusItem?.compensatoriasPendentes ? (
                            <button
                              onClick={() => sugerirComp(colaborador)}
                              className="inline-flex items-center gap-1 rounded-md border border-orange-200 bg-orange-50 px-2 py-1 text-[10px] text-orange-700 transition hover:bg-orange-100"
                            >
                              <Sparkles className="h-3 w-3" />
                              {statusItem.compensatoriasPendentes}
                            </button>
                          ) : null}
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleEditColaborador(colaborador)}
                              className="rounded-md border border-border bg-muted px-2 py-1 text-muted-foreground transition hover:bg-muted/80"
                              aria-label={`Editar ${colaborador.nome}`}
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteColaborador(colaborador.id, colaborador.nome)}
                              className="rounded-md border border-border bg-muted px-2 py-1 text-muted-foreground transition hover:bg-muted/80"
                              aria-label={`Excluir ${colaborador.nome}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Dialog open={colaboradorDialogOpen} onOpenChange={setColaboradorDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {colaboradorDraft?.id ? "Colaborador" : "Novo colaborador"}
              </DialogTitle>
              <DialogDescription>
                Cadastre ou edite as informações do colaborador para a jornada contínua.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              <div>
                <ColaboradorSelect
                  value={selectedBaseId}
                  onChange={selectBaseColaborador}
                  colaboradores={baseColaboradores.map((base) => ({
                    id: base.id,
                    nome: base.nome,
                    matricula: base.matricula,
                    area: base.setor,
                  }))}
                  label="Base de colaboradores"
                />
              </div>
              <div>
                <Label htmlFor="nome">Nome</Label>
                <Input
                  id="nome"
                  value={colaboradorDraft?.nome ?? ""}
                  onChange={(event) =>
                    setColaboradorDraft((current) =>
                      current ? { ...current, nome: event.target.value } : current,
                    )
                  }
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="matricula">Matrícula</Label>
                  <Input
                    id="matricula"
                    value={colaboradorDraft?.matricula ?? ""}
                    onChange={(event) =>
                      setColaboradorDraft((current) =>
                        current ? { ...current, matricula: event.target.value } : current,
                      )
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="admissao">Admissão</Label>
                  <Input
                    id="admissao"
                    type="date"
                    value={colaboradorDraft?.admissao ?? hojeISO}
                    onChange={(event) =>
                      setColaboradorDraft((current) =>
                        current ? { ...current, admissao: event.target.value } : current,
                      )
                    }
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="cargo">Cargo</Label>
                  <Input
                    id="cargo"
                    value={colaboradorDraft?.cargo ?? ""}
                    onChange={(event) =>
                      setColaboradorDraft((current) =>
                        current ? { ...current, cargo: event.target.value } : current,
                      )
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="setor">Setor</Label>
                  <Input
                    id="setor"
                    value={colaboradorDraft?.setor ?? ""}
                    onChange={(event) =>
                      setColaboradorDraft((current) =>
                        current ? { ...current, setor: event.target.value } : current,
                      )
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="turno">Turno</Label>
                  <Select
                    value={colaboradorDraft?.turno ?? "Manhã"}
                    onValueChange={(value) =>
                      setColaboradorDraft((current) =>
                        current ? { ...current, turno: value as any } : current,
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Manhã">Manhã</SelectItem>
                      <SelectItem value="Tarde">Tarde</SelectItem>
                      <SelectItem value="Noite">Noite</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="supervisor">Supervisor</Label>
                <Input
                  id="supervisor"
                  value={colaboradorDraft?.supervisor ?? ""}
                  onChange={(event) =>
                    setColaboradorDraft((current) =>
                      current ? { ...current, supervisor: event.target.value } : current,
                    )
                  }
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="aceitaDomingo"
                  checked={colaboradorDraft?.aceitaDomingo ?? false}
                  onCheckedChange={(checked) =>
                    setColaboradorDraft((current) =>
                      current ? { ...current, aceitaDomingo: Boolean(checked) } : current,
                    )
                  }
                />
                <Label htmlFor="aceitaDomingo" className="cursor-pointer">
                  Aceita domingo trabalhado e recebe folga compensatória
                </Label>
              </div>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary">Cancelar</Button>
              </DialogClose>
              <Button onClick={handleSaveColaborador}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}


function Kpi({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "emerald" | "sky" | "orange" | "amber" | "red";
}) {
  const toneCls = {
    default: "text-foreground",
    emerald: "text-emerald-600",
    sky: "text-sky-600",
    orange: "text-orange-600",
    amber: "text-amber-600",
    red: "text-red-600",
  }[tone];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={cn("mt-1 text-2xl font-bold", toneCls)}>{value}</div>
      </CardContent>
    </Card>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={cn("h-3 w-3 rounded border", cls)} />
      {label}
    </span>
  );
}

function StatusBadge({
  nivel,
}: {
  nivel: "ok" | "amarelo" | "vermelho" | "critico";
}) {
  if (nivel === "critico") return <Badge variant="destructive">Crítico</Badge>;
  if (nivel === "vermelho")
    return (
      <Badge className="bg-red-500/15 text-red-700 hover:bg-red-500/25">6 dias</Badge>
    );
  if (nivel === "amarelo")
    return (
      <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/25">5 dias</Badge>
    );
  return (
    <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25">OK</Badge>
  );
}
