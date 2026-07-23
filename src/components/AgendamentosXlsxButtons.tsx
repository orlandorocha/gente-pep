import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/custom-supabase/client";
import { downloadXlsx, findColaborador, readXlsxRows, toISODate, processarComResiencia } from "@/lib/xlsx-utils";

type AgendamentoTipo = "De bem com a vida" | "Aniversário" | "Hora Extra";
type AgendamentoStatus = "Agendado" | "Realizado" | "Cancelado";
type Prioridade = "Baixa" | "Média" | "Alta";

type Colab = { id: string; nome: string; gpid: string; area?: string | null };
type Agendamento = {
  id: string;
  colaborador_id: string;
  tipo: AgendamentoTipo;
  titulo: string;
  data: string;
  hora: string;
  prioridade: Prioridade;
  status: AgendamentoStatus;
  observacao: string | null;
};

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function normalizeToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeTipo(value: unknown): AgendamentoTipo | null {
  const normalized = normalizeToken(String(value ?? ""));
  if (!normalized) return null;
  if (
    normalized === "de bem com a vida"
    || normalized === "de bem com vida"
    || normalized === "de bem c a vida"
  ) return "De bem com a vida";
  if (normalized === "aniversario" || normalized === "aniversariante") return "Aniversário";
  if (
    normalized === "hora extra"
    || normalized === "folga de hora extra"
    || normalized === "folga hora extra"
    || normalized === "horaextra"
  ) return "Hora Extra";
  return null;
}

function normalizePrioridade(value: unknown): Prioridade {
  const normalized = normalizeToken(String(value ?? ""));
  if (normalized === "alta") return "Alta";
  if (normalized === "baixa") return "Baixa";
  return "Média";
}

function normalizeStatus(value: unknown): AgendamentoStatus {
  const normalized = normalizeToken(String(value ?? ""));
  if (normalized === "realizado") return "Realizado";
  if (normalized === "cancelado") return "Cancelado";
  return "Agendado";
}

function normalizeTime(value: unknown): string {
  if (value instanceof Date) {
    const hours = String(value.getHours()).padStart(2, "0");
    const minutes = String(value.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const totalMinutes = Math.round(value * 24 * 60);
    const hours = String(Math.floor(totalMinutes / 60) % 24).padStart(2, "0");
    const minutes = String(totalMinutes % 60).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  const raw = String(value ?? "").trim();
  if (!raw) return "09:00";
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    const hours = String(Math.min(23, Number(match[1]))).padStart(2, "0");
    const minutes = String(Math.min(59, Number(match[2]))).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  return "09:00";
}

function rowKey(row: Pick<Agendamento, "colaborador_id" | "tipo" | "data" | "hora">) {
  return [
    row.colaborador_id,
    row.tipo,
    row.data,
    row.hora.slice(0, 5),
  ].join("|");
}

export function ImportAgendamentosButton({
  colabs,
  agendamentos,
  onDone,
}: {
  colabs: Colab[];
  agendamentos: Agendamento[];
  onDone: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [errorRows, setErrorRows] = useState<string[]>([]);
  const [showErrorDialog, setShowErrorDialog] = useState(false);

  async function handle(file: File) {
    setBusy(true);
    try {
      const rows = await readXlsxRows(file);
      const inserts: Array<{
        colaborador_id: string;
        tipo: AgendamentoTipo;
        titulo: string;
        data: string;
        hora: string | null;
        prioridade: AgendamentoPrioridade;
        status: AgendamentoStatus;
        observacao: string | null;
      }> = [];

      const existingKeys = new Set(agendamentos.map((item) => rowKey(item)));

      for (const [index, row] of rows.entries()) {
        const line = index + 2;
        const colaboradorRef = String(
          row.colaborador_id ?? row.colaborador ?? row.Colaborador ?? row.GPID ?? row.gpid ?? "",
        ).trim();
        const colaborador = findColaborador(colabs, colaboradorRef);
        if (!colaborador) {
          erros.push(`Linha ${line}: colaborador "${colaboradorRef}" não encontrado`);
          continue;
        }

        const tipo = normalizeTipo(row.tipo ?? row["Tipo"] ?? row["tipo_agendamento"]);
        if (!tipo) {
          erros.push(`Linha ${line}: tipo de agendamento inválido`);
          continue;
        }

        const data = toISODate(row.data ?? row.Data);
        if (!data) {
          erros.push(`Linha ${line}: data inválida`);
          continue;
        }

        const titulo = String(row.titulo ?? row.Título ?? row.Titulo ?? "").trim() || tipo;
        const hora = normalizeTime(row.hora ?? row.Hora);
        const prioridade = normalizePrioridade(row.prioridade ?? row.Prioridade);
        const status = normalizeStatus(row.status ?? row.Status);
        const observacao = String(row.observacao ?? row.Observação ?? row.Observacao ?? "").trim() || null;

        const key = rowKey({ colaborador_id: colaborador.id, tipo, data, hora });
        if (existingKeys.has(key)) {
          erros.push(`Linha ${line}: agendamento já existe para ${colaborador.nome}`);
          continue;
        }

        existingKeys.add(key);
        inserts.push({
          colaborador_id: colaborador.id,
          tipo,
          titulo,
          data,
          hora,
          prioridade,
          status,
          observacao,
        });
      }

      // Processa cada agendamento individualmente com tratamento resiliente de erros
      const resultado = await processarComResiencia(
        inserts,
        async (agendamento) => {
          const { error } = await supabase.from("agendamentos").insert(agendamento);
          if (error) throw new Error(error.message);
        }
      );

      const ok = resultado.ok;
      const todosErros = [...erros, ...resultado.erros];

      if (ok) toast.success(`${ok} agendamentos importados. ${todosErros.length} erros.`);
      else toast.error(`Nenhum agendamento importado. ${todosErros.length} erros.`);
      if (todosErros.length) {
        console.warn("Importação agendamentos — erros:", todosErros);
        setErrorRows(todosErros);
        setShowErrorDialog(true);
      } else {
        setErrorRows([]);
        setShowErrorDialog(false);
      }
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <>
      <input
        ref={ref}
        type="file"
        accept=".xlsx"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handle(file);
          e.target.value = "";
        }}
      />
      <Dialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Erros na importação de agendamentos</DialogTitle>
            <DialogDescription>
              Apenas os colaboradores com falha na importação são exibidos abaixo. Revise e tente novamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto rounded-md border border-secondary p-4 text-sm">
            {errorRows.length ? (
              errorRows.map((error, index) => (
                <div key={index} className="break-words">{error}</div>
              ))
            ) : (
              <div>Nenhum erro registrado.</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowErrorDialog(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => ref.current?.click()}>
        <Upload className="mr-1 h-4 w-4" />
        {busy ? "Importando..." : "Importar XLSX"}
      </Button>
    </>
  );
}

export function ExportAgendamentosButton({
  agendamentos,
  colabs,
  tipo,
}: {
  agendamentos: Agendamento[];
  colabs: Colab[];
  tipo: string;
}) {
  const colMap = new Map(colabs.map((colab) => [colab.id, colab]));

  function exportar() {
    const rows = agendamentos.map((item) => {
      const colaborador = colMap.get(item.colaborador_id);
      return {
        Data: item.data,
        Hora: item.hora.slice(0, 5),
        Colaborador: colaborador?.nome ?? "—",
        GPID: colaborador?.gpid ?? "—",
        Área: colaborador?.area ?? "—",
        Tipo: item.tipo,
        Título: item.titulo,
        Prioridade: item.prioridade,
        Status: item.status,
        Observação: item.observacao ?? "",
      };
    });

    const suffix = tipo && tipo !== "all" ? `-${normalizeToken(tipo).replace(/\s+/g, "-")}` : "";
    downloadXlsx(rows, "Agendamentos", `agendamentos${suffix}.xlsx`);
    toast.success(`${rows.length} agendamento(s) exportado(s)`);
  }

  return (
    <Button variant="outline" size="sm" onClick={exportar} disabled={agendamentos.length === 0}>
      <Download className="mr-1 h-4 w-4" />
      Exportar XLSX
    </Button>
  );
}
