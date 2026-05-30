import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useColaboradores, useGestores, type ColaboradorRow } from "@/hooks/useData";
import { supabase } from "@/integrations/custom-supabase/client";
import { CARGOS } from "@/data/cargos";
import { AREAS } from "@/data/areas";
import { RowActions } from "@/components/RowActions";
import { EditSheet } from "@/components/forms/FormSheet";
import { GestoresModal } from "@/components/GestoresModal";
import { ExportColaboradoresButton, ImportColaboradoresButton } from "@/components/ImportColaboradoresButton";
import { DataPagination, usePagination } from "@/components/DataPagination";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/colaboradores")({
  component: ColaboradoresPage,
});

function ColaboradoresPage() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ColaboradorRow | null>(null);
  const [areaFilter, setAreaFilter] = useState("all");
  const [turnoFilter, setTurnoFilter] = useState("all");
  const { data: colaboradores, reload } = useColaboradores();
  const gestores = useGestores();
  const reloadGestores = (gestores as any).reload as () => Promise<void>;
  const gestorMap = new Map(gestores.map((g) => [g.id, g.nome]));

  const areasDisponiveis = useMemo(
    () => Array.from(new Set(colaboradores.map((c) => c.area).filter(Boolean))).sort(),
    [colaboradores],
  );
  const turnosDisponiveis = useMemo(
    () => Array.from(new Set(colaboradores.map((c) => c.turno).filter(Boolean))).sort(),
    [colaboradores],
  );

  const list = colaboradores.filter((c) => {
    const matchesText = [c.nome, c.email, c.gpid, c.area, c.turno, c.cargo]
      .join(" ")
      .toLowerCase()
      .includes(q.toLowerCase());
    const matchesArea = areaFilter === "all" || c.area === areaFilter;
    const matchesTurno = turnoFilter === "all" || c.turno === turnoFilter;
    return matchesText && matchesArea && matchesTurno;
  });
  const { paged, page, setPage, pageSize, setPageSize, total, totalPages } = usePagination(list, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Colaboradores"
        description={`${colaboradores.length} cadastrados · ${colaboradores.filter(c=>c.status==="Ativo").length} ativos`}
        actions={
          <div className="flex items-center gap-2">
            <ImportColaboradoresButton gestores={gestores} onDone={reload} />
            <ExportColaboradoresButton colaboradores={list} area={areaFilter} turno={turnoFilter} />
            <GestoresModal
              gestores={gestores}
              onChanged={reloadGestores}
              onColaboradoresChanged={reload}
            />
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> Novo colaborador</Button>
              </SheetTrigger>
              <SheetContent className="sm:max-w-md overflow-y-auto">
                <SheetHeader><SheetTitle></SheetTitle></SheetHeader>
                <ColaboradorForm gestores={gestores} onSaved={() => { reload(); setOpen(false); }} />
              </SheetContent>
            </Sheet>
          </div>
        }
      />

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="relative min-w-[260px] flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome, GPID, área..." className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="w-[220px] space-y-2">
            <Label>Área</Label>
            <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
              <option value="all">Todas</option>
              {areasDisponiveis.map((area) => <option key={area} value={area}>{area}</option>)}
            </select>
          </div>
          <div className="w-[220px] space-y-2">
            <Label>Turno</Label>
            <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={turnoFilter} onChange={(e) => setTurnoFilter(e.target.value)}>
              <option value="all">Todos</option>
              {turnosDisponiveis.map((turno) => <option key={turno} value={turno}>{turno}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>GPID</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Área</TableHead>
                <TableHead>Turno</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Gestor</TableHead>
                <TableHead className="w-[100px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="font-medium">{c.nome}</div>
                    <div className="text-xs text-muted-foreground">{c.email}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{c.gpid}</TableCell>
                  <TableCell>{c.cargo}</TableCell>
                  <TableCell>{c.area}</TableCell>
                  <TableCell>{c.turno}</TableCell>
                  <TableCell>
                    <Badge variant={c.status === "Ativo" ? "default" : c.status === "Afastado" ? "secondary" : "outline"}>
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.gestor_id ? gestorMap.get(c.gestor_id) ?? "—" : "—"}
                  </TableCell>
                  <TableCell>
                    <RowActions
                      table="colaboradores"
                      id={c.id}
                      label="colaborador"
                      onChanged={reload}
                      onEdit={() => setEditing(c)}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {list.length === 0 && (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Nenhum colaborador encontrado.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <DataPagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} totalPages={totalPages} />
      </Card>

      <EditSheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title="Editar colaborador">
        {(close) => editing && (
          <ColaboradorForm
            gestores={gestores}
            initial={editing}
            onSaved={() => { reload(); setEditing(null); close(); }}
          />
        )}
      </EditSheet>
    </div>
  );
}

function ColaboradorForm({
  gestores, onSaved, initial,
}: {
  gestores: { id: string; nome: string }[];
  onSaved: () => void;
  initial?: ColaboradorRow;
}) {
  const [nome, setNome] = useState(initial?.nome ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [gpid, setGpid] = useState(initial?.gpid ?? "");
  const [cargo, setCargo] = useState<string>(initial?.cargo ?? CARGOS[0]);
  const [area, setArea] = useState<string>(initial?.area ?? AREAS[0]);
  const [turno, setTurno] = useState<string>(initial?.turno ?? "Manhã");
  const [status, setStatus] = useState<string>(initial?.status ?? "Ativo");
  const [gestorId, setGestorId] = useState<string>(initial?.gestor_id ?? "");
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      className="mt-2 space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSubmitting(true);
        const payload = {
          nome, email, gpid, cargo, area,
          turno: turno as any, status: status as any,
          gestor_id: gestorId || null,
        };
        const { error } = initial
          ? await supabase.from("colaboradores").update(payload).eq("id", initial.id)
          : await supabase.from("colaboradores").insert(payload);
        setSubmitting(false);
        if (error) { toast.error(error.message); return; }
        toast.success(initial ? "Colaborador atualizado" : "Colaborador cadastrado");
        onSaved();
      }}
    >
      <div className="space-y-2"><Label>Nome completo</Label><Input value={nome} onChange={(e)=>setNome(e.target.value)} required /></div>
      <div className="space-y-2"><Label>E-mail</Label><Input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label>GPID</Label><Input value={gpid} onChange={(e)=>setGpid(e.target.value)} required /></div>
        <div className="space-y-2">
          <Label>Cargo</Label>
          <Select value={cargo} onValueChange={setCargo}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CARGOS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Área</Label>
          <Select value={area} onValueChange={setArea}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {AREAS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Turno</Label>
          <Select value={turno} onValueChange={setTurno}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Manhã">Manhã</SelectItem>
              <SelectItem value="Tarde">Tarde</SelectItem>
              <SelectItem value="Noite">Noite</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Ativo">Ativo</SelectItem>
              <SelectItem value="Afastado">Afastado</SelectItem>
              <SelectItem value="Inativo">Inativo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Gestor direto</Label>
          <Select value={gestorId} onValueChange={setGestorId}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              {gestores.map((g) => <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <SheetFooter className="mt-6">
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Salvando..." : initial ? "Salvar alterações" : "Cadastrar"}
        </Button>
      </SheetFooter>
    </form>
  );
}
