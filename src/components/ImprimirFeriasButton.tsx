import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDateBr } from "@/lib/date";
import { toast } from "sonner";

type FeriasRow = {
  id: string;
  colaborador_id: string;
  inicio: string;
  fim: string;
  periodo_aquisitivo: string;
  status: "Pendente" | "Aprovada" | "Recusada" | "Em gozo" | "Concluída";
};

type Colaborador = {
  id: string;
  nome?: string | null;
  gpid?: string | null;
  area?: string | null;
  turno?: string | null;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function ImprimirFeriasButton({
  ferias,
  colabs,
}: {
  ferias: FeriasRow[];
  colabs: Colaborador[];
}) {
  const [open, setOpen] = useState(false);
  const [aquisitivo, setAquisitivo] = useState("all");
  const [status, setStatus] = useState("all");
  const [area, setArea] = useState("all");
  const [turno, setTurno] = useState("all");

  const colMap = useMemo(() => new Map(colabs.map((c) => [c.id, c])), [colabs]);

  const aquisitivos = useMemo(
    () =>
      Array.from(new Set(ferias.map((f) => f.periodo_aquisitivo).filter(Boolean))).sort(
        (a, b) => b.localeCompare(a),
      ),
    [ferias],
  );

  const areas = useMemo(
    () => Array.from(new Set(colabs.map((c) => c.area).filter(Boolean))).sort(),
    [colabs],
  );

  const turnos = useMemo(
    () => Array.from(new Set(colabs.map((c) => c.turno).filter(Boolean))).sort(),
    [colabs],
  );

  const registros = useMemo(() => {
    return ferias
      .filter((f) => aquisitivo === "all" || f.periodo_aquisitivo === aquisitivo)
      .filter((f) => status === "all" || f.status === status)
      .filter((f) => area === "all" || (colMap.get(f.colaborador_id)?.area ?? "") === area)
      .filter((f) => turno === "all" || (colMap.get(f.colaborador_id)?.turno ?? "") === turno)
      .map((f) => ({ ...f, colaborador: colMap.get(f.colaborador_id) }))
      .sort((a, b) => {
        const areaA = a.colaborador?.area ?? "";
        const areaB = b.colaborador?.area ?? "";
        if (areaA !== areaB) return areaA.localeCompare(areaB);
        return (a.colaborador?.nome ?? "").localeCompare(b.colaborador?.nome ?? "");
      });
  }, [ferias, aquisitivo, status, area, turno, colMap]);

  function imprimir() {
    if (registros.length === 0) {
      toast.error("Nenhum registro de férias para o filtro selecionado.");
      return;
    }

    const win = window.open("", "_blank", "width=1024,height=768");
    if (!win) {
      toast.error("Permita pop-ups para gerar a impressão.");
      return;
    }

    const tituloAquisitivo =
      aquisitivo === "all" ? "Todos os períodos aquisitivos" : `Aquisitivo ${aquisitivo}`;
    const tituloStatus = status === "all" ? "Todos os status" : status;
    const tituloArea = area === "all" ? "Todas as áreas" : area;
    const tituloTurno = turno === "all" ? "Todos os turnos" : turno;
    const emitidoEm = new Date().toLocaleString("pt-BR");

    const linhas = registros
      .map(
        (r) => `
          <tr>
            <td>${escapeHtml(r.colaborador?.nome ?? "—")}</td>
            <td>${escapeHtml(r.colaborador?.gpid ?? "—")}</td>
            <td>${escapeHtml(r.colaborador?.area ?? "—")}</td>
            <td>${escapeHtml(r.colaborador?.turno ?? "—")}</td>
            <td>${escapeHtml(formatDateBr(r.inicio))} – ${escapeHtml(formatDateBr(r.fim))}</td>
            <td>${escapeHtml(r.periodo_aquisitivo)}</td>
            <td>${escapeHtml(r.status)}</td>
          </tr>`,
      )
      .join("");

    win.document.write(`<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Relatório de Férias — ${escapeHtml(tituloAquisitivo)}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 32px; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      .meta { font-size: 12px; color: #555; margin-bottom: 16px; }
      .meta strong { color: #111; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
      thead th { background: #f1f1f1; }
      tbody tr:nth-child(even) { background: #fafafa; }
      .total { margin-top: 12px; font-size: 12px; color: #555; }
      @media print { body { margin: 12mm; } }
    </style>
  </head>
  <body>
    <h1>Relatório de Férias</h1>
    <div class="meta">
      <div><strong>Período aquisitivo:</strong> ${escapeHtml(tituloAquisitivo)}</div>
      <div><strong>Status:</strong> ${escapeHtml(tituloStatus)}</div>
      <div><strong>Área:</strong> ${escapeHtml(tituloArea)}</div>
      <div><strong>Turno:</strong> ${escapeHtml(tituloTurno)}</div>
      <div><strong>Emitido em:</strong> ${escapeHtml(emitidoEm)}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Colaborador</th>
          <th>GPID</th>
          <th>Área</th>
          <th>Turno</th>
          <th>Período de férias</th>
          <th>Aquisitivo</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>
    <div class="total">Total de registros: ${registros.length}</div>
    <script>
      window.onload = function () {
        window.focus();
        window.print();
      };
    </script>
  </body>
</html>`);
    win.document.close();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Printer className="mr-1 h-3.5 w-3.5" />
          Imprimir
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Imprimir férias</DialogTitle>
          <DialogDescription>Escolha o período aquisitivo a ser impresso.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Período aquisitivo</Label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={aquisitivo}
              onChange={(e) => setAquisitivo(e.target.value)}
            >
              <option value="all">Todos</option>
              {aquisitivos.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">Todos</option>
              {(["Pendente", "Aprovada", "Recusada", "Em gozo", "Concluída"] as const).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Área</Label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={area}
              onChange={(e) => setArea(e.target.value)}
            >
              <option value="all">Todas</option>
              {areas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Turno</Label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={turno}
              onChange={(e) => setTurno(e.target.value)}
            >
              <option value="all">Todos</option>
              {turnos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            {registros.length} registro{registros.length === 1 ? "" : "s"} no filtro atual.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={imprimir}>
            <Printer className="mr-1 h-3.5 w-3.5" />
            Gerar impressão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
