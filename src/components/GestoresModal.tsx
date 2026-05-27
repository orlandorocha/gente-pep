import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertCircle,
  CheckCircle2,
  Edit3,
  Loader2,
  Mail,
  Plus,
  Save,
  Search,
  Send,
  Trash2,
  Users,
  UserCog,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/custom-supabase/client";
import { testSmtp } from "@/lib/smtp-test.functions";
import type { GestorRow } from "@/hooks/useData";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FALLBACK_DOMAIN = "@guardiao-gente.local";

function normalizeNome(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR");
}
function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}
function buildFallbackEmail(nome: string) {
  const slug = normalizeNome(nome).replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
  return `${slug || "gestor"}${FALLBACK_DOMAIN}`;
}
function isFallbackEmail(email?: string | null) {
  if (!email) return false;
  return normalizeEmail(email).endsWith(FALLBACK_DOMAIN);
}

type Row = {
  id?: string;
  nome: string;
  email: string;
  colaboradoresCount: number;
  isNew?: boolean;
  isEditing?: boolean;
  draftNome?: string;
  draftEmail?: string;
};

export function GestoresModal({
  gestores,
  onChanged,
}: {
  gestores: GestorRow[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [busca, setBusca] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<Row | null>(null);
  const runTest = useServerFn(testSmtp);

  async function refreshRows() {
    const { data: all, error } = await supabase
      .from("gestores")
      .select("id, nome, email")
      .order("nome", { ascending: true });
    if (error) {
      toast.error(`Erro ao carregar gestores: ${error.message}`);
      return;
    }
    const { data: counts } = await supabase
      .from("colaboradores")
      .select("gestor_id");
    const countMap = new Map<string, number>();
    for (const c of counts ?? []) {
      if (!c.gestor_id) continue;
      countMap.set(c.gestor_id, (countMap.get(c.gestor_id) ?? 0) + 1);
    }
    setRows(
      (all ?? []).map((g) => ({
        id: g.id,
        nome: g.nome,
        email: isFallbackEmail(g.email) ? "" : g.email ?? "",
        colaboradoresCount: countMap.get(g.id) ?? 0,
      })),
    );
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      if (!cancelled) await refreshRows();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, gestores]);

  const filteredRows = useMemo(() => {
    if (!busca.trim()) return rows;
    const term = busca.trim().toLowerCase();
    return rows.filter(
      (r) =>
        r.nome.toLowerCase().includes(term) ||
        r.email.toLowerCase().includes(term),
    );
  }, [rows, busca]);

  const totalComEmail = useMemo(
    () => rows.filter((r) => r.email && EMAIL_REGEX.test(r.email)).length,
    [rows],
  );
  const totalVinculados = useMemo(
    () => rows.reduce((acc, r) => acc + r.colaboradoresCount, 0),
    [rows],
  );

  function startEdit(row: Row) {
    setRows((rs) =>
      rs.map((r) =>
        r.id === row.id
          ? { ...r, isEditing: true, draftNome: r.nome, draftEmail: r.email }
          : r,
      ),
    );
  }
  function cancelEdit(row: Row) {
    setRows((rs) =>
      rs.map((r) =>
        r.id === row.id
          ? { ...r, isEditing: false, draftNome: undefined, draftEmail: undefined }
          : r,
      ),
    );
  }
  function updateDraft(id: string | undefined, patch: Partial<Row>) {
    if (!id) return;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function testar(email: string) {
    if (!email) return toast.error("Informe um e-mail antes de testar");
    if (!EMAIL_REGEX.test(email)) return toast.error("E-mail inválido");
    setTesting(email);
    try {
      const r = await runTest({ data: { to: email } });
      if (r.ok) {
        if (r.previewMode && r.previewFile) {
          toast.success(`Preview gerado para ${email}`, { description: r.previewFile });
        } else {
          toast.success(`SMTP OK — enviado para ${email}`);
        }
      } else {
        toast.error(`SMTP falhou: ${r.error}`);
      }
    } catch (e) {
      toast.error(String((e as Error)?.message ?? e));
    }
    setTesting(null);
  }

  async function salvarRow(row: Row) {
    if (!row.id) return;
    const nome = (row.draftNome ?? row.nome).trim();
    const emailRaw = (row.draftEmail ?? row.email).trim();
    if (!nome) return toast.error("Nome do gestor é obrigatório");
    if (emailRaw && !EMAIL_REGEX.test(emailRaw))
      return toast.error("E-mail inválido");

    const email = emailRaw ? normalizeEmail(emailRaw) : buildFallbackEmail(nome);

    setSavingId(row.id);
    try {
      const conflito = rows.find(
        (r) =>
          r.id !== row.id &&
          (normalizeNome(r.nome) === normalizeNome(nome) ||
            (r.email && normalizeEmail(r.email) === email)),
      );
      if (conflito) {
        if (normalizeNome(conflito.nome) === normalizeNome(nome)) {
          throw new Error(`Já existe um gestor com o nome "${nome}"`);
        }
        throw new Error(`O e-mail ${email} já pertence a ${conflito.nome}`);
      }

      const { error } = await supabase
        .from("gestores")
        .update({ nome, email })
        .eq("id", row.id);
      if (error) throw error;

      toast.success(`Gestor ${nome} atualizado`);
      onChanged();
      await refreshRows();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  async function adicionar() {
    const nome = novoNome.trim();
    const emailRaw = novoEmail.trim();
    if (!nome) return toast.error("Informe o nome do gestor");
    if (emailRaw && !EMAIL_REGEX.test(emailRaw)) return toast.error("E-mail inválido");

    const email = emailRaw ? normalizeEmail(emailRaw) : buildFallbackEmail(nome);

    if (rows.some((r) => normalizeNome(r.nome) === normalizeNome(nome))) {
      return toast.error(`Já existe um gestor com o nome "${nome}"`);
    }
    if (rows.some((r) => r.email && normalizeEmail(r.email) === email)) {
      return toast.error(`O e-mail ${email} já está em uso`);
    }

    setSavingId("__new__");
    try {
      const { error } = await supabase.from("gestores").insert({ nome, email });
      if (error) throw error;
      toast.success(`Gestor ${nome} adicionado`);
      setNovoNome("");
      setNovoEmail("");
      setAdding(false);
      onChanged();
      await refreshRows();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  async function remover(row: Row) {
    if (!row.id) return;
    setSavingId(row.id);
    try {
      if (row.colaboradoresCount > 0) {
        const { error: unlinkErr } = await supabase
          .from("colaboradores")
          .update({ gestor_id: null })
          .eq("gestor_id", row.id);
        if (unlinkErr) throw unlinkErr;
      }
      const { error } = await supabase.from("gestores").delete().eq("id", row.id);
      if (error) throw error;
      toast.success(`Gestor ${row.nome} removido`);
      setConfirmRemove(null);
      onChanged();
      await refreshRows();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <UserCog className="h-4 w-4 mr-1" /> Gestores
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5 text-primary" />
              Cadastro de gestores
            </DialogTitle>
            <DialogDescription>
              Gerencie gestores, e-mails e vínculos. Cada gestor recebe relatórios
              automáticos apenas dos colaboradores ligados a ele.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Gestores</div>
                <div className="font-semibold">{rows.length}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Com e-mail</div>
                <div className="font-semibold">
                  {totalComEmail}
                  <span className="text-muted-foreground"> / {rows.length}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Colaboradores vinculados</div>
                <div className="font-semibold">{totalVinculados}</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou e-mail..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button
              size="sm"
              onClick={() => setAdding((v) => !v)}
              variant={adding ? "outline" : "default"}
            >
              {adding ? (
                <>
                  <X className="h-4 w-4 mr-1" /> Cancelar
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-1" /> Novo gestor
                </>
              )}
            </Button>
          </div>

          {adding && (
            <div className="rounded-md border border-dashed bg-muted/20 p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <div>
                  <Label htmlFor="novo-nome" className="text-xs">
                    Nome
                  </Label>
                  <Input
                    id="novo-nome"
                    placeholder="Nome do gestor"
                    value={novoNome}
                    onChange={(e) => setNovoNome(e.target.value.toUpperCase())}
                  />
                </div>
                <div>
                  <Label htmlFor="novo-email" className="text-xs">
                    E-mail (opcional)
                  </Label>
                  <Input
                    id="novo-email"
                    type="email"
                    placeholder="email@empresa.com"
                    value={novoEmail}
                    onChange={(e) => setNovoEmail(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    size="sm"
                    onClick={adicionar}
                    disabled={savingId === "__new__" || !novoNome.trim()}
                    className="w-full sm:w-auto"
                  >
                    {savingId === "__new__" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    <span className="ml-1">Adicionar</span>
                  </Button>
                </div>
              </div>
            </div>
          )}

          <Separator />

          <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
            {filteredRows.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {rows.length === 0
                  ? "Nenhum gestor cadastrado. Clique em 'Novo gestor' para começar."
                  : "Nenhum gestor encontrado para a busca."}
              </p>
            )}
            {filteredRows.map((r) => {
              const editing = !!r.isEditing;
              const currentEmail = editing ? r.draftEmail ?? "" : r.email;
              const emailValido = currentEmail && EMAIL_REGEX.test(currentEmail);
              const semEmail = !currentEmail;
              return (
                <div
                  key={r.id ?? r.nome}
                  className="rounded-md border bg-card p-3 transition-colors hover:bg-muted/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {editing ? (
                        <Input
                          value={r.draftNome ?? ""}
                          onChange={(e) =>
                            updateDraft(r.id, { draftNome: e.target.value.toUpperCase() })
                          }
                          className="font-medium"
                          placeholder="Nome do gestor"
                        />
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium break-words">{r.nome}</span>
                          {emailValido ? (
                            <Badge variant="secondary" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Ativo
                            </Badge>
                          ) : semEmail ? (
                            <Badge variant="outline" className="gap-1">
                              <AlertCircle className="h-3 w-3" /> Sem e-mail
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1">
                              <AlertCircle className="h-3 w-3" /> E-mail inválido
                            </Badge>
                          )}
                          <Badge variant="outline" className="gap-1">
                            <Users className="h-3 w-3" />
                            {r.colaboradoresCount} colaborador
                            {r.colaboradoresCount === 1 ? "" : "es"}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                    <div>
                      <Label htmlFor={`email-${r.id}`} className="text-xs">
                        E-mail corporativo
                      </Label>
                      <Input
                        id={`email-${r.id}`}
                        type="email"
                        placeholder="email@empresa.com"
                        value={editing ? r.draftEmail ?? "" : r.email}
                        readOnly={!editing}
                        onChange={(e) => updateDraft(r.id, { draftEmail: e.target.value })}
                        className={editing ? "" : "bg-muted/40"}
                      />
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      {editing ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => salvarRow(r)}
                            disabled={savingId === r.id}
                          >
                            {savingId === r.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4" />
                            )}
                            <span className="ml-1">Salvar</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => cancelEdit(r)}
                            disabled={savingId === r.id}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => testar(r.email)}
                            disabled={testing === r.email || !r.email}
                            title="Testar envio de e-mail"
                          >
                            {testing === r.email ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                            <span className="ml-1 hidden sm:inline">Testar</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => startEdit(r)}
                            title="Editar gestor"
                          >
                            <Edit3 className="h-4 w-4" />
                            <span className="ml-1 hidden sm:inline">Editar</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmRemove(r)}
                            title="Remover gestor"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="ml-1 hidden sm:inline">Remover</span>
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmRemove}
        onOpenChange={(o) => !o && setConfirmRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover gestor</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover{" "}
              <span className="font-medium text-foreground">
                {confirmRemove?.nome}
              </span>
              ?
              {confirmRemove && confirmRemove.colaboradoresCount > 0 && (
                <span className="mt-2 block text-destructive">
                  Atenção: {confirmRemove.colaboradoresCount} colaborador(es) está(ão)
                  vinculado(s) a este gestor. Eles ficarão sem gestor após a remoção.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingId === confirmRemove?.id}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmRemove && remover(confirmRemove)}
              disabled={savingId === confirmRemove?.id}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {savingId === confirmRemove?.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              <span className="ml-1">Remover</span>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
