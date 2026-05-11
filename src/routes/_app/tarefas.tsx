import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useColaboradores, useTable } from "@/hooks/useData";
import { supabase } from "@/integrations/custom-supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/tarefas")({ component: TarefasPage });

type TarefaRow = {
  id: string; titulo: string; responsavel_id: string | null; prazo: string | null;
  prioridade: string; status: "A fazer" | "Em andamento" | "Concluída"; descricao: string | null;
};
const COLUNAS: TarefaRow["status"][] = ["A fazer","Em andamento","Concluída"];

function TarefasPage() {
  const { data: colabs } = useColaboradores();
  const { data: tarefas, reload } = useTable<TarefaRow>("tarefas", "created_at", false);
  const colMap = new Map(colabs.map((c) => [c.id, c]));
  const [editing, setEditing] = useState<TarefaRow | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader title="Tarefas" description="Pendências operacionais do time"
        actions={<FormSheet triggerLabel="Nova tarefa" title="Nova tarefa">
          {(close) => <TarefaForm colabs={colabs} onSaved={() => { reload(); close(); }} />}
        </FormSheet>} />
      <div className="grid gap-4 md:grid-cols-3">
        {COLUNAS.map((col) => {
          const items = tarefas.filter((t) => t.status === col);
          return (
            <Card key={col}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>{col}</span><Badge variant="secondary">{items.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {items.map((t) => {
                  const r = t.responsavel_id ? colMap.get(t.responsavel_id) : null;
                  return (
                    <div key={t.id} className="rounded-md border bg-card p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium">{t.titulo}</div>
                        <RowActions table="tarefas" id={t.id} label="tarefa" onChanged={reload} onEdit={() => setEditing(t)} />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{r?.nome ?? "—"}</span>
                        <span className="font-mono">{t.prazo ?? ""}</span>
                      </div>
                      <div className="mt-2">
                        <Badge variant={t.prioridade === "Alta" ? "destructive" : t.prioridade === "Média" ? "default" : "secondary"}>{t.prioridade}</Badge>
                      </div>
                    </div>
                  );
                })}
                {items.length === 0 && <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">Sem tarefas</div>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <EditSheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title="Editar tarefa">
        {(close) => editing && (
          <TarefaForm colabs={colabs} initial={editing} onSaved={() => { reload(); setEditing(null); close(); }} />
        )}
      </EditSheet>
    </div>
  );
}

function TarefaForm({ colabs, onSaved, initial }: { colabs: any[]; onSaved: () => void; initial?: TarefaRow }) {
  const [titulo, setTitulo] = useState(initial?.titulo ?? "");
  const [descricao, setDesc] = useState(initial?.descricao ?? "");
  const [responsavelId, setResp] = useState(initial?.responsavel_id ?? "");
  const [prazo, setPrazo] = useState(initial?.prazo ?? "");
  const [prioridade, setPrio] = useState(initial?.prioridade ?? "Média");
  const [status, setStatus] = useState(initial?.status ?? "A fazer");
  const [submitting, setSubmitting] = useState(false);

  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      if (!titulo) { toast.error("Informe um título"); return; }
      setSubmitting(true);
      const payload = {
        titulo, descricao,
        responsavel_id: responsavelId || null,
        prazo: prazo || null,
        prioridade: prioridade as any,
        status: status as any,
      };
      const { error } = initial
        ? await supabase.from("tarefas").update(payload).eq("id", initial.id)
        : await supabase.from("tarefas").insert(payload);
      setSubmitting(false);
      if (error) { toast.error(error.message); return; }
      toast.success(initial ? "Tarefa atualizada" : "Tarefa criada");
      onSaved();
    }}>
      <div className="space-y-2"><Label>Título</Label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} required /></div>
      <div className="space-y-2"><Label>Descrição</Label><Textarea value={descricao ?? ""} onChange={(e) => setDesc(e.target.value)} /></div>
      <ColaboradorSelect value={responsavelId} onChange={setResp} colaboradores={colabs} label="Responsável" />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label>Prazo</Label><Input type="date" value={prazo ?? ""} onChange={(e) => setPrazo(e.target.value)} /></div>
        <div className="space-y-2"><Label>Prioridade</Label>
          <Select value={prioridade} onValueChange={setPrio}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["Baixa","Média","Alta"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2"><Label>Status</Label>
        <Select value={status} onValueChange={(v) => setStatus(v as any)}><SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{COLUNAS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <SheetFooter className="mt-6">
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Salvando..." : initial ? "Salvar alterações" : "Criar tarefa"}
        </Button>
      </SheetFooter>
    </form>
  );
}
