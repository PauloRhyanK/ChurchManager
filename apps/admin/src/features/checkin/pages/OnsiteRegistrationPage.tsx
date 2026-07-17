import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  Loader2,
  Plus,
  Ticket,
  Trash2,
  UserPlus,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api";
import { formatEventDate, formatMoneyCents } from "@/features/events/lib/format";
import {
  createOnsiteRegistration,
  fetchCheckinEvents,
  fetchEventTicketTypes,
  issueFreeTickets,
  type CheckinTicketTypeDto,
} from "@/features/checkin/api/checkin-api";

export default function OnsiteRegistrationPage() {
  const [eventId, setEventId] = useState<string>("");
  const [ticketTypeId, setTicketTypeId] = useState<string>("");
  const [names, setNames] = useState<string[]>([""]);
  const [simple, setSimple] = useState({ name: "", email: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);

  const eventsQuery = useQuery({
    queryKey: ["checkin-events", "all"],
    queryFn: () => fetchCheckinEvents("all"),
  });
  const events = eventsQuery.data ?? [];

  const typesQuery = useQuery({
    queryKey: ["checkin-ticket-types", eventId],
    queryFn: () => fetchEventTicketTypes(eventId),
    enabled: !!eventId,
  });
  const types = typesQuery.data ?? [];
  const hasTicketing = types.length > 0;

  const selectedType = useMemo<CheckinTicketTypeDto | null>(
    () => types.find((t) => t.id === ticketTypeId) ?? null,
    [types, ticketTypeId],
  );

  // Reseta seleção ao trocar de evento.
  useEffect(() => {
    setTicketTypeId("");
    setNames([""]);
    setSimple({ name: "", email: "", phone: "" });
  }, [eventId]);

  function updateName(i: number, value: string) {
    setNames((prev) => prev.map((n, idx) => (idx === i ? value : n)));
  }
  function addName() {
    setNames((prev) => [...prev, ""]);
  }
  function removeName(i: number) {
    setNames((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  async function submitFreeTickets() {
    const clean = names.map((n) => n.trim()).filter((n) => n.length > 0);
    if (!selectedType || clean.length === 0) {
      toast.error("Informe ao menos um nome.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await issueFreeTickets(eventId, selectedType.id, clean);
      toast.success(`${res.tickets.length} ingresso(s) emitido(s).`);
      setNames([""]);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitSimple() {
    if (!simple.name.trim() || !simple.email.trim()) {
      toast.error("Nome e e-mail são obrigatórios.");
      return;
    }
    setSubmitting(true);
    try {
      await createOnsiteRegistration(eventId, {
        name: simple.name,
        email: simple.email,
        phone: simple.phone || null,
      });
      toast.success("Inscrição registada.");
      setSimple({ name: "", email: "", phone: "" });
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Fazer inscrições</h1>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Inscreva participantes no local. O formulário adapta-se ao evento.
          </p>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Evento</CardTitle>
            <CardDescription>Escolha o evento da inscrição.</CardDescription>
          </CardHeader>
          <CardContent>
            {eventsQuery.isLoading ? (
              <div className="flex items-center gap-2 py-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> A carregar…
              </div>
            ) : (
              <Select value={eventId} onValueChange={setEventId}>
                <SelectTrigger className="max-w-md">
                  <SelectValue placeholder="Selecionar evento…" />
                </SelectTrigger>
                <SelectContent>
                  {events.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.title} — {formatEventDate(e.date)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>

        {eventId && (
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Dados da inscrição</CardTitle>
              <CardDescription>
                {typesQuery.isLoading
                  ? "A verificar configuração do evento…"
                  : hasTicketing
                    ? "Este evento usa ingressos."
                    : "Este evento usa inscrição simples."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {typesQuery.isLoading ? (
                <div className="flex items-center gap-2 py-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" /> A carregar…
                </div>
              ) : hasTicketing ? (
                <>
                  <div className="space-y-1.5 max-w-md">
                    <Label>Tipo de ingresso</Label>
                    <Select value={ticketTypeId} onValueChange={setTicketTypeId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar ingresso…" />
                      </SelectTrigger>
                      <SelectContent>
                        {types.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name} —{" "}
                            {t.isFree
                              ? "Gratuito"
                              : formatMoneyCents(t.priceCents + t.feeCents)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedType && !selectedType.isFree && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                      Ingressos pagos não podem ser emitidos aqui. Gere um link de
                      pagamento na área de Eventos.
                    </div>
                  )}

                  {selectedType && selectedType.isFree && (
                    <div className="space-y-3">
                      <Label>Nome de cada participante</Label>
                      {names.map((n, i) => (
                        <div key={i} className="flex items-center gap-2 max-w-md">
                          <Input
                            value={n}
                            placeholder={`Participante ${i + 1}`}
                            onChange={(e) => updateName(i, e.target.value)}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeName(i)}
                            disabled={names.length === 1}
                            aria-label="Remover"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={addName} className="gap-1">
                          <Plus className="h-4 w-4" /> Adicionar pessoa
                        </Button>
                        <Button
                          onClick={submitFreeTickets}
                          disabled={submitting}
                          className="gap-1"
                        >
                          {submitting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Ticket className="h-4 w-4" />
                          )}
                          Emitir ingressos
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-3 max-w-md">
                  <div className="space-y-1.5">
                    <Label>Nome</Label>
                    <Input
                      value={simple.name}
                      onChange={(e) => setSimple({ ...simple, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>E-mail</Label>
                    <Input
                      type="email"
                      value={simple.email}
                      onChange={(e) => setSimple({ ...simple, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Telefone (opcional)</Label>
                    <Input
                      value={simple.phone}
                      onChange={(e) => setSimple({ ...simple, phone: e.target.value })}
                    />
                  </div>
                  <Button onClick={submitSimple} disabled={submitting} className="gap-1">
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserPlus className="h-4 w-4" />
                    )}
                    Inscrever
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
