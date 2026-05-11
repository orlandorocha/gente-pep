import { useState, type ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/custom-supabase/client";
import { toast } from "sonner";

type Props = {
  table: string;
  id: string;
  onChanged: () => void;
  onEdit?: () => void;
  label?: string;
  /** Render extra actions (icons) before edit/delete. */
  extra?: ReactNode;
};

export function RowActions({ table, id, onChanged, onEdit, label = "registro", extra }: Props) {
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex items-center justify-end gap-1">
      {extra}
      {onEdit && (
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit} title="Editar">
          <Pencil className="h-4 w-4" />
        </Button>
      )}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" title="Excluir">
            <Trash2 className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                setBusy(true);
                const { error } = await supabase.from(table as any).delete().eq("id", id);
                setBusy(false);
                if (error) { toast.error(error.message); return; }
                toast.success("Excluído");
                onChanged();
              }}
            >
              {busy ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
