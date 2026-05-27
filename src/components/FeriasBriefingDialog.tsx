import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CalendarRange, Plane } from "lucide-react";
import { supabase } from "@/integrations/custom-supabase/client";
import { formatDateBr } from "@/lib/date";
import { formatLocalDateISO } from "@/lib/utils";
import type { User } from "@supabase/supabase-js";

type Colab = {
  id: string;
  nome: string;
  area: string;
  turno: string;
  gpid: string;
  email: string | null;
};

type FeriasItem = {
  id: string;
  inicio: string;
  fim: string;
  status: string;
  colaborador_id: string;
  colaboradores: Colab | null;
};

const STORAGE_KEY = "ferias-briefing:lastShown";

function parseISO(d: string) { return new Date(d + "T12:00:00"); }
function diffDays(a: Date, b: Date) { return Math.round((a.getTime() - b.getTime()) / 86400000); }

export function FeriasBriefingDialog({ user }: { user: User | null }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [me, setMe] = useState<Colab | null>(null);
  const [items, setItems] = useState<FeriasItem[]>([]);

  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    const today = formatLocalDateISO();
    const last = window.sessionStorage.getItem(STORAGE_KEY);
    if (last === today) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Identifica o colaborador logado pelo e-mail ou GPID dos metadados
        const gpid = (user.user_metadata as { gpid?: string } | undefined)?.gpid;
        let meRow: Colab | null = null;

        if (gpid) {
          const { data } = await supabase
            .from("colaboradores")
            .select("id, nome, area, turno, gpid, email")
            .eq("gpid", gpid)
            .maybeSingle();
          meRow = (data as Colab | null) ?? null;
        }
        if (!meRow && user.email) {
          const { data } = await supabase
            .from("colaboradores")
            .select("id, nome, area, turno, gpid, email")
            .ilike("email", user.email)
            .maybeSingle();
          meRow = (data as Colab | null) ?? null;
        }

        if (!meRow) {
          // Sem vínculo de colaborador: marca como visto e não exibe
          window.sessionStorage.setItem(STORAGE_KEY, today);
          return;
        }

        const hoje = formatLocalDateISO();
        const { data: ferias } = await supabase
          .from("ferias")
          .select("id, inicio, fim, status, colaborador_id, colaboradores:colaboradores!inner(id, nome, area, turno, gpid, email)")
          .lte("inicio", hoje)
          .gte("fim", hoje)
          .in("status", ["Em gozo", "Aprovada"])
          .eq("colaboradores.area", meRow.area)
          .eq("colaboradores.turno", meRow.turno);

        if (cancelled) return;

        const list = ((ferias as unknown as FeriasItem[]) ?? []).filter(
          (item) => item.colaborador_id !== meRow!.id,
        );

        setMe(meRow);
        setItems(list);

        if (list.length > 0) {
          setOpen(true);
        }
        window.sessionStorage.setItem(STORAGE_KEY, today);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  const grupos = useMemo(() => {
    const map = new Map<string, FeriasItem[]>();
    for (const it of items) {
      const key = it.colaboradores?.turno ?? "Sem turno";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  if (loading || !me) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plane className="h-5 w-5 text-primary" />
            Briefing de férias do setor
          </DialogTitle>
          <DialogDescription>
            Olá, <span className="font-medium text-foreground">{me.nome}</span>. Hoje, {items.length}{" "}
            colega(s) da sua área <span className="font-medium text-foreground">{me.area}</span> · turno{" "}
            <span className="font-medium text-foreground">{me.turno}</span> estão em férias.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          {grupos.map(([turno, lista]) => (
            <div key={turno} className="space-y-2">
              <div className="flex items-center gap-2">
                <CalendarRange className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-semibold">Turno {turno}</h4>
                <Badge variant="secondary" className="ml-auto">{lista.length}</Badge>
              </div>
              <div className="space-y-2">
                {lista.map((v) => {
                  const ini = parseISO(v.inicio);
                  const fim = parseISO(v.fim);
                  const today = parseISO(formatLocalDateISO());
                  const total = Math.max(1, diffDays(fim, ini) + 1);
                  const passados = Math.min(total, Math.max(0, diffDays(today, ini) + 1));
                  const restantes = Math.max(0, diffDays(fim, today));
                  const pct = Math.round((passados / total) * 100);
                  const c = v.colaboradores!;
                  return (
                    <div key={v.id} className="rounded-md border bg-card p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          <div className="font-medium">{c.nome}</div>
                          <div className="text-xs text-muted-foreground">GPID {c.gpid}</div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {restantes === 0 ? "Encerra hoje" : `${restantes} dia${restantes > 1 ? "s" : ""} restante${restantes > 1 ? "s" : ""}`}
                        </div>
                      </div>
                      <div className="mt-3 space-y-1">
                        <Progress value={pct} className="h-2" />
                        <div className="flex justify-between text-[11px] font-mono text-muted-foreground">
                          <span>{formatDateBr(v.inicio)}</span>
                          <span>Dia {passados} de {total} · {pct}%</span>
                          <span>{formatDateBr(v.fim)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Entendi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
