import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Tag,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  deleteEventCoupon,
  fetchEventCoupons,
  updateEventCoupon,
  type EventCouponDto,
} from "@/features/events/api/tenant-event-coupons-api";
import type { EventTicketTypeDto } from "@/features/events/api/tenant-event-ticket-types-api";
import { formatDateTime, formatMoneyCents } from "@/features/events/lib/format";
import { getApiErrorMessage } from "@/lib/api";
import { CouponWizardDialog } from "./CouponWizardDialog";

type Props = {
  eventId: string;
  ticketTypes: EventTicketTypeDto[];
  canEdit: boolean;
};

export function EventCouponsTab({ eventId, ticketTypes, canEdit }: Props) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<EventCouponDto | null>(null);
  const [deletingCoupon, setDeletingCoupon] = useState<EventCouponDto | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const { data: coupons = [], isLoading } = useQuery({
    queryKey: ["event-coupons", eventId],
    queryFn: () => fetchEventCoupons(eventId),
    enabled: Boolean(eventId),
  });

  const deleteMutation = useMutation({
    mutationFn: (couponId: string) => deleteEventCoupon(eventId, couponId),
    onSuccess: () => {
      toast.success("Cupom removido com sucesso.");
      void queryClient.invalidateQueries({ queryKey: ["event-coupons", eventId] });
      setDeletingCoupon(null);
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err));
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ couponId, active }: { couponId: string; active: boolean }) =>
      updateEventCoupon(eventId, couponId, { active }),
    onSuccess: (_, variables) => {
      toast.success(variables.active ? "Cupom ativado." : "Cupom desativado.");
      void queryClient.invalidateQueries({ queryKey: ["event-coupons", eventId] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err));
    },
  });

  const copyCode = (code: string) => {
    void navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success(`Código "${code}" copiado!`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const openCreateDialog = () => {
    setEditingCoupon(null);
    setDialogOpen(true);
  };

  const openEditDialog = (coupon: EventCouponDto) => {
    setEditingCoupon(coupon);
    setDialogOpen(true);
  };

  const ticketTypeMap = new Map(ticketTypes.map((t) => [t.id, t.name]));

  const activeCouponsCount = coupons.filter((c) => c.active).length;
  const totalUsesCount = coupons.reduce((acc, c) => acc + c.usedCount, 0);

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total de cupons</CardDescription>
            <CardTitle className="text-2xl font-bold">{coupons.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cupons ativos</CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-600">
              {activeCouponsCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total de utilizações</CardDescription>
            <CardTitle className="text-2xl font-bold">{totalUsesCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg">Cupons cadastrados</CardTitle>
            <CardDescription>
              Gerencie descontos para inscrições e ingressos pagos deste evento.
            </CardDescription>
          </div>
          {canEdit && (
            <Button onClick={openCreateDialog} className="gap-2">
              <Plus className="h-4 w-4" />
              Novo cupom
            </Button>
          )}
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="py-12 flex justify-center items-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Carregando cupons...
            </div>
          ) : coupons.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <Tag className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-base">Nenhum cupom cadastrado</h3>
              <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-4">
                Crie cupons promocionais em porcentagem ou valor fixo para estimular as inscrições.
              </p>
              {canEdit && (
                <Button onClick={openCreateDialog} variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Criar primeiro cupom
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Desconto</TableHead>
                    <TableHead>Aplica-se a</TableHead>
                    <TableHead>Usos</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coupons.map((c) => {
                    const isExhausted = c.maxUses !== null && c.usedCount >= c.maxUses;
                    const isExpired = c.validUntil && new Date() > new Date(c.validUntil);

                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-xs tracking-wider">
                              {c.code}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => copyCode(c.code)}
                              title="Copiar código"
                            >
                              {copiedCode === c.code ? (
                                <Check className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <Copy className="h-3 w-3 text-muted-foreground" />
                              )}
                            </Button>
                          </div>
                          {c.name && (
                            <p className="text-xs text-muted-foreground mt-0.5">{c.name}</p>
                          )}
                        </TableCell>

                        <TableCell className="font-medium">
                          {c.discountType === "PERCENTAGE"
                            ? `${c.discountValue}%`
                            : formatMoneyCents(c.discountValue)}
                        </TableCell>

                        <TableCell className="text-sm">
                          {!c.ticketTypeIds || c.ticketTypeIds.length === 0 ? (
                            <span className="text-muted-foreground">Todos os ingressos</span>
                          ) : (
                            <span
                              title={c.ticketTypeIds
                                .map((id) => ticketTypeMap.get(id) ?? id)
                                .join(", ")}
                            >
                              {c.ticketTypeIds.length === 1
                                ? ticketTypeMap.get(c.ticketTypeIds[0]) ?? "1 ingresso"
                                : `${c.ticketTypeIds.length} ingressos específicos`}
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="text-sm">
                          <span>{c.usedCount}</span>
                          <span className="text-muted-foreground">
                            {c.maxUses !== null ? ` / ${c.maxUses}` : " / ∞"}
                          </span>
                          {isExhausted && (
                            <Badge variant="secondary" className="ml-2 text-[10px]">
                              Esgotado
                            </Badge>
                          )}
                        </TableCell>

                        <TableCell className="text-sm">
                          {c.validUntil ? (
                            <span className={isExpired ? "text-destructive font-medium" : ""}>
                              Até {formatDateTime(c.validUntil).slice(0, 10)}
                              {isExpired && " (Expirado)"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Sem expiração</span>
                          )}
                        </TableCell>

                        <TableCell>
                          <Badge
                            variant={c.active && !isExhausted && !isExpired ? "default" : "secondary"}
                          >
                            {c.active ? (isExpired ? "Expirado" : isExhausted ? "Esgotado" : "Ativo") : "Inativo"}
                          </Badge>
                        </TableCell>

                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => copyCode(c.code)}
                                className="cursor-pointer"
                              >
                                <Copy className="mr-2 h-4 w-4" />
                                Copiar código
                              </DropdownMenuItem>

                              {canEdit && (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => openEditDialog(c)}
                                    className="cursor-pointer"
                                  >
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Editar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      toggleStatusMutation.mutate({
                                        couponId: c.id,
                                        active: !c.active,
                                      })
                                    }
                                    className="cursor-pointer"
                                  >
                                    {c.active ? "Desativar" : "Ativar"}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => setDeletingCoupon(c)}
                                    className="cursor-pointer text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Excluir
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CouponWizardDialog
        eventId={eventId}
        coupon={editingCoupon}
        ticketTypes={ticketTypes}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ["event-coupons", eventId] });
        }}
      />

      <AlertDialog
        open={Boolean(deletingCoupon)}
        onOpenChange={(open) => !open && setDeletingCoupon(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cupom?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o cupom{" "}
              <strong>{deletingCoupon?.code}</strong>? Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingCoupon && deleteMutation.mutate(deletingCoupon.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
