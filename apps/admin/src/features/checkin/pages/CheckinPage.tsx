import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  ClipboardList,
  Loader2,
  QrCode,
  RotateCcw,
  Search,
  Undo2,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api";
import { formatEventDate, formatDateTime } from "@/features/events/lib/format";
import {
  checkInTicket,
  fetchCheckinEvents,
  fetchEventLotes,
  lookupTicket,
  undoCheckIn,
  type CheckinLookupDto,
  type CheckinTicketDto,
} from "@/features/checkin/api/checkin-api";
import { QrScanner } from "@/features/checkin/components/QrScanner";
import { normalizeScannedCode } from "@/features/checkin/lib/normalize-code";

function TicketStatusBadge({ ticket }: { ticket: CheckinTicketDto }) {
  if (ticket.checkedInAt) {
    return (
      <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
        <CheckCircle2 className="h-3 w-3" /> Entrou
      </Badge>
    );
  }
  if (ticket.status === "VALID") {
    return <Badge variant="secondary">Válido</Badge>;
  }
  return <Badge variant="outline">{ticket.status}</Badge>;
}

export default function CheckinPage() {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<"today" | "all">("today");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [lookup, setLookup] = useState<CheckinLookupDto | null>(null);

  const eventsQuery = useQuery({
    queryKey: ["checkin-events", scope],
    queryFn: () => fetchCheckinEvents(scope),
  });
  const events = eventsQuery.data ?? [];

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const lotesQuery = useQuery({
    queryKey: ["checkin-lotes", selectedEventId, debouncedSearch],
    queryFn: () => fetchEventLotes(selectedEventId!, debouncedSearch || undefined),
    enabled: !!selectedEventId,
  });
  const lotes = lotesQuery.data ?? [];

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["checkin-lotes", selectedEventId] });
    queryClient.invalidateQueries({ queryKey: ["checkin-events"] });
  }

  const checkInMutation = useMutation({
    mutationFn: (ticketId: string) => checkInTicket(ticketId),
    onSuccess: (t) => {
      toast.success(`Entrada registada: ${t.holderName}`);
      invalidate();
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const undoMutation = useMutation({
    mutationFn: (ticketId: string) => undoCheckIn(ticketId),
    onSuccess: (t) => {
      toast.success(`Entrada desfeita: ${t.holderName}`);
      invalidate();
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  async function handleScan(raw: string) {
    if (lookup) return; // já há um diálogo aberto
    const code = normalizeScannedCode(raw);
    try {
      const result = await lookupTicket(code);
      setLookup(result);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  }

  async function confirmCheckInFromDialog(ticketId: string) {
    try {
      const t = await checkInTicket(ticketId);
      toast.success(`Entrada registada: ${t.holderName}`);
      invalidate();
      // Atualiza o diálogo para refletir a entrada.
      setLookup((prev) =>
        prev
          ? {
              ...prev,
              ticket:
                prev.ticket.id === t.id ? t : prev.ticket,
              lote: {
                ...prev.lote,
                tickets: prev.lote.tickets.map((x) => (x.id === t.id ? t : x)),
              },
            }
          : prev,
      );
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <QrCode className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Check-in</h1>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Dê entrada nos participantes por busca na lista ou leitura do QR code.
          </p>
        </div>

        {/* Seleção de evento */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Eventos</CardTitle>
              <CardDescription>
                {scope === "today" ? "Eventos de hoje" : "Todos os eventos"}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setScope((s) => (s === "today" ? "all" : "today"))}
            >
              {scope === "today" ? "Ver todos" : "Ver só hoje"}
            </Button>
          </CardHeader>
          <CardContent>
            {eventsQuery.isLoading ? (
              <div className="flex items-center gap-2 py-6 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> A carregar…
              </div>
            ) : events.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum evento {scope === "today" ? "hoje" : "encontrado"}.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {events.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setSelectedEventId(e.id)}
                    className={`rounded-lg border p-3 text-left transition-colors hover:bg-accent ${
                      selectedEventId === e.id
                        ? "border-primary bg-accent"
                        : "border-border"
                    }`}
                  >
                    <div className="font-medium">{e.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatEventDate(e.date)}
                    </div>
                    <div className="mt-2 text-xs">
                      <span className="font-semibold text-emerald-600">
                        {e.checkedIn}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        / {e.ticketsIssued} com entrada
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {selectedEvent && (
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">{selectedEvent.title}</CardTitle>
              <CardDescription>
                {selectedEvent.checkedIn} de {selectedEvent.ticketsIssued}{" "}
                ingresso(s) com entrada
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="search">
                <TabsList>
                  <TabsTrigger value="search" className="gap-1">
                    <Search className="h-4 w-4" /> Buscar
                  </TabsTrigger>
                  <TabsTrigger value="qr" className="gap-1">
                    <QrCode className="h-4 w-4" /> Ler QR
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="search" className="mt-4 space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nome ou código…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  {lotesQuery.isLoading ? (
                    <div className="flex items-center gap-2 py-6 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" /> A carregar…
                    </div>
                  ) : lotes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhum ingresso encontrado.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {lotes.map((lote) => (
                        <div key={lote.orderId} className="rounded-lg border">
                          {lote.tickets.length > 1 && (
                            <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                              <ClipboardList className="h-3.5 w-3.5" />
                              Lote de {lote.tickets.length} ingressos
                              {lote.buyerName ? ` — ${lote.buyerName}` : ""}
                            </div>
                          )}
                          <div className="divide-y">
                            {lote.tickets.map((t) => (
                              <div
                                key={t.id}
                                className="flex items-center justify-between gap-3 px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <div className="truncate font-medium">
                                    {t.holderName}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {t.ticketTypeName} ·{" "}
                                    <span className="font-mono">{t.publicCode}</span>
                                    {t.checkedInAt && (
                                      <> · {formatDateTime(t.checkedInAt)}</>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <TicketStatusBadge ticket={t} />
                                  {t.checkedInAt ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="gap-1"
                                      onClick={() => undoMutation.mutate(t.id)}
                                      disabled={undoMutation.isPending}
                                    >
                                      <Undo2 className="h-4 w-4" /> Desfazer
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      className="gap-1"
                                      onClick={() => checkInMutation.mutate(t.id)}
                                      disabled={
                                        checkInMutation.isPending ||
                                        t.status !== "VALID"
                                      }
                                    >
                                      <CheckCircle2 className="h-4 w-4" /> Dar
                                      entrada
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="qr" className="mt-4">
                  <QrScanner onScan={handleScan} paused={!!lookup} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Diálogo de confirmação após leitura de QR */}
      <Dialog open={!!lookup} onOpenChange={(open) => !open && setLookup(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ingresso lido</DialogTitle>
            <DialogDescription>
              {lookup?.event.title} — {lookup && formatEventDate(lookup.event.date)}
            </DialogDescription>
          </DialogHeader>

          {lookup && (
            <div className="space-y-3">
              {lookup.lote.tickets.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  Lote de {lookup.lote.tickets.length} ingressos
                  {lookup.lote.buyerName ? ` — ${lookup.lote.buyerName}` : ""}. Dê
                  entrada em quem estiver presente.
                </p>
              )}
              <div className="divide-y rounded-lg border">
                {lookup.lote.tickets.map((t) => (
                  <div
                    key={t.id}
                    className={`flex items-center justify-between gap-3 px-3 py-2 ${
                      t.id === lookup.ticket.id ? "bg-accent/50" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{t.holderName}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.ticketTypeName} ·{" "}
                        <span className="font-mono">{t.publicCode}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <TicketStatusBadge ticket={t} />
                      {!t.checkedInAt && t.status === "VALID" && (
                        <Button
                          size="sm"
                          className="gap-1"
                          onClick={() => confirmCheckInFromDialog(t.id)}
                        >
                          <CheckCircle2 className="h-4 w-4" /> Entrada
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setLookup(null)} className="gap-1">
              <RotateCcw className="h-4 w-4" /> Ler outro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
