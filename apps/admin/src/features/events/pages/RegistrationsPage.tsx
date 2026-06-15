import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ClipboardList, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
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
import { fetchAllRegistrations } from "@/features/events/api/tenant-event-registrations-api";
import { formatDateTime, formatEventDate } from "@/features/events/lib/format";
import { getApiErrorMessage } from "@/lib/api";

export default function RegistrationsPage() {
  const registrationsQuery = useQuery({
    queryKey: ["all-registrations"],
    queryFn: fetchAllRegistrations,
  });

  const items = registrationsQuery.data ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 gap-1">
            <Link to="/eventos">
              <ArrowLeft className="h-4 w-4" />
              Eventos
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Inscrições</h1>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Todas as inscrições gratuitas da igreja, com referência ao evento.
          </p>
        </div>

        {registrationsQuery.error && (
          <p className="text-sm text-destructive">{getApiErrorMessage(registrationsQuery.error)}</p>
        )}

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Cadastros</CardTitle>
            <CardDescription>{items.length} inscrição(ões) no total</CardDescription>
          </CardHeader>
          <CardContent>
            {registrationsQuery.isLoading ? (
              <div className="flex items-center gap-2 py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                A carregar…
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma inscrição registada.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Evento</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.event?.title ?? "—"}</div>
                        {row.event?.date && (
                          <div className="text-xs text-muted-foreground">
                            {formatEventDate(row.event.date)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{row.name}</TableCell>
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
      </div>
    </DashboardLayout>
  );
}
