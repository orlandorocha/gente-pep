// @ts-nocheck
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
const TURNOS = ["Manhã", "Tarde", "Noite"] as const;
type Turno = (typeof TURNOS)[number];

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

type Atribuicao = {
  id: string;
  setor: string;
  cargo: string;
  turno: Turno;
};

type Row = {
  id?: string;
  nome: string;
  email: string;
  setor?: string | null; // Mantido para compatibilidade, agora deprecated
  turno?: string | null; // Mantido para compatibilidade, agora deprecated
  colaboradoresCount: number;
  atribuicoes?: Atribuicao[]; // Novo: múltiplas atribuições
  isNew?: boolean;
  isEditing?: boolean;
  draftNome?: string;
  draftEmail?: string;
  isManagingAtribuicoes?: boolean; // Novo: se está editando atribuições
};

export function GestoresModal({
  gestores,
  onChanged,
  onColaboradoresChanged,
}: {
  gestores: GestorRow[];
  onChanged: () => void;
  onColaboradoresChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [busca, setBusca] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [novoSetor, setNovoSetor] = useState<string>("");
  const [novoCargo, setNovoCargo] = useState<string>("");
  const [novoTurno, setNovoTurno] = useState<Turno | "">("");
  const [setoresDisponiveis, setSetoresDisponiveis] = useState<string[]>([]);
  const [cargosDisponiveis, setCargosDisponiveis] = useState<string[]>([]);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<Row | null>(null);
  
  // Novo: gerenciar atribuições
  const [managingGestorId, setManagingGestorId] = useState<string | null>(null);
  const [novaAtribuicaoSetor, setNovaAtribuicaoSetor] = useState<string>("");
  const [novaAtribuicaoCargo, setNovaAtribuicaoCargo] = useState<string>("");
  const [novaAtribuicaoTurno, setNovaAtribuicaoTurno] = useState<Turno | "">("");
  
  const runTest = useServerFn(testSmtp);

  async function refreshRows() {
    // Carrega gestores básicos
    const { data: all, error } = await supabase
      .from("gestores")
      .select("id, nome, email")
      .order("nome", { ascending: true });
    if (error) {
      toast.error(`Erro ao carregar gestores: ${error.message}`);
      return;
    }
    
    // Carrega atribuições (novo modelo)
    let atribuicoes: any[] = [];
    const { data: attr, error: attrError } = await supabase
      .from("gestor_atribuicoes")
      .select("*")
      .order("setor, cargo, turno");
    
    if (attrError) {
      // Verifica se é erro de tabela não encontrada
      if (attrError.message.includes("does not exist") || 
          attrError.message.includes("relation") ||
          attrError.message.includes("schema cache")) {
        console.warn("[v0] Tabela gestor_atribuicoes não existe ainda. Execute o script SQL no Supabase.");
        toast.warning(
          "⚠️ Tabela gestor_atribuicoes não foi criada. Veja o arquivo COMO_EXECUTAR_NO_SUPABASE.md"
        );
      } else {
        console.error("[v0] Erro ao carregar atribuições:", attrError);
      }
    } else {
      atribuicoes = attr ?? [];
    }
    
    // Monta mapa de atribuições por gestor
    const atribuicoesPorGestor = new Map<string, any[]>();
    for (const a of atribuicoes) {
      if (!atribuicoesPorGestor.has(a.gestor_id)) {
        atribuicoesPorGestor.set(a.gestor_id, []);
      }
      atribuicoesPorGestor.get(a.gestor_id)!.push(a);
    }
    
    // Carrega contagem de colaboradores vinculados
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
        setor: null, // Removido do gestor, agora em atribuições
        turno: null, // Removido do gestor, agora em atribuições
        colaboradoresCount: countMap.get(g.id) ?? 0,
        atribuicoes: atribuicoesPorGestor.get(g.id) ?? [],
      })),
    );
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      if (!cancelled) await refreshRows();
      const { data: colData } = await supabase
        .from("colaboradores")
        .select("cargo, area");
      if (cancelled) return;
      const cargoSet = new Set<string>();
      const setorSet = new Set<string>();
      for (const c of colData ?? []) {
        if (c.cargo && c.cargo.trim()) cargoSet.add(c.cargo.trim());
        if (c.area && c.area.trim()) setorSet.add(c.area.trim());
      }
      setCargosDisponiveis(
        Array.from(cargoSet).sort((a, b) => a.localeCompare(b, "pt-BR")),
      );
      setSetoresDisponiveis(
        Array.from(setorSet).sort((a, b) => a.localeCompare(b, "pt-BR")),
      );
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, gestores]);

  useEffect(() => {
    if (!open || !adding || !novoSetor || !novoCargo || !novoTurno) {
      setPreviewCount(null);
      return;
    }
    let cancelled = false;
    setPreviewBusy(true);
    (async () => {
      const { count } = await supabase
        .from("colaboradores")
        .select("id", { count: "exact", head: true })
        .eq("area", novoSetor)
        .eq("cargo", novoCargo)
        .eq("turno", novoTurno);
      if (cancelled) return;
      setPreviewCount(count ?? 0);
      setPreviewBusy(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, adding, novoSetor, novoCargo, novoTurno]);

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

    // Verifica se já existe um gestor com este nome ou email
    if (rows.some((r) => normalizeNome(r.nome) === normalizeNome(nome))) {
      return toast.error(`Já existe um gestor com o nome "${nome}"`);
    }
    if (rows.some((r) => r.email && normalizeEmail(r.email) === email)) {
      return toast.error(`O e-mail ${email} já pertence a outro gestor`);
    }

    setSavingId("__new__");
    try {
      // Cria o gestor sem setor/turno/cargo (agora são atribuições)
      const { data: inserted, error } = await supabase
        .from("gestores")
        .insert({ nome, email })
        .select("id")
        .single();
      if (error) throw error;

      // Se forneceu setor/cargo/turno, cria a atribuição
      let vinculados = 0;
      if (inserted?.id && novoSetor && novoCargo && novoTurno) {
        const setor = novoSetor.trim();
        const cargo = novoCargo.trim();
        const turno = novoTurno;

      // Cria atribuição
      const { error: attrErr } = await supabase
        .from("gestor_atribuicoes")
        .insert({ gestor_id: inserted.id, setor, cargo, turno });
      if (attrErr) {
        if (attrErr.message.includes("does not exist") || attrErr.message.includes("schema cache")) {
          throw new Error(
            "Tabela gestor_atribuicoes não existe. Execute o script SQL no Supabase (arquivo EXECUTE_NO_SUPABASE.sql)"
          );
        }
        throw attrErr;
      }

        // Busca e vincula colaboradores com essa combinação
        const { data: alvos, error: selErr } = await supabase
          .from("colaboradores")
          .select("id")
          .eq("area", setor)
          .eq("cargo", cargo)
          .eq("turno", turno);
        if (selErr) throw selErr;

        if (alvos && alvos.length > 0) {
          const ids = alvos.map((a) => a.id);
          const { error: linkErr } = await supabase
            .from("colaboradores")
            .update({ gestor_id: inserted.id })
            .in("id", ids);
          if (linkErr) throw linkErr;
          vinculados = ids.length;
        }

        toast.success(
          `Gestor ${nome} adicionado e vinculado a ${vinculados} colaborador${
            vinculados === 1 ? "" : "es"
          } (${setor} · ${cargo} · ${turno})`,
        );
      } else {
        toast.success(`Gestor ${nome} adicionado. Adicione atribuições depois.`);
      }

      setNovoNome("");
      setNovoEmail("");
      setNovoSetor("");
      setNovoCargo("");
      setNovoTurno("");
      setAdding(false);
      onChanged();
      if (vinculados > 0) onColaboradoresChanged?.();
      await refreshRows();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  async function adicionarAtribuicao(gestorId: string) {
    if (!novaAtribuicaoSetor || !novaAtribuicaoCargo || !novaAtribuicaoTurno) {
      return toast.error("Selecione setor, cargo e turno");
    }

    setSavingId(gestorId);
    try {
      const setor = novaAtribuicaoSetor;
      const cargo = novaAtribuicaoCargo;
      const turno = novaAtribuicaoTurno;

      // Verifica se já existe
      const gestor = rows.find((r) => r.id === gestorId);
      if (
        gestor?.atribuicoes?.some(
          (a) => a.setor === setor && a.cargo === cargo && a.turno === turno,
        )
      ) {
        return toast.error(
          `Já existe atribuição para ${setor} · ${cargo} · ${turno}`,
        );
      }

      // Cria atribuição
      const { error: attrErr } = await supabase
        .from("gestor_atribuicoes")
        .insert({ gestor_id: gestorId, setor, cargo, turno });
      if (attrErr) {
        if (attrErr.message.includes("does not exist") || attrErr.message.includes("schema cache")) {
          throw new Error(
            "Tabela gestor_atribuicoes não existe. Execute o script SQL no Supabase (arquivo EXECUTE_NO_SUPABASE.sql)"
          );
        }
        throw attrErr;
      }

      // Busca e vincula colaboradores
      const { data: alvos } = await supabase
        .from("colaboradores")
        .select("id")
        .eq("area", setor)
        .eq("cargo", cargo)
        .eq("turno", turno)
        .is("gestor_id", null); // Apenas não vinculados

      if (alvos && alvos.length > 0) {
        const ids = alvos.map((a) => a.id);
        await supabase
          .from("colaboradores")
          .update({ gestor_id: gestorId })
          .in("id", ids);
        onColaboradoresChanged?.();
      }

      toast.success(
        `Atribuição adicionada para ${setor} · ${cargo} · ${turno}`,
      );
      setNovaAtribuicaoSetor("");
      setNovaAtribuicaoCargo("");
      setNovaAtribuicaoTurno("");
      setManagingGestorId(null);
      onChanged();
      await refreshRows();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  async function removerAtribuicao(gestorId: string, atribuicaoId: string) {
    setSavingId(gestorId);
    try {
      const { error } = await supabase
        .from("gestor_atribuicoes")
        .delete()
        .eq("id", atribuicaoId);
      if (error) throw error;

      toast.success("Atribuição removida");
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
      if (row.colaboradoresCount > 0) onColaboradoresChanged?.();
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
              Gerencie gestores, e-mails e múltiplas atribuições. Um gestor pode gerenciar
              vários processos (setor/cargo/turno) simultaneamente. Cada gestor recebe
              relatórios automáticos apenas dos colaboradores ligados a ele.
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
              <p className="mb-2 text-xs text-muted-foreground">
                Informe o nome do gestor (obrigatório). Opcionalmente, selecione setor,
                cargo e turno para vinculá-lo automaticamente. Você poderá adicionar mais
                atribuições depois clicando em "Atribuições".
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <Label htmlFor="novo-setor" className="text-xs">
                    Setor / Área <span className="text-muted-foreground">(opcional)</span>
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
                <div className="sm:col-span-2">
                  <Label htmlFor="novo-setor" className="text-xs">
                    Setor / Área <span className="text-destructive">*</span>
                  </Label>
                  <Select value={novoSetor} onValueChange={setNovoSetor}>
                    <SelectTrigger id="novo-setor">
                      <SelectValue placeholder="Selecione o setor" />
                    </SelectTrigger>
                    <SelectContent>
                      {setoresDisponiveis.length === 0 && (
                        <SelectItem value="__none__" disabled>
                          Nenhum setor cadastrado
                        </SelectItem>
                      )}
                      {setoresDisponiveis.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="novo-cargo" className="text-xs">
                    Cargo <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <Select value={novoCargo} onValueChange={setNovoCargo}>
                    <SelectTrigger id="novo-cargo">
                      <SelectValue placeholder="Selecione o cargo" />
                    </SelectTrigger>
                    <SelectContent>
                      {cargosDisponiveis.length === 0 && (
                        <SelectItem value="__none__" disabled>
                          Nenhum cargo cadastrado
                        </SelectItem>
                      )}
                      {cargosDisponiveis.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="novo-turno" className="text-xs">
                    Turno <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <Select
                    value={novoTurno}
                    onValueChange={(v) => setNovoTurno(v as Turno)}
                  >
                    <SelectTrigger id="novo-turno">
                      <SelectValue placeholder="Selecione o turno" />
                    </SelectTrigger>
                    <SelectContent>
                      {TURNOS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs">
                  {!novoSetor || !novoCargo || !novoTurno ? (
                    <span className="text-muted-foreground">
                      (opcional) Selecione setor, cargo e turno para vincular colaboradores
                      automaticamente ao criar o gestor. Você poderá adicionar mais atribuições
                      depois.
                    </span>
                  ) : previewBusy ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Verificando colaboradores...
                    </span>
                  ) : previewCount === 0 ? (
                    <span className="text-amber-600 dark:text-amber-400">
                      Nenhum colaborador encontrado para {novoSetor} ·{" "}
                      {novoCargo} · {novoTurno}.
                    </span>
                  ) : (
                    <span className="text-emerald-700 dark:text-emerald-400">
                      <strong>{previewCount}</strong> colaborador
                      {previewCount === 1 ? "" : "es"} de{" "}
                      <strong>{novoSetor}</strong> ·{" "}
                      <strong>{novoCargo}</strong> ·{" "}
                      <strong>{novoTurno}</strong> serão vinculados
                      automaticamente.
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={adicionar}
                  disabled={savingId === "__new__" || !novoNome.trim()}
                >
                  {savingId === "__new__" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span className="ml-1">
                    {novoSetor && novoCargo && novoTurno
                      ? "Adicionar e vincular"
                      : "Adicionar gestor"}
                  </span>
                </Button>
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
                          {r.atribuicoes && r.atribuicoes.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {r.atribuicoes.slice(0, 2).map((a) => (
                                <Badge key={a.id} variant="secondary" className="gap-1 text-xs">
                                  {a.setor} · {a.turno}
                                </Badge>
                              ))}
                              {r.atribuicoes.length > 2 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{r.atribuicoes.length - 2}
                                </Badge>
                              )}
                            </div>
                          )}
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
                            variant={managingGestorId === r.id ? "default" : "outline"}
                            onClick={() =>
                              setManagingGestorId(
                                managingGestorId === r.id ? null : r.id ?? null,
                              )
                            }
                            title="Gerenciar atribuições"
                          >
                            <UserCog className="h-4 w-4" />
                            <span className="ml-1 hidden sm:inline">Atribuições</span>
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

                  {managingGestorId === r.id && (
                    <div className="mt-3 rounded-md border border-dashed bg-muted/30 p-3">
                      <div className="mb-3">
                        <p className="mb-2 text-xs font-medium text-muted-foreground">
                          Atribuições: {r.atribuicoes?.length ?? 0} processo{" "}
                          {(r.atribuicoes?.length ?? 0) === 1 ? "" : "s"}
                        </p>
                        <div className="space-y-2">
                          {r.atribuicoes?.map((a) => (
                            <div
                              key={a.id}
                              className="flex items-center justify-between rounded-sm bg-background p-2 text-sm"
                            >
                              <span>
                                <strong>{a.setor}</strong> · {a.cargo} ·{" "}
                                <strong>{a.turno}</strong>
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => removerAtribuicao(r.id!, a.id)}
                                disabled={savingId === r.id}
                                className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <Separator className="my-2" />

                      <p className="mb-2 text-xs font-medium text-muted-foreground">
                        Adicionar nova atribuição
                      </p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <Select value={novaAtribuicaoSetor} onValueChange={setNovaAtribuicaoSetor}>
                          <SelectTrigger size="sm" className="h-8 text-xs">
                            <SelectValue placeholder="Setor" />
                          </SelectTrigger>
                          <SelectContent>
                            {setoresDisponiveis.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={novaAtribuicaoCargo} onValueChange={setNovaAtribuicaoCargo}>
                          <SelectTrigger size="sm" className="h-8 text-xs">
                            <SelectValue placeholder="Cargo" />
                          </SelectTrigger>
                          <SelectContent>
                            {cargosDisponiveis.map((c) => (
                              <SelectItem key={c} value={c}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={novaAtribuicaoTurno}
                          onValueChange={(v) => setNovaAtribuicaoTurno(v as Turno)}
                        >
                          <SelectTrigger size="sm" className="h-8 text-xs">
                            <SelectValue placeholder="Turno" />
                          </SelectTrigger>
                          <SelectContent>
                            {TURNOS.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => adicionarAtribuicao(r.id!)}
                        disabled={
                          savingId === r.id ||
                          !novaAtribuicaoSetor ||
                          !novaAtribuicaoCargo ||
                          !novaAtribuicaoTurno
                        }
                        className="mt-2 w-full"
                      >
                        {savingId === r.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                        <span className="ml-1">Adicionar atribuição</span>
                      </Button>
                    </div>
                  )}
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
                  Atenção: {confirmRemove.colaboradoresCount} colaborador(es) está(��o)
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
