import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import {
  loadColaboradores,
  loadDias,
  loadFeriados,
  removerColaborador,
  saveColaboradores,
  subscribeEscala,
} from "@/lib/escala-store";
import { avaliarMes } from "@/lib/escala-engine";
import type { EscalaColaborador } from "@/lib/escala-types";
import { AREAS } from "@/data/areas";
import { CARGOS } from "@/data/cargos";
import { GESTORES } from "@/data/gestores";

export const Route = createFileRoute("/_app/folgas")({
  head: () => ({
    meta: [
      { title: "Relatório de Folgas 6x1" },
      {
        name: "description",
        content:
          "Relatórios mensais de folgas, domingos trabalhados e folgas compensatórias.",
      },
    ],
  }),
  component: FolgasPage,
});

function FolgasPage() {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);
  useEffect(() => subscribeEscala(reload), []);

  const [editColab, setEditColab] = useState<EscalaColaborador | null>(null);
  const [delColab, setDelColab] = useState<EscalaColaborador | null>(null);

  const colaboradores = useMemo(() => loadColaboradores(), [version]);
  const dias = useMemo(() => loadDias(), [version]);
  const feriados = useMemo(() => new Set(loadFeriados()), [version]);

  const diasComFeriado = useMemo(() => {
    const arr = [...dias];
    for (const f of feriados) {
      for (const c of colaboradores) {
        const i = arr.findIndex(
          (x) => x.colaboradorId === c.id && x.data === f,
        );
        if (i >= 0) arr[i] = { ...arr[i], tipo: "feriado" };
        else arr.push({ colaboradorId: c.id, data: f, tipo: "feriado" });
      }
    }
    return arr;
  }, [dias, feriados, colaboradores]);

  const { status } = useMemo(
    () => avaliarMes(colaboradores, diasComFeriado, ano, mes),
    [colaboradores, diasComFeriado, ano, mes],
  );

  const linhas = colaboradores.map((c) => {
    const s = status.find((x) => x.colaboradorId === c.id)!;
    return {
      Matrícula: c.matricula,
      Nome: c.nome,
      Cargo: c.cargo,
      Setor: c.setor,
      Supervisor: c.supervisor,
      "Aceita domingo": c.aceitaDomingo ? "Sim" : "Não",
      "Dias trabalhados": s.diasTrabalhadosMes,
      "Folgas semanais": s.folgasSemanaisMes,
      "Domingos trabalhados": s.domingosTrabalhadosMes,
      "Folgas comp. pendentes": s.compensatoriasPendentes,
      "Prazo próx. comp.": s.proximoVencimentoCompensatoria ?? "—",
      "Horas totais": s.totalHorasMes.toFixed(1),
      Status: s.alertNivel,
    };
  });

  function exportarExcel() {
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Escala ${mes}-${ano}`);
    XLSX.writeFile(wb, `relatorio-escala-${ano}-${mes}.xlsx`);
  }

  function exportarPDF() {
    const html = `
      <html><head><title>Relatório de Escala ${mes}/${ano}</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:24px;color:#0f172a}
        h1{font-size:20px;margin:0 0 4px}
        .sub{color:#64748b;font-size:12px;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #e2e8f0;padding:6px 8px;text-align:left}
        th{background:#f1f5f9}
      </style></head><body>
      <h1>Relatório Mensal — Escala 6x1</h1>
      <div class="sub">Período: ${String(mes).padStart(2, "0")}/${ano}</div>
      <table>
        <thead><tr>${Object.keys(linhas[0] ?? {})
          .map((k) => `<th>${k}</th>`)
          .join("")}</tr></thead>
        <tbody>${linhas
          .map(
            (l) =>
              `<tr>${Object.values(l)
                .map((v) => `<td>${v}</td>`)
                .join("")}</tr>`,
          )
          .join("")}</tbody>
      </table>
      <script>window.onload=()=>window.print();</script>
      </body></html>
    `;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  }

  function salvarEdicao(atualizado: EscalaColaborador) {
    const next = colaboradores.map((c) =>
      c.id === atualizado.id ? atualizado : c,
    );
    saveColaboradores(next);
    setEditColab(null);
    reload();
    toast.success("Colaborador atualizado. Alterações refletidas nas Escalas 6x1.");
  }

  function confirmarExclusao() {
    if (!delColab) return;
    removerColaborador(delColab.id);
    toast.success(
      `${delColab.nome} removido das Escalas 6x1 e dos Relatórios de Folgas.`,
    );
    setDelColab(null);
    reload();
  }

  const irreg = status.filter((s) => s.irregularidades.length > 0);
  const pend = status.filter((s) => s.compensatoriasPendentes > 0);
  const proximos = status.filter(
    (s) => s.alertNivel === "amarelo" || s.alertNivel === "vermelho",
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios de Folgas"
        description="Indicadores mensais, irregularidades e exportação."
        actions={
          <div className="flex items-center gap-2">
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
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
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
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
            <Button variant="outline" size="sm" onClick={exportarExcel}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
            </Button>
            <Button size="sm" onClick={exportarPDF}>
              <Download className="mr-2 h-4 w-4" /> PDF
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Irregularidades</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{irreg.length}</div>
            <p className="text-xs text-muted-foreground">
              Colaboradores com programações inválidas.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Folgas comp. pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">
              {pend.reduce((a, s) => a + s.compensatoriasPendentes, 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {pend.length} colaboradores aguardando compensação.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Próximos do limite</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600">
              {proximos.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Atingiram 5 ou 6 dias consecutivos.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Relatório Mensal</CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Matrícula</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Setor</TableHead>
                <TableHead className="text-center">Dom.?</TableHead>
                <TableHead className="text-right">Trab.</TableHead>
                <TableHead className="text-right">Folgas</TableHead>
                <TableHead className="text-right">Dom.</TableHead>
                <TableHead className="text-right">Pend.</TableHead>
                <TableHead className="text-right">Horas</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {colaboradores.map((c) => {
                const s = status.find((x) => x.colaboradorId === c.id)!;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">
                      {c.matricula}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{c.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.cargo}
                      </div>
                    </TableCell>
                    <TableCell>{c.setor}</TableCell>
                    <TableCell className="text-center">
                      {c.aceitaDomingo ? (
                        <Badge className="bg-amber-500/15 text-amber-700">Sim</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Não
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.diasTrabalhadosMes}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.folgasSemanaisMes}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.domingosTrabalhadosMes}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.compensatoriasPendentes > 0 ? (
                        <div className="flex flex-col items-end">
                          <span className="font-semibold text-orange-600">
                            {s.compensatoriasPendentes}
                          </span>
                          {s.proximoVencimentoCompensatoria && (
                            <span className="text-[10px] text-muted-foreground">
                              até {s.proximoVencimentoCompensatoria}
                            </span>
                          )}
                        </div>
                      ) : (
                        0
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.totalHorasMes.toFixed(1)}
                    </TableCell>
                    <TableCell>
                      {s.alertNivel === "critico" ? (
                        <Badge variant="destructive">Crítico</Badge>
                      ) : s.alertNivel === "vermelho" ? (
                        <Badge className="bg-red-500/15 text-red-700">
                          6 dias
                        </Badge>
                      ) : s.alertNivel === "amarelo" ? (
                        <Badge className="bg-amber-500/15 text-amber-700">
                          5 dias
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-500/15 text-emerald-700">
                          OK
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setEditColab(c)}
                          aria-label={`Editar ${c.nome}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600 hover:text-red-700"
                          onClick={() => setDelColab(c)}
                          aria-label={`Excluir ${c.nome}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <EditarColaboradorDialog
        colab={editColab}
        onClose={() => setEditColab(null)}
        onSave={salvarEdicao}
      />

      <AlertDialog
        open={!!delColab}
        onOpenChange={(o) => !o && setDelColab(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir colaborador?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove <b>{delColab?.nome}</b> dos Relatórios de Folgas e
              também da Escala 6x1, apagando todos os dias programados. Não é
              possível desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarExclusao}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EditarColaboradorDialog({
  colab,
  onClose,
  onSave,
}: {
  colab: EscalaColaborador | null;
  onClose: () => void;
  onSave: (c: EscalaColaborador) => void;
}) {
  const [form, setForm] = useState<EscalaColaborador | null>(colab);

  useEffect(() => setForm(colab), [colab]);

  if (!form) return null;

  return (
    <Dialog open={!!colab} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar colaborador (6x1)</DialogTitle>
          <DialogDescription>
            As alterações são aplicadas imediatamente nas Escalas 6x1 e nos
            relatórios.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label className="text-xs">Nome</Label>
            <Input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Cargo</Label>
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
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Setor / Área</Label>
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
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label className="text-xs">Supervisor</Label>
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
          </div>
          <div className="sm:col-span-2 flex items-start justify-between gap-3 rounded-md border bg-muted/30 p-3">
            <div>
              <Label className="text-sm">Aceita horas extras aos domingos</Label>
              <p className="text-[11px] text-muted-foreground">
                Habilita escala aos domingos com folga compensatória automática.
              </p>
            </div>
            <Switch
              checked={form.aceitaDomingo}
              onCheckedChange={(v) => setForm({ ...form, aceitaDomingo: v })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => onSave(form)}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
