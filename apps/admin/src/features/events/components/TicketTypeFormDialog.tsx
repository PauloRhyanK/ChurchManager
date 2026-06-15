import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
  ticketTypeFormSchema,
  type TicketTypeFormValues,
} from "@/features/events/schemas/ticket-type-form-schema";
import { getApiErrorMessage } from "@/lib/api";

type Props = {
  eventId: string;
  ticketType: EventTicketTypeDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

function toFormValues(ticketType: EventTicketTypeDto | null): TicketTypeFormValues {
  if (!ticketType) {
    return {
      name: "",
      description: "",
      priceInput: "",
      feeInput: "",
      quantityTotal: "",
      minPerOrder: 1,
      maxPerOrder: 10,
      active: true,
    };
  }
  return {
    name: ticketType.name,
    description: ticketType.description ?? "",
    priceInput: centsToMoneyInput(ticketType.priceCents),
    feeInput: ticketType.feeCents > 0 ? centsToMoneyInput(ticketType.feeCents) : "",
    quantityTotal: ticketType.quantityTotal != null ? String(ticketType.quantityTotal) : "",
    minPerOrder: ticketType.minPerOrder,
    maxPerOrder: ticketType.maxPerOrder,
    active: ticketType.active,
  };
}

function formToApiBody(values: TicketTypeFormValues) {
  const priceCents = parseMoneyToCents(values.priceInput);
  if (priceCents == null) throw new Error("Preço inválido");
  const feeCents = values.feeInput?.trim()
    ? parseMoneyToCents(values.feeInput) ?? 0
    : 0;
  const qty = values.quantityTotal?.trim();
  return {
    name: values.name.trim(),
    description: values.description?.trim() || null,
    priceCents,
    feeCents,
    quantityTotal: qty ? Number(qty) : null,
    minPerOrder: values.minPerOrder,
    maxPerOrder: values.maxPerOrder,
    active: values.active,
  };
}

export function TicketTypeFormDialog({
  eventId,
  ticketType,
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const isEdit = Boolean(ticketType);

  const form = useForm<TicketTypeFormValues>({
    resolver: zodResolver(ticketTypeFormSchema),
    defaultValues: toFormValues(ticketType),
  });

  useEffect(() => {
    if (open) form.reset(toFormValues(ticketType));
  }, [open, ticketType, form]);

  const saveMutation = useMutation({
    mutationFn: async (values: TicketTypeFormValues) => {
      const body = formToApiBody(values);
      if (isEdit) return updateEventTicketType(eventId, ticketType!.id, body);
      return createEventTicketType(eventId, body);
    },
    onSuccess: () => {
      toast.success(isEdit ? "Tipo de ingresso actualizado." : "Tipo de ingresso criado.");
      onSaved();
      onOpenChange(false);
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar tipo de ingresso" : "Novo tipo de ingresso"}</DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="tt-name">Nome</Label>
            <Input id="tt-name" {...form.register("name")} />
            {form.formState.errors.name && (
              <p className="text-sm text-red-600">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="tt-desc">Descrição</Label>
            <Textarea id="tt-desc" rows={2} {...form.register("description")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tt-price">Preço (R$)</Label>
              <Input id="tt-price" placeholder="0,00" {...form.register("priceInput")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tt-fee">Taxa (R$)</Label>
              <Input id="tt-fee" placeholder="0,00" {...form.register("feeInput")} />
            </div>
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

          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="tt-active">Activo</Label>
            <Switch
              id="tt-active"
              checked={form.watch("active")}
              onCheckedChange={(checked) => form.setValue("active", checked)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Guardar" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
