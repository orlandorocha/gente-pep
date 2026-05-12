import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, UserCog, Send } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/custom-supabase/client";
import { GESTORES } from "@/data/gestores";
import { testSmtp } from "@/lib/smtp-test.functions";
import type { GestorRow } from "@/hooks/useData";

function normalizeGestorNome(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function normalizeGestorEmail(value: string) {
  return value.trim().toLowerCase();
}

function buildGestorFallbackEmail(nome: string) {
  return `${normalizeGestorNome(nome).replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "") || "gestor"}@guardiao-gente.local`;
}

export function GestoresModal({
  gestores, onChanged,
}: { gestores: GestorRow[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<{ nome: string; email: string; id?: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const runTest = useServerFn(testSmtp);

  async function testar(email: string) {
    if (!email) { toast.error("Informe um e-mail antes de testar"); return; }
    setTesting(email);
    try {
      const r = await runTest({ data: { to: email } });
      if (r.ok) {
        if (r.previewMode && r.previewFile) {
          toast.success(`Preview de e-mail gerado para ${email}`, { description: r.previewFile });
        } else {
          toast.success(`SMTP OK — enviado para ${email}`);
        }
      }
      else toast.error(`SMTP falhou: ${r.error}`);
    } catch (e: any) { toast.error(String(e?.message ?? e)); }
    setTesting(null);
  }

  useEffect(() => {
    if (!open) return;
    // Pré-popula com os 5 gestores oficiais, preservando os já cadastrados
    const map = new Map(gestores.map((g) => [normalizeGestorNome(g.nome), g]));
    setRows(GESTORES.map((nome) => {
      const g = map.get(normalizeGestorNome(nome));
      return { nome, email: g?.email ?? "", id: g?.id };
    }));
  }, [open, gestores]);

  async function salvar() {
    setBusy(true);
    try {
      const preparedRows = rows.map((row) => ({
        ...row,
        nome: row.nome.trim(),
        email: normalizeGestorEmail(row.email) || buildGestorFallbackEmail(row.nome),
      }));

      const usedEmails = new Map<string, string>();
      for (const row of preparedRows) {
        if (!row.email) continue;
        const owner = usedEmails.get(row.email);
        if (owner) {
          throw new Error(`O e-mail ${row.email} já foi informado para ${owner}. Use um e-mail diferente para ${row.nome}.`);
        }
        usedEmails.set(row.email, row.nome);
      }

      const { data: existingGestores, error: existingError } = await supabase
        .from("gestores")
        .select("id, nome, email");
      if (existingError) throw existingError;

      const gestoresById = new Map(existingGestores.map((gestor) => [gestor.id, gestor]));
      const gestoresByNome = new Map(existingGestores.map((gestor) => [normalizeGestorNome(gestor.nome), gestor]));
      const gestoresByEmail = new Map(
        existingGestores
          .filter((gestor) => gestor.email)
          .map((gestor) => [normalizeGestorEmail(gestor.email), gestor]),
      );

      for (const row of preparedRows) {
        if (!row.email) continue;

        const currentById = row.id ? gestoresById.get(row.id) : undefined;
        const currentByNome = gestoresByNome.get(normalizeGestorNome(row.nome));
        const currentByEmail = gestoresByEmail.get(row.email);
        const target = currentById ?? currentByNome ?? currentByEmail;

        if (currentByEmail && target && currentByEmail.id !== target.id && normalizeGestorNome(currentByEmail.nome) !== normalizeGestorNome(row.nome)) {
          throw new Error(`O e-mail ${row.email} já está cadastrado para ${currentByEmail.nome}.`);
        }

        if (target) {
          const { error } = await supabase
            .from("gestores")
            .update({ nome: row.nome, email: row.email })
            .eq("id", target.id);
          if (error) throw error;

          const nextTarget = { ...target, nome: row.nome, email: row.email };
          gestoresById.set(nextTarget.id, nextTarget);
          gestoresByNome.set(normalizeGestorNome(nextTarget.nome), nextTarget);
          gestoresByEmail.set(nextTarget.email, nextTarget);
          continue;
        }

        const { data: inserted, error } = await supabase
          .from("gestores")
          .insert({ nome: row.nome, email: row.email })
          .select("id, nome, email")
          .single();
        if (error) throw error;

        gestoresById.set(inserted.id, inserted);
        gestoresByNome.set(normalizeGestorNome(inserted.nome), inserted);
        gestoresByEmail.set(inserted.email, inserted);
      }
      toast.success("Gestores salvos");
      onChanged();
      setOpen(false);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }

  async function remover(id?: string) {
    if (!id) return;
    if (!confirm("Remover gestor?")) return;
    const { error } = await supabase.from("gestores").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removido");
    onChanged();
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, id: undefined, email: "" } : r));
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <UserCog className="h-4 w-4 mr-1" /> Gestores
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cadastrar gestores e emails</DialogTitle>
            <DialogDescription>
              Atualize os emails dos gestores responsáveis pelos colaboradores de cada turno. Cada gestor recebe somente o relatório dos colaboradores vinculados a ele no turno cadastrado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {rows.map((r, i) => (
              <div key={r.nome} className="grid grid-cols-[1fr_1.4fr_auto_auto] items-end gap-2">
                <div><Label className="text-xs">Nome</Label><Input value={r.nome} disabled /></div>
                <div>
                  <Label className="text-xs">E-mail</Label>
                  <Input
                    type="email" placeholder="email@empresa.com"
                    value={r.email}
                    onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, email: e.target.value } : x))}
                  />
                </div>
                <Button variant="outline" size="icon" title="Testar SMTP" onClick={() => testar(r.email)} disabled={testing === r.email}>
                  <Send className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => remover(r.id)} disabled={!r.id}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={busy}>{busy ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
