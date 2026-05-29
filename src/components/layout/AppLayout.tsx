import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Button } from "@/components/ui/button";
import { LogOut, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/custom-supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { sincronizarFaltasDoDia } from "@/lib/sync.functions";
import { formatLocalDateISO } from "@/lib/utils";
import { FeriasBriefingDialog } from "@/components/FeriasBriefingDialog";

const titles: Record<string, { title: string; sub: string }> = {
  "/dashboard": { title: "Dashboard executivo", sub: "Visão consolidada de pessoas e operação" },
  "/colaboradores": { title: "Colaboradores", sub: "Cadastro e gestão de pessoas" },
  "/faltas": { title: "Faltas e absenteísmo", sub: "Registro e análise de ausências" },
  "/ferias": { title: "Férias", sub: "Planejamento e acompanhamento" },
  "/licencas": { title: "Licenças", sub: "Afastamentos e licenças ativas" },
  "/agendamentos": { title: "Agendamentos", sub: "Compromissos e acompanhamentos" },
  "/alertas": { title: "Alertas", sub: "Sinais críticos da operação" },
  "/tarefas": { title: "Tarefas", sub: "Pendências operacionais do time" },
};

export function AppLayout() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const { user } = useAuth();
  const sincronizar = useServerFn(sincronizarFaltasDoDia);
  const syncStartedRef = useRef(false);
  const lastSyncedDayRef = useRef<string | null>(null);
  const syncTimerRef = useRef<number | null>(null);
  const syncIntervalRef = useRef<number | null>(null);
  const meta = titles[path] ?? { title: "Guardião de Gente", sub: "" };

  const initials = (user?.email ?? "U").slice(0, 2).toUpperCase();
  const gpid = (user?.user_metadata as { gpid?: string } | undefined)?.gpid;

  useEffect(() => {
    if (!user || typeof window === "undefined") return;

    const syncForDay = async (day: string) => {
      const storageKey = `faltas-sync:${day}`;
      if (window.sessionStorage.getItem(storageKey) === "done") {
        lastSyncedDayRef.current = day;
        return;
      }
      if (syncStartedRef.current) return;
      syncStartedRef.current = true;

      try {
        await sincronizar();
        window.sessionStorage.setItem(storageKey, "done");
        lastSyncedDayRef.current = day;
      } catch {
        lastSyncedDayRef.current = null;
      } finally {
        syncStartedRef.current = false;
      }
    };

    const scheduleNextSync = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 0);
      const timeout = nextMidnight.getTime() - now.getTime();
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = window.setTimeout(async () => {
        const nextDay = formatLocalDateISO();
        await syncForDay(nextDay);
        scheduleNextSync();
      }, timeout);
    };

    const checkDateChange = () => {
      const today = formatLocalDateISO();
      if (lastSyncedDayRef.current !== today) {
        void syncForDay(today);
      }
    };

    const today = formatLocalDateISO();
    void syncForDay(today);
    scheduleNextSync();
    if (syncIntervalRef.current) window.clearInterval(syncIntervalRef.current);
    syncIntervalRef.current = window.setInterval(checkDateChange, 5 * 60 * 1000);

    return () => {
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
      if (syncIntervalRef.current) window.clearInterval(syncIntervalRef.current);
    };
  }, [sincronizar, user]);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b bg-card/80 px-4 backdrop-blur md:px-6">
            <SidebarTrigger />
            <div className="hidden flex-col md:flex">
              <h1 className="text-sm font-semibold leading-none">{meta.title}</h1>
              <p className="mt-1 text-xs text-muted-foreground">{meta.sub}</p>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <div className="relative hidden md:block">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar colaborador, GPID..."
                  className="h-9 w-72 pl-8"
                />
              </div>
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {initials}
                </div>
                <div className="hidden text-xs leading-tight md:block">
                  <div className="font-medium">{user?.email}</div>
                  {gpid && <div className="text-muted-foreground">GPID {gpid}</div>}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate({ to: "/login" });
                }}
                title="Sair"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>
      <FeriasBriefingDialog user={user} />
    </SidebarProvider>
  );
}
