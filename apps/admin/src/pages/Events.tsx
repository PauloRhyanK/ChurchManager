import { Plus, CalendarDays, Clock, MapPin, Users } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const events = [
  { title: "Culto Dominical", date: "Dom, 20 Abr 2026", time: "09:00 - 11:30", location: "Templo Principal", type: "Culto", attendees: 280 },
  { title: "Culto de Oração", date: "Qua, 23 Abr 2026", time: "19:00 - 20:30", location: "Templo Principal", type: "Culto", attendees: 120 },
  { title: "Reunião de Líderes", date: "Ter, 22 Abr 2026", time: "19:30 - 21:00", location: "Sala 3", type: "Reunião", attendees: 25 },
  { title: "Retiro de Jovens", date: "Sáb, 26 Abr 2026", time: "08:00 - 18:00", location: "Sítio Esperança", type: "Retiro", attendees: 65 },
  { title: "Ensaio do Coral", date: "Sex, 25 Abr 2026", time: "19:00 - 21:00", location: "Sala de Ensaio", type: "Ensaio", attendees: 30 },
  { title: "Conferência de Mulheres", date: "Sáb, 03 Mai 2026", time: "09:00 - 17:00", location: "Templo Principal", type: "Conferência", attendees: 200 },
];

const typeColors: Record<string, string> = {
  Culto: "bg-violet-100 text-violet-700",
  Reunião: "bg-blue-100 text-blue-700",
  Retiro: "bg-emerald-100 text-emerald-700",
  Ensaio: "bg-amber-100 text-amber-700",
  Conferência: "bg-rose-100 text-rose-700",
};

const Events = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Eventos</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Gerencie cultos, retiros e encontros da igreja.
            </p>
          </div>
          <Button className="gap-2">
            <Plus className="h-4 w-4" /> Criar Evento
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e, i) => (
            <Card key={i} className="border-0 shadow-sm hover:shadow-md transition-shadow group cursor-pointer">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <Badge variant="secondary" className={`text-xs font-normal ${typeColors[e.type] || ""}`}>
                    {e.type}
                  </Badge>
                </div>
                <h3 className="font-semibold text-base group-hover:text-primary transition-colors">
                  {e.title}
                </h3>
                <div className="space-y-1.5 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-3.5 w-3.5" /> {e.date}
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5" /> {e.time}
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5" /> {e.location}
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" /> {e.attendees} participantes
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Events;
