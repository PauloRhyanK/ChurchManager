import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import {
  createEventCoupon,
  updateEventCoupon,
  type CreateEventCouponBody,
  type EventCouponDto,
} from "@/features/events/api/tenant-event-coupons-api";
import type { EventTicketTypeDto } from "@/features/events/api/tenant-event-ticket-types-api";
import {
  centsToMoneyInput,
  formatMoneyCents,
  parseMoneyToCents,
} from "@/features/events/lib/format";
import {
  couponFormSchema,
  type CouponFormData,
} from "@/features/events/schemas/coupon-form-schema";
import { getApiErrorMessage } from "@/lib/api";

type Props = {
  eventId: string;
  coupon: EventCouponDto | null;
  ticketTypes: EventTicketTypeDto[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function CouponWizardDialog({
  eventId,
  coupon,
  ticketTypes,
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const isEditing = Boolean(coupon);
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<CouponFormData>({
    resolver: zodResolver(couponFormSchema),
    defaultValues: {
      code: "",
      name: "",
      discountType: "PERCENTAGE",
      discountPercentage: 10,
      discountMoney: "",
      restrictionType: "ALL",
      selectedTicketTypeIds: [],
      maxUses: "",
      maxUsesPerCpf: "1",
      validFrom: "",
      validUntil: "",
      active: true,
    },
  });

  const discountType = watch("discountType");
  const restrictionType = watch("restrictionType");
  const selectedTicketTypeIds = watch("selectedTicketTypeIds") ?? [];

  useEffect(() => {
    if (!open) return;

    if (coupon) {
      reset({
        code: coupon.code,
        name: coupon.name ?? "",
        discountType: coupon.discountType,
        discountPercentage:
          coupon.discountType === "PERCENTAGE" ? coupon.discountValue : 10,
        discountMoney:
          coupon.discountType === "FIXED"
            ? centsToMoneyInput(coupon.discountValue)
            : "",
        restrictionType:
          coupon.ticketTypeIds && coupon.ticketTypeIds.length > 0
            ? "SELECTED"
            : "ALL",
        selectedTicketTypeIds: coupon.ticketTypeIds ?? [],
        maxUses: coupon.maxUses ? String(coupon.maxUses) : "",
        maxUsesPerCpf: String(coupon.maxUsesPerCpf ?? 1),
        validFrom: coupon.validFrom ? coupon.validFrom.slice(0, 10) : "",
        validUntil: coupon.validUntil ? coupon.validUntil.slice(0, 10) : "",
        active: coupon.active,
      });
    } else {
      reset({
        code: "",
        name: "",
        discountType: "PERCENTAGE",
        discountPercentage: 10,
        discountMoney: "",
        restrictionType: "ALL",
        selectedTicketTypeIds: [],
        maxUses: "",
        maxUsesPerCpf: "1",
        validFrom: "",
        validUntil: "",
        active: true,
      });
    }
  }, [open, coupon, reset]);

  const mutation = useMutation({
    mutationFn: async (data: CouponFormData) => {
      const discountValue =
        data.discountType === "PERCENTAGE"
          ? data.discountPercentage!
          : parseMoneyToCents(data.discountMoney ?? "0");

      const body: CreateEventCouponBody = {
        code: data.code.trim().toUpperCase(),
        name: data.name?.trim() ? data.name.trim() : null,
        discountType: data.discountType,
        discountValue,
        maxUses: data.maxUses ? Number(data.maxUses) : null,
        maxUsesPerCpf: data.maxUsesPerCpf ? Number(data.maxUsesPerCpf) : 1,
        validFrom: data.validFrom ? new Date(`${data.validFrom}T00:00:00Z`).toISOString() : null,
        validUntil: data.validUntil ? new Date(`${data.validUntil}T23:59:59Z`).toISOString() : null,
        active: data.active,
        ticketTypeIds:
          data.restrictionType === "SELECTED" ? data.selectedTicketTypeIds : [],
      };

      if (coupon) {
        return updateEventCoupon(eventId, coupon.id, body);
      }
      return createEventCoupon(eventId, body);
    },
    onSuccess: () => {
      toast.success(isEditing ? "Cupom atualizado com sucesso." : "Cupom criado com sucesso.");
      void queryClient.invalidateQueries({ queryKey: ["event-coupons", eventId] });
      onSaved();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err));
    },
  });

  const onSubmit = (data: CouponFormData) => {
    mutation.mutate(data);
  };

  const toggleTicketType = (id: string, checked: boolean) => {
    if (checked) {
      setValue("selectedTicketTypeIds", [...selectedTicketTypeIds, id], {
        shouldValidate: true,
      });
    } else {
      setValue(
        "selectedTicketTypeIds",
        selectedTicketTypeIds.filter((item) => item !== id),
        { shouldValidate: true },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar cupom" : "Novo cupom de desconto"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-4">
            <div>
              <Label htmlFor="code">Código do cupom *</Label>
              <Input
                id="code"
                placeholder="EX: LOTE1VIP"
                {...register("code")}
                className="uppercase font-mono tracking-wider"
                onChange={(e) => {
                  setValue("code", e.target.value.toUpperCase());
                }}
              />
              {errors.code && (
                <p className="text-xs text-destructive mt-1">{errors.code.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="name">Descrição interna (opcional)</Label>
              <Input
                id="name"
                placeholder="Ex: Desconto para voluntários ou caravanas"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-xs text-destructive mt-1">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Tipo de desconto *</Label>
              <Controller
                control={control}
                name="discountType"
                render={({ field }) => (
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    className="flex flex-col gap-2 sm:flex-row sm:gap-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="PERCENTAGE" id="discount-pct" />
                      <Label htmlFor="discount-pct" className="font-normal cursor-pointer">
                        Porcentagem (%)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="FIXED" id="discount-fix" />
                      <Label htmlFor="discount-fix" className="font-normal cursor-pointer">
                        Valor Fixo (R$)
                      </Label>
                    </div>
                  </RadioGroup>
                )}
              />
            </div>

            {discountType === "PERCENTAGE" ? (
              <div>
                <Label htmlFor="discountPercentage">Porcentagem de desconto (%) *</Label>
                <div className="relative">
                  <Input
                    id="discountPercentage"
                    type="number"
                    min={1}
                    max={100}
                    placeholder="Ex: 20"
                    {...register("discountPercentage")}
                  />
                  <span className="absolute right-3 top-2.5 text-sm text-muted-foreground">%</span>
                </div>
                {errors.discountPercentage && (
                  <p className="text-xs text-destructive mt-1">
                    {errors.discountPercentage.message}
                  </p>
                )}
              </div>
            ) : (
              <div>
                <Label htmlFor="discountMoney">Valor de desconto (R$) *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">R$</span>
                  <Input
                    id="discountMoney"
                    placeholder="0,00"
                    className="pl-9"
                    {...register("discountMoney")}
                  />
                </div>
                {errors.discountMoney && (
                  <p className="text-xs text-destructive mt-1">
                    {errors.discountMoney.message}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2 pt-2 border-t">
              <Label>Aplica-se a quais ingressos? *</Label>
              <Controller
                control={control}
                name="restrictionType"
                render={({ field }) => (
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    className="flex flex-col gap-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="ALL" id="restr-all" />
                      <Label htmlFor="restr-all" className="font-normal cursor-pointer">
                        Todos os ingressos do evento
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="SELECTED" id="restr-sel" />
                      <Label htmlFor="restr-sel" className="font-normal cursor-pointer">
                        Apenas ingressos específicos
                      </Label>
                    </div>
                  </RadioGroup>
                )}
              />

              {restrictionType === "SELECTED" && (
                <div className="mt-3 p-3 border rounded-md bg-muted/20 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Selecione os ingressos elegíveis:
                  </p>
                  {ticketTypes.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      Nenhum tipo de ingresso cadastrado neste evento.
                    </p>
                  ) : (
                    ticketTypes.map((ticket) => (
                      <div key={ticket.id} className="flex items-center space-x-2 py-1">
                        <Checkbox
                          id={`ticket-${ticket.id}`}
                          checked={selectedTicketTypeIds.includes(ticket.id)}
                          onCheckedChange={(checked) =>
                            toggleTicketType(ticket.id, Boolean(checked))
                          }
                        />
                        <Label
                          htmlFor={`ticket-${ticket.id}`}
                          className="text-sm font-normal cursor-pointer flex-1 flex justify-between"
                        >
                          <span>{ticket.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatMoneyCents(ticket.priceCents)}
                          </span>
                        </Label>
                      </div>
                    ))
                  )}
                  {errors.selectedTicketTypeIds && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.selectedTicketTypeIds.message}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t">
              <div>
                <Label htmlFor="maxUses">Limite total de usos</Label>
                <Input
                  id="maxUses"
                  type="number"
                  min={1}
                  placeholder="Ilimitado"
                  {...register("maxUses")}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Deixe vazio para ilimitado.
                </p>
              </div>

              <div>
                <Label htmlFor="maxUsesPerCpf">Limite por CPF</Label>
                <Input
                  id="maxUsesPerCpf"
                  type="number"
                  min={1}
                  placeholder="1"
                  {...register("maxUsesPerCpf")}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Máximo de compras com este cupom por pessoa.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t">
              <div>
                <Label htmlFor="validFrom">Válido a partir de</Label>
                <Input id="validFrom" type="date" {...register("validFrom")} />
              </div>

              <div>
                <Label htmlFor="validUntil">Válido até</Label>
                <Input id="validUntil" type="date" {...register("validUntil")} />
                {errors.validUntil && (
                  <p className="text-xs text-destructive mt-1">
                    {errors.validUntil.message}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <div>
                <Label htmlFor="active" className="cursor-pointer">
                  Cupom ativo
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Quando desativado, o cupom não pode ser aplicado no checkout.
                </p>
              </div>
              <Controller
                control={control}
                name="active"
                render={({ field }) => (
                  <Switch
                    id="active"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Salvar alterações" : "Criar cupom"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
