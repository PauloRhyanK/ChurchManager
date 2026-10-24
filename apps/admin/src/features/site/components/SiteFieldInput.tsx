import { ChevronDown, ChevronRight, ChevronUp, Info, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { ImageUploader } from "@/components/ImageUploader";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  SITE_IMAGE_UPLOAD_PATH,
  type SiteFieldSpec,
} from "@/features/site/api/tenant-site-content-api";
import { getSiteIcon } from "./site-icons";

interface SiteFieldInputProps {
  spec: SiteFieldSpec;
  value: unknown;
  onChange: (value: unknown) => void;
  icons: string[];
  disabled?: boolean;
  /** Prefixo para ids únicos quando o campo está dentro de um item de lista. */
  idPrefix?: string;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asItems(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

/** Valor inicial de um item novo: todos os campos vazios, listas ativas. */
function emptyItem(fields: SiteFieldSpec[]): Record<string, unknown> {
  const item: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.type === "boolean") {
      // `active` começa ligado para o item aparecer logo no site.
      item[field.name] = field.name === "active";
    } else if (field.type === "list") {
      item[field.name] = [];
    } else {
      item[field.name] = "";
    }
  }
  return item;
}

/** Rótulo com a ajuda num ícone, para o formulário não virar um bloco de texto. */
function FieldLabel({
  htmlFor,
  spec,
}: {
  htmlFor?: string;
  spec: SiteFieldSpec;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {spec.label}
        {spec.required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      {spec.help ? (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Ajuda: ${spec.label}`}
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">{spec.help}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
    </div>
  );
}

/** Título do item recolhido: o primeiro texto preenchido, senão "Benefício 2". */
function itemTitle(
  item: Record<string, unknown>,
  fields: SiteFieldSpec[],
  fallback: string,
): string {
  for (const field of fields) {
    const value = item[field.name];
    if (field.type === "text" && typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}

function ListField({
  spec,
  value,
  onChange,
  icons,
  disabled,
  fieldId,
}: {
  spec: SiteFieldSpec;
  value: unknown;
  onChange: (value: unknown) => void;
  icons: string[];
  disabled?: boolean;
  fieldId: string;
}) {
  const items = asItems(value);
  const itemFields = spec.fields ?? [];
  const atMax = spec.maxItems !== undefined && items.length >= spec.maxItems;
  // Índices abertos. Itens começam recolhidos; um item novo abre já expandido.
  const [open, setOpen] = useState<Set<number>>(() => new Set());

  const setItemOpen = (index: number, next: boolean) =>
    setOpen((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(index);
      else copy.delete(index);
      return copy;
    });

  const updateItem = (index: number, next: Record<string, unknown>) => {
    onChange(items.map((item, i) => (i === index ? next : item)));
  };

  const moveItem = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
    setOpen((prev) => {
      const copy = new Set<number>();
      for (const i of prev) copy.add(i === index ? target : i === target ? index : i);
      return copy;
    });
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
    setOpen((prev) => {
      const copy = new Set<number>();
      for (const i of prev) if (i !== index) copy.add(i > index ? i - 1 : i);
      return copy;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <FieldLabel spec={spec} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || atMax}
          onClick={() => {
            onChange([...items, emptyItem(itemFields)]);
            setItemOpen(items.length, true);
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          Adicionar
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Ainda não há {spec.label.toLowerCase()}.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => {
            const isOpen = open.has(index);
            return (
              <Collapsible
                key={index}
                open={isOpen}
                onOpenChange={(next) => setItemOpen(index, next)}
                className="rounded-lg border bg-muted/20"
              >
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-muted/50"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">
                        {itemTitle(item, itemFields, `${spec.itemLabel ?? "Item"} ${index + 1}`)}
                      </span>
                    </button>
                  </CollapsibleTrigger>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={disabled || index === 0}
                    onClick={() => moveItem(index, -1)}
                    aria-label="Mover para cima"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={disabled || index === items.length - 1}
                    onClick={() => moveItem(index, 1)}
                    aria-label="Mover para baixo"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    disabled={disabled}
                    onClick={() => removeItem(index)}
                    aria-label="Remover"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <CollapsibleContent className="space-y-4 border-t px-4 py-4">
                  {itemFields.map((itemField) => (
                    <SiteFieldInput
                      key={itemField.name}
                      spec={itemField}
                      value={item[itemField.name]}
                      onChange={(next) =>
                        updateItem(index, { ...item, [itemField.name]: next })
                      }
                      icons={icons}
                      disabled={disabled}
                      idPrefix={`${fieldId}-${index}-`}
                    />
                  ))}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SiteFieldInput({
  spec,
  value,
  onChange,
  icons,
  disabled,
  idPrefix = "",
}: SiteFieldInputProps) {
  const fieldId = `${idPrefix}${spec.name}`;

  if (spec.type === "list") {
    return (
      <ListField
        spec={spec}
        value={value}
        onChange={onChange}
        icons={icons}
        disabled={disabled}
        fieldId={fieldId}
      />
    );
  }

  if (spec.type === "boolean") {
    return (
      <div className="flex items-center justify-between gap-4">
        <FieldLabel htmlFor={fieldId} spec={spec} />
        <Switch
          id={fieldId}
          checked={value === true}
          onCheckedChange={onChange}
          disabled={disabled}
        />
      </div>
    );
  }

  if (spec.type === "image") {
    return (
      <div className="space-y-2">
        <FieldLabel spec={spec} />
        <ImageUploader
          value={asString(value)}
          onChange={(url) => onChange(url ?? "")}
          disabled={disabled}
          uploadPath={SITE_IMAGE_UPLOAD_PATH}
          prompt="Arraste ou clique para enviar a imagem"
          hint="JPEG, PNG, WebP ou GIF, até 5 MB. Também pode colar um URL no campo abaixo."
          successMessage="Imagem enviada."
        />
        <Input
          id={fieldId}
          value={asString(value)}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="https://... ou /imagem.jpg"
        />
      </div>
    );
  }

  if (spec.type === "icon") {
    const Icon = getSiteIcon(asString(value));
    return (
      <div className="space-y-2">
        <FieldLabel htmlFor={fieldId} spec={spec} />
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted/30">
            <Icon className="h-4 w-4" />
          </div>
          <Select
            value={asString(value) || undefined}
            onValueChange={onChange}
            disabled={disabled}
          >
            <SelectTrigger id={fieldId}>
              <SelectValue placeholder="Escolher ícone" />
            </SelectTrigger>
            <SelectContent>
              {icons.map((name) => {
                const OptionIcon = getSiteIcon(name);
                return (
                  <SelectItem key={name} value={name}>
                    <span className="flex items-center gap-2">
                      <OptionIcon className="h-4 w-4" />
                      {name}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  const isLong = spec.type === "textarea";

  return (
    <div className="space-y-2">
      <FieldLabel htmlFor={fieldId} spec={spec} />
      {isLong ? (
        <Textarea
          id={fieldId}
          value={asString(value)}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          maxLength={spec.maxLength}
          rows={4}
        />
      ) : (
        <Input
          id={fieldId}
          value={asString(value)}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          maxLength={spec.maxLength}
        />
      )}
    </div>
  );
}
