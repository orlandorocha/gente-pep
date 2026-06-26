import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ensureAuthSessionReady, supabase } from "@/integrations/custom-supabase/client";
import { BrandLogo } from "@/components/BrandLogo";
import { toast } from "sonner";

const ADMIN_ACCESS_EMAIL = import.meta.env.VITE_ADMIN_ACCESS_EMAIL?.trim().toLowerCase() ?? "";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    await ensureAuthSessionReady();
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [gpid, setGpid] = useState("");
  const [password, setPassword] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [createAccessOpen, setCreateAccessOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const openCreateAccess = () => {
    setAdminEmail("");
    setCreateAccessOpen(true);
  };

  const confirmAdminEmail = () => {
    if (!ADMIN_ACCESS_EMAIL) {
      toast.error("E-mail admin não configurado no ambiente.");
      return;
    }

    if (adminEmail.trim().toLowerCase() !== ADMIN_ACCESS_EMAIL) {
      toast.error("E-mail admin inválido.");
      return;
    }

    setCreateAccessOpen(false);
    setMode("signup");
    toast.success("Validação concluída. Você já pode criar o acesso.");
  };

  const sendReset = async (targetEmail: string) => {
    if (!targetEmail) {
      toast.error("Informe o e-mail para receber o link de redefinição.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Enviamos um link de redefinição para seu e-mail.");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { gpid },
          },
        });
        if (error) {
          const m = error.message.toLowerCase();
          if (m.includes("already") || m.includes("registered") || m.includes("exists")) {
            toast.error("Este e-mail já está cadastrado. Faça login ou redefina a senha.", {
              action: { label: "Redefinir senha", onClick: () => sendReset(email) },
              duration: 8000,
            });
            setMode("login");
            return;
          }
          throw error;
        }
        // Se confirmação de e-mail estiver desativada, já vem sessão
        if (data.session) {
          toast.success("Conta criada! Redirecionando...");
          navigate({ to: "/dashboard" });
          return;
        }
        // Caso já exista (Supabase pode retornar user sem identities)
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          toast.error("Este e-mail já está cadastrado. Faça login ou redefina a senha.", {
            action: { label: "Redefinir senha", onClick: () => sendReset(email) },
            duration: 8000,
          });
          setMode("login");
          return;
        }
        toast.success("Conta criada! Verifique seu e-mail para confirmar.");
        setMode("login");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          const m = error.message.toLowerCase();
          if (m.includes("invalid login") || m.includes("invalid credentials")) {
            toast.error("E-mail ou senha incorretos.", {
              action: { label: "Redefinir senha", onClick: () => sendReset(email) },
              duration: 8000,
            });
            return;
          }
          if (m.includes("not confirmed") || m.includes("confirm")) {
            toast.error("E-mail ainda não confirmado. Verifique sua caixa de entrada.");
            return;
          }
          throw error;
        }
        toast.success("Bem-vindo ao Guardião de Gente");
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro inesperado";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-slate-50 lg:grid-cols-[minmax(0,1.1fr)_minmax(480px,0.9fr)]">
      <div
        className="hidden flex-col justify-between p-12 text-primary-foreground lg:flex xl:p-16"
        style={{ background: "var(--gradient-primary)" }}
      >
        <div className="flex items-center">
          <BrandLogo imageClassName="h-14 w-auto object-contain" alt="PepsiCo" />
        </div>
        <div className="space-y-4">
          <h1 className="text-4xl font-semibold leading-tight">
            Guardião de Gente.
          </h1>
          <p className="max-w-md text-base text-primary-foreground/85">
            Acompanhe absenteísmo, férias, licenças e tarefas operacionais com a clareza
            que liderança e RH precisam.
          </p>
        </div>
        <div className="text-xs text-primary-foreground/70">
          Plataforma interna · Acesso restrito a colaboradores autorizados
        </div>
      </div>

      <div className="flex items-center justify-center bg-background px-6 py-10 md:px-10 lg:px-14">
        <div className="w-full max-w-md">
          <div className="mb-8 flex justify-center lg:hidden">
            <BrandLogo imageClassName="h-14 w-auto object-contain" alt="PepsiCo" />
          </div>
          <Card className="w-full border border-slate-200/80 bg-white shadow-xl shadow-slate-200/50">
            <CardContent className="p-6 sm:p-8">
            <div className="mb-8 text-left">
              <h2 className="text-2xl font-semibold tracking-tight">
                {mode === "login" ? "Acesso corporativo" : "Criar acesso"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === "login"
                  ? "Entre com seu e-mail corporativo e gpid."
                  : "Cadastre-se com seu e-mail e GPID."}
              </p>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail corporativo</Label>
                <Input
                  id="email" type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nome@empresa.com"
                />
              </div>

              {mode === "signup" && (
                <div className="space-y-2">
                  <Label htmlFor="gpid">GPID / Matrícula</Label>
                  <Input
                    id="gpid" required value={gpid}
                    onChange={(e) => setGpid(e.target.value)}
                    placeholder="GP10234"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="password">Gpid</Label>
                <Input
                  id="password" type="password" required minLength={6}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === "login" ? "Entrar" : "Criar conta"}
              </Button>
            </form>

            <div className="mt-6 flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => {
                  if (mode === "login") {
                    openCreateAccess();
                    return;
                  }

                  setMode("login");
                }}
                className="text-primary hover:underline"
              >
                {mode === "login" ? "Criar acesso" : "Já tenho conta"}
              </button>
              <Link to="/recuperar" className="text-muted-foreground hover:text-foreground">
                Recuperar acesso
              </Link>
            </div>
            </CardContent>
          </Card>
        </div>

        <Dialog open={createAccessOpen} onOpenChange={setCreateAccessOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Validar criação de acesso</DialogTitle>
              <DialogDescription>
                Informe o e-mail administrador para liberar o formulário de cadastro.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="admin-email">E-mail admin</Label>
              <Input
                id="admin-email"
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@empresa.com"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateAccessOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" onClick={confirmAdminEmail}>
                Confirmar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
