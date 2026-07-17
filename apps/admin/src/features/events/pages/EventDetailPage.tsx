import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EventPaymentLinkDialog } from "@/features/events/components/EventPaymentLinkDialog";
import { EventSiteDetailsTab } from "@/features/events/components/EventSiteDetailsTab";
import { TicketTypeWizardDialog } from "@/features/events/components/TicketTypeWizardDialog";
import { fetchEventRegistrations } from "@/features/events/api/tenant-event-registrations-api";
import { fetchEvent, fetchEventReport } from "@/features/events/api/tenant-events-api";
import {
  deleteEventTicketType,
  duplicateEventTicketType,
  fetchEventTicketTypes,
  type EventTicketTypeDto,
} from "@/features/events/api/tenant-event-ticket-types-api";
import {
  formatDateTime,
  formatEventDate,
  formatMoneyCents,
  formatTime,
} from "@/features/events/lib/format";
import { EventReportSection } from "@/features/events/components/EventReportSection";
import { getApiErrorMessage } from "@/lib/api";
import { StatCard } from "@/components/dashboard/StatCard";
import { BarChart3, Ticket, Users } from "lucide-react";

export function EventDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") === "site" ? "site" : "ingressos";
  const queryClient = useQueryClient();
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  const [paymentLinkTicket, setPaymentLinkTicket] = useState<EventTicketTypeDto | null>(null);
  const [editingTicket, setEditingTicket] = useState<EventTicketTypeDto | null>(null);
  const [duplicateTicket, setDuplicateTicket] = useState<EventTicketTypeDto | null>(null);

  const eventQuery = useQuery({
    queryKey: ["event", id],
    queryFn: () => fetchEvent(id),
    enabled: Boolean(id),
  });

  const ticketTypesQuery = useQuery({
    queryKey: ["event-ticket-types", id],
    queryFn: () => fetchEventTicketTypes(id),
    enabled: Boolean(id),
  });

  const registrationsQuery = useQuery({
    queryKey: ["event-registrations", id],
    queryFn: () => fetchEventRegistrations(id),
    enabled: Boolean(id),
  });

  const reportQuery = useQuery({
    queryKey: ["event-report", id],
    queryFn: () => fetchEventReport(id),
    enabled: Boolean(id),
  });

  const deleteTicketMutation = useMutation({
    mutationFn: (ticketTypeId: string) => deleteEventTicketType(id, ticketTypeId),
    onSuccess: () => {
      toast.success("Tipo de ingresso removido.");
      void queryClient.invalidateQueries({ queryKey: ["event-ticket-types", id] });
      void queryClient.invalidateQueries({ queryKey: ["event-report", id] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const duplicateTicketMutation = useMutation({
    mutationFn: (ticketTypeId: string) => duplicateEventTicketType(id, ticketTypeId),
    onSuccess: () => {
      toast.success("Ingresso duplicado.");
      void queryClient.invalidateQueries({ queryKey: ["event-ticket-types", id] });
      void queryClient.invalidateQueries({ queryKey: ["event-report", id] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const event = eventQuery.data;
  const ticketTypes = ticketTypesQuery.data ?? [];
  const registrations = registrationsQuery.data ?? [];
  const report = reportQuery.data;

  function openCreateTicket() {
    setEditingTicket(null);
    setDuplicateTicket(null);
    setTicketDialogOpen(true);
  }

  function openEditTicket(ticket: EventTicketTypeDto) {
    setDuplicateTicket(null);
    setEditingTicket(ticket);
    setTicketDialogOpen(true);
  }

  function invalidateTicketQueries() {
    void queryClient.invalidateQueries({ queryKey: ["event-ticket-types", id] });
    void queryClient.invalidateQueries({ queryKey: ["event-report", id] });
  }

  if (eventQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        A carregar evento…
      </div>
    );
  }

  if (eventQuery.error || !event) {
    return (
      <p className="text-destructive text-sm">
        {eventQuery.error ? getApiErrorMessage(eventQuery.error) : "Evento não encontrado."}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{event.title}</h1>
            <Badge variant={event.published ? "default" : "secondary"}>
              {event.published ? "Publicado" : "Rascunho"}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            {formatEventDate(event.date)}
            {event.timeStart ? ` · ${formatTime(event.timeStart)}` : ""}
            {event.location ? ` · ${event.location}` : ""}
          </p>
        </div>
        <Button asChild variant="outline" className="gap-2 shrink-0">
          <Link to={`/eventos/${id}/editar`}>
            <Pencil className="h-4 w-4" />
            Editar
          </Link>
        </Button>
      </div>

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="ingressos">Tipos de ingresso</TabsTrigger>
          <TabsTrigger value="site">Detalhes do site</TabsTrigger>
          <TabsTrigger value="inscricoes">
            Inscrições ({registrations.length})
          </TabsTrigger>
          <TabsTrigger value="relatorio">Relatório</TabsTrigger>
        </TabsList>

        <TabsContent value="ingressos" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button className="gap-2" onClick={openCreateTicket}>
              <Plus className="h-4 w-4" />
              Novo tipo
            </Button>
          </div>

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Lotes e preços</CardTitle>
              <CardDescription>
                Stock e vendas são geridos pela API — o painel apenas configura e gera links.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {ticketTypesQuery.isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : ticketTypes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum tipo de ingresso configurado.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Preço</TableHead>
                      <TableHead>Vendidos</TableHead>
                      <TableHead>Visibilidade</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="w-[180px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ticketTypes.map((ticket) => (
                      <TableRow key={ticket.id}>
                        <TableCell className="font-medium">{ticket.name}</TableCell>
                        <TableCell>{formatMoneyCents(ticket.priceCents)}</TableCell>
                        <TableCell>
                          {ticket.quantitySold}
                          {ticket.quantityTotal != null ? ` / ${ticket.quantityTotal}` : ""}
                        </TableCell>
                        <TableCell>
                          <Badge variant={ticket.visibility === "PUBLIC" ? "outline" : "secondary"}>
                            {ticket.visibility === "PUBLIC" ? "Público" : "Privado"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={ticket.active ? "outline" : "secondary"}>
                            {ticket.isSoldOut ? "Esgotado" : ticket.active ? "Activo" : "Inactivo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Link de pagamento"
                              onClick={() => setPaymentLinkTicket(ticket)}
                            >
                              <Link2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Duplicar"
                              disabled={duplicateTicketMutation.isPending}
                              onClick={() => duplicateTicketMutation.mutate(ticket.id)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditTicket(ticket)}
                            >
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              disabled={deleteTicketMutation.isPending}
                              onClick={() => {
                                if (window.confirm(`Remover «${ticket.name}»?`)) {
                                  deleteTicketMutation.mutate(ticket.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="site" className="mt-4">
          <EventSiteDetailsTab event={event} />
        </TabsContent>

        <TabsContent value="inscricoes" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Inscrições gratuitas</CardTitle>
              <CardDescription>
                Registos via formulário público — distintos de pedidos pagos com ingresso.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {registrationsQuery.isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : registrations.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma inscrição neste evento.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {registrations.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell>{row.email}</TableCell>
                        <TableCell>{row.phone ?? "—"}</TableCell>
                        <TableCell>{formatDateTime(row.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="relatorio" className="mt-4 space-y-4">
          {reportQuery.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : report ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard
                  title="Receita confirmada"
                  value={formatMoneyCents(report.confirmedRevenueCents)}
                  change={`${report.ticketsSold} ingresso(s) vendidos`}
                  changeType="positive"
                  icon={BarChart3}
                  iconColor="bg-emerald-50 text-emerald-600"
                />
                <StatCard
                  title="Bilhetes emitidos"
                  value={String(report.ticketsIssued)}
                  change="Após pagamento confirmado"
                  changeType="neutral"
                  icon={Ticket}
                  iconColor="bg-primary/10 text-primary"
                />
                <StatCard
                  title="Inscrições gratuitas"
                  value={String(report.registrationCount)}
                  change="Formulário público"
                  changeType="neutral"
                  icon={Users}
                  iconColor="bg-blue-50 text-blue-600"
                />
              </div>

              <EventReportSection report={report} />
            </>
          ) : null}
        </TabsContent>
      </Tabs>

      <TicketTypeWizardDialog
        eventId={id}
        eventDate={event?.date}
        ticketType={editingTicket}
        duplicateFrom={duplicateTicket}
        open={ticketDialogOpen}
        onOpenChange={setTicketDialogOpen}
        onSaved={invalidateTicketQueries}
      />

      <EventPaymentLinkDialog
        eventId={id}
        ticketType={paymentLinkTicket}
        open={Boolean(paymentLinkTicket)}
        onOpenChange={(open) => {
          if (!open) setPaymentLinkTicket(null);
        }}
      />
    </div>
  );
}
