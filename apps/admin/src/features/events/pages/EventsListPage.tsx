import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Loader2, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
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
import { deleteEvent, fetchEvents } from "@/features/events/api/tenant-events-api";
import { formatEventDate } from "@/features/events/lib/format";
import { getApiErrorMessage } from "@/lib/api";

export default function EventsListPage() {
  const queryClient = useQueryClient();
  const eventsQuery = useQuery({
    queryKey: ["events"],
    queryFn: fetchEvents,
  });

  const removeMutation = useMutation({
    mutationFn: deleteEvent,
    onSuccess: () => {
      toast.success("Evento removido.");
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      void queryClient.invalidateQueries({ queryKey: ["events-dashboard"] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const items = eventsQuery.data ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-7 w-7 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">Eventos</h1>
            </div>
            <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
              Crie eventos, configure tipos de ingresso e acompanhe inscrições e vendas.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/eventos/inscricoes">Inscrições</Link>
            </Button>
            <Button asChild className="gap-2">
              <Link to="/eventos/novo">
                <Plus className="h-4 w-4" />
                Novo evento
              </Link>
            </Button>
          </div>
        </div>

        {eventsQuery.error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {getApiErrorMessage(eventsQuery.error)}
          </p>
        )}

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Todos os eventos</CardTitle>
            <CardDescription>
              {items.length === 0 && !eventsQuery.isLoading
                ? "Nenhum evento criado ainda."
                : `${items.length} evento(s) na sua igreja`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {eventsQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                A carregar…
              </div>
            ) : items.length === 0 ? (
              <Button asChild>
                <Link to="/eventos/novo">Criar primeiro evento</Link>
              </Button>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Local</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="w-[120px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="font-medium">
                        <Link
                          to={`/eventos/${event.id}`}
                          className="hover:text-primary hover:underline"
                        >
                          {event.title}
                        </Link>
                      </TableCell>
                      <TableCell>{formatEventDate(event.date)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {event.location ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={event.published ? "default" : "secondary"}>
                          {event.published ? "Publicado" : "Rascunho"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button asChild variant="ghost" size="sm">
                            <Link to={`/eventos/${event.id}`}>Abrir</Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            disabled={removeMutation.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Remover «${event.title}»? Esta acção não pode ser desfeita.`,
                                )
                              ) {
                                removeMutation.mutate(event.id);
                              }
                            }}
                            aria-label="Remover evento"
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
      </div>
    </DashboardLayout>
  );
}
