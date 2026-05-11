import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/acesso-negado")({
  component: () => (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-semibold">Acesso negado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Você não tem permissão para acessar esta área. Entre em contato com seu gestor ou com o RH.
        </p>
        <Button asChild className="mt-6"><Link to="/login">Voltar ao login</Link></Button>
      </div>
    </div>
  ),
});
