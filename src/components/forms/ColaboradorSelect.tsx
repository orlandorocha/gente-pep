import { useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import type { ColaboradorRow } from "@/hooks/useData";

export type CollaboratorOption = {
  id: string;
  nome: string;
  matricula: string;
  gpid?: string;
  area?: string;
};

export function ColaboradorSelect({
  value, onChange, colaboradores, label = "Colaborador",
}: {
  value: string;
  onChange: (v: string) => void;
  colaboradores: CollaboratorOption[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const sel = colaboradores.find((c) => c.id === value);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            {sel ? (
              <span className="truncate">
                {sel.nome} <span className="text-muted-foreground">· {sel.gpid}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">Selecione...</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command
            filter={(itemValue, search) =>
              itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
            }
          >
            <CommandInput placeholder="Buscar por nome, matrícula, GPID ou área..." />
            <CommandList>
              <CommandEmpty>Nenhum colaborador encontrado.</CommandEmpty>
              <CommandGroup>
                {colaboradores.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.nome} ${c.matricula} ${c.gpid ?? ""} ${c.area ?? ""}`}
                    onSelect={() => { onChange(c.id); setOpen(false); }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === c.id ? "opacity-100" : "opacity-0")} />
                    <div className="flex flex-col">
                      <span className="font-medium">{c.nome}</span>
                      <span className="text-xs text-muted-foreground">
                        {c.gpid ? `GPID ${c.gpid}` : `Matrícula ${c.matricula}`}
                        {c.area ? ` · ${c.area}` : ""}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
