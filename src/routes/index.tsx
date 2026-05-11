import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { ensureAuthSessionReady, supabase } from "@/integrations/custom-supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    await ensureAuthSessionReady();
    const { data } = await supabase.auth.getSession();
    throw redirect({ to: data.session ? "/dashboard" : "/login" });
  },
  pendingMs: 0,
  pendingComponent: RedirectingHome,
  component: RedirectingHome,
});

function RedirectingHome() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">Inicializando acesso</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Estamos verificando sua sessao para encaminhar voce para a tela correta.
        </p>
        <div className="mt-6">
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir para login
          </Link>
        </div>
      </div>
    </div>
  );
}
