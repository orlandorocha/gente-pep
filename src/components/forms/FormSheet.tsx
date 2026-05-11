import { useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

type Props = {
  triggerLabel: string;
  title: string;
  children: (close: () => void) => ReactNode;
};

export function FormSheet({ triggerLabel, title, children }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" />{triggerLabel}</Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle>{title}</SheetTitle></SheetHeader>
        <div className="mt-6">{children(() => setOpen(false))}</div>
      </SheetContent>
    </Sheet>
  );
}

/** Controlled edit sheet (open externally), used together with RowActions edit button. */
export function EditSheet({
  open, onOpenChange, title, children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  children: (close: () => void) => ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle>{title}</SheetTitle></SheetHeader>
        <div className="mt-6">{children(() => onOpenChange(false))}</div>
      </SheetContent>
    </Sheet>
  );
}

export function FormFooter({ submitting, label = "Salvar" }: { submitting: boolean; label?: string }) {
  return (
    <SheetFooter className="mt-6">
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "Salvando..." : label}
      </Button>
    </SheetFooter>
  );
}
