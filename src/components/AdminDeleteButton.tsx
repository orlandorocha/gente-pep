import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { deleteAllRecords } from "@/lib/admin-delete.functions";

interface AdminDeleteButtonProps {
  tableName: string;
  label?: string;
  description?: string;
  variant?: "outline" | "destructive" | "default" | "secondary" | "ghost" | "link";
}

export function AdminDeleteButton({
  tableName,
  label = "Deletar Todos",
  description = "Esta ação não pode ser desfeita",
  variant = "destructive",
}: AdminDeleteButtonProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);

  const adminEmail = import.meta.env.VITE_ADMIN_ACCESS_EMAIL;
  const isAdmin = user?.email === adminEmail;

  // Envolver a função server com useServerFn
  const deleteRecords = useServerFn(deleteAllRecords);

  if (!isAdmin) {
    return null;
  }

  async function handleDeleteAll() {
    if (confirmText.toLowerCase() !== "deletar") {
      toast.error('Digite "deletar" para confirmar');
      return;
    }

    if (!user?.email) {
      toast.error("Usuário não autenticado");
      return;
    }

    setLoading(true);
    try {
      const result = await deleteRecords({
        tableName: tableName as any,
        adminEmail: user.email,
      });

      toast.success(`${result.deletedCount} registros de "${tableName}" foram deletados!`);
      setOpen(false);
      setConfirmText("");
      
      // Recarregar a página para refletir as mudanças
      window.location.reload();
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error("[v0] Erro ao deletar registros:", errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant={variant}
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2"
        title="Apenas Admin pode deletar todos os registros"
      >
        <Trash2 className="h-4 w-4" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Deletar Todos os Registros
            </DialogTitle>
            <DialogDescription>
              Tabela: <span className="font-mono font-semibold text-foreground">{tableName}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-lg bg-destructive/10 p-3">
              <p className="text-sm text-destructive font-medium">
                ⚠️ AVISO: Esta ação não pode ser desfeita!
              </p>
              <p className="text-sm text-destructive/80 mt-1">
                {description}
              </p>
            </div>

            <div>
              <label htmlFor="confirm" className="text-sm font-medium">
                Digite <span className="font-mono bg-muted px-2 py-1 rounded">deletar</span> para
                confirmar:
              </label>
              <input
                id="confirm"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder='Digite "deletar"'
                className="w-full mt-2 px-3 py-2 border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-destructive"
                disabled={loading}
              />
            </div>

            <div className="text-sm text-muted-foreground space-y-1">
              <p>📊 Serão deletados todos os registros de:</p>
              <p className="font-mono text-foreground">- {tableName}</p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAll}
              disabled={confirmText.toLowerCase() !== "deletar" || loading}
              className="gap-2"
            >
              {loading ? "Deletando..." : "Deletar Todos"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
