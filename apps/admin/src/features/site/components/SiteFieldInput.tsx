import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { ImageUploader } from "@/components/ImageUploader";
import { Button } from "@/components/ui/button";
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
    const items = asItems(value);
    const itemFields = spec.fields ?? [];
    const atMax = spec.maxItems !== undefined && items.length >= spec.maxItems;

    const updateItem = (index: number, next: Record<string, unknown>) => {
      onChange(items.map((item, i) => (i === index ? next : item)));
    };

    const moveItem = (index: number, delta: number) => {
      const target = index + delta;
      if (target < 0 || target >= items.length) return;
      const next = [...items];
      [next[index], next[target]] = [next[target], next[index]];
      onChange(next);
    };

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">{spec.label}</Label>
            {spec.help ? (
              <p className="text-xs text-muted-foreground">{spec.help}</p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || atMax}
            onClick={() => onChange([...items, emptyItem(itemFields)])}
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
          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={index} className="rounded-lg border bg-muted/20 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {spec.itemLabel ?? "Item"} {index + 1}
                  </span>
                  <div className="flex items-center gap-1">
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
                      onClick={() =>
                        onChange(items.filter((_, i) => i !== index))
                      }
                      aria-label="Remover"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (spec.type === "boolean") {
    return (
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor={fieldId} className="text-sm font-medium">
            {spec.label}
          </Label>
          {spec.help ? (
            <p className="text-xs text-muted-foreground">{spec.help}</p>
          ) : null}
        </div>
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
        <Label className="text-sm font-medium">{spec.label}</Label>
        {spec.help ? (
          <p className="text-xs text-muted-foreground">{spec.help}</p>
        ) : null}
        <ImageUploader
          value={asString(value)}
          onChange={(url) => onChange(url ?? "")}
          disabled={disabled}
          uploadPath={SITE_IMAGE_UPLOAD_PATH}
          prompt="Arraste ou clique para carregar a imagem"
          hint="Também pode colar um URL no campo abaixo."
          successMessage="Imagem carregada."
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
        <Label htmlFor={fieldId} className="text-sm font-medium">
          {spec.label}
        </Label>
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
        {spec.help ? (
          <p className="text-xs text-muted-foreground">{spec.help}</p>
        ) : null}
      </div>
    );
  }

  const isLong = spec.type === "textarea";

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId} className="text-sm font-medium">
        {spec.label}
        {spec.required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
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
      {spec.help ? (
        <p className="text-xs text-muted-foreground">{spec.help}</p>
      ) : null}
    </div>
  );
}
