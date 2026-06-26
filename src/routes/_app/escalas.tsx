import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronsUpDown,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { PageHeader } from "@/components/PageHeader";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  fetchColaboradoresBase,
  loadColaboradores,
  loadDias,
  loadFeriados,
  novaMatricula,
  novoColaboradorId,
  removerDia,
  resetarDemo,
  saveColaboradores,
  subscribeEscala,
  upsertDia,
  upsertDias,
  type ColaboradorBase,
} from "@/lib/escala-store";

import {
  addDays,
  avaliarMes,
  diasDoMes,
  gerarEscala6x1,
  isDomingo,
  limiteFolgaCargo,
  podeMarcarTrabalho,
  sugerirFolgaCompensatoria,
  sugerirFolgaCompensatoriaAntes,
  toISODate,
} from "@/lib/escala-engine";

import {
  feriadosNacionaisSet,
  mapaFeriados,
} from "@/lib/feriados-brasil";
import type {
  DiaTipo,
  EscalaColaborador,
} from "@/lib/escala-types";
import { cn } from "@/lib/utils";
import { AREAS } from "@/data/areas";
import { CARGOS } from "@/data/cargos";
import { GESTORES } from "@/data/gestores";


export const Route = createFileRoute("/_app/escalas")({
  head: () => ({
    meta: [
      { title: "Escalas 6x1 — Guardião de Gente" },
      {
        name: "description",
        content:
          "Controle de folgas, escala 6x1 e folgas compensatórias de domingo.",
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
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);
  useEffect(() => subscribeEscala(reload), []);


  const colaboradores = useMemo<EscalaColaborador[]>(
    () => loadColaboradores(),
    [version],
  );
  const dias = useMemo(() => loadDias(), [version]);
  // Feriados = nacionais brasileiros (auto) + cadastrados manualmente.
  const feriados = useMemo(() => {
    const set = feriadosNacionaisSet(ano);
    for (const d of loadFeriados()) set.add(d);
    return set;
  }, [version, ano]);
  const nomesFeriados = useMemo(() => mapaFeriados(ano), [ano]);
  const datas = useMemo(() => diasDoMes(ano, mes), [ano, mes]);

  // aplica feriados
  const diasComFeriado = useMemo(() => {
    const arr = [...dias];
    for (const d of datas) {
      if (feriados.has(d)) {
        for (const c of colaboradores) {
          const idx = arr.findIndex(
            (x) => x.colaboradorId === c.id && x.data === d,
          );
          if (idx >= 0) arr[idx] = { ...arr[idx], tipo: "feriado" };
          else arr.push({ colaboradorId: c.id, data: d, tipo: "feriado" });
        }
      }
    }
    return arr;
  }, [dias, datas, colaboradores, feriados]);

  const { status } = useMemo(
    () => avaliarMes(colaboradores, diasComFeriado, ano, mes),
    [colaboradores, diasComFeriado, ano, mes],
  );

  const statusMap = useMemo(
    () => new Map(status.map((s) => [s.colaboradorId, s] as const)),
    [status],
  );

  const [novoColab, setNovoColab] = useState<EscalaColaborador | null>(null);

  // Dashboard counters
  const hojeISO = toISODate(new Date());
  const trabalhandoHoje = colaboradores.filter((c) =>
    diasComFeriado.some(
      (d) =>
        d.colaboradorId === c.id && d.data === hojeISO && d.tipo === "trabalho",
    ),
  ).length;
  const folgaHoje = colaboradores.filter((c) =>
    diasComFeriado.some(
      (d) =>
        d.colaboradorId === c.id &&
        d.data === hojeISO &&
        (d.tipo === "folga" || d.tipo === "compensatoria"),
    ),
  ).length;
  const totalCompPend = status.reduce(
    (a, s) => a + s.compensatoriasPendentes,
    0,
  );
  const totalDomingos = status.reduce(
    (a, s) => a + s.domingosTrabalhadosMes,
    0,
  );
  const proximosLimite = status.filter(
    (s) => s.alertNivel === "amarelo" || s.alertNivel === "vermelho",
  ).length;
  const criticos = status.filter((s) => s.alertNivel === "critico").length;

  function handleClickDia(colab: EscalaColaborador, data: string) {
    const atual = diasComFeriado.find(
      (d) => d.colaboradorId === colab.id && d.data === data,
    );
    const cur: DiaTipo = atual?.tipo ?? "vazio";
    // Ciclo: vazio -> trabalho -> folga -> compensatoria -> vazio
    const proximo: DiaTipo =
      cur === "vazio"
        ? "trabalho"
        : cur === "trabalho"
          ? "folga"
          : cur === "folga"
            ? "compensatoria"
            : "vazio";

    if (proximo === "trabalho") {
      const v = podeMarcarTrabalho(colaboradores, diasComFeriado, colab.id, data);
      if (!v.ok) {
        toast.error(v.motivo!);
        return;
      }
    }
    if (proximo === "vazio") {
      removerDia(colab.id, data);
    } else {
      upsertDia({ colaboradorId: colab.id, data, tipo: proximo });
    }

    // Auto-programa folga compensatória ANTES do domingo trabalhado (CLT art. 67).
    if (proximo === "trabalho" && isDomingo(data) && colab.aceitaDomingo) {
      const jaTemComp = diasComFeriado.some(
        (d) =>
          d.colaboradorId === colab.id &&
          d.tipo === "compensatoria" &&
          Math.abs(
            (new Date(d.data).getTime() - new Date(data).getTime()) / 86400000,
          ) <= 6,
      );
      if (!jaTemComp) {
        const sugest = sugerirFolgaCompensatoriaAntes(
          colaboradores,
          diasComFeriado,
          colab.id,
          data,
        );
        if (sugest) {
          upsertDia({ colaboradorId: colab.id, data: sugest, tipo: "compensatoria" });
          toast.success(
            `Folga compensatória programada em ${sugest} (antes do domingo ${data}).`,
          );
        } else {
          toast.warning(
            `Domingo trabalhado sem janela disponível para compensar antes — pendência criada (prazo 7 dias).`,
          );
        }
      }
    }
    reload();
  }


  function sugerirComp(colab: EscalaColaborador) {
    const data = sugerirFolgaCompensatoria(
      colaboradores,
      diasComFeriado,
      colab.id,
      hojeISO,
      14,
    );
    if (!data) {
      toast.message("Sem janela ideal nos próximos 14 dias.");
      return;
    }
    upsertDia({ colaboradorId: colab.id, data, tipo: "compensatoria" });
    toast.success(
      `Folga compensatória sugerida para ${colab.nome} em ${data}.`,
    );
    reload();
  }

  function adicionarColaborador(c: EscalaColaborador) {
    const next = [...colaboradores, c];
    saveColaboradores(next);

    // Gera automaticamente a escala 6x1 do novo colaborador a partir do 1º dia
    // do mês visível, distribuindo folgas conforme os limites por dia/cargo.
    const inicio = toISODate(new Date(ano, mes - 1, 1));
    const gerados = gerarEscala6x1(c, colaboradores, dias, inicio, 9);
    if (gerados.length) {
      upsertDias(gerados);
      const folgas = gerados.filter(
        (d) => d.tipo === "folga" || d.tipo === "compensatoria",
      ).length;
      toast.success(
        `Escala 6x1 gerada para ${c.nome}: ${folgas} folgas distribuídas (limite ${limiteFolgaCargo(c.cargo)}/dia para ${c.cargo}).`,
      );
    }
    reload();
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6">
        <PageHeader
          title="Escalas 6x1"
          description="Calendário mensal, validação automática e folgas compensatórias."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={String(mes)}
                onValueChange={(v) => setMes(Number(v))}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {new Date(2000, m - 1, 1).toLocaleString("pt-BR", {
                        month: "long",
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(ano)}
                onValueChange={(v) => setAno(Number(v))}
              >
                <SelectTrigger className="w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[ano - 1, ano, ano + 1].map((a) => (
                    <SelectItem key={a} value={String(a)}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <NovoColaboradorDialog
                onCreate={adicionarColaborador}
                colaboradores={colaboradores}
                open={!!novoColab}
                setOpen={(o) => setNovoColab(o ? ({} as EscalaColaborador) : null)}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  resetarDemo();
                  reload();
                  toast.success("Demo reiniciada.");
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Reset
              </Button>
            </div>
          }
        />

        {/* KPIs */}
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Colaboradores" value={colaboradores.length} />
          <Kpi label="Trabalhando hoje" value={trabalhandoHoje} tone="emerald" />
          <Kpi label="Em folga hoje" value={folgaHoje} tone="sky" />
          <Kpi
            label="Folgas comp. pendentes"
            value={totalCompPend}
            tone={totalCompPend ? "orange" : "default"}
          />
          <Kpi label="Domingos trabalhados" value={totalDomingos} />
          <Kpi
            label="Próx. do limite"
            value={proximosLimite + criticos}
            tone={criticos ? "red" : proximosLimite ? "amber" : "default"}
          />
        </div>

        {/* Legenda */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Legend cls={TIPO_CLASS.trabalho} label="Trabalho" />
          <Legend cls={TIPO_CLASS.folga} label="Folga semanal" />
          <Legend cls={TIPO_CLASS.compensatoria} label="Folga compensatória" />
          <Legend cls={TIPO_CLASS.feriado} label="Feriado" />
          <Legend cls="bg-red-500/20 text-red-700 border-red-500/40" label="Irregularidade" />
          <span className="ml-2">
            • Clique em um dia para alternar: Trabalho → Folga → Compensatória → Vazio
          </span>
        </div>

        {/* Calendário */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Calendário —{" "}
              {new Date(ano, mes - 1, 1).toLocaleString("pt-BR", {
                month: "long",
                year: "numeric",
              })}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-auto">
            <table className="w-full min-w-[1000px] border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-[240px] bg-card px-3 py-2 text-left font-medium">
                    Colaborador
                  </th>
                  {datas.map((d) => {
                    const dia = parseInt(d.slice(-2), 10);
                    const dom = isDomingo(d);
                    const nomeFeriado = nomesFeriados.get(d);
                    const ehFeriado = !!nomeFeriado;
                    return (
                      <th
                        key={d}
                        className={cn(
                          "w-9 px-1 py-2 text-center font-medium",
                          dom && "bg-red-500/10 text-red-600",
                          ehFeriado && "bg-violet-500/10 text-violet-700",
                        )}
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex flex-col items-center">
                              <div className="text-[10px] uppercase">
                                {new Date(d).toLocaleString("pt-BR", {
                                  weekday: "narrow",
                                })}
                              </div>
                              <div>{dia}</div>
                              {(dom || ehFeriado) && (
                                <div className="mt-0.5 h-1 w-1 rounded-full bg-current" />
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs">
                              {ehFeriado && (
                                <div className="font-medium text-violet-600">
                                  Feriado: {nomeFeriado}
                                </div>
                              )}
                              {dom && <div className="text-red-500">Domingo</div>}
                              {!dom && !ehFeriado && <div>Dia útil</div>}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </th>
                    );
                  })}
                  <th className="sticky right-0 z-10 min-w-[110px] bg-card px-2 py-2 text-center font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {colaboradores.map((c) => {
                  const st = statusMap.get(c.id);
                  return (
                    <tr key={c.id} className="border-t align-middle">
                      <td className="sticky left-0 z-10 h-12 bg-card px-3 py-2 align-middle">
                        <div className="flex items-center gap-2 font-medium text-foreground">
                          {c.nome}
                          {c.aceitaDomingo && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  variant="outline"
                                  className="gap-1 border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[10px] text-amber-700"
                                >
                                  <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
                                  Dom
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                Aceita horas extras aos domingos
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {c.matricula} · {c.cargo} · {c.setor}
                        </div>
                      </td>
                      {datas.map((d) => {
                        const dia = diasComFeriado.find(
                          (x) => x.colaboradorId === c.id && x.data === d,
                        );
                        const tipo: DiaTipo = dia?.tipo ?? "vazio";
                        const irregular =
                          st?.irregularidades.some(
                            (i) => i.data === d && i.level === "error",
                          ) ?? false;
                        return (
                          <td key={d} className="px-0.5 py-0.5">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => handleClickDia(c, d)}
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
                                  <div className="font-medium">{d}</div>
                                  <div>{TIPO_LABEL[tipo]}</div>
                                  {irregular && (
                                    <div className="text-red-500">
                                      Irregularidade detectada
                                    </div>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </td>
                        );
                      })}
                      <td className="sticky right-0 z-10 bg-card px-2 py-2 text-center">
                        <StatusBadge nivel={st?.alertNivel ?? "ok"} />
                        {st && st.compensatoriasPendentes > 0 && (
                          <button
                            onClick={() => sugerirComp(c)}
                            className="mt-1 inline-flex items-center gap-1 text-[10px] text-orange-600 hover:underline"
                          >
                            <Sparkles className="h-3 w-3" />
                            {st.compensatoriasPendentes} pend.
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Irregularidades */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Irregularidades e Alertas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {status.every((s) => s.irregularidades.length === 0) ? (
              <p className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle2 className="h-4 w-4" /> Nenhuma irregularidade no
                período.
              </p>
            ) : (
              <div className="space-y-2">
                {status.map((s) => {
                  if (!s.irregularidades.length) return null;
                  const colab = colaboradores.find(
                    (c) => c.id === s.colaboradorId,
                  )!;
                  return (
                    <div
                      key={s.colaboradorId}
                      className="rounded-md border bg-card/50 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{colab.nome}</div>
                          <div className="text-xs text-muted-foreground">
                            {colab.matricula} · {colab.setor}
                          </div>
                        </div>
                        <StatusBadge nivel={s.alertNivel} />
                      </div>
                      <ul className="mt-2 space-y-1 text-xs">
                        {s.irregularidades.map((i, k) => (
                          <li
                            key={k}
                            className={cn(
                              "flex items-start gap-2",
                              i.level === "error"
                                ? "text-red-600"
                                : i.level === "warn"
                                  ? "text-amber-600"
                                  : "text-muted-foreground",
                            )}
                          >
                            <span className="font-mono">{i.data}</span>
                            <span>{i.message}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
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
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className={cn("mt-1 text-2xl font-bold", toneCls)}>{value}</div>
      </CardContent>
    </Card>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
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
  if (nivel === "critico")
    return <Badge variant="destructive">Crítico</Badge>;
  if (nivel === "vermelho")
    return (
      <Badge className="bg-red-500/15 text-red-700 hover:bg-red-500/25">
        6 dias
      </Badge>
    );
  if (nivel === "amarelo")
    return (
      <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/25">
        5 dias
      </Badge>
    );
  return (
    <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25">
      OK
    </Badge>
  );
}

function NovoColaboradorDialog({
  open,
  setOpen,
  onCreate,
  colaboradores,
}: {
  open: boolean;
  setOpen: (o: boolean) => void;
  onCreate: (c: EscalaColaborador) => void;
  colaboradores: EscalaColaborador[];
}) {
  const [base, setBase] = useState<ColaboradorBase[]>([]);
  const [loadingBase, setLoadingBase] = useState(false);
  const [selectedBaseId, setSelectedBaseId] = useState<string>("");
  const [baseOpen, setBaseOpen] = useState(false);
  const selectedBase = base.find((b) => b.id === selectedBaseId) ?? null;
  const [form, setForm] = useState<Omit<EscalaColaborador, "id" | "matricula" | "escala">>({
    nome: "",
    cargo: "",
    setor: "",
    supervisor: "",
    admissao: toISODate(new Date()),
    aceitaDomingo: false,
  });

  useEffect(() => {
    if (!open) return;
    setLoadingBase(true);
    fetchColaboradoresBase()
      .then(setBase)
      .finally(() => setLoadingBase(false));
  }, [open]);

  const jaCadastrados = useMemo(
    () => new Set(colaboradores.map((c) => c.matricula)),
    [colaboradores],
  );

  function handleSelectBase(id: string) {
    setSelectedBaseId(id);
    const b = base.find((x) => x.id === id);
    if (!b) return;
    setForm((f) => ({
      ...f,
      nome: b.nome,
      cargo: b.cargo || f.cargo,
      setor: b.setor || f.setor,
      supervisor: b.supervisor || f.supervisor,
    }));
  }

  function submit() {
    if (!form.nome || !form.cargo || !form.setor) {
      toast.error("Selecione um colaborador e preencha cargo e setor.");
      return;
    }
    const b = base.find((x) => x.id === selectedBaseId);
    onCreate({
      ...form,
      id: b?.id ?? novoColaboradorId(),
      matricula: b?.matricula ?? novaMatricula(colaboradores),
      escala: "6x1",
    });
    toast.success("Colaborador cadastrado.");
    setOpen(false);
    setSelectedBaseId("");
    setForm({
      nome: "",
      cargo: "",
      setor: "",
      supervisor: "",
      admissao: toISODate(new Date()),
      aceitaDomingo: false,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        Novo colaborador
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cadastrar colaborador (6x1)</DialogTitle>
          <DialogDescription>
            Selecione um colaborador da base. Cargo, setor e supervisor são
            preenchidos automaticamente e podem ser ajustados.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Colaborador (base)" full>
            <Popover open={baseOpen} onOpenChange={setBaseOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={baseOpen}
                  className="w-full justify-between font-normal"
                >
                  {selectedBase ? (
                    <span className="truncate">
                      {selectedBase.nome}{" "}
                      <span className="text-muted-foreground">
                        · {selectedBase.matricula}
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {loadingBase ? "Carregando..." : "Buscar colaborador..."}
                    </span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[--radix-popover-trigger-width] p-0"
                align="start"
              >
                <Command
                  filter={(itemValue, search) =>
                    itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                  }
                >
                  <CommandInput placeholder="Buscar por nome ou matrícula..." />
                  <CommandList>
                    <CommandEmpty>
                      {loadingBase
                        ? "Carregando..."
                        : "Nenhum colaborador encontrado."}
                    </CommandEmpty>
                    <CommandGroup>
                      {base.map((b) => {
                        const ja = jaCadastrados.has(b.matricula);
                        return (
                          <CommandItem
                            key={b.id}
                            value={`${b.nome} ${b.matricula} ${b.cargo} ${b.setor}`}
                            disabled={ja}
                            onSelect={() => {
                              if (ja) return;
                              handleSelectBase(b.id);
                              setBaseOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedBaseId === b.id
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {b.nome}
                                {ja ? " (já cadastrado)" : ""}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {b.matricula}
                                {b.cargo ? ` · ${b.cargo}` : ""}
                                {b.setor ? ` · ${b.setor}` : ""}
                              </span>
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </Field>
          <Field label="Cargo">
            <Select
              value={form.cargo}
              onValueChange={(v) => setForm({ ...form, cargo: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o cargo" />
              </SelectTrigger>
              <SelectContent>
                {CARGOS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Setor / Área">
            <Select
              value={form.setor}
              onValueChange={(v) => setForm({ ...form, setor: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a área" />
              </SelectTrigger>
              <SelectContent>
                {AREAS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Supervisor">
            <Select
              value={form.supervisor}
              onValueChange={(v) => setForm({ ...form, supervisor: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o gestor" />
              </SelectTrigger>
              <SelectContent>
                {GESTORES.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Admissão">
            <Input
              type="date"
              value={form.admissao}
              onChange={(e) => setForm({ ...form, admissao: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-2 flex items-start justify-between gap-3 rounded-md border bg-muted/30 p-3">
            <div>
              <Label className="text-sm">Aceita horas extras aos domingos</Label>
              <p className="text-[11px] text-muted-foreground">
                Quando ativo, o colaborador pode ser escalado aos domingos e
                ganha automaticamente direito a 1 folga compensatória em até
                7 dias (CLT art. 67).
              </p>
            </div>
            <Switch
              checked={form.aceitaDomingo}
              onCheckedChange={(v) => setForm({ ...form, aceitaDomingo: v })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={submit}>Cadastrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={cn("grid gap-1.5", full && "sm:col-span-2")}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

// Suprime warning de variável não usada
void addDays;
