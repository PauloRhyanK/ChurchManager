import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  createEventFieldDefinition,
  fetchEventFieldDefinitions,
  fieldTypeHasOptions,
  type EventFieldDefinitionDto,
  type EventFieldType,
} from "@/features/events/api/tenant-event-fields-api";
import type { EventTicketTypeDto } from "@/features/events/api/tenant-event-ticket-types-api";
import {
  createEventTicketType,
  updateEventTicketType,
} from "@/features/events/api/tenant-event-ticket-types-api";
import {
  centsToMoneyInput,
  parseMoneyToCents,
} from "@/features/events/lib/format";
import {
  BILLING_TYPES,
  isFreeTicketPrice,
  ticketTypeFormSchema,
  type TicketFieldConfigValue,
  type TicketTypeFormValues,
} from "@/features/events/schemas/ticket-type-form-schema";
import { getApiErrorMessage } from "@/lib/api";

type Props = {
  eventId: string;
  eventDate?: string;
  ticketType: EventTicketTypeDto | null;
  /** Modo duplicação: pré-preenche como novo a partir de um existente. */
  duplicateFrom?: EventTicketTypeDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

const BILLING_LABELS: Record<(typeof BILLING_TYPES)[number], string> = {
  PIX: "PIX",
  BOLETO: "Boleto",
  CREDIT_CARD: "Cartão de crédito",
};

const FIELD_TYPE_LABELS: Record<EventFieldType, string> = {
  TEXT: "Texto",
  EMAIL: "E-mail",
  PHONE: "Telefone",
  CPF: "CPF",
  TEXTAREA: "Texto longo",
  SELECT: "Seleção",
  CHECKBOX: "Caixa de seleção",
};

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function buildFieldConfigs(
  defs: EventFieldDefinitionDto[],
  source: EventTicketTypeDto | null,
): TicketFieldConfigValue[] {
  const existing = new Map(source?.fields.map((f) => [f.fieldId, f]) ?? []);
  return defs.map((def) => {
    const ex = existing.get(def.id);
    if (ex) {
      return {
        fieldId: def.id,
        label: def.label,
        type: def.type,
        isSystem: def.isSystem,
        enabled: ex.enabled,
        required: ex.required,
      };
    }
    const defaultEnabled =
      def.isSystem && ["name", "email", "phone"].includes(def.key);
    const defaultRequired =
      def.isSystem && ["name", "email"].includes(def.key);
    return {
      fieldId: def.id,
      label: def.label,
      type: def.type,
      isSystem: def.isSystem,
      enabled: defaultEnabled,
      required: defaultRequired,
    };
  });
}

function getTodayDatetimeLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getEventDatetimeLocal(eventDateStr: string): string {
  return `${eventDateStr}T23:59`;
}

function baseValues(source: EventTicketTypeDto | null, eventDate?: string): TicketTypeFormValues {
  if (!source) {
    const todayStr = getTodayDatetimeLocal();
    const eventStr = eventDate ? getEventDatetimeLocal(eventDate) : "";
    return {
      name: "",
      description: "",
      active: true,
      visibility: "PUBLIC",
      salesOpensAt: todayStr,
      salesClosesAt: eventStr,
      allowGuestRegistration: true,
      communityLink: "",
      allowedBillingTypes: ["PIX"],
      maxInstallments: "",
      priceInput: "",
      feeInput: "",
      quantityTotal: "",
      minPerOrder: 1,
      maxPerOrder: 10,
      fieldConfigs: [],
    };
  }
  return {
    name: source.name,
    description: source.description ?? "",
    active: source.active,
    visibility: source.visibility,
    salesOpensAt: toDatetimeLocal(source.salesOpensAt),
    salesClosesAt: toDatetimeLocal(source.salesClosesAt),
    allowGuestRegistration: source.allowGuestRegistration,
    communityLink: source.communityLink ?? "",
    allowedBillingTypes: source.allowedBillingTypes.filter(
      (b): b is (typeof BILLING_TYPES)[number] =>
        (BILLING_TYPES as readonly string[]).includes(b),
    ),
    maxInstallments:
      source.maxInstallments != null ? String(source.maxInstallments) : "",
    priceInput: centsToMoneyInput(source.priceCents),
    feeInput: source.feeCents > 0 ? centsToMoneyInput(source.feeCents) : "",
    quantityTotal:
      source.quantityTotal != null ? String(source.quantityTotal) : "",
    minPerOrder: source.minPerOrder,
    maxPerOrder: source.maxPerOrder,
    fieldConfigs: [],
  };
}

const STEP_FIELDS: Record<number, (keyof TicketTypeFormValues)[]> = {
  1: ["name", "description", "communityLink", "salesOpensAt", "salesClosesAt"],
  2: ["allowedBillingTypes", "priceInput", "minPerOrder", "maxPerOrder"],
  3: ["fieldConfigs"],
};

export function TicketTypeWizardDialog({
  eventId,
  eventDate,
  ticketType,
  duplicateFrom,
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const isEdit = Boolean(ticketType);
  const source = ticketType ?? duplicateFrom ?? null;
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [hasInitialized, setHasInitialized] = useState(false);

  const fieldsQuery = useQuery({
    queryKey: ["event-field-definitions"],
    queryFn: fetchEventFieldDefinitions,
    enabled: open,
  });

  const form = useForm<TicketTypeFormValues>({
    resolver: zodResolver(ticketTypeFormSchema),
    defaultValues: baseValues(source, eventDate),
  });

  useEffect(() => {
    if (!open) {
      setHasInitialized(false);
      return;
    }

    if (!hasInitialized && !fieldsQuery.isLoading) {
      const initial = baseValues(
        duplicateFrom ? { ...duplicateFrom, name: `${duplicateFrom.name} (cópia)` } : source,
        eventDate,
      );
      if (fieldsQuery.data) {
        initial.fieldConfigs = buildFieldConfigs(fieldsQuery.data, source);
      }
      form.reset(initial);
      setStep(1);
      setHasInitialized(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hasInitialized, fieldsQuery.isLoading, fieldsQuery.data, ticketType, duplicateFrom, source, eventDate, form]);

  const saveMutation = useMutation({
    mutationFn: async (values: TicketTypeFormValues) => {
      const priceCents = parseMoneyToCents(values.priceInput);
      if (priceCents == null) throw new Error("Preço inválido");
      const feeCents = values.feeInput?.trim()
        ? parseMoneyToCents(values.feeInput) ?? 0
        : 0;
      const qty = values.quantityTotal?.trim();
      const body = {
        name: values.name.trim(),
        description: values.description?.trim() || null,
        priceCents,
        feeCents,
        quantityTotal: qty ? Number(qty) : null,
        minPerOrder: values.minPerOrder,
        maxPerOrder: values.maxPerOrder,
        salesOpensAt: values.salesOpensAt
          ? new Date(values.salesOpensAt).toISOString()
          : "",
        salesClosesAt: values.salesClosesAt
          ? new Date(values.salesClosesAt).toISOString()
          : "",
        visibility: values.visibility,
        allowGuestRegistration: values.allowGuestRegistration,
        communityLink: values.communityLink?.trim() || null,
        allowedBillingTypes: isFreeTicketPrice(values.priceInput)
          ? ["UNDEFINED"]
          : values.allowedBillingTypes,
        maxInstallments: values.maxInstallments?.trim()
          ? Number(values.maxInstallments)
          : null,
        active: values.active,
        fieldConfigs: values.fieldConfigs.map((fc, index) => ({
          fieldId: fc.fieldId,
          enabled: fc.enabled,
          required: fc.required,
          sortOrder: index,
        })),
      };
      if (isEdit) return updateEventTicketType(eventId, ticketType!.id, body);
      return createEventTicketType(eventId, body);
    },
    onSuccess: () => {
      toast.success(
        isEdit ? "Ingresso actualizado." : "Ingresso criado.",
      );
      onSaved();
      onOpenChange(false);
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  async function goNext() {
    const valid = await form.trigger(STEP_FIELDS[step]);
    if (!valid) return;

    if (step === 2) {
      const priceCents = parseMoneyToCents(form.getValues("priceInput"));
      const paid = priceCents != null && priceCents > 0;
      if (paid) {
        const configs = form.getValues("fieldConfigs");
        form.setValue(
          "fieldConfigs",
          configs.map((c) =>
            c.type === "CPF" ? { ...c, enabled: true, required: true } : c,
          ),
        );
      }
    }

    setStep((s) => Math.min(3, s + 1));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar ingresso" : "Novo ingresso"} — passo {step} de 3
          </DialogTitle>
          <DialogDescription>
            Configure o tipo de ingresso em três passos: dados gerais, preço e
            campos da inscrição.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
              e.preventDefault();
            }
          }}
          noValidate
        >
          {step === 1 && <Step1 form={form} />}
          {step === 2 && <Step2 form={form} />}
          {step === 3 && fieldsQuery.data && (
            <Step3 form={form} defs={fieldsQuery.data} />
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <div>
              {step > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep((s) => s - 1)}
                >
                  Anterior
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              {step < 3 ? (
                <Button key="next-btn" type="button" onClick={goNext}>
                  Seguinte
                </Button>
              ) : (
                <Button key="submit-btn" type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isEdit ? "Guardar" : "Criar ingresso"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type StepProps = { form: ReturnType<typeof useForm<TicketTypeFormValues>> };

function Step1({ form }: StepProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="tt-name">Nome</Label>
        <Input id="tt-name" {...form.register("name")} />
        {form.formState.errors.name && (
          <p className="text-sm text-red-600">
            {form.formState.errors.name.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="tt-desc">Descrição</Label>
        <Textarea id="tt-desc" rows={2} {...form.register("description")} />
      </div>

      <div className="space-y-2">
        <Label>Visibilidade</Label>
        <Controller
          control={form.control}
          name="visibility"
          render={({ field }) => (
            <RadioGroup
              value={field.value}
              onValueChange={field.onChange}
              className="flex gap-6"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="PUBLIC" id="vis-pub" />
                <Label htmlFor="vis-pub" className="font-normal">
                  Público
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="PRIVATE" id="vis-priv" />
                <Label htmlFor="vis-priv" className="font-normal">
                  Privado (só por link)
                </Label>
              </div>
            </RadioGroup>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="tt-opens">Início das vendas</Label>
          <Input
            id="tt-opens"
            type="datetime-local"
            {...form.register("salesOpensAt")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tt-closes">Fim das vendas</Label>
          <Input
            id="tt-closes"
            type="datetime-local"
            {...form.register("salesClosesAt")}
          />
          {form.formState.errors.salesClosesAt && (
            <p className="text-sm text-red-600">
              {form.formState.errors.salesClosesAt.message}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">Permitir inscrição sem login</p>
          <p className="text-xs text-muted-foreground">
            Visitantes podem inscrever-se sem conta.
          </p>
        </div>
        <Controller
          control={form.control}
          name="allowGuestRegistration"
          render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="tt-community">Link da comunidade (WhatsApp)</Label>
        <Input
          id="tt-community"
          type="url"
          placeholder="https://chat.whatsapp.com/…"
          {...form.register("communityLink")}
        />
        {form.formState.errors.communityLink && (
          <p className="text-sm text-red-600">
            {form.formState.errors.communityLink.message}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <Label htmlFor="tt-active">Activo</Label>
        <Controller
          control={form.control}
          name="active"
          render={({ field }) => (
            <Switch
              id="tt-active"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </div>
    </div>
  );
}

function Step2({ form }: StepProps) {
  const selected = form.watch("allowedBillingTypes");
  const priceInput = form.watch("priceInput");
  const isFree = isFreeTicketPrice(priceInput ?? "");
  const hasCard = selected.includes("CREDIT_CARD");

  function toggleBilling(type: (typeof BILLING_TYPES)[number], checked: boolean) {
    const next = checked
      ? [...selected, type]
      : selected.filter((t) => t !== type);
    form.setValue("allowedBillingTypes", next, { shouldValidate: true });
  }

  function setFreeTicket() {
    form.setValue("priceInput", "0,00", { shouldValidate: true });
    form.setValue("allowedBillingTypes", [], { shouldValidate: true });
    form.setValue("feeInput", "");
    form.setValue("maxInstallments", "");
  }

  return (
    <div className="space-y-4">
      {!isFree && (
        <div className="space-y-2">
          <Label>Tipos de pagamento</Label>
          <div className="flex flex-wrap gap-4">
            {BILLING_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selected.includes(type)}
                  onCheckedChange={(c) => toggleBilling(type, Boolean(c))}
                />
                {BILLING_LABELS[type]}
              </label>
            ))}
          </div>
          {form.formState.errors.allowedBillingTypes && (
            <p className="text-sm text-red-600">
              {form.formState.errors.allowedBillingTypes.message}
            </p>
          )}
        </div>
      )}

      {hasCard && !isFree && (
        <div className="space-y-2">
          <Label htmlFor="tt-installments">Máximo de parcelas (cartão)</Label>
          <Input
            id="tt-installments"
            type="number"
            min={1}
            max={24}
            placeholder="À vista"
            {...form.register("maxInstallments")}
          />
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="tt-price">Preço (R$)</Label>
          <Button type="button" variant="outline" size="sm" onClick={setFreeTicket}>
            Ingresso gratuito
          </Button>
        </div>
        <Input id="tt-price" placeholder="0,00" {...form.register("priceInput")} />
        {isFree && (
          <p className="text-xs text-muted-foreground">
            Ingresso gratuito — sem cobrança no checkout.
          </p>
        )}
        {form.formState.errors.priceInput && (
          <p className="text-sm text-red-600">
            {form.formState.errors.priceInput.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor="tt-qty">Stock</Label>
          <Input
            id="tt-qty"
            type="number"
            min={1}
            placeholder="Ilimitado"
            {...form.register("quantityTotal")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tt-min">Mín/pedido</Label>
          <Input id="tt-min" type="number" min={1} {...form.register("minPerOrder")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tt-max">Máx/pedido</Label>
          <Input id="tt-max" type="number" min={1} {...form.register("maxPerOrder")} />
        </div>
      </div>
    </div>
  );
}

function Step3({
  form,
  defs,
}: StepProps & { defs: EventFieldDefinitionDto[] }) {
  const queryClient = useQueryClient();
  const configs = form.watch("fieldConfigs");
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<EventFieldType>("TEXT");
  const [optionsText, setOptionsText] = useState("");

  const knownIds = useMemo(
    () => new Set(configs.map((c) => c.fieldId)),
    [configs],
  );

  // Inclui campos que surgiram depois do reset inicial.
  useEffect(() => {
    const missing = defs.filter((d) => !knownIds.has(d.id));
    if (missing.length > 0) {
      form.setValue("fieldConfigs", [
        ...configs,
        ...missing.map((d) => ({
          fieldId: d.id,
          label: d.label,
          type: d.type,
          isSystem: d.isSystem,
          enabled: false,
          required: false,
        })),
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defs]);

  function update(index: number, patch: Partial<TicketFieldConfigValue>) {
    const next = configs.map((c, i) => (i === index ? { ...c, ...patch } : c));
    form.setValue("fieldConfigs", next);
  }

  const createFieldMutation = useMutation({
    mutationFn: () => {
      const options = fieldTypeHasOptions(type)
        ? optionsText.split(",").map((o) => o.trim()).filter(Boolean)
        : undefined;
      return createEventFieldDefinition({ label: label.trim(), type, options });
    },
    onSuccess: (created) => {
      form.setValue("fieldConfigs", [
        ...form.getValues("fieldConfigs"),
        {
          fieldId: created.id,
          label: created.label,
          type: created.type,
          isSystem: created.isSystem,
          enabled: true,
          required: false,
        },
      ]);
      void queryClient.invalidateQueries({
        queryKey: ["event-field-definitions"],
      });
      setLabel("");
      setType("TEXT");
      setOptionsText("");
      setAdding(false);
      toast.success("Campo personalizado criado.");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Active os campos solicitados na inscrição e marque os obrigatórios.
      </p>

      <div className="space-y-2">
        {configs.map((config, index) => (
          <div
            key={config.fieldId}
            className="flex items-center justify-between gap-3 rounded-lg border p-3"
          >
            <div className="flex items-center gap-3">
              <Checkbox
                checked={config.enabled}
                onCheckedChange={(c) =>
                  update(index, {
                    enabled: Boolean(c),
                    required: c ? config.required : false,
                  })
                }
              />
              <div>
                <p className="text-sm font-medium">{config.label}</p>
                <p className="text-xs text-muted-foreground">
                  {FIELD_TYPE_LABELS[config.type as EventFieldType] ??
                    config.type}
                  {config.isSystem ? " · padrão" : ""}
                  {fieldTypeHasOptions(config.type as EventFieldType) &&
                    (() => {
                      const def = defs.find((d) => d.id === config.fieldId);
                      return def?.options && def.options.length > 0
                        ? ` (${def.options.join(", ")})`
                        : "";
                    })()}
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={config.required}
                disabled={!config.enabled}
                onCheckedChange={(c) => update(index, { required: Boolean(c) })}
              />
              Obrigatório
            </label>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="space-y-2">
            <Label htmlFor="nf-label">Rótulo do campo</Label>
            <Input
              id="nf-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex.: Empresa"
            />
          </div>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as EventFieldType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  ["TEXT", "EMAIL", "PHONE", "CPF", "TEXTAREA", "SELECT", "CHECKBOX"] as EventFieldType[]
                ).map((t) => (
                  <SelectItem key={t} value={t}>
                    {FIELD_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {fieldTypeHasOptions(type) && (
            <div className="space-y-2 animate-in fade-in duration-200">
              <Label htmlFor="nf-options">Opções do campo</Label>
              <Input
                id="nf-options"
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder="Separadas por vírgula. Ex: P, M, G"
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAdding(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={
                !label.trim() ||
                (fieldTypeHasOptions(type) && !optionsText.trim()) ||
                createFieldMutation.isPending
              }
              onClick={() => createFieldMutation.mutate()}
            >
              {createFieldMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Adicionar
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setAdding(true)}
        >
          <Plus className="h-4 w-4" />
          Adicionar campo personalizado
        </Button>
      )}
    </div>
  );
}
