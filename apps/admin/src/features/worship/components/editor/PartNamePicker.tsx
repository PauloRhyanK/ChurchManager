import { Check, Plus } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MAX_PART_NAME, type DerivedPart, type PartKind } from "../../lib/document";
import { plain } from "../../lib/format";
import { choiceFromText, partNameOptions, type PartChoice } from "../../lib/part-names";

interface PartNamePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nome atual da parte. */
  name: string;
  kind: PartKind;
  /** Todas as partes da música, para sugerir os nomes que já existem. */
  parts: DerivedPart[];
  onPick: (choice: PartChoice) => void;
  /** O rótulo clicável. */
  children: ReactNode;
}

/** Campo com sugestões para renomear uma parte: escolhe um nome existente, um tipo ou cria um novo. */
export function PartNamePicker({ open, onOpenChange, name, kind, parts, onPick, children }: PartNamePickerProps) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const { existing, types } = partNameOptions(parts);
  const typed = query.replace(/\s+/g, " ").trim();
  const known = [...existing, ...types].some((o) => plain(o.label) === plain(typed));
  const pick = (choice: PartChoice | null, label: string) => {
    onOpenChange(false);
    if (choice && plain(label) !== plain(name)) onPick(choice);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput
            aria-label={`Novo nome para ${name}`}
            placeholder={name}
            value={query}
            maxLength={MAX_PART_NAME}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandGroup heading="Nesta música">
              {existing.map((o) => (
                <CommandItem key={o.label} value={o.label} onSelect={() => pick(o.choice, o.label)}>
                  <Check className={`mr-2 h-4 w-4 ${plain(o.label) === plain(name) ? "opacity-100" : "opacity-0"}`} aria-hidden="true" />
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
            {types.length > 0 && (
              <CommandGroup heading="Tipos">
                {types.map((o) => (
                  <CommandItem key={o.label} value={o.label} onSelect={() => pick(o.choice, o.label)}>
                    <span className="mr-2 w-4" aria-hidden="true" />
                    {o.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {/* Por último: Enter escolhe primeiro o que já existe. */}
            {typed && !known && (
              <CommandGroup>
                <CommandItem value={`criar ${typed}`} onSelect={() => pick(choiceFromText(typed, parts, kind), typed)}>
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Usar “{typed}”
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
